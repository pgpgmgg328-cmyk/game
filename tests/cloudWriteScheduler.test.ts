import { describe, expect, it } from 'vitest';
import {
  CloudWriteScheduler,
  DEFAULT_CLOUD_WRITE_OPTIONS,
} from '../src/core/save/CloudWriteScheduler';
import { FakeClock, flushPromises } from './fakeClock';

/** Запись в облако, которую тест завершает вручную. */
function controlledWrites() {
  const writes: { at: number; resolve: () => void; reject: () => void }[] = [];
  let clock: FakeClock | null = null;
  return {
    writes,
    bind(c: FakeClock) {
      clock = c;
    },
    write: () =>
      new Promise<void>((resolve, reject) => {
        writes.push({ at: clock?.now() ?? 0, resolve, reject: () => reject(new Error('сеть')) });
      }),
  };
}

function setup() {
  const clock = new FakeClock();
  const cloud = controlledWrites();
  cloud.bind(clock);
  const scheduler = new CloudWriteScheduler(cloud.write, clock);
  return { clock, cloud, scheduler };
}

describe('CloudWriteScheduler', () => {
  it('склеивает частые изменения в одну запись не позже чем через 1 с после первого', () => {
    const { clock, cloud, scheduler } = setup();
    scheduler.request();
    clock.advance(400);
    scheduler.request();
    clock.advance(500);
    scheduler.request();
    expect(cloud.writes).toHaveLength(0);
    clock.advance(100);
    expect(cloud.writes).toHaveLength(1);
    expect(cloud.writes[0]?.at).toBe(1000);
  });

  it('срочную запись отправляет сразу, синхронно', () => {
    const { cloud, scheduler } = setup();
    scheduler.request(true);
    expect(cloud.writes).toHaveLength(1);
    expect(cloud.writes[0]?.at).toBe(0);
  });

  it('flush отправляет накопленные изменения сразу, а без изменений ничего не делает', () => {
    const { cloud, scheduler } = setup();
    scheduler.flush();
    expect(cloud.writes).toHaveLength(0);
    scheduler.request();
    scheduler.flush();
    expect(cloud.writes).toHaveLength(1);
    expect(cloud.writes[0]?.at).toBe(0);
    scheduler.flush();
    expect(cloud.writes).toHaveLength(1);
  });

  it('без изменений ничего не пишет', () => {
    const { clock, cloud } = setup();
    clock.advance(60_000);
    expect(cloud.writes).toHaveLength(0);
  });

  it('если данные поменялись во время записи, отправляет их следующей записью', async () => {
    const { clock, cloud, scheduler } = setup();
    scheduler.request(true);
    scheduler.request();
    clock.advance(5000);
    expect(cloud.writes).toHaveLength(1);
    cloud.writes[0]?.resolve();
    await flushPromises();
    expect(scheduler.pending).toBe(true);
    clock.advance(1000);
    expect(cloud.writes).toHaveLength(2);
  });

  it('срочный запрос во время записи уходит сразу после неё', async () => {
    const { cloud, scheduler } = setup();
    scheduler.request(true);
    scheduler.request(true);
    expect(cloud.writes).toHaveLength(1);
    cloud.writes[0]?.resolve();
    await flushPromises();
    expect(cloud.writes).toHaveLength(2);
  });

  it('после ошибки повторяет запись с паузой и не теряет данные', async () => {
    const { clock, cloud, scheduler } = setup();
    scheduler.request(true);
    cloud.writes[0]?.reject();
    await flushPromises();
    expect(scheduler.pending).toBe(true);
    clock.advance(1999);
    expect(cloud.writes).toHaveLength(1);
    clock.advance(1);
    expect(cloud.writes).toHaveLength(2);
    cloud.writes[1]?.reject();
    await flushPromises();
    clock.advance(4999);
    expect(cloud.writes).toHaveLength(2);
    clock.advance(1);
    expect(cloud.writes).toHaveLength(3);
    cloud.writes[2]?.resolve();
    await flushPromises();
    expect(scheduler.pending).toBe(false);
  });

  it('не бросает исключение, если запись упала синхронно', async () => {
    const clock = new FakeClock();
    let calls = 0;
    const scheduler = new CloudWriteScheduler(() => {
      calls += 1;
      throw new Error('SDK недоступен');
    }, clock);
    expect(() => scheduler.request(true)).not.toThrow();
    await flushPromises();
    clock.advance(2000);
    expect(calls).toBe(2);
  });

  it('при непрерывных изменениях держится в лимите запросов и в итоге сохраняет последнее', async () => {
    const clock = new FakeClock();
    const times: number[] = [];
    const scheduler = new CloudWriteScheduler(async () => {
      times.push(clock.now());
    }, clock);

    // 10 минут изменений каждые 100 мс, иногда — срочные.
    for (let step = 0; step < 6000; step += 1) {
      scheduler.request(step % 50 === 0);
      clock.advance(100);
      await flushPromises();
    }
    // Изменения прекратились: через время всё должно уйти в облако.
    clock.advance(DEFAULT_CLOUD_WRITE_OPTIONS.windowMs);
    await flushPromises();
    clock.advance(DEFAULT_CLOUD_WRITE_OPTIONS.debounceMs);
    await flushPromises();
    expect(scheduler.pending).toBe(false);

    const { windowMs, maxWritesPerWindow } = DEFAULT_CLOUD_WRITE_OPTIONS;
    for (const start of times) {
      const inWindow = times.filter((t) => t >= start && t < start + windowMs).length;
      expect(inWindow).toBeLessThanOrEqual(maxWritesPerWindow);
    }
    expect(times.length).toBeGreaterThan(maxWritesPerWindow);
  });

  it('whenSynced отправляет изменения сразу и ждёт, пока запись дойдёт до облака', async () => {
    const { cloud, scheduler } = setup();
    await expect(scheduler.whenSynced(5000)).resolves.toBe(true);
    scheduler.request();
    let synced: boolean | null = null;
    void scheduler.whenSynced(5000).then((value) => {
      synced = value;
    });
    expect(cloud.writes).toHaveLength(1);
    await flushPromises();
    expect(synced).toBeNull();
    cloud.writes[0]?.resolve();
    await flushPromises();
    expect(synced).toBe(true);
  });

  it('whenSynced ждёт и повторную запись после ошибки, а не дождавшись — даёт false', async () => {
    const { clock, cloud, scheduler } = setup();
    scheduler.request();
    const first = scheduler.whenSynced(10_000);
    cloud.writes[0]?.reject();
    await flushPromises();
    clock.advance(2000);
    cloud.writes[1]?.resolve();
    await expect(first).resolves.toBe(true);

    scheduler.request();
    const second = scheduler.whenSynced(3000);
    cloud.writes[2]?.reject();
    await flushPromises();
    clock.advance(3000);
    await expect(second).resolves.toBe(false);
  });

  it('suspend копит изменения, resume отправляет их', async () => {
    const { clock, cloud, scheduler } = setup();
    scheduler.suspend();
    scheduler.request(true);
    clock.advance(5000);
    expect(cloud.writes).toHaveLength(0);
    expect(scheduler.pending).toBe(true);
    scheduler.resume();
    expect(cloud.writes).toHaveLength(1);
  });

  it('reset забывает изменения, будит ожидающих и не путается с ответом старой записи', async () => {
    const { clock, cloud, scheduler } = setup();
    scheduler.request(true);
    scheduler.request();
    const waiting = scheduler.whenSynced(10_000);
    scheduler.reset();
    await expect(waiting).resolves.toBe(false);
    expect(scheduler.pending).toBe(false);
    // Старая запись завершилась ошибкой уже после сброса: повтора быть не должно.
    cloud.writes[0]?.reject();
    await flushPromises();
    clock.advance(60_000);
    expect(cloud.writes).toHaveLength(1);
    // Новые изменения пишутся как обычно.
    scheduler.request(true);
    expect(cloud.writes).toHaveLength(2);
  });

  it('при исчерпанном лимите откладывает даже срочную запись до освобождения окна', async () => {
    const clock = new FakeClock();
    const times: number[] = [];
    const options = { ...DEFAULT_CLOUD_WRITE_OPTIONS, maxWritesPerWindow: 2, windowMs: 10_000 };
    const scheduler = new CloudWriteScheduler(
      async () => {
        times.push(clock.now());
      },
      clock,
      options,
    );
    scheduler.request(true);
    await flushPromises();
    clock.advance(100);
    scheduler.request(true);
    await flushPromises();
    clock.advance(100);
    scheduler.request(true);
    await flushPromises();
    expect(times).toEqual([0, 100]);
    clock.advance(9799);
    await flushPromises();
    expect(times).toEqual([0, 100]);
    clock.advance(1);
    await flushPromises();
    expect(times).toEqual([0, 100, 10_000]);
  });
});

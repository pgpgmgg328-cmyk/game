import { describe, expect, it, vi } from 'vitest';
import { readSave, type Migration } from '../src/core/save/migrate';
import { restoreAfterSignIn, restoreSave } from '../src/core/save/restore';
import { SaveManager, type SaveUrgency } from '../src/core/save/SaveManager';
import { createDefaultSave, sanitizeSave, type Save } from '../src/core/save/schema';

describe('readSave', () => {
  it('считает отсутствие данных пустым сохранением', () => {
    expect(readSave(null)).toEqual({ kind: 'empty' });
    expect(readSave(undefined)).toEqual({ kind: 'empty' });
  });

  it('читает корректное сохранение текущей версии', () => {
    const save: Save = {
      v: 5,
      rev: 7,
      settings: { sound: false, music: true },
      stats: { bestScore: 1234, runs: 5, merges: 300, goldenMerges: 4, megas: 1 },
      coins: 950,
      upgrades: { shake: 1, remove: 0, preview: 1, squish: 2, golden: 5, jar: 3 },
      album: { classic: { forms: [1, 2, 3, 7], golden: [2] } },
      achievements: ['first_clack', 'caps'],
      tutorial: { done: true, squish: false, caramel: true, meteor: false },
      purchases: { noAds: true, skinsPack: false, granted: ['t-1'] },
      prompts: { review: true, shortcut: false },
      worlds: { selected: 'candy', bought: ['candy'] },
      daily: {
        day: 20_000,
        task: { world: 'classic', tier: 6 },
        taskDone: true,
        gift: true,
        adGift: false,
        streak: 3,
        lastDone: 20_000,
        bestStreak: 5,
      },
      decor: { jar: 'rainbow', background: 'clouds' },
    };
    expect(readSave(save)).toEqual({ kind: 'ok', save });
  });

  it.each([
    ['строка вместо объекта', 'не json'],
    ['число', 42],
    ['массив', [1, 2, 3]],
    ['нет версии', { rev: 1, settings: {} }],
    ['версия строкой', { v: '1' }],
    ['дробная версия', { v: 1.5 }],
    ['отрицательная версия', { v: -1 }],
  ])('битые данные (%s) не читаются', (_name, raw) => {
    expect(readSave(raw)).toEqual({ kind: 'invalid' });
  });

  it('заменяет битые поля значениями по умолчанию и сохраняет остальные', () => {
    const result = readSave({
      v: 5,
      rev: -5,
      settings: { sound: 'нет', music: false },
      stats: { bestScore: 1.5, runs: 3, merges: -1 },
      coins: 'много',
      upgrades: { shake: 99, remove: 2, jar: 'x' },
      album: {
        classic: { forms: [3, 1, 3, 0, 31, 2.5, 'a', 2], golden: 'нет' },
        'Не латиница': { forms: [1] },
        space: 'мусор',
      },
      achievements: ['caps', 'caps', 42, 'Плохой id'],
      tutorial: { done: 'да', squish: true },
      purchases: { noAds: 1, skinsPack: true, granted: ['a', 'a', '', 'с пробелом', 5, 'b'] },
      prompts: 'нет',
      worlds: { selected: 'Не мир', bought: ['candy', 'candy', 7] },
      daily: { day: 1.5, task: { world: 'space', tier: 40 }, streak: 4, lastDone: -1, gift: 'да' },
      decor: { jar: 5, background: 'clouds' },
      junk: 1,
    });
    expect(result).toEqual({
      kind: 'ok',
      save: {
        v: 5,
        rev: 0,
        settings: { sound: true, music: false },
        stats: { bestScore: 0, runs: 3, merges: 0, goldenMerges: 0, megas: 0 },
        coins: 0,
        // Уровень выше максимума обрезается до максимума.
        upgrades: { shake: 3, remove: 2, preview: 0, squish: 0, golden: 0, jar: 0 },
        album: { classic: { forms: [1, 2, 3], golden: [] } },
        achievements: ['caps'],
        tutorial: { done: false, squish: true, caramel: false, meteor: false },
        purchases: { noAds: false, skinsPack: true, granted: ['a', 'b'] },
        prompts: { review: false, shortcut: false },
        worlds: { selected: '', bought: ['candy'] },
        // Серия без дня последнего задания не считается.
        daily: { ...createDefaultSave().daily },
        decor: { jar: 'glass', background: 'clouds' },
      },
    });
  });

  it('хранит не больше 20 последних невыданных токенов покупок', () => {
    const granted = Array.from({ length: 25 }, (_, index) => `t${index}`);
    const result = readSave({ v: 5, rev: 1, purchases: { granted } });
    expect(result.kind === 'ok' && result.save.purchases.granted).toEqual(granted.slice(5));
  });

  it('версия 3 → 4: прогресс на месте, покупок и просьб ещё не было', () => {
    const result = readSave({
      v: 3,
      rev: 12,
      coins: 400,
      stats: { bestScore: 900, runs: 4, merges: 10, goldenMerges: 1, megas: 0 },
      upgrades: { shake: 2 },
      album: { classic: { forms: [1, 2], golden: [] } },
      achievements: ['first_clack'],
      tutorial: { done: true, squish: true },
    });
    expect(result).toEqual({
      kind: 'ok',
      save: {
        ...createDefaultSave(),
        rev: 12,
        coins: 400,
        stats: { bestScore: 900, runs: 4, merges: 10, goldenMerges: 1, megas: 0 },
        upgrades: { shake: 2, remove: 0, preview: 0, squish: 0, golden: 0, jar: 0 },
        album: { classic: { forms: [1, 2], golden: [] } },
        achievements: ['first_clack'],
        tutorial: { done: true, squish: true, caramel: false, meteor: false },
      },
    });
  });

  it('версия 4 → 5: прогресс и покупки на месте, миры, ежедневное и украшения — по умолчанию', () => {
    const result = readSave({
      v: 4,
      rev: 30,
      coins: 5000,
      album: { classic: { forms: [1, 2, 11], golden: [] } },
      purchases: { noAds: true, skinsPack: true, granted: [] },
      prompts: { review: true, shortcut: false },
    });
    expect(result).toEqual({
      kind: 'ok',
      save: {
        ...createDefaultSave(),
        rev: 30,
        coins: 5000,
        album: { classic: { forms: [1, 2, 11], golden: [] } },
        purchases: { noAds: true, skinsPack: true, granted: [] },
        prompts: { review: true, shortcut: false },
      },
    });
  });

  it('серия не короче лучшей серии не бывает: лучшая не меньше текущей', () => {
    const result = readSave({ v: 5, rev: 1, daily: { streak: 6, lastDone: 100, bestStreak: 2 } });
    expect(result.kind === 'ok' && result.save.daily).toMatchObject({ streak: 6, bestStreak: 6 });
  });

  it('не падает, если settings и stats — не объекты', () => {
    expect(readSave({ v: 5, rev: 3, settings: null, stats: 'много' })).toEqual({
      kind: 'ok',
      save: { ...createDefaultSave(), rev: 3 },
    });
  });

  it('сохранение версии 1 переводится в текущую версию с сохранением настроек', () => {
    expect(readSave({ v: 1, rev: 9, settings: { sound: false, music: true } })).toEqual({
      kind: 'ok',
      save: { ...createDefaultSave(), rev: 9, settings: { sound: false, music: true } },
    });
  });

  it('версия 2 → 3: рекорд сохраняется, кто уже играл — без обучения', () => {
    const played = readSave({
      v: 2,
      rev: 4,
      settings: { sound: true, music: false },
      stats: { bestScore: 700, runs: 3 },
    });
    expect(played).toEqual({
      kind: 'ok',
      save: {
        ...createDefaultSave(),
        rev: 4,
        settings: { sound: true, music: false },
        stats: { bestScore: 700, runs: 3, merges: 0, goldenMerges: 0, megas: 0 },
        tutorial: { done: true, squish: true, caramel: false, meteor: false },
      },
    });
    const fresh = readSave({ v: 2, rev: 1, stats: { bestScore: 0, runs: 0 } });
    expect(fresh.kind === 'ok' && fresh.save.tutorial).toEqual({
      done: false,
      squish: false,
      caramel: false,
      meteor: false,
    });
  });

  it('распознаёт сохранение из более новой версии игры', () => {
    expect(readSave({ v: 99, rev: 1 })).toEqual({ kind: 'future', version: 99 });
  });

  it('применяет миграции по порядку до текущей версии', () => {
    const calls: number[] = [];
    const migrations: Record<number, Migration> = {
      1: (data) => (calls.push(1), { ...data, v: 2, a: 'добавлено в v2' }),
      2: (data) => (calls.push(2), { ...data, v: 3, b: String(data.a) + ' и v3' }),
    };
    const result = readSave(
      { v: 1, rev: 4 },
      { migrations, version: 3, sanitize: (data) => data as unknown as Save },
    );
    expect(calls).toEqual([1, 2]);
    expect(result).toEqual({
      kind: 'ok',
      save: { v: 3, rev: 4, a: 'добавлено в v2', b: 'добавлено в v2 и v3' },
    });
  });

  it('переводит старое сохранение в текущую схему и чистит его', () => {
    const migrations: Record<number, Migration> = {
      0: (data) => ({ v: 1, rev: data.rev, settings: { sound: data.mute !== true } }),
    };
    const result = readSave(
      { v: 0, rev: 2, mute: true },
      { migrations, version: 1, sanitize: sanitizeSave },
    );
    expect(result).toEqual({
      kind: 'ok',
      save: { ...createDefaultSave(), rev: 2, settings: { sound: false, music: true } },
    });
  });

  it('считает данные битыми, если миграции не хватает, она падает или не ставит версию', () => {
    const options = (migrations: Record<number, Migration>) => ({
      migrations,
      version: 2,
      sanitize: (data: Record<string, unknown>) => data as unknown as Save,
    });
    expect(readSave({ v: 1 }, options({}))).toEqual({ kind: 'invalid' });
    expect(
      readSave(
        { v: 1 },
        options({
          1: () => {
            throw new Error('сломано');
          },
        }),
      ),
    ).toEqual({ kind: 'invalid' });
    expect(readSave({ v: 1 }, options({ 1: (data) => ({ ...data }) }))).toEqual({
      kind: 'invalid',
    });
  });
});

describe('restoreSave', () => {
  const save = (rev: number, sound = true): Save => ({
    ...createDefaultSave(),
    rev,
    settings: { sound, music: true },
    stats: { bestScore: rev * 10, runs: rev, merges: rev, goldenMerges: 0, megas: 0 },
  });

  it('без данных начинает с сохранения по умолчанию', () => {
    expect(restoreSave({ cloud: null, local: null })).toEqual({
      save: createDefaultSave(),
      writable: true,
      source: 'default',
    });
  });

  it('берёт более свежее сохранение по rev', () => {
    expect(restoreSave({ cloud: save(3), local: save(5, false) })).toEqual({
      save: save(5, false),
      writable: true,
      source: 'local',
    });
    expect(restoreSave({ cloud: save(8, false), local: save(5) })).toEqual({
      save: save(8, false),
      writable: true,
      source: 'cloud',
    });
  });

  it('при равном rev верит облаку', () => {
    expect(restoreSave({ cloud: save(4, false), local: save(4) }).source).toBe('cloud');
  });

  it('обходит битый источник', () => {
    expect(restoreSave({ cloud: 'мусор', local: save(2) })).toMatchObject({
      save: save(2),
      source: 'local',
      writable: true,
    });
  });

  it('не разрешает запись, если где-то лежит сохранение новее версии игры', () => {
    expect(restoreSave({ cloud: { v: 6, rev: 10 }, local: save(1) })).toEqual({
      save: save(1),
      writable: false,
      source: 'local',
    });
    expect(restoreSave({ cloud: null, local: { v: 7 } })).toEqual({
      save: createDefaultSave(),
      writable: false,
      source: 'default',
    });
  });
});

describe('restoreAfterSignIn', () => {
  const save = (rev: number, coins = 0): Save => ({ ...createDefaultSave(), rev, coins });

  it('облако аккаунта важнее кэша гостя, даже если у гостя rev больше', () => {
    expect(restoreAfterSignIn(save(3, 900), save(40, 10))).toEqual({
      save: save(3, 900),
      writable: true,
      source: 'cloud',
    });
  });

  it('пустое или битое облако — остаётся текущий прогресс', () => {
    for (const cloud of [null, {}, 'мусор']) {
      expect(restoreAfterSignIn(cloud, save(7, 50))).toEqual({
        save: save(7, 50),
        writable: true,
        source: 'local',
      });
    }
  });

  it('облако от более новой версии игры не затирается', () => {
    expect(restoreAfterSignIn({ v: 99 }, save(7))).toEqual({
      save: save(7),
      writable: false,
      source: 'local',
    });
  });
});

describe('SaveManager', () => {
  function backend() {
    return {
      persist: vi.fn<(save: Save, urgency: SaveUrgency) => void>(),
      flush: vi.fn<() => void>(),
    };
  }

  it('меняет данные, увеличивает rev и сразу сохраняет', () => {
    const store = backend();
    const manager = new SaveManager(
      { save: createDefaultSave(), writable: true, source: 'default' },
      store,
    );
    manager.update((draft) => {
      draft.settings.sound = false;
    });
    expect(manager.data.settings.sound).toBe(false);
    expect(manager.data.rev).toBe(1);
    expect(store.persist).toHaveBeenCalledWith(
      { ...createDefaultSave(), rev: 1, settings: { sound: false, music: true } },
      'normal',
    );
    manager.update((draft) => {
      draft.settings.music = false;
    }, 'urgent');
    expect(manager.data.rev).toBe(2);
    expect(store.persist).toHaveBeenLastCalledWith(
      { ...createDefaultSave(), rev: 2, settings: { sound: false, music: false } },
      'urgent',
    );
  });

  it('не отдаёт наружу объект, который потом изменится', () => {
    const store = backend();
    const manager = new SaveManager(
      { save: createDefaultSave(), writable: true, source: 'default' },
      store,
    );
    const before = manager.data;
    manager.update((draft) => {
      draft.settings.sound = false;
    });
    expect(before.settings.sound).toBe(true);
  });

  it('в режиме только для чтения меняет данные в памяти, но ничего не пишет', () => {
    const store = backend();
    const manager = new SaveManager(
      { save: createDefaultSave(), writable: false, source: 'default' },
      store,
    );
    manager.update((draft) => {
      draft.settings.sound = false;
    });
    manager.flush();
    expect(manager.data.settings.sound).toBe(false);
    expect(store.persist).not.toHaveBeenCalled();
    expect(store.flush).not.toHaveBeenCalled();
  });

  it('передаёт flush платформе', () => {
    const store = backend();
    const manager = new SaveManager(
      { save: createDefaultSave(), writable: true, source: 'default' },
      store,
    );
    manager.flush();
    expect(store.flush).toHaveBeenCalledTimes(1);
  });
});

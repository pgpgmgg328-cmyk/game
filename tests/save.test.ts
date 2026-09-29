import { describe, expect, it, vi } from 'vitest';
import { readSave, type Migration } from '../src/core/save/migrate';
import { restoreSave } from '../src/core/save/restore';
import { SaveManager, type SaveUrgency } from '../src/core/save/SaveManager';
import { createDefaultSave, sanitizeSave, type Save } from '../src/core/save/schema';

describe('readSave', () => {
  it('считает отсутствие данных пустым сохранением', () => {
    expect(readSave(null)).toEqual({ kind: 'empty' });
    expect(readSave(undefined)).toEqual({ kind: 'empty' });
  });

  it('читает корректное сохранение текущей версии', () => {
    const save: Save = {
      v: 3,
      rev: 7,
      settings: { sound: false, music: true },
      stats: { bestScore: 1234, runs: 5, merges: 300, goldenMerges: 4, megas: 1 },
      coins: 950,
      upgrades: { shake: 1, remove: 0, preview: 1, squish: 2, golden: 5, jar: 3 },
      album: { classic: { forms: [1, 2, 3, 7], golden: [2] } },
      achievements: ['first_clack', 'caps'],
      tutorial: { done: true, squish: false },
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
      v: 3,
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
      junk: 1,
    });
    expect(result).toEqual({
      kind: 'ok',
      save: {
        v: 3,
        rev: 0,
        settings: { sound: true, music: false },
        stats: { bestScore: 0, runs: 3, merges: 0, goldenMerges: 0, megas: 0 },
        coins: 0,
        // Уровень выше максимума обрезается до максимума.
        upgrades: { shake: 3, remove: 2, preview: 0, squish: 0, golden: 0, jar: 0 },
        album: { classic: { forms: [1, 2, 3], golden: [] } },
        achievements: ['caps'],
        tutorial: { done: false, squish: true },
      },
    });
  });

  it('не падает, если settings и stats — не объекты', () => {
    expect(readSave({ v: 3, rev: 3, settings: null, stats: 'много' })).toEqual({
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
        tutorial: { done: true, squish: true },
      },
    });
    const fresh = readSave({ v: 2, rev: 1, stats: { bestScore: 0, runs: 0 } });
    expect(fresh.kind === 'ok' && fresh.save.tutorial).toEqual({ done: false, squish: false });
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
    expect(restoreSave({ cloud: { v: 4, rev: 10 }, local: save(1) })).toEqual({
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

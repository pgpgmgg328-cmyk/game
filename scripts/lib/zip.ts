import { crc32, deflateRawSync } from 'node:zlib';

export interface ZipEntry {
  /** Путь внутри архива через «/». */
  path: string;
  data: Uint8Array;
}

// Дата у всех файлов одна — 1 января 1980 года (минимальная в формате ZIP): архив не зависит от времени сборки.
const DOS_DATE = (0 << 9) | (1 << 5) | 1;
const DOS_TIME = 0;
const METHOD_STORE = 0;
const METHOD_DEFLATE = 8;
const MAX_UINT16 = 0xffff;
const MAX_UINT32 = 0xffffffff;

/** Латиница, цифры и знаки без пробелов; путь не начинается со «/» (п. 1.22 требований). */
const SAFE_PATH = /^[\x21-\x7e]+$/;

function assertSafePath(path: string): void {
  if (!SAFE_PATH.test(path) || path.startsWith('/') || path.includes('\\') || path.includes('..')) {
    throw new Error(`Недопустимое имя файла для архива: «${path}»`);
  }
}

/**
 * Собирает ZIP-архив (сжатие deflate, без ZIP64). Файлы идут по алфавиту, даты фиксированы:
 * одна и та же сборка всегда даёт байт-в-байт одинаковый архив.
 */
export function createZip(entries: readonly ZipEntry[]): Buffer {
  if (entries.length > MAX_UINT16) throw new Error('Слишком много файлов для архива');
  const sorted = [...entries].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of sorted) {
    assertSafePath(entry.path);
    const name = Buffer.from(entry.path, 'utf8');
    const data = Buffer.from(entry.data.buffer, entry.data.byteOffset, entry.data.byteLength);
    const deflated = deflateRawSync(data, { level: 9 });
    const compress = deflated.length < data.length;
    const body = compress ? deflated : data;
    const method = compress ? METHOD_DEFLATE : METHOD_STORE;
    const checksum = crc32(data) >>> 0;
    if (data.length > MAX_UINT32 || offset > MAX_UINT32) throw new Error('Архив больше 4 ГБ');

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // версия формата, нужная для распаковки
    local.writeUInt16LE(0, 6); // флаги
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28); // дополнительные поля
    localParts.push(local, name, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // версия, которой создан архив
    central.writeUInt16LE(20, 6); // версия, нужная для распаковки
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);

    offset += local.length + name.length + body.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(sorted.length, 8);
  end.writeUInt16LE(sorted.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, ...centralParts, end]);
}

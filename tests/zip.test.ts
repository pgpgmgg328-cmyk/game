import { randomBytes } from 'node:crypto';
import { crc32, inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { createZip } from '../scripts/lib/zip.ts';

interface Unpacked {
  path: string;
  method: number;
  data: Buffer;
}

/** Минимальный распаковщик: читает центральный каталог и данные каждого файла. */
function unzip(archive: Buffer): Unpacked[] {
  const end = archive.length - 22;
  expect(archive.readUInt32LE(end)).toBe(0x06054b50);
  const count = archive.readUInt16LE(end + 10);
  let position = archive.readUInt32LE(end + 16);
  const result: Unpacked[] = [];
  for (let i = 0; i < count; i += 1) {
    expect(archive.readUInt32LE(position)).toBe(0x02014b50);
    const method = archive.readUInt16LE(position + 10);
    const checksum = archive.readUInt32LE(position + 16);
    const compressedSize = archive.readUInt32LE(position + 20);
    const size = archive.readUInt32LE(position + 24);
    const nameLength = archive.readUInt16LE(position + 28);
    const localOffset = archive.readUInt32LE(position + 42);
    const path = archive.toString('utf8', position + 46, position + 46 + nameLength);
    position += 46 + nameLength;

    expect(archive.readUInt32LE(localOffset)).toBe(0x04034b50);
    const localNameLength = archive.readUInt16LE(localOffset + 26);
    const start = localOffset + 30 + localNameLength + archive.readUInt16LE(localOffset + 28);
    const body = archive.subarray(start, start + compressedSize);
    const data = method === 8 ? inflateRawSync(body) : Buffer.from(body);
    expect(data.length).toBe(size);
    expect(crc32(data) >>> 0).toBe(checksum);
    result.push({ path, method, data });
  }
  return result;
}

describe('createZip', () => {
  const html = Buffer.from('<!doctype html><title>Игра</title>'.repeat(20));
  const script = Buffer.from('console.log("клац");\n'.repeat(500));
  const noise = randomBytes(256);

  it('упаковывает файлы так, что их можно распаковать без потерь', () => {
    const files = unzip(
      createZip([
        { path: 'assets/index.js', data: script },
        { path: 'index.html', data: html },
        { path: 'assets/noise.bin', data: noise },
      ]),
    );
    expect(files.map((file) => file.path)).toEqual([
      'assets/index.js',
      'assets/noise.bin',
      'index.html',
    ]);
    expect(files[0]?.data.equals(script)).toBe(true);
    expect(files[1]?.data.equals(noise)).toBe(true);
    expect(files[2]?.data.equals(html)).toBe(true);
  });

  it('сжимает то, что сжимается, а остальное хранит как есть', () => {
    const files = unzip(
      createZip([
        { path: 'a.js', data: script },
        { path: 'b.bin', data: noise },
      ]),
    );
    expect(files[0]?.method).toBe(8);
    expect(files[1]?.method).toBe(0);
  });

  it('одна и та же сборка даёт одинаковый архив', () => {
    const entries = [
      { path: 'index.html', data: html },
      { path: 'assets/index.js', data: script },
    ];
    expect(createZip(entries).equals(createZip([...entries].reverse()))).toBe(true);
  });

  it.each(['my file.js', 'игра.js', '/index.html', 'assets\\a.js', '../secret.txt', ''])(
    'не пропускает имя «%s»',
    (path) => {
      expect(() => createZip([{ path, data: html }])).toThrow(/Недопустимое имя/);
    },
  );
});

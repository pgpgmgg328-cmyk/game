import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export interface FileInfo {
  /** Путь относительно корня, через «/». */
  path: string;
  size: number;
}

/** Все файлы внутри папки (рекурсивно), по алфавиту. */
export function listFiles(root: string): FileInfo[] {
  const result: FileInfo[] = [];
  const walk = (dir: string, prefix: string): void => {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name);
      const path = prefix ? `${prefix}/${name}` : name;
      const stats = statSync(full);
      if (stats.isDirectory()) walk(full, path);
      else result.push({ path, size: stats.size });
    }
  };
  walk(root, '');
  return result;
}

/**
 * `npm run dev:ya` — игра с моками SDK Яндекса (docs/yandex/concepts/local-launch.md, dev-окружение).
 * Запускает Vite на localhost:5173 и прокси Яндекса, который отдаёт /sdk.js с моками:
 * `npx @yandex-games/sdk-dev-proxy -h localhost:5173 --dev-mode=true`.
 * Игра откроется на https://localhost:8080. Прокси скачивает моки SDK с yastatic.net, нужен интернет.
 *
 * Прокси не добавлен в зависимости проекта: он тянет старый Express с известными уязвимостями,
 * а нужен только на компьютере разработчика. npm скачивает его при первом запуске.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PROXY_PACKAGE = '@yandex-games/sdk-dev-proxy@0.0.2';
const root = fileURLToPath(new URL('..', import.meta.url));
const viteBin = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));
const proxyArgs = ['-h', 'localhost:5173', '--dev-mode=true'];

// При запуске через `npm run` известен путь к самому npm: так не нужен shell и работает на Windows.
const npmCli = process.env.npm_execpath;
const proxy: ChildProcess = npmCli
  ? spawn(process.execPath, [npmCli, 'exec', '--yes', '--', PROXY_PACKAGE, ...proxyArgs], {
      cwd: root,
      stdio: 'inherit',
    })
  : spawn('npx', ['--yes', PROXY_PACKAGE, ...proxyArgs], {
      cwd: root,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });

const children: ChildProcess[] = [
  spawn(process.execPath, [viteBin], { cwd: root, stdio: 'inherit' }),
  proxy,
];

let stopping = false;
function stopAll(code: number): void {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  process.exitCode = code;
}

for (const child of children) child.on('exit', (code) => stopAll(code ?? 0));
process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));

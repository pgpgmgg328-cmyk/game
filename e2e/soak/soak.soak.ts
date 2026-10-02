import { expect, test } from '@playwright/test';
import { VETERAN_SAVE, e2eState, openGame, patchSave, waitScene, watchConsole } from '../helpers';

const MINUTES = Number(process.env.SOAK_MINUTES ?? 10);
const SAMPLE_MS = 30_000;

interface Sample {
  minute: number;
  heapMb: number;
  runs: number;
  score: number;
  scene: string;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

// Маленький экран: без видеокарты каждый кадр рисует процессор, так бот успевает больше.
test.use({ viewport: { width: 360, height: 640 } });

test(`бот играет ${MINUTES} мин: без ошибок, без застреваний и без роста памяти`, async ({
  page,
}) => {
  const problems = watchConsole(page);
  // Опытный игрок с инструментами: без показов новых форм забеги идут быстрее, а кнопки
  // «+1 за рекламу», «Второй шанс» и «×2 монеты» тоже проверяются.
  await openGame(page, { lang: 'ru' });
  await patchSave(page, {
    ...VETERAN_SAVE,
    upgrades: { shake: 1, remove: 1, preview: 1, squish: 0, golden: 0, jar: 0 },
  });
  await page.goto('/?e2e=1&lang=ru&bot=fast');
  await waitScene(page, 'Game', 30_000);
  const cdp = await page.context().newCDPSession(page);

  const samples: Sample[] = [];
  const started = Date.now();
  while (Date.now() - started < MINUTES * 60_000) {
    await page.waitForTimeout(SAMPLE_MS);
    await cdp.send('HeapProfiler.collectGarbage');
    const { usedSize } = await cdp.send('Runtime.getHeapUsage');
    const stats = await e2eState<{ runs: number } | null>(page, 'stats');
    const run = await e2eState<{ score: number } | null>(page, 'run');
    const sample: Sample = {
      minute: Math.round(((Date.now() - started) / 60_000) * 10) / 10,
      heapMb: Math.round((usedSize / 1024 / 1024) * 10) / 10,
      runs: stats?.runs ?? 0,
      score: run?.score ?? 0,
      scene: await e2eState<string>(page, 'scene'),
    };
    samples.push(sample);
    console.log(
      `soak: ${sample.minute} мин — память ${sample.heapMb} МБ, забегов ${sample.runs}, ` +
        `очки ${sample.score}, экран ${sample.scene}`,
    );
  }

  expect(problems).toEqual([]);
  // Игра не застряла: между соседними замерами меняются очки, забеги или экран.
  for (let i = 1; i < samples.length; i += 1) {
    const [a, b] = [samples[i - 1]!, samples[i]!];
    const moved = a.score !== b.score || a.runs !== b.runs || a.scene !== b.scene;
    expect(moved, `с ${a.minute} по ${b.minute} мин ничего не изменилось`).toBe(true);
  }
  // За 10 минут бот доигрывает хотя бы один забег до переполнения.
  if (MINUTES >= 8) expect(samples.at(-1)!.runs).toBeGreaterThanOrEqual(1);
  // Память после сборки мусора не растёт: конец против замеров после разогрева.
  const warm = samples.slice(1, 4).map((sample) => sample.heapMb);
  const tail = samples.slice(-3).map((sample) => sample.heapMb);
  if (samples.length >= 6) {
    const before = median(warm);
    const after = median(tail);
    console.log(`soak: память после разогрева ${before} МБ, в конце ${after} МБ`);
    expect(after).toBeLessThan(before * 1.2 + 3);
  }
});

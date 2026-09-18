/**
 * Mesure du coût réel de la perception (issue #36, revue visuelle de PR #38) : temps d'inférence par
 * image et délai « tomate mûrie » → « réveil parti ». C'est le moment clé de la vidéo, il doit rester
 * court.
 *
 *     npx tsx scripts/perception/measure-latency.ts --port 5319 [--runs 3]
 */
import { chromium } from 'playwright';
import './pageGlobals';

const LAUNCH_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

const flag = (name: string, fallback: number): number => {
  const i = process.argv.indexOf(name);
  const value = i >= 0 ? Number(process.argv[i + 1]) : NaN;
  return Number.isFinite(value) ? value : fallback;
};

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
};

async function main(): Promise<void> {
  const port = flag('--port', 5319);
  const runs = flag('--runs', 3);
  const browser = await chromium.launch({ args: LAUNCH_ARGS });
  const page = await browser.newPage({ viewport: { width: 1536, height: 864 } });
  await page.goto(`http://localhost:${port}/`);
  await page.waitForFunction(() => window.__tomatoPerception?.state().yoloReady === true, null, { timeout: 90_000 });
  const isolated = await page.evaluate(() => ({ crossOriginIsolated: self.crossOriginIsolated, cores: navigator.hardwareConcurrency }));

  // Quelques ticks pour sortir du réchauffement du runtime, puis on relève les inférences.
  await page.waitForTimeout(6000);
  const inferences: number[] = [];
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(600);
    const ms = await page.evaluate(() => window.__tomatoPerception!.state().lastInferenceMs);
    if (ms !== null) inferences.push(Math.round(ms));
  }

  const wakes: number[] = [];
  const gates: number[] = [];
  await page.evaluate(() => {
    const p = window.__tomatoPerception!;
    p.events.length = 0;
    window.__tomato!.runtime.onEvent!((e) => {
      if (e.type === 'ripe_detected') p.events.push(e);
    });
  });
  for (let run = 0; run < runs; run++) {
    /**
     * Une tomate mûrie peut être cachée par le feuillage : on en mûrit une nouvelle toutes les
     * `RETRY_MS` et on chronomètre depuis la dernière, comme le ferait l'opérateur qui clique
     * « Mûrir la prochaine tomate » jusqu'à ce que la détection parte. On relève aussi le délai
     * « première image positive → réveil », qui ne dépend que de la porte et de l'inférence.
     */
    const measured = await page.evaluate(
      async ({ retryMs, timeoutMs }) => {
        const p = window.__tomatoPerception!;
        p.events.length = 0;
        window.__tomato!.runtime.applyNow({ type: 'ripen_next' });
        let ripenedAt = performance.now();
        let firstPositiveAt = 0;
        const started = ripenedAt;
        while (performance.now() - started < timeoutMs) {
          const gate = p.state().gate;
          if (gate.tomatoId !== null && gate.count >= 1 && firstPositiveAt === 0) firstPositiveAt = performance.now();
          if (p.events.length > 0) {
            const now = performance.now();
            return { ripenMs: Math.round(now - ripenedAt), gateMs: firstPositiveAt === 0 ? null : Math.round(now - firstPositiveAt) };
          }
          if (performance.now() - ripenedAt > retryMs) {
            window.__tomato!.runtime.applyNow({ type: 'ripen_next' });
            ripenedAt = performance.now();
            firstPositiveAt = 0;
          }
          await new Promise((r) => setTimeout(r, 25));
        }
        return null;
      },
      { retryMs: 6000, timeoutMs: 60_000 },
    );
    if (measured !== null) {
      wakes.push(measured.ripenMs);
      if (measured.gateMs !== null) gates.push(measured.gateMs);
    }
  }
  await browser.close();

  console.log(
    JSON.stringify(
      {
        ...isolated,
        inferenceMs: { samples: inferences, median: median(inferences) },
        ripeToDetectedMs: { samples: wakes, median: median(wakes) },
        firstBoxToWakeMs: { samples: gates, median: median(gates) },
      },
      null,
      2,
    ),
  );
}

await main();

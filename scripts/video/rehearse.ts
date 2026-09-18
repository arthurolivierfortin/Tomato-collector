/**
 * Répétition générale du scénario en direct, **sans agent et donc sans coût**.
 *
 *   npx tsx scripts/video/rehearse.ts --api http://localhost:7471 \
 *     --episode data/episodes/2026-09-18T16-36-29-196Z-t1.json
 *
 * Le serveur tourne en `TOMATO_AGENT=off` : la détection ouvre bien un épisode et met le réveil en
 * scène (schéma bloc, bandeau, phase `detected`), mais aucune requête n'est envoyée au SDK. Ce
 * programme prend alors la place de l'agent : il se branche sur le **vrai serveur MCP** et rejoue,
 * au rythme du journal, la suite d'appels d'outils d'un épisode réel. Le dashboard reçoit donc de
 * vrais `tool_call_start`, de vraies vues, de vrais événements de simulation — tout ce que le
 * scénario `concepts` attend pour poser ses marqueurs et appuyer sur ses touches au bon moment.
 *
 * Ce qui manque, et c'est la seule différence avec une prise payante : le texte que l'agent écrit
 * entre deux appels (`agent_text`) et le flux brut de la session (`agent_raw`), qui viennent du SDK.
 * Le panneau « Session agent (brut) » reste donc vide pendant une répétition.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { opt, parseArgs, required } from './lib/cli';
import { isEpisodeFile, toolSequence, type ToolCall } from './lib/episodes';
import { fetchHealth } from './lib/health';

const DEFAULTS = { api: 'http://localhost:7331' };
/** Au-delà, c'est que la tomate ne mûrit pas : la page de la prise n'est sans doute pas ouverte. */
const WAIT_EPISODE_MS = 180_000;
const POLL_MS = 500;

function log(line: string): void {
  process.stdout.write(`${line}\n`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms));
}

/** Attend qu'un épisode soit ouvert par une détection ; rend son identifiant. */
async function waitForEpisode(apiUrl: string): Promise<string> {
  const deadline = Date.now() + WAIT_EPISODE_MS;
  log('attente d’une détection (la page de la prise doit être ouverte et le plant en train de mûrir)…');
  for (;;) {
    const health = await fetchHealth(apiUrl);
    if (health !== null && health.phase !== undefined && health.phase !== 'idle') {
      log(`épisode ouvert, phase « ${health.phase} » : l’agent de répétition prend la main.`);
      return health.phase;
    }
    if (Date.now() >= deadline) throw new Error(`aucune détection en ${WAIT_EPISODE_MS / 1000} s sur ${apiUrl}`);
    await sleep(POLL_MS);
  }
}

/** Résumé d'une réponse d'outil, sans les images : une ligne par appel suffit à suivre. */
function summarize(result: unknown): string {
  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content)) return '(sans contenu)';
  const texts = content.flatMap((c: unknown) => {
    const block = c as { type?: unknown; text?: unknown };
    if (block.type === 'image') return ['[image]'];
    return typeof block.text === 'string' ? [block.text.split('\n')[0] ?? ''] : [];
  });
  return texts.join(' · ').slice(0, 120);
}

async function replayCalls(client: Client, calls: readonly ToolCall[]): Promise<void> {
  const start = Date.now();
  for (const [i, call] of calls.entries()) {
    const due = start + call.atMs - Date.now();
    if (due > 0) await sleep(due);
    const at = ((Date.now() - start) / 1000).toFixed(1);
    const result = await client.callTool({ name: call.tool, arguments: call.args }).catch((e: unknown) => ({
      content: [{ type: 'text', text: `ÉCHEC ${e instanceof Error ? e.message : String(e)}` }],
    }));
    log(`  ${String(i + 1).padStart(2, ' ')}/${calls.length} +${at} s ${call.tool} ${JSON.stringify(call.args)} → ${summarize(result)}`);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const apiUrl = opt(args, 'api', DEFAULTS.api).replace(/\/$/, '');
  const path = resolve(required(args, 'episode'));
  const journal: unknown = JSON.parse(await readFile(path, 'utf8'));
  if (!isEpisodeFile(journal)) throw new Error(`journal d’épisode invalide : ${path}`);
  const calls = toolSequence(journal);
  if (calls.length === 0) throw new Error(`journal ${path} : aucun appel d’outil à rejouer`);
  log(`répétition : ${calls.length} appels d’outils de ${path}, sur ${apiUrl}/mcp`);

  await waitForEpisode(apiUrl);
  const client = new Client({ name: 'tomato-rehearsal', version: '1.0.0' });
  // Cast : le SDK déclare `sessionId: string | undefined` sur la classe et `sessionId?: string`
  // sur l'interface Transport, ce que `exactOptionalPropertyTypes` refuse (même cas que http/app.ts).
  await client.connect(new StreamableHTTPClientTransport(new URL(`${apiUrl}/mcp`)) as Transport);
  try {
    await replayCalls(client, calls);
  } finally {
    await client.close();
  }
  log('répétition terminée : l’épisode est clos par le « report » du journal.');
}

main().catch((e: unknown) => {
  process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
  process.exitCode = 1;
});

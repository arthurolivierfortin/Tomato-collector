import { appendFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { parseMessage } from '@tomato/shared';
import type { ServerToDashboard } from '@tomato/shared';
import { DEFAULT_WS_PORT } from '../config';
import { DEFAULT_WAKE_PORT } from './wakeServer';

/** `data/episodes/` à la racine du dépôt (ce fichier est dans packages/server/src/agent). */
export const EPISODES_DIR = fileURLToPath(new URL('../../../../data/episodes/', import.meta.url));
const EPISODE_TIMEOUT_MS = 20 * 60 * 1000;
/** Agent off : rien n'attend `episode_end`, on laisse juste la mise en scène arriver par le WebSocket. */
const STAGED_GRACE_MS = 300;

function parseBody(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Une ligne de transcript par message dashboard ; null pour les messages sans intérêt en console. */
export function formatTraceLine(m: ServerToDashboard): string | null {
  switch (m.type) {
    case 'episode_start':
      return `== episode ${m.episodeId} tomato #${m.tomatoId} (${m.sessionResumed ? 'resumed' : 'new'} session)`;
    case 'agent_text':
      return `[agent] ${m.text}`;
    case 'agent_wake':
      return `== réveil tomate #${m.tomatoId} (${m.detector} ${m.confidence.toFixed(2).replace('.', ',')}, ${m.sessionResumed ? 'session reprise' : 'nouvelle session'})`;
    case 'agent_raw':
      return `[raw  ] ${m.kind} ${m.line}`;
    case 'tool_call_start':
      return `[tool ] ${m.tool} ${JSON.stringify(m.args)}`;
    case 'tool_call_result':
      return `[${m.ok ? ' ok  ' : 'ERROR'}] ${m.summary} (${m.durationMs} ms)`;
    case 'phase':
      return `[phase] ${m.phase} (${m.reason})`;
    case 'sim_event':
      return `[sim  ] ${JSON.stringify(m.event)}`;
    case 'episode_end':
      return `== end ${m.outcome}: ${m.note} (${m.toolCalls} tool calls, $${m.costUsd.toFixed(3)}, ${(m.durationMs / 1000).toFixed(0)} s)`;
    default:
      return null;
  }
}

/**
 * Ce que la réponse de `POST /wake/<id>` demande au CLI : suivre l'épisode jusqu'à `episode_end`,
 * s'arrêter là parce que l'agent est off (réveil mis en scène, aucun épisode ne se terminera seul), ou échouer.
 */
export function wakeFollowUp(status: number, body: unknown): 'follow' | 'staged' | 'error' {
  if (status !== 202) return 'error';
  const agent = typeof body === 'object' && body !== null ? (body as { agent?: unknown }).agent : undefined;
  return agent === 'off' ? 'staged' : 'follow';
}

export function transcriptPath(tomatoId: number, now: Date = new Date(), dir: string = EPISODES_DIR): string {
  return `${dir.replace(/[\\/]?$/, '/')}wake-${tomatoId}-${now.toISOString().replace(/[:.]/g, '-')}.log`;
}

/** Hub du serveur, ou null s'il est injoignable : le réveil part quand même, sans trace en direct. */
async function openHub(wsUrl: string, write: (line: string) => void): Promise<WebSocket | null> {
  const ws = new WebSocket(wsUrl);
  try {
    await new Promise<void>((resolve, reject) => {
      ws.once('open', resolve);
      ws.once('error', reject);
    });
  } catch (e) {
    write(`== hub WebSocket injoignable sur ${wsUrl} (${e instanceof Error ? e.message : String(e)}) : pas de trace en direct`);
    return null;
  }
  ws.send(JSON.stringify({ type: 'hello', role: 'dashboard' }));
  return ws;
}

/** Suit l'épisode jusqu'à `episode_end` : 0 si la tomate est récoltée, 1 sinon (échec ou délai dépassé). */
function followEpisode(ws: WebSocket, write: (line: string) => void): Promise<number> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      write('== timeout waiting for episode_end');
      resolve(1);
    }, EPISODE_TIMEOUT_MS);
    ws.on('message', (raw) => {
      const m = parseMessage(String(raw));
      if (m === null) return;
      const line = formatTraceLine(m as ServerToDashboard);
      if (line !== null) write(line);
      if (m.type === 'episode_end') {
        clearTimeout(timer);
        resolve(m.outcome === 'harvested' ? 0 : 1);
      }
    });
  });
}

/** `npm run wake -w @tomato/server -- <tomatoId>` : déclenche un réveil et suit l'épisode en console. */
export async function runWakeCli(argv: string[], env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const tomatoId = Number(argv[0]);
  if (!Number.isInteger(tomatoId)) {
    console.error('usage: npm run wake -w @tomato/server -- <tomatoId>');
    return 2;
  }
  const wsUrl = `ws://localhost:${env.TOMATO_WS_PORT ?? String(DEFAULT_WS_PORT)}`;
  const wakeUrl = `http://127.0.0.1:${env.TOMATO_WAKE_PORT ?? String(DEFAULT_WAKE_PORT)}/wake/${tomatoId}`;
  const dir = env.TOMATO_EPISODES_DIR ?? EPISODES_DIR;
  mkdirSync(dir, { recursive: true });
  const file = transcriptPath(tomatoId, new Date(), dir);
  const write = (line: string): void => {
    console.log(line);
    appendFileSync(file, `${new Date().toISOString()} ${line}\n`);
  };

  const ws = await openHub(wsUrl, write);
  const finished = ws === null ? null : followEpisode(ws, write);

  const r = await fetch(wakeUrl, { method: 'POST' });
  const text = await r.text();
  write(`POST ${wakeUrl} -> ${r.status} ${text}`);
  const followUp = wakeFollowUp(r.status, parseBody(text));
  if (followUp === 'error') {
    ws?.close();
    return 1;
  }
  write(`transcript: ${file}`);
  if (followUp === 'staged') {
    // Agent off : la mise en scène est déjà diffusée, le temps qu'elle arrive par le WebSocket.
    if (ws !== null) await new Promise<void>((done) => setTimeout(done, STAGED_GRACE_MS));
    write('== agent désactivé : réveil mis en scène, épisode à piloter à la main (aucune requête au SDK)');
    ws?.close();
    return 0;
  }
  if (finished === null) {
    write("== réveil envoyé, mais l'épisode n'est pas suivi faute de hub (vérifier TOMATO_WS_PORT)");
    return 1;
  }
  const code = await finished;
  ws?.close();
  return code;
}

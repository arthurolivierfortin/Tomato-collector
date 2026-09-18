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

export function transcriptPath(tomatoId: number, now: Date = new Date()): string {
  return `${EPISODES_DIR}wake-${tomatoId}-${now.toISOString().replace(/[:.]/g, '-')}.log`;
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
  mkdirSync(EPISODES_DIR, { recursive: true });
  const file = transcriptPath(tomatoId);
  const write = (line: string): void => {
    console.log(line);
    appendFileSync(file, `${new Date().toISOString()} ${line}\n`);
  };

  const ws = new WebSocket(wsUrl);
  await new Promise<void>((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  ws.send(JSON.stringify({ type: 'hello', role: 'dashboard' }));
  const finished = new Promise<number>((resolve) => {
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

  const r = await fetch(wakeUrl, { method: 'POST' });
  const text = await r.text();
  write(`POST ${wakeUrl} -> ${r.status} ${text}`);
  const followUp = wakeFollowUp(r.status, parseBody(text));
  if (followUp === 'error') {
    ws.close();
    return 1;
  }
  write(`transcript: ${file}`);
  if (followUp === 'staged') {
    // Agent off : la mise en scène est déjà diffusée, le temps qu'elle arrive par le WebSocket.
    await new Promise<void>((done) => setTimeout(done, STAGED_GRACE_MS));
    write('== agent désactivé : réveil mis en scène, épisode à piloter à la main (aucune requête au SDK)');
    ws.close();
    return 0;
  }
  const code = await finished;
  ws.close();
  return code;
}

/**
 * Flux de la session agent sur la sortie standard (`TOMATO_LOG_STREAM=on`).
 *
 * Le dashboard montre déjà ce flux dans son panneau « Session agent (brut) », mais une vidéo de
 * démo où l'agent n'existe que sous forme de panneau web laisse croire à une mise en scène. Un
 * vrai terminal qui déroule les mêmes lignes — session, texte, `tool_use` avec ses arguments,
 * `tool_result`, coût final — lève le doute. Ce sont exactement les messages `agent_raw` diffusés
 * au dashboard : mêmes textes, même filtrage du base64, une couleur par nature d'événement.
 *
 * Pur et testé : la fonction ne fait que rendre une chaîne, `index.ts` l'écrit.
 */
import type { AgentRawKind, ServerToDashboard } from '@tomato/shared';
import { stripBase64 } from './agent/streamToDashboard';

const RESET = '[0m';

/** Une couleur par nature d'événement : le terminal se lit d'un coup d'œil, même en vidéo. */
const KIND_COLOR: Record<AgentRawKind, string> = {
  init: '[36m', // cyan
  text: '[37m', // gris clair
  tool_use: '[33m', // jaune
  tool_result: '[32m', // vert
  stderr: '[31m', // rouge
  result: '[35m', // magenta
};

/** Largeur de la colonne des préfixes : les lignes s'alignent, le terminal reste lisible. */
const PREFIX_WIDTH = 9;

function paint(color: string, prefix: string, body: string): string {
  return `${color}${prefix.padEnd(PREFIX_WIDTH)}${RESET} ${stripBase64(body)}`;
}

/** Retire les séquences ANSI : les tests comparent le texte, pas les couleurs. */
export function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex -- c'est justement le caractère d'échappement ANSI.
  return text.replace(/\[[0-9;]*m/g, '');
}

/** Montant à l'anglaise, comme les cartons de la vidéo : « $0.38 ». */
function usd(costUsd: number): string {
  return `$${costUsd.toFixed(2)}`;
}

/** Horodatage ajouté par `consoleLogger` : le terminal défile déjà dans l'ordre, il n'apporte rien. */
const LEADING_TIMESTAMP = /^\[[^\]]+\]\s*/u;

/**
 * Une ligne du serveur lui-même (démarrage, réveil mis en scène, arrêt) mise au format du flux :
 * même colonne de préfixe, une couleur à part. C'est ce qui fait qu'un terminal filmé montre
 * « prêt : … agent on (claude-opus-5) » avant les lignes de la session.
 */
export function serverLine(line: string): string {
  return paint('[90m', 'server', line.replace(LEADING_TIMESTAMP, ''));
}

/**
 * Une ligne de terminal pour un message du hub, ou `null` quand le message n'a rien à y faire.
 * Seuls le flux brut de l'agent et les trois bornes de l'épisode sont imprimés : phases, snapshots
 * et activités du schéma bloc noieraient la session sous le bruit.
 */
export function logStreamLine(m: ServerToDashboard): string | null {
  switch (m.type) {
    case 'agent_raw':
      return paint(KIND_COLOR[m.kind], m.kind, m.line);
    // Le versant serveur de chaque appel : ce que le MCP robot a réellement servi, avec son chrono.
    // Distinct du `tool_use` du SDK, qui est ce que l'agent a demandé, et seul visible quand
    // l'agent est coupé (répétition sans coût : le terminal montre quand même la partie d'échecs).
    case 'tool_call_start':
      return paint('[34m', 'mcp', `${m.tool} ${JSON.stringify(m.args)}`);
    case 'tool_call_result':
      return paint(m.ok ? '[34m' : '[31m', 'mcp', `${m.ok ? 'ok' : 'ERREUR'} : ${m.summary} (${m.durationMs} ms)`);
    case 'sim_event':
      return paint('[90m', 'sim', JSON.stringify(m.event));
    case 'agent_wake':
      return paint('[33m', 'wake', `tomato #${m.tomatoId} (${m.detector} ${m.confidence.toFixed(2)})`);
    case 'episode_start':
      return paint('[36m', 'episode', `${m.episodeId} · tomato #${m.tomatoId} · ${m.sessionResumed ? 'resumed' : 'new'} session`);
    case 'episode_end':
      return paint('[35m', 'end', `${m.outcome} · ${m.toolCalls} tool calls · ${Math.round(m.durationMs / 1000)} s · ${usd(m.costUsd)}`);
    default:
      return null;
  }
}

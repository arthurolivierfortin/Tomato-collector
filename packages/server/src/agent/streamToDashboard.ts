import { TOOL_NAMES, ToolSchemas } from '@tomato/shared';
import type { AgentRawKind, ServerToDashboard, ToolName } from '@tomato/shared';
import type { AgentContentBlock, AgentMessage, EpisodeOutcome } from './types';

export const ROBOT_MCP_NAME = 'robot';
export const ROBOT_TOOL_PREFIX = `mcp__${ROBOT_MCP_NAME}__`;

/** Longueur maximale d'une ligne du flux brut : le panneau du dashboard est un terminal, pas un dump. */
export const RAW_LINE_MAX = 200;

/** Suite de caractères base64 assez longue pour être une image : jamais dans le flux brut. */
const BASE64_RUN = /[A-Za-z0-9+/]{60,}={0,2}/g;

/** Remplace les blocs base64 (images des vues) par un marqueur : le flux brut reste lisible. */
export function stripBase64(text: string): string {
  return text.replace(BASE64_RUN, '[base64]');
}

/** Une ligne, sans base64, coupée à `max` caractères avec le compte de ce qui manque. */
export function shortLine(text: string, max: number = RAW_LINE_MAX): string {
  const one = stripBase64(text).replace(/\s+/g, ' ').trim();
  return one.length <= max ? one : `${one.slice(0, max)}… (+${one.length - max} car.)`;
}

/** Découpe la sortie d'erreur du sous-processus Claude Code en lignes non vides. */
export function stderrLines(data: string): string[] {
  return data.split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l.trim() !== '');
}

/** Montant en dollars à la française : `0,420 $`. */
function euros(costUsd: number): string {
  return `${costUsd.toFixed(3).replace('.', ',')} $`;
}

export function agentRaw(episodeId: string, kind: AgentRawKind, line: string): ServerToDashboard {
  return { type: 'agent_raw', episodeId, kind, line };
}

export interface ReportCall {
  outcome: EpisodeOutcome;
  note: string;
}

export interface StreamResult {
  subtype: string;
  isError: boolean;
  costUsd: number;
  durationMs: number;
  numTurns: number;
}

/** État accumulé au fil d'un épisode ; immuable, chaque réduction renvoie un nouvel objet. */
export interface StreamState {
  episodeId: string;
  sessionId: string | null;
  model: string | null;
  /** Statut du serveur MCP `robot` dans le message `init` (`connected`, `pending`, `failed`…). */
  mcpStatus: string | null;
  toolCalls: number;
  report: ReportCall | null;
  result: StreamResult | null;
}

export interface StreamStep {
  state: StreamState;
  /** Messages à diffuser au dashboard, dans l'ordre. */
  out: ServerToDashboard[];
  /** Fragment de texte en continu (pour la console), null sinon. */
  delta: string | null;
}

export function createStreamState(episodeId: string): StreamState {
  return { episodeId, sessionId: null, model: null, mcpStatus: null, toolCalls: 0, report: null, result: null };
}

/** `mcp__robot__cut` → `cut` ; null pour tout autre nom. */
export function robotToolName(name: string): ToolName | null {
  if (!name.startsWith(ROBOT_TOOL_PREFIX)) return null;
  const short = name.slice(ROBOT_TOOL_PREFIX.length);
  return (TOOL_NAMES as string[]).includes(short) ? (short as ToolName) : null;
}

function parseReport(input: unknown): ReportCall | null {
  const parsed = ToolSchemas.report.safeParse(input);
  return parsed.success ? { outcome: parsed.data.outcome, note: parsed.data.note } : null;
}

/** Texte d'un `content_block_delta` de type `text_delta` (événement brut de l'API Messages), sinon null. */
function textDelta(delta: unknown): string | null {
  if (typeof delta !== 'object' || delta === null) return null;
  const d = delta as { type?: unknown; text?: unknown };
  return d.type === 'text_delta' && typeof d.text === 'string' && d.text !== '' ? d.text : null;
}

/** `move_basket {"x":1.5,"y":-2}` : nom court de l'outil robot (sinon nom brut) et arguments compacts. */
export function toolUseLine(block: AgentContentBlock): string {
  const name = block.name ?? '(sans nom)';
  const args = JSON.stringify(block.input ?? {}) ?? 'null';
  return shortLine(`${robotToolName(name) ?? name} ${args}`);
}

/** Résumé court d'un bloc `tool_result` : texte coupé, images annoncées, jamais de base64. */
export function toolResultLine(block: AgentContentBlock): string {
  const content = block.content;
  const parts: string[] = [];
  if (typeof content === 'string') parts.push(content);
  else if (Array.isArray(content)) {
    for (const piece of content as ReadonlyArray<AgentContentBlock>) {
      if (piece.type === 'text' && typeof piece.text === 'string') parts.push(piece.text);
      else parts.push(`[${piece.type === 'image' ? 'image' : String(piece.type)}]`);
    }
  }
  const body = shortLine(parts.join(' '));
  return block.is_error === true ? `ERREUR ${body}` : body;
}

function reduceBlocks(state: StreamState, blocks: ReadonlyArray<AgentContentBlock>): StreamStep {
  let next = state;
  const out: ServerToDashboard[] = [];
  for (const block of blocks) {
    if (block.type === 'text' && block.text !== undefined && block.text.trim() !== '') {
      out.push({ type: 'agent_text', episodeId: state.episodeId, text: block.text.trim() });
      // Le flux brut en donne l'aperçu sur une ligne (coupé à RAW_LINE_MAX) ; le texte complet
      // reste dans le `agent_text` émis juste au-dessus.
      out.push(agentRaw(state.episodeId, 'text', shortLine(block.text)));
    } else if (block.type === 'tool_use' && block.name !== undefined) {
      // Le flux brut montre TOUS les outils ; seuls ceux du robot comptent dans les statistiques.
      out.push(agentRaw(state.episodeId, 'tool_use', toolUseLine(block)));
      const tool = robotToolName(block.name);
      if (tool === null) continue;
      const report = tool === 'report' ? parseReport(block.input) : null;
      next = { ...next, toolCalls: next.toolCalls + 1, report: report ?? next.report };
    }
  }
  return { state: next, out, delta: null };
}

/** Les blocs `tool_result` d'un message utilisateur du SDK (retour des outils MCP à l'agent). */
function reduceToolResults(state: StreamState, content: string | ReadonlyArray<AgentContentBlock>): StreamStep {
  if (typeof content === 'string') return { state, out: [], delta: null };
  const out = content
    .filter((b) => b.type === 'tool_result')
    .map((b) => agentRaw(state.episodeId, 'tool_result', toolResultLine(b)));
  return { state, out, delta: null };
}

/** Convertit un message du SDK en messages dashboard et met à jour l'état de l'épisode. */
export function reduceStreamMessage(state: StreamState, msg: AgentMessage): StreamStep {
  switch (msg.type) {
    case 'system': {
      const robot = msg.mcp_servers.find((s) => s.name === ROBOT_MCP_NAME);
      const mcpStatus = robot?.status ?? 'absent';
      return {
        state: { ...state, sessionId: msg.session_id, model: msg.model, mcpStatus },
        out: [agentRaw(state.episodeId, 'init', `session ${msg.session_id} · modèle ${msg.model} · MCP robot : ${mcpStatus}`)],
        delta: null,
      };
    }
    case 'assistant':
      return reduceBlocks(state, msg.message.content);
    case 'user':
      return reduceToolResults(state, msg.message.content);
    case 'stream_event':
      return { state, out: [], delta: msg.event.type === 'content_block_delta' ? textDelta(msg.event.delta) : null };
    case 'result': {
      const head = msg.is_error ? `échec ${msg.subtype}` : 'terminé';
      const line = `${head} · ${msg.num_turns} tours · ${euros(msg.total_cost_usd)} · ${Math.round(msg.duration_ms / 1000)} s`;
      return {
        state: {
          ...state,
          sessionId: msg.session_id,
          result: {
            subtype: msg.subtype,
            isError: msg.is_error,
            costUsd: msg.total_cost_usd,
            durationMs: msg.duration_ms,
            numTurns: msg.num_turns,
          },
        },
        out: [agentRaw(state.episodeId, 'result', line)],
        delta: null,
      };
    }
    case 'other':
      return { state, out: [], delta: null };
  }
}

/** Issue et note de l'épisode : celles du `report` de l'agent, sinon `aborted` avec la raison. */
export function episodeOutcome(state: StreamState, error: string | null): ReportCall {
  if (state.report !== null) return state.report;
  if (error !== null) return { outcome: 'aborted', note: `agent error: ${error}` };
  if (state.result?.isError) return { outcome: 'aborted', note: `agent ended with ${state.result.subtype}` };
  return { outcome: 'aborted', note: 'agent ended without report' };
}

/** Message `episode_end` ; coût et durée viennent du `result` du SDK, sinon de la durée mesurée. */
export function episodeEndMessage(
  state: StreamState,
  final: ReportCall,
  measuredDurationMs: number,
): ServerToDashboard {
  return {
    type: 'episode_end',
    episodeId: state.episodeId,
    outcome: final.outcome,
    note: final.note,
    toolCalls: state.toolCalls,
    costUsd: state.result?.costUsd ?? 0,
    durationMs: state.result?.durationMs ?? measuredDurationMs,
  };
}

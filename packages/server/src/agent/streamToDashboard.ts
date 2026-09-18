import { TOOL_NAMES, ToolSchemas } from '@tomato/shared';
import type { ServerToDashboard, ToolName } from '@tomato/shared';
import type { AgentContentBlock, AgentMessage, EpisodeOutcome } from './types';

export const ROBOT_MCP_NAME = 'robot';
export const ROBOT_TOOL_PREFIX = `mcp__${ROBOT_MCP_NAME}__`;

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

function reduceBlocks(state: StreamState, blocks: ReadonlyArray<AgentContentBlock>): StreamStep {
  let next = state;
  const out: ServerToDashboard[] = [];
  for (const block of blocks) {
    if (block.type === 'text' && block.text !== undefined && block.text.trim() !== '') {
      out.push({ type: 'agent_text', episodeId: state.episodeId, text: block.text.trim() });
    } else if (block.type === 'tool_use' && block.name !== undefined) {
      const tool = robotToolName(block.name);
      if (tool === null) continue;
      const report = tool === 'report' ? parseReport(block.input) : null;
      next = { ...next, toolCalls: next.toolCalls + 1, report: report ?? next.report };
    }
  }
  return { state: next, out, delta: null };
}

/** Convertit un message du SDK en messages dashboard et met à jour l'état de l'épisode. */
export function reduceStreamMessage(state: StreamState, msg: AgentMessage): StreamStep {
  switch (msg.type) {
    case 'system': {
      const robot = msg.mcp_servers.find((s) => s.name === ROBOT_MCP_NAME);
      return {
        state: { ...state, sessionId: msg.session_id, model: msg.model, mcpStatus: robot?.status ?? 'absent' },
        out: [],
        delta: null,
      };
    }
    case 'assistant':
      return reduceBlocks(state, msg.message.content);
    case 'stream_event':
      return { state, out: [], delta: msg.event.type === 'content_block_delta' ? textDelta(msg.event.delta) : null };
    case 'result':
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
        out: [],
        delta: null,
      };
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

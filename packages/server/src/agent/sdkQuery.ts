import { query } from '@anthropic-ai/claude-agent-sdk';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type { AgentMessage, QueryFn } from './types';

/**
 * Réduit un `SDKMessage` aux variantes lues par M6. Les `return m` ne compilent que si
 * chaque type du SDK est bien un sur-type structurel de `AgentMessage` : c'est la vérification
 * des formes utilisées par `streamToDashboard`.
 */
export function toAgentMessage(m: SDKMessage): AgentMessage {
  switch (m.type) {
    case 'assistant':
      return m;
    case 'user':
      return m;
    case 'result':
      return m;
    case 'stream_event':
      return m;
    case 'system':
      return m.subtype === 'init' ? m : { type: 'other' };
    default:
      return { type: 'other' };
  }
}

/** `query()` réel du Claude Agent SDK, sous la forme injectable du runner. */
export const sdkQuery: QueryFn = async function* (prompt, options) {
  for await (const m of query({ prompt, options })) yield toAgentMessage(m);
};

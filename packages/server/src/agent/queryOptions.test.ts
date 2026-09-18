import { describe, expect, it } from 'vitest';
import { AGENT_MAX_TURNS, MAX_MCP_OUTPUT_TOKENS, buildQueryOptions } from './queryOptions';

describe('buildQueryOptions', () => {
  const abortController = new AbortController();
  const base = { mcpUrl: 'http://localhost:7331/mcp', model: 'claude-opus-5', systemPrompt: 'SYS', abortController };

  it('declares the robot MCP server over HTTP, allows only its tools and disables built-in tools', () => {
    const o = buildQueryOptions({ ...base, sessionId: null });
    expect(o.mcpServers).toEqual({ robot: { type: 'http', url: 'http://localhost:7331/mcp', alwaysLoad: true } });
    expect(o.allowedTools).toEqual(['mcp__robot__*']);
    expect(o.tools).toEqual([]);
    expect(o.permissionMode).toBe('dontAsk');
    expect(o.strictMcpConfig).toBe(true);
    expect(o.settingSources).toEqual([]);
  });

  it('passes the system prompt as a plain string, the model, streaming and the turn limit', () => {
    const o = buildQueryOptions({ ...base, sessionId: null });
    expect(o.systemPrompt).toBe('SYS');
    expect(o.model).toBe('claude-opus-5');
    expect(o.includePartialMessages).toBe(true);
    expect(o.maxTurns).toBe(AGENT_MAX_TURNS);
    expect(o.persistSession).toBe(true);
    expect(o.abortController).toBe(abortController);
  });

  it('raises the MCP output limit in the subprocess environment while inheriting the rest', () => {
    const o = buildQueryOptions({ ...base, sessionId: null });
    expect(o.env?.MAX_MCP_OUTPUT_TOKENS).toBe(MAX_MCP_OUTPUT_TOKENS);
    expect(o.env?.PATH).toBe(process.env.PATH);
  });

  it('adds resume only when a session id is known, and stderr only when given', () => {
    expect('resume' in buildQueryOptions({ ...base, sessionId: null })).toBe(false);
    expect(buildQueryOptions({ ...base, sessionId: 'abc' }).resume).toBe('abc');
    expect('stderr' in buildQueryOptions({ ...base, sessionId: null })).toBe(false);
    const stderr = (): void => undefined;
    expect(buildQueryOptions({ ...base, sessionId: null, stderr }).stderr).toBe(stderr);
  });
});

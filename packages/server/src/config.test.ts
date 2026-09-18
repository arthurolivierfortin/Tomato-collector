import { describe, expect, it } from 'vitest';
import { DEFAULT_MCP_PORT, DEFAULT_MODEL, DEFAULT_TOOL_PACING_MS, DEFAULT_WS_PORT, readConfig } from './config';

describe('readConfig', () => {
  it('uses the documented defaults when nothing is set', () => {
    const c = readConfig({});
    expect(c.mcpPort).toBe(DEFAULT_MCP_PORT);
    expect(c.wsPort).toBe(DEFAULT_WS_PORT);
    expect(c.model).toBe(DEFAULT_MODEL);
    expect(c.agent).toBe('on');
    expect(c.logStream).toBe('off');
    expect(c.logFile).toBe('');
    expect(c.toolPacingMs).toBe(DEFAULT_TOOL_PACING_MS);
    expect(DEFAULT_TOOL_PACING_MS).toBe(1500);
    expect(c.episodesDir.replace(/\\/g, '/')).toMatch(/data\/episodes$/);
  });

  it('reads TOMATO_TOOL_PACING_MS and falls back on an invalid value', () => {
    expect(readConfig({ TOMATO_TOOL_PACING_MS: '3000' }).toolPacingMs).toBe(3000);
    expect(readConfig({ TOMATO_TOOL_PACING_MS: '0' }).toolPacingMs).toBe(0);
    expect(readConfig({ TOMATO_TOOL_PACING_MS: '-5' }).toolPacingMs).toBe(DEFAULT_TOOL_PACING_MS);
    expect(readConfig({ TOMATO_TOOL_PACING_MS: 'lent' }).toolPacingMs).toBe(DEFAULT_TOOL_PACING_MS);
    expect(readConfig({ TOMATO_TOOL_PACING_MS: '' }).toolPacingMs).toBe(DEFAULT_TOOL_PACING_MS);
  });

  it('reads TOMATO_* variables and ignores invalid ports', () => {
    const c = readConfig({
      TOMATO_MCP_PORT: '8000',
      TOMATO_WS_PORT: 'abc',
      TOMATO_MODEL: ' claude-sonnet-5 ',
      TOMATO_AGENT: 'off',
      TOMATO_EPISODES_DIR: '/tmp/ep',
      TOMATO_LOG_STREAM: 'on',
      TOMATO_LOG_FILE: ' C:/tmp/term.log ',
    });
    expect(c.mcpPort).toBe(8000);
    expect(c.wsPort).toBe(DEFAULT_WS_PORT);
    expect(c.model).toBe('claude-sonnet-5');
    expect(c.agent).toBe('off');
    expect(c.episodesDir).toBe('/tmp/ep');
    expect(c.logStream).toBe('on');
    expect(readConfig({ TOMATO_LOG_STREAM: 'yes' }).logStream).toBe('off');
    expect(c.logFile).toBe('C:/tmp/term.log');
  });
});

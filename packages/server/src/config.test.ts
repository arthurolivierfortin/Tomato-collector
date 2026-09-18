import { describe, expect, it } from 'vitest';
import { DEFAULT_MCP_PORT, DEFAULT_MODEL, DEFAULT_WS_PORT, readConfig } from './config';

describe('readConfig', () => {
  it('uses the documented defaults when nothing is set', () => {
    const c = readConfig({});
    expect(c.mcpPort).toBe(DEFAULT_MCP_PORT);
    expect(c.wsPort).toBe(DEFAULT_WS_PORT);
    expect(c.model).toBe(DEFAULT_MODEL);
    expect(c.agent).toBe('on');
    expect(c.episodesDir.replace(/\\/g, '/')).toMatch(/data\/episodes$/);
  });

  it('reads TOMATO_* variables and ignores invalid ports', () => {
    const c = readConfig({
      TOMATO_MCP_PORT: '8000',
      TOMATO_WS_PORT: 'abc',
      TOMATO_MODEL: ' claude-sonnet-5 ',
      TOMATO_AGENT: 'off',
      TOMATO_EPISODES_DIR: '/tmp/ep',
    });
    expect(c.mcpPort).toBe(8000);
    expect(c.wsPort).toBe(DEFAULT_WS_PORT);
    expect(c.model).toBe('claude-sonnet-5');
    expect(c.agent).toBe('off');
    expect(c.episodesDir).toBe('/tmp/ep');
  });
});

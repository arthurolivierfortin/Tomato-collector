import { describe, expect, it } from 'vitest';
import { DEFAULT_MCP_PORT, DEFAULT_MODEL, DEFAULT_TOOL_PACING_MS, DEFAULT_VISIBLE_TITLE, DEFAULT_WS_PORT, readConfig } from './config';

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

describe('readConfig, agent headless visible', () => {
  it('connaît le mode « visible » : le même agent, dans une fenêtre filmée', () => {
    expect(readConfig({ TOMATO_AGENT: 'visible' }).agent).toBe('visible');
  });

  it('retombe sur « on » pour toute autre valeur, comme avant', () => {
    expect(readConfig({ TOMATO_AGENT: 'oui' }).agent).toBe('on');
    expect(readConfig({ TOMATO_AGENT: '' }).agent).toBe('on');
  });

  it('donne à la fenêtre un titre et une géométrie par défaut qui tiennent dans 1536 × 960', () => {
    const v = readConfig({}).visible;
    expect(v.title).toBe(DEFAULT_VISIBLE_TITLE);
    expect(v.cols).toBe(110);
    expect(v.rows).toBe(32);
    expect(v.x).toBe(20);
    expect(v.y).toBe(20);
    expect(v.dir.replace(/\\/g, '/')).toMatch(/data\/video\/cli$/);
  });

  it('laisse tout régler par l’environnement, y compris le titre que le pilote cherche', () => {
    const v = readConfig({
      TOMATO_VISIBLE_TITLE: ' Claude Code headless ',
      TOMATO_VISIBLE_COLS: '100',
      TOMATO_VISIBLE_ROWS: '30',
      TOMATO_VISIBLE_X: '40',
      TOMATO_VISIBLE_Y: '60',
      TOMATO_VISIBLE_DIR: '/tmp/cli',
      TOMATO_VISIBLE_CWD: '/tmp/repo',
      TOMATO_VISIBLE_KEEP: 'on',
    }).visible;
    expect(v).toEqual({ title: 'Claude Code headless', cols: 100, rows: 30, x: 40, y: 60, dir: '/tmp/cli', cwd: '/tmp/repo', keep: true });
  });

  it('ignore une géométrie absurde plutôt que d’ouvrir une fenêtre inutilisable', () => {
    expect(readConfig({ TOMATO_VISIBLE_COLS: '0' }).visible.cols).toBe(110);
    expect(readConfig({ TOMATO_VISIBLE_ROWS: 'trente' }).visible.rows).toBe(32);
  });
});

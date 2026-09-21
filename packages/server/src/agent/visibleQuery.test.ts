import { appendFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildQueryOptions } from './queryOptions';
import type { AgentMessage } from './types';
import { createVisibleQuery, type WindowLauncher } from './visibleQuery';

const FIXTURE = resolve(import.meta.dirname, 'fixtures/episode-stream.jsonl');

function options(sessionId: string | null): ReturnType<typeof buildQueryOptions> {
  return buildQueryOptions({
    mcpUrl: 'http://localhost:7331/mcp',
    model: 'opus',
    systemPrompt: '# Tomato harvesting agent\nYou are the control agent.',
    sessionId,
    abortController: new AbortController(),
  });
}

/**
 * Fenêtre factice : au lieu de lancer `wt.exe`, elle recopie un flux réel — fabriqué à partir du
 * journal d'épisode 2026-09-18T20-16-54-341Z-t1 — dans le fichier que `Tee-Object` écrirait,
 * morceau par morceau et en UTF-16LE, comme Windows PowerShell 5.1. Aucun épisode payant.
 */
function replayLauncher(chunkSize = 400, encoding: BufferEncoding = 'utf16le', tickMs = 5): WindowLauncher & { seen: string[][] } {
  const seen: string[][] = [];
  return {
    seen,
    launch(args, _env, teePath) {
      seen.push(args);
      let timer: NodeJS.Timeout | null = null;
      void (async (): Promise<void> => {
        const text = await readFile(FIXTURE, 'utf8');
        const buffer = Buffer.concat([
          ...(encoding === 'utf16le' ? [Buffer.from([0xff, 0xfe])] : []),
          Buffer.from(text, encoding),
        ]);
        let at = 0;
        writeFileSync(teePath, Buffer.alloc(0));
        timer = setInterval(() => {
          if (at >= buffer.length) {
            if (timer !== null) clearInterval(timer);
            return;
          }
          const slice = buffer.subarray(at, at + chunkSize);
          at += chunkSize;
          // Append synchrone : deux `writeFile` en vol peuvent s'écrire dans le désordre.
          appendFileSync(teePath, slice);
        }, tickMs);
      })();
      return {
        close: () => {
          if (timer !== null) clearInterval(timer);
          return Promise.resolve();
        },
      };
    },
  };
}

async function collect(sessionId: string | null = null, launcher = replayLauncher()): Promise<{ messages: AgentMessage[]; dir: string; launcher: ReturnType<typeof replayLauncher> }> {
  const dir = await mkdtemp(join(tmpdir(), 'tomato-visible-'));
  const query = createVisibleQuery({ workDir: dir, title: 'Claude Code headless', geometry: { cols: 110, rows: 32, x: 20, y: 20 }, launcher, pollMs: 5 });
  const messages: AgentMessage[] = [];
  for await (const msg of query('A ripe tomato was detected: tomato #1.', options(sessionId))) messages.push(msg);
  return { messages, dir, launcher };
}

describe('createVisibleQuery', () => {
  it('rend les mêmes messages que le SDK, dans l’ordre du flux', async () => {
    const { messages } = await collect();
    expect(messages[0]).toMatchObject({ type: 'system', subtype: 'init', session_id: 'ep-session-1' });
    expect(messages.filter((m) => m.type === 'assistant')).toHaveLength(12);
    expect(messages[messages.length - 1]).toMatchObject({ type: 'result', num_turns: 12 });
  });

  it('s’arrête au message result : c’est lui qui clôt l’épisode et porte le coût', async () => {
    const { messages } = await collect();
    const result = messages[messages.length - 1];
    expect(result).toMatchObject({ type: 'result' });
    expect(messages.filter((m) => m.type === 'result')).toHaveLength(1);
  });

  it('lit aussi un fichier écrit en UTF-8', async () => {
    const { messages } = await collect(null, replayLauncher(400, 'utf8'));
    expect(messages[messages.length - 1]).toMatchObject({ type: 'result' });
  });

  it('recolle les lignes coupées par une lecture, même très fragmentées', async () => {
    const { messages } = await collect(null, replayLauncher(61, 'utf16le', 1));
    expect(messages.filter((m) => m.type === 'assistant')).toHaveLength(12);
  });

  it('écrit le message de réveil et la configuration MCP là où la commande les lit', async () => {
    const { dir } = await collect();
    expect(await readFile(join(dir, 'wake.txt'), 'utf8')).toBe('A ripe tomato was detected: tomato #1.');
    const mcp: unknown = JSON.parse(await readFile(join(dir, 'mcp.json'), 'utf8'));
    expect(mcp).toEqual({ mcpServers: { robot: { type: 'http', url: 'http://localhost:7331/mcp' } } });
  });

  it('écrit le prompt système du SDK dans le fichier que PowerShell lit', async () => {
    const { dir } = await collect();
    expect(await readFile(join(dir, 'system.md'), 'utf8')).toContain('You are the control agent.');
  });

  it('ouvre une fenêtre Windows Terminal titrée, avec la commande claude dedans', async () => {
    const { launcher } = await collect();
    const args = launcher.seen[0] ?? [];
    expect(args.slice(0, 2)).toEqual(['-w', 'new']);
    const command = args[args.length - 1] ?? '';
    // Le titre se pose depuis l'interieur : `wt.exe --title` ne marche pas sur cette version.
    expect(command.startsWith("$Host.UI.RawUI.WindowTitle = 'Claude Code headless'; claude -p ")).toBe(true);
    expect(command).toContain('--output-format stream-json');
    expect(command).toContain('Tee-Object -FilePath');
  });

  it('reprend la session de l’épisode précédent quand le SDK le ferait', async () => {
    const { launcher } = await collect('ep-session-1');
    expect(launcher.seen[0]?.[launcher.seen[0].length - 1]).toContain("--resume 'ep-session-1'");
  });

  it('coupe le flux quand l’épisode est interrompu, sans attendre le result', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tomato-visible-'));
    const abort = new AbortController();
    const query = createVisibleQuery({ workDir: dir, title: 'T', geometry: { cols: 110, rows: 32, x: 0, y: 0 }, launcher: replayLauncher(61, 'utf16le', 1), pollMs: 5 });
    const opts = { ...options(null), abortController: abort };
    const seen: AgentMessage[] = [];
    for await (const msg of query('wake', opts)) {
      seen.push(msg);
      if (seen.length === 3) abort.abort();
    }
    expect(seen.length).toBeLessThan(27);
    expect(seen[seen.length - 1]).not.toMatchObject({ type: 'result' });
  });
});

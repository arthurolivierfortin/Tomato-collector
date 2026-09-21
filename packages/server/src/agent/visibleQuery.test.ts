import { appendFileSync, existsSync, writeFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildQueryOptions } from './queryOptions';
import type { AgentMessage } from './types';
import { createVisibleAgent, type WindowLauncher } from './visibleQuery';

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
function replayLauncher(
  chunkSize = 400,
  encoding: BufferEncoding = 'utf16le',
  tickMs = 5,
  /**
   * Temps que met `wt.exe` a ouvrir la fenetre, `claude` a demarrer et `Tee-Object` a tronquer le
   * fichier : une seconde en vrai, mesuree. Le fichier n'est donc PAS tronque au retour de
   * `launch()` — c'est cette fenetre-la qui laissait relire le flux du serveur precedent.
   */
  startDelayMs = 120,
): WindowLauncher & { seen: string[][] } {
  const seen: string[][] = [];
  return {
    seen,
    launch(args, _env, teePath) {
      seen.push([...args]);
      let timer: NodeJS.Timeout | null = null;
      void (async (): Promise<void> => {
        const text = await readFile(FIXTURE, 'utf8');
        await new Promise((r) => setTimeout(r, startDelayMs));
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

function agentIn(workDir: string, launcher: WindowLauncher, keep = false): ReturnType<typeof createVisibleAgent> {
  return createVisibleAgent({
    workDir,
    title: 'Claude Code headless',
    geometry: { cols: 110, rows: 32, x: 20, y: 20, cwd: 'C:/repo' },
    launcher,
    pollMs: 5,
    keepFiles: keep,
  });
}

async function collect(
  sessionId: string | null = null,
  launcher = replayLauncher(),
): Promise<{ messages: AgentMessage[]; dir: string; launcher: ReturnType<typeof replayLauncher>; agent: ReturnType<typeof createVisibleAgent> }> {
  const dir = await mkdtemp(join(tmpdir(), 'tomato-visible-'));
  const agent = agentIn(dir, launcher);
  const messages: AgentMessage[] = [];
  for await (const msg of agent.query('A ripe tomato was detected: tomato #1.', options(sessionId))) messages.push(msg);
  return { messages, dir, launcher, agent };
}

describe('createVisibleAgent', () => {
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
    const { agent } = await collect();
    expect(await readFile(join(agent.sessionDir, 'wake.txt'), 'utf8')).toBe('A ripe tomato was detected: tomato #1.');
    const mcp: unknown = JSON.parse(await readFile(join(agent.sessionDir, 'mcp.json'), 'utf8'));
    expect(mcp).toEqual({ mcpServers: { robot: { type: 'http', url: 'http://localhost:7331/mcp' } } });
  });

  it('écrit le prompt système du SDK dans le fichier que PowerShell lit', async () => {
    const { agent } = await collect();
    expect(await readFile(join(agent.sessionDir, 'system.md'), 'utf8')).toContain('You are the control agent.');
  });

  it('ouvre une fenêtre Windows Terminal qui joue le script de lancement de l’épisode', async () => {
    const { launcher, agent } = await collect();
    const args = launcher.seen[0] ?? [];
    expect(args.slice(0, 2)).toEqual(['-w', 'new']);
    expect(args[args.length - 2]).toBe('-File');
    const scriptPath = args[args.length - 1] ?? '';
    expect(scriptPath).toBe(join(agent.sessionDir, 'launch-1.ps1'));
    const script = await readFile(scriptPath, 'utf8');
    // Le titre se pose depuis l'interieur : `wt.exe --title` ne marche pas sur cette version.
    expect(script).toContain("$Host.UI.RawUI.WindowTitle = 'Claude Code headless'");
    expect(script).toContain('claude -p ');
    expect(script).toContain('--output-format stream-json');
    expect(script).toContain('Tee-Object -FilePath');
  });

  it('reprend la session de l’épisode précédent quand le SDK le ferait', async () => {
    const { launcher } = await collect('ep-session-1');
    const scriptPath = launcher.seen[0]?.[launcher.seen[0].length - 1] ?? '';
    expect(await readFile(scriptPath, 'utf8')).toContain("--resume 'ep-session-1'");
  });

  it('coupe le flux quand l’épisode est interrompu, sans attendre le result', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tomato-visible-'));
    const abort = new AbortController();
    const agent = agentIn(dir, replayLauncher(61, 'utf16le', 1));
    const opts = { ...options(null), abortController: abort };
    const seen: AgentMessage[] = [];
    for await (const msg of agent.query('wake', opts)) {
      seen.push(msg);
      if (seen.length === 3) abort.abort();
    }
    expect(seen.length).toBeLessThan(27);
    expect(seen[seen.length - 1]).not.toMatchObject({ type: 'result' });
  });
});

describe('createVisibleAgent, fichiers de session', () => {
  /*
   * Le bug : le compteur d'épisode repart à 1 à chaque démarrage du serveur, et le fichier tee
   * n'était pas effacé. `Tee-Object` ne tronque le sien qu'une seconde plus tard, quand la fenêtre
   * a fini de s'ouvrir : entre-temps, le serveur lisait **l'épisode du serveur précédent** et
   * concluait en quelques millisecondes, avec son `result`, son coût et sa session.
   */
  it('ne relit jamais le fichier tee d’un serveur précédent', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tomato-visible-'));
    const stale = [
      '{"type":"system","subtype":"init","session_id":"STALE-SESSION","model":"m","mcp_servers":[{"name":"robot","status":"connected"}],"apiKeySource":"none"}',
      '{"type":"result","subtype":"success","is_error":false,"total_cost_usd":9.99,"duration_ms":1,"num_turns":1,"session_id":"STALE-SESSION"}',
      '',
    ].join('\n');
    // Le dossier d'un serveur précédent, avec son épisode 1 complet, au même endroit.
    const agent = agentIn(dir, replayLauncher());
    await mkdir(agent.sessionDir, { recursive: true });
    await writeFile(join(agent.sessionDir, 'episode-1.jsonl'), stale, 'utf8');

    const seen: AgentMessage[] = [];
    for await (const msg of agent.query('wake', options(null))) seen.push(msg);

    const ids = seen.flatMap((m) => (m.type === 'result' ? [m.session_id] : []));
    expect(ids).toEqual(['ep-session-1']);
    expect(seen.filter((m) => m.type === 'assistant')).toHaveLength(12);
  });

  it('range les fichiers dans un sous-dossier daté, un par démarrage de serveur', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tomato-visible-'));
    const first = agentIn(dir, replayLauncher());
    const second = agentIn(dir, replayLauncher());
    expect(first.sessionDir).not.toBe(second.sessionDir);
    expect(first.sessionDir.startsWith(dir)).toBe(true);
    expect(first.sessionDir).toMatch(/session-\d{4}-\d{2}-\d{2}T/);
  });

  it('efface son dossier à l’arrêt : prompts, configuration MCP et flux ne traînent pas', async () => {
    const { agent } = await collect();
    expect(existsSync(agent.sessionDir)).toBe(true);
    await agent.dispose();
    expect(existsSync(agent.sessionDir)).toBe(false);
  });

  it('garde le dossier quand on le demande, pour relire un épisode après coup', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tomato-visible-'));
    const agent = agentIn(dir, replayLauncher(), true);
    for await (const _ of agent.query('wake', options(null))) void _;
    await agent.dispose();
    expect(existsSync(agent.sessionDir)).toBe(true);
  });
});

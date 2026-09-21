/**
 * Le flux d'un épisode joué par **Claude Code headless dans une fenêtre visible**, sous la même
 * forme que celui du SDK.
 *
 * C'est un `QueryFn` : `createAgentRunner` s'en sert à la place de `sdkQuery` et tout le reste du
 * serveur ne change pas d'un caractère — cycle d'épisode, reprise de session, `agent_raw`, coût lu
 * dans le message `result`, `episode_end`, journal. La seule différence est le chemin que prennent
 * les messages : au lieu d'un tuyau invisible, ils passent par l'écran, puis par le fichier
 * `.jsonl` que `Tee-Object` écrit à côté.
 *
 * Ce que la fenêtre montre est donc exactement ce que le serveur lit. Rien n'y est écrit par nous.
 */
import { mkdir, open, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Options } from '@anthropic-ai/claude-agent-sdk';
import { silentLogger, type Logger } from '../log';
import { createTeeReader } from './teeStream';
import type { AgentMessage, QueryFn } from './types';
import {
  mcpConfigJson,
  terminalArgs,
  visibleEnv,
  launchScript,
  type VisibleCommandInput,
  type WindowGeometry,
} from './visibleCommand';

/** Fenêtre ouverte pour un épisode ; `close()` la referme. */
export interface OpenWindow {
  close(): Promise<void>;
}

/** Ouvre la fenêtre du terminal. Injectable : les tests rejouent un flux au lieu de lancer `wt.exe`. */
export interface WindowLauncher {
  launch(args: readonly string[], env: Record<string, string | undefined>, teePath: string): OpenWindow;
}

export interface VisibleQueryDeps {
  /** Dossier de travail de l'épisode : prompts, configuration MCP, fichier `.jsonl`. */
  readonly workDir: string;
  readonly title: string;
  readonly geometry: WindowGeometry;
  readonly launcher: WindowLauncher;
  /** Période de relecture du fichier `.jsonl` ; 150 ms en vrai, quelques ms dans les tests. */
  readonly pollMs?: number;
  readonly log?: Logger;
}

const DEFAULT_POLL_MS = 150;

/** URL du serveur MCP du robot, telle que `buildQueryOptions` l'a posée dans les options. */
function mcpUrlOf(options: Options): string {
  const servers = options.mcpServers;
  if (servers === undefined) return '';
  for (const server of Object.values(servers)) {
    if (typeof server === 'object' && server !== null && 'url' in server) return String(server.url);
  }
  return '';
}

function sleep(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms));
}

/**
 * Suit le fichier `.jsonl` pendant qu'il s'écrit et rend chaque message dès qu'il est complet.
 * Le fichier peut ne pas exister tout de suite : la fenêtre met une seconde à démarrer.
 */
async function* followTee(path: string, pollMs: number, done: () => boolean): AsyncGenerator<AgentMessage> {
  const reader = createTeeReader();
  let at = 0;
  for (;;) {
    let handle;
    try {
      handle = await open(path, 'r');
    } catch {
      if (done()) return;
      await sleep(pollMs);
      continue;
    }
    try {
      const { size } = await handle.stat();
      if (size > at) {
        const buffer = Buffer.alloc(size - at);
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, at);
        at += bytesRead;
        for (const msg of reader.push(buffer.subarray(0, bytesRead))) yield msg;
      }
    } finally {
      await handle.close();
    }
    if (done()) {
      for (const msg of reader.flush()) yield msg;
      return;
    }
    await sleep(pollMs);
  }
}

/**
 * `QueryFn` de l'agent headless visible. Le message de réveil, le prompt système et la
 * configuration MCP sont écrits dans `workDir` : PowerShell les lit au lancement, la ligne de
 * commande reste courte, et le contenu envoyé est **exactement** celui que le SDK enverrait.
 */
export function createVisibleQuery(deps: VisibleQueryDeps): QueryFn {
  const pollMs = deps.pollMs ?? DEFAULT_POLL_MS;
  const log = deps.log ?? silentLogger;
  let episode = 0;

  return async function* visibleQuery(prompt: string, options: Options): AsyncIterable<AgentMessage> {
    episode += 1;
    const dir = deps.workDir;
    await mkdir(dir, { recursive: true });
    const input: VisibleCommandInput = {
      mcpUrl: mcpUrlOf(options),
      model: options.model ?? 'opus',
      mcpConfigPath: join(dir, 'mcp.json'),
      systemPromptPath: join(dir, 'system.md'),
      wakePromptPath: join(dir, 'wake.txt'),
      teePath: join(dir, `episode-${episode}.jsonl`),
      sessionId: options.resume ?? null,
    };
    await writeFile(input.wakePromptPath, prompt, 'utf8');
    await writeFile(input.mcpConfigPath, mcpConfigJson(input.mcpUrl), 'utf8');
    await writeFile(input.systemPromptPath, typeof options.systemPrompt === 'string' ? options.systemPrompt : '', 'utf8');

    // Le script de lancement est ecrit avec nomenclature : Windows PowerShell 5.1 lit un .ps1
    // sans elle en ANSI, et un chemin accentue y deviendrait illisible.
    const scriptPath = join(dir, `launch-${episode}.ps1`);
    await writeFile(scriptPath, `﻿${launchScript(deps.title, input)}`, 'utf8');
    const args = terminalArgs(deps.geometry, scriptPath);
    log(`agent visible : fenêtre « ${deps.title} », flux suivi dans ${input.teePath}`);
    const window = deps.launcher.launch(args, visibleEnv(process.env), input.teePath);

    // L'épisode est fini quand le message `result` est passé — c'est lui qui porte le coût — ou
    // quand la prise est coupée. La fenêtre, elle, reste ouverte : `-NoExit`.
    let finished = false;
    const aborted = (): boolean => options.abortController?.signal.aborted === true;
    try {
      for await (const msg of followTee(input.teePath, pollMs, () => finished || aborted())) {
        yield msg;
        if (msg.type === 'result') finished = true;
        if (aborted()) return;
      }
    } finally {
      await window.close();
    }
  };
}

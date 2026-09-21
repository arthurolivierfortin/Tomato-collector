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
import { mkdir, open, rm, writeFile } from 'node:fs/promises';
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

/** Pourquoi la fenêtre est relâchée : l'épisode est allé au bout, ou il a été coupé. */
export type CloseReason = 'finished' | 'aborted';

/**
 * Fenêtre ouverte pour un épisode. `close('finished')` ne fait rien : `claude` s'est arrêté seul
 * après son `result`, et la fenêtre doit rester ouverte jusqu'à la fin de la prise (`-NoExit`).
 * `close('aborted')` tue le processus : sans cela, un `claude` coupé continue d'appeler un serveur
 * MCP arrêté et de dépenser.
 */
export interface OpenWindow {
  close(reason: CloseReason): Promise<void>;
}

/** Ouvre la fenêtre du terminal. Injectable : les tests rejouent un flux au lieu de lancer `wt.exe`. */
export interface WindowLauncher {
  launch(args: readonly string[], env: Record<string, string | undefined>, teePath: string): OpenWindow;
}

export interface VisibleQueryDeps {
  /** Dossier de travail : chaque démarrage de serveur y crée son propre sous-dossier daté. */
  readonly workDir: string;
  readonly title: string;
  readonly geometry: WindowGeometry;
  readonly launcher: WindowLauncher;
  /** Période de relecture du fichier `.jsonl` ; 150 ms en vrai, quelques ms dans les tests. */
  readonly pollMs?: number;
  /** Garde le dossier de session après l'arrêt, pour relire un épisode (`TOMATO_VISIBLE_KEEP`). */
  readonly keepFiles?: boolean;
  /** Délai laissé au premier message `init` ; au-delà, l'épisode est abandonné. */
  readonly initTimeoutMs?: number;
  /** Délai sans une seule ligne nouvelle ; au-delà, l'épisode est abandonné. */
  readonly idleTimeoutMs?: number;
  readonly log?: Logger;
}

/** Ce qu'un serveur en mode visible tient pendant toute sa vie. */
export interface VisibleAgent {
  /** Le flux d'un épisode, à injecter dans `createAgentRunner` à la place de `sdkQuery`. */
  readonly query: QueryFn;
  /** Sous-dossier de ce démarrage de serveur : prompts, configuration MCP, scripts, flux. */
  readonly sessionDir: string;
  /** Efface le dossier de session, sauf si `keepFiles`. */
  dispose(): Promise<void>;
}

const DEFAULT_POLL_MS = 150;

/**
 * Délai laissé au premier message du flux. La fenêtre s'ouvre, `claude` démarre, ses crochets
 * tournent, le serveur MCP se connecte — et, au premier lancement dans un dossier, le propriétaire
 * répond à l'invite de confiance. Trois minutes, comme l'attente de la fenêtre côté pilote.
 */
const DEFAULT_INIT_TIMEOUT_MS = 180_000;

/**
 * Délai sans une seule ligne nouvelle une fois le flux commencé. Un `get_views` sur trois caméras
 * prend quelques secondes, un tour de modèle quelques dizaines ; deux minutes de silence veulent
 * dire que `claude` est mort ou que la fenêtre a été fermée à la main. Sans ce garde-fou, le
 * runner reste `busy` pour toujours et les tomates suivantes s'empilent dans la file.
 */
const DEFAULT_IDLE_TIMEOUT_MS = 120_000;

/** Combien de sessions ce processus a ouvertes : deux dans la même milliseconde auraient sinon le même nom. */
let sessionsOpened = 0;

/** `2026-09-21T12-34-56-789Z-4812-1` : l'instant, le processus, et le rang dans ce processus. */
function sessionStamp(): string {
  sessionsOpened += 1;
  return `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}-${sessionsOpened}`;
}

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
interface FollowLimits {
  readonly initTimeoutMs: number;
  readonly idleTimeoutMs: number;
}

async function* followTee(
  path: string,
  pollMs: number,
  done: () => boolean,
  limits: FollowLimits,
): AsyncGenerator<AgentMessage> {
  const reader = createTeeReader();
  let at = 0;
  let lastLineAt = Date.now();
  let started = false;
  for (;;) {
    const waited = Date.now() - lastLineAt;
    if (!started && waited > limits.initTimeoutMs) {
      throw new Error(`la fenêtre n'a livré aucun message en ${Math.round(limits.initTimeoutMs / 1000)} s : démarrage de claude en échec, ou init jamais reçu`);
    }
    if (started && waited > limits.idleTimeoutMs) {
      throw new Error(`le flux de la fenêtre est muet depuis ${Math.round(limits.idleTimeoutMs / 1000)} s : claude arrêté, ou fenêtre fermée`);
    }
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
        for (const msg of reader.push(buffer.subarray(0, bytesRead))) {
          lastLineAt = Date.now();
          started = true;
          yield msg;
        }
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
export function createVisibleAgent(deps: VisibleQueryDeps): VisibleAgent {
  const pollMs = deps.pollMs ?? DEFAULT_POLL_MS;
  const limits: FollowLimits = {
    initTimeoutMs: deps.initTimeoutMs ?? DEFAULT_INIT_TIMEOUT_MS,
    idleTimeoutMs: deps.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS,
  };
  const log = deps.log ?? silentLogger;
  let episode = 0;
  /*
   * Un sous-dossier par démarrage de serveur, daté. Deux raisons, la seconde étant un bug vécu :
   * les prompts et les flux d'une session ne traînent pas après elle, et surtout le compteur
   * d'épisode — qui repart à 1 à chaque serveur — ne peut plus désigner le `episode-1.jsonl` du
   * serveur précédent. `Tee-Object` ne tronque le sien qu'une seconde plus tard, le temps que la
   * fenêtre s'ouvre : entre-temps, le serveur lisait l'épisode d'avant et le croyait terminé.
   */
  const sessionDir = join(deps.workDir, `session-${sessionStamp()}`);

  const query: QueryFn = async function* visibleQuery(prompt: string, options: Options): AsyncIterable<AgentMessage> {
    episode += 1;
    const dir = sessionDir;
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
    // Ceinture et bretelles : même dans un dossier neuf, on ne lit jamais un fichier qu'on n'a
    // pas vu naître. `Tee-Object` le recréera.
    await rm(input.teePath, { force: true });
    await writeFile(input.wakePromptPath, prompt, 'utf8');
    await writeFile(input.mcpConfigPath, mcpConfigJson(input.mcpUrl), 'utf8');
    await writeFile(input.systemPromptPath, typeof options.systemPrompt === 'string' ? options.systemPrompt : '', 'utf8');

    // Le script de lancement est ecrit avec nomenclature : Windows PowerShell 5.1 lit un .ps1
    // sans elle en ANSI, et un chemin accentue y deviendrait illisible.
    const scriptPath = join(dir, `launch-${episode}.ps1`);
    await writeFile(scriptPath, `\uFEFF${launchScript(deps.title, input)}`, 'utf8');
    const args = terminalArgs(deps.geometry, scriptPath);
    log(`agent visible : fenêtre « ${deps.title} », flux suivi dans ${input.teePath}`);
    const window = deps.launcher.launch(args, visibleEnv(process.env), input.teePath);

    // L'épisode est fini quand le message `result` est passé — c'est lui qui porte le coût — ou
    // quand la prise est coupée. La fenêtre, elle, reste ouverte : `-NoExit`.
    let finished = false;
    const aborted = (): boolean => options.abortController?.signal.aborted === true;
    try {
      for await (const msg of followTee(input.teePath, pollMs, () => finished || aborted(), limits)) {
        yield msg;
        if (msg.type === 'result') finished = true;
        if (aborted()) return;
      }
    } finally {
      // `finished` : `claude` s'est arrêté seul après son `result`, la fenêtre reste à l'image
      // jusqu'à la fin de la prise. Sinon il tourne encore : on le coupe, il dépense.
      await window.close(finished ? 'finished' : 'aborted');
    }
  };

  return {
    query,
    sessionDir,
    async dispose() {
      if (deps.keepFiles === true) {
        log(`agent visible : dossier de session gardé (${sessionDir})`);
        return;
      }
      /*
       * La fenêtre reste ouverte après l'épisode (`-NoExit`) et son `Tee-Object` garde le fichier
       * `.jsonl` ouvert sans partage : `rm` échoue alors en EBUSY. Relevé sur une vraie session.
       * Un dossier qui survit quelques minutes de plus est sans conséquence ; un serveur qui
       * refuse de s'arrêter en a une.
       */
      try {
        await rm(sessionDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      } catch (e) {
        log(`agent visible : dossier de session non effacé, un fichier est encore ouvert (${String(e)})`);
      }
    },
  };
}

/**
 * La commande de l'agent **headless visible** : le même Claude Code que le SDK lance dans un tuyau
 * caché, lancé cette fois dans une vraie fenêtre Windows Terminal, avec sa sortie brute à l'écran.
 *
 * Ce que la fenêtre montre est **la sortie du binaire**, pas une mise en forme : `--output-format
 * stream-json --verbose` écrit une ligne JSON par message, et c'est exactement ce qui défile. Le
 * serveur, lui, suit le fichier écrit par `Tee-Object` et le fait passer par le **même chemin** que
 * le flux SDK (`streamToDashboard`), donc le dashboard, le journal et le coût ne changent pas.
 *
 * Les deux prompts sont lus **dans des fichiers** par PowerShell, `(Get-Content -Raw …)` : le
 * prompt système fait 15 ko et la ligne de commande Windows est plafonnée à 32 767 caractères
 * (garde reprise du fournisseur Claude Code de Maestro,
 * `C:\Meastro\llm-provider\dotnet\src\LLMProvider.ClaudeCodeProvider\ClaudeCodeLLMProvider.cs`).
 * La commande tient ainsi sur une ligne, et rien ne dépend d'un échappement à trois niveaux
 * (wt.exe → powershell → claude).
 *
 * Écarts assumés avec `buildQueryOptions`, et pourquoi :
 *
 * - `maxTurns` n'a pas d'équivalent dans `claude --help` (2.1.278) ; c'est la limite de 40 appels
 *   d'outils du serveur MCP qui borne l'épisode, et le prompt système l'annonce à l'agent ;
 * - `includePartialMessages` est laissé de côté : il n'alimente que la console du serveur, et il
 *   noierait la fenêtre filmée sous des fragments de texte d'un mot ;
 * - `--no-chrome` n'a pas d'équivalent SDK : Claude in Chrome est un serveur MCP **intégré**, que
 *   `--strict-mcp-config` ne couvre pas (relevé dans le journal `claude --debug mcp`). La session
 *   filmée n'a que les neuf outils du robot, comme le dit le prompt système.
 */
import { ROBOT_MCP_NAME } from './streamToDashboard';

/** Valeur de `MAX_MCP_OUTPUT_TOKENS` : trois PNG de vues dépassent le défaut de 25 000 tokens. */
export { MAX_MCP_OUTPUT_TOKENS } from './queryOptions';
import { MAX_MCP_OUTPUT_TOKENS as MCP_TOKENS } from './queryOptions';

export interface VisibleCommandInput {
  /** HTTP du serveur MCP de cette session, `http://localhost:<port>/mcp`. */
  readonly mcpUrl: string;
  readonly model: string;
  /** Fichier `--mcp-config` écrit par le runner. */
  readonly mcpConfigPath: string;
  /** `packages/server/prompts/system.md`, lu par PowerShell. */
  readonly systemPromptPath: string;
  /** Fichier où le runner a écrit le message de réveil de cet épisode. */
  readonly wakePromptPath: string;
  /** Fichier `.jsonl` écrit par `Tee-Object` et suivi par le serveur. */
  readonly teePath: string;
  /** Session à reprendre entre deux épisodes, comme `resume` côté SDK. */
  readonly sessionId: string | null;
}

/** Une chaîne littérale PowerShell : entre apostrophes, apostrophes internes doublées. */
export function psLiteral(text: string): string {
  return `'${text.replace(/'/g, "''")}'`;
}

/** Contenu d'un fichier, lu par PowerShell au moment du lancement. */
function fromFile(path: string): string {
  return `(Get-Content -Raw ${psLiteral(path)})`;
}

/** Fichier `--mcp-config` : le robot, en HTTP. Le nom **doit** être celui du SDK (`robot`) : c'est
 * lui qui donne aux outils leur préfixe `mcp__robot__`, que `streamToDashboard` reconnaît. */
export function mcpConfigJson(mcpUrl: string): string {
  return JSON.stringify({ mcpServers: { [ROBOT_MCP_NAME]: { type: 'http', url: mcpUrl } } }, null, 2);
}

/**
 * Arguments de `claude`, déjà cités pour PowerShell : la liste est assemblée telle quelle dans la
 * commande. Chaque élément fait écho à une option de `buildQueryOptions`.
 */
export function visibleClaudeArgs(input: VisibleCommandInput): string[] {
  return [
    '-p',
    fromFile(input.wakePromptPath),
    '--output-format',
    'stream-json',
    '--verbose',
    '--mcp-config',
    psLiteral(input.mcpConfigPath),
    '--strict-mcp-config',
    '--allowedTools',
    psLiteral(`mcp__${ROBOT_MCP_NAME}__*`),
    '--permission-mode',
    'dontAsk',
    '--tools',
    "''",
    '--setting-sources',
    "''",
    '--no-chrome',
    '--model',
    input.model,
    ...(input.sessionId === null ? [] : ['--resume', psLiteral(input.sessionId)]),
    '--system-prompt',
    fromFile(input.systemPromptPath),
  ];
}

/**
 * La commande jouée dans la fenêtre : `claude … | Tee-Object -FilePath <jsonl>`. Rien devant,
 * rien derrière — ce qui défile est la sortie du binaire.
 */
export function teeShellCommand(input: VisibleCommandInput): string {
  return `claude ${visibleClaudeArgs(input).join(' ')} | Tee-Object -FilePath ${psLiteral(input.teePath)}`;
}

export interface WindowGeometry {
  readonly cols: number;
  readonly rows: number;
  /** Coin haut gauche voulu, en points logiques : c'est l'unité de `wt --pos`. */
  readonly x: number;
  readonly y: number;
}

/**
 * La commande jouée dans la fenêtre, précédée de la pose du titre.
 *
 * `wt.exe --title` est sans effet sur la version installée ici : avec cette option, la fenêtre ne
 * s'ouvre pas du tout — mesuré aux deux positions admises (avant et après `new-tab`), alors que la
 * même ligne sans `--title` ouvre bien la fenêtre. Le titre se pose donc depuis l'intérieur. C'est
 * une **affectation**, elle n'écrit rien à l'écran ; et c'est par ce titre que le pilote trouve la
 * fenêtre à filmer.
 */
export function windowCommand(title: string, input: VisibleCommandInput): string {
  return `$Host.UI.RawUI.WindowTitle = ${psLiteral(title)}; ${teeShellCommand(input)}`;
}

/**
 * Arguments de `wt.exe`. `-w new` force une **fenêtre** neuve plutôt qu'un onglet dans une fenêtre
 * existante ; `--size` et `--pos` la dimensionnent et la placent (colonnes/lignes, et points
 * logiques) ; `-NoExit` la laisse ouverte après la fin de l'épisode, jusqu'à la fin de la prise.
 *
 * `powershell`, pas `pwsh` : PowerShell 7 n'est pas installé sur cette machine.
 */
export function terminalArgs(geometry: WindowGeometry, command: string): string[] {
  return [
    '-w',
    'new',
    '--size',
    `${geometry.cols},${geometry.rows}`,
    '--pos',
    `${geometry.x},${geometry.y}`,
    'powershell',
    '-NoProfile',
    '-NoExit',
    '-Command',
    command,
  ];
}

/**
 * Marqueurs qu'une session Claude Code pose dans l'environnement de ses fils. `CLAUDECODE` en
 * premier : sans son retrait, un `claude` lancé depuis une session Claude Code ne démarre pas
 * (leçon de `ClaudeCodeLLMProvider.RunProcessAsync`, Maestro). Les autres ont été relevés **à
 * l'écran** : le CLI affichait « Transcript saving is off — inherited CLAUDE_CODE_CHILD_SESSION
 * marker » sur la dernière ligne de la fenêtre, donc dans le film.
 *
 * Liste nommée, jamais un préfixe : `CLAUDE_CODE_OAUTH_TOKEN` et `ANTHROPIC_API_KEY` portent
 * l'authentification du propriétaire et doivent passer intacts.
 */
export const NESTED_SESSION_VARS: readonly string[] = [
  'CLAUDECODE',
  'CLAUDE_CODE_CHILD_SESSION',
  'CLAUDE_CODE_SESSION_ID',
  'CLAUDE_CODE_SESSION_ATTENDED',
  'CLAUDE_CODE_ENTRYPOINT',
  'CLAUDE_CODE_EXECPATH',
  'CLAUDE_CODE_SSE_PORT',
  'CLAUDE_CODE_MESSAGING_SOCKET',
  'CLAUDE_CODE_MESSAGING_TOKEN',
  'CLAUDE_PID',
  'CLAUDE_EFFORT',
];

/** Environnement de la fenêtre : limite MCP relevée, marqueurs de session imbriquée retirés. */
export function visibleEnv(env: Readonly<Record<string, string | undefined>>): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = { ...env, MAX_MCP_OUTPUT_TOKENS: MCP_TOKENS };
  for (const name of NESTED_SESSION_VARS) delete out[name];
  return out;
}

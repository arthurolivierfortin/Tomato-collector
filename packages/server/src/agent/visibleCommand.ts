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

/**
 * Contenu d'un fichier, lu par PowerShell au moment du lancement.
 *
 * `-Encoding UTF8` n'est pas un détail de style : sans lui, Windows PowerShell 5.1 lit un fichier
 * UTF-8 **sans nomenclature** en ANSI. Mesuré sur « pitch -13.59° — occultée » : 29 caractères lus
 * en 33, le degré devenu deux caractères, le tiret cadratin trois. `prompts/system.md` a neuf
 * lignes non ASCII ; sans cette option, le prompt envoyé à l'agent n'est pas celui du SDK.
 */
function fromFile(path: string): string {
  return `(Get-Content -Raw -Encoding UTF8 ${psLiteral(path)})`;
}

/**
 * Fichier `--mcp-config` : le robot, en HTTP. Le nom **doit** être celui du SDK (`robot`) : c'est
 * lui qui donne aux outils leur préfixe `mcp__robot__`, que `streamToDashboard` reconnaît.
 *
 * Écart avec `buildQueryOptions` : `alwaysLoad: true` n'a pas d'équivalent dans le fichier de
 * configuration du CLI. Sans lui, les outils sont chargés à la connexion du serveur MCP, ce qui
 * revient au même ici — vérifié sur une vraie session : le message `init` liste les neuf outils
 * `mcp__robot__…` avant le premier tour du modèle.
 */
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
  /**
   * Dossier de départ de la fenêtre. Il décide de ce que Claude Code demande au démarrage :
   * dans un dossier déjà approuvé, aucune invite de confiance. Sans cette option, `wt` ouvre la
   * fenêtre dans le profil de l'utilisateur (relevé sur une vraie sortie).
   */
  readonly cwd: string;
}

/**
 * Le script PowerShell joué dans la fenêtre : trois affectations, puis la commande.
 *
 * Pourquoi un **fichier** et pas un `-Command` en ligne : Windows Terminal coupe sa ligne de
 * commande sur les `;`, qui y séparent ses propres sous-commandes. La commande `claude` en
 * contient — ne serait-ce que ceux qui séparent les affectations — et la fenêtre ne s'ouvrait pas du
 * tout (mesuré : aucune fenêtre, aucun message). Un fichier n'a ni `;`, ni guillemets, ni `$` à
 * faire traverser trois analyseurs.
 *
 * Le titre se pose depuis l'intérieur parce que `wt.exe --title` est sans effet sur la version
 * installée ici : avec cette option, la fenêtre ne s'ouvre pas non plus. C'est une **affectation**,
 * elle n'écrit rien à l'écran, et c'est par ce titre que le pilote trouve la fenêtre à filmer.
 *
 * Ces quatre lignes sont tout ce que la fenêtre exécute : ce qui y défile est la sortie de `claude`.
 */
export function launchScript(title: string, input: VisibleCommandInput): string {
  return [
    // La console d'un `powershell -NoProfile` est en IBM437 (mesuré) : la sortie UTF-8 de `claude`
    // y serait décodée en cp437 avant `Tee-Object`, et « 58.4° — occultée » arriverait dans le
    // fichier tee — donc dans le dashboard et dans le journal — en « 58.4┬░ ΓÇö occult├⌐e ».
    '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
    // Posée ici plutôt que dans l'environnement du `spawn` : celui-ci traverse powershell →
    // Start-Process → wt.exe, et `wt` peut déléguer à une instance déjà ouverte, dont
    // l'environnement est le sien. Les trois PNG de `get_views` dépassent le défaut de 25 000.
    `$env:MAX_MCP_OUTPUT_TOKENS = ${psLiteral(MCP_TOKENS)}`,
    `$Host.UI.RawUI.WindowTitle = ${psLiteral(title)}`,
    teeShellCommand(input),
    '',
  ].join('\n');
}

/**
 * Arguments de `wt.exe`. `-w new` force une **fenêtre** neuve plutôt qu'un onglet dans une fenêtre
 * existante ; `--size` et `--pos` la dimensionnent et la placent (colonnes/lignes, et points
 * logiques) ; `-NoExit` la laisse ouverte après la fin de l'épisode, jusqu'à la fin de la prise.
 *
 * `powershell`, pas `pwsh` : PowerShell 7 n'est pas installé sur cette machine.
 */
export function terminalArgs(geometry: WindowGeometry, scriptPath: string): string[] {
  return [
    '-w',
    'new',
    '--size',
    `${geometry.cols},${geometry.rows}`,
    '--pos',
    `${geometry.x},${geometry.y}`,
    '-d',
    geometry.cwd,
    'powershell',
    '-NoProfile',
    '-NoExit',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    scriptPath,
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

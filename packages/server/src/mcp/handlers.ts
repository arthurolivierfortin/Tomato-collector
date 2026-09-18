import { CAMERA_IDS, createDefaultWorld, MAX_TOOL_CALLS_PER_EPISODE, ToolSchemas, type ActionResult, type CameraId, type SimAction, type ToolInput, type ToolName, type ViewsResult, type WorldState } from '@tomato/shared';
import type { Hub } from '../hub/hub';
import type { SimBridge } from '../sim/simBridge';
import { outcomeForPhase } from '../state/rules';
import type { Session } from '../state/session';
import { actionResultText, compactJson, png, suggestedScissorsText, summarizeAction, text, viewHeader, type ContentBlock } from './format';

export interface ToolOutcome {
  ok: boolean;
  content: ContentBlock[];
  summary: string;
  /** Exécuté par le runner APRÈS la diffusion de `tool_call_result` (clôture d'épisode par `report`). */
  after?: () => void;
}

export type ToolHandler = (rawArgs: unknown) => Promise<ToolOutcome>;

export interface ToolDeps {
  sim: SimBridge;
  session: Session;
  hub: Hub;
}

export const NO_IMAGES_TEXT = 'not_available : simulation did not answer (aucune image) ; vérifie que la page sim est ouverte sur http://localhost:5173';
export const FALLING_TEXT = 'la tomate tombe encore : appelle get_status jusqu\'à l\'événement tomato_landed, puis report';

const failure = (summary: string, message: string): ToolOutcome => ({ ok: false, content: [text(message)], summary });

/** Retire les clés `undefined` (exactOptionalPropertyTypes : SimAction n'accepte pas `dx: undefined`). */
function definedNumbers<K extends string>(obj: Record<K, number | undefined>): Partial<Record<K, number>> {
  const out: Partial<Record<K, number>> = {};
  for (const k of Object.keys(obj) as K[]) {
    const v = obj[k];
    if (v !== undefined) out[k] = v;
  }
  return out;
}

function issuesText(error: { issues: { path: (string | number)[]; message: string }[] }): string {
  return error.issues.map((i) => `${i.path.length > 0 ? i.path.join('.') : '(racine)'} ${i.message}`).join(' ; ');
}

export function createToolHandlers(deps: ToolDeps): Record<ToolName, ToolHandler> {
  const known = (): WorldState => deps.sim.latestState() ?? createDefaultWorld(0);

  /** Valide les arguments avec le schéma partagé ; une erreur devient un texte « invalid_argument : … ». */
  function withArgs<N extends ToolName>(name: N, run: (args: ToolInput<N>) => Promise<ToolOutcome>): ToolHandler {
    return (rawArgs) => {
      const parsed = ToolSchemas[name].safeParse(rawArgs ?? {});
      if (!parsed.success) return Promise.resolve(failure(`${name} : invalid_argument`, `invalid_argument : ${issuesText(parsed.error)}`));
      return run(parsed.data as ToolInput<N>);
    };
  }

  async function applyAction(tool: ToolName, action: SimAction, focus: (s: WorldState) => unknown): Promise<{ r: ActionResult; outcome: ToolOutcome }> {
    const r = await deps.sim.apply(action);
    return { r, outcome: { ok: r.ok, content: [text(actionResultText(r, r.ok ? focus(r.state) : undefined))], summary: summarizeAction(tool, r) } };
  }

  async function views(cameras: CameraId[]): Promise<{ result: ViewsResult; blocks: ContentBlock[] } | null> {
    const raw = await deps.sim.renderViews(cameras);
    if (raw.images.length === 0) return null;
    const result: ViewsResult = { images: raw.images, json: { ...raw.json, phase: deps.session.get().phase } };
    deps.hub.broadcast({ type: 'views', episodeId: deps.session.get().episodeId, result });
    deps.hub.broadcast({ type: 'block_activity', from: 'simulation', to: 'server', label: `vues ${cameras.join(', ')}` });
    return { result, blocks: result.images.flatMap((img) => [text(viewHeader(img, result.json.cameras[img.camera])), png(img)]) };
  }

  /** Angles de lames prêts à l'emploi pour la tige cible : l'agent n'a plus à les redériver des images. */
  const suggestion = (result: ViewsResult): ContentBlock[] => {
    const line = suggestedScissorsText(result.json);
    return line === null ? [] : [text(line)];
  };

  return {
    get_status: withArgs('get_status', () => {
      const s = deps.session.get();
      const w = known();
      const status = {
        phase: s.phase, episodeId: s.episodeId, targetTomatoId: s.targetTomatoId, simConnected: deps.hub.simConnected(),
        simTimeS: w.simTimeS, toolCalls: { used: s.toolCallsThisEpisode, max: MAX_TOOL_CALLS_PER_EPISODE }, lastEvent: s.lastEvent,
        tomatoes: w.tomatoes.map((t) => ({ id: t.id, state: t.state, ripeness: t.ripeness, positionCm: t.positionCm, attached: t.attached, stem: t.stem })),
        scissors: w.scissors, basket: w.basket, cameras: w.cameras, limits: w.limits,
      };
      return Promise.resolve({ ok: true, content: [text(compactJson(status))], summary: `état : ${s.phase}, ${w.tomatoes.length} tomates` });
    }),
    get_views: withArgs('get_views', async (args) => {
      const cameras = args.cameras ?? [...CAMERA_IDS];
      const v = await views(cameras);
      if (v === null) return failure('vues : not_available', NO_IMAGES_TEXT);
      return { ok: true, content: [...v.blocks, text(compactJson(v.result.json)), ...suggestion(v.result)], summary: `vues : ${cameras.join(', ')}` };
    }),
    move_camera: withArgs('move_camera', async (args) => {
      const action: SimAction = { type: 'move_camera', camera: args.camera, ...definedNumbers({ dx: args.dx, dy: args.dy, dz: args.dz, yaw: args.yaw, tilt: args.tilt, zoom: args.zoom }) };
      const { r, outcome } = await applyAction('move_camera', action, (s) => s.cameras[args.camera]);
      if (!r.ok) return { ...outcome, summary: `caméra ${args.camera} : ${r.error}` };
      const v = await views([args.camera]);
      const pose = r.state.cameras[args.camera];
      const summary = `caméra ${args.camera} à ${compactJson(pose.positionCm)}, lacet ${pose.yawDeg}, tangage ${pose.tiltDeg}`;
      return { ok: true, content: [...outcome.content, ...(v === null ? [text(NO_IMAGES_TEXT)] : [...v.blocks, ...suggestion(v.result)])], summary };
    }),
    move_scissors: withArgs('move_scissors', async (args) => (await applyAction('move_scissors', { type: 'move_scissors', x: args.x, y: args.y, z: args.z, mode: args.mode }, (s) => s.scissors)).outcome),
    rotate_scissors: withArgs('rotate_scissors', async (args) => {
      const action: SimAction = { type: 'rotate_scissors', mode: args.mode, ...definedNumbers({ yaw: args.yaw, pitch: args.pitch, roll: args.roll }) };
      return (await applyAction('rotate_scissors', action, (s) => s.scissors)).outcome;
    }),
    open_scissors: withArgs('open_scissors', async () => (await applyAction('open_scissors', { type: 'open_scissors' }, (s) => ({ openingDeg: s.scissors.openingDeg }))).outcome),
    cut: withArgs('cut', async () => (await applyAction('cut', { type: 'cut' }, (s) => ({ targetTomatoId: s.targetTomatoId, scissors: s.scissors }))).outcome),
    move_basket: withArgs('move_basket', async (args) => (await applyAction('move_basket', { type: 'move_basket', x: args.x, y: args.y, mode: args.mode }, (s) => s.basket)).outcome),
    report: withArgs('report', (args) => {
      const s = deps.session.get();
      if (s.episodeId === null) return Promise.resolve({ ok: true, content: [text('aucun épisode en cours (pilotage manuel) : rien à clore')], summary: 'rapport : aucun épisode' });
      if (s.phase === 'falling') return Promise.resolve(failure('rapport : chute en cours', FALLING_TEXT));
      const actual = outcomeForPhase(s.phase);
      const claim = actual === args.outcome ? '' : ` (déclaré ${args.outcome})`;
      return Promise.resolve({
        ok: true,
        content: [text(`épisode ${s.episodeId} clos : ${actual}${claim} ; total ${s.harvested} récoltée(s), ${s.missed} ratée(s)`)],
        summary: `rapport : ${actual}${claim}`,
        after: () => deps.session.endEpisode(args.outcome, args.note),
      });
    }),
  };
}

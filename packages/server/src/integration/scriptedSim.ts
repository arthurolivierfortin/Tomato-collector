import { fail, ok, type ActionResult, type SimAction, type SimEvent, type SimToServer, type WorldState } from '@tomato/shared';
import { WebSocket } from 'ws';
import { viewsPayloadOf } from '../sim/viewsFallback';

/** PNG 1×1 valide (signature iVBOR…), suffisant pour un bloc image. */
export const TINY_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
/** Tolérance de coupe de la spec (0,6 cm). */
export const CUT_TOLERANCE_CM = 0.6;
/** Demi-côté du panier 20×20. */
const HALF_BASKET_CM = 10;
const LANDING_DELAY_MS = 10;

const dist = (a: readonly number[], b: readonly number[]): number => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

/** Réducteur scripté : panier et ciseaux téléportés, coupe réussie si le point de coupe est sur la tige cible. */
export function reduceScripted(world: WorldState, action: SimAction): ActionResult {
  switch (action.type) {
    case 'set_target':
      return ok({ ...world, targetTomatoId: action.tomatoId }, `target ${action.tomatoId ?? 'none'}`);
    case 'move_basket': {
      const [cx, cy, cz] = world.basket.centerCm;
      const x = action.mode === 'absolute' ? action.x : cx + action.x;
      const y = action.mode === 'absolute' ? action.y : cy + action.y;
      return ok({ ...world, basket: { ...world.basket, centerCm: [x, y, cz] } }, 'basket moved');
    }
    case 'move_scissors': {
      const [x0, y0, z0] = world.scissors.cutPointCm;
      const p = action.mode === 'absolute' ? ([action.x, action.y, action.z] as const) : ([x0 + action.x, y0 + action.y, z0 + action.z] as const);
      return ok({ ...world, scissors: { ...world.scissors, cutPointCm: p } }, 'scissors moved');
    }
    case 'rotate_scissors':
      return ok(world, 'scissors rotated');
    case 'open_scissors':
      return ok({ ...world, scissors: { ...world.scissors, openingDeg: 30 } }, 'scissors open');
    case 'cut': {
      const target = world.tomatoes.find((t) => t.id === world.targetTomatoId && t.attached);
      if (!target) return fail(world, 'nothing_between_blades', 'no attached target stem');
      const d = dist(world.scissors.cutPointCm, target.stem.toCm);
      if (d > CUT_TOLERANCE_CM) return fail(world, 'misaligned', 'cut point is off the stem', { distanceCm: Math.round(d * 10) / 10, angleDeg: 90 });
      return ok({ ...world, tomatoes: world.tomatoes.map((t) => (t.id === target.id ? { ...t, attached: false } : t)) }, 'stem_cut');
    }
    default:
      return fail(world, 'not_available', `scripted sim does not handle ${action.type}`);
  }
}

/** La tomate coupée tombe à la verticale : dans le panier si son XY est dans le rectangle 20×20. */
export function landsInBasket(world: WorldState, tomatoId: number): boolean {
  const t = world.tomatoes.find((x) => x.id === tomatoId);
  if (!t) return false;
  const [bx, by] = world.basket.centerCm;
  return Math.abs(t.positionCm[0] - bx) <= HALF_BASKET_CM && Math.abs(t.positionCm[1] - by) <= HALF_BASKET_CM;
}

export interface ScriptedSim {
  world(): WorldState;
  emit(event: SimEvent): void;
  close(): Promise<void>;
}

/** Faux client sim connecté au hub par un vrai WebSocket : hello, état, réponses scriptées, atterrissage après une coupe. */
export function connectScriptedSim(port: number, initial: WorldState): Promise<ScriptedSim> {
  let world = initial;
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const send = (m: SimToServer): void => ws.send(JSON.stringify(m));
  ws.on('message', (data) => {
    const m = JSON.parse(String(data)) as { type: string; requestId: string; action?: SimAction; cameras?: ('top' | 'front' | 'side')[] };
    if (m.type === 'apply_action' && m.action) {
      const result = reduceScripted(world, m.action);
      world = result.state;
      send({ type: 'action_result', requestId: m.requestId, result });
      send({ type: 'state', state: world });
      if (m.action.type === 'cut' && result.ok && world.targetTomatoId !== null) {
        const tomatoId = world.targetTomatoId;
        setTimeout(() => send({ type: 'sim_event', event: { type: 'tomato_landed', tomatoId, inBasket: landsInBasket(world, tomatoId) } }), LANDING_DELAY_MS);
      }
    } else if (m.type === 'render_views' && m.cameras) {
      const images = m.cameras.map((camera) => ({ camera, pngBase64: TINY_PNG, widthPx: 800, heightPx: 800 }));
      send({ type: 'views_result', requestId: m.requestId, result: { images, json: viewsPayloadOf(world) } });
    }
  });
  return new Promise((resolve, reject) => {
    ws.once('error', reject);
    ws.once('open', () => {
      send({ type: 'hello', role: 'sim' });
      send({ type: 'state', state: world });
      resolve({
        world: () => world,
        emit: (event) => send({ type: 'sim_event', event }),
        close: () => new Promise((done) => {
          ws.once('close', () => done());
          ws.close();
        }),
      });
    });
  });
}

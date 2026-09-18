import type { BlockId, ServerToDashboard, ViewsResult, WorldState } from '@tomato/shared';
import type { ScriptEntry } from './bridgeTypes';

export const DEMO_EPISODE_ID = 'demo-0001';
const NOTE = 'Coupe réussie au deuxième essai après une collision.';

/**
 * Épisode scripté sans serveur ni Claude (test Playwright, vérification de fin d'étape) :
 * réveil, vues, panier, ciseaux avec une collision (erreur surlignée), coupe, chute, rapport.
 */
export function buildDemoScript(views: ViewsResult | null, state: WorldState): ScriptEntry[] {
  const tomatoId = state.tomatoes[0]?.id ?? 1;
  const ep = DEMO_EPISODE_ID;
  const at = (atMs: number, message: ServerToDashboard): ScriptEntry => ({ atMs, message });
  const call = (atMs: number, callId: string, tool: string, args: Record<string, unknown>): ScriptEntry =>
    at(atMs, { type: 'tool_call_start', episodeId: ep, callId, tool, args });
  const done = (atMs: number, callId: string, ok: boolean, summary: string, durationMs: number): ScriptEntry =>
    at(atMs, { type: 'tool_call_result', episodeId: ep, callId, ok, summary, durationMs });
  const flow = (atMs: number, from: BlockId, to: BlockId, label: string): ScriptEntry => at(atMs, { type: 'block_activity', from, to, label });
  const say = (atMs: number, text: string): ScriptEntry => at(atMs, { type: 'agent_text', episodeId: ep, text });
  const phase = (atMs: number, p: WorldState['phase'], reason: string): ScriptEntry => at(atMs, { type: 'phase', phase: p, reason });

  return [
    at(0, { type: 'snapshot', state, phase: 'idle', episodeId: null }),
    flow(200, 'perception', 'server', 'ripe_detected'),
    at(200, { type: 'sim_event', event: { type: 'ripe_detected', tomatoId, detector: 'hsv', confidence: 0.87 } }),
    phase(300, 'detected', `tomate ${tomatoId} mûre`),
    flow(400, 'server', 'agent', 'réveil'),
    at(400, { type: 'episode_start', episodeId: ep, tomatoId, sessionResumed: false }),
    say(700, `Une tomate mûre est signalée (id ${tomatoId}). Je regarde les trois vues avant de bouger.`),
    flow(900, 'agent', 'server', 'get_views'),
    call(900, 'c1', 'get_views', {}),
    ...(views ? [flow(1400, 'simulation', 'server', 'views'), at(1400, { type: 'views', episodeId: ep, result: views })] : []),
    done(1450, 'c1', true, 'trois vues rendues', 520),
    say(1700, "La verticale de chute tombe en X 12, Y −3 : je place le panier dessous, puis j'approche les ciseaux par pas de 5 cm."),
    flow(1900, 'agent', 'server', 'move_basket'),
    call(1900, 'c2', 'move_basket', { x: 12, y: -3, mode: 'absolute' }),
    done(2000, 'c2', true, 'panier en X 12, Y −3', 95),
    phase(2000, 'harvesting', 'premier mouvement'),
    call(2200, 'c3', 'move_scissors', { x: 8, y: -2, z: 41, mode: 'absolute' }),
    done(2400, 'c3', false, 'collision : trajet bloqué en X 9,5, Y −2, Z 44 (tomate 2)', 180),
    say(2600, 'Collision avec la tomate 2 : je passe par le dessus (Z 52) puis je redescends.'),
    call(2800, 'c4', 'move_scissors', { x: 8, y: -2, z: 52, mode: 'absolute' }),
    done(2950, 'c4', true, 'ciseaux en X 8, Y −2, Z 52', 140),
    call(3100, 'c5', 'rotate_scissors', { yaw: 35, mode: 'absolute' }),
    done(3200, 'c5', true, 'lacet 35°', 60),
    call(3300, 'c6', 'move_scissors', { x: 0, y: 0, z: -8, mode: 'relative' }),
    done(3450, 'c6', true, 'ciseaux en X 8, Y −2, Z 44', 130),
    call(3600, 'c7', 'open_scissors', {}),
    done(3650, 'c7', true, 'ouverture 60°', 40),
    call(3800, 'c8', 'cut', {}),
    phase(3900, 'cutting', 'cut'),
    done(4000, 'c8', true, 'stem_cut : distance 0,3 cm, angle 78°', 210),
    phase(4000, 'falling', 'tige coupée'),
    flow(4300, 'simulation', 'server', 'tomato_landed'),
    at(4300, { type: 'sim_event', event: { type: 'tomato_landed', tomatoId, inBasket: true } }),
    phase(4350, 'harvested', 'tomate dans le panier'),
    say(4500, 'La tomate est dans le panier. Je rapporte.'),
    call(4600, 'c9', 'report', { outcome: 'harvested', note: NOTE }),
    done(4700, 'c9', true, 'épisode clos', 30),
    flow(4800, 'server', 'dashboard', 'episode_end'),
    at(4800, { type: 'episode_end', episodeId: ep, outcome: 'harvested', note: NOTE, toolCalls: 9, costUsd: 0.0421, durationMs: 4400 }),
    phase(5800, 'idle', 'report'),
  ];
}

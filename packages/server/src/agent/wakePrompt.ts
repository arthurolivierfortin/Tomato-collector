import { MAX_TOOL_CALLS_PER_EPISODE } from '@tomato/shared';
import type { Vec3, WorldState } from '@tomato/shared';
import type { WakeEvent } from './types';

const fmt = (v: number): string => v.toFixed(1);
const xyz = (p: Vec3): string => `X ${fmt(p[0])}, Y ${fmt(p[1])}, Z ${fmt(p[2])}`;

/** Résumé textuel compact de l'état de la sim (sans image), pour le message de réveil. */
export function summarizeWorld(state: WorldState | null): string {
  if (state === null) return 'no simulation state received yet; call get_status first.';
  const ripe = state.tomatoes.filter((t) => t.state === 'ripe' && t.attached).map((t) => `#${t.id}`);
  const parts = [
    `sim time ${fmt(state.simTimeS)} s`,
    `${state.tomatoes.length} tomatoes on the plant${ripe.length > 0 ? ` (ripe: ${ripe.join(', ')})` : ''}`,
    `scissors cut point at ${xyz(state.scissors.cutPointCm)} cm, ${state.scissors.openingDeg > 0 ? 'open' : 'closed'}`,
    `basket centre at X ${fmt(state.basket.centerCm[0])}, Y ${fmt(state.basket.centerCm[1])} cm`,
  ];
  return parts.join('; ') + '.';
}

/** Message utilisateur envoyé à l'agent à chaque réveil. */
export function buildWakePrompt(event: WakeEvent, statusText: string, opts: { resumed: boolean }): string {
  const lines: string[] = [];
  if (opts.resumed) {
    lines.push(
      'New episode. The previous episode is over and the plant may have changed: every position from before is stale, look again before acting.',
    );
  }
  lines.push(
    `A ripe tomato was detected: tomato #${event.tomatoId} at ${xyz(event.positionCm)} cm, ripeness ${event.ripeness.toFixed(2)}. It is the target of this episode.`,
    `Current status: ${statusText}`,
    'Harvest it: place the basket under the predicted impact point, bring the scissors to the middle of its stem in 5 cm then 1 cm steps, align the blades, open, cut, confirm the landing with get_status, then call report.',
    `You have at most ${MAX_TOOL_CALLS_PER_EPISODE} tool calls in this episode, report included. Start with get_views.`,
  );
  return lines.join('\n');
}

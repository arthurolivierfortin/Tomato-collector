import { createDefaultWorld, type Phase } from '@tomato/shared';
import { describe, expect, it } from 'vitest';
import { headerCommands } from './layerHeader';
import { toViewsPayload } from './payload';

/** Textes du bandeau haut pour une phase de monde donnée. */
function headerTexts(phase: Phase): string[] {
  const world = { ...createDefaultWorld(1), phase, simTimeS: 12.34 };
  const payload = toViewsPayload(world);
  return headerCommands('front', world.cameras.front, payload, 10)
    .filter((c) => c.kind === 'text')
    .map((c) => c.text);
}

describe('bandeau gravé dans les vues', () => {
  it('names the view, the sim time and the phase of the world state', () => {
    const [first] = headerTexts('idle');
    expect(first).toContain('VUE FRONT');
    expect(first).toContain('t = 12.3 s');
    expect(first).toContain('phase idle');
  });

  // Issue #31 : la vue mise en avant est l'élément le plus grand de l'écran ; elle ne doit pas
  // contredire le bandeau de statuts en annonçant « idle » pendant toute la récolte.
  it('follows the session phase instead of staying on idle', () => {
    expect(headerTexts('detected')[0]).toContain('phase detected');
    expect(headerTexts('harvesting')[0]).toContain('phase harvesting');
    expect(headerTexts('harvesting')[0]).not.toContain('phase idle');
  });
});

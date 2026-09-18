import { describe, expect, it } from 'vitest';
import { MAX_TOOL_CALLS_PER_EPISODE, TOOL_NAMES } from '@tomato/shared';
import { loadSystemPrompt } from './systemPrompt';

describe('system prompt', () => {
  const prompt = loadSystemPrompt();

  it('is a substantial English document that names every tool', () => {
    expect(prompt.length).toBeGreaterThan(6000);
    for (const tool of TOOL_NAMES) expect(prompt).toContain(`\`${tool}\``);
  });

  it('states the frame, the units, the three views and the overlay glossary', () => {
    expect(prompt).toContain('X to the right, Y towards the back');
    expect(prompt).toContain('centimetres and degrees');
    for (const view of ['`top`', '`front`', '`side`']) expect(prompt).toContain(view);
    for (const word of ['tige cible', 'lame', 'normale', 'panier', 'impact', 'occultée', 'PIVOTÉE']) {
      expect(prompt).toContain(word);
    }
  });

  it('states the cut rule, the step sizes, the call limit and the reasoning requirement', () => {
    expect(prompt).toContain('0.6 cm');
    expect(prompt).toContain('45 degrees');
    expect(prompt).toContain('5 cm steps, then 1 cm steps');
    expect(prompt).toContain(`at most ${MAX_TOOL_CALLS_PER_EPISODE} tool calls`);
    expect(prompt).toContain('Before every tool call, write one to three short sentences');
  });
});

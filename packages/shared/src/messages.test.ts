import { describe, expect, it } from 'vitest';
import { parseMessage } from './messages';

describe('parseMessage', () => {
  it('accepts a hello from the sim', () => {
    const m = parseMessage(JSON.stringify({ type: 'hello', role: 'sim' }));
    expect(m).toEqual({ type: 'hello', role: 'sim' });
  });

  it('rejects non-JSON and messages without a string type', () => {
    expect(parseMessage('not json')).toBeNull();
    expect(parseMessage(JSON.stringify({ role: 'sim' }))).toBeNull();
    expect(parseMessage(JSON.stringify({ type: 42 }))).toBeNull();
  });
});

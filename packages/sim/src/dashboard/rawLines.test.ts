import { describe, expect, it } from 'vitest';
import { RAW_KIND_LABEL, formatRawTime, pushRawLine, rawBaseMs, type RawLine } from './rawLines';

const T0 = 1_700_000_000_000;
const line = (id: number, atMs: number): RawLine => ({ id, atMs, kind: 'text', text: `l${id}` });

describe('rawLines — flux brut de la session agent (issue #23)', () => {
  it('appends oldest-first and keeps at most `max` lines', () => {
    let lines: readonly RawLine[] = [];
    for (let i = 0; i < 5; i += 1) lines = pushRawLine(lines, line(i, T0 + i), 3);
    expect(lines.map((l) => l.text)).toEqual(['l2', 'l3', 'l4']);
  });

  it('times each line from the wake, or from the first line when there was none', () => {
    expect(rawBaseMs(null, [])).toBeNull();
    expect(rawBaseMs(T0, [line(1, T0 + 500)])).toBe(T0);
    expect(rawBaseMs(null, [line(1, T0 + 500), line(2, T0 + 900)])).toBe(T0 + 500);
    expect(formatRawTime(T0 + 1240, T0)).toBe('+1,2 s');
    expect(formatRawTime(T0 + 1250, T0)).toBe('+1,3 s'); // arrondi au dixième
    expect(formatRawTime(T0, T0)).toBe('+0,0 s');
    expect(formatRawTime(T0 + 500, null)).toBe('');
  });

  it('labels every kind of the contract with a fixed-width prefix', () => {
    expect(Object.keys(RAW_KIND_LABEL)).toEqual(['init', 'text', 'tool_use', 'tool_result', 'result', 'stderr']);
    const widths = new Set(Object.values(RAW_KIND_LABEL).map((l) => l.length));
    expect(widths.size).toBe(1); // colonnes alignées dans le terminal
  });
});

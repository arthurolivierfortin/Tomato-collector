// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { TraceEntry } from './dashboardTypes';
import { TracePanel } from './TracePanel';

afterEach(cleanup);

const T0 = new Date(2026, 8, 17, 10, 0, 0).getTime();

const trace: TraceEntry[] = [
  { id: 3, kind: 'event', atMs: T0 + 2000, title: 'Tomate 3 dans le panier', ok: true },
  { id: 2, kind: 'tool', atMs: T0 + 1000, title: 'Ciseaux → X 8, Y −2, Z 41', ok: false, detail: 'collision : trajet bloqué', durationMs: 180, tool: 'move_scissors', args: { x: 8, y: -2, z: 41, mode: 'absolute' }, result: 'collision : trajet bloqué en X 9,5' },
  { id: 1, kind: 'text', atMs: T0, title: 'Je regarde les vues.' },
];

function renderPanel(entries: TraceEntry[] = trace, expanded: (id: number) => boolean = () => true) {
  const onToggle = vi.fn();
  render(<TracePanel trace={entries} isExpanded={expanded} onToggle={onToggle} nowMs={T0 + 5000} />);
  return { onToggle };
}

describe('TracePanel', () => {
  it('renders the entries in the given order (newest first) with time, kind, title and duration', () => {
    renderPanel();
    const rows = within(screen.getByTestId('trace')).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(rows[0]?.textContent).toContain('Tomate 3 dans le panier');
    expect(rows[2]?.textContent).toContain('Je regarde les vues.');
    expect(rows[1]?.textContent).toContain('10:00:01');
    expect(rows[1]?.textContent).toContain('180 ms');
    expect(rows[1]?.getAttribute('data-kind')).toBe('tool');
  });

  it('marks errors with data-ok="false" and shows their detail; other rows carry no data-ok', () => {
    renderPanel();
    const rows = within(screen.getByTestId('trace')).getAllByRole('listitem');
    expect(rows[1]?.getAttribute('data-ok')).toBe('false');
    expect(rows[1]?.textContent).toContain('collision : trajet bloqué');
    expect(rows[0]?.getAttribute('data-ok')).toBe('true');
    expect(rows[2]?.getAttribute('data-ok')).toBeNull();
  });

  it('shows the arguments and the result of an expanded tool call as indented JSON', () => {
    renderPanel();
    const args = screen.getByTestId('trace-args-2');
    expect(args.textContent).toContain('"mode": "absolute"');
    expect(args.textContent).toContain('\n  "x": 8');
    expect(screen.getByTestId('trace-result-2').textContent).toContain('collision : trajet bloqué en X 9,5');
  });

  it('hides the JSON of a folded call and toggles it with the button', () => {
    const { onToggle } = renderPanel(trace, () => false);
    expect(screen.queryByTestId('trace-args-2')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /déplier/i }));
    expect(onToggle).toHaveBeenCalledWith(2);
  });

  it('highlights a call still waiting for its result and runs a clock on it', () => {
    renderPanel([{ id: 9, kind: 'tool', atMs: T0 + 3000, title: 'Vues demandées : top', tool: 'get_views', args: { cameras: ['top'] } }]);
    const row = within(screen.getByTestId('trace')).getAllByRole('listitem')[0];
    expect(row?.getAttribute('data-pending')).toBe('true');
    expect(row?.textContent).toContain('2,0 s'); // nowMs − atMs, chrono qui tourne
    expect(screen.getByTestId('trace-args-9').textContent).toContain('"cameras"');
    expect(screen.queryByTestId('trace-result-9')).toBeNull();
  });

  it('shows the whole agent text, line breaks included', () => {
    renderPanel([{ id: 4, kind: 'text', atMs: T0, title: 'Première ligne', detail: 'Première ligne\nDeuxième ligne' }]);
    const row = within(screen.getByTestId('trace')).getAllByRole('listitem')[0];
    expect(row?.textContent).toContain('Deuxième ligne');
    expect(row?.querySelector('[data-testid="trace-text-4"]')?.className).toContain('whitespace-pre-wrap');
  });

  it('shows a waiting line when the trace is empty', () => {
    renderPanel([]);
    expect(screen.getByTestId('trace').textContent).toContain("En attente d'un épisode.");
  });
});

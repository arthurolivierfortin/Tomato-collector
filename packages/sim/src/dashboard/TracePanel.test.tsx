// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import type { TraceEntry } from './dashboardTypes';
import { TracePanel } from './TracePanel';

afterEach(cleanup);

const T0 = new Date(2026, 8, 17, 10, 0, 0).getTime();

const trace: TraceEntry[] = [
  { id: 3, kind: 'event', atMs: T0 + 2000, title: 'Tomate 3 dans le panier', ok: true },
  { id: 2, kind: 'tool', atMs: T0 + 1000, title: 'Ciseaux → X 8, Y −2, Z 41', ok: false, detail: 'collision : trajet bloqué', durationMs: 180 },
  { id: 1, kind: 'text', atMs: T0, title: 'Je regarde les vues.' },
];

describe('TracePanel', () => {
  it('renders the entries in the given order (newest first) with time, kind, title and duration', () => {
    render(<TracePanel trace={trace} />);
    const rows = within(screen.getByTestId('trace')).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(rows[0]?.textContent).toContain('Tomate 3 dans le panier');
    expect(rows[2]?.textContent).toContain('Je regarde les vues.');
    expect(rows[1]?.textContent).toContain('10:00:01');
    expect(rows[1]?.textContent).toContain('180 ms');
    expect(rows[1]?.getAttribute('data-kind')).toBe('tool');
  });

  it('marks errors with data-ok="false" and shows their detail; other rows carry no data-ok', () => {
    render(<TracePanel trace={trace} />);
    const rows = within(screen.getByTestId('trace')).getAllByRole('listitem');
    expect(rows[1]?.getAttribute('data-ok')).toBe('false');
    expect(rows[1]?.textContent).toContain('collision : trajet bloqué');
    expect(rows[0]?.getAttribute('data-ok')).toBe('true');
    expect(rows[2]?.getAttribute('data-ok')).toBeNull();
  });

  it('shows a waiting line when the trace is empty', () => {
    render(<TracePanel trace={[]} />);
    expect(screen.getByTestId('trace').textContent).toContain("En attente d'un épisode.");
  });
});

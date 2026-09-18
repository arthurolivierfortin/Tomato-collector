// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { AgentSessionPanel } from './AgentSessionPanel';
import type { RawLine } from './rawLines';

afterEach(cleanup);

const T0 = 1_700_000_000_000;

const lines: RawLine[] = [
  { id: 1, atMs: T0, kind: 'init', text: 'session sess-1 · modèle claude-opus-5 · MCP robot : connected' },
  { id: 2, atMs: T0 + 900, kind: 'text', text: 'Je regarde les trois vues.' },
  { id: 3, atMs: T0 + 2400, kind: 'tool_use', text: 'get_views {"cameras":["front"]}' },
  { id: 4, atMs: T0 + 3100, kind: 'stderr', text: 'warning: onnx runtime absent' },
];

function renderPanel(props: Partial<Parameters<typeof AgentSessionPanel>[0]> = {}) {
  const onToggle = vi.fn();
  render(<AgentSessionPanel raw={lines} sinceMs={T0} open onToggle={onToggle} {...props} />);
  return { onToggle };
}

describe('AgentSessionPanel', () => {
  it('shows the raw lines oldest-first, each with its kind and its time since the wake', () => {
    renderPanel();
    const rows = within(screen.getByTestId('agent-session')).getAllByRole('listitem');
    expect(rows).toHaveLength(4);
    expect(rows[0]?.textContent).toContain('session sess-1');
    expect(rows[0]?.textContent).toContain('+0,0 s');
    expect(rows[0]?.getAttribute('data-kind')).toBe('init');
    expect(rows[2]?.textContent).toContain('+2,4 s');
    expect(rows[3]?.getAttribute('data-kind')).toBe('stderr');
    expect(rows[3]?.textContent).toContain('err.');
  });

  it('collapses to its header, which keeps the line count and toggles the panel', () => {
    const { onToggle } = renderPanel({ open: false });
    expect(screen.queryByTestId('agent-session')).toBeNull();
    const header = screen.getByRole('button', { name: /Session agent \(brut\)/ });
    expect(header.getAttribute('aria-expanded')).toBe('false');
    expect(header.textContent).toContain('4 lignes');
    fireEvent.click(header);
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('says it is waiting when the agent has not spoken yet', () => {
    renderPanel({ raw: [], sinceMs: null });
    expect(screen.getByTestId('agent-session').textContent).toContain('En attente');
  });
});

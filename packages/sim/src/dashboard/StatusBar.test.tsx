// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { initialDashboardState } from './dashboardStore';
import { StatusBar } from './StatusBar';

afterEach(cleanup);

describe('StatusBar', () => {
  it('shows the eight phase pills with the current one marked, in French', () => {
    render(<StatusBar state={{ ...initialDashboardState(), phase: 'cutting' }} clock={null} detector="HSV/Sobel" />);
    const pills = within(screen.getByRole('list', { name: 'Phase' })).getAllByRole('listitem');
    expect(pills.map((li) => li.textContent)).toEqual(['repos', 'détectée', 'récolte', 'coupe', 'chute', 'récoltée', 'ratée', 'abandon']);
    const current = screen.getByText('coupe');
    expect(current.getAttribute('aria-current')).toBe('step');
    expect(screen.getByText('repos').getAttribute('aria-current')).toBeNull();
  });

  it('shows counters, model, cost, detector and the snapshot clock when no local clock is given', () => {
    const state = { ...initialDashboardState(), counters: { harvested: 2, missed: 1, aborted: 0 }, costUsd: 0.0421, sim: { simTimeS: 12.34, timeScale: 5, paused: false } };
    render(<StatusBar state={state} clock={null} detector="yolo/Canny" />);
    expect(screen.getByTestId('count-harvested').textContent).toBe('2');
    expect(screen.getByTestId('count-missed').textContent).toBe('1');
    expect(screen.getByTestId('cost').textContent).toBe('0,0421 $');
    expect(screen.getByTestId('model').textContent).toBe('claude-opus-5');
    expect(screen.getByTestId('detector').textContent).toBe('yolo/Canny');
    expect(screen.getByTestId('sim-time').textContent).toBe('12,3 s');
    expect(screen.getByTestId('time-scale').textContent).toBe('×5');
    expect(screen.getByTestId('connection').textContent).toContain('hors ligne');
  });

  it('prefers the local sim clock and says "pause" when paused', () => {
    render(<StatusBar state={initialDashboardState()} clock={{ simTimeS: 3, timeScale: 2, paused: true }} detector="HSV/Sobel" />);
    expect(screen.getByTestId('sim-time').textContent).toBe('3,0 s');
    expect(screen.getByTestId('time-scale').textContent).toBe('pause');
  });

  // Issue #23 : le spectateur doit voir la tomate mûrir avant que la perception ne la détecte.
  it('shows the ripening tomato, from the local sim when there is one, else from the snapshot', () => {
    const state = { ...initialDashboardState(), ripening: { tomatoId: 2, ripeness: 0.4 } };
    // Prop absente = pas de sim locale (page en lecture seule) : on retombe sur le dernier snapshot.
    const { rerender } = render(<StatusBar state={state} clock={null} detector="HSV/Sobel" />);
    expect(screen.getByTestId('ripening').textContent).toBe('tomate 2 : mûrit 40 %');
    rerender(<StatusBar state={state} clock={null} detector="HSV/Sobel" ripening={{ tomatoId: 3, ripeness: 0.62 }} />);
    expect(screen.getByTestId('ripening').textContent).toBe('tomate 3 : mûrit 62 %');
    // Revue PR #28 : `null` = la sim locale dit que rien ne mûrit. Retomber sur le snapshot afficherait
    // une valeur figée (une tomate déjà récoltée) après une reconnexion.
    rerender(<StatusBar state={state} clock={null} detector="HSV/Sobel" ripening={null} />);
    expect(screen.getByTestId('ripening').textContent).toBe('—');
    rerender(<StatusBar state={initialDashboardState()} clock={null} detector="HSV/Sobel" />);
    expect(screen.getByTestId('ripening').textContent).toBe('—');
  });
});

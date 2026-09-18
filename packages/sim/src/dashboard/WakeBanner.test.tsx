// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import type { WakeInfo } from './dashboardTypes';
import { WAKE_BANNER_MS, WakeBanner } from './WakeBanner';

afterEach(cleanup);

const wake: WakeInfo = { tomatoId: 3, detector: 'hsv', confidence: 0.9, sessionResumed: true, atMs: 1_700_000_000_000 };

describe('WakeBanner', () => {
  it('announces the detection and the wake, then disappears on its own', () => {
    vi.useFakeTimers();
    try {
      render(<WakeBanner wake={wake} />);
      const banner = screen.getByTestId('wake-banner');
      expect(banner.textContent).toContain('Tomate 3 mûre détectée');
      expect(banner.textContent).toContain('hsv');
      expect(banner.textContent).toContain('0,90');
      expect(banner.textContent).toContain('session reprise');
      act(() => vi.advanceTimersByTime(WAKE_BANNER_MS + 1));
      expect(screen.queryByTestId('wake-banner')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows nothing before the first wake', () => {
    render(<WakeBanner wake={null} />);
    expect(screen.queryByTestId('wake-banner')).toBeNull();
  });
});

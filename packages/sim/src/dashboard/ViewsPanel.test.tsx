// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { CameraId, ViewImage } from '@tomato/shared';
import { ViewsPanel } from './ViewsPanel';

afterEach(cleanup);

const NOW = 1_700_000_000_000;
const image = (camera: CameraId): ViewImage => ({ camera, pngBase64: `png-${camera}`, widthPx: 800, heightPx: 800 });

const full = { top: image('top'), front: image('front'), side: image('side') };
const fullAt = { top: NOW - 3000, front: NOW - 12_000, side: NOW - 65_000 };

function setup(props: Partial<Parameters<typeof ViewsPanel>[0]> = {}) {
  const onFeature = vi.fn();
  const onOpen = vi.fn();
  render(
    <ViewsPanel
      views={full}
      viewsAt={fullAt}
      featured="front"
      lastViewsAt={NOW}
      agentView={false}
      nowMs={NOW}
      onFeature={onFeature}
      onOpen={onOpen}
      {...props}
    />,
  );
  return { onFeature, onOpen };
}

describe('ViewsPanel', () => {
  it('shows the featured camera large and the two others as thumbnails', () => {
    setup();
    const featured = screen.getByTestId('view-featured');
    expect(featured.getAttribute('data-camera')).toBe('front');
    expect(featured.querySelector('img')?.getAttribute('src')).toContain('png-front');
    expect(screen.getByTestId('view-thumb-top')).toBeTruthy();
    expect(screen.getByTestId('view-thumb-side')).toBeTruthy();
    expect(screen.queryByTestId('view-thumb-front')).toBeNull();
  });

  it('features a camera when its thumbnail is clicked and opens the lightbox on the big view', () => {
    const { onFeature, onOpen } = setup();
    fireEvent.click(within(screen.getByTestId('view-thumb-side')).getByRole('button'));
    expect(onFeature).toHaveBeenCalledWith('side');
    fireEvent.click(within(screen.getByTestId('view-featured')).getByRole('button'));
    expect(onOpen).toHaveBeenCalledWith('front');
  });

  it('tells the age of each image', () => {
    setup();
    expect(screen.getByTestId('view-featured').textContent).toContain('il y a 12 s');
    expect(screen.getByTestId('view-thumb-top').textContent).toContain('il y a 3 s');
    expect(screen.getByTestId('view-thumb-side').textContent).toContain('il y a 1 min');
  });

  it('waits only for the cameras that never sent an image, and keeps the others', () => {
    setup({ views: { ...full, front: null }, viewsAt: { ...fullAt, front: null } });
    expect(screen.getByTestId('view-featured').textContent).toContain('en attente');
    expect(screen.getByTestId('view-featured').querySelector('img')).toBeNull();
    expect(screen.getByTestId('view-thumb-top').querySelector('img')).toBeTruthy();
  });

  it('shows the three views large in the agent view mode', () => {
    setup({ agentView: true });
    expect(screen.getAllByTestId('view-featured')).toHaveLength(3);
    expect(screen.queryByTestId('view-thumb-top')).toBeNull();
  });
});

describe('ViewsPanel — page seule', () => {
  it('offers a local refresh only when the caller provides one', () => {
    const onRefresh = vi.fn();
    setup({ onRefresh });
    fireEvent.click(screen.getByTestId('refresh-views'));
    expect(onRefresh).toHaveBeenCalledTimes(1);
    cleanup();
    setup();
    expect(screen.queryByTestId('refresh-views')).toBeNull();
  });
});

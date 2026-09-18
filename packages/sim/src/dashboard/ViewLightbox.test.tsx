// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { CameraId, ViewImage } from '@tomato/shared';
import { ZOOM_MAX, clampView, zoomAtCursor, type LightboxView } from './lightbox';
import { ViewLightbox } from './ViewLightbox';

afterEach(cleanup);

const image = (camera: CameraId): ViewImage => ({ camera, pngBase64: `png-${camera}`, widthPx: 800, heightPx: 800 });
const views = { top: image('top'), front: image('front'), side: image('side') };

function setup(view: LightboxView = { camera: 'front', zoom: 1, panXPx: 0, panYPx: 0 }) {
  const onClose = vi.fn();
  const onCamera = vi.fn();
  const onView = vi.fn();
  render(<ViewLightbox view={view} views={views} onClose={onClose} onCamera={onCamera} onView={onView} />);
  return { onClose, onCamera, onView };
}

describe('zoomAtCursor / clampView', () => {
  it('keeps the point under the cursor in place and stays within the bounds', () => {
    const start: LightboxView = { camera: 'top', zoom: 1, panXPx: 0, panYPx: 0 };
    const zoomed = zoomAtCursor(start, 2, 100, 0, 800);
    expect(zoomed.zoom).toBe(2);
    expect(zoomed.panXPx).toBe(-100); // le point à +100 du centre reste sous le curseur
    expect(zoomAtCursor(zoomed, 10, 0, 0, 800).zoom).toBe(ZOOM_MAX);
    // Débord maximal à ×2 sur 800 px : 400 px de chaque côté.
    expect(clampView({ camera: 'top', zoom: 2, panXPx: 9999, panYPx: -9999 }, 800)).toEqual({ camera: 'top', zoom: 2, panXPx: 400, panYPx: -400 });
    expect(clampView({ camera: 'top', zoom: 1, panXPx: 50, panYPx: 50 }, 800).panXPx).toBe(0);
  });
});

describe('ViewLightbox', () => {
  it('shows the image of the open camera at the current zoom and offset', () => {
    setup({ camera: 'side', zoom: 2, panXPx: 30, panYPx: -10 });
    const img = screen.getByAltText('vue side en plein écran');
    expect(img.getAttribute('src')).toContain('png-side');
    expect((img as HTMLElement).style.transform).toBe('translate(30px, -10px) scale(2)');
  });

  it('closes on Escape and on a click on the backdrop', () => {
    const { onClose } = setup();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('lightbox'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('switches camera without closing', () => {
    const { onCamera, onClose } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Vue top' }));
    expect(onCamera).toHaveBeenCalledWith('top');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('zooms on the wheel and pans while dragging', () => {
    const { onView } = setup();
    const stage = screen.getByTestId('lightbox-stage');
    stage.getBoundingClientRect = () => ({ width: 800, height: 800, top: 0, left: 0, right: 800, bottom: 800, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.wheel(stage, { deltaY: -100, clientX: 400, clientY: 400 });
    expect(onView).toHaveBeenCalledWith(expect.objectContaining({ zoom: expect.any(Number) }));
    expect(onView.mock.calls[0]?.[0].zoom).toBeGreaterThan(1);

    onView.mockClear();
    cleanup();
    const dragged = setup({ camera: 'front', zoom: 2, panXPx: 0, panYPx: 0 });
    const stage2 = screen.getByTestId('lightbox-stage');
    stage2.getBoundingClientRect = () => ({ width: 800, height: 800, top: 0, left: 0, right: 800, bottom: 800, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.pointerDown(stage2, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(stage2, { clientX: 140, clientY: 90, pointerId: 1 });
    expect(dragged.onView).toHaveBeenCalledWith({ camera: 'front', zoom: 2, panXPx: 40, panYPx: -10 });
  });
});

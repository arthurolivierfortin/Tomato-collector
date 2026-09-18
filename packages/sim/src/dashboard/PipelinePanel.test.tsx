// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { PipelineCapture } from '../perception/pipelineCapture';
import { pipelineStages } from '../perception/pipelineModel';
import { PipelinePanel } from './PipelinePanel';

afterEach(cleanup);

const capture: PipelineCapture = {
  camera: 'front',
  atMs: 1_700_000_000_000,
  tiles: pipelineStages({
    camera: 'front',
    detector: 'hsv',
    inferenceMs: 9.1,
    detections: 2,
    matched: 1,
    canny: true,
    inputPx: 640,
    viewPx: 800,
    target: 'episode',
  }).map((s, i) => ({ ...s, pngBase64: i === 0 ? '' : 'iVBORw0KGgo=' })),
};

function renderPanel(over: Partial<Parameters<typeof PipelinePanel>[0]> = {}) {
  const onCamera = vi.fn();
  const onRefresh = vi.fn();
  const onClose = vi.fn();
  render(<PipelinePanel camera="front" capture={capture} pending={false} onCamera={onCamera} onRefresh={onRefresh} onClose={onClose} {...over} />);
  return { onCamera, onRefresh, onClose };
}

describe('PipelinePanel', () => {
  it('shows one tile per stage, in order, each with its provenance label', () => {
    renderPanel();
    const tiles = screen.getAllByTestId('pipeline-tile');
    expect(tiles).toHaveLength(10);
    expect(tiles.map((t) => t.dataset.stage)).toEqual(['raw', 'clahe', 'edges', 'detect', 'match', 'grid', 'tools', 'markers', 'fall', 'final']);
    expect(tiles[3]?.textContent).toContain('seuillage HSV 640');
    expect(tiles[4]?.textContent).toContain('logique');
    expect(tiles[7]?.textContent).toContain('simulation');
    expect(tiles[8]?.textContent).toContain('géométrie');
  });

  it('renders the real buffer of each stage and says when one is missing', () => {
    renderPanel();
    const images = screen.getAllByRole('img');
    expect(images).toHaveLength(9);
    expect(images[0]?.getAttribute('src')).toBe('data:image/png;base64,iVBORw0KGgo=');
    expect(screen.getAllByTestId('pipeline-tile')[0]?.textContent).toContain('tampon indisponible');
  });

  it('switches camera, recaptures and closes with Escape', () => {
    const { onCamera, onRefresh, onClose } = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Caméra top' }));
    expect(onCamera).toHaveBeenCalledWith('top');
    fireEvent.click(screen.getByRole('button', { name: 'Recapturer' }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('says a capture is running and that the mode needs a local scene', () => {
    renderPanel({ capture: null, pending: true });
    expect(screen.getByTestId('pipeline-empty').textContent).toContain('en cours');
    cleanup();
    renderPanel({ capture: null, pending: false });
    expect(screen.getByTestId('pipeline-empty').textContent).toContain('scène locale');
  });
});

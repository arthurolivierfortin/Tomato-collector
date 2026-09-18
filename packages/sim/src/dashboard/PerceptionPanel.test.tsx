// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { PerceptionState } from '../perception/types';
import { PerceptionPanel } from './PerceptionPanel';

afterEach(cleanup);

const state = (over: Partial<PerceptionState> = {}): PerceptionState => ({
  opencvReady: true,
  yoloReady: false,
  lastDetector: 'hsv',
  lastDetections: [
    { bbox: [64, 128, 32, 64], score: 0.87, label: 'ripe' },
    { bbox: [320, 320, 40, 40], score: 0.31, label: 'unripe' },
  ],
  lastImage: { width: 640, height: 640, data: new Uint8ClampedArray(640 * 640 * 4) },
  lastInferenceMs: 8.42,
  gate: { tomatoId: 2, count: 3, target: 5 },
  ...over,
});

function renderPanel(over: Partial<PerceptionState> = {}, open = true) {
  const onToggle = vi.fn();
  const onOpenPipeline = vi.fn();
  render(<PerceptionPanel state={state(over)} open={open} onToggle={onToggle} onOpenPipeline={onOpenPipeline} />);
  return { onToggle, onOpenPipeline };
}

describe('PerceptionPanel', () => {
  it('names the running detector, the inference time and the wake gate', () => {
    renderPanel();
    expect(screen.getByTestId('perception-detector').textContent).toBe('seuillage HSV 640');
    expect(screen.getByTestId('perception-inference').textContent).toBe('8,4 ms');
    expect(screen.getByTestId('perception-gate').textContent).toBe('3/5 frames consécutives · tomate 2');
    expect(screen.getByTestId('perception-panel').textContent).toContain('mode dégradé HSV');
  });

  it('draws one box per detection, with its class and confidence, placed in percent of the frame', () => {
    renderPanel();
    const boxes = screen.getAllByTestId('perception-box');
    expect(boxes).toHaveLength(2);
    expect(boxes[0]?.textContent).toBe('ripe 0,87');
    // jsdom normalise « 10.000% » en « 10% » : c'est bien un pourcentage de la frame du détecteur.
    expect(boxes[0]?.style.left).toBe('10%');
    expect(boxes[0]?.style.width).toBe('5%');
    expect(boxes[1]?.textContent).toBe('unripe 0,31');
  });

  it('says it is waiting before the first frame and keeps the header readable', () => {
    renderPanel({ lastImage: null, lastDetections: [], lastDetector: null, lastInferenceMs: null, gate: { tomatoId: null, count: 0, target: 5 } });
    expect(screen.getByTestId('perception-panel').textContent).toContain('En attente de la première frame');
    expect(screen.getByTestId('perception-inference').textContent).toBe('aucune inférence');
    expect(screen.queryAllByTestId('perception-box')).toHaveLength(0);
  });

  it('names the model when YOLO produced the last detection', () => {
    renderPanel({ yoloReady: true, lastDetector: 'yolo' });
    expect(screen.getByTestId('perception-detector').textContent).toBe('YOLOv8n ONNX 640');
    expect(screen.getByTestId('perception-panel').textContent).toContain('modèle chargé');
  });

  it('collapses to its header, which still names the detector', () => {
    const { onToggle } = renderPanel({}, false);
    expect(screen.queryByTestId('perception-panel')).toBeNull();
    expect(screen.getByTestId('perception-detector').textContent).toBe('seuillage HSV 640');
    fireEvent.click(screen.getByRole('button', { name: /Perception \(p\)/ }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('opens the pipeline mode on demand', () => {
    const { onOpenPipeline } = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /Voir tout le pipeline/ }));
    expect(onOpenPipeline).toHaveBeenCalledTimes(1);
  });
});

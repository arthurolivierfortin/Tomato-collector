import { describe, expect, it } from 'vitest';
import type { Detection, PerceptionState } from '../perception/types';
import { activeDetector, activeDetectorName, boxStyle, detectionLabel, edgesLabel, gateLabel, inferenceLabel, modelStatusLabel } from './perceptionView';

const state = (over: Partial<PerceptionState> = {}): PerceptionState => ({
  opencvReady: true,
  yoloReady: false,
  lastDetector: null,
  lastDetections: [],
  lastImage: null,
  lastInferenceMs: null,
  gate: { tomatoId: null, count: 0, target: 5 },
  ...over,
});

describe('activeDetector', () => {
  it('reports the detector of the last tick', () => {
    expect(activeDetector(state({ lastDetector: 'yolo' }))).toBe('yolo');
    expect(activeDetectorName(state({ lastDetector: 'yolo' }))).toBe('YOLOv8n ONNX 640');
  });

  it('falls back to the one that would run before the first tick', () => {
    expect(activeDetectorName(state())).toBe('seuillage HSV 640');
    expect(activeDetectorName(state({ yoloReady: true }))).toBe('YOLOv8n ONNX 640');
  });

  it('says whether the model is loaded or the run is degraded', () => {
    expect(modelStatusLabel(state())).toBe('mode dégradé HSV');
    expect(modelStatusLabel(state({ yoloReady: true }))).toBe('modèle chargé');
  });
});

describe('edgesLabel, inferenceLabel, gateLabel', () => {
  it('names the edge filter actually wired in', () => {
    expect(edgesLabel(state())).toBe('contours Canny + CLAHE');
    expect(edgesLabel(state({ opencvReady: false }))).toContain('Sobel');
  });

  it('formats the last inference time in French', () => {
    expect(inferenceLabel(state())).toBe('aucune inférence');
    expect(inferenceLabel(state({ lastInferenceMs: 12.34 }))).toBe('12,3 ms');
  });

  it('counts the consecutive frames of the wake gate', () => {
    expect(gateLabel(state())).toBe('0/5 frames consécutives · aucune tomate suivie');
    expect(gateLabel(state({ gate: { tomatoId: 2, count: 3, target: 5 } }))).toBe('3/5 frames consécutives · tomate 2');
  });
});

describe('detectionLabel et boxStyle', () => {
  const d: Detection = { bbox: [64, 128, 32, 64], score: 0.873, label: 'ripe' };

  it('shows the class and the confidence', () => {
    expect(detectionLabel(d)).toBe('ripe 0,87');
    expect(detectionLabel({ ...d, label: 'unripe', score: 0.4 })).toBe('unripe 0,40');
  });

  it('places the box in percent of the detector frame', () => {
    expect(boxStyle(d, 640, 640)).toEqual({ left: '10.000%', top: '20.000%', width: '5.000%', height: '10.000%' });
  });
});

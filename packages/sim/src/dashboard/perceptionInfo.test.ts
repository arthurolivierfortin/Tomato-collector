import { describe, expect, it } from 'vitest';
import { detectorLabel, loadPerceptionState } from './perceptionInfo';

describe('perceptionInfo', () => {
  it('reads perceptionState from a candidate module, or null when M4 is absent', async () => {
    expect(await loadPerceptionState({})).toBeNull();
    expect(await loadPerceptionState({ a: async () => ({}) })).toBeNull();
    const reader = await loadPerceptionState({
      a: async () => ({ perceptionState: () => ({ opencvReady: true, yoloReady: false, lastDetector: 'hsv' as const }) }),
    });
    expect(reader?.()).toEqual({ opencvReady: true, yoloReady: false, lastDetector: 'hsv' });
  });

  // Issue #36 : le bandeau nomme le détecteur réellement actif, pas une abréviation ambiguë.
  it('names the running detector and the edge filter, with the HSV/Sobel fallback', () => {
    expect(detectorLabel(null)).toBe('seuillage HSV 640 / Sobel');
    expect(detectorLabel({ opencvReady: true, yoloReady: true, lastDetector: 'yolo' })).toBe('YOLOv8n ONNX 640 / Canny');
    expect(detectorLabel({ opencvReady: false, yoloReady: false, lastDetector: null })).toBe('seuillage HSV 640 / Sobel');
    expect(detectorLabel({ opencvReady: true, yoloReady: true, lastDetector: null })).toBe('YOLOv8n ONNX 640 / Canny');
  });
});

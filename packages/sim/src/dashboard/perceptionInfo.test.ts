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

  it('labels detector and edge filter, with the HSV/Sobel fallback', () => {
    expect(detectorLabel(null)).toBe('HSV/Sobel');
    expect(detectorLabel({ opencvReady: true, yoloReady: true, lastDetector: 'yolo' })).toBe('yolo/Canny');
    expect(detectorLabel({ opencvReady: false, yoloReady: false, lastDetector: null })).toBe('hsv/Sobel');
  });
});

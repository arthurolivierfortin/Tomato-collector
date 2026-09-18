import { describe, expect, it } from 'vitest';
import { SOURCE_LABEL, STAGE_KEYS, detectorName, pipelineStages, type PipelineInfo } from './pipelineModel';

const info = (over: Partial<PipelineInfo> = {}): PipelineInfo => ({
  camera: 'front',
  detector: 'hsv',
  inferenceMs: 12.34,
  detections: 3,
  matched: 2,
  canny: true,
  inputPx: 640,
  viewPx: 800,
  ...over,
});

describe('detectorName', () => {
  it('names the active detector without ambiguity', () => {
    expect(detectorName('yolo', 640)).toBe('YOLOv8n ONNX 640');
    expect(detectorName('hsv', 640)).toBe('seuillage HSV 640');
  });
});

describe('pipelineStages', () => {
  it('lists the ten stages in processing order', () => {
    expect(pipelineStages(info()).map((s) => s.key)).toEqual([...STAGE_KEYS]);
  });

  it('labels each stage with where its content really comes from', () => {
    const byKey = new Map(pipelineStages(info()).map((s) => [s.key, s]));
    expect(byKey.get('raw')?.sourceLabel).toBe(SOURCE_LABEL.camera);
    expect(byKey.get('clahe')?.sourceLabel).toBe(SOURCE_LABEL.opencv);
    expect(byKey.get('edges')?.sourceLabel).toBe(SOURCE_LABEL.opencv);
    expect(byKey.get('match')?.sourceLabel).toBe(SOURCE_LABEL.logic);
    expect(byKey.get('grid')?.sourceLabel).toBe(SOURCE_LABEL.calibration);
    expect(byKey.get('tools')?.sourceLabel).toBe(SOURCE_LABEL.robot);
    expect(byKey.get('markers')?.sourceLabel).toBe(SOURCE_LABEL.sim);
    expect(byKey.get('fall')?.sourceLabel).toBe(SOURCE_LABEL.physics);
    // Les repères de tomates sont la part assumée de vérité terrain : la légende doit le dire.
    expect(byKey.get('markers')?.caption).toContain('simulation');
  });

  it('names the detector actually running and reports its inference time', () => {
    const hsv = pipelineStages(info()).find((s) => s.key === 'detect');
    expect(hsv?.sourceLabel).toBe('seuillage HSV 640');
    expect(hsv?.caption).toContain('12.3 ms');
    expect(hsv?.io).toContain('3 boîte(s)');

    const yolo = pipelineStages(info({ detector: 'yolo' })).find((s) => s.key === 'detect');
    expect(yolo?.sourceLabel).toBe('modèle YOLOv8n ONNX 640');
  });

  it('says the detector did not run when there is no inference time', () => {
    const detect = pipelineStages(info({ inferenceMs: null })).find((s) => s.key === 'detect');
    expect(detect?.caption).toContain('non exécuté');
  });

  it('falls back to Sobel and plain gray when OpenCV is missing', () => {
    const stages = pipelineStages(info({ canny: false }));
    expect(stages.find((s) => s.key === 'edges')?.title).toContain('Sobel');
    expect(stages.find((s) => s.key === 'clahe')?.title).toContain('Niveaux de gris');
    expect(stages.find((s) => s.key === 'clahe')?.sourceLabel).toContain('absent');
  });

  it('counts the matched identifiers and the view size of the chosen camera', () => {
    const stages = pipelineStages(info({ camera: 'top', matched: 1 }));
    expect(stages.find((s) => s.key === 'match')?.io).toContain('1 identifiant(s)');
    expect(stages.find((s) => s.key === 'raw')?.io).toBe('scène 3D → RGBA 800×800');
    expect(stages.find((s) => s.key === 'raw')?.caption).toContain('dessus');
  });
});

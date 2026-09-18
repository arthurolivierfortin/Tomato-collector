import { useEffect, useState } from 'react';
import { perceptionState, subscribePerception } from './perceptionModule';

/** Pastille de perception (spec 4.4 : « le dashboard affiche quel détecteur a déclenché »). M7 la reprend dans StatusBar. */
export function PerceptionBadge() {
  const [state, setState] = useState(perceptionState());
  useEffect(() => subscribePerception(setState), []);
  const edges = state.opencvReady ? 'contours Canny + CLAHE' : 'contours Sobel (OpenCV.js en chargement)';
  const model = state.yoloReady ? 'YOLOv8 ONNX + HSV' : 'HSV seul (YOLO absent)';
  const last = state.lastDetector
    ? `dernier tick : ${state.lastDetector.toUpperCase()} · ${state.lastDetections.length} boîte(s)`
    : 'aucune détection';
  return (
    <div data-testid="perception-badge" className="mb-3 flex flex-wrap gap-2 font-mono text-xs">
      <span className="rounded bg-neutral-800 px-2 py-1 text-neutral-200">{edges}</span>
      <span className="rounded bg-neutral-800 px-2 py-1 text-neutral-200">{model}</span>
      <span className={`rounded px-2 py-1 ${state.lastDetector === 'yolo' ? 'bg-fuchsia-900 text-fuchsia-100' : 'bg-neutral-800 text-neutral-300'}`}>{last}</span>
    </div>
  );
}

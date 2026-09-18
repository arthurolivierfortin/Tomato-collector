import { activeDetectorName, edgesLabel, modelStatusLabel } from '../dashboard/perceptionView';
import { usePerceptionState } from './usePerception';

/**
 * Pastille de perception (spec 4.4 : « le dashboard affiche quel détecteur a déclenché »). M7 la reprend
 * dans StatusBar. Issue #36 : le détecteur réellement actif est nommé sans ambiguïté — « YOLOv8n ONNX 640 »
 * seulement quand le modèle est chargé ET a produit la dernière détection, « seuillage HSV 640 » sinon.
 */
export function PerceptionBadge() {
  const state = usePerceptionState();
  const last =
    state.lastDetector === null
      ? 'aucune détection'
      : `dernier tick : ${activeDetectorName(state)} · ${state.lastDetections.length} boîte(s)`;
  return (
    <div data-testid="perception-badge" className="mb-3 flex flex-wrap gap-2 font-mono text-xs">
      <span className="rounded bg-neutral-800 px-2 py-1 text-neutral-200">{edgesLabel(state)}</span>
      <span className="rounded bg-neutral-800 px-2 py-1 text-neutral-200">
        {activeDetectorName(state)} — {modelStatusLabel(state)}
      </span>
      <span className={`rounded px-2 py-1 ${state.lastDetector === 'yolo' ? 'bg-fuchsia-900 text-fuchsia-100' : 'bg-neutral-800 text-neutral-300'}`}>{last}</span>
    </div>
  );
}

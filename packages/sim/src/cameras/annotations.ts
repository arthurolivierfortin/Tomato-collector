import { VIEW_SIZE_PX, type CameraId, type CameraPose, type ViewsPayload } from '@tomato/shared';
import { clampCommands } from './clampLabel';
import { gridCommands } from './layerGrid';
import { headerCommands } from './layerHeader';
import { spreadLabelGroups } from './labelLayout';
import { markerCommands } from './layerMarkers';
import { toolCommands } from './layerTools';
import type { OverlayCommand } from './overlayTypes';

/**
 * Couches 2 à 5 de la spec 4.5, dans l'ordre de dessin (la couche 1, fond + contours, est l'image de base).
 * Deux passes de mise en page : `spreadLabelGroups` écarte les étiquettes flottantes des couches 3 et 4
 * qui se recouvrent (les objets se projettent souvent au même endroit, surtout en vue top), puis
 * `clampCommands` ramène chaque texte dans le cadre 800×800.
 */
export function buildOverlay(camId: CameraId, pose: CameraPose, payload: ViewsPayload, spacingCm: number): OverlayCommand[] {
  const floating = spreadLabelGroups(
    [...markerCommands(camId, pose, payload.tomatoes, payload.targetTomatoId), ...toolCommands(camId, pose, payload)],
    VIEW_SIZE_PX,
  );
  return clampCommands([...gridCommands(camId, pose, spacingCm), ...floating, ...headerCommands(camId, pose, payload, spacingCm)], VIEW_SIZE_PX);
}

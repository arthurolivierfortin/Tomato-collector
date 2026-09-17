import { VIEW_SIZE_PX, type CameraId, type CameraPose, type ViewsPayload } from '@tomato/shared';
import { clampCommands } from './clampLabel';
import { gridCommands } from './layerGrid';
import { headerCommands } from './layerHeader';
import { markerCommands } from './layerMarkers';
import { toolCommands } from './layerTools';
import type { OverlayCommand } from './overlayTypes';

/**
 * Couches 2 à 5 de la spec 4.5, dans l'ordre de dessin (la couche 1, fond + contours, est l'image de base).
 * Passe finale `clampCommands` : aucune étiquette ne sort du cadre 800×800, même si l'outil qu'elle
 * désigne est au bord de l'image.
 */
export function buildOverlay(camId: CameraId, pose: CameraPose, payload: ViewsPayload, spacingCm: number): OverlayCommand[] {
  return clampCommands(
    [
      ...gridCommands(camId, pose, spacingCm),
      ...markerCommands(camId, pose, payload.tomatoes, payload.targetTomatoId),
      ...toolCommands(camId, pose, payload),
      ...headerCommands(camId, pose, payload, spacingCm),
    ],
    VIEW_SIZE_PX,
  );
}

import type { CameraId, DetectorKind } from '@tomato/shared';

/** Provenance d'une étape : d'où sort vraiment ce que la tuile montre (issue #36). */
export type StageSource = 'camera' | 'opencv' | 'model' | 'logic' | 'calibration' | 'robot' | 'sim' | 'physics' | 'output';

export const SOURCE_LABEL: Record<StageSource, string> = {
  camera: 'caméra',
  opencv: 'OpenCV',
  model: 'modèle',
  logic: 'logique',
  calibration: 'calibration caméra',
  robot: 'état robot',
  sim: 'simulation',
  physics: 'physique',
  output: 'sortie',
};

export const STAGE_KEYS = ['raw', 'clahe', 'edges', 'detect', 'match', 'grid', 'tools', 'markers', 'fall', 'final'] as const;
export type StageKey = (typeof STAGE_KEYS)[number];

/** Nom sans ambiguïté du détecteur réellement actif (issue #36). */
export function detectorName(detector: DetectorKind, inputPx: number): string {
  return detector === 'yolo' ? `YOLOv8n ONNX ${inputPx}` : `seuillage HSV ${inputPx}`;
}

export const CAMERA_LABEL: Record<CameraId, string> = { top: 'dessus', front: 'face', side: 'côté' };

export interface PipelineInfo {
  camera: CameraId;
  detector: DetectorKind;
  /** Durée de l'inférence sur cette image, en ms ; null si le détecteur n'a pas tourné. */
  inferenceMs: number | null;
  detections: number;
  matched: number;
  /** true quand OpenCV.js est chargé (Canny + CLAHE) ; false = repli Sobel sans égalisation. */
  canny: boolean;
  inputPx: number;
  viewPx: number;
}

export interface StageSpec {
  key: StageKey;
  title: string;
  source: StageSource;
  /** Étiquette affichée ; détaillée pour le détecteur (« modèle YOLOv8n ONNX 640 »). */
  sourceLabel: string;
  /** Ligne « entrée → sortie ». */
  io: string;
  caption: string;
}

const ms = (v: number | null): string => (v === null ? 'non exécuté' : `${v.toFixed(1)} ms`);

/**
 * Modèle de données du mode « Pipeline de traitement » (touche `x`) : la chaîne des étapes réellement
 * exécutées pour produire la vue d'une caméra, chacune avec sa provenance honnête. Fonction pure.
 */
export function pipelineStages(info: PipelineInfo): StageSpec[] {
  const { camera, detector, detections, matched, canny, inputPx, viewPx } = info;
  const px = `${viewPx}×${viewPx}`;
  return [
    {
      key: 'raw',
      title: '1. Image caméra brute',
      source: 'camera',
      sourceLabel: SOURCE_LABEL.camera,
      io: `scène 3D → RGBA ${px}`,
      caption: `Le rendu orthographique de la caméra ${CAMERA_LABEL[camera]}, sans aucune annotation : ce que « voit » le capteur.`,
    },
    {
      key: 'clahe',
      title: canny ? '2. Prétraitement CLAHE' : '2. Niveaux de gris (repli)',
      source: 'opencv',
      sourceLabel: canny ? SOURCE_LABEL.opencv : `${SOURCE_LABEL.opencv} absent`,
      io: `RGBA ${px} → plan de gris ${px}`,
      caption: canny
        ? 'Niveaux de gris puis égalisation locale d’histogramme (clip 2, tuiles 8×8) : les zones sombres reprennent du contraste.'
        : 'OpenCV.js n’est pas chargé : gris simple, sans égalisation.',
    },
    {
      key: 'edges',
      title: canny ? '3. Contours Canny 50/150' : '3. Contours Sobel (repli)',
      source: 'opencv',
      sourceLabel: canny ? SOURCE_LABEL.opencv : `${SOURCE_LABEL.opencv} absent`,
      io: 'plan de gris → contours blancs, composés sur le rendu assombri à 35 %',
      caption: 'La couche 1 des vues de l’agent : le fond est assombri pour que les contours et les annotations ressortent.',
    },
    {
      key: 'detect',
      title: '4. Détection de maturité',
      source: 'model',
      sourceLabel: detector === 'yolo' ? `modèle ${detectorName(detector, inputPx)}` : detectorName(detector, inputPx),
      io: `RGBA ${inputPx}×${inputPx} → ${detections} boîte(s) : classe + confiance`,
      caption: `Le détecteur actif tourne sur l’image brute réduite. Inférence : ${ms(info.inferenceMs)}. C’est la seule étape qui décide « mûre ».`,
    },
    {
      key: 'match',
      title: '5. Association boîte → tomate',
      source: 'logic',
      sourceLabel: SOURCE_LABEL.logic,
      io: `${detections} boîte(s) + centres projetés → ${matched} identifiant(s)`,
      caption: 'Chaque boîte reçoit l’identifiant de la tomate dont le centre 3D se projette le plus près (rayon 0,75 × côté de la boîte). Aucune maturité de la simulation n’intervient.',
    },
    {
      key: 'grid',
      title: '6. Grille, axes et échelle',
      source: 'calibration',
      sourceLabel: SOURCE_LABEL.calibration,
      io: 'pose de la caméra → repère métrique dessiné',
      caption: 'Calculée depuis la pose et le champ de la caméra : c’est ce qui rend la vue mesurable en centimètres.',
    },
    {
      key: 'tools',
      title: '7. Ciseaux et panier',
      source: 'robot',
      sourceLabel: SOURCE_LABEL.robot,
      io: 'état du bras → schémas d’outils',
      caption: 'Position et angle des lames, contour du panier : l’état réel du robot, comme un encodeur le donnerait.',
    },
    {
      key: 'markers',
      title: '8. Repères de tomates et ligne de tige',
      source: 'sim',
      sourceLabel: SOURCE_LABEL.sim,
      io: 'positions, identifiants et tiges de la sim → repères',
      caption: 'Ces cercles, ces identifiants et cette ligne de tige viennent de la simulation, pas de l’image : c’est l’aide assumée donnée à l’agent.',
    },
    {
      key: 'fall',
      title: '9. Ligne de chute prévue',
      source: 'physics',
      sourceLabel: SOURCE_LABEL.physics,
      io: 'cible + panier → verticale de chute',
      caption: 'La trajectoire verticale attendue après la coupe, tracée jusqu’au plan du panier.',
    },
    {
      key: 'final',
      title: '10. Vue finale envoyée à l’agent',
      source: 'output',
      sourceLabel: SOURCE_LABEL.output,
      io: `couches empilées → PNG ${px}`,
      caption: 'Exactement l’image que `get_views` renvoie à l’agent, en-tête et étiquettes comprises.',
    },
  ];
}

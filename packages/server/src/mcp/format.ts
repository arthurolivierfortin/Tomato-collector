import { VIEW_SIZE_PX, type ActionResult, type CameraId, type CameraPose, type Vec3, type ViewImage } from '@tomato/shared';

export interface TextBlock {
  type: 'text';
  text: string;
}
export interface ImageBlock {
  type: 'image';
  data: string;
  mimeType: 'image/png';
}
export type ContentBlock = TextBlock | ImageBlock;

export const text = (t: string): TextBlock => ({ type: 'text', text: t });
export const png = (image: ViewImage): ImageBlock => ({ type: 'image', data: image.pngBase64, mimeType: 'image/png' });

/** Nombre en français : au plus une décimale, virgule, sans décimale inutile (12 → « 12 », 1,44 → « 1,4 »). */
export function fr(n: number): string {
  const r = Math.round(n * 10) / 10;
  return (Number.isInteger(r) ? String(r) : r.toFixed(1)).replace('.', ',');
}

export const frVec = (v: Vec3): string => `X ${fr(v[0])}, Y ${fr(v[1])}, Z ${fr(v[2])}`;

/** JSON compact : nombres arrondis à deux décimales. */
export function compactJson(value: unknown): string {
  return JSON.stringify(value, (_key: string, v: unknown) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v));
}

/** Remplaçant des images dans le résultat diffusé au dashboard (issue #22 : jamais de base64 dans la trace). */
export const IMAGE_PLACEHOLDER = `<image ${VIEW_SIZE_PX}×${VIEW_SIZE_PX}>`;

/** Un bloc de texte qui est un objet ou un tableau JSON redevient cette valeur ; sinon il reste du texte. */
function parsedText(t: string): unknown {
  const trimmed = t.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return t;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return t;
  }
}

/**
 * Résultat d'outil diffusé dans `tool_call_result.result` : les blocs texte JSON deviennent des objets,
 * les images un simple `<image 800×800>` (jamais de base64), un bloc unique n'est pas enveloppé.
 */
export function resultPayload(content: ContentBlock[]): unknown {
  const blocks = content.map((b) => (b.type === 'image' ? IMAGE_PLACEHOLDER : parsedText(b.text)));
  if (blocks.length === 0) return null;
  return blocks.length === 1 ? blocks[0] : blocks;
}

const VIEW_AXES: Record<CameraId, string> = { top: 'X→ Y↑', front: 'X→ Z↑', side: 'Y→ Z↑' };

/** « Vue front — axes X→ Z↑ — 8 px/cm », placé avant chaque image. */
export function viewHeader(image: ViewImage, pose: CameraPose): string {
  return `Vue ${image.camera} — axes ${VIEW_AXES[image.camera]} — ${fr(pose.pxPerCm)} px/cm`;
}

/** Détails numériques d'une erreur : « 1,4 cm, 62° ». */
export function detailsText(details: Record<string, number | string> | undefined): string {
  if (!details) return '';
  return Object.entries(details)
    .map(([k, v]) => {
      if (typeof v !== 'number') return `${k} ${v}`;
      if (k.endsWith('Cm')) return `${fr(v)} cm`;
      if (k.endsWith('Deg')) return `${fr(v)}°`;
      return `${k} ${fr(v)}`;
    })
    .join(', ');
}

/** Texte d'un ActionResult pour l'agent : « ok : message » + JSON ciblé, ou « code : message (détails) ». */
export function actionResultText(r: ActionResult, focus?: unknown): string {
  if (r.ok) return focus === undefined ? `ok : ${r.message}` : `ok : ${r.message}\n${compactJson(focus)}`;
  const d = detailsText(r.details);
  return d === '' ? `${r.error} : ${r.message}` : `${r.error} : ${r.message} (${d})`;
}

function failText(r: ActionResult): string {
  if (r.ok) return r.message;
  const d = detailsText(r.details);
  return d === '' ? r.error : `${r.error}, ${d}`;
}

/** Résumé d'une ligne en français d'un résultat d'outil de mouvement ou de coupe. */
export function summarizeAction(tool: string, r: ActionResult): string {
  const s = r.state;
  switch (tool) {
    case 'move_scissors':
      return r.ok ? `ciseaux vers ${frVec(s.scissors.cutPointCm)}` : `ciseaux : ${failText(r)}`;
    case 'rotate_scissors':
      return r.ok
        ? `ciseaux lacet ${fr(s.scissors.yawDeg)}, tangage ${fr(s.scissors.pitchDeg)}, roulis ${fr(s.scissors.rollDeg)}`
        : `rotation : ${failText(r)}`;
    case 'open_scissors':
      return r.ok ? `ciseaux ouverts (${fr(s.scissors.openingDeg)}°)` : `ouverture : ${failText(r)}`;
    case 'cut':
      return `coupe : ${r.ok ? r.message : failText(r)}`;
    case 'move_basket':
      return r.ok ? `panier à X ${fr(s.basket.centerCm[0])}, Y ${fr(s.basket.centerCm[1])}` : `panier : ${failText(r)}`;
    default:
      return r.ok ? `${tool} : ${r.message}` : `${tool} : ${failText(r)}`;
  }
}

import { radToDeg, VIEW_SIZE_PX, vlen, vsub, type ActionResult, type CameraId, type CameraPose, type Vec3, type ViewImage, type ViewsPayload } from '@tomato/shared';

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

function parseJson(t: string): unknown {
  const trimmed = t.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return undefined;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * Un bloc de texte devient une ou deux valeurs : du JSON pur redevient un objet, et « ok : … \n{…} »
 * (le format de `actionResultText`) devient la phrase suivie de l'objet, jamais du JSON échappé.
 */
function textParts(t: string): unknown[] {
  const whole = parseJson(t);
  if (whole !== undefined) return [whole];
  const cut = t.indexOf('\n');
  if (cut === -1) return [t];
  const tail = parseJson(t.slice(cut + 1));
  return tail === undefined ? [t] : [t.slice(0, cut).trim(), tail];
}

/**
 * Résultat d'outil diffusé dans `tool_call_result.result` : les blocs texte JSON deviennent des objets,
 * les images un simple `<image 800×800>` (jamais de base64), un bloc unique n'est pas enveloppé.
 */
export function resultPayload(content: ContentBlock[]): unknown {
  const blocks = content.flatMap((b) => (b.type === 'image' ? [IMAGE_PLACEHOLDER] : textParts(b.text)));
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

/**
 * Pose absolue (roulis 0) qui met la normale des lames sur la direction de tige `d`.
 *
 * L'orientation des ciseaux est `Rz(lacet) · Ry(tangage) · Rx(roulis)` appliquée à la normale de base
 * `[0, 0, 1]` (`packages/sim/src/robot/rotation.ts`), d'où la forme fermée, à roulis nul :
 *
 *     bladeNormal = (sin(tangage)·cos(lacet), sin(tangage)·sin(lacet), cos(tangage))
 *
 * On oriente `d` vers le haut (`dz ≥ 0`), puis `lacet = atan2(dy, dx)` et `tangage = arccos(dz)`.
 * La pose `lacet ∓ 180°, −tangage` donne la même normale : on retient celle dont le lacet reste dans
 * ±90°, la seule qui garde les lames tournées vers le plant (axe des lames en −X, base du bras en +X).
 * `null` si la direction est dégénérée.
 */
export function bladeAnglesForStem(d: Vec3): { yawDeg: number; pitchDeg: number } | null {
  const l = vlen(d);
  if (l < 1e-9) return null;
  const s = d[2] < 0 ? -1 / l : 1 / l;
  const [dx, dy, dz] = [d[0] * s, d[1] * s, Math.min(1, Math.abs(d[2] / l))];
  if (Math.hypot(dx, dy) < 1e-9) return { yawDeg: 0, pitchDeg: 0 };
  const yawDeg = radToDeg(Math.atan2(dy, dx));
  const pitchDeg = radToDeg(Math.acos(dz));
  if (Math.abs(yawDeg) <= 90) return { yawDeg, pitchDeg };
  return { yawDeg: yawDeg - Math.sign(yawDeg) * 180, pitchDeg: -pitchDeg };
}

/** Ligne `suggestedScissors` jointe aux vues : la pose prête à envoyer à `rotate_scissors` pour la tige cible. */
export function suggestedScissorsText(json: ViewsPayload): string | null {
  const id = json.targetTomatoId;
  const target = id === null ? undefined : json.tomatoes.find((t) => t.id === id);
  if (target === undefined) return null;
  const angles = bladeAnglesForStem(vsub(target.stem.toCm, target.stem.fromCm));
  if (angles === null) return null;
  return `suggestedScissors for target stem #${id} (rotate_scissors, mode absolute, roll 0): ${compactJson(angles)}`;
}

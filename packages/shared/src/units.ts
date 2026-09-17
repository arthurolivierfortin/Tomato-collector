/** Vecteur 2D en centimètres (ou en pixels selon le contexte, toujours documenté). */
export type Vec2 = readonly [number, number];
/** Vecteur 3D en centimètres, repère monde : X droite, Y arrière, Z haut. */
export type Vec3 = readonly [number, number, number];

export const degToRad = (deg: number): number => (deg * Math.PI) / 180;
export const radToDeg = (rad: number): number => (rad * 180) / Math.PI;

export const vadd = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const vsub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const vscale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const vdot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const vlen = (a: Vec3): number => Math.sqrt(vdot(a, a));
export const vnorm = (a: Vec3): Vec3 => {
  const l = vlen(a);
  return l === 0 ? [0, 0, 0] : vscale(a, 1 / l);
};

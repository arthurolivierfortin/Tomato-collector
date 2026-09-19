import { describe, expect, it } from 'vitest';
import { DEFAULT_STYLE, type Format } from './style';
import { SPLIT, splitComplex, splitFilters, splitLayout, type SplitSpec } from './split';

const FORMAT: Format = { width: 1920, height: 1080, fps: 30 };

/** Les deux rectangles mesurés sur une image de la prise `detection` (1920×1080, contrôles masqués). */
const SPEC: SplitSpec = {
  left: { x: 0, y: 84, w: 800, h: 870 },
  right: { x: 806, y: 496, w: 358, h: 352 },
  leftRatio: 0.55,
  title: 'What the model sees, live',
};

describe('splitLayout', () => {
  it('pave toute la largeur : les deux volets se touchent et rien ne dépasse', () => {
    const layout = splitLayout(SPEC, FORMAT);
    expect(layout.left.pane.x).toBe(0);
    expect(layout.left.pane.x + layout.left.pane.w).toBe(layout.right.pane.x);
    expect(layout.right.pane.x + layout.right.pane.w).toBe(FORMAT.width);
    expect(layout.left.pane.w).toBeCloseTo(FORMAT.width * SPEC.leftRatio, -1);
  });

  it('laisse en haut une bande de titre, et donne le reste aux deux volets', () => {
    const layout = splitLayout(SPEC, FORMAT);
    expect(layout.titleHeight).toBeGreaterThan(0);
    expect(layout.contentHeight).toBe(FORMAT.height - layout.titleHeight);
    expect(layout.left.pane.h).toBe(layout.contentHeight);
    expect(layout.right.pane.h).toBe(layout.contentHeight);
    expect(layout.left.pane.y).toBe(layout.titleHeight);
  });

  it('garde les proportions de chaque source et la tient dans son volet, marge comprise', () => {
    const layout = splitLayout(SPEC, FORMAT);
    for (const [pane, source] of [
      [layout.left, SPEC.left],
      [layout.right, SPEC.right],
    ] as const) {
      expect(pane.scaled.w / pane.scaled.h).toBeCloseTo(source.w / source.h, 2);
      expect(pane.scaled.w).toBeLessThanOrEqual(pane.pane.w - 2 * SPLIT.padding);
      expect(pane.scaled.h).toBeLessThanOrEqual(pane.pane.h - 2 * SPLIT.padding);
      // Dimensions paires : yuv420p refuse les impaires.
      expect(pane.scaled.w % 2).toBe(0);
      expect(pane.scaled.h % 2).toBe(0);
    }
  });

  it('agrandit le panneau Perception plus que la vue spectateur : c’est lui qu’on vient lire', () => {
    const layout = splitLayout(SPEC, FORMAT);
    const leftFactor = layout.left.scaled.w / SPEC.left.w;
    const rightFactor = layout.right.scaled.w / SPEC.right.w;
    expect(rightFactor).toBeGreaterThan(2);
    expect(rightFactor).toBeGreaterThan(leftFactor);
  });

  it('colle les deux images aux bords extérieurs : le jeu part au milieu', () => {
    // Le bandeau de sous-titre est posé à `captionX` de la gauche de l'image, comme partout
    // ailleurs dans le film : l'image de gauche doit donc commencer au bord, pas au centre de son
    // volet, sinon le bandeau déborde à sa gauche, sur le fond.
    const layout = splitLayout(SPEC, FORMAT);
    // La vue spectateur va jusqu'au bord de l'image ; le panneau garde la marge de son liseré.
    expect(layout.left.at.x).toBe(0);
    expect(layout.right.at.x + layout.right.scaled.w).toBe(FORMAT.width - SPLIT.padding);
    const gutter = layout.right.at.x - (layout.left.at.x + layout.left.scaled.w);
    expect(gutter).toBeGreaterThan(2 * SPLIT.padding);
  });

  it('laisse le bandeau de sous-titre entièrement sur la vue spectateur', () => {
    const layout = splitLayout(SPEC, FORMAT);
    const bandLeft = DEFAULT_STYLE.captionX - DEFAULT_STYLE.bandPadding;
    const bandRight = DEFAULT_STYLE.captionX + DEFAULT_STYLE.captionWidth + DEFAULT_STYLE.bandPadding;
    expect(bandLeft).toBeGreaterThanOrEqual(layout.left.at.x);
    expect(bandRight).toBeLessThanOrEqual(layout.left.at.x + layout.left.scaled.w);
  });

  it('pose chaque image dans son volet, sans jamais mordre sur l’autre', () => {
    const layout = splitLayout(SPEC, FORMAT);
    expect(layout.left.at.x).toBeGreaterThanOrEqual(layout.left.pane.x);
    expect(layout.left.at.x + layout.left.scaled.w).toBeLessThanOrEqual(layout.right.pane.x);
    expect(layout.right.at.x).toBeGreaterThanOrEqual(layout.right.pane.x);
    expect(layout.right.at.x + layout.right.scaled.w).toBeLessThanOrEqual(FORMAT.width);
    for (const pane of [layout.left, layout.right]) {
      expect(pane.at.y).toBeGreaterThanOrEqual(layout.titleHeight);
      expect(pane.at.y + pane.scaled.h).toBeLessThanOrEqual(FORMAT.height);
      // Offsets de `pad`, relatifs au volet : c'est ce que ffmpeg reçoit.
      expect(pane.offset.x).toBe(pane.at.x - pane.pane.x);
      expect(pane.offset.y).toBe(pane.at.y - pane.pane.y);
    }
  });

  it('laisse le liseré du panneau Perception entièrement dans l’image', () => {
    const layout = splitLayout(SPEC, FORMAT);
    const t = DEFAULT_STYLE.highlightThickness;
    expect(layout.right.at.x - t).toBeGreaterThanOrEqual(0);
    expect(layout.right.at.x + layout.right.scaled.w + t).toBeLessThanOrEqual(FORMAT.width);
    expect(layout.right.at.y - t).toBeGreaterThanOrEqual(0);
    expect(layout.right.at.y + layout.right.scaled.h + t).toBeLessThanOrEqual(FORMAT.height);
  });

  it('ramène un rectangle qui déborde dans les bornes de l’image', () => {
    const layout = splitLayout({ ...SPEC, right: { x: 1800, y: 1000, w: 400, h: 400 } }, FORMAT);
    expect(layout.right.crop.x + layout.right.crop.w).toBeLessThanOrEqual(FORMAT.width);
    expect(layout.right.crop.y + layout.right.crop.h).toBeLessThanOrEqual(FORMAT.height);
  });
});

describe('splitFilters', () => {
  const layout = splitLayout(SPEC, FORMAT);
  const filters = splitFilters(layout, DEFAULT_STYLE, '0x0E1116', 'C:/tmp/title.txt', ['drawtext=caption']);
  const graph = filters.join(';');

  it('dédouble la source, recadre chaque volet à son rectangle mesuré', () => {
    expect(graph).toContain('split=2');
    expect(graph).toContain(`crop=${SPEC.left.w}:${SPEC.left.h}:${SPEC.left.x}:${SPEC.left.y}`);
    expect(graph).toContain(`crop=${SPEC.right.w}:${SPEC.right.h}:${SPEC.right.x}:${SPEC.right.y}`);
  });

  it('met chaque volet à l’échelle en lanczos, puis assemble à l’horizontale', () => {
    expect(graph).toContain(`scale=${layout.left.scaled.w}:${layout.left.scaled.h}:flags=lanczos`);
    expect(graph).toContain(`scale=${layout.right.scaled.w}:${layout.right.scaled.h}:flags=lanczos`);
    expect(graph).toContain('hstack=inputs=2');
  });

  it('réserve la bande de titre par un pad du haut, et y écrit le titre', () => {
    expect(graph).toContain(`pad=${FORMAT.width}:${FORMAT.height}:0:${layout.titleHeight}`);
    expect(graph).toContain("textfile='C\\:/tmp/title.txt'");
    expect(graph).toContain('expansion=none');
  });

  it('ceint le panneau Perception du liseré des cadres, aux coordonnées de l’image finale', () => {
    const t = DEFAULT_STYLE.highlightThickness;
    expect(graph).toContain(
      `drawbox=x=${layout.right.at.x - t}:y=${layout.right.at.y - t}:w=${layout.right.scaled.w + 2 * t}:h=${layout.right.scaled.h + 2 * t}`,
    );
  });

  it('grave les sous-titres après le montage, et finit en yuv420p', () => {
    const last = filters[filters.length - 1] ?? '';
    expect(last).toContain('drawtext=caption');
    expect(last.indexOf('drawtext=caption')).toBeLessThan(last.indexOf('format=yuv420p'));
    expect(last.endsWith('[out]')).toBe(true);
  });
});

describe('splitComplex', () => {
  it('rend un graphe complet, de [0:v] à [out], sans étiquette pendante', () => {
    const layout = splitLayout(SPEC, FORMAT);
    const graph = splitComplex(layout, DEFAULT_STYLE, FORMAT, '0x0E1116', 'C:/tmp/title.txt', []);
    expect(graph.startsWith('[0:v]')).toBe(true);
    expect(graph.endsWith('[out]')).toBe(true);
    const produced = [...graph.matchAll(/\[([a-z]+)\](?=;|$)/g)].map((m) => m[1]);
    const consumed = [...graph.matchAll(/(?:^|;)((?:\[[a-z]+\])+)/g)].flatMap((m) => [...(m[1] ?? '').matchAll(/\[([a-z]+)\]/g)].map((x) => x[1]));
    for (const label of produced) {
      if (label === 'out') continue;
      expect(consumed).toContain(label);
    }
  });
});

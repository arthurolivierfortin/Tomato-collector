import { describe, expect, it } from 'vitest';
import { DEFAULT_STYLE, type Format } from './ffmpegFilters';
import { pipelineTile } from '../plans/zones';
import { stackTops, textLineHeight, zoomBlockHeight, zoomChain, zoomLayout, zoomLines, zoomWrapChars, ZOOM, type ZoomBlock } from './zoom';

const FORMAT: Format = { width: 1920, height: 1080, fps: 30 };

describe('zoomLayout', () => {
  it('agrandit une tuile du pipeline jusqu’à 85 % de la hauteur de l’image', () => {
    const layout = zoomLayout(pipelineTile(0), FORMAT);
    // 372 × 500 à l'écran : illisible. 85 % de 1080, c'est 918, soit un facteur 1,84.
    expect(layout.scaled.h).toBeGreaterThanOrEqual(0.84 * FORMAT.height);
    expect(layout.scaled.h).toBeLessThanOrEqual(0.86 * FORMAT.height);
    expect(layout.scaled.w / layout.scaled.h).toBeCloseTo(372 / 500, 2);
  });

  it('ne rend que des dimensions paires : yuv420p n’accepte pas les impaires', () => {
    for (const i of [0, 4, 5, 9]) {
      const { scaled } = zoomLayout(pipelineTile(i), FORMAT);
      expect(scaled.w % 2).toBe(0);
      expect(scaled.h % 2).toBe(0);
    }
  });

  it('centre la tuile agrandie verticalement et la garde dans l’image', () => {
    const { at, scaled } = zoomLayout(pipelineTile(7), FORMAT);
    expect(at.x).toBeGreaterThanOrEqual(0);
    expect(at.y).toBeGreaterThanOrEqual(0);
    expect(at.x + scaled.w).toBeLessThanOrEqual(FORMAT.width);
    expect(at.y + scaled.h).toBeLessThanOrEqual(FORMAT.height);
    expect(at.y).toBeCloseTo((FORMAT.height - scaled.h) / 2, 0);
  });

  it('pose la colonne de texte à droite de la tuile, jamais dessus', () => {
    for (let i = 0; i < 10; i += 1) {
      const layout = zoomLayout(pipelineTile(i), FORMAT);
      expect(layout.textX).toBeGreaterThanOrEqual(layout.at.x + layout.scaled.w);
      expect(layout.textWidth).toBeGreaterThanOrEqual(ZOOM.minTextWidth);
      expect(layout.textX + layout.textWidth).toBeLessThanOrEqual(FORMAT.width);
    }
  });

  it('reprend la grille de `pipelineTile` telle quelle : c’est elle qui sait où sont les tuiles', () => {
    expect(zoomLayout(pipelineTile(6), FORMAT).crop).toEqual(pipelineTile(6));
  });

  it('rabote une zone trop large plutôt que d’étouffer le texte', () => {
    // Une zone panoramique : mise à 85 % de la hauteur, elle déborderait sur toute la largeur.
    const layout = zoomLayout({ x: 0, y: 0, w: 1600, h: 500 }, FORMAT);
    expect(layout.textWidth).toBeGreaterThanOrEqual(ZOOM.minTextWidth);
    expect(layout.at.x + layout.scaled.w).toBeLessThanOrEqual(layout.textX);
  });

  it('ramène dans l’image une zone qui en sort', () => {
    const { crop } = zoomLayout({ x: 1800, y: 1000, w: 400, h: 400 }, FORMAT);
    expect(crop.x + crop.w).toBeLessThanOrEqual(FORMAT.width);
    expect(crop.y + crop.h).toBeLessThanOrEqual(FORMAT.height);
  });
});

describe('zoomLines', () => {
  it('écrit les trois éléments dans l’ordre, préfixés une seule fois pour tout le montage', () => {
    expect(zoomLines({ source: pipelineTile(3), input: 'the raw frame', by: 'model YOLOv8n ONNX', output: '8 boxes' })).toEqual([
      'Input: the raw frame',
      'Done by: model YOLOv8n ONNX',
      'Output: 8 boxes',
    ]);
  });
});

describe('stackTops', () => {
  it('empile les blocs sans les faire se recouvrir, centrés sur le milieu', () => {
    const heights = [80, 60, 60, 120];
    const tops = stackTops(heights, 20, 540);
    for (const [i, top] of tops.entries()) {
      const next = tops[i + 1];
      if (next !== undefined) expect(next).toBeGreaterThanOrEqual(top + (heights[i] ?? 0));
    }
    const total = 320 + 60;
    expect(tops[0]).toBe(540 - total / 2);
  });

  it('rend une pile vide pour une liste vide', () => {
    expect(stackTops([], 20, 540)).toEqual([]);
  });
});

describe('zoomFilters', () => {
  const blocks: ZoomBlock[] = [
    { file: 'C:/work/zoom-0.txt', lines: 1, size: 36, color: 'white' },
    { file: 'C:/work/zoom-1.txt', lines: 2, size: 32, color: 'white' },
    { file: 'C:/work/zoom-2.txt', lines: 1, size: 32, color: '0x7DD3FC' },
    { file: 'C:/work/zoom-3.txt', lines: 2, size: 32, color: 'white' },
  ];
  const chainOf = (): string => zoomChain(zoomLayout(pipelineTile(3), FORMAT), blocks, DEFAULT_STYLE, FORMAT, '0x0E1116', 4);

  it('recadre, agrandit en lanczos, puis pose la tuile sur un fond sombre', () => {
    const tile = pipelineTile(3);
    const layout = zoomLayout(tile, FORMAT);
    const filters = chainOf();
    expect(filters).toContain(`crop=${tile.w}:${tile.h}:${tile.x}:${tile.y}`);
    expect(filters).toContain(`scale=${layout.scaled.w}:${layout.scaled.h}:flags=lanczos`);
    expect(filters).toContain(`pad=1920:1080:${layout.at.x}:${layout.at.y}:color=0x0E1116`);
    expect(filters.endsWith('format=yuv420p')).toBe(true);
  });

  it('fond en entrée et en sortie : l’agrandissement s’installe, il ne surgit pas', () => {
    expect(chainOf()).toContain('fade=t=in:st=0:d=0.3');
    expect(chainOf()).toContain('fade=t=out:st=3.70:d=0.3');
  });

  it('écrit chaque texte dans la colonne de droite, jamais sur la tuile', () => {
    const layout = zoomLayout(pipelineTile(3), FORMAT);
    const xs = [...chainOf().matchAll(/drawtext=[^,]*?:x=(\d+):/g)].map((m) => Number(m[1]));
    expect(xs).toHaveLength(blocks.length);
    for (const x of xs) expect(x).toBe(layout.textX);
  });

  it('passe les textes par des fichiers et coupe `%` : `expansion=none` est obligatoire', () => {
    const filters = chainOf();
    expect(filters).toContain("textfile='C\\:/work/zoom-0.txt'");
    expect(filters).toContain('expansion=none');
    expect(filters).not.toContain(':text=');
  });

  it('garde la pile de textes dans l’image', () => {
    const tops = stackTops(blocks.map(zoomBlockHeight), 22, 540);
    expect(Math.min(...tops)).toBeGreaterThan(0);
    const last = tops[tops.length - 1] ?? 0;
    expect(last + zoomBlockHeight(blocks[blocks.length - 1] ?? blocks[0]!)).toBeLessThan(FORMAT.height);
  });
});

describe('zoomWrapChars', () => {
  it('coupe plus court quand le corps grossit', () => {
    expect(zoomWrapChars(1000, 32)).toBeGreaterThan(zoomWrapChars(1000, 40));
    expect(zoomWrapChars(120, 32)).toBeGreaterThanOrEqual(12);
  });
});

describe('textLineHeight', () => {
  it('garde l’interligne aéré des sous-titres', () => {
    expect(textLineHeight(32)).toBe(46);
  });
});

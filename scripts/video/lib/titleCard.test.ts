import { describe, expect, it } from 'vitest';
import { DEFAULT_STYLE, type Format } from './style';
import { fadeFilters, signatureBlocks, signatureCardFilters, signatureChain, type SignatureSpec } from './titleCard';

const FORMAT: Format = { width: 1920, height: 1080, fps: 30 };

const FULL: SignatureSpec = {
  title: 'Tomato Collector',
  byline: 'By Arthur-Olivier Fortin',
  subtext: 'A Claude agent harvests tomatoes in a 3D simulation',
};

function bottomOf(blocks: readonly { y: number; height: number }[]): number {
  const last = blocks[blocks.length - 1];
  if (last === undefined) throw new Error('aucun bloc');
  return last.y + last.height;
}

describe('signatureBlocks', () => {
  it('empile le titre, la ligne d’auteur puis le sous-texte, dans cet ordre et sans chevauchement', () => {
    const blocks = signatureBlocks(FULL, FORMAT);
    expect(blocks.map((b) => b.key)).toEqual(['title', 'byline', 'subtext']);
    expect(blocks.map((b) => b.text)).toEqual([FULL.title, FULL.byline, FULL.subtext]);
    for (const [i, block] of blocks.entries()) {
      const previous = blocks[i - 1];
      if (previous !== undefined) expect(block.y).toBeGreaterThanOrEqual(previous.y + previous.height);
    }
  });

  it('écrit le titre en grand, la ligne d’auteur dessous, le sous-texte en petit', () => {
    const [title, byline, subtext] = signatureBlocks(FULL, FORMAT);
    expect(title?.size).toBeGreaterThan(byline?.size ?? 0);
    expect(byline?.size).toBeGreaterThan(subtext?.size ?? 0);
  });

  it('centre la pile verticalement dans l’image', () => {
    const blocks = signatureBlocks(FULL, FORMAT);
    const top = blocks[0]?.y ?? 0;
    expect(Math.abs(top - (FORMAT.height - bottomOf(blocks)))).toBeLessThanOrEqual(1);
  });

  it('centre aussi une signature sans sous-texte, celle du carton de fin', () => {
    const blocks = signatureBlocks({ title: FULL.title, byline: FULL.byline }, FORMAT);
    expect(blocks.map((b) => b.key)).toEqual(['title', 'byline']);
    const top = blocks[0]?.y ?? 0;
    expect(Math.abs(top - (FORMAT.height - bottomOf(blocks)))).toBeLessThanOrEqual(1);
  });

  it('garde toute la pile dans l’image', () => {
    for (const spec of [FULL, { title: FULL.title, byline: FULL.byline }]) {
      const blocks = signatureBlocks(spec, FORMAT);
      expect(blocks[0]?.y).toBeGreaterThan(0);
      expect(bottomOf(blocks)).toBeLessThan(FORMAT.height);
    }
  });
});

describe('signatureCardFilters', () => {
  it('centre chaque bloc horizontalement et le pose à son ordonnée, texte lu dans un fichier UTF-8', () => {
    const filters = signatureCardFilters([{ file: 'C:/work/title.txt', size: 88, color: 'white', y: 420 }], DEFAULT_STYLE);
    expect(filters).toHaveLength(1);
    const filter = filters[0] ?? '';
    expect(filter).toContain('x=(w-text_w)/2');
    expect(filter).toContain('y=420');
    expect(filter).toContain('fontsize=88');
    expect(filter).toContain('fontcolor=white');
    // Accents et « % » : le texte passe par un fichier, et l'expansion est coupée.
    expect(filter).toContain("textfile='C\\:/work/title.txt'");
    expect(filter).toContain('expansion=none');
    expect(filter).toContain('text_align=C');
  });

  it('écrit un filtre par bloc, dans l’ordre reçu', () => {
    const filters = signatureCardFilters(
      [
        { file: 'a.txt', size: 88, color: 'white', y: 400 },
        { file: 'b.txt', size: 44, color: '0xB9C2D0', y: 520 },
      ],
      DEFAULT_STYLE,
    );
    expect(filters).toHaveLength(2);
    expect(filters[1]).toContain('y=520');
    expect(filters[1]).toContain('fontcolor=0xB9C2D0');
  });
});

describe('signatureChain', () => {
  const placed = [
    { file: 'a.txt', size: 88, color: 'white', y: 400 },
    { file: 'b.txt', size: 44, color: 'white', y: 540 },
  ];

  it('grave les textes, puis fond au noir, puis convertit : le fondu emporte le texte avec lui', () => {
    // Aucun de ces filtres ne contient de virgule : la chaîne se relit telle quelle.
    const parts = signatureChain(placed, DEFAULT_STYLE, 4, 0.6).split(',');
    expect(parts.filter((p) => p.startsWith('drawtext='))).toHaveLength(2);
    expect(parts.slice(0, 2).every((p) => p.startsWith('drawtext='))).toBe(true);
    expect(parts.slice(2)).toEqual(['fade=t=in:st=0:d=0.60:color=black', 'fade=t=out:st=3.40:d=0.60:color=black', 'format=yuv420p']);
  });

  it('se passe du fondu sans rien casser', () => {
    const withoutFade = signatureChain(placed, DEFAULT_STYLE, 4, 0);
    expect(withoutFade).not.toContain('fade=');
    expect(withoutFade.endsWith(',format=yuv420p')).toBe(true);
  });
});

describe('fadeFilters', () => {
  it('ouvre et ferme le carton par un fondu au noir', () => {
    expect(fadeFilters(4, 0.6)).toEqual(['fade=t=in:st=0:d=0.60:color=black', 'fade=t=out:st=3.40:d=0.60:color=black']);
  });

  it('ne pose rien quand le carton est trop court pour deux fondus', () => {
    expect(fadeFilters(1, 0.6)).toEqual([]);
  });

  it('ne pose rien quand aucun fondu n’est demandé', () => {
    expect(fadeFilters(4, 0)).toEqual([]);
  });
});

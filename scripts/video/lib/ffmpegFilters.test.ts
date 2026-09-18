import { describe, expect, it } from 'vitest';
import {
  captionFilters,
  chain,
  escapeDrawtextText,
  escapeFilterPath,
  normalizeFilters,
  titleFilters,
  DEFAULT_STYLE,
  bandHeight,
  highlightFilter,
  pickFontFile,
  FONT_CANDIDATES,
  lineCount,
  wrapText,
  CAPTION_MAX_LINES,
} from './ffmpegFilters';

describe('escapeFilterPath', () => {
  it('convertit un chemin Windows en chemin de filtre : slashs, deux-points échappés, apostrophes', () => {
    expect(escapeFilterPath('C:\\Windows\\Fonts\\segoeui.ttf')).toBe("'C\\:/Windows/Fonts/segoeui.ttf'");
  });

  it('laisse un chemin relatif tranquille, entre apostrophes', () => {
    expect(escapeFilterPath('work/cap-01.txt')).toBe("'work/cap-01.txt'");
  });

  it('protège l’apostrophe, qui fermerait la chaîne ffmpeg', () => {
    expect(escapeFilterPath("C:/l'agent/cap.txt")).toBe("'C\\:/l'\\\\''agent/cap.txt'");
  });
});

describe('escapeDrawtextText', () => {
  it('échappe les caractères que drawtext lit comme de la syntaxe', () => {
    expect(escapeDrawtextText('coût : 0,35 $')).toBe('coût \\: 0,35 $');
    expect(escapeDrawtextText("l'agent")).toBe("l\\'agent");
    expect(escapeDrawtextText('a%b\\c')).toBe('a\\%b\\\\c');
  });

  it('laisse les accents intacts : le texte est écrit en UTF-8', () => {
    expect(escapeDrawtextText('Mûrissement, détection, réveil')).toBe('Mûrissement, détection, réveil');
  });
});

describe('normalizeFilters', () => {
  it('met la prise au format de sortie : échelle, remplissage, cadence, format de pixels', () => {
    expect(normalizeFilters({ width: 1920, height: 1080, fps: 30 })).toEqual([
      'scale=1920:1080:force_original_aspect_ratio=decrease',
      'pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black',
      'fps=30',
      'setsar=1',
      'format=yuv420p',
    ]);
  });
});

describe('captionFilters', () => {
  it('pose le bandeau dans le bas de la colonne spectateur, pas sur le bandeau de statuts ni sur le schéma bloc', () => {
    const [box, text] = captionFilters('work/cap-01.txt', DEFAULT_STYLE);
    // Bandeau de 76 px dont le bas est à 145 px du bas de l'image : y 859 → 935 en 1080.
    // ih et non h : dans drawbox, h désigne la hauteur de la boîte, pas celle de l'image.
    expect(box).toBe('drawbox=x=0:y=ih-221:w=800:h=76:color=black@0.78:t=fill');
    expect(text).toContain("textfile='work/cap-01.txt'");
    expect(text).toContain("fontfile='C\\:/Windows/Fonts/segoeui.ttf'");
    // Aligné à gauche avec marge, pas centré sur l'image.
    expect(text).toContain('x=32');
    expect(text).not.toContain('(w-text_w)/2');
    expect(text).toContain('text_align=L');
    // h et non ih : ih n'est pas une variable de drawtext, et ffmpeg 9 segfault dessus.
    expect(text).toContain('y=h-205');
    expect(text).not.toContain('ih');
    expect(text).toContain('fontsize=34');
    // Sans expansion=none, drawtext refuse « mûrit 62 % » (« Stray % near … »).
    expect(text).toContain('expansion=none');
  });

  it('hausse le bandeau quand le sous-titre fait deux lignes, sinon le texte déborde dessous', () => {
    expect(bandHeight(DEFAULT_STYLE, 1)).toBe(76);
    expect(bandHeight(DEFAULT_STYLE, 2)).toBe(120);
    const [box, text] = captionFilters('work/cap-01.txt', DEFAULT_STYLE, 2);
    expect(box).toContain('h=120');
    expect(box).toContain('y=ih-265');
    expect(text).toContain('y=h-249');
  });

  it('reste au-dessus du schéma bloc et sous le bandeau de statuts en 1080', () => {
    const height = bandHeight(DEFAULT_STYLE, CAPTION_MAX_LINES);
    const top = 1080 - DEFAULT_STYLE.captionBottom - height;
    expect(top).toBeGreaterThan(84); // bas du bandeau de statuts et de la pastille de perception
    expect(1080 - DEFAULT_STYLE.captionBottom).toBeLessThan(960); // haut du schéma bloc
    expect(DEFAULT_STYLE.captionX + DEFAULT_STYLE.captionWidth).toBeLessThanOrEqual(800); // colonne spectateur
  });
});

describe('highlightFilter', () => {
  it('entoure la zone donnée par le plan, sans la remplir', () => {
    expect(highlightFilter({ x: 480, y: 980, w: 960, h: 96 }, DEFAULT_STYLE)).toBe(
      'drawbox=x=480:y=980:w=960:h=96:color=0x38BDF8@0.95:t=4',
    );
  });
});

describe('titleFilters', () => {
  it('centre le titre, et descend le sous-titre sous lui quand il y en a un', () => {
    const withSub = titleFilters('work/t.txt', 'work/s.txt', DEFAULT_STYLE);
    expect(withSub).toHaveLength(2);
    expect(withSub[0]).toContain('expansion=none');
    expect(withSub[0]).toContain('fontsize=64');
    expect(withSub[0]).toContain('y=(h-text_h)/2-50');
    expect(withSub[1]).toContain('fontsize=36');
    expect(withSub[1]).toContain('y=(h-text_h)/2+60');
    expect(titleFilters('work/t.txt', null, DEFAULT_STYLE)).toHaveLength(1);
    expect(titleFilters('work/t.txt', null, DEFAULT_STYLE)[0]).toContain('y=(h-text_h)/2');
  });
});

describe('chain', () => {
  it('assemble les filtres avec des virgules en ignorant les vides', () => {
    expect(chain(['fps=30', '', 'setsar=1'])).toBe('fps=30,setsar=1');
    expect(chain([])).toBe('null');
  });
});

describe('wrapText', () => {
  it('coupe aux espaces sans dépasser la largeur demandée', () => {
    expect(wrapText('Mûrissement, détection, réveil, observation, positionnement', 24)).toBe(
      'Mûrissement, détection,\nréveil, observation,\npositionnement',
    );
  });

  it('laisse un texte court sur une ligne', () => {
    expect(wrapText('La coupe', 40)).toBe('La coupe');
    expect(lineCount(wrapText('La coupe', 40))).toBe(1);
  });

  it('garde un mot plus long que la largeur plutôt que de le tronquer', () => {
    expect(wrapText('anticonstitutionnellement ok', 10)).toBe('anticonstitutionnellement\nok');
  });
});

describe('pickFontFile', () => {
  it('prend la première police présente, dans l’ordre des candidates', () => {
    expect(pickFontFile(['a.ttf', 'b.ttf', 'c.ttf'], (p) => p !== 'a.ttf')).toBe('b.ttf');
  });

  it('rend null quand aucune n’est installée, pour que le montage refuse de partir', () => {
    expect(pickFontFile(['a.ttf'], () => false)).toBeNull();
  });

  it('essaie Segoe UI, puis Arial, puis DejaVu', () => {
    expect(FONT_CANDIDATES[0]).toMatch(/segoeui/i);
    expect(FONT_CANDIDATES[1]).toMatch(/arial/i);
    expect(FONT_CANDIDATES.some((f) => /DejaVuSans/.test(f))).toBe(true);
  });
});

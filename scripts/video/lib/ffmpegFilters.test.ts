import { describe, expect, it } from 'vitest';
import {
  captionBackdropFilter,
  captionBandRect,
  captionFilters,
  chain,
  CAPTION_BACKDROP_OPACITY,
  escapeDrawtextText,
  escapeFilterPath,
  normalizeFilters,
  titleFilters,
  DEFAULT_STYLE,
  bandHeight,
  highlightFilter,
  pipComplex,
  pickFontFile,
  FONT_CANDIDATES,
  CAPTION_MAX_LINES,
  captionWrapChars,
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
  it('pose le sous-titre dans le bas de la colonne spectateur, ni sur le bandeau de statuts ni sur le schéma bloc', () => {
    const [text, ...rest] = captionFilters('work/cap-01.txt', DEFAULT_STYLE, 1, 4);
    // Un seul filtre : le fond du sous-titre est celui de drawtext (box=1), pas un bandeau séparé.
    expect(rest).toEqual([]);
    expect(text).toContain("textfile='work/cap-01.txt'");
    expect(text).toContain("fontfile='C\\:/Windows/Fonts/segoeui.ttf'");
    // Aligné à gauche avec marge, pas centré sur l'image.
    expect(text).toContain('x=24');
    expect(text).not.toContain('(w-text_w)/2');
    expect(text).toContain('text_align=L');
    // h et non ih : ih n'est pas une variable de drawtext, et ffmpeg 9 segfault dessus.
    expect(text).toContain('y=h-208');
    expect(text).not.toContain('ih');
    expect(text).toContain('fontsize=31');
    // Sans expansion=none, drawtext refuse « mûrit 62 % » (« Stray % near … »).
    expect(text).toContain('expansion=none');
  });

  it('dessine un fond discret qui épouse le texte, avec une ombre portée', () => {
    const [text] = captionFilters('work/cap-01.txt', DEFAULT_STYLE, 1, 4);
    expect(text).toContain('box=1');
    expect(text).toContain('boxcolor=black@0.7');
    expect(text).toContain('boxborderw=18');
    expect(text).toContain('shadowcolor=black@0.85');
    expect(text).toContain('shadowx=2');
  });

  it('fait entrer et sortir le sous-titre en fondu, sans virgule qui casserait la chaîne', () => {
    const [text = ''] = captionFilters('work/cap-01.txt', DEFAULT_STYLE, 1, 4);
    const alpha = /alpha='([^']+)'/.exec(text);
    expect(alpha).not.toBeNull();
    expect(alpha?.[1]).toContain('lt(t,0.3)');
    expect(alpha?.[1]).toContain('gt(t,3.70)');
  });

  it('n’anime rien sur un sous-plan plus court que deux fondus : il serait invisible', () => {
    expect(captionFilters('work/cap-01.txt', DEFAULT_STYLE, 1, 0.4)[0]).not.toContain('alpha=');
  });

  it('hausse le sous-titre quand il fait deux lignes, sinon le texte déborde dessous', () => {
    expect(bandHeight(DEFAULT_STYLE, 1)).toBe(81);
    expect(bandHeight(DEFAULT_STYLE, 2)).toBe(126);
    expect(captionFilters('work/cap-01.txt', DEFAULT_STYLE, 2, 4)[0]).toContain('y=h-253');
  });

  it('reste au-dessus du schéma bloc et sous le bandeau de statuts en 1080', () => {
    const height = bandHeight(DEFAULT_STYLE, CAPTION_MAX_LINES);
    const top = 1080 - DEFAULT_STYLE.captionBottom - height;
    expect(top).toBeGreaterThan(84); // bas du bandeau de statuts et de la pastille de perception
    expect(1080 - DEFAULT_STYLE.captionBottom).toBeLessThan(960); // haut du schéma bloc
    expect(DEFAULT_STYLE.captionX + DEFAULT_STYLE.captionWidth).toBeLessThanOrEqual(800); // colonne spectateur
  });
});

describe('captionWrapChars', () => {
  it('donne la rupture du bandeau habituel, et celle d’un bandeau rétréci', () => {
    // Le montage coupe le sous-titre à ce nombre de caractères : drawtext ne renvoie pas à la
    // ligne tout seul. Un bandeau moitié moins large, c'est deux fois moins de texte par ligne.
    expect(captionWrapChars(DEFAULT_STYLE, DEFAULT_STYLE.captionWidth)).toBe(50);
    expect(captionWrapChars(DEFAULT_STYLE, 488)).toBe(30);
  });

  it('ne descend jamais sous douze caractères, si étroit soit le bandeau', () => {
    expect(captionWrapChars(DEFAULT_STYLE, 0)).toBe(12);
  });
});

describe('pipComplex', () => {
  const format = { width: 1920, height: 1080, fps: 30 };
  const rect = { x: 1432, y: 620, w: 472, h: 300 };

  it('met la prise au fond, le terminal dans sa zone, et les sous-titres par-dessus', () => {
    const graph = pipComplex(format, rect, DEFAULT_STYLE, ['drawtext=x=1']);
    const steps = graph.split(';');
    expect(steps[0]).toContain('[0:v]scale=1920:1080');
    expect(steps[0]?.endsWith('[bg]')).toBe(true);
    expect(steps[1]).toContain('[1:v]scale=464:292');
    expect(steps[2]).toBe('[bg][pip]overlay=1432:620[framed]');
    expect(steps[3]).toBe('[framed]drawtext=x=1[out]');
  });

  it('encadre l’incrustation d’un liseré plein, de la couleur des cadres de mise en évidence', () => {
    const graph = pipComplex(format, rect, DEFAULT_STYLE, []);
    expect(graph).toContain('pad=472:300:4:4:color=0x38BDF8');
    // Sans sous-titre, la chaîne reste valide : `null` est le filtre neutre de ffmpeg.
    expect(graph).toContain('[framed]null[out]');
  });
});

describe('highlightFilter', () => {
  it('entoure la zone donnée par le plan, sans la remplir', () => {
    expect(highlightFilter({ x: 480, y: 980, w: 960, h: 96 }, DEFAULT_STYLE)).toBe(
      'drawbox=x=480:y=980:w=960:h=96:color=0x38BDF8@0.95:t=4',
    );
  });
});

describe('captionBandRect et captionBackdropFilter', () => {
  const format = { width: 1920, height: 1080, fps: 30 };
  const pipelineStyle = { ...DEFAULT_STYLE, captionBottom: 14 };

  it('donne une bande qui va d’un bord à l’autre et jusqu’au bas de l’image', () => {
    // C'est la réponse au fragment de légende française qui dépassait à droite du sous-titre sur
    // l'écran plein format : rien ne doit rester lisible ni à côté, ni en dessous.
    const rect = captionBandRect(pipelineStyle, 1, format);
    expect(rect.x).toBe(0);
    expect(rect.w).toBe(format.width);
    expect(rect.y + rect.h).toBe(format.height);
    expect(rect.y).toBe(format.height - 14 - bandHeight(pipelineStyle, 1));
  });

  it('monte avec le nombre de lignes, pour rester sous le texte', () => {
    expect(captionBandRect(pipelineStyle, 2, format).y).toBeLessThan(captionBandRect(pipelineStyle, 1, format).y);
  });

  it('remplit le rectangle, sans bordure : c’est un fond, pas un cadre', () => {
    expect(captionBackdropFilter({ x: 0, y: 985, w: 1920, h: 95 }, CAPTION_BACKDROP_OPACITY)).toBe(
      'drawbox=x=0:y=985:w=1920:h=95:color=black@1:t=fill',
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

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
  lineCount,
  wrapText,
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
  it('pose un bandeau semi-transparent en bas et le texte centré dedans', () => {
    const [box, text] = captionFilters('work/cap-01.txt', DEFAULT_STYLE);
    // `ih` et non `h` : dans drawbox, `h` désigne la hauteur de la boîte, pas celle de l'image.
    expect(box).toBe('drawbox=x=0:y=ih-121:w=iw:h=97:color=black@0.72:t=fill');
    expect(text).toContain("textfile='work/cap-01.txt'");
    expect(text).toContain("fontfile='C\\:/Windows/Fonts/segoeui.ttf'");
    expect(text).toContain('x=(w-text_w)/2');
    // `h` et non `ih` : `ih` n'est pas une variable de drawtext, et ffmpeg 9 segfault dessus.
    expect(text).toContain('y=h-97');
    expect(text).not.toContain('ih');
    expect(text).toContain('fontsize=38');
    // Sans `expansion=none`, drawtext refuse « mûrit 62 % » (« Stray % near … »).
    expect(text).toContain('expansion=none');
    // Sans `text_align=C`, la deuxième ligne d'un sous-titre est collée à gauche du bloc.
    expect(text).toContain('text_align=C');
  });

  it('hausse le bandeau quand le sous-titre fait deux lignes, sinon le texte déborde dessous', () => {
    expect(bandHeight(DEFAULT_STYLE, 1)).toBe(97);
    expect(bandHeight(DEFAULT_STYLE, 2)).toBe(146);
    const [box, text] = captionFilters('work/cap-01.txt', DEFAULT_STYLE, 2);
    expect(box).toContain('h=146');
    expect(box).toContain('y=ih-170');
    expect(text).toContain('y=h-146');
  });

  it('peut poser le bandeau en haut, pour ne pas cacher le schéma bloc', () => {
    const [box, text] = captionFilters('work/cap-01.txt', DEFAULT_STYLE, 1, true);
    expect(box).toContain('y=24:');
    expect(text).toContain('y=48');
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

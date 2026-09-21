/**
 * Construction des chaînes de filtres ffmpeg. Tout est pur : aucun process n'est lancé ici, les
 * tests unitaires comparent des chaînes. `ffmpegRun.ts` s'occupe de l'exécution.
 *
 * Échappement sous Windows : un chemin absolu contient `C:\…`, or `:` sépare les options d'un
 * filtre et `\` échappe. On passe donc par `escapeFilterPath` (slashs, `\:`, apostrophes) et les
 * textes accentués passent par `textfile=` (fichier UTF-8) plutôt que par `text=`.
 */

import {
  bandHeight,
  captionLineHeight,
  normalizeFilters,
  PIP_BACKGROUND,
  PIP_BORDER,
  type Format,
  type Rect,
  type TextStyle,
} from './style';

export * from './style';

/** Chemin utilisable dans un filtre : slashs, `:` échappé, entouré d'apostrophes. */
export function escapeFilterPath(path: string): string {
  const slashed = path.replace(/\\/g, '/');
  const quoted = slashed.replace(/'/g, "'\\\\''").replace(/:/g, '\\:');
  return `'${quoted}'`;
}

/** Texte passé en ligne à drawtext (`text=`) ; préférer `textfile=` dès qu'il y a des accents. */
export function escapeDrawtextText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/%/g, '\\%').replace(/:/g, '\\:');
}

/**
 * `expansion=none` : sans ça drawtext interprète `%` et `{}` comme de la syntaxe (strftime, texte
 * dynamique) et refuse un sous-titre aussi banal que « mûrit 62 % » — « Stray % near … ».
 * `text_align` : `C` centre chaque ligne d'un carton, `L` aligne le sous-titre à gauche.
 */
export function drawtextFilter(align: 'C' | 'L', parts: readonly string[]): string {
  return `drawtext=${['expansion=none', `text_align=${align}`, ...parts].join(':')}`;
}

const drawtext = drawtextFilter;

/**
 * Cadre léger autour de la zone qu'un arrêt sur image met en évidence (schéma bloc, trace, vue).
 * Les coordonnées viennent du plan de montage : c'est lui qui sait ce qu'il montre.
 */
export function highlightFilter(rect: Rect, style: TextStyle): string {
  return `drawbox=x=${rect.x}:y=${rect.y}:w=${rect.w}:h=${rect.h}:color=${style.highlightColor}:t=${style.highlightThickness}`;
}



/**
 * Sous-titre : un seul `drawtext`, avec son propre fond (`box=1`) et sa marge (`boxborderw`). Le
 * fond épouse le texte au lieu d'un bandeau pleine largeur : plus discret, et il n'occupe que la
 * zone réservée du bas de la colonne spectateur, donc il ne recouvre ni le bandeau de statuts, ni
 * le schéma bloc, ni la trace, ni les vues. Une ombre portée détache le texte des images claires,
 * et un fondu de `captionFadeS` évite l'apparition brutale à chaque coupe.
 *
 * Piège vérifié : dans `drawtext`, `ih` n'existe pas et ffmpeg 9 segfault si on l'écrit — c'est
 * `h` qui vaut la hauteur de l'image. Et l'expression d'`alpha` doit être entre apostrophes, sinon
 * ses virgules coupent la chaîne de filtres.
 */
export function captionFilters(textFile: string, style: TextStyle, lines = 1, durationS = 0): string[] {
  const height = bandHeight(style, lines);
  const fade = style.captionFadeS;
  const alpha =
    durationS > 2 * fade
      ? [`alpha='if(lt(t,${fade}),t/${fade},if(gt(t,${(durationS - fade).toFixed(2)}),max(0,(${durationS.toFixed(2)}-t)/${fade}),1))'`]
      : [];
  return [
    drawtext('L', [
      `fontfile=${escapeFilterPath(style.fontFile)}`,
      `textfile=${escapeFilterPath(textFile)}`,
      `fontsize=${style.captionSize}`,
      `fontcolor=${style.fontColor}`,
      'box=1',
      `boxcolor=black@${style.bandOpacity}`,
      `boxborderw=${style.bandPadding}`,
      'shadowcolor=black@0.85',
      'shadowx=2',
      'shadowy=2',
      `x=${style.captionX}`,
      `y=h-${style.captionBottom + height - style.bandPadding}`,
      `line_spacing=${captionLineHeight(style) - style.captionSize}`,
      ...alpha,
    ]),
  ];
}

/**
 * Fond plein du bandeau de sous-titre, sur toute la largeur de l'image.
 *
 * Le fond qui épouse le texte est le bon choix sur le dashboard, où le bas de la colonne spectateur
 * est vide. Il ne l'est pas sur un écran plein format comme le traitement des vues : à droite du
 * texte anglais, la rangée de légendes françaises des tuiles dépassait du bandeau et se lisait à
 * moitié. Un segment qui porte `captionFullWidth` fait donc poser, sous le texte, une bande pleine
 * qui va d'un bord à l'autre et jusqu'au bas de l'image : plus rien ne dépasse.
 */
export function captionBackdropFilter(rect: Rect, opacity: number): string {
  return `drawbox=x=${rect.x}:y=${rect.y}:w=${rect.w}:h=${rect.h}:color=black@${opacity}:t=fill`;
}

/**
 * Opacité de cette bande pleine : pleine, justement. À 0,78 puis à 0,92, la rangée de légendes
 * françaises restait perceptible à travers, ce qui était tout le problème. La bande n'est posée que
 * par les segments qui la demandent (`captionFullWidth`), et le seul écran qui la demande a déjà un
 * fond noir : opaque, elle ne se voit pas, elle efface.
 */
export const CAPTION_BACKDROP_OPACITY = 1;

/**
 * Comment l'incrustation occupe sa zone. `contain` met toute la page dedans, quitte à la réduire ;
 * `bottom` la met à la largeur de la zone puis n'en garde que le bas — les dernières lignes de la
 * console, à une échelle où elles se lisent encore, dans un bandeau plus court que la page.
 */
export type PipFit = 'contain' | 'bottom';

/** Zone d'incrustation : le rectangle à remplir et la façon de le remplir. */
export interface PipSpec extends Rect {
  readonly fit?: PipFit;
}

/** Chaîne de filtres qui amène la page du terminal à la taille intérieure de sa zone. */
function pipInner(spec: PipSpec, w: number, h: number): string {
  if (spec.fit === 'bottom') {
    // À la largeur voulue, puis on garde le bas : le défilement de la console fait le reste.
    return `scale=${w}:-2,crop=${w}:${h}:0:ih-${h},setsar=1`;
  }
  return `scale=${w}:${h}:force_original_aspect_ratio=decrease,` + `pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=${PIP_BACKGROUND},setsar=1`;
}

/**
 * Fondu d'entrée de la vignette qui se fait attendre : assez long pour qu'elle arrive au lieu
 * d'apparaître d'un coup, assez court pour qu'on ne se demande pas ce qui se passe.
 */
export const PIP_FADE_S = 0.5;

/**
 * Incrustation d'une seconde source (la capture du terminal) dans la première, avec un liseré de la
 * couleur des cadres de mise en évidence. Le graphe complet est rendu ici : `[0:v]` est la prise,
 * `[1:v]` le terminal, `overlays` les filtres de sous-titre et de cadre à appliquer ensuite.
 *
 * `appearAtS` est le retard de la vignette dans ce sous-plan. Il n'est pas nul quand la fenêtre de
 * l'agent s'ouvre **pendant** le plan : le début du plan n'a alors rien à incruster. Des images
 * transparentes (`tpad`) tiennent la place, l'alpha monte ensuite (`fade`), et l'incrustation elle-
 * même n'est activée qu'à partir de cet instant. La v3 jetait la vignette pour tout le sous-plan
 * dans ce cas-là, ce qui laissait 9,8 s de partie 2 sans terminal à l'image.
 */
export function pipComplex(
  format: Format,
  spec: PipSpec,
  style: TextStyle,
  overlays: readonly string[],
  appearAtS = 0,
): string {
  const border = style.highlightThickness;
  const innerW = spec.w - 2 * border;
  const innerH = spec.h - 2 * border;
  const at = appearAtS.toFixed(3).replace(/\.?0+$/, '');
  const wait =
    appearAtS > 0
      ? `,format=yuva420p,tpad=start_duration=${at}:start_mode=add:color=black@0,fade=t=in:st=${at}:d=${PIP_FADE_S}:alpha=1`
      : '';
  const enable = appearAtS > 0 ? `:enable='gte(t,${at})'` : '';
  return [
    `[0:v]${chain(normalizeFilters(format))}[bg]`,
    `[1:v]${pipInner(spec, innerW, innerH)},` + `pad=${spec.w}:${spec.h}:${border}:${border}:color=${PIP_BORDER}${wait}[pip]`,
    `[bg][pip]overlay=${spec.x}:${spec.y}${enable}[framed]`,
    `[framed]${chain([...overlays])}[out]`,
  ].join(';');
}

/** Deux rectangles se chevauchent-ils ? Sert à prouver qu'une incrustation ne cache rien d'utile. */
export function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** Carton de titre : titre centré, sous-titre optionnel juste dessous. */
export function titleFilters(titleFile: string, subtitleFile: string | null, style: TextStyle): string[] {
  const common = [`fontfile=${escapeFilterPath(style.fontFile)}`, `fontcolor=${style.fontColor}`, 'x=(w-text_w)/2', 'line_spacing=14'];
  if (subtitleFile === null) {
    return [drawtext('C', [...common, `textfile=${escapeFilterPath(titleFile)}`, `fontsize=${style.titleSize}`, 'y=(h-text_h)/2'])];
  }
  return [
    drawtext('C', [...common, `textfile=${escapeFilterPath(titleFile)}`, `fontsize=${style.titleSize}`, 'y=(h-text_h)/2-50']),
    drawtext('C', [
      ...common,
      `textfile=${escapeFilterPath(subtitleFile)}`,
      `fontsize=${style.subtitleSize}`,
      'fontcolor=0xB9C2D0',
      'y=(h-text_h)/2+60',
    ]),
  ];
}

/** Assemble une chaîne de filtres ; `null` est le filtre neutre de ffmpeg, pour une chaîne vide. */
export function chain(filters: readonly string[]): string {
  const kept = filters.filter((f) => f !== '');
  return kept.length === 0 ? 'null' : kept.join(',');
}

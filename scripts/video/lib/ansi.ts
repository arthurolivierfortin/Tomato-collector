/**
 * Conversion des lignes du serveur en HTML pour la page « terminal » du tournage.
 *
 * Le serveur écrit son flux avec des codes ANSI (`logStream.ts`). La page les affiche telles
 * quelles : pas de bibliothèque, pas de CDN — un navigateur headless n'a pas toujours le droit
 * d'aller en chercher une, et une police monospace plus des `<span>` colorés suffisent à ce dont la
 * vidéo a besoin. Tout est pur et testé ici ; la page ne fait que coller le HTML reçu.
 */

/** Les seules couleurs employées par `logStream.ts`, plus le gris des lignes du serveur. */
const ANSI_COLOR: Record<string, string> = {
  '30': '#6B7280',
  '31': '#F87171',
  '32': '#4ADE80',
  '33': '#FBBF24',
  '34': '#60A5FA',
  '35': '#C084FC',
  '36': '#22D3EE',
  '37': '#D1D5DB',
  '90': '#7C8798',
};

/** `[<codes>m`, construit depuis le code du caractère d'échappement : l'écrire en clair dans
 * une expression régulière y poserait un caractère de contrôle, que le lint refuse à juste titre. */
const ANSI_CODE = new RegExp(`${String.fromCharCode(27)}\\[([0-9;]*)m`, 'gu');

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Une ligne ANSI en HTML : chaque bout coloré devient un `<span>`. Un code inconnu ferme la
 * couleur en cours plutôt que d'inventer quelque chose, et le texte est toujours échappé — ce sont
 * des arguments d'outils, ils contiennent des chevrons et des esperluettes.
 */
export function ansiToHtml(line: string): string {
  let out = '';
  let open = false;
  let last = 0;
  const close = (): void => {
    if (open) out += '</span>';
    open = false;
  };
  for (const match of line.matchAll(ANSI_CODE)) {
    out += escapeHtml(line.slice(last, match.index));
    last = match.index + match[0].length;
    const color = ANSI_COLOR[match[1] ?? ''];
    close();
    if (color !== undefined) {
      out += `<span style="color:${color}">`;
      open = true;
    }
  }
  out += escapeHtml(line.slice(last));
  close();
  return out;
}

/** Une page de lignes, et le rang de la suivante : la page en redemande à partir de là. */
export interface Tail {
  readonly next: number;
  readonly lines: readonly string[];
}

/**
 * Les lignes de `content` à partir du rang `from`. La dernière ligne n'est rendue que si elle est
 * terminée par un saut de ligne : sinon la page afficherait une ligne coupée en deux, le temps que
 * le serveur finisse de l'écrire.
 */
export function tailFrom(content: string, from: number): Tail {
  const lastBreak = content.lastIndexOf('\n');
  // `lastIndexOf` rend −1 quand rien n'est encore terminé : `slice(0, -1)` couperait la ligne en cours.
  if (lastBreak < 0) return { next: 0, lines: [] };
  const complete = content.slice(0, lastBreak);
  if (complete === '') return { next: 1, lines: from > 0 ? [] : [''] };
  const all = complete.split('\n');
  const start = Math.max(0, Math.min(from, all.length));
  return { next: all.length, lines: all.slice(start) };
}

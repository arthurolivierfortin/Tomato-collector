/** Mise en forme du texte des cartons et des sous-titres. Pur, testé sans ffmpeg. */

/**
 * Coupe un texte en lignes d'au plus `maxChars` caractères : drawtext ne renvoie pas à la ligne
 * tout seul, un sous-titre trop long sortirait de l'image à gauche et à droite.
 */
export function wrapText(text: string, maxChars: number): string {
  const words = text.split(/\s+/).filter((w) => w !== '');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current === '' ? word : `${current} ${word}`;
    if (next.length > maxChars && current !== '') {
      lines.push(current);
      current = word;
    } else current = next;
  }
  if (current !== '') lines.push(current);
  return lines.join('\n');
}

/** Nombre de lignes du texte : sert à hausser le bandeau quand le sous-titre en fait deux. */
export function lineCount(text: string): number {
  return text.split('\n').length;
}

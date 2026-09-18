import { describe, expect, it } from 'vitest';
import { lineCount, wrapText } from './text';

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


describe('largeur de rupture', () => {
  it('45 caractères tiennent dans un bandeau de 800 px au corps 34, 26 dans un de 450', () => {
    // Même formule que `wrapWidth` de render.ts : (largeur − 4 × marge) / (corps × 0,44).
    const fit = (width: number): number => Math.max(12, Math.floor((width - 4 * 16) / (34 * 0.44)));
    expect(fit(800)).toBe(49);
    expect(fit(450)).toBe(25);
    expect(lineCount(wrapText('L’agent ne voit que ces trois images et du JSON', fit(450)))).toBeLessThanOrEqual(2);
    expect(lineCount(wrapText('Une seule tomate mûrit à la fois ; le passage du vert au rouge prend 15 s de temps simulé', fit(800)))).toBeLessThanOrEqual(2);
  });
});

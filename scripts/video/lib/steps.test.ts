import { describe, expect, it } from 'vitest';
import { ripeningPercent } from './steps';

describe('ripeningPercent', () => {
  it('lit le pourcentage de la cellule « mûrissement » du bandeau de statuts', () => {
    expect(ripeningPercent('tomate 1 : mûrit 62 %')).toBe(62);
    expect(ripeningPercent('tomate 3 : mûrit 5 %')).toBe(5);
  });

  it('compte une tomate mûre pour 100 %', () => {
    expect(ripeningPercent('tomate 1 : mûre')).toBe(100);
  });

  it('rend null quand rien ne mûrit, plutôt que zéro', () => {
    // Zéro voudrait dire « une tomate à 0 % » ; rien ne mûrit, il faut attendre.
    expect(ripeningPercent('—')).toBeNull();
    expect(ripeningPercent('')).toBeNull();
  });
});

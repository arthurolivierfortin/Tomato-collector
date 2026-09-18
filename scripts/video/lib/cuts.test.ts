import { describe, expect, it } from 'vitest';
import { mergeShortSegments } from './cuts';
import { isMontagePlan, type MontagePlan, type ResolvedSegment } from './plan';

const plan: MontagePlan = {
  output: 'demo.mp4',
  width: 1920,
  height: 1080,
  fps: 30,
  segments: [
    { take: 'concepts', from: { marker: 'app' }, to: { marker: 'coupe' }, title: { text: 'Partie 1', durationS: 3 }, caption: 'L’application' },
    { take: 'concepts', from: { marker: 'coupe' }, to: 'end', freezeAt: [{ at: { marker: 'coupe', offsetS: 1 }, durationS: 3, caption: 'La coupe' }] },
  ],
};

describe('mergeShortSegments', () => {
  const seg2 = (fromS: number, toS: number, caption: string): ResolvedSegment => ({
    take: 'cycle',
    video: 'cycle.webm',
    fromS,
    toS,
    caption,
    freezes: [],
  });

  it('fusionne un sous-titre trop bref avec le précédent, et joint les deux phrases (en anglais, comme la vidéo)', () => {
    const merged = mergeShortSegments([seg2(10, 20, 'Positionnement'), seg2(20, 20.4, 'Cut'), seg2(20.4, 26, 'The fall into the basket')], 2.5);
    expect(merged).toHaveLength(2);
    expect(merged[1]).toMatchObject({ fromS: 20, toS: 26, caption: 'Cut, then the fall into the basket' });
  });

  it('ne touche pas à un segment court qui porte un arrêt sur image ou un carton', () => {
    const avecArret: ResolvedSegment = {
      ...seg2(20, 22, 'Contours et détecteur'),
      freezes: [{ atS: 22, durationS: 3.5, caption: 'Le bandeau de détection' }],
    };
    const suite = seg2(22, 30, 'Le schéma bloc');
    // Deux secondes de plan avant trois secondes d'arrêt sur image : le sous-titre se lit très bien.
    expect(mergeShortSegments([avecArret, suite], 2.5)).toEqual([avecArret, suite]);
    const avecTitre: ResolvedSegment = { ...seg2(0, 1, 'Court'), title: { text: 'Partie 1', durationS: 3 } };
    expect(mergeShortSegments([avecTitre, suite], 2.5)).toEqual([avecTitre, suite]);
  });

  it('laisse tranquilles les segments assez longs', () => {
    const entries = [seg2(0, 10, 'Mûrissement'), seg2(10, 20, 'Détection')];
    expect(mergeShortSegments(entries, 2.5)).toEqual(entries);
  });

  it('ne fusionne pas par-dessus un carton ni entre deux prises', () => {
    const card = { card: { text: 'Partie 2', durationS: 3 } };
    const merged = mergeShortSegments([card, seg2(0, 1, 'Bref')], 2.5);
    expect(merged).toHaveLength(2);
    expect(merged[1]).toMatchObject({ caption: 'Bref' });
  });

  it('un segment trop court en tête absorbe le suivant', () => {
    const merged = mergeShortSegments([seg2(0, 1, 'Cut'), seg2(1, 8, 'The fall into the basket')], 2.5);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ fromS: 0, toS: 8, caption: 'Cut, then the fall into the basket' });
  });
});

describe('isMontagePlan', () => {
  it('accepte le plan de la démo relu depuis un JSON', () => {
    expect(isMontagePlan(JSON.parse(JSON.stringify(plan)))).toBe(true);
  });

  it('refuse un plan mal formé plutôt que d’échouer au milieu du montage', () => {
    expect(isMontagePlan({ ...plan, fps: '30' })).toBe(false);
    expect(isMontagePlan({ ...plan, segments: [{ take: 'concepts' }] })).toBe(false);
    expect(isMontagePlan({ ...plan, segments: {} })).toBe(false);
    expect(isMontagePlan(null)).toBe(false);
  });
});

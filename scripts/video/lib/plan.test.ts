import { describe, expect, it } from 'vitest';
import type { TakeMarkers } from './markers';
import { resolvePlan, resolveTime, type MontagePlan, type ResolvedEntry, type ResolvedSegment } from './plan';
import { entryClips, totalDurationS } from './cuts';

const concepts: TakeMarkers = {
  take: 'concepts',
  video: 'concepts.webm',
  mode: 'replay',
  startedAt: '2026-09-18T10:00:00.000Z',
  durationMs: 40_000,
  markers: [
    { name: 'app', atMs: 2000 },
    { name: 'maturite', atMs: 8000 },
    { name: 'coupe', atMs: 20_000 },
    { name: 'fin', atMs: 32_000 },
  ],
};
const takes = new Map([['concepts', concepts]]);

describe('resolveTime', () => {
  it('prend un nombre de secondes tel quel', () => {
    expect(resolveTime(3.5, concepts)).toBe(3.5);
  });

  it('résout un marqueur, avec décalage éventuel', () => {
    expect(resolveTime({ marker: 'coupe' }, concepts)).toBe(20);
    expect(resolveTime({ marker: 'coupe', offsetS: -1.5 }, concepts)).toBe(18.5);
  });

  it('ne descend jamais sous zéro', () => {
    expect(resolveTime({ marker: 'app', offsetS: -10 }, concepts)).toBe(0);
  });

  it('accepte `fin` comme fin de prise', () => {
    expect(resolveTime('end', concepts)).toBe(40);
  });
});

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

/** Rétrécit une entrée résolue en segment : le plan de test n'en produit pas d'autre. */
function seg(entry: ResolvedEntry | undefined): ResolvedSegment {
  if (entry === undefined || 'card' in entry) throw new Error('segment attendu');
  return entry;
}

describe('resolvePlan', () => {
  it('convertit chaque segment en secondes concrètes', () => {
    const [first, second] = resolvePlan(plan, takes);
    expect(seg(first)).toMatchObject({ take: 'concepts', fromS: 2, toS: 20, caption: 'L’application' });
    expect(seg(first).title).toEqual({ text: 'Partie 1', durationS: 3 });
    expect(seg(second).freezes).toEqual([{ atS: 21, durationS: 3, caption: 'La coupe', atTop: false }]);
  });

  it('refuse un segment qui cite une prise absente', () => {
    const bad: MontagePlan = { ...plan, segments: [{ take: 'inconnue', from: 0, to: 1 }] };
    expect(() => resolvePlan(bad, takes)).toThrow(/inconnue/);
  });

  it('refuse un segment vide ou à l’envers : ffmpeg produirait un fichier muet', () => {
    const bad: MontagePlan = { ...plan, segments: [{ take: 'concepts', from: { marker: 'coupe' }, to: { marker: 'app' } }] };
    expect(() => resolvePlan(bad, takes)).toThrow(/à l’envers|vide/);
  });

  it('refuse un arrêt sur image hors du segment', () => {
    const bad: MontagePlan = {
      ...plan,
      segments: [{ take: 'concepts', from: 0, to: 5, freezeAt: [{ at: 9, durationS: 2, caption: 'trop loin' }] }],
    };
    expect(() => resolvePlan(bad, takes)).toThrow(/hors du segment/);
  });
});

describe('entryClips', () => {
  it('coupe le segment en sous-plans autour de chaque arrêt sur image', () => {
    const [, second] = resolvePlan(plan, takes);
    expect(entryClips(second!)).toEqual([
      { kind: 'video', take: 'concepts', fromS: 20, toS: 21 },
      { kind: 'freeze', take: 'concepts', atS: 21, durationS: 3, caption: 'La coupe', atTop: false },
      { kind: 'video', take: 'concepts', fromS: 21, toS: 40 },
    ]);
  });

  it('place le carton de titre avant le premier sous-plan et porte le sous-titre du segment', () => {
    const [first] = resolvePlan(plan, takes);
    expect(entryClips(first!)).toEqual([
      { kind: 'title', text: 'Partie 1', durationS: 3 },
      { kind: 'video', take: 'concepts', fromS: 2, toS: 20, caption: 'L’application', atTop: false },
    ]);
  });

  it('ne produit pas de sous-plan vide quand un arrêt tombe sur une borne', () => {
    const [, second] = resolvePlan({
      ...plan,
      segments: [plan.segments[0]!, { take: 'concepts', from: { marker: 'coupe' }, to: 'end', freezeAt: [{ at: { marker: 'coupe' }, durationS: 2, caption: 'pile' }] }],
    }, takes);
    expect(entryClips(second!)).toEqual([
      { kind: 'freeze', take: 'concepts', atS: 20, durationS: 2, caption: 'pile', atTop: false },
      { kind: 'video', take: 'concepts', fromS: 20, toS: 40 },
    ]);
  });

  it('fait suivre le bandeau en haut du segment à ses arrêts sur image', () => {
    const [entry] = resolvePlan(
      { ...plan, segments: [{ take: 'concepts', from: 0, to: 10, atTop: true, caption: 'bloc', freezeAt: [{ at: 3, durationS: 1, caption: 'a' }] }] },
      takes,
    );
    expect(entryClips(entry!).every((c) => c.kind === 'title' || c.atTop === true)).toBe(true);
  });

  it('trie les arrêts sur image, quel que soit l’ordre du plan', () => {
    const [seg] = resolvePlan({
      ...plan,
      segments: [{ take: 'concepts', from: 0, to: 10, freezeAt: [{ at: 7, durationS: 1, caption: 'b' }, { at: 3, durationS: 1, caption: 'a' }] }],
    }, takes);
    expect(entryClips(seg!).map((c) => (c.kind === 'freeze' ? c.caption : c.kind))).toEqual(['video', 'a', 'video', 'b', 'video']);
  });
});

describe('entryClips — carton seul', () => {
  it('rend un carton de titre seul pour une entrée sans prise', () => {
    const [entry] = resolvePlan({ ...plan, segments: [{ card: { text: 'Résultat : récoltée', durationS: 4, subtitle: '10 appels · 0,35 $' } }] }, takes);
    expect(entryClips(entry!)).toEqual([{ kind: 'title', text: 'Résultat : récoltée', durationS: 4, subtitle: '10 appels · 0,35 $' }]);
  });
});

describe('totalDurationS', () => {
  it('additionne les sous-plans : la durée du film avant de lancer ffmpeg', () => {
    const clips = resolvePlan(plan, takes).flatMap(entryClips);
    expect(totalDurationS(clips)).toBeCloseTo(3 + 18 + 1 + 3 + 19, 5);
  });
});

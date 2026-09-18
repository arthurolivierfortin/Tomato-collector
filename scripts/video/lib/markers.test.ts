import { describe, expect, it } from 'vitest';
import { createMarkerLog, isTakeMarkers, markerMs, markerS, type TakeMarkers } from './markers';

function fakeClock(values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)] ?? 0;
}

const take: TakeMarkers = {
  take: 'concepts',
  video: 'concepts.webm',
  mode: 'replay',
  startedAt: '2026-09-18T10:00:00.000Z',
  durationMs: 12_000,
  markers: [
    { name: 'app', atMs: 0 },
    { name: 'coupe', atMs: 4500 },
  ],
  missing: [],
};

describe('markerMs', () => {
  it('rend l’instant du marqueur en millisecondes', () => {
    expect(markerMs(take, 'coupe')).toBe(4500);
  });

  it('refuse un marqueur absent en nommant ceux qui existent', () => {
    expect(() => markerMs(take, 'chute')).toThrow(/chute.*app, coupe/s);
  });

  it('rend les secondes pour le montage', () => {
    expect(markerS(take, 'coupe')).toBe(4.5);
  });
});

describe('createMarkerLog', () => {
  it('horodate chaque marqueur depuis le début de la prise', () => {
    const log = createMarkerLog(fakeClock([1000, 1000, 3500, 13_000]));
    log.start();
    log.mark('app');
    log.mark('coupe');
    const snapshot = log.snapshot({ take: 'concepts', video: 'concepts.webm', mode: 'replay', startedAt: '2026-09-18T10:00:00.000Z' });
    expect(snapshot.markers).toEqual([
      { name: 'app', atMs: 0 },
      { name: 'coupe', atMs: 2500 },
    ]);
    expect(snapshot.durationMs).toBe(12_000);
  });

  it('accepte une origine imposée : l’instant où la page de capture s’ouvre', () => {
    const log = createMarkerLog(fakeClock([5000, 6000]));
    log.startAt(4000);
    log.mark('app');
    expect(log.snapshot({ take: 't', video: 't.webm', mode: 'replay', startedAt: 'x' })).toMatchObject({
      markers: [{ name: 'app', atMs: 1000 }],
      durationMs: 2000,
    });
  });

  it('compte depuis l’ouverture de la page, pas depuis la première peinture', () => {
    // Playwright écrit le screencast dès `newPage()`. Prendre la première peinture comme t = 0
    // retardait tous les marqueurs du temps de chargement : 0,9 s sur un Vite chaud, 10 s à froid.
    const pageOpenedMs = 1_000;
    const firstPaintMs = 900;
    const log = createMarkerLog(fakeClock([6_000, 6_000]));
    log.startAt(pageOpenedMs);
    log.mark('app');
    const snapshot = log.snapshot({ take: 't', video: 't.webm', mode: 'live', startedAt: 'x', firstPaintMs });
    expect(snapshot.markers).toEqual([{ name: 'app', atMs: 5_000 }]);
    // La première peinture reste en trace dans le fichier : c'est elle qui dit si Vite était froid.
    expect(snapshot.firstPaintMs).toBe(900);
  });

  it('nomme les marqueurs manquants et l’étape fautive quand la prise s’arrête en route', () => {
    const log = createMarkerLog(fakeClock([0, 100, 200]));
    log.start();
    log.mark('app');
    const snapshot = log.snapshot({
      take: 'concepts',
      video: 'concepts.webm',
      mode: 'live',
      startedAt: 'x',
      expected: ['app', 'cut', 'report'],
      failedStep: 'étape 12 (texte « Coupe ») : Timeout 90000ms exceeded.',
    });
    expect(snapshot.missing).toEqual(['cut', 'report']);
    expect(snapshot.failedStep).toMatch(/Timeout/);
  });

  it('refuse un marqueur avant le début de la prise', () => {
    const log = createMarkerLog(() => 0);
    expect(() => log.mark('app')).toThrow(/start/);
  });

  it('refuse deux marqueurs du même nom : le montage ne saurait pas lequel figer', () => {
    const log = createMarkerLog(fakeClock([0, 100, 200]));
    log.start();
    log.mark('app');
    expect(() => log.mark('app')).toThrow(/app/);
  });
});

describe('isTakeMarkers', () => {
  it('accepte un fichier de marqueurs relu depuis le disque', () => {
    expect(isTakeMarkers(JSON.parse(JSON.stringify(take)))).toBe(true);
  });

  it('refuse un objet sans tableau de marqueurs', () => {
    expect(isTakeMarkers({ take: 'concepts', durationMs: 1 })).toBe(false);
    expect(isTakeMarkers(null)).toBe(false);
    expect(isTakeMarkers({ ...take, markers: [{ name: 'x' }] })).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import type { EndCardData } from '../lib/episodes';
import { intersects } from '../lib/ffmpegFilters';
import type { TakeMarkers } from '../lib/markers';
import { resolvePlan, type ResolvedSegment } from '../lib/plan';
import { isMontagePlan } from '../lib/plan';
import { zoomLayout, type ZoomSpec } from '../lib/zoom';
import { burnedTexts, demoPlan, planPips } from './demo';
import { PIP, PROTECTED, pipelineTile } from './zones';

const end: EndCardData = { outcome: 'tomato harvested', toolCalls: 12, cost: '$0.38', durationS: 61.1 };
const plan = demoPlan(end);

/**
 * Les marqueurs des trois prises finales (2026-09-18), recopiés tels quels.
 *
 * Ils servent à une seule chose, mais elle est capitale : vérifier que le plan, résolu contre de
 * vrais instants, ne montre **aucune seconde deux fois**. Le montage v2 rejouait 3,8 s de la prise
 * `concepts` — le panneau « Perception » puis, derrière, le segment du réveil qui repartait du même
 * marqueur. Une relecture d'image finit par le voir ; un test le voit tout de suite.
 */
function markersOf(take: string, video: string, durationMs: number, atMs: Record<string, number>): TakeMarkers {
  return {
    take,
    video,
    mode: 'live',
    startedAt: '2026-09-18T20:00:00.000Z',
    durationMs,
    markers: Object.entries(atMs).map(([name, ms]) => ({ name, atMs: ms })),
    missing: [],
  };
}

const TAKES = new Map<string, TakeMarkers>([
  [
    'concepts',
    markersOf('concepts', 'concepts.webm', 82_569, {
      app: 2998, ripening_50: 11_770, detected: 20_198, wake_perception: 20_205, wake_agent: 22_173,
      perception_panel: 22_209, views_first: 26_783, lightbox_front: 34_054, lightbox_side: 38_963,
      lightbox_top: 43_925, gizmos: 49_684, rotate: 54_309, agent_view: 59_543, normal_view: 66_821,
      cut: 68_636, landed: 69_562, report: 77_911, end: 80_926,
    }),
  ],
  [
    'cycle',
    markersOf('cycle', 'cycle.webm', 85_155, {
      debut: 2992, murissement: 5495, detection: 19_679, reveil: 21_183, observation: 26_308,
      positionnement: 42_895, coupe: 71_910, chute: 72_788, rapport: 80_774, fin: 83_777,
    }),
  ],
  [
    'detection',
    markersOf('detection', 'detection.webm', 27_605, {
      start: 3952, ripening_20: 8453, ripening_60: 14_535, first_ripe_box: 18_367,
      gate_3: 19_944, gate_5: 20_934, wake: 23_412, end: 26_414,
    }),
  ],
  [
    'pipeline',
    markersOf('pipeline', 'pipeline.webm', 58_006, {
      start: 2844, pipeline_1: 31_455, pipeline_2: 33_960, pipeline_3: 36_465, pipeline_4: 38_981,
      pipeline_5: 41_484, pipeline_6: 44_001, pipeline_7: 46_508, pipeline_8: 49_016,
      pipeline_9: 51_518, pipeline_10: 54_020, end: 57_813,
    }),
  ],
]);

function resolvedSegments(): ResolvedSegment[] {
  return resolvePlan(plan, TAKES).filter((e): e is ResolvedSegment => !('card' in e));
}

/** Les agrandissements demandés par une prise, dans l'ordre du plan. */
function zoomsOf(take: string): ZoomSpec[] {
  return plan.segments.flatMap((e) =>
    'card' in e || e.take !== take ? [] : (e.freezeAt ?? []).flatMap((f) => (f.zoom === undefined ? [] : [f.zoom])),
  );
}

describe('demoPlan', () => {
  it('rend un plan de montage valide, relisible depuis un JSON', () => {
    expect(isMontagePlan(JSON.parse(JSON.stringify(plan)))).toBe(true);
  });

  it('écrit les cartons de fin avec les chiffres du journal, sans rien inventer', () => {
    const texts = burnedTexts(plan);
    expect(texts).toContain('Result: tomato harvested');
    expect(texts).toContain('12 tool calls · 61 s · $0.38');
  });

  it('n’emploie aucun tiret long ni demi-cadratin dans les textes gravés', () => {
    // Un tiret cadratin passe mal en drawtext selon la police et se lit mal en vidéo : le plan
    // n'en porte aucun, ni dans les cartons, ni dans les sous-titres, ni dans les arrêts sur image.
    const offenders = burnedTexts(plan).filter((t) => /[–—]/u.test(t));
    expect(offenders).toEqual([]);
  });

  it('n’a gardé aucun texte gravé en français : la vidéo est en anglais', () => {
    // Accents et mots outils français : le plan est relu par un public technique anglophone.
    const french = burnedTexts(plan).filter((t) => /[àâçéèêëîïôùûœ]|\b(le|la|les|des|une|dans|puis|avec)\b/iu.test(t));
    expect(french).toEqual([]);
  });

  it('ne cite que des marqueurs que les scénarios posent', () => {
    const known = new Set([
      // concepts
      'app', 'ripening_50', 'detected', 'wake_perception', 'wake_agent', 'perception_panel',
      'views_first', 'lightbox_front', 'lightbox_side', 'lightbox_top', 'gizmos', 'rotate',
      'agent_view', 'normal_view', 'cut', 'landed', 'report', 'end',
      // cycle
      'debut', 'murissement', 'detection', 'reveil', 'observation', 'positionnement', 'coupe', 'chute', 'rapport', 'fin',
      // pipeline : dix tuiles, la grille 5 × 2 réellement livrée par l'issue #36
      'start', 'pipeline_1', 'pipeline_2', 'pipeline_3', 'pipeline_4', 'pipeline_5',
      'pipeline_6', 'pipeline_7', 'pipeline_8', 'pipeline_9', 'pipeline_10',
      // detection : avant, pendant et après le mûrissement, vu par le modèle
      'ripening_20', 'ripening_60', 'first_ripe_box', 'gate_3', 'gate_5', 'wake',
    ]);
    const cited = new Set<string>();
    for (const entry of plan.segments) {
      if ('card' in entry) continue;
      for (const ref of [entry.from, entry.to, ...(entry.freezeAt ?? []).map((f) => f.at)]) {
        if (typeof ref === 'object') cited.add(ref.marker);
      }
    }
    expect([...cited].filter((m) => !known.has(m))).toEqual([]);
  });

  it('incruste le terminal en partie 2 dès le réveil, et jamais sur le mûrissement', () => {
    const cycle = plan.segments.filter((e) => !('card' in e) && e.take === 'cycle');
    const ripening = cycle.find((e) => !('card' in e) && e.caption === 'Ripening');
    expect(ripening).toBeDefined();
    expect(ripening !== undefined && 'card' in ripening ? undefined : ripening?.pip).toBeUndefined();
    const withPip = cycle.filter((e) => !('card' in e) && e.pip !== undefined);
    expect(withPip).toHaveLength(cycle.length - 1);
  });

  it('ne pose jamais la vignette sur une zone que le spectateur doit lire', () => {
    // Bandeau de statuts, trace, vue mise en avant, schéma bloc, son étiquette d'activité en bas à
    // droite, et le bandeau de sous-titre : la vignette de la partie 2 accompagne la prise sans
    // jamais l'interrompre, elle ne doit donc en recouvrir aucun.
    const clashes = Object.entries(PROTECTED)
      .filter(([, zone]) => intersects(PIP.corner, zone))
      .map(([name]) => name);
    expect(clashes).toEqual([]);
  });

  it('laisse le sous-titre libre même quand le terminal prend la moitié de l’écran', () => {
    // `PIP.half` couvre volontairement la trace et la vue mise en avant : un carton l'annonce et le
    // terminal devient le sujet. Mais la légende, elle, doit rester lisible.
    expect(intersects(PIP.half, PROTECTED.captionBand)).toBe(false);
    expect(intersects(PIP.half, PROTECTED.statusBar)).toBe(false);
    expect(intersects(PIP.half, PROTECTED.blockDiagram)).toBe(false);
    expect(intersects(PIP.half, PROTECTED.blockActivity)).toBe(false);
  });

  it('n’emploie que les deux zones d’incrustation déclarées', () => {
    const used = planPips(plan).flatMap((e) => ('card' in e || e.pip === undefined ? [] : [e.pip]));
    expect(used.length).toBeGreaterThan(0);
    expect(used.every((pip) => pip === PIP.corner || pip === PIP.half)).toBe(true);
  });

  it('garde les deux incrustations dans l’image', () => {
    for (const pip of Object.values(PIP)) {
      expect(pip.x).toBeGreaterThanOrEqual(0);
      expect(pip.y).toBeGreaterThanOrEqual(0);
      expect(pip.x + pip.w).toBeLessThanOrEqual(1920);
      expect(pip.y + pip.h).toBeLessThanOrEqual(1080);
    }
  });

  it('ne montre aucune seconde deux fois, sur aucune des trois prises', () => {
    // Le juge de l'issue #34 l'a demandé noir sur blanc. La v2 rejouait 22,2 → 26,0 s de `concepts`
    // deux fois de suite : le panneau « Perception », puis le segment du réveil reparti du même
    // marqueur. Les segments d'une prise sont maintenant rangés dans l'ordre et bout à bout.
    const byTake = new Map<string, { fromS: number; toS: number }[]>();
    for (const s of resolvedSegments()) byTake.set(s.take, [...(byTake.get(s.take) ?? []), { fromS: s.fromS, toS: s.toS }]);
    const overlaps: string[] = [];
    for (const [take, spans] of byTake) {
      let shown = 0;
      for (const span of spans) {
        if (span.fromS < shown - 0.001) overlaps.push(`${take} : ${span.fromS.toFixed(2)} s déjà montré (vu jusqu’à ${shown.toFixed(2)} s)`);
        shown = Math.max(shown, span.toS);
      }
    }
    expect(overlaps).toEqual([]);
  });

  it('agrandit les dix tuiles du pipeline, une par arrêt sur image', () => {
    const zooms = zoomsOf('pipeline');
    expect(zooms).toHaveLength(10);
    for (const [i, zoom] of zooms.entries()) expect(zoom.source).toEqual(pipelineTile(i));
  });

  it('agrandit aussi ce que le modèle voit, et la vue que l’agent relit avant de couper', () => {
    // Trois arrêts sur la prise « detection » (avant, première boîte `ripe`, porte pleine) et un sur
    // la vue `front` que l'agent redemande juste avant `cut`.
    expect(zoomsOf('detection')).toHaveLength(3);
    expect(zoomsOf('concepts')).toHaveLength(1);
  });

  it('écrit les trois éléments de chaque agrandissement, et les tient hors de l’image agrandie', () => {
    const zooms = [...zoomsOf('pipeline'), ...zoomsOf('detection'), ...zoomsOf('concepts')];
    expect(zooms).toHaveLength(14);
    for (const zoom of zooms) {
      // Trois éléments écrits, trois éléments remplis : personne ne lit « Done by: ».
      expect(zoom.input.length).toBeGreaterThan(3);
      expect(zoom.by.length).toBeGreaterThan(3);
      expect(zoom.output.length).toBeGreaterThan(3);
      // Et la colonne de texte reste à droite de la zone agrandie, jamais dessus.
      const layout = zoomLayout(zoom.source, { width: 1920, height: 1080, fps: 30 });
      expect(layout.textX).toBeGreaterThanOrEqual(layout.at.x + layout.scaled.w);
    }
  });

  it('pose le sous-titre du pipeline sur une bande pleine largeur', () => {
    // Écran plein format : la boîte qui épouse le texte laissait dépasser, à sa droite, un fragment
    // de la rangée de légendes françaises des tuiles.
    const pipeline = plan.segments.filter((e) => !('card' in e) && e.take === 'pipeline');
    expect(pipeline).toHaveLength(10);
    for (const s of pipeline) expect('card' in s ? undefined : s.captionFullWidth).toBe(true);
  });

  it('tient chaque arrêt du pipeline en une seconde d’écran entier puis quatre d’agrandissement', () => {
    for (const s of resolvedSegments().filter((x) => x.take === 'pipeline')) {
      expect(s.toS - s.fromS).toBeCloseTo(1.2, 2);
      expect(s.freezes).toHaveLength(1);
      // L'arrêt clôt le segment : rien ne revient à l'écran entier après l'agrandissement.
      expect(s.freezes[0]?.atS).toBeCloseTo(s.toS, 2);
      expect(s.freezes[0]?.durationS).toBe(4);
    }
  });
});

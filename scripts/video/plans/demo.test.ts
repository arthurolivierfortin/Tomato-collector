import { describe, expect, it } from 'vitest';
import type { EndCardData } from '../lib/episodes';
import { captionWrapChars, intersects, CAPTION_MAX_LINES, DEFAULT_STYLE } from '../lib/ffmpegFilters';
import type { TakeMarkers } from '../lib/markers';
import { resolvePlan, type ResolvedSegment } from '../lib/plan';
import { isMontagePlan } from '../lib/plan';
import { splitLayout } from '../lib/split';
import { zoomLayout, type ZoomSpec } from '../lib/zoom';
import { lineCount, wrapText } from '../lib/text';
import { signatureBlocks } from '../lib/titleCard';
import { AUTHOR, BYLINE, PROJECT, burnedTexts, demoPlan, openingCard, planPips, planSplits, signOffCard } from './demo';
import { PERCEPTION_LIVE, PIP, PROTECTED, RIPENING_SPLIT, SPECTATOR_LIVE, TOOL_CAM_CAPTION_WIDTH, ZONE, pipelineTile } from './zones';

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

  it('ouvre le film sur le carton de signature, avant tout le reste', () => {
    const first = plan.segments[0];
    expect(first).toEqual(openingCard());
    expect(first !== undefined && 'card' in first ? first.card : undefined).toMatchObject({
      text: PROJECT,
      byline: BYLINE,
      durationS: 4,
      subtitle: 'A Claude agent harvests tomatoes in a 3D simulation',
    });
    expect(first !== undefined && 'card' in first ? (first.card.fadeS ?? 0) : 0).toBeGreaterThan(0);
  });

  it('ferme le film sur la même signature, en fondu au noir, après le carton des résultats', () => {
    const last = plan.segments[plan.segments.length - 1];
    expect(last).toEqual(signOffCard());
    expect(last !== undefined && 'card' in last ? last.card : undefined).toMatchObject({ text: PROJECT, byline: BYLINE, durationS: 4 });
    expect(last !== undefined && 'card' in last ? (last.card.fadeS ?? 0) : 0).toBeGreaterThan(0);
    // Le dernier carton ne porte pas de sous-texte : la signature reste seule à l'image.
    expect(last !== undefined && 'card' in last ? last.card.subtitle : 'x').toBeUndefined();
    const results = plan.segments.findIndex((e) => 'card' in e && e.card.text.startsWith('Result: '));
    expect(results).toBeGreaterThan(0);
    expect(results).toBeLessThan(plan.segments.length - 1);
  });

  it('n’annonce le titre du projet qu’aux deux cartons de signature', () => {
    const titled = plan.segments.filter((e) => 'card' in e && e.card.text === PROJECT);
    expect(titled).toHaveLength(2);
  });

  it('écrit le nom de l’auteur tel qu’il s’écrit, avec un trait d’union court', () => {
    expect(AUTHOR).toBe('Arthur-Olivier Fortin');
    expect(BYLINE).toBe('By Arthur-Olivier Fortin');
    // U+002D et rien d'autre : ni cadratin, ni demi-cadratin, ni trait d'union insécable.
    expect([...BYLINE].filter((c) => /\p{Pd}/u.test(c))).toEqual(['-']);
    expect(burnedTexts(plan)).toContain(BYLINE);
  });

  it('tient chaque ligne des cartons de signature sur une seule ligne de 1920 px', () => {
    for (const card of [openingCard().card, signOffCard().card]) {
      const blocks = signatureBlocks(
        { title: card.text, byline: card.byline ?? '', ...(card.subtitle === undefined ? {} : { subtext: card.subtitle }) },
        { width: 1920, height: 1080, fps: 30 },
      );
      for (const block of blocks) {
        // Largeur estimée au corps du bloc ; large marge, la police est étroite.
        expect(block.text.length * block.size * 0.55).toBeLessThan(1920);
      }
    }
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

  it('agrandit l’incrustation de la caméra outil sur les lames, puis sur la coupe fermée', () => {
    // Un plan large ne montrera jamais un geste de 6 cm : les deux images qui portent la coupe
    // sont celles de la caméra embarquée, agrandies comme les tuiles du pipeline.
    const toolCam = zoomsOf('concepts').filter((z) => z.source === ZONE.toolCamera);
    expect(toolCam).toHaveLength(2);
    expect(burnedTexts(plan)).toContain('The tool camera rides on the scissors: the blades, the target stem, the ripe tomato');
  });

  it('annonce l’incrustation une fois en partie 2, au premier mouvement des ciseaux', () => {
    const intro = plan.segments.filter((e) => !('card' in e) && e.take === 'cycle' && e.caption === 'Tool camera, bottom right');
    expect(intro).toHaveLength(1);
    const [segment] = intro;
    expect(segment !== undefined && 'card' in segment ? undefined : segment?.from).toEqual({ marker: 'positionnement' });
    // Assez long pour se lire : plus court que `MIN_CAPTION_S`, le montage le fondrait dans le suivant.
    const resolved = resolvedSegments().find((s) => s.caption === 'Tool camera, bottom right');
    expect((resolved?.toS ?? 0) - (resolved?.fromS ?? 0)).toBeGreaterThanOrEqual(2.5);
  });

  it('pose le sous-titre à gauche de l’incrustation là où la colonne spectateur est le sujet', () => {
    // Du premier geste fin à deux secondes après la chute, et seulement là : ailleurs le sujet est
    // la trace ou les vues de l'agent, et le bandeau garde toute sa largeur.
    const narrow = plan.segments.flatMap((e) =>
      'card' in e || e.captionWidth !== TOOL_CAM_CAPTION_WIDTH ? [] : [`${e.take}:${typeof e.from === 'object' ? e.from.marker : String(e.from)}`],
    );
    expect(narrow).toEqual([
      // Le retour en vue spectateur avant la coupe, l'approche, puis la coupe et la chute.
      'concepts:agent_view',
      'concepts:normal_view',
      'concepts:cut',
      // Le rapport : le cadrage large est revenu, mais l'incrustation de la caméra outil est encore
      // allumée jusqu'à la dernière image de la prise.
      'concepts:report',
      'cycle:positionnement',
      'cycle:positionnement',
      'cycle:coupe',
      'cycle:chute',
    ]);
  });

  it('tient chacun de ces sous-titres en deux lignes dans le bandeau rétréci', () => {
    // Un bandeau moitié moins large, c'est deux fois moins de texte par ligne : le plan doit dire
    // la même chose plus court, pas laisser le montage prévenir au troisième passage.
    const chars = captionWrapChars(DEFAULT_STYLE, TOOL_CAM_CAPTION_WIDTH);
    const tooLong: string[] = [];
    for (const e of plan.segments) {
      if ('card' in e || e.captionWidth !== TOOL_CAM_CAPTION_WIDTH) continue;
      // Un arrêt sur image agrandi écrit sa légende à côté de l'image, pas dans le bandeau.
      const texts = [...(e.caption === undefined ? [] : [e.caption]), ...(e.freezeAt ?? []).flatMap((f) => (f.zoom === undefined ? [f.caption] : []))];
      tooLong.push(...texts.filter((t) => lineCount(wrapText(t, chars)) > CAPTION_MAX_LINES));
    }
    expect(tooLong).toEqual([]);
  });

  it('agrandit la vue que l’agent relit avant de couper, et plus rien sur la détection', () => {
    // La v2.1 posait trois agrandissements sur la prise « detection ». Ils sont remplacés par
    // l'écran partagé, qui montre la même chose **en lecture** : plus aucun ne doit rester, sinon
    // le spectateur verrait deux fois le panneau agrandi, une fois figé et une fois en direct.
    expect(zoomsOf('detection')).toHaveLength(0);
    expect(zoomsOf('concepts')).toHaveLength(3);
  });

  it('tient toute la détection en écran partagé, du mûrissement au réveil', () => {
    const detection = plan.segments.filter((e) => !('card' in e) && e.take === 'detection');
    expect(detection).toHaveLength(5);
    for (const s of detection) expect('card' in s ? undefined : s.split).toBe(RIPENING_SPLIT);
    // Les deux arrêts sur image gardent la même mise en page : ils héritent du segment.
    for (const s of resolvedSegments().filter((x) => x.take === 'detection')) {
      for (const f of s.freezes) {
        expect(f.split).toBe(RIPENING_SPLIT);
        expect(f.zoom).toBeUndefined();
        expect(f.durationS).toBe(3);
      }
    }
  });

  it('donne à chaque sous-titre de la détection les deux secondes et demie qu’il faut pour le lire', () => {
    // `MIN_CAPTION_S` du montage : un segment plus court est fusionné avec son voisin et les deux
    // légendes deviennent une phrase. Les cinq légendes de la séquence doivent rester séparées.
    for (const s of resolvedSegments().filter((x) => x.take === 'detection')) {
      const onScreen = s.toS - s.fromS + s.freezes.reduce((sum, f) => sum + f.durationS, 0);
      expect(onScreen).toBeGreaterThanOrEqual(2.5);
    }
  });

  it('cadre l’écran partagé sur des rectangles qui tiennent dans l’image de la prise', () => {
    const splits = planSplits(plan);
    expect(splits).toHaveLength(5);
    for (const split of splits) {
      for (const rect of [split.left, split.right]) {
        expect(rect.x).toBeGreaterThanOrEqual(0);
        expect(rect.y).toBeGreaterThanOrEqual(0);
        expect(rect.x + rect.w).toBeLessThanOrEqual(1920);
        expect(rect.y + rect.h).toBeLessThanOrEqual(1080);
      }
      // Les deux rectangles sont disjoints : deux endroits de l'image, pas deux fois le même.
      expect(intersects(split.left, split.right)).toBe(false);
    }
  });

  it('laisse le sous-titre de l’écran partagé sur la vue spectateur, et le titre au-dessus', () => {
    const layout = splitLayout(RIPENING_SPLIT, { width: 1920, height: 1080, fps: 30 });
    const band = PROTECTED.captionBand;
    expect(band.x).toBeGreaterThanOrEqual(layout.left.at.x);
    expect(band.x + band.w).toBeLessThanOrEqual(layout.left.at.x + layout.left.scaled.w);
    expect(band.y).toBeGreaterThan(layout.titleHeight);
    // Et le panneau agrandi, lui, reste à droite du bandeau : jamais dessous.
    expect(layout.right.at.x).toBeGreaterThan(band.x + band.w);
  });

  it('prend la colonne spectateur sous les statuts, et le panneau sans couper sa pastille', () => {
    // Rectangles mesurés sur une image de la prise ; le test garde les bornes qui comptent.
    expect(SPECTATOR_LIVE.y).toBeGreaterThanOrEqual(PROTECTED.statusBar.y + PROTECTED.statusBar.h);
    expect(SPECTATOR_LIVE.y + SPECTATOR_LIVE.h).toBeLessThanOrEqual(PROTECTED.blockDiagram.y);
    // La pastille « YOLOv8n ONNX 640 » commence à x 1164 : le recadrage s'arrête juste avant.
    expect(PERCEPTION_LIVE.x + PERCEPTION_LIVE.w).toBeLessThanOrEqual(1164);
  });

  it('écrit les trois éléments de chaque agrandissement, et les tient hors de l’image agrandie', () => {
    const zooms = [...zoomsOf('pipeline'), ...zoomsOf('detection'), ...zoomsOf('concepts')];
    expect(zooms).toHaveLength(13);
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

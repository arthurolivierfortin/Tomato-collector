/**
 * Le plan de montage confronté aux **marqueurs réellement posés** par les prises du 2026-09-21
 * (v3), et à la capture de terminal de ces mêmes prises.
 *
 * `demo.test.ts` vérifie la forme du plan ; ce fichier-ci vérifie qu'il ne ment pas sur cette
 * prise-là. Le rapport du réalisateur sur la v3 relève trois mensonges, tous du même genre : un
 * texte gravé qui décrit un événement **avant qu'il se produise**. Le pire durait vingt-six
 * secondes — « The stem is cut, the tomato falls into the basket » posé à 74,3 s pour une coupe à
 * 100,4 s, parce que le plan avait été réglé sur un épisode plus rapide.
 *
 * La règle tient en une ligne : chaque texte de la table ci-dessous ne doit apparaître qu'à partir
 * de l'instant où ce qu'il décrit est à l'écran.
 */
import { describe, expect, it } from 'vitest';
import { entryClips, mergeShortSegments, type Clip } from '../lib/cuts';
import type { EndCardData } from '../lib/episodes';
import { markerS, type TakeMarkers } from '../lib/markers';
import { resolvePlan, type TimeRef } from '../lib/plan';
import { terminalPipStart } from '../lib/terminal';
import { demoPlan } from './demo';

const end: EndCardData = { outcome: 'tomato harvested', toolCalls: 12, cost: '$0.35', durationS: 74.6 };
const plan = demoPlan(end);

/** Sous-titre affiché moins longtemps : illisible. C'est la valeur de `montage.ts`. */
const MIN_CAPTION_S = 2.5;

function markersOf(
  take: string,
  durationMs: number,
  atMs: Record<string, number>,
  terminal?: { video: string; startMs: number },
): TakeMarkers {
  return {
    take,
    video: `${take}.webm`,
    mode: 'live',
    startedAt: '2026-09-21T12:59:22.496Z',
    durationMs,
    markers: Object.entries(atMs).map(([name, ms]) => ({ name, atMs: ms })),
    missing: [],
    ...(terminal === undefined ? {} : { terminal: { ...terminal, source: 'window' as const } }),
  };
}

/** Les marqueurs des quatre prises v3, recopiés de `data/video/takes/*.markers.json`. */
const TAKES = new Map<string, TakeMarkers>([
  [
    'concepts',
    markersOf(
      'concepts',
      116_858,
      {
        app: 2859, ripening_50: 11_830, detected: 20_315, wake_perception: 20_324, wake_agent: 22_279,
        perception_panel: 22_308, views_first: 32_019, lightbox_front: 39_487, lightbox_side: 44_463,
        lightbox_top: 49_514, gizmos: 55_290, rotate: 59_954, agent_view: 65_219, normal_view: 72_523,
        cut: 100_361, landed: 101_241, report: 111_333, end: 114_336,
      },
      { video: 'concepts.terminal.mp4', startMs: 22_544 },
    ),
  ],
  [
    'cycle',
    markersOf(
      'cycle',
      100_557,
      {
        debut: 2725, murissement: 5237, detection: 20_737, reveil: 22_247, observation: 30_515,
        positionnement: 52_067, coupe: 86_271, chute: 87_179, rapport: 94_919, fin: 97_922,
      },
      { video: 'cycle.terminal.mp4', startMs: 22_580 },
    ),
  ],
  [
    'detection',
    markersOf('detection', 25_848, {
      start: 2666, ripening_20: 7044, ripening_60: 12_986, first_ripe_box: 16_772,
      gate_3: 18_328, gate_5: 19_406, wake: 21_836, end: 24_846,
    }),
  ],
  [
    'pipeline',
    markersOf('pipeline', 57_522, {
      start: 2780, pipeline_1: 31_245, pipeline_2: 33_749, pipeline_3: 36_254, pipeline_4: 38_764,
      pipeline_5: 41_270, pipeline_6: 43_775, pipeline_7: 46_278, pipeline_8: 48_781,
      pipeline_9: 51_292, pipeline_10: 53_794, end: 57_521,
    }),
  ],
]);

function takeOf(name: string): TakeMarkers {
  const take = TAKES.get(name);
  if (take === undefined) throw new Error(`prise « ${name} » absente de la table`);
  return take;
}

function instantS(take: string, at: TimeRef): number {
  if (typeof at === 'number') return at;
  if (at === 'end') return takeOf(take).durationMs / 1000;
  return markerS(takeOf(take), at.marker) + (at.offsetS ?? 0);
}

/** Les sous-plans du film, dans l'ordre, tels que `montage.ts` les fabrique. */
function clips(): Clip[] {
  return mergeShortSegments(resolvePlan(plan, TAKES), MIN_CAPTION_S).flatMap(entryClips);
}

/** Instant de la prise où ce sous-plan commence. */
function startS(clip: Clip): number {
  return clip.kind === 'video' ? clip.fromS : clip.kind === 'freeze' ? clip.atS : 0;
}

/**
 * Un texte gravé, et l'instant de la prise avant lequel il mentirait. Les instants sont des
 * marqueurs, avec un décalage **mesuré sur la prise** quand l'événement n'en a pas.
 */
const NOT_BEFORE: ReadonlyArray<{ readonly text: string; readonly take: string; readonly at: TimeRef }> = [
  // La coupe et ce qui suit. C'est le défaut nº 1 du rapport v3.
  { text: 'The stem is cut, the tomato falls into the basket', take: 'concepts', at: { marker: 'cut' } },
  { text: 'Blades closed, stem severed, and the tomato starts to fall', take: 'concepts', at: { marker: 'cut' } },
  // Le résultat de `cut` met une seconde à revenir : relevé à 101,4 s pour une coupe à 100,4 s.
  { text: 'cut returns the distance to the stem and the blade angle', take: 'concepts', at: { marker: 'cut', offsetS: 0.6 } },
  { text: 'The tomato lands in the basket: harvest confirmed', take: 'concepts', at: { marker: 'landed' } },
  { text: 'The agent reports the harvest and the episode closes', take: 'concepts', at: { marker: 'report' } },
  // La relecture des vues avant la coupe : « Vues demandées : front, side » est dans la trace à
  // 71,5 s sur cette prise, soit `normal_view` − 1,0 s (le pilote revient en vue spectateur à 71,3 s).
  { text: 'Views requested again: front and side, read before the cut', take: 'concepts', at: { marker: 'normal_view', offsetS: -1 } },
  // Le premier appel d'outil : le marqueur est posé quand la trace l'affiche.
  { text: 'The agent is awake: first tool call of the episode, get_views on all three cameras', take: 'concepts', at: { marker: 'views_first' } },
  // La prise « detection » : chaque légende attend son marqueur.
  { text: 'First ripe box on tomato 1. The gate wants five in a row.', take: 'detection', at: { marker: 'first_ripe_box' } },
  { text: 'Five consecutive ripe frames: the server is notified.', take: 'detection', at: { marker: 'gate_5' } },
];

describe('le plan de montage contre les marqueurs réels des prises v3', () => {
  it('se résout sans erreur sur les quatre prises du 2026-09-21', () => {
    expect(() => clips()).not.toThrow();
    expect(clips().length).toBeGreaterThan(50);
  });

  it('ne grave aucun texte avant l’événement qu’il décrit', () => {
    const early: string[] = [];
    for (const clip of clips()) {
      if (clip.kind === 'title') continue;
      const rule = NOT_BEFORE.find((r) => r.text === clip.caption);
      if (rule === undefined) continue;
      const floor = instantS(rule.take, rule.at);
      if (clip.take !== rule.take) {
        early.push(`« ${rule.text} » sur la prise « ${clip.take} », attendue sur « ${rule.take} »`);
        continue;
      }
      if (startS(clip) < floor - 0.001) {
        early.push(`« ${rule.text} » à ${startS(clip).toFixed(2)} s, avant ${floor.toFixed(2)} s`);
      }
    }
    expect(early).toEqual([]);
  });

  it('emploie chacun de ces textes, sinon la table ne garde plus rien', () => {
    const captions = new Set(clips().flatMap((c) => (c.kind === 'title' || c.caption === undefined ? [] : [c.caption])));
    expect(NOT_BEFORE.filter((r) => !captions.has(r.text)).map((r) => r.text)).toEqual([]);
  });

  it('arrête le terminal demi-écran sur le tool_use puis sur le tool_result, jamais en plein base64', () => {
    // Mesuré image par image sur `concepts.terminal.mp4` (1600 x 988, 25 img/s) :
    //  - de 9,6 s à 11,0 s, l'écran porte le message `assistant` puis la ligne
    //    `"type":"tool_use" … "name":"mcp__robot__get_views"` ; aucun base64 ;
    //  - de 11,2 s à 16,4 s, la fin du base64 des trois images occupe le haut de l'écran et tout le
    //    reste est le `tool_result` en JSON (tomates, ciseaux, panier, `suggestedScissors`) ;
    //  - la v3 figeait à 11,975 s, c'est-à-dire huit lignes de base64 avant la première accolade.
    const terminal = takeOf('concepts').terminal;
    expect(terminal).toBeDefined();
    const half = plan.segments.filter((e) => !('card' in e) && e.take === 'concepts' && e.pip !== undefined);
    expect(half).toHaveLength(1);
    const freezes = half.flatMap((e) => ('card' in e ? [] : (e.freezeAt ?? [])));
    expect(freezes).toHaveLength(2);
    const atS = freezes.map((f) => terminalPipStart(instantS('concepts', f.at), terminal?.startMs ?? 0).atS);
    expect(atS[0]).toBeGreaterThanOrEqual(9.6);
    expect(atS[0]).toBeLessThanOrEqual(11);
    expect(atS[1]).toBeGreaterThanOrEqual(11.4);
    expect(atS[1]).toBeLessThanOrEqual(16.4);
  });

  it('garde la vignette du terminal sur tout le réveil de la partie 2, en la retardant au lieu de la jeter', () => {
    // Défaut nº 2 du rapport v3 : le segment « Detection, then the agent wakes up » dure 9,8 s et
    // la fenêtre de l'agent s'ouvre 1,8 s après son début. La v3 jetait la vignette pour les 9,8 s.
    const terminal = takeOf('cycle').terminal;
    const wake = clips().find((c) => c.kind === 'video' && c.take === 'cycle' && c.caption === 'Detection, then the agent wakes up');
    expect(wake).toBeDefined();
    expect(wake?.kind === 'video' ? wake.pip : undefined).toBeDefined();
    const start = terminalPipStart(startS(wake as Clip), terminal?.startMs ?? 0);
    expect(start.delayS).toBeCloseTo(1.843, 3);
    // Retardée, mais bien dans le sous-plan : la vignette est à l'image pendant les 8 s qui restent.
    const durationS = wake?.kind === 'video' ? wake.toS - wake.fromS : 0;
    expect(start.delayS).toBeLessThan(durationS);
  });
});

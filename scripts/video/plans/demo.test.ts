import { describe, expect, it } from 'vitest';
import type { EndCardData } from '../lib/episodes';
import { intersects } from '../lib/ffmpegFilters';
import { isMontagePlan } from '../lib/plan';
import { burnedTexts, demoPlan, planPips } from './demo';
import { PIP, PROTECTED } from './zones';

const end: EndCardData = { outcome: 'tomato harvested', toolCalls: 12, cost: '$0.38', durationS: 61.1 };
const plan = demoPlan(end);

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
});

import { describe, expect, it } from 'vitest';
import {
  PHASE_LABEL, episodeEndTitle, episodeStartTitle, eventTitle, firstLine, formatClock, formatCost, formatDuration,
  formatNum, formatSigned, phaseTitle, snapshotTitle, toolTitle, viewsTitle,
} from './traceFormat';

describe('number formatting', () => {
  it('uses a decimal comma and a typographic minus, never −0', () => {
    expect(formatNum(12)).toBe('12');
    expect(formatNum(-1.5, 1)).toBe('−1,5');
    expect(formatNum(-0.04, 1)).toBe('0,0');
    expect(formatSigned(5)).toBe('+5');
    expect(formatSigned(-2)).toBe('−2');
    expect(formatSigned(0)).toBe('0');
  });

  it('formats durations in ms, s and min', () => {
    expect(formatDuration(420)).toBe('420 ms');
    expect(formatDuration(1800)).toBe('1,8 s');
    expect(formatDuration(65_000)).toBe('1 min 05 s');
  });

  it('formats the cumulated cost with four decimals', () => {
    expect(formatCost(0.0421)).toBe('0,0421 $');
    expect(formatCost(0)).toBe('0,0000 $');
  });

  it('formats a wall clock HH:MM:SS in local time', () => {
    expect(formatClock(new Date(2026, 8, 17, 14, 3, 7).getTime())).toBe('14:03:07');
    expect(formatClock(Date.now())).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });

  it('keeps the first line and truncates with an ellipsis', () => {
    expect(firstLine('  bonjour\nsuite ', 20)).toBe('bonjour');
    expect(firstLine('a'.repeat(30), 10)).toBe(`${'a'.repeat(9)}…`);
  });
});

describe('toolTitle', () => {
  it('describes the nine tools in French with their arguments', () => {
    expect(toolTitle('get_status', {})).toBe('État demandé');
    expect(toolTitle('get_views', {})).toBe('Vues demandées : top, front, side');
    expect(toolTitle('get_views', { cameras: ['top'] })).toBe('Vues demandées : top');
    expect(toolTitle('move_camera', { camera: 'front', dx: 5, zoom: 1.5 })).toBe('Caméra front : dX +5, zoom ×1,5');
    expect(toolTitle('move_camera', { camera: 'top', yaw: -10 })).toBe('Caméra top : lacet −10°');
    expect(toolTitle('move_scissors', { x: 12, y: 4, z: 38, mode: 'absolute' })).toBe('Ciseaux → X 12, Y 4, Z 38');
    expect(toolTitle('move_scissors', { x: 5, y: 0, z: -1.5, mode: 'relative' })).toBe('Ciseaux : ΔX +5, ΔY 0, ΔZ −1,5');
    expect(toolTitle('rotate_scissors', { yaw: 30, mode: 'absolute' })).toBe('Ciseaux orientés : lacet 30°');
    expect(toolTitle('rotate_scissors', { yaw: 20, pitch: -5, mode: 'relative' })).toBe('Ciseaux tournés : lacet +20°, tangage −5°');
    expect(toolTitle('open_scissors', {})).toBe('Ciseaux ouverts');
    expect(toolTitle('cut', {})).toBe('Coupe');
    expect(toolTitle('move_basket', { x: 3, y: -2, mode: 'absolute' })).toBe('Panier → X 3, Y −2');
    expect(toolTitle('report', { outcome: 'harvested', note: 'ok' })).toBe('Rapport : récoltée');
    expect(toolTitle('frobnicate', {})).toBe('Outil frobnicate');
  });
});

describe('event, phase and episode titles', () => {
  it('names sim events', () => {
    expect(eventTitle({ type: 'ripe_detected', tomatoId: 3, detector: 'hsv', confidence: 0.87 })).toBe('Tomate 3 mûre détectée (hsv, 0,87)');
    expect(eventTitle({ type: 'tomato_landed', tomatoId: 3, inBasket: true })).toBe('Tomate 3 dans le panier');
    expect(eventTitle({ type: 'tomato_landed', tomatoId: 3, inBasket: false })).toBe('Tomate 3 tombée au sol');
    expect(eventTitle({ type: 'plant_regenerated', seed: 42 })).toBe('Nouveau plant (graine 42)');
  });

  it('labels the eight phases and the episode messages', () => {
    expect(Object.keys(PHASE_LABEL)).toHaveLength(8);
    expect(phaseTitle('detected')).toBe('Phase détectée');
    expect(snapshotTitle('idle')).toBe('État reçu du serveur, phase repos');
    expect(episodeStartTitle({ type: 'episode_start', episodeId: 'e1', tomatoId: 2, sessionResumed: true })).toBe('Épisode e1 : tomate 2, session reprise');
    expect(
      episodeEndTitle({ type: 'episode_end', episodeId: 'e1', outcome: 'harvested', note: '', toolCalls: 7, costUsd: 0.0421, durationMs: 3900 }),
    ).toBe('Épisode terminé : récoltée, 7 appels, 3,9 s, 0,0421 $');
    expect(viewsTitle(['top', 'front'])).toBe('Vues rendues : top, front');
  });
});

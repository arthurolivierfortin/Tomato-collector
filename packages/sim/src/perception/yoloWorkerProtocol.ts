import type { Detection } from './types';

/**
 * Protocole entre la page et le worker d'inférence (issue #36). L'inférence wasm dure ~350 ms par image :
 * sur le fil principal elle gelait la scène une demi-seconde à chaque tick. Le worker la sort du fil.
 */
export interface YoloInit {
  type: 'init';
  modelUrl: string;
  metaUrl: string;
}

export interface YoloFrame {
  type: 'frame';
  id: number;
  width: number;
  height: number;
  /** RGBA transféré (jamais copié) : le tampon est détaché côté page après l'envoi. */
  data: ArrayBuffer;
}

export type YoloRequest = YoloInit | YoloFrame;

export interface YoloReady {
  type: 'ready';
}

export interface YoloUnavailable {
  type: 'unavailable';
  reason: string;
}

export interface YoloResult {
  type: 'result';
  id: number;
  detections: Detection[];
}

export interface YoloFailure {
  type: 'failure';
  id: number;
  reason: string;
}

export type YoloResponse = YoloReady | YoloUnavailable | YoloResult | YoloFailure;

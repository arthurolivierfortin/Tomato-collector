import { useEffect, useState } from 'react';
import { perceptionState, subscribePerception } from './perceptionModule';
import type { PerceptionState } from './types';

/** Abonnement du dashboard à l'état de M4 (détecteur actif, frame d'entrée, boîtes, porte de réveil). */
export function usePerceptionState(): PerceptionState {
  const [state, setState] = useState(perceptionState);
  useEffect(() => subscribePerception(setState), []);
  return state;
}

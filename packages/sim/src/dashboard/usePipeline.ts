import { useCallback, useEffect, useState } from 'react';
import type { CameraId } from '@tomato/shared';
import { capturePerceptionPipeline } from '../perception/perceptionModule';
import type { PipelineCapture } from '../perception/pipelineCapture';
import type { SimRuntime } from '../core/runtime';

export interface PipelineCaptureState {
  capture: PipelineCapture | null;
  pending: boolean;
  refresh: () => void;
}

/**
 * Capture des étapes du pipeline pour le mode plein écran (issue #36) : une capture à l'ouverture,
 * une à chaque changement de caméra, une par « Recapturer ». Hors de ce mode (camera null) rien ne
 * tourne : la chaîne complète coûte dix rendus PNG de 800 px.
 */
export function usePipelineCapture(camera: CameraId | null, runtime: SimRuntime | null): PipelineCaptureState {
  const [capture, setCapture] = useState<PipelineCapture | null>(null);
  const [pending, setPending] = useState(false);
  const [nonce, setNonce] = useState(0);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (camera === null || runtime === null) {
      setCapture(null);
      setPending(false);
      return;
    }
    let cancelled = false;
    setPending(true);
    void capturePerceptionPipeline(camera, runtime.ctx)
      .catch((error: unknown) => {
        console.warn('[pipeline] capture en erreur', error);
        return null;
      })
      .then((result) => {
        if (cancelled) return;
        setCapture(result);
        setPending(false);
      });
    return () => {
      cancelled = true;
    };
  }, [camera, runtime, nonce]);

  return { capture, pending, refresh };
}

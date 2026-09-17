import { useEffect, useRef } from 'react';
import { createScene, type SceneHandle } from './createScene';

interface Props {
  /** Appelé une fois au montage avec la scène prête ; peut retourner un nettoyage. */
  onReady: (scene: SceneHandle) => void | (() => void);
}

export function SpectatorView({ onReady }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<SceneHandle | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handle = createScene(canvas);
    handleRef.current = handle;
    const cleanup = onReady(handle);
    return () => {
      cleanup?.();
      handle.dispose();
    };
  }, [onReady]);

  return <canvas ref={canvasRef} data-testid="spectator" className="h-full w-full block" />;
}

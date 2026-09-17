import { useEffect, useRef } from 'react';
import type { Object3D } from 'three';
import { createScene, type SceneHandle } from './createScene';

interface Props {
  /** Fabrique les objets à ajouter à la scène ; appelée une fois au montage. */
  build: () => Object3D[];
}

export function SpectatorView({ build }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<SceneHandle | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handle = createScene(canvas);
    for (const obj of build()) handle.addObject(obj);
    handleRef.current = handle;
    return () => handle.dispose();
  }, [build]);

  return <canvas ref={canvasRef} data-testid="spectator" className="h-full w-full block" />;
}

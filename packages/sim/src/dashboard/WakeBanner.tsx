import type { WakeInfo } from './dashboardTypes';
import { DETECTOR_LABEL, formatNum } from './traceFormat';
import { useFlash } from './useFlash';

/** Durée d'affichage du bandeau de réveil : assez pour être lu à l'écran, assez court pour ne pas rester. */
export const WAKE_BANNER_MS = 3500;

/**
 * Bandeau bref annonçant le moment clé de la démo (issue #23) : la perception a vu une tomate mûre,
 * le serveur réveille l'agent. Il double la ligne sur-lignée de la trace, que le spectateur pourrait
 * manquer, et disparaît de lui-même.
 *
 * Il se pose en surimpression au-dessus de la vue spectateur : un bandeau dans le flux normal
 * volerait de la hauteur à la vue mise en avant, qui doit rester à 613 px (issue #22).
 */
export function WakeBanner({ wake }: { wake: WakeInfo | null }) {
  const visible = useFlash(wake?.atMs ?? null, WAKE_BANNER_MS);
  if (wake === null || !visible) return null;
  return (
    <div
      data-testid="wake-banner"
      role="status"
      className="flex items-center gap-3 rounded-sm border border-turning bg-turning/25 px-4 py-2 text-[15px] text-ink shadow-lg"
    >
      <span aria-hidden="true" className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-turning" />
      <strong className="font-semibold">Tomate {wake.tomatoId} mûre détectée</strong>
      <span className="font-mono text-[13px] text-ink-dim">
        {DETECTOR_LABEL[wake.detector]} · confiance {formatNum(wake.confidence, 2)}
      </span>
      <span aria-hidden="true" className="text-ink-dim">
        →
      </span>
      <span>le serveur réveille l’agent ({wake.sessionResumed ? 'session reprise' : 'nouvelle session'})</span>
    </div>
  );
}

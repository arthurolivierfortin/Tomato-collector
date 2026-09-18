/**
 * `GET <api>/health` du serveur, et la seule règle qui compte avant une prise en direct :
 * **aucune autre page sim ne doit être connectée**. La page du pilote est elle-même une sim ; si un
 * onglet `npm run demo` reste ouvert, le hub remplace l'ancienne sim par celle du pilote, l'ancienne
 * se reconnecte deux secondes plus tard et reprend la main, et les deux alternent toute la prise.
 */

export interface Health {
  readonly ok: boolean;
  readonly simConnected: boolean;
  readonly phase?: string;
  readonly model?: string;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}

export function parseHealth(x: unknown): Health | null {
  if (!isRecord(x) || typeof x['simConnected'] !== 'boolean') return null;
  const phase = x['phase'];
  const model = x['model'];
  return {
    ok: x['ok'] === true,
    simConnected: x['simConnected'],
    ...(typeof phase === 'string' ? { phase } : {}),
    ...(typeof model === 'string' ? { model } : {}),
  };
}

/**
 * Ce qui empêche une prise en direct de commencer, ou `null` si la voie est libre. Pur : le test
 * n'a pas besoin d'un serveur.
 */
export function liveBlocker(health: Health | null, apiUrl: string): string | null {
  if (health === null) {
    return `serveur injoignable sur ${apiUrl} : lancer « npm run start -w @tomato/server » avant la prise en direct`;
  }
  if (health.simConnected) {
    return (
      'une page de simulation est déjà connectée au serveur. La page du pilote en est une aussi : ' +
      'les deux se voleraient la connexion toutes les deux secondes pendant la prise. Fermer l’onglet ' +
      'de la simulation (le serveur seul suffit : « npm run start -w @tomato/server »), puis relancer.'
    );
  }
  return null;
}

export async function fetchHealth(apiUrl: string): Promise<Health | null> {
  try {
    const res = await fetch(`${apiUrl.replace(/\/$/, '')}/health`);
    if (!res.ok) return null;
    return parseHealth(await res.json());
  } catch {
    return null;
  }
}

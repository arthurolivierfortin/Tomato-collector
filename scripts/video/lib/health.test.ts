import { describe, expect, it } from 'vitest';
import { liveBlocker, parseHealth } from './health';

describe('parseHealth', () => {
  it('lit la réponse de GET /health', () => {
    expect(parseHealth({ ok: true, version: '0.2.0', phase: 'idle', simConnected: false, harvested: 0 })).toEqual({
      ok: true,
      simConnected: false,
      phase: 'idle',
    });
  });

  it('refuse une réponse qui ne dit pas si une sim est connectée', () => {
    expect(parseHealth({ ok: true })).toBeNull();
    expect(parseHealth(null)).toBeNull();
    expect(parseHealth('ok')).toBeNull();
  });
});

describe('liveBlocker', () => {
  it('laisse passer quand le serveur répond et qu’aucune sim n’est connectée', () => {
    expect(liveBlocker({ ok: true, simConnected: false }, 'http://localhost:7331')).toBeNull();
  });

  it('refuse quand une sim est déjà connectée : les deux pages se voleraient la connexion', () => {
    const message = liveBlocker({ ok: true, simConnected: true }, 'http://localhost:7331');
    expect(message).toMatch(/déjà connectée/);
    expect(message).toMatch(/Fermer l’onglet/);
  });

  it('refuse quand le serveur ne répond pas, en disant comment le lancer', () => {
    expect(liveBlocker(null, 'http://localhost:7331')).toMatch(/injoignable sur http:\/\/localhost:7331/);
    expect(liveBlocker(null, 'http://localhost:7331')).toMatch(/@tomato\/server/);
  });
});

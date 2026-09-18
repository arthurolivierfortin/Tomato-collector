/**
 * Petit serveur local qui sert la page « terminal » et lui donne les nouvelles lignes du fichier
 * que le serveur écrit (`TOMATO_LOG_FILE`).
 *
 * Deux routes, rien de plus : `/` rend la page statique de `scripts/video/terminal/`, et
 * `/lines?from=<n>` rend les lignes suivantes, déjà converties en HTML coloré par `ansi.ts`. Il
 * n'écoute que sur 127.0.0.1 et sur un port libre choisi par le système : la prise n'ouvre aucun
 * port fixe et n'entre en conflit avec rien.
 */
import { readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { join } from 'node:path';
import { ansiToHtml, tailFrom } from './ansi';

export interface TerminalServer {
  /** Adresse à ouvrir dans la page de capture. */
  readonly url: string;
  close(): Promise<void>;
}

/** Dossier de la page statique, relatif à `lib/`. */
const PAGE_DIR = join(import.meta.dirname, '..', 'terminal');

/** Rang de départ demandé par la page ; tout ce qui n'est pas un entier positif repart de zéro. */
export function parseFrom(raw: string | null): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

export async function startTerminalServer(logPath: string): Promise<TerminalServer> {
  const page = await readFile(join(PAGE_DIR, 'index.html'), 'utf8');
  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (url.pathname === '/lines') {
      // Le fichier fait quelques kilo-octets : le relire en entier à chaque scrutation est le plus
      // simple, et cent millisecondes suffisent largement pour ça.
      readFile(logPath, 'utf8')
        .catch(() => '')
        .then((content) => {
          const tail = tailFrom(content, parseFrom(url.searchParams.get('from')));
          res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
          res.end(JSON.stringify({ next: tail.next, lines: tail.lines.map(ansiToHtml) }));
        })
        .catch(() => res.end('{}'));
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(page);
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  return {
    url: `http://127.0.0.1:${port}/`,
    close: () => new Promise<void>((done) => server.close(() => done())),
  };
}

/**
 * Recopie du flux de la session dans un fichier (`TOMATO_LOG_FILE`), couleurs ANSI comprises.
 *
 * C'est le fichier que suit la page « terminal » du pipeline vidéo : elle affiche la sortie réelle
 * du processus, ligne à ligne, sans rien reconstituer. Écriture synchrone et en ajout : le volume
 * est d'une centaine de lignes par épisode, et l'ordre doit être celui des événements.
 */
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface LogSink {
  write(line: string): void;
}

/** Puits inerte : c'est le cas par défaut, quand aucun fichier n'est demandé. */
const NO_SINK: LogSink = { write: () => undefined };

/**
 * Puits d'écriture vers `path`, ou un puits inerte si `path` est vide. Le fichier est vidé à
 * l'ouverture : une prise filme une session, pas l'historique de la machine. Une erreur d'écriture
 * ne doit jamais faire tomber le serveur — au pire la vidéo n'aura pas de terminal.
 */
export function createLogSink(path: string): LogSink {
  if (path === '') return NO_SINK;
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, '', 'utf8');
  } catch {
    return NO_SINK;
  }
  return {
    write(line) {
      try {
        appendFileSync(path, `${line}\n`, 'utf8');
      } catch {
        // Fichier verrouillé ou disque plein : la session continue, le terminal filmé s'arrête là.
      }
    },
  };
}

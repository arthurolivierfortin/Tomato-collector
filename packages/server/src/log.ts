/** Journalisation minimale du serveur : une ligne horodatée sur stdout ; silencieuse dans les tests. */
export type Logger = (line: string) => void;

export const consoleLogger: Logger = (line) => {
  console.log(`[${new Date().toISOString()}] ${line}`);
};

export const silentLogger: Logger = () => undefined;

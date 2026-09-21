/**
 * Couches Three, et la seule règle qui les rend nécessaires : **les caméras de l'agent sont un
 * contrat**, pas une jolie image.
 *
 * Ce que rendent les trois caméras de M3 part dans `get_views`, sert de jeu d'entraînement au
 * détecteur (400 rendus, `docs/perception-model.md`) et alimente la passe d'identifiants qui mesure
 * la fraction visible de chaque tomate. Enrichir le décor de la vue spectateur — par exemple donner
 * de vrais ciseaux au bout du bras — ne doit donc rien changer à ce que l'agent voit.
 *
 * D'où deux couches en plus de la couche commune 0, que tout le monde voit :
 *
 * - `SPECTATOR_LAYER` : décor vu par la seule caméra spectateur (`createScene` l'active) ;
 * - `AGENT_LAYER` : pièces vues par les seules caméras de l'agent (`createAgentCameras` l'active),
 *   c'est-à-dire ce qui doit rester pixel pour pixel ce qu'il était.
 *
 * Une pièce posée sur l'une de ces couches (`mesh.layers.set(...)`) sort de tous les autres rendus :
 * vue agent, passe d'identifiants et carte d'ombres de ces caméras la sautent sans rien à ajouter
 * ailleurs. Three teste la couche de chaque objet, pas celle de son groupe : il faut donc la poser
 * sur chaque maillage.
 */
export const SPECTATOR_LAYER = 1;
export const AGENT_LAYER = 2;

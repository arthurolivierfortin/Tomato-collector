/**
 * Ce que le modèle voit avant, pendant et après le mûrissement — prise « detection », gratuite.
 *
 * Le reste du film traite la détection comme un événement : un bandeau s'allume, l'agent se réveille.
 * Ici on s'arrête sur la décision elle-même, dans le panneau « Perception » (touche `p`) ouvert du
 * début à la fin.
 *
 * **Ce que la v2.1 ratait.** Elle montrait le panneau agrandi en trois arrêts sur image, et le
 * propriétaire a dit ce qui manquait : « la vue du modèle qui sait quand une tomate est prête ou
 * non apparaît seulement une fois une tomate détectée ; on devrait la voir avant, pour voir que le
 * modèle détecte la tomate qui est prête. » Un arrêt sur image ne peut pas montrer ça. Pendant la
 * lecture continue, le panneau restait à sa taille réelle dans le dashboard — 358 × 352 px dans une
 * image de 1920 × 1080, donc illisible à l'œil.
 *
 * **Ce que la v2.2 fait.** Un seul écran partagé, tenu du début du mûrissement jusqu'au réveil : à
 * gauche la scène, la tomate qui rougit ; à droite le panneau, recadré et agrandi 2,3 fois, **en
 * lecture**, avec l'image d'entrée annotée et les lignes `détecteur`, `boîtes`, `inférence`,
 * `porte`. Les deux bougent ensemble : on voit la tomate rougir et, au même instant, « 0 ripe »
 * devenir « 1 ripe » et la porte se remplir. Les trois agrandissements séparés sont retirés : ils
 * montraient la même chose, plus tard et à l'arrêt. Il reste deux arrêts sur image de 3 s, dans la
 * même mise en page, aux deux instants qu'il faut lire : la première boîte `ripe` et la porte 5/5.
 *
 * La prise est filmée avec `TOMATO_AGENT=off` : elle n'a rien coûté. Les boîtes, les scores, les
 * temps d'inférence et la porte viennent du vrai détecteur ; seule la session de l'agent n'existe
 * pas, et la séquence s'arrête avant elle.
 */
import type { PlanEntry } from '../lib/plan';
import { RIPENING_SPLIT } from './zones';

const DETECTION = 'detection';

/** Arrêt sur image dans l'écran partagé : trois secondes, le temps de lire les lignes du panneau. */
const HOLD_S = 3;

/**
 * Le segment de réveil, calé sur ce qui est **à l'image** et non sur le marqueur seul.
 *
 * Le marqueur `wake` est posé quand le pilote voit la flèche « réveil » du schéma bloc, qui est
 * hors des deux recadrages. Ce qui montre le réveil dans le volet de gauche, c'est le bandeau
 * « Tomate 1 mûre détectée · confiance 0,97 → le serveur réveille l'agent » ; mesuré sur la prise,
 * il s'éteint entre 23,5 s et 24,2 s, soit moins d'une seconde après le marqueur. Un segment parti
 * du marqueur montrerait donc surtout une scène vide.
 *
 * Il part donc 0,8 s avant, et s'arrête à `wake` + 2 s comme demandé : 2,8 s de sous-titre, au-delà
 * des 2,5 s en dessous desquelles `montage.ts` fusionnerait le segment avec son voisin, et le
 * bandeau reste à l'écran pendant la première moitié. Le décalage négatif est plus petit que
 * l'écart `gate_5` → `wake` que le scénario garantit (2,5 s sur la prise) ; s'il ne l'était pas,
 * `resolveSegment` refuserait le plan au lieu de monter un segment à l'envers.
 */
const BEFORE_WAKE_S = 0.8;
const AFTER_WAKE_S = 2;

export const detectionSegments: PlanEntry[] = [
  // (1) Tomate verte. Le panneau est déjà ouvert : le spectateur voit le détecteur tourner avant
  // qu'il y ait quoi que ce soit à détecter, ce qui est tout l'intérêt de la séquence.
  {
    take: DETECTION,
    from: { marker: 'start' },
    to: { marker: 'ripening_20' },
    split: RIPENING_SPLIT,
    title: {
      text: 'Perception decides, frame by frame',
      durationS: 4,
      subtitle: 'Before, during and after ripeness: what the model actually sees, and what it reports',
    },
    caption: 'The tomato is still green. The model reports 8 unripe, 0 ripe.',
  },
  // (2) La rampe de maturité, en lecture continue. Le sous-titre invite à regarder les boîtes :
  // c'est pendant ces dix secondes que la tomate passe du vert au rouge des deux côtés de l'écran.
  {
    take: DETECTION,
    from: { marker: 'ripening_20' },
    to: { marker: 'first_ripe_box' },
    split: RIPENING_SPLIT,
    caption: "The tomato turns red. Watch the model's boxes.",
  },
  // (3) La première boîte `ripe`. L'arrêt sur image est posé sur le marqueur lui-même : la lecture
  // amène la boîte à l'écran, puis l'image se fige trois secondes pour qu'on lise sa confiance.
  // Valeur vérifiée sur l'image extraite à cet instant : « ripe 0,76 », « porte 1/5 · tomate 1 ».
  {
    take: DETECTION,
    from: { marker: 'first_ripe_box' },
    to: { marker: 'gate_5' },
    split: RIPENING_SPLIT,
    caption: 'First ripe box: ripe 0.76 on tomato 1. The gate starts counting.',
    freezeAt: [
      {
        at: { marker: 'first_ripe_box' },
        durationS: HOLD_S,
        caption: 'First ripe box: ripe 0.76 on tomato 1. The gate starts counting.',
      },
    ],
  },
  // (4) La porte pleine. Vérifié sur les images extraites à 20,75 s et 20,95 s : le panneau affiche
  // « porte 5/5 frames consécutives · tomate 1 » des deux côtés du marqueur, l'arrêt tombe juste.
  {
    take: DETECTION,
    from: { marker: 'gate_5' },
    to: { marker: 'wake', offsetS: -BEFORE_WAKE_S },
    split: RIPENING_SPLIT,
    caption: 'Five consecutive ripe frames: the server is notified.',
    freezeAt: [
      { at: { marker: 'gate_5' }, durationS: HOLD_S, caption: 'Five consecutive ripe frames: the server is notified.' },
    ],
  },
  // (5) Le réveil. Il se lit dans la colonne spectateur, donc dans le volet de gauche : le bandeau
  // « Tomate 1 mûre détectée · confiance 0,97 → le serveur réveille l'agent » s'allume à y 125.
  // La suite — la session de l'agent — reste sur la prise `concepts`, filmée en direct.
  {
    take: DETECTION,
    from: { marker: 'wake', offsetS: -BEFORE_WAKE_S },
    to: { marker: 'wake', offsetS: AFTER_WAKE_S },
    split: RIPENING_SPLIT,
    caption: 'The server wakes the agent.',
  },
];

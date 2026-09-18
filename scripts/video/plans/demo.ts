/**
 * Plan de montage de la vidéo de démo — la traduction en données de `scripts/video/storyboard.md`.
 * Les instants sont des marqueurs posés à l'enregistrement : refaire une prise ne demande pas de
 * retoucher le plan. Les textes sont en français, sans voix : cartons de titre et sous-titres.
 */
import type { MontagePlan, PlanEntry } from '../lib/plan';

const CONCEPTS = 'concepts';
const CYCLE = 'cycle';

/** Partie 1 « Les concepts » : (a) l'app, (b) le plant, (c) la perception, (d) le réveil, (e) les vues, (f) les outils, (g) la coupe. */
const part1: PlanEntry[] = [
  {
    card: {
      text: 'Tomato Collector',
      durationS: 4,
      subtitle: 'Un agent Claude récolte des tomates dans une simulation 3D, par des outils MCP et trois vues 2D',
    },
  },
  {
    card: { text: 'Partie 1 — Les concepts', durationS: 3.5, subtitle: 'L’application, le plant, la perception, le réveil, les vues, les outils, la coupe' },
  },
  // (a) L'application.
  {
    take: CONCEPTS,
    from: { marker: 'app', offsetS: -1 },
    to: { marker: 'maturite' },
    caption: 'Une seule page : la simulation 3D, la trace de l’agent, les vues qu’il reçoit',
    freezeAt: [
      { at: { marker: 'app' }, durationS: 3.5, caption: 'À gauche la scène et le robot, au centre ce que fait l’agent, à droite ce qu’il voit' },
    ],
  },
  // (b) Le plant et la tomate qui mûrit.
  {
    take: CONCEPTS,
    from: { marker: 'maturite' },
    to: { marker: 'detection', offsetS: -1.5 },
    title: { text: 'Le plant et la tomate qui mûrit', durationS: 3 },
    caption: 'Une seule tomate mûrit à la fois ; la rampe vert → rouge dure 15 s de temps simulé',
    freezeAt: [
      { at: { marker: 'maturite', offsetS: 4 }, durationS: 3.5, caption: 'Le bandeau suit la maturité de la tomate en cours : « tomate 1 : mûrit 62 % »' },
    ],
  },
  // (c) La perception qui détecte.
  {
    take: CONCEPTS,
    from: { marker: 'detection', offsetS: -1.5 },
    to: { marker: 'bloc_perception' },
    title: { text: 'La perception détecte la tomate mûre', durationS: 3 },
    caption: 'Contours Canny + CLAHE, puis YOLOv8 en ONNX si le modèle est là, seuillage HSV sinon',
    freezeAt: [
      { at: { marker: 'detection', offsetS: 0.6 }, durationS: 3.5, caption: 'Bandeau orange : « Tomate 1 mûre détectée → le serveur réveille l’agent »' },
    ],
  },
  // (d) Le serveur réveille l'agent.
  {
    take: CONCEPTS,
    from: { marker: 'bloc_perception', offsetS: -2 },
    to: { marker: 'outil_vues', offsetS: 1.5 },
    title: { text: 'Le serveur réveille l’agent', durationS: 3 },
    // Le schéma bloc occupe le bas de l'image : le bandeau passe en haut pour ne rien cacher.
    atTop: true,
    caption: 'Le schéma bloc allume les flèches une par une : l’agent dort jusqu’au réveil',
    freezeAt: [
      // −1,4 s : la file du schéma bloc allume une flèche toutes les 1,2 s et a une longueur
      // d'avance sur le marqueur ; vérifié sur les images extraites du montage.
      { at: { marker: 'bloc_perception', offsetS: -1.4 }, durationS: 3, caption: '1. perception → serveur : « tomate 1 mûre, hsv 0,90 »' },
      { at: { marker: 'bloc_reveil', offsetS: -1.4 }, durationS: 3, caption: '2. serveur → agent : réveil. L’agent n’existait pas une seconde plus tôt.' },
    ],
  },
  // (e) Les trois vues de l'agent.
  {
    take: CONCEPTS,
    from: { marker: 'vue_top', offsetS: -1.5 },
    to: { marker: 'cameras', offsetS: -1.5 },
    title: { text: 'Les trois vues de l’agent', durationS: 3.5, subtitle: 'Caméras orthographiques : 1 cm vaut le même nombre de pixels, à toute profondeur' },
    caption: 'Grille en cm, axes, échelle, marqueurs numérotés, tige, ciseaux et panier en schéma',
    freezeAt: [
      { at: { marker: 'vue_top', offsetS: 1 }, durationS: 3.5, caption: 'Vue top — X → droite, Y ↑ : le panier, son centre et la verticale de chute' },
      { at: { marker: 'vue_front', offsetS: 1 }, durationS: 3.5, caption: 'Vue front — X → droite, Z ↑ : la tige, les marqueurs numérotés des tomates' },
      { at: { marker: 'vue_side', offsetS: 1 }, durationS: 3.5, caption: 'Vue side — Y → droite, Z ↑ : les ciseaux, leurs axes, la normale et l’ouverture' },
    ],
  },
  {
    take: CONCEPTS,
    from: { marker: 'cameras', offsetS: -1.5 },
    to: { marker: 'mode_agent', offsetS: -2 },
    caption: 'Touche c : les trois caméras orthogonales dans la scène — d’où viennent les vues',
    freezeAt: [{ at: { marker: 'cameras', offsetS: 1 }, durationS: 3, caption: 'Trois rails orthogonaux, un pivot limité : l’agent peut les déplacer lui-même' }],
  },
  {
    take: CONCEPTS,
    from: { marker: 'mode_agent', offsetS: -1 },
    to: { marker: 'mode_agent', offsetS: 3.5 },
    caption: 'Touche v : « ce que voit l’agent » — les trois vues en grand, rien d’autre',
    freezeAt: [{ at: { marker: 'mode_agent', offsetS: 1 }, durationS: 3, caption: 'C’est tout ce que l’agent reçoit : trois images et du JSON, jamais la scène 3D' }],
  },
  // (f) Les outils MCP.
  {
    take: CONCEPTS,
    from: { marker: 'mcp_appel', offsetS: -2 },
    to: { marker: 'flux_brut', offsetS: 2.5 },
    title: { text: 'Les outils MCP', durationS: 3, subtitle: 'get_views, move_camera, move_basket, move_scissors, rotate_scissors, open_scissors, cut, get_status, report' },
    caption: 'Chaque appel est montré avec ses arguments et son résultat, en JSON',
    freezeAt: [
      // Décalage négatif : le marqueur est posé ~0,6 s après l'apparition réelle de la ligne
      // (latence de scrutation), et le résultat arrive une seconde plus tard — la fenêtre est étroite.
      { at: { marker: 'mcp_appel', offsetS: -0.3 }, durationS: 3.5, caption: 'L’appel en cours : move_scissors, ses arguments en centimètres, le chrono qui tourne' },
      { at: { marker: 'mcp_resultat', offsetS: 0.4 }, durationS: 4, caption: 'Le résultat : une collision, rendue comme une donnée mesurée, pas une exception' },
      { at: { marker: 'flux_brut', offsetS: 1 }, durationS: 3.5, caption: 'Touche t : le flux brut de la session — init, text, tool_use, tool_result, stderr' },
    ],
  },
  // (g) La coupe et la chute.
  {
    take: CONCEPTS,
    from: { marker: 'coupe', offsetS: -2 },
    to: { marker: 'rapport', offsetS: 2 },
    title: { text: 'La coupe et la chute dans le panier', durationS: 3 },
    caption: 'La tige est coupée, la tomate tombe, un capteur dans le panier tranche',
    freezeAt: [
      { at: { marker: 'coupe', offsetS: 0.4 }, durationS: 3, caption: 'cut : distance au milieu de la tige et angle de la lame, mesurés et rendus à l’agent' },
      { at: { marker: 'chute', offsetS: 0.6 }, durationS: 3.5, caption: 'Tomate 1 dans le panier → récoltée. L’agent écrit son rapport et se rendort.' },
    ],
  },
];

/** Partie 2 « Un cycle complet » : une prise sans coupure, sous-titres discrets par phase. */
const part2: PlanEntry[] = [
  { card: { text: 'Partie 2 — Un cycle complet', durationS: 4, subtitle: 'De la tomate qui mûrit au rapport de l’agent, sans une seule coupure' } },
  { take: CYCLE, from: { marker: 'murissement', offsetS: -2 }, to: { marker: 'detection' }, caption: 'Mûrissement' },
  { take: CYCLE, from: { marker: 'detection' }, to: { marker: 'observation' }, caption: 'Détection, puis réveil de l’agent' },
  { take: CYCLE, from: { marker: 'observation' }, to: { marker: 'positionnement' }, caption: 'Observation : l’agent demande les trois vues et lit la scène' },
  { take: CYCLE, from: { marker: 'positionnement' }, to: { marker: 'coupe' }, caption: 'Positionnement : le panier sous la tomate, les ciseaux jusqu’au milieu de la tige' },
  { take: CYCLE, from: { marker: 'coupe' }, to: { marker: 'chute' }, caption: 'Coupe' },
  { take: CYCLE, from: { marker: 'chute' }, to: { marker: 'rapport' }, caption: 'Chute dans le panier' },
  { take: CYCLE, from: { marker: 'rapport' }, to: { marker: 'fin' }, caption: 'Rapport : l’agent clôt l’épisode et note ce qu’il ferait autrement' },
];

export interface EndCard {
  readonly outcome: string;
  readonly toolCalls: number;
  readonly cost: string;
  readonly durationS: number;
}

function endCards(end: EndCard): PlanEntry[] {
  return [
    { card: { text: `Résultat : ${end.outcome}`, durationS: 4, subtitle: `${end.toolCalls} appels d’outils · ${end.cost} · ${Math.round(end.durationS)} s` } },
    { card: { text: 'Un LLM peut piloter un robot', durationS: 4.5, subtitle: 'si on lui donne des outils et des images qui se lisent comme du texte' } },
  ];
}

export function demoPlan(end: EndCard): MontagePlan {
  return { output: 'tomato-demo.mp4', width: 1920, height: 1080, fps: 30, segments: [...part1, ...part2, ...endCards(end)] };
}

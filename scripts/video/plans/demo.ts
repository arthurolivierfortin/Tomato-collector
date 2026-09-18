/**
 * Plan de montage de la vidéo de démo — la traduction en données de `scripts/video/storyboard.md`.
 * Les instants sont des marqueurs posés à l'enregistrement : refaire une prise ne demande pas de
 * retoucher le plan. Les textes sont en français, sans voix : cartons de titre et sous-titres.
 */
import type { EndCardData } from '../lib/episodes';
import type { Rect } from '../lib/ffmpegFilters';
import type { MontagePlan, PlanEntry } from '../lib/plan';

const CONCEPTS = 'concepts';
const CYCLE = 'cycle';

/**
 * Zones du dashboard en 1920×1080, contrôles masqués (touche `h`), qu'un arrêt sur image peut
 * entourer d'un cadre. Le sous-titre, lui, reste toujours au même endroit : le bas de la colonne
 * spectateur, qui ne porte aucune information.
 */
const ZONE = {
  maturite: { x: 568, y: 4, w: 244, h: 36 },
  reveil: { x: 8, y: 124, w: 786, h: 46 },
  schemaBloc: { x: 476, y: 980, w: 968, h: 96 },
  trace: { x: 800, y: 90, w: 484, h: 300 },
  sessionBrute: { x: 800, y: 526, w: 484, h: 272 },
  vueEnAvant: { x: 1286, y: 116, w: 626, h: 636 },
} as const satisfies Record<string, Rect>;

/** Partie 1 « Les concepts » : (a) l'app, (b) le plant, (c) la perception, (d) le réveil, (e) les vues, (f) les outils, (g) la coupe. */
const part1: PlanEntry[] = [
  {
    card: {
      text: 'Tomato Collector',
      durationS: 4,
      subtitle: 'Un agent Claude récolte des tomates dans une simulation 3D, grâce à des outils MCP et à trois vues 2D',
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
    caption: 'Une seule page : la simulation 3D, la trace de l’agent et les vues qu’il reçoit',
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
    caption: 'Une seule tomate mûrit à la fois ; le passage du vert au rouge prend 15 s de temps simulé',
    freezeAt: [
      {
        at: { marker: 'maturite', offsetS: 4 },
        durationS: 3.5,
        caption: 'Le bandeau de statuts suit le mûrissement de la tomate en cours',
        highlight: ZONE.maturite,
      },
    ],
  },
  // (c) La perception qui détecte.
  {
    take: CONCEPTS,
    from: { marker: 'detection', offsetS: -1.5 },
    // Le segment s'arrête pile sur son arrêt sur image, et (d) reprend pile sur le sien :
    // aucune seconde de la prise n'est montrée deux fois.
    to: { marker: 'detection', offsetS: 0.6 },
    title: { text: 'La perception détecte la tomate mûre', durationS: 3 },
    caption: 'Contours (Canny + CLAHE), puis YOLOv8 (ONNX) ou seuillage de couleur (HSV)',
    freezeAt: [
      {
        at: { marker: 'detection', offsetS: 0.6 },
        durationS: 3.5,
        caption: 'Le bandeau de détection annonce : tomate mûre repérée, le serveur réveille l’agent',
        highlight: ZONE.reveil,
      },
    ],
  },
  // (d) Le serveur réveille l'agent.
  {
    take: CONCEPTS,
    from: { marker: 'bloc_perception', offsetS: -1.4 },
    to: { marker: 'outil_vues', offsetS: 1.5 },
    title: { text: 'Le serveur réveille l’agent', durationS: 3 },
    caption: 'Le schéma bloc allume les flèches une par une : l’agent dort jusqu’au réveil',
    highlight: ZONE.schemaBloc,
    freezeAt: [
      // −1,4 s : la file du schéma bloc allume une flèche toutes les 1,2 s et a une longueur
      // d'avance sur le marqueur ; vérifié sur les images extraites du montage.
      { at: { marker: 'bloc_perception', offsetS: -1.4 }, durationS: 3, caption: '1. La perception prévient le serveur : tomate 1 mûre, hsv 0,90' },
      { at: { marker: 'bloc_reveil', offsetS: -1.4 }, durationS: 3, caption: '2. Le serveur réveille l’agent, qui n’existait pas une seconde plus tôt' },
    ],
  },
  // (e) Les trois vues de l'agent, à la loupe (plein écran : pas de cadre, tout est déjà montré).
  {
    take: CONCEPTS,
    from: { marker: 'vue_top', offsetS: -1.5 },
    to: { marker: 'cameras', offsetS: -1.5 },
    title: { text: 'Les trois vues de l’agent', durationS: 3.5, subtitle: 'Caméras orthographiques : un centimètre vaut le même nombre de pixels à toute profondeur' },
    caption: 'Grille en centimètres, axes, échelle, marqueurs numérotés, tige, ciseaux et panier',
    freezeAt: [
      { at: { marker: 'vue_top', offsetS: 1 }, durationS: 3.5, caption: 'Vue de dessus (top) — X à droite, Y en haut : le panier et la chute' },
      { at: { marker: 'vue_front', offsetS: 1 }, durationS: 3.5, caption: 'Vue de face (front) — X à droite, Z en haut : la tige et les tomates' },
      { at: { marker: 'vue_side', offsetS: 1 }, durationS: 3.5, caption: 'Vue de côté (side) — Y à droite, Z en haut : les ciseaux et l’ouverture' },
    ],
  },
  {
    take: CONCEPTS,
    from: { marker: 'cameras', offsetS: -1.5 },
    to: { marker: 'mode_agent', offsetS: -2 },
    caption: 'Les trois caméras orthogonales dans la scène (touche c), d’où viennent les vues',
    freezeAt: [{ at: { marker: 'cameras', offsetS: 1 }, durationS: 3, caption: 'Trois rails orthogonaux et un pivot limité : l’agent les déplace lui-même' }],
  },
  {
    take: CONCEPTS,
    from: { marker: 'mode_agent', offsetS: -1 },
    to: { marker: 'mode_agent', offsetS: 3.5 },
    // En mode « ce que voit l'agent », la colonne spectateur se réduit à 450 px et la grande vue
    // commence juste après : le bandeau se rétrécit d'autant pour ne rien recouvrir.
    captionWidth: 450,
    caption: 'Le mode « ce que voit l’agent » (touche v)',
    freezeAt: [{ at: { marker: 'mode_agent', offsetS: 1 }, durationS: 3, caption: 'L’agent ne voit que ces trois images et du JSON' }],
  },
  // (f) Les outils MCP.
  {
    take: CONCEPTS,
    from: { marker: 'mcp_appel', offsetS: -2 },
    to: { marker: 'flux_brut', offsetS: 2.5 },
    title: { text: 'Les outils MCP', durationS: 3, subtitle: 'get_views, move_camera, move_basket, move_scissors, rotate_scissors, open_scissors, cut, get_status, report' },
    caption: 'Chaque appel apparaît avec ses arguments et son résultat, en JSON',
    highlight: ZONE.trace,
    freezeAt: [
      // Le marqueur est posé quand la ligne apparaît, le résultat arrive une seconde plus tard :
      // on vise le milieu de cette fenêtre.
      { at: { marker: 'mcp_appel', offsetS: 0.4 }, durationS: 3.5, caption: 'L’appel en cours : move_scissors, ses arguments et le chrono qui tourne' },
      { at: { marker: 'mcp_resultat', offsetS: 0.4 }, durationS: 4, caption: 'Le résultat : une collision, rendue comme une mesure et non comme une exception' },
      {
        at: { marker: 'flux_brut', offsetS: 1 },
        durationS: 3.5,
        caption: 'Le flux brut de la session (touche t) : init, text, tool_use, tool_result, stderr',
        highlight: ZONE.sessionBrute,
      },
    ],
  },
  // (g) La coupe et la chute.
  {
    take: CONCEPTS,
    from: { marker: 'coupe', offsetS: -2 },
    to: { marker: 'rapport', offsetS: 2 },
    title: { text: 'La coupe et la chute dans le panier', durationS: 3 },
    caption: 'La tige est coupée, la tomate tombe, un capteur dans le panier confirme la récolte',
    highlight: ZONE.trace,
    freezeAt: [
      { at: { marker: 'coupe', offsetS: 0.4 }, durationS: 3, caption: 'cut renvoie la distance au milieu de la tige et l’angle de la lame' },
      { at: { marker: 'chute', offsetS: 0.6 }, durationS: 3.5, caption: 'La tomate atterrit dans le panier : récolte réussie' },
    ],
  },
];

/** Partie 2 « Un cycle complet » : une prise sans coupure, sous-titres discrets par phase. */
const part2: PlanEntry[] = [
  { card: { text: 'Partie 2 — Un cycle complet', durationS: 4, subtitle: 'De la tomate qui mûrit au rapport de l’agent, sans une seule coupure' } },
  { take: CYCLE, from: { marker: 'murissement', offsetS: -2 }, to: { marker: 'detection' }, caption: 'Mûrissement' },
  { take: CYCLE, from: { marker: 'detection' }, to: { marker: 'observation' }, caption: 'Détection, puis réveil de l’agent' },
  { take: CYCLE, from: { marker: 'observation' }, to: { marker: 'positionnement' }, caption: 'Observation : l’agent demande les trois vues et lit la scène' },
  { take: CYCLE, from: { marker: 'positionnement' }, to: { marker: 'coupe' }, caption: 'Positionnement : le panier sous la tomate, les ciseaux au milieu de la tige' },
  { take: CYCLE, from: { marker: 'coupe' }, to: { marker: 'chute' }, caption: 'Coupe' },
  { take: CYCLE, from: { marker: 'chute' }, to: { marker: 'rapport' }, caption: 'Chute dans le panier' },
  { take: CYCLE, from: { marker: 'rapport' }, to: { marker: 'fin' }, caption: 'Rapport : l’agent clôt l’épisode et note ce qu’il ferait autrement' },
];

function endCards(end: EndCardData): PlanEntry[] {
  // Le coût n'apparaît que si le journal en porte un : mieux vaut ne rien dire que dire faux.
  const facts = [`${end.toolCalls} appels d’outils`, `${Math.round(end.durationS)} s`, ...(end.cost === null ? [] : [end.cost])];
  return [
    { card: { text: `Résultat : ${end.outcome}`, durationS: 4, subtitle: facts.join(' · ') } },
    { card: { text: 'Un LLM peut piloter un robot', durationS: 4.5, subtitle: 'à condition de lui donner des outils et des images qui se lisent comme du texte' } },
  ];
}

export function demoPlan(end: EndCardData): MontagePlan {
  return { output: 'tomato-demo.mp4', width: 1920, height: 1080, fps: 30, segments: [...part1, ...part2, ...endCards(end)] };
}

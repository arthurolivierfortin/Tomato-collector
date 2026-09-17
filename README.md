# Tomato Collector — démo « un agent LLM récolte des tomates »

Simulation 3D dans le navigateur d'un plant de tomates, d'un bras à ciseaux, d'un panier et de trois caméras.
Un agent Claude (headless, via un serveur MCP) reçoit des vues 2D annotées et commande le robot.
Un dashboard montre en direct la simulation, ce que l'agent voit, ses actions et les statuts.

Spec de design : `docs/superpowers/specs/2026-09-17-tomato-harvest-demo-design.md` (fait foi).

## Prérequis

- Node 22+, npm 10+
- Claude Code CLI connecté (l'agent utilise l'auth de la machine)
- `gh` connecté (issues et PR)
- Navigateur Chromium pour Playwright : `npx playwright install chromium`

## Installation

    npm install
    npx playwright install chromium

## Commandes

| Commande | Effet |
|---|---|
| `npm run dev:sim` | page sim + dashboard sur http://localhost:5173 |
| `npm run dev:server` | serveur MCP + WebSocket (Étape 3) |
| `npm run shot` | capture Playwright de la scène dans `data/shots/` |
| `npm run lint` / `npm run typecheck` / `npm test` / `npm run build` | les quatre gates, obligatoires avant toute PR |

## Structure

    packages/shared   contrats : types, schémas zod des outils MCP, machine à états, monde par défaut
    packages/sim      page navigateur : Three.js + Rapier, plant, bras, caméras, perception, annotations, dashboard React
    packages/server   Node : MCP streamable HTTP, hub WebSocket, journal des épisodes, runner d'agent
    docs/             spec, plans, STATUS.md
    .claude/          agents et skills du cycle de développement

## Conventions

- Unités : centimètres et degrés partout. Repère monde : X droite, Y arrière, Z haut, origine au pied du plant.
  Dans Three.js, 1 unité = 1 cm ; conversion unique dans `packages/sim/src/three/frame.ts`.
- TypeScript strict, pas de `any`, imports de types explicites.
- TDD : test qui échoue, puis implémentation minimale. Les fonctions de géométrie et de règles sont pures et testées sans navigateur.
- Un module par PR, rebase merge sur `main`, jamais de push direct sur `main` après l'Étape 1.
- Les erreurs renvoyées à l'agent sont des retours structurés (`ok: false, error, message, details`), jamais des exceptions.
- `packages/shared` est figé après l'Étape 1 : un module qui doit le modifier le dit dans sa checklist, sinon la PR est refusée.

## Cycle de développement

Le développement suit un cycle adapté de Marcel (spec, section 7) :

1. `/plan` crée une issue GitHub par module à partir du plan de l'étape (`docs/superpowers/plans/`).
2. `/cycle` prend l'issue suivante de l'étape courante (`docs/STATUS.md`), dispatche un builder dans un worktree,
   puis un judge, puis un visual-checker si la PR touche au rendu, puis merge et nettoie.
3. `/status` résume l'état ; `/checkpoint` sauvegarde la session avant un `/compact`.

Les étapes et leurs conditions de passage sont dans la spec, section 9, et suivies dans `docs/STATUS.md`.
Les modules d'une même étape se construisent en parallèle (un `/cycle` par module).

## Piloter le robot à la main (à partir de l'Étape 3)

Le serveur MCP écoute sur `http://localhost:7331/mcp`. Pour l'ajouter à Claude Code interactif :

    claude mcp add --transport http tomato-robot http://localhost:7331/mcp

Puis, dans une session Claude Code, demander par exemple « regarde les trois vues et déplace le panier sous la tomate 2 ».

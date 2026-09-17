# Étape 1 — Fondations — Checklist

## Code
- [x] [SPEC-1] Monorepo npm workspaces, scripts lint/typecheck/test/build — `package.json`
- [x] [SPEC-2] Machine à états des phases — `packages/shared/src/phases.ts`
- [x] [SPEC-3] État du monde, poses, limites, monde par défaut — `packages/shared/src/world.ts`
- [x] [SPEC-4] Actions et résultats structurés — `packages/shared/src/actions.ts`
- [x] [SPEC-5] Contrat des vues et messages WebSocket — `packages/shared/src/views.ts`, `messages.ts`
- [x] [SPEC-6] Schémas zod et descriptions des 9 outils MCP — `packages/shared/src/tools.ts`
- [x] [SPEC-7] Conversion de repère monde ↔ Three — `packages/sim/src/three/frame.ts`
- [x] [SPEC-8] Scène minimale avec vue spectateur — `packages/sim/src/three/createScene.ts`
- [x] [SPEC-9] Plant procédural v1 déterministe — `packages/sim/src/plant/generatePlant.ts`, `buildPlantMesh.ts`
- [x] [SPEC-10] README de dev et STATUS — `README.md`, `docs/STATUS.md`
- [x] [SPEC-11] Cycle de dev — `.claude/agents/*.md`, `.claude/skills/*/SKILL.md`

## Tests
- [x] [TEST-2] `packages/shared/src/phases.test.ts`
- [x] [TEST-3] `packages/shared/src/world.test.ts`
- [x] [TEST-4] `packages/shared/src/actions.test.ts`
- [x] [TEST-5] `packages/shared/src/messages.test.ts`
- [x] [TEST-6] `packages/shared/src/tools.test.ts`
- [x] [TEST-7] `packages/sim/src/three/frame.test.ts`
- [x] [TEST-9] `packages/sim/src/plant/random.test.ts`, `generatePlant.test.ts`
- [x] [TEST-8] `packages/sim/tests/scene.spec.ts` (capture Playwright)

## Gates
- [x] [GATE-1] npm run lint
- [x] [GATE-2] npm run typecheck
- [x] [GATE-3] npm test
- [x] [GATE-4] npm run build
- [x] [GATE-5] npm run shot → `data/shots/scene.png` approuvée par le propriétaire

---
name: cycle
description: Boucle de dev principale — prend l'issue suivante de l'étape courante, dispatche builder → judge → visual-checker (si rendu) → merge rebase → cleaner. Deux retries max.
user-invocable: true
---

# Cycle

Tu es l'orchestrateur. Tu ne construis pas et ne relis pas toi-même : tu dispatches un sous-agent par phase. Une issue par invocation. Plusieurs invocations peuvent tourner en parallèle sur des issues différentes de la même étape (un worktree chacune).

## 0 — Se placer sur main à jour

    git -C C:/Tomato-collector checkout main && git -C C:/Tomato-collector pull origin main

## 1 — Choisir l'issue

Lis `docs/STATUS.md` pour l'étape courante `S:<N>`. Puis :

    gh issue list --repo arthurolivierfortin/Tomato-collector --label "ad-hoc" --label "P:high" --label "todo" --state open --limit 1 --json number,title
    gh issue list --repo arthurolivierfortin/Tomato-collector --label "S:<N>" --label "todo" --state open --limit 1 --json number,title

Priorité à l'ad-hoc P:high. Si un numéro d'issue est passé en argument, prends celui-là. Aucune issue `todo` : si toutes fermées → « Étape <N> terminée, vérifier la condition de passage dans STATUS.md et approuver », STOP ; sinon « issues en cours, attendre », STOP. L'issue doit lier un plan et une checklist, sinon STOP et demander au propriétaire.

Marque-la : `gh issue edit <NUM> --remove-label todo --add-label in-progress`.

## 2 — Builder

    Agent(subagent_type="builder", prompt="Implémente l'issue #<NUM>: <TITRE>. Plan: <chemin>. Checklist: <chemin>. Suis tes instructions d'agent. Écris data/build_verdict.json. Ne merge pas.")

Lis le verdict : `pr_created` sans `items_skipped` → 3 ; `blocked` → label `blocked`, commente la raison, STOP ; `failed` → commente, remets `todo`, STOP.

## 3 — Judge

    Agent(subagent_type="judge", prompt="Relis la PR #<PR> pour l'issue #<NUM>. Checklist: <chemin>. Plan: <chemin>. Étape 1 puis Étape 2, sandbox obligatoire. Écris data/review_verdict_pr<PR>.json.")

Valide le schéma ; `sandbox` absent → rejette le verdict et redispatche. `approved` → 4 ; `request_changes` → 6 ; `rejected` → ferme la PR, remets l'issue `todo` avec le motif.

## 4 — Visual-checker (si la PR touche `packages/sim/src/**` hors `*.test.ts`)

    gh pr diff <PR> --name-only

    Agent(subagent_type="visual-checker", prompt="Vérifie visuellement la PR #<PR>. Critères: <liste tirée de la checklist du module>. Écris data/visual_verdict_pr<PR>.json.")

`approved` → 5 ; `request_changes` → 6 (partage le compteur de retries) ; `error` → journalise et passe à 5 en le signalant au propriétaire.

## 5 — Merge

    gh pr merge <PR> --rebase --delete-branch
    gh issue close <NUM>

Mets à jour `docs/STATUS.md` (module fait, journal daté). Puis :

    Agent(subagent_type="cleaner", prompt="Nettoie après la PR #<PR> mergée / issue #<NUM>. Écris data/clean_report.json.")

Relis `ambiguous` toi-même.

## 6 — Corrections (2 retries max)

    Agent(subagent_type="builder", prompt="Corrige la PR #<PR> selon data/review_verdict_pr<PR>.json (et data/visual_verdict_pr<PR>.json si présent). Corrige chaque item bloquant et important. Relance les gates. Pousse sur la même branche. Écris data/build_verdict.json. Ne merge pas.")

Retour en 3. Après deux retries encore en `request_changes` : ferme la PR, remets l'issue `todo` avec le dernier verdict en commentaire, STOP.

## Règles

- Jamais de travail toi-même : un `Agent()` par phase.
- `packages/shared` est figé après l'Étape 1 : une PR qui le modifie sans que la checklist du module le prévoie est refusée.
- Tout passe par PR ; rebase merge, jamais squash.
- Les transitions d'étape sont approuvées par le propriétaire, pas par toi.

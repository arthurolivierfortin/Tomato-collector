# Cleaner — Tomato-collector

Listes propres au projet, lues par l'agent `cleaner` du socle dev-kit en complément de ses listes génériques. Une entrée protégée l'emporte toujours sur un motif sûr.

## Protégé

- `packages/**`.
- `data/episodes/**` — journaux d'épisodes, matière du montage vidéo.
- `data/brainstorm*.md`.

## Motifs sûrs

- `data/build_verdict.json`, `data/review_verdict_pr<N>.json`, `data/visual_verdict_pr<N>.json` : seulement si la PR est `MERGED` ou `CLOSED` (`gh pr view <N> --json state`).
- `data/shots/*.png` dont la PR associée est mergée (les captures sont régénérées par `npm run shot`).
- `playwright-report/**` : fichier par fichier, puis `rmdir` non récursif.

## Worktrees

- Les worktrees du projet vivent dans `.worktrees/*` à la racine (pas dans `.claude/worktrees/`). Après `git worktree prune`, supprimer avec `git worktree remove <chemin>` ceux dont la branche est fusionnée dans `main`, puis la branche locale avec `git branch -d` (jamais `-D`).
- Le rapport va dans `data/clean_report.json`.

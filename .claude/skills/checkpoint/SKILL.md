---
name: checkpoint
description: Sauvegarde l'état complet de la session avant un /compact ou /clear.
user-invocable: true
---

# Checkpoint

Écris (écrase) `C:\Users\arthu\.claude\projects\C--Tomato-collector\memory\session-checkpoint.md` avec frontmatter `name: session-checkpoint`, `type: project`, description « CHECKPOINT de session (date) — état complet pour reprise », et ces sections vérifiées par commandes (`gh pr list`, `git worktree list`, `git status`), pas de mémoire approximative :

1. Mandat en cours et niveau d'autonomie accordé.
2. Étape courante et condition de passage.
3. Mergé récemment (PR + une ligne).
4. En vol : chaque PR ouverte, ce qui reste, ID de chaque agent actif et son worktree.
5. Décisions en attente du propriétaire, numérotées.
6. Pièges appris cette session non déjà en mémoire.

Vérifie que `MEMORY.md` contient en tête la ligne « ⚡ CHECKPOINT session … LIRE EN PREMIER » vers ce fichier.

Termine par :

> Checkpoint écrit. Lance `/compact Préserve les PR ouvertes et leurs correctifs restants, les IDs des agents en vol, les worktrees actifs, les décisions en attente et les prochaines étapes. session-checkpoint.md fait foi.`

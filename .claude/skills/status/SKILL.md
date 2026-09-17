---
name: status
description: Résume l'état du projet — étape courante, issues par état, PR récentes, condition de passage.
user-invocable: true
---

# Status

    cat docs/STATUS.md
    gh issue list --repo arthurolivierfortin/Tomato-collector --state open --json number,title,labels
    gh pr list --repo arthurolivierfortin/Tomato-collector --state all --limit 8 --json number,title,state,mergedAt
    git -C C:/Tomato-collector worktree list
    git -C C:/Tomato-collector log --oneline -8

Affiche :

    ## Tomato Collector — Status
    Étape S:<N> : <titre> — <faits>/<total> modules mergés
    Issues : todo <n>, in-progress <n>, in-review <n>, blocked <n>
    PR : <liste>
    Worktrees actifs : <liste>
    Condition de passage : <texte> — <remplie / manque : ...>

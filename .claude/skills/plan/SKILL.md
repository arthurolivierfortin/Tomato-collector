---
name: plan
description: Crée les issues GitHub d'une étape à partir de son plan (un module = une issue), avec labels S:<N>, todo, module.
user-invocable: true
---

# Plan

## 1 — Lire

    cat docs/STATUS.md
    ls docs/superpowers/plans/

Identifie l'étape (argument ou étape courante de STATUS.md) et les plans de modules `docs/superpowers/plans/2026-09-17-etape-<N>-m<K>-*.md`.

## 2 — Vérifier l'existant

    gh issue list --repo arthurolivierfortin/Tomato-collector --label "S:<N>" --state all --json number,title,body

Si une issue existe déjà pour un module, ne la recrée pas : mets à jour son corps (`gh issue edit <NUM> --body`) pour lier le plan et la checklist réels.

## 3 — Créer une issue par module manquant

    gh issue create --repo arthurolivierfortin/Tomato-collector \
      --title "M<K> — <titre du module>" \
      --label "S:<N>,module,todo" \
      --body "## Objectif
<une phrase tirée du plan>

## Plan
docs/superpowers/plans/<fichier>.md

## Checklist
docs/superpowers/specs/<fichier>-checklist.md

## Étape
S:<N>

## Condition de passage de l'étape
<copiée de STATUS.md>"

## 4 — Confirmer

Liste les issues créées ou mises à jour et rappelle : « Lance /cycle (une fois par module, en parallèle si tu veux) ».

---
name: pipeline-feature
description: Déroulé imposé d'une feature selon son tier (trivial, standard, structurel), de la spec au DONE, avec les commandes du socle et le format d'escalade. À charger par l'orchestrateur avant de démarrer ou de reprendre une feature.
---

# Pipeline d'une feature

## Règles critiques

- Le déterministe d'abord : aucun gate LLM tant que `checks.txt` ne finit pas par `RESULTAT: OK`.
- Un producteur ne rend jamais son propre gate ; les gates passent par `gate.sh` (processus séparé).
- Toute correction de code après une revue change l'empreinte : reprendre à `dossier-revue.sh`.
- Code 3 d'un script = escalade au dev, on s'arrête. `UNVERIFIED` se liste dans `STATE.md`, jamais PASS.
- L'orchestrateur ne code pas : il délègue chaque étape au sous-agent nommé, jamais en mode fork.
- Une feature = une session quand c'est possible.

## TRIVIAL

1. Producteur : changement + tests impactés ; commits `Feature: trivial`.
2. Contrôles du commit (et du push s'il y a un distant). Échec : retour 1.
3. `PROJECT_LOG.md` : une entrée.

Si le diff touche authentification, secrets, dépendances, permissions ou I/O externe : reclasser `standard`.

## STANDARD

0. Spec `specs/<F-id>.md` validée par un commit du dev (`Statut : validée`).
1. `agent-veille` seulement sur déclencheur (techno ou dépendance nouvelle, section de plus de 30 jours, CVE).
2. Producteur(s) : code + tests dans leur périmètre, un commit par agent.
3. `.agents/checks/dossier-revue.sh <F-id>` : code différent de 0, retour 2.
4. `.agents/checks/gate.sh <reviewer> <F-id>` pour chaque reviewer de la ligne `Revue :`.
5. En parallèle : `.agents/checks/gate.sh agent-architecte <F-id>` et `.agents/checks/gate.sh agent-securite <F-id>`.
6. `.agents/checks/craft.sh <F-id>`.
7. Commit de `MEMORY/gates.log` (`Agent: orchestrateur`, `Feature: <F-id>`), puis `.agents/checks/gates-verts.sh main..HEAD`.
8. `PROJECT_LOG.md`, `MEMORY/features/<F-id>.md`, `MEMORY/INDEX.md`, `MEMORY/STATE.md` réécrit (skill `tracabilite`).
9. Fusion dans `main` par merge commit ou rebase.

DONE si 3 = OK, chaque reviewer APPROVED, 5 et 6 = PASS, 7 = OK.

## STRUCTUREL

0. Spec validée par le dev.
1. `agent-veille` : rafraîchissement forcé des technos touchées.
2. `agent-architecte-conception` : approche, plan par blocs, ADR ; puis `.agents/checks/dossier-revue.sh --conception <F-id>` et `.agents/checks/gate.sh agent-architecte <F-id>`. Bloquant avant tout code. Le dev commite les fichiers protégés proposés (contrats de dépendances, squelette de paquet).
3. Producteur(s) bloc par bloc, un commit par bloc ; puis `agent-architecte-conception` aligne `ARCHITECTURE.md` sur le code livré.
4. à 9. Comme STANDARD 3 à 8.
10. `agent-planif` réordonne `ROADMAP.md`.
11. Journal, `gates-verts.sh`, fusion : comme STANDARD 7 et 9.

## Escalade (code 3)

```
ESCALADE — <F-id> — <gate ou contrôle> × 3
- Ce qui bloque (extrait de checks.txt ou du rapport de gate) : ...
- Position du gate : ...
- Position du producteur : ...
- Options (2–3) avec compromis de chacune : ...
- Recommandation : ...
```

Le dev tranche. Pour relancer un gate sans l'accepter, il ajoute au journal, dans un commit `Agent: dev` : `<date> | <gate> | <F-id> | REPRISE D-xxx | <empreinte>`. Pour accepter un gate non vert : `DEROGATION D-xxx` à la place de `REPRISE D-xxx`. Un agent n'écrit jamais ces lignes.

Précédence entre gates : agent-securite > agent-architecte > reviewer > producteur.

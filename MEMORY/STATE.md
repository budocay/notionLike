# STATE — notionLike — 2026-10-08

## Où on en est

Dépôt généré par AGENT_FACTORY 2.3.0-rc.3 : socle de contrôle, agents, outillage qualité. Aucun code applicatif, aucune spec, aucune feature.

## Prochaine action prévue

Invoquer `agent-planif` : produire `ROADMAP.md` et `specs/F-001.md` (premier module, tier structurel) à partir de `.agents/fiche.yaml`, puis les faire valider par le dev.

## Dettes ouvertes

- D-001 Pas de CI ni de branche protégée — depuis la génération — impact : les hooks git se contournent par `--no-verify`, pas de `CODEOWNERS` ; à lever dès qu'une plateforme git est choisie.

## État des contrôles / gates

`test-blocage.sh` : voir le résultat noté par le dev à la génération. Aucun verdict de gate.

## Pièges actifs

- Un nouveau paquet de workspace (`package.json` avec scripts, `vitest.config.*`) est créé par le dev, pas par un agent.
- Playwright et Stryker ne sont pas installés : à ajouter par le dev avec le premier écran.

# STATE — notionLike — 2026-10-08

## Où on en est

Aucune feature DONE. F-001 (arborescence des pages, `packages/document`, tier structurel) est en cours sur la branche `F-001` : spec validée (`ccbcd25`), conception passée au gate architecture après trois rejets et une reprise du dev, bloc 0 commité par le dev (`dd6e018`), code des blocs 1 à 4 commité en un seul commit (`76146f5`). La revue de F-001 n'a pas commencé.

Une coupure de courant a interrompu la session le 2026-10-08 vers 19 h 53. L'arbre de travail de la branche `F-001` porte du travail NON COMMITÉ fait en avance, sans spec validée : code F-003 dans `packages/document` (`document-page.ts`, `format-page.ts`, leurs tests, et un reste de diff dans `erreurs.ts`, `index.ts`, `test/structure.test.ts`), application `apps/web` entière (F-002 et F-003), ADR 0004 à 0009, conceptions F-002, F-003 et F-008, et des fichiers protégés ou partagés modifiés (`eslint.config.mjs`, `.dependency-cruiser.cjs`, `pnpm-lock.yaml`, configurations de `apps/web`). `ARCHITECTURE.md` est modifié dans l'arbre et mêle plusieurs features.

Specs F-002, F-008, F-009, F-017 : écrites, en `brouillon`. F-003 : pas de spec.

## Prochaine action prévue

Faire aligner `ARCHITECTURE.md` sur le code F-001 livré par `agent-architecte-conception` (version F-001 seule, sans toucher à l'arbre), puis lancer la revue de F-001 dans un worktree séparé au commit de tête : `dossier-revue.sh F-001`, `gate.sh reviewer-frontend F-001`, `gate.sh agent-architecte F-001`, `gate.sh agent-securite F-001`, `craft.sh F-001`.

## Dettes ouvertes

- D-001 Pas de CI ni de branche protégée — depuis la génération — impact : les hooks git se contournent par `--no-verify`, pas de `CODEOWNERS` ; à lever dès qu'une plateforme git est choisie.
- D-002 Tests d'intégration du serveur sur PGlite et non sur un PostgreSQL réel — proposée par F-008 (voir `ROADMAP.md`) — pas encore ouverte par le dev.
- D-003 Tests de bout en bout hors des hooks — proposée par F-002 (voir `ROADMAP.md`) — pas encore ouverte par le dev.
- D-004 Citée par le dev dans deux lignes `REPRISE D-004` de `MEMORY/gates.log` (gate architecture de la conception F-001, après trois rejets) — son titre et son impact ne sont écrits nulle part : à faire décrire par le dev dans `PROJECT_LOG.md`.

## État des contrôles / gates

2026-10-08, 19 h 56, sur l'arbre complet (travail non commité compris) : `pnpm test` 446 tests verts sur 29 fichiers ; `pnpm typecheck`, `pnpm lint`, `pnpm contrats` verts. Sur le contenu du commit `76146f5` exporté seul : 222 tests verts sur 6 fichiers, typecheck, lint et contrats verts (constat d'`agent-frontend`).

Gates : conception F-001, `ARCHITECTURE GATE: PASS` (empreinte `08f4a9e7c786`) après trois `FAIL` et une ligne `REPRISE D-004` ; une seconde ligne `REPRISE D-004` suit le PASS. Aucun gate sur le code de F-001. Aucun `checks.txt` de revue de code.

UNVERIFIED : tests de bout en bout de `apps/web` (`pnpm --filter @notionlike/web test:e2e`), non relancés depuis la coupure.

## Pièges actifs

- Ne jamais lancer `git stash`, `git clean`, `git restore`, `git checkout -- <fichier>` ni `git reset --hard` sur cet arbre : le travail non commité de F-002 et F-003 n'existe nulle part ailleurs (une archive temporaire existe hors dépôt, elle ne survit pas à un redémarrage).
- `dossier-revue.sh` exige un arbre propre : la revue de F-001 se fait dans un worktree séparé, pas ici.
- Trois fichiers de `packages/document` sont commités en version F-001 seule et restent modifiés dans l'arbre (part F-003) : `src/erreurs.ts`, `src/index.ts`, `test/structure.test.ts`. Un `git add` de ces fichiers sous `Feature: F-001` ferait entrer du code F-003.
- Le code de F-002 et F-003 a été écrit sans spec validée : aucun commit, aucun gate tant que le dev n'a pas validé `specs/F-002.md` et une `specs/F-003.md` à écrire.
- Les fichiers protégés modifiés dans l'arbre ne se commitent que par le dev (`Agent: dev`).
- `.idea/` est exclu localement par `.git/info/exclude`, pas par `.gitignore`.
- Un nouveau paquet de workspace (`package.json` avec scripts, `vitest.config.*`) est créé par le dev, pas par un agent.
- L'historique bloc par bloc de F-001 est perdu : `76146f5` porte l'état final des blocs 1 à 4.
- Stryker n'est pas installé.

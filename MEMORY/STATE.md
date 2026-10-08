# STATE — notionLike — 2026-10-08

## Où on en est

F-001 (arborescence des pages, `packages/document`, tier structurel) : revue terminée, tous les gates verts sur l'empreinte `ca4cb0d41fe3`, traçabilité écrite. Reste la fusion dans `main` et le réordonnancement de `ROADMAP.md` par `agent-planif`.

L'arbre de travail de la branche `F-001` porte du travail NON COMMITÉ fait en avance, sans spec validée : code F-003 dans `packages/document` (`document-page.ts`, `format-page.ts`, leurs tests, et un reste de diff dans `erreurs.ts`, `index.ts`, `test/structure.test.ts`), application `apps/web` entière (F-002 et F-003), ADR 0004 à 0009, conceptions F-002, F-003 et F-008, fichiers protégés ou partagés modifiés (`eslint.config.mjs`, `.dependency-cruiser.cjs`, `pnpm-lock.yaml`, configurations de `apps/web`). `ARCHITECTURE.md` de l'arbre est une ancienne version de celle de HEAD : repartir de HEAD.

Specs F-002, F-008, F-009, F-017 : écrites, en `brouillon`. F-003 : pas de spec.

## Prochaine action prévue

Le dev valide `specs/F-002.md` (commit `Agent: dev`) et commite les fichiers protégés de son bloc 0 ; ensuite reprendre F-002 au pipeline structurel à partir du code déjà présent dans l'arbre : gate de conception sur `docs/decisions/F-002-conception.md`, commits d'`agent-frontend`, revue.

## Dettes ouvertes

- D-001 Pas de CI ni de branche protégée — depuis la génération — impact : les hooks git se contournent par `--no-verify`, pas de `CODEOWNERS` ; à lever dès qu'une plateforme git est choisie.
- D-002 Tests d'intégration du serveur sur PGlite et non sur un PostgreSQL réel — proposée par F-008 (voir `ROADMAP.md`) — pas encore ouverte par le dev.
- D-003 Tests de bout en bout hors des hooks — proposée par F-002 (voir `ROADMAP.md`) — pas encore ouverte par le dev.
- D-004 Citée par le dev dans deux lignes `REPRISE D-004` de `MEMORY/gates.log` — titre et impact écrits nulle part : à faire décrire par le dev dans `PROJECT_LOG.md`.
- D-005 Rang de longueur non bornée et `rangEntre` récursive — depuis F-001 — impact : une mise à jour forgée peut épuiser la pile ; à lever avant F-012.
- D-006 Rappel d'abonné qui lève, façade sans fermeture — depuis F-001 — impact : diffusion interrompue, écouteur jamais retiré ; à lever avec F-002.
- D-007 Vérification des types hors des contrôles du socle — depuis F-001 — impact : la barrière « sans DOM » de F-001-AC19 n'est prouvée par aucun `checks.txt` ; à lever par le dev.

## État des contrôles / gates

2026-10-08, F-001, empreinte `ca4cb0d41fe3` : `checks.txt` → `RESULTAT: OK` (224 tests sur 6 fichiers) ; `reviewer-frontend` APPROVED, `SECURITY GATE: PASS`, `ARCHITECTURE GATE: PASS`, `CRAFT GATE: PASS` ; `gates-verts.sh main..HEAD` → `RESULTAT GATES: OK`. Premier passage (empreinte `3de42046e390`) : `CHANGES_REQUESTED` (deux constats, corrigés par `f9b7def`) et sécurité `UNVERIFIED` (verdict écrit dans un bloc de code).

Arbre complet, travail non commité compris : `pnpm test` 448 tests verts sur 29 fichiers, `pnpm typecheck`, `pnpm lint`, `pnpm contrats` verts (lancés à la main).

UNVERIFIED : tests de bout en bout de `apps/web` (`pnpm --filter @notionlike/web test:e2e`), non relancés depuis la coupure de courant du 2026-10-08.

## Pièges actifs

- Ne jamais lancer `git stash`, `git clean`, `git restore`, `git checkout -- <fichier>` ni `git reset --hard` sur cet arbre : le travail non commité de F-002 et F-003 n'existe nulle part ailleurs.
- `dossier-revue.sh` exige un arbre propre : tant que ce travail n'est pas commité, une revue se fait dans un worktree séparé.
- Trois fichiers de `packages/document` sont commités en version F-001 seule et restent modifiés dans l'arbre (part F-003) : `src/erreurs.ts`, `src/index.ts`, `test/structure.test.ts`.
- Le code de F-002 et F-003 a été écrit sans spec validée : aucun commit, aucun gate tant que le dev n'a pas validé `specs/F-002.md` et une `specs/F-003.md` à écrire.
- Les fichiers protégés modifiés dans l'arbre ne se commitent que par le dev (`Agent: dev`).
- `fast-check@4.10.2` n'est pas dans la spec F-001 : à entériner par le dev.
- `.idea/` est exclu localement par `.git/info/exclude`, pas par `.gitignore`.
- Un gate dont la ligne de verdict est dans un bloc de code est lu `UNVERIFIED` : relancer le gate.
- Un nouveau paquet de workspace (`package.json` avec scripts, `vitest.config.*`) est créé par le dev, pas par un agent.
- Stryker n'est pas installé.

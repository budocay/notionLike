# STATE — notionLike — 2026-10-08

## Où on en est

F-001 (arborescence des pages, `packages/document`, tier structurel) est DONE : tous les gates verts sur l'empreinte `ca4cb0d41fe3`, fusionnée dans `main` par le merge commit `7e99266`. Aucune feature en cours.

La branche de planification `F-008` (131 commits : ROADMAP à 28 features, specs F-002 à F-028 en brouillon, veille, ADR-0004 à 0006 et conception de F-008) est réunie avec la ligne F-001 sur la branche `planification-reunie` (merge commit `d1caf7a`), PAS dans `main`. Elle y a été fusionnée par erreur puis retirée : `gates-verts.sh` y échoue (`FAIL F-008 : specs/F-008.md n'est pas validée`), parce que la conception de F-008 est commitée sur une spec en brouillon. `main` est à `7e99266` et ne porte que ce qui a passé ses gates. `planification-reunie` porte 28 specs, 947 critères : F-001 validée, 27 brouillons ; c'est elle qui fait foi pour la planification.

Le dépôt principal (`~/dev/notionLike`) est resté sur la branche `F-001`, en retard sur `main`, parce que son arbre de travail porte du travail NON COMMITÉ, fait en avance sans spec validée : code F-003 dans `packages/document` (`document-page.ts`, `format-page.ts`, leurs tests, et un reste de diff dans `erreurs.ts`, `index.ts`, `test/structure.test.ts`), application `apps/web` entière (F-002 et F-003), ADR 0007 à 0009, conceptions F-002 et F-003, une version de `docs/decisions/F-008-conception.md` différente de celle de `main`, et des fichiers protégés ou partagés modifiés (`eslint.config.mjs`, `.dependency-cruiser.cjs`, `pnpm-lock.yaml`, configurations d'`apps/web`). `main` n'est extrait que dans un worktree temporaire.

## Prochaine action prévue

Sur la branche `planification-reunie`, le dev valide `specs/F-008.md` et `specs/F-002.md` (commits `Agent: dev`, en tranchant H13 et H14 de F-002) ; l'orchestrateur passe alors le gate de conception de F-008 (`dossier-revue.sh --conception F-008`, `gate.sh agent-architecte F-008`), vérifie `gates-verts.sh main..planification-reunie`, et fusionne la branche dans `main`. Puis amener le travail non commité sur une branche `F-002` partie de `main` sans le perdre (les fichiers non suivis `docs/decisions/0004` à `0006` et `F-008-conception.md` existent aussi dans `main` : les comparer avant tout changement de branche), relire `docs/decisions/F-002-conception.md` contre la spec réunie, et reprendre le pipeline structurel de F-002 au gate de conception.

## Dettes ouvertes

- D-001 Pas de CI ni de branche protégée — depuis la génération — impact : les hooks git se contournent par `--no-verify`, pas de `CODEOWNERS` ; à lever dès qu'une plateforme git est choisie.
- D-002 Tests d'intégration du serveur sur PGlite et non sur un PostgreSQL réel — proposée par F-008 (voir `ROADMAP.md`) — pas encore ouverte par le dev.
- D-003 Tests de bout en bout hors des hooks — proposée par F-002 (voir `ROADMAP.md`) — pas encore ouverte par le dev.
- D-004 Citée par le dev dans deux lignes `REPRISE D-004` de `MEMORY/gates.log` — titre et impact écrits nulle part : à faire décrire par le dev dans `PROJECT_LOG.md`.
- D-005 Rang de longueur non bornée et `rangEntre` récursive — depuis F-001 — impact : une mise à jour forgée peut épuiser la pile ; à lever avant F-012, aucune feature ne la porte encore.
- D-006 Rappel d'abonné qui lève, façade sans fermeture — depuis F-001 — impact : diffusion interrompue, écouteur jamais retiré ; levée par F-002 (AC29, AC30) si le dev retient H13.
- D-007 Vérification des types hors des contrôles du socle — depuis F-001 — impact : la barrière « sans DOM » de F-001-AC19 n'est prouvée par aucun `checks.txt` ; à lever par le dev.

## État des contrôles / gates

2026-10-08, F-001, empreinte `ca4cb0d41fe3` : `checks.txt` → `RESULTAT: OK` (224 tests sur 6 fichiers) ; `reviewer-frontend` APPROVED, `SECURITY GATE: PASS`, `ARCHITECTURE GATE: PASS`, `CRAFT GATE: PASS` ; `gates-verts.sh main..HEAD` → `RESULTAT GATES: OK` avant la fusion.

`main` à `7e99266` : `gates-verts.sh 275d4ef..main` → `RESULTAT GATES: OK`.

`planification-reunie` : `pnpm test` 224 tests verts sur 6 fichiers, `pnpm lint` et `pnpm contrats` verts ; `gates-verts.sh 7e99266..planification-reunie` → `FAIL F-008 : specs/F-008.md n'est pas validée`. Pas de fusion dans `main` tant que ce contrôle n'est pas vert.

Non conforme sur `planification-reunie`, à trancher par le dev : `.agents/checks/perimetre.sh --commits -1 d1caf7a` → `HORS : MEMORY/VEILLE.md (commit d1caf7a, agent-planif)`, code 2. La résolution du conflit de fusion compte comme une écriture d'`agent-planif` hors de son périmètre, bien que le contenu soit la version de `F-008` à l'octet près. Le hook `pre-push` refusera ce commit ; il n'y a pas de distant aujourd'hui.

UNVERIFIED : arbre de travail du dépôt principal (448 tests verts, typecheck, lint et contrats verts, lancés à la main, hors de tout dossier de revue) ; tests de bout en bout d'`apps/web` (`pnpm --filter @notionlike/web test:e2e`), non relancés depuis la coupure de courant du 2026-10-08.

## Pièges actifs

- Dans `~/dev/notionLike`, ne jamais lancer `git stash`, `git clean`, `git restore`, `git checkout -- <fichier>`, `git reset --hard` ni changer de branche sans précaution : le travail non commité de F-002 et F-003 n'existe nulle part ailleurs.
- Avant de fusionner une branche dans `main`, lancer soi-même `.agents/checks/gates-verts.sh main..<branche>` et lire toute la sortie : un rapport d'agent a annoncé un code 0 en omettant une ligne `FAIL`.
- Avant toute commande, lister les branches et les worktrees (`git branch -a -vv`, `git worktree list`) : une reprise qui ne l'a pas fait a manqué la branche `F-008` pendant une heure.
- Le code de F-002 et F-003 a été écrit contre les specs de l'ancienne branche `F-008`. La spec F-002 réunie a six critères de plus (AC27 à AC32) et un AC25 réécrit (identifiant UUID canonique) : `apps/web/src/persistance/nom-de-base.ts` ne contrôle que l'identifiant d'espace.
- Trois fichiers de `packages/document` sont commités en version F-001 seule et restent modifiés dans l'arbre (part F-003) : `src/erreurs.ts`, `src/index.ts`, `test/structure.test.ts`.
- `ARCHITECTURE.md` de l'arbre du dépôt principal est une ancienne version : repartir de celle de `main`.
- `specs/F-012.md` ne dit pas qui écrit `meta.version` et ne cite pas D-005 : à porter avant sa validation.
- Les fichiers protégés ne se commitent que par le dev (`Agent: dev`) ; un nouveau paquet de workspace aussi.
- `fast-check@4.10.2` n'est pas dans la spec F-001 : à entériner par le dev.
- `.idea/` est exclu localement par `.git/info/exclude`, pas par `.gitignore`.
- Un gate dont la ligne de verdict est dans un bloc de code est lu `UNVERIFIED` : relancer le gate.
- `dossier-revue.sh` exige un arbre propre : une revue se fait dans un worktree séparé tant que l'arbre principal est chargé.
- Stryker n'est pas installé.

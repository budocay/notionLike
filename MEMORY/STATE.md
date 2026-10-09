# STATE — notionLike — 2026-10-08

## Où on en est

F-001 (arborescence des pages, `packages/document`, tier structurel) est DONE et dans `main` (`7e99266`). Aucune autre feature n'est DONE.

La planification complète est dans `main` (merge `2615352`) : 29 features, 29 specs, 998 critères, `ROADMAP.md`, `MEMORY/VEILLE.md` (64 sections). Validées : F-001, et F-002 sur la branche `F-002`. Les 27 autres specs sont en brouillon, F-008 comprise (sa validation faite sur la branche d'archive `planification-reunie` ne vaut pas ici).

F-002 (application web locale, tier structurel) est EN REVUE sur la branche `F-002` : blocs 0 à 4 commités (`b88f66e`, `59a070d`, `7a51272`, `3728cc7`, `01cd81e`). Première revue sur l'empreinte `8f7d2995277f` : `reviewer-frontend` CHANGES_REQUESTED (test d'AC26 incomplet, preuves de `typecheck` et `build` absentes du dossier), `agent-architecte` UNVERIFIED (mêmes preuves, plus le bout en bout), `SECURITY GATE: PASS`, `CRAFT GATE: PASS`. Corrections commitées (`ba8edbd`) ; preuves versées dans `MEMORY/features/F-002.md`. Second passage, empreinte `07883ce15e6e` : `ARCHITECTURE GATE: PASS`, `SECURITY GATE: PASS`, `CRAFT GATE: PASS`, `reviewer-frontend` CHANGES_REQUESTED une seconde fois (titre sans caractère visible, F-002-AC10) ; correctif `431d717`. Troisième passage à lancer : un troisième rejet du reviewer déclenche l'escalade (code 3), que seul le dev peut reprendre.

Le dev a exigé le 2026-10-09 que les données soient toujours persistées : spec F-030 (reprise de la persistance après une coupure, 28 critères, brouillon ajusté à la veille du 2026-10-09), placée juste après F-002. Le 2026-10-09, le dev a accepté d'alléger le parcours : `ARCHITECTURE.md` aligné une seule fois par feature ; F-019, F-020, F-021 reclassées `standard` ; nouvel ordre du chemin client F-002 → F-004 → F-030 → F-003. F-004 (46 critères) ne dépend plus que de F-002 ; F-003 (44 critères) reçoit les critères d'éditeur de F-004 et livre la barre flottante sans barre provisoire. Décision de l'orchestrateur à inscrire dans F-004 avant sa validation : tant que F-030 n'est pas livrée, F-004 n'affiche que l'état d'échec d'enregistrement, jamais « Enregistré ». Le chemin serveur, qui apporte la base PostgreSQL, n'a pas commencé.

Depuis le 2026-10-09, le dev a délégué à l'orchestrateur tous les commits `Agent: dev` (dette D-008).

`specs/F-004.md` (identité visuelle) a été réécrite le 2026-10-08 après le retour du dev sur l'interface (« pas stylé, responsive à revoir ») : critères AC24 à AC53 sur la barre latérale, l'éditeur sans cadre, le tiroir sur petit écran, les captures de référence.

Le dépôt principal (`~/dev/notionLike`) est sur la branche `F-002`, arbre propre. Le travail fait en avance le 2026-10-08 (application `apps/web` entière pour F-002 et F-003, code F-003 de `packages/document`, ADR-0009, conception de F-003, fichiers de configuration mêlés) est archivé sur la branche `archive-arbre-2026-10-08` (`f1946e2`, 70 chemins), jamais fusionnée : les producteurs y reprennent chaque fichier par `git show archive-arbre-2026-10-08:<chemin>`, en séparant F-002 de F-003 comme le dit la conception.

## Prochaine action prévue

Dans le worktree `scratchpad/revue-F-001` : `git checkout --detach F-002`, `dossier-revue.sh F-002`, `gate.sh reviewer-frontend F-002`, puis `gate.sh agent-architecte F-002` et `gate.sh agent-securite F-002` en parallèle, puis `craft.sh F-002` ; commit de `MEMORY/gates.log` (avec les trailers, y compris sur un merge), `gates-verts.sh main..HEAD`, entrée de `PROJECT_LOG.md`, `MEMORY/INDEX.md`, fusion dans `main`. Ensuite, dans l'ordre : F-004 (retoucher AC40, valider la spec par délégation, conception, gate, code), F-030, F-003.

F-008 (serveur) : conception terminée et ADR-0004 à 0006 acceptés, sur la branche d'archive `planification-reunie` (`a246106`). À reposer par `agent-architecte-conception` sur une branche `F-008-socle` neuve partie de `main` (le nom `F-008` est pris par une archive), après revalidation de `specs/F-008.md` par le dev ; son gate de conception n'a jamais tourné.

## Dettes ouvertes

- D-001 Pas de CI ni de branche protégée — depuis la génération — impact : les hooks git se contournent par `--no-verify`, pas de `CODEOWNERS` ; à lever dès qu'une plateforme git est choisie.
- D-002 Tests d'intégration du serveur sur PGlite et non sur un PostgreSQL réel — proposée par F-008 (voir `ROADMAP.md`) — pas encore ouverte par le dev.
- D-003 Tests de bout en bout hors des hooks — proposée par F-002 (voir `ROADMAP.md`) — pas encore ouverte par le dev ; couvre aussi les preuves « navigateur » de F-004.
- D-004 Citée par le dev dans deux lignes `REPRISE D-004` de `MEMORY/gates.log` — titre et impact écrits nulle part : à faire décrire par le dev dans `PROJECT_LOG.md`.
- D-005 Rang de longueur non bornée et `rangEntre` récursive — depuis F-001 — impact : une mise à jour forgée peut épuiser la pile ; levée par F-029, obligatoire avant F-012.
- D-006 Rappel d'abonné qui lève, façade sans fermeture — depuis F-001 — impact : diffusion interrompue, écouteur jamais retiré ; levée par F-002 (AC29, AC30) si le dev retient H13.
- D-007 Vérification des types hors des contrôles du socle — depuis F-001 — impact : la barrière « sans DOM » de F-001-AC19 n'est prouvée par aucun `checks.txt` ; aggravée par le bloc 0 de F-008, après lequel `tsc` accepte `process` et `Buffer` dans `packages/document` ; à lever par le dev.

- D-008 Commits `Agent: dev` délégués à l'orchestrateur — depuis le 2026-10-09 — impact : le trailer `Agent: dev` ne prouve plus qu'un humain a lu une spec ou un fichier protégé ; à lever par le dev (retirer les règles de `.claude/settings.local.json` ou relire les commits délégués).

## État des contrôles / gates

2026-10-08, F-001, empreinte `ca4cb0d41fe3` : `checks.txt` → `RESULTAT: OK` (224 tests sur 6 fichiers) ; `reviewer-frontend` APPROVED, `SECURITY GATE: PASS`, `ARCHITECTURE GATE: PASS`, `CRAFT GATE: PASS`.

`main` à `2615352` : `gates-verts.sh 275d4ef..main` → `RESULTAT GATES: OK` (F-001 OK, le reste en planification seulement) ; `perimetre.sh --commits` sur les commits d'import → code 0.

UNVERIFIED : arbre de travail du dépôt principal (448 tests verts sur 29 fichiers, lancés à la main, hors de tout dossier de revue) ; `pnpm typecheck` (hors contrôles, D-007) ; tests de bout en bout d'`apps/web` (`pnpm --filter @notionlike/web test:e2e`), non relancés depuis la coupure de courant du 2026-10-08.

## Pièges actifs

- Dans `~/dev/notionLike`, ne jamais lancer `git stash`, `git clean`, `git restore`, `git checkout -- <fichier>`, `git reset --hard` : le travail non commité de F-002 et F-003 n'existe nulle part ailleurs. Un changement de branche n'est sûr que si les fichiers modifiés sont identiques dans les deux branches et qu'aucun fichier non suivi n'existe dans la cible : le vérifier avant.
- Branches d'archive, à ne pas fusionner : `planification-reunie` (échoue à `CONTROLE perimetre` sur le merge `d1caf7a`, `HORS : MEMORY/VEILLE.md`, et porte la conception de F-008 sans gate), `F-008` (131 commits de planification, historique détaillé) et `F-001` (déjà fusionnée). Elles gardent l'historique ; l'état final est dans `main`.
- Les commits de conception d'une feature exigent tous ses gates avant d'entrer dans `main` : ne jamais les mêler à une branche de planification. La planification seule (specs, `ROADMAP.md`, `MEMORY/`) n'exige aucun gate.
- Un conflit de fusion résolu par un agent compte comme une écriture de cet agent sur chaque fichier en conflit : faire reposer le fichier par son propriétaire.
- Le hook de périmètre ne résout que `CLAUDE_PROJECT_DIR` : il refuse toute écriture d'agent dans un autre worktree et toute écriture de l'orchestrateur hors de la traçabilité. Les scripts de contrôle et les gates, eux, tournent dans un worktree. Une seule branche avance donc à la fois en écriture.
- Avant de fusionner une branche dans `main`, lancer soi-même `.agents/checks/gates-verts.sh main..<branche>` et lire toute la sortie : un rapport d'agent a annoncé un code 0 en omettant une ligne `FAIL`.
- Avant toute commande, lister les branches et les worktrees (`git branch -a -vv`, `git worktree list`).
- Le code de F-002 et F-003 de l'arbre a été écrit contre d'anciennes versions des specs. La spec F-002 réunie a six critères de plus (AC27 à AC32) et un AC25 réécrit (identifiant UUID canonique) : `apps/web/src/persistance/nom-de-base.ts` ne contrôle que l'identifiant d'espace. F-004 remplace la barre d'outils permanente de F-003 et les boutons de rangée de F-002.
- Trois fichiers de `packages/document` sont commités en version F-001 seule et restent modifiés dans l'arbre (part F-003) : `src/erreurs.ts`, `src/index.ts`, `test/structure.test.ts`.
- Les fichiers protégés ne se commitent que par le dev (`Agent: dev`) ; un nouveau paquet de workspace aussi ; une validation de spec aussi, et elle ne vaut que sur la ligne où elle est commitée.
- `fast-check@4.10.2` n'est pas dans la spec F-001 : à entériner par le dev.
- `.idea/` est exclu localement par `.git/info/exclude`, pas par `.gitignore`.
- Un gate dont la ligne de verdict est dans un bloc de code est lu `UNVERIFIED` : relancer le gate.
- Stryker n'est pas installé.

# STATE — notionLike — 2026-10-16

## Où on en est

Dépôt distant : `git@github.com:budocay/notionLike.git`, repris depuis Claude Code cloud. Sur un clone neuf : `pnpm install --frozen-lockfile` et `git config core.hooksPath .githooks`. Dans le conteneur cloud, il faut en plus Node 26 en tête du `PATH` (`/opt/nvm/versions/node/v26.10.0/bin`), et installer `gitleaks`, `semgrep` et `trivy` : sans gitleaks, aucun commit ne passe ; sans Node 26, les tests de PGlite dépassent leurs délais.

`main` porte quinze features DONE : F-001, F-002, F-004, F-030, F-008 (socle serveur, `2cc4a52`), F-003 (éditeur de page, `c166b09`), F-009 (comptes et sessions, `1800231`), F-011 (espaces, membres, invitations, droits en API REST, `8ec93ec`), F-029 (rang borné, `2243ff7`), F-010 (inscription, connexion, déconnexion, `3f52ca4`), F-014 (écrans des espaces, `693feb6`), F-027 (gestion du compte, `2e65313`), F-007 (corbeille, `5bc0d40`), F-012 (synchronisation serveur, Hocuspocus, `797d708`) et F-013 (synchronisation côté client, `0d04c60`). Depuis F-008, chacune est acceptée par dérogation du dev (D-014 à D-024) ; leurs restes sont dans « Dette et limites » de `MEMORY/features/<F-id>.md`. ADR-0001 à 0003, 0008, 0011 amendées, ADR-0012 ajoutée ; `ARCHITECTURE.md` aligné jusqu'à F-007. `README.md` (lancement et reprise du projet) depuis `e769623`. Fumée Docker OK sur `797d708` ; bout en bout complet vert sur la pile Docker du dev (macOS) sur la branche F-013 (`15e8530`) : 56 réussis, 1 ignoré. Aucune branche de travail ouverte. Les branches distantes `F-011` (tête `f134cb2`) et `F-003` (tête `833373b`) portent des copies de commits de F-010 poussées par erreur : sans effet, ne pas les fusionner.

Pour lancer l'application : `pnpm --filter @notionlike/web dev` (client, local d'abord) ; serveur et base : `infra/` (Docker Compose, `apps/server/.env` copié de l'exemple avec un vrai `BETTER_AUTH_SECRET`).

Décisions du dev en vigueur : le 2026-10-16, le dev a levé le mode économe (« arrête ton mode économique pour qu'on accélère nos développements ») et reprend les développements depuis Claude Code dans son terminal. Pratique des dernières features, à garder sauf décision contraire : un passage des gates par feature (relecteurs de la ligne `Revue :`, sécurité, craft), un tour de correctifs, puis dérogation du dev pour ce qui n'est pas rejoué et pour le gate d'architecture ; bout en bout joué par le dev sur la pile Docker avant la fusion d'une feature qui touche le serveur ou la synchronisation. Délégation des commits `Agent: dev` (D-008), sauf la validation d'une spec, les fichiers protégés et les lignes DEROGATION/REPRISE. L'orchestrateur fusionne lui-même dans `main` (merge commit local). Commits du dev depuis un clone neuf, poussés par `git push origin HEAD:<branche>` après `git status -sb` (une branche partie d'`origin/main` le suit : deux pushes nus sont partis sur `main`, `022f044` et `1290f70`, et un `git pull` a laissé deux fusions sans trailers, `90d09c4` et `36cd983`). Fumée et bout en bout : clone habituel du dev, seul à porter `apps/server/.env` (vrai `BETTER_AUTH_SECRET`, `ORIGINES_AUTORISEES` avec `http://127.0.0.1:5173,http://127.0.0.1:5174`).

## Prochaine action prévue

Reprise en local par le dev (2026-10-16). Dans l'ordre :

1. Mettre `ROADMAP.md` à jour (`agent-planif`) : F-010, F-014, F-027, F-007, F-012, F-013 y figurent encore dans « À faire ».
2. Aligner `ARCHITECTURE.md` et l'ADR-0001 sur F-012 et F-013 (`agent-architecte-conception`) : décisions dans `MEMORY/features/F-012.md` et `F-013.md`.
3. Trivial de test (`agent-frontend`) : porter à 30 s le délai du démarrage du serveur d'essai dans `apps/web/test/synchronisation/coutures-synchro.test.ts` (crochet de la ligne 238), qui a dépassé 10 s sous charge au pre-push de la fusion de F-013.
4. Décision du dev : alléger le crochet `Stop` de Claude Code (`.claude/settings.json`, `cc-adapt.sh verifier`), qui relance toute la suite à chaque fin de tour et échoue quand une fusion et son pre-push tournent en même temps (escalade « 3 échecs consécutifs » du 2026-10-16) ; le pre-push teste déjà tout.
5. Features suivantes, dans l'ordre de `ROADMAP.md` : F-028, F-005, F-006, F-015, F-016, F-017, F-018… ; plusieurs en parallèle si leurs dossiers sont disjoints (une branche et un worktree par feature). F-015 doit livrer le contrôle d'identité de présence (D-023).
6. À prévoir : spec de la part retirée de F-014 (ouvrir un espace du serveur, changer d'espace, plusieurs espaces sur un appareil) ; demander au dev s'il veut une spec de panneau d'administration.

## Dettes ouvertes

- D-001 Pas de CI ni de branche protégée — depuis la génération — les hooks se contournent ; une PR fusionnée depuis GitHub ne passe par aucun hook.
- D-002 Tests d'intégration du serveur sur PGlite, pas sur un PostgreSQL réel — proposée par F-008 — pas encore ouverte par le dev.
- D-003 Bout en bout, captures et `preuve:construction` hors des hooks — depuis F-002.
- D-004 Citée par deux lignes `REPRISE D-004` — titre et impact écrits nulle part : à décrire par le dev.
- D-005 Rang de longueur non bornée, `rangEntre` récursive — depuis F-001 — levée par F-029, obligatoire avant F-012.
- D-006 Rappel d'abonné qui lève — levée par F-002 ; à clore par le dev.
- D-007 `pnpm typecheck` hors des contrôles du socle — depuis F-001.
- D-008 Commits `Agent: dev` délégués à l'orchestrateur — depuis le 2026-10-09.
- D-009 Réparation de l'identifiant d'espace par énumération des bases — depuis F-030 — à remplacer avant F-014.
- D-010 Lecture brute sans borne — depuis F-030 — à borner avec F-029 et F-012.
- D-011 Sonde hors délai qui garde sa connexion — depuis F-008 — client dédié à prévoir avec F-009.
- D-012 Trois rejets de reviewer-frontend sur F-030 — reprise par le dev ; résolue au quatrième passage.
- D-013 Relecteurs de F-008 qui soulèvent des points nouveaux à chaque passage — reprise par le dev le 2026-10-12.
- D-014 F-008 acceptée sans dernier passage des gates — depuis le 2026-10-12 — points ouverts dans `MEMORY/features/F-008.md`, dont une erreur 401/403 future avalée en 400 (`enveloppe.ts`), à traiter avec F-009.
- D-015 F-003 acceptée par dérogation après un tour ciblé — depuis le 2026-10-13 — restes dans `MEMORY/features/F-003.md` (cycle `interface/` ↔ `edition/`, mesures au navigateur d'AC37, AC38, AC41, AC44, captures, contraste, deux `h1`).
- D-016 F-009 acceptée par dérogation — depuis le 2026-10-13 — couture des appelants de `creerApplication` et `lireConfiguration` (F-009-AC23) et variables du service `serveur` dans Compose non vérifiées ; limites dans `MEMORY/features/F-009.md`.
- D-017 F-011 sans gate d'architecture (dérogation) — depuis le 2026-10-13 — `ARCHITECTURE.md` à aligner.
- D-018 F-029 acceptée par dérogation — depuis le 2026-10-13 — ADR amendées le 2026-10-14 ; vulnérabilité modérée de `pnpm audit` identifiée : `esbuild` ≤ 0.24.2 par `drizzle-kit`, en développement seulement.
- D-019 F-010 sans gate d'architecture (dérogation) — depuis le 2026-10-13 — `ARCHITECTURE.md` à aligner ; parcours réel contre le serveur non prouvé de bout en bout.
- D-020 F-014 acceptée par dérogation après un tour de correctifs — depuis le 2026-10-13 — AC40 et l'historique d'AC21, AC25 non joués de bout en bout ; débordement à 360 px de la légende du `Tableau`.
- D-021 F-027 acceptée par dérogation après un correctif — depuis le 2026-10-14 — revues non rejouées après le correctif d'AC11.
- D-022 F-007 acceptée par dérogation après un tour de correctifs — depuis le 2026-10-14 — ADR amendées le 2026-10-14 ; reste le débordement à 360 px venu de F-014.
- D-023 F-012 acceptée par dérogation après un tour de correctifs — depuis le 2026-10-14 — revues non rejouées, sécurité UNVERIFIED sans constat élevé ; constats moyens : pas de limite de débit sur le passage en WebSocket, copie du document d'espace à chaque mise à jour, présence usurpable jusqu'à F-015, 500 connexions pour tout le serveur.
- D-024 F-013 acceptée par dérogation après correctifs — depuis le 2026-10-16 — revue client non rejouée, AC41 sans la fermeture 1001 dans le navigateur, AC10 lu par `navigator.onLine`, AC45 sur un membre typé absent du README du fournisseur, contrôle de débordement de F-004 retouché.

## État des contrôles / gates

Les verdicts font foi dans `MEMORY/gates.log`. F-001, F-002, F-004, F-030 : verts. F-008 : dérogation D-014 sur `777ae8247baa`. F-003 : un passage sur `0e26d9307fac` (sécurité, craft PASS), dérogation D-015 sur `670976c29707`. F-009 : un passage sur `0f16e390dec9` (bdd, backend, api, sécurité, craft verts ; architecture FAIL), dérogation D-016 sur `0e4069a80935`. F-011 : bdd, backend, api, sécurité, craft verts sur `4b08a9c1cad0`, architecture par dérogation D-017. F-029 : craft PASS, frontend CHANGES_REQUESTED, sécurité UNVERIFIED, acceptés avec l'architecture par dérogation D-018 sur `8de67271dad6`. F-010 : frontend APPROVED, sécurité et craft PASS sur `9d33a31a271c`, architecture par dérogation D-019. F-014 : sécurité, craft PASS et frontend CHANGES_REQUESTED sur `2b090d71be28`, correctifs puis dérogation D-020 sur `1f7d6e54ceca`. F-027 : backend, frontend APPROVED, sécurité, craft PASS, api CHANGES_REQUESTED sur `ac76be34805f`, correctif puis dérogation D-021 sur `8984bebd617e`. F-007 : sécurité, craft PASS, frontend CHANGES_REQUESTED sur `6bf420991187`, correctifs puis dérogation D-022 sur `80038b4432aa`. Après F-007 : 133 fichiers, 2841 tests. F-013 : sécurité et craft PASS, frontend CHANGES_REQUESTED sur `72d25cbef6ce`, correctifs, bout en bout vert, dérogation D-024 sur `41ce5bc56134` ; 161 fichiers, 3184 tests. `gates-verts.sh` : `RESULTAT GATES: OK` avant chaque fusion.

Fumée Docker (poste du dev ; impossible dans le conteneur cloud, certificat du mandataire) : OK sur `main` `797d708` le 2026-10-15 (constats 1 à 11, `trivy image` sans HIGH ni CRITICAL). F-012 : sécurité FAIL puis UNVERIFIED sans constat élevé, correctifs, dérogation D-023 sur `6cdcfb8e70d9` ; 150 fichiers, 3016 tests. Bout en bout : 51 scénarios, verts avec la configuration temporaire du conteneur (Chromium 1194 ; Playwright du dépôt attend 1243).

## Pièges actifs

- Le hook de fin de tour lance la suite sur l'arbre principal : il échoue si des agents y écrivent en même temps, ou si une fusion et son pre-push tournent en même temps (délais de PGlite, réponses vides de better-auth dans `aides-comptes.ts`) ; trois échecs de suite déclenchent une escalade. Attendre que les agents aient commité et que le push soit fini.
- Plusieurs suites en parallèle sur 4 CPU font dépasser des délais (PGlite, tests web de F-002) : une seule suite à la fois quand c'est possible.
- Fusion dans `main` : `gates-verts.sh main..HEAD` depuis la branche, puis merge commit ; jamais de squash (il efface les trailers). Une PR GitHub se fusionne en « Create a merge commit ».
- Toute correction de code après une revue change l'empreinte : dossier et gates à refaire, et la fumée si `apps/server/src`, `packages/*/src`, les manifestes ou l'infra changent.
- Les agents et l'orchestrateur ne peuvent pas lire les `.env*` (permissions) ; les valeurs factices sont prouvées par `infra/tests/exemples.test.ts`.
- Le hook de périmètre refuse toute écriture de l'orchestrateur hors de la traçabilité, et toute écriture d'un agent dans un fichier protégé.
- Deux agents dans le même arbre commitent par chemins explicites, jamais `git add -A`.
- Ne rapporter au dev aucun chiffre sans source.
- Branches d'archive, à ne pas fusionner : `planification-reunie`, `F-008`, `archive-arbre-2026-10-08`, `archive-F-008-dernier-tour`.

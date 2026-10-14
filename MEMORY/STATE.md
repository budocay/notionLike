# STATE — notionLike — 2026-10-14

## Où on en est

Dépôt distant : `git@github.com:budocay/notionLike.git`, repris depuis Claude Code cloud. Sur un clone neuf : `pnpm install --frozen-lockfile` et `git config core.hooksPath .githooks`. Dans le conteneur cloud, il faut en plus Node 26 en tête du `PATH` (`/opt/nvm/versions/node/v26.10.0/bin`), et installer `gitleaks`, `semgrep` et `trivy` : sans gitleaks, aucun commit ne passe ; sans Node 26, les tests de PGlite dépassent leurs délais.

`main` porte treize features DONE : F-001, F-002, F-004, F-030, F-008 (socle serveur, `2cc4a52`), F-003 (éditeur de page, `c166b09`), F-009 (comptes et sessions, `1800231`), F-011 (espaces, membres, invitations, droits en API REST, `8ec93ec`), F-029 (rang borné, `2243ff7`), F-010 (inscription, connexion, déconnexion, `3f52ca4`), F-014 (écrans des espaces, des membres et des invitations, `693feb6`), F-027 (gestion du compte : nom, mot de passe, sessions, `2e65313`) et F-007 (corbeille, `5bc0d40`). Depuis F-008, chacune est acceptée par dérogation du dev (D-014 à D-022) ; leurs restes sont dans « Dette et limites » de `MEMORY/features/<F-id>.md`. Les 30 specs sont validées. Branche de travail ouverte : `alignement-architecture` (worktree `/home/user/notionLike-F-009`, partie de `5bc0d40`), passage unique d'agent-architecte-conception sur les ADR et `ARCHITECTURE.md`. Les branches distantes `F-011` (tête `f134cb2`) et `F-003` (tête `833373b`) portent des copies de commits de F-010 poussées par erreur : sans effet, ne pas les fusionner.

Pour lancer l'application : `pnpm --filter @notionlike/web dev` (client, local d'abord) ; serveur et base : `infra/` (Docker Compose, `apps/server/.env` copié de l'exemple avec un vrai `BETTER_AUTH_SECRET`).

Décisions du dev en vigueur : mode économe (2026-10-13) : une feature à la fois ; un seul passage des gates par feature, limité aux relecteurs de la ligne `Revue :`, à la sécurité et au craft ; gate d'architecture remplacé par la dérogation du dev ; dérogation plutôt qu'une boucle pour un rejet mineur ; pas de nouvelle revue quand les tests sont verts ; `ARCHITECTURE.md` aligné toutes les deux ou trois features. Ordre UI d'abord (2026-10-13) : F-029, F-010, F-014, F-027, F-007 (livrées), puis F-012, F-013, puis le reste de `ROADMAP.md`. Délégation des commits `Agent: dev` (D-008), sauf la validation d'une spec, les fichiers protégés et les lignes DEROGATION/REPRISE. L'orchestrateur fusionne lui-même dans `main` (merge commit local). Le dev signe ses commits (dérogations, validations) depuis un clone neuf dans `/tmp/notionlike-dev`, ce qui évite les échecs de `git checkout` de son clone habituel.

## Prochaine action prévue

Terminer le passage d'architecture (branche `alignement-architecture`) : amender ADR-0002 et ADR-0003 (D-018), reporter dans ADR-0002 et ADR-0001 la décision de F-007 sur le ramasse-miettes et la suppression des entrées (D-022), aligner `ARCHITECTURE.md` sur F-011, F-029, F-010, F-014, F-027 et F-007 ; fusionner. Puis F-012, en traitant D-014 et D-011 ; rejouer la fumée Docker après F-012. Puis F-013. À prévoir : corriger le débordement à 360 px de la légende du `Tableau` de F-014 (`demonstration.spec.ts`) ; une spec pour la part retirée de F-014 ; demander au dev s'il veut une spec de panneau d'administration.

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
- D-018 F-029 acceptée par dérogation — depuis le 2026-10-13 — ADR-0002, ADR-0003 et `ARCHITECTURE.md` à amender avant F-012 ; vulnérabilité modérée de `pnpm audit` à identifier.
- D-019 F-010 sans gate d'architecture (dérogation) — depuis le 2026-10-13 — `ARCHITECTURE.md` à aligner ; parcours réel contre le serveur non prouvé de bout en bout.
- D-020 F-014 acceptée par dérogation après un tour de correctifs — depuis le 2026-10-13 — AC40 et l'historique d'AC21, AC25 non joués de bout en bout ; débordement à 360 px de la légende du `Tableau`.
- D-021 F-027 acceptée par dérogation après un correctif — depuis le 2026-10-14 — revues non rejouées après le correctif d'AC11.
- D-022 F-007 acceptée par dérogation après un tour de correctifs — depuis le 2026-10-14 — ADR-0001 et ADR-0002 à amender (ramasse-miettes, suppression des entrées).

## État des contrôles / gates

Les verdicts font foi dans `MEMORY/gates.log`. F-001, F-002, F-004, F-030 : verts. F-008 : dérogation D-014 sur `777ae8247baa`. F-003 : un passage sur `0e26d9307fac` (sécurité, craft PASS), dérogation D-015 sur `670976c29707`. F-009 : un passage sur `0f16e390dec9` (bdd, backend, api, sécurité, craft verts ; architecture FAIL), dérogation D-016 sur `0e4069a80935`. F-011 : bdd, backend, api, sécurité, craft verts sur `4b08a9c1cad0`, architecture par dérogation D-017. F-029 : craft PASS, frontend CHANGES_REQUESTED, sécurité UNVERIFIED, acceptés avec l'architecture par dérogation D-018 sur `8de67271dad6`. F-010 : frontend APPROVED, sécurité et craft PASS sur `9d33a31a271c`, architecture par dérogation D-019. F-014 : sécurité, craft PASS et frontend CHANGES_REQUESTED sur `2b090d71be28`, correctifs puis dérogation D-020 sur `1f7d6e54ceca`. F-027 : backend, frontend APPROVED, sécurité, craft PASS, api CHANGES_REQUESTED sur `ac76be34805f`, correctif puis dérogation D-021 sur `8984bebd617e`. F-007 : sécurité, craft PASS, frontend CHANGES_REQUESTED sur `6bf420991187`, correctifs puis dérogation D-022 sur `80038b4432aa`. Après F-007 : 133 fichiers, 2841 tests. `gates-verts.sh` : `RESULTAT GATES: OK` avant chaque fusion.

Fumée Docker (poste du dev ; impossible dans le conteneur cloud, certificat du mandataire) : OK sur la tête de F-009 portant `fb1ea83`, image sans esbuild ni drizzle-kit. Bout en bout : 51 scénarios, verts avec la configuration temporaire du conteneur (Chromium 1194 ; Playwright du dépôt attend 1243).

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

# STATE — notionLike — 2026-10-13

## Où on en est

Dépôt distant : `git@github.com:budocay/notionLike.git`, repris depuis Claude Code cloud. Sur un clone neuf : `pnpm install --frozen-lockfile` et `git config core.hooksPath .githooks`. Dans le conteneur cloud, il faut en plus Node 26 en tête du `PATH` (`/opt/nvm/versions/node/v26.10.0/bin`), et installer `gitleaks`, `semgrep` et `trivy` : sans gitleaks, aucun commit ne passe ; sans Node 26, les tests de PGlite dépassent leurs délais.

`main` porte sept features DONE : F-001, F-002, F-004, F-030, F-008 (socle serveur, PR budocay/notionLike#1, `2cc4a52`), F-003 (éditeur de page, fusion `c166b09`) et F-009 (comptes et sessions, better-auth, fusion `1800231`), toutes deux le 2026-10-13. Les trois dernières sont acceptées par le dev par dérogation (D-014, D-015, D-016) ; leurs restes sont dans « Dette et limites » de `MEMORY/features/F-008.md`, `F-003.md` et `F-009.md`. Le correctif inachevé du dernier tour de F-008 est archivé sur `archive-F-008-dernier-tour`. Après la fusion de F-009 : 95 fichiers, 2048 tests, 32 règles de dépendances (relevé d'agent-architecte-conception sur `428d688`). Aucune branche de travail ouverte.

Pour lancer l'application : `pnpm --filter @notionlike/web dev` (client, local d'abord) ; serveur et base : `infra/` (Docker Compose, `apps/server/.env` copié de l'exemple avec un vrai `BETTER_AUTH_SECRET`).

Décisions du dev en vigueur : mode rapide, développements lancés sans attendre les gates, délégation des commits `Agent: dev` (D-008), sauf la validation d'une spec et les fichiers protégés. Le dev trouve le parcours trop long : il a coupé le dernier passage des gates de F-008 et veut avancer.

## Prochaine action prévue

Reprendre la suite selon `ROADMAP.md` (F-011, F-012 côté serveur, F-029 avant F-012 ; suite du client), une feature à la fois ou en parallèle client/serveur, avec un seul passage de gates par feature et la dérogation du dev pour les rejets mineurs. Avant F-012 ou toute route métier : traiter D-014 (erreur 401/403 avalée en 400) et D-011.

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

## État des contrôles / gates

Les verdicts font foi dans `MEMORY/gates.log`. F-001, F-002, F-004, F-030 : verts. F-008 : dérogation D-014 sur `777ae8247baa`. F-003 : un passage sur `0e26d9307fac` (sécurité, craft PASS), dérogation D-015 sur `670976c29707`. F-009 : un passage sur `0f16e390dec9` (bdd, backend, api, sécurité, craft verts ; architecture FAIL), dérogation D-016 sur `0e4069a80935`. `gates-verts.sh` : `RESULTAT GATES: OK` avant chaque fusion.

Fumée Docker (poste du dev ; impossible dans le conteneur cloud, certificat du mandataire) : OK sur la tête de F-009 portant `fb1ea83`, image sans esbuild ni drizzle-kit. Bout en bout : 51 scénarios, verts avec la configuration temporaire du conteneur (Chromium 1194 ; Playwright du dépôt attend 1243).

## Pièges actifs

- Le hook de fin de tour lance la suite sur l'arbre principal : il échoue si des agents y écrivent en même temps, et trois échecs de suite déclenchent une escalade. Attendre que les agents aient commité.
- Plusieurs suites en parallèle sur 4 CPU font dépasser des délais (PGlite, tests web de F-002) : une seule suite à la fois quand c'est possible.
- Fusion dans `main` : `gates-verts.sh main..HEAD` depuis la branche, puis merge commit ; jamais de squash (il efface les trailers). Une PR GitHub se fusionne en « Create a merge commit ».
- Toute correction de code après une revue change l'empreinte : dossier et gates à refaire, et la fumée si `apps/server/src`, `packages/*/src`, les manifestes ou l'infra changent.
- Les agents et l'orchestrateur ne peuvent pas lire les `.env*` (permissions) ; les valeurs factices sont prouvées par `infra/tests/exemples.test.ts`.
- Le hook de périmètre refuse toute écriture de l'orchestrateur hors de la traçabilité, et toute écriture d'un agent dans un fichier protégé.
- Deux agents dans le même arbre commitent par chemins explicites, jamais `git add -A`.
- Ne rapporter au dev aucun chiffre sans source.
- Branches d'archive, à ne pas fusionner : `planification-reunie`, `F-008`, `archive-arbre-2026-10-08`, `archive-F-008-dernier-tour`.

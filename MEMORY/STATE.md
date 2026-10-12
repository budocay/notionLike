# STATE — notionLike — 2026-10-12

## Où on en est

Dépôt distant : `git@github.com:budocay/notionLike.git`, repris depuis Claude Code cloud. Sur un clone neuf : `pnpm install --frozen-lockfile` et `git config core.hooksPath .githooks`. Dans le conteneur cloud, il faut en plus Node 26 en tête du `PATH` (`/opt/nvm/versions/node/v26.10.0/bin`), et installer `gitleaks`, `semgrep` et `trivy` : sans gitleaks, aucun commit ne passe ; sans Node 26, les tests de PGlite dépassent leurs délais.

`main` porte cinq features DONE : F-001, F-002, F-004, F-030, et F-008 (socle serveur), fusionnée le 2026-10-12 par la PR budocay/notionLike#1 (merge commit `2cc4a52`, dernier commit de la branche `a52b33f`). F-008 est acceptée par le dev sans dernier passage des gates (sept lignes `DEROGATION D-014` sur l'empreinte `777ae8247baa`). Ses points ouverts sont des dettes proposées (« Dette et limites » de `MEMORY/features/F-008.md`). Le correctif inachevé du dernier tour est archivé sur la branche `archive-F-008-dernier-tour`.

Deux branches de travail, poussées, non fusionnées, code fini, revue pas encore lancée :

- `F-003` (éditeur de page, Tiptap, structurel, `Revue : reviewer-frontend`), tête `d5c8487`. `main` intégré (`02a99b0`), AC39 faite (`074ce40`), bout en bout de F-002, F-004 et F-030 réparé (`91016b7`, `f6089bd`), Tiptap admis par le dev (`c2ac84d`, quatre règles, 29 en tout), `ARCHITECTURE.md` aligné et ADR-0009 créé au statut « proposé », à accepter par le dev (`d5c8487`). Relevé d'agent-architecte-conception sur `c2ac84d` : 77 fichiers, 1712 tests, contrats 273 modules et 831 dépendances sans violation, typecheck, lint, `preuve:construction` OK, bout en bout `50 passed`, mais seulement avec la configuration temporaire `scratchpad/pw/playwright.conteneur.config.ts` (le conteneur a Chromium 1194, Playwright attend 1243). Limites écrites : pas de preuve au navigateur pour AC28, AC37, AC38, AC41, la partie navigateur d'AC44, ni les captures (b) et (f) ; F-003-AC35 n'est couvert par aucun test de couture ; deux `h1` quand le contenu porte un « Titre 1 » (à trancher par le dev) ; `y-protocols` absent de la règle `edition-confinee`.
- `F-009` (comptes et sessions, better-auth, structurel, `Revue : reviewer-bdd, reviewer-backend, reviewer-api`), tête `4181e75`. `main` intégré : la fusion `b0fc4e4` est re-signée `Agent: dev` par délégation (D-008), parce qu'elle résout des conflits chez deux agents. Les 33 critères sont couverts, AC23 comprise (`9dfe0b0`, `161f580`), et des délais explicites sont posés sur les ouvertures de PGlite. Relevé d'agent-bdd : 80 fichiers, 1837 tests, code 0. Reste à faire : `ARCHITECTURE.md` et la fiche, puis la revue. F-009 change `apps/server/src` : la fumée Docker est à rejouer sur le poste du dev.

Décisions du dev en vigueur : mode rapide, développements lancés sans attendre les gates, délégation des commits `Agent: dev` (D-008), sauf la validation d'une spec et les fichiers protégés. Le dev trouve le parcours trop long : il a coupé le dernier passage des gates de F-008 et veut avancer.

## Prochaine action prévue

1. `F-003` : `MEMORY/features/F-003.md`, puis `dossier-revue.sh F-003` et un seul passage de gates (reviewer-frontend, architecture, sécurité, craft). Un rejet sur un point mineur se propose au dev en `DEROGATION`, sans boucle. Puis `PROJECT_LOG.md`, `INDEX`, `gates-verts.sh`, fusion.
2. `F-009` : alignement d'`ARCHITECTURE.md` par agent-architecte-conception, fiche, fumée par le dev, puis même parcours qu'au point 1.
3. Le client reprend ensuite selon `ROADMAP.md`.

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

## État des contrôles / gates

Les verdicts font foi dans `MEMORY/gates.log`. F-001, F-002, F-004, F-030 : verts. F-008 : dernier passage complet sur `8487522a97ae` (sécurité et craft PASS, autres non verts) ; dérogation du dev sur `777ae8247baa` ; `gates-verts.sh` : `RESULTAT GATES: OK` avant la fusion. F-009 et F-003 : aucun gate lancé.

Preuves de F-008 hors du socle : fumée Docker relevée par le dev sur `fbbd6b6` (`FUMEE: OK`, `EXIT 0`), test de blocage sur `b672e76` (tous les blocages effectifs). Dans le conteneur cloud, Docker démarre (`dockerd`), mais la construction d'image échoue (certificat du mandataire) : la fumée se lance sur le poste du dev.

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

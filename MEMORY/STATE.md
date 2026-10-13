# STATE — notionLike — 2026-10-12

## Où on en est

Dépôt distant : `git@github.com:budocay/notionLike.git`, repris depuis Claude Code cloud. Sur un clone neuf : `pnpm install --frozen-lockfile` et `git config core.hooksPath .githooks`. Dans le conteneur cloud, il faut en plus Node 26 en tête du `PATH` (`/opt/nvm/versions/node/v26.10.0/bin`), et installer `gitleaks`, `semgrep` et `trivy` : sans gitleaks, aucun commit ne passe ; sans Node 26, les tests de PGlite dépassent leurs délais.

`main` porte cinq features DONE : F-001, F-002, F-004, F-030, et F-008 (socle serveur), fusionnée le 2026-10-12 par la PR budocay/notionLike#1 (merge commit `2cc4a52`, dernier commit de la branche `a52b33f`). F-008 est acceptée par le dev sans dernier passage des gates (sept lignes `DEROGATION D-014` sur l'empreinte `777ae8247baa`). Ses points ouverts sont des dettes proposées (« Dette et limites » de `MEMORY/features/F-008.md`). Le correctif inachevé du dernier tour est archivé sur la branche `archive-F-008-dernier-tour`.

Deux branches de travail, poussées, non fusionnées :

- `F-003` (éditeur de page, Tiptap, structurel, `Revue : reviewer-frontend`), tête `4ee3568`. Fiche `MEMORY/features/F-003.md` (`1745172`). Premier passage des gates sur l'empreinte `0e26d9307fac` (journal `8c27adb`) : sécurité et craft PASS ; reviewer-frontend CHANGES_REQUESTED et architecture FAIL. Choix du dev le 2026-10-13 : tour ciblé puis dérogation, sans nouvelle boucle. Fait dans ce tour : test de couture d'AC35 (`918ff74`, `apps/web/test/coutures-page.test.ts`) et scénario de bout en bout d'AC28 par frappes réelles (`4ee3568`, `apps/web/e2e/edition.spec.ts`). Relevé de l'agent : 78 fichiers, 1760 tests ; bout en bout 51 tests avec la configuration temporaire du conteneur (Chromium 1194). Restes, à verser en dettes sous dérogation : cycle `interface/` ↔ `edition/` ; mesures au navigateur d'AC37, AC38, AC41 et AC44, captures (b) et (f) ; contraste des jetons atténués ; `lireVersionPage` exportée sans appelant de production ; deux `h1` (à trancher) ; pas de rechargement hors ligne, faute de service worker.
- `F-009` (comptes et sessions, better-auth, structurel, `Revue : reviewer-bdd, reviewer-backend, reviewer-api`), tête `53d591e`. Les 33 critères sont couverts ; relevé d'agent-architecte-conception sur `4181e75` : 80 fichiers, 1837 tests, contrats 266 modules et 804 dépendances, 28 règles. `ARCHITECTURE.md` est aligné et l'ADR-0011 créé au statut « proposé » (`53d591e`). Reste : fiche, fumée Docker sur le poste du dev, puis dossier et un passage de gates. Pour la fumée, `apps/server/.env` doit porter `BETTER_AUTH_SECRET` (valeur non factice, la pile tournant en production) et `URL_PUBLIQUE`.

Décisions du dev en vigueur : mode rapide, développements lancés sans attendre les gates, délégation des commits `Agent: dev` (D-008), sauf la validation d'une spec et les fichiers protégés. Le dev trouve le parcours trop long : il a coupé le dernier passage des gates de F-008 et veut avancer.

## Prochaine action prévue

1. `F-003` : le dev accepte l'ADR-0009 (passage en « accepté » par agent-architecte-conception, avec la mention de l'acceptation tardive). Compléter la fiche avec les tests d'autres features modifiés listés par `agent-architecte.md` (`coquille-echecs`, `rangee-de-page`, `tiroir`, `reprise-ecran`, `reprise-coutures`, `structure`, `styles`, `demonstration`, `coutures`, trois aides) et les dettes ci-dessus. Puis `dossier-revue.sh F-003` pour l'empreinte finale, quatre lignes `DEROGATION` posées par le dev (reviewer-frontend, agent-architecte, agent-securite, agent-craft), `PROJECT_LOG.md`, `INDEX`, `gates-verts.sh`, fusion par merge commit.
2. `F-009` : le dev accepte l'ADR-0011, écrire la fiche, fumée Docker par le dev, dossier, un passage de gates ; un rejet mineur se traite par dérogation.
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

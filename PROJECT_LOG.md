# PROJECT_LOG — notionLike

## [2026-10-08] F-001 Arborescence des pages d'un espace (modèle Yjs)

- TYPE: FEATURE
- Tier: structurel
- Scope: `packages/document` — agents: agent-planif, agent-veille, agent-architecte-conception, agent-frontend, dev (validation de la spec, bloc 0, reprise du gate) — commits: 275d4ef..a9aa1b8
- Détail: paquet `@notionlike/document`, document d'espace Yjs qui porte l'arborescence des pages (identifiant, titre, parent, rang, corbeille) sans leur contenu. Créer, renommer, déplacer, mettre à la corbeille, s'abonner ; convergence entre répliques (créations simultanées, déplacements croisés sans cycle ni page perdue) ; lecture tolérante et refus d'une version de format inconnue. Le code des blocs 1 à 4 est livré en un seul commit (`76146f5`) : l'historique par bloc a été perdu lors d'une coupure de courant.
- Dette: introduite D-005, D-006, D-007 ; D-004 citée par le dev dans `MEMORY/gates.log`, à décrire par lui
- ADR: ADR-0001, ADR-0002, ADR-0003
- Tests: ajoutés, 224 tests sur 6 fichiers (exemples et propriétés fast-check) — état: verts — preuve: checks.txt (empreinte `ca4cb0d41fe3`)
- Gates: SECURITY PASS · ARCHITECTURE PASS · CRAFT PASS · revue reviewer-frontend APPROVED
- Mesures: boucles — architecture conception 4 (3 FAIL, reprise du dev, 1 PASS), architecture code 2, reviewer-frontend 2, sécurité 2 (dont 1 UNVERIFIED : verdict écrit dans un bloc de code), craft 2 · constats confirmés — architecture conception 19 (8 + 6 + 5), reviewer-frontend 2 · faux positifs 0 · coût non mesuré

## [2026-10-08] D-005 Rang de longueur non bornée et `rangEntre` récursive

- TYPE: DEBT
- Tier: standard
- Scope: `packages/document/src/rang.ts` — agents: agent-securite (constat M2, CWE-674) — commits: aucun
- Détail: une mise à jour forgée peut porter un rang très long ; `estUnRang` ne borne pas sa longueur et `rangEntre` est récursive. À lever avant F-012 (première réception de mises à jour venues du réseau) : borner la longueur, rendre `rangEntre` itérative. Touche ADR-0002.
- Dette: introduite D-005
- ADR: ADR-0002
- Tests: aucun — état: UNVERIFIED — preuve: aucune
- Gates: sans objet
- Mesures: sans objet

## [2026-10-08] D-006 Rappel d'abonné qui lève, façade sans fermeture

- TYPE: DEBT
- Tier: standard
- Scope: `packages/document/src/document-espace.ts` — agents: reviewer-frontend, agent-securite (constats F1, F2) — commits: aucun
- Détail: un rappel d'abonné qui lève interrompt la diffusion (les abonnés suivants ne sont pas notifiés) et l'erreur remonte par `Y.applyUpdate` ; la façade n'a pas de fermeture qui retire son écouteur du `Y.Doc`. Limite écrite dans `ARCHITECTURE.md`. À lever avec F-002 (premier appelant réel).
- Dette: introduite D-006
- ADR: ADR-0003
- Tests: aucun — état: UNVERIFIED — preuve: aucune
- Gates: sans objet
- Mesures: sans objet

## [2026-10-08] D-007 Vérification des types hors des contrôles du socle

- TYPE: DEBT
- Tier: trivial
- Scope: `.agents/outils.env`, `controles.sh` (réservés au dev) — agents: reviewer-frontend, agent-architecte, agent-securite — commits: aucun
- Détail: aucun contrôle ne lance `pnpm typecheck`. La barrière « ni DOM ni types Node » du `tsconfig.json` de `packages/document` (F-001-AC19) n'est prouvée dans aucun `checks.txt` ; seule la règle ESLint des globales interdites l'est. À lever par le dev en branchant `pnpm typecheck` dans les contrôles.
- Dette: introduite D-007
- ADR: aucun
- Tests: aucun — état: UNVERIFIED — preuve: `pnpm typecheck` lancé à la main le 2026-10-08, vert
- Gates: sans objet
- Mesures: sans objet

## [2026-10-09] D-008 Commits `Agent: dev` délégués à l'orchestrateur

- TYPE: DEBT
- Tier: structurel
- Scope: socle de contrôle (validation des specs, fichiers protégés, blocs 0) — agents: orchestrateur, sur décision du dev — commits: 86542e8 (dev lui-même), f1946e2, b88f66e (orchestrateur)
- Détail: le 2026-10-09, le dev a délégué à l'orchestrateur tous les commits `Agent: dev` (validations de spec, blocs 0, mise à l'abri), pour toutes les features, et a ajouté les règles d'autorisation `Bash(git commit:*)` et `Bash(sed -i:*)` dans `.claude/settings.local.json`. Chaque commit délégué le dit dans son message. Conséquence : le trailer `Agent: dev` ne prouve plus qu'un humain a lu ; `spec_validee`, la protection des fichiers de configuration des contrôles et les lignes `REPRISE` ou `DEROGATION` reposent sur la retenue de l'orchestrateur. À lever par le dev : retirer les deux règles, ou relire a posteriori les commits délégués (`git log --grep='délégation explicite du dev'`). L'orchestrateur ne s'en sert ni pour une `DEROGATION`, ni pour une `REPRISE`, ni pour modifier un script de contrôle, un test ou `.agents/outils.env`.
- Dette: introduite D-008
- ADR: aucun
- Tests: aucun — état: UNVERIFIED — preuve: aucune
- Gates: sans objet
- Mesures: sans objet

## [2026-10-09] F-002 Application web locale : coquille, barre latérale des pages, persistance IndexedDB

- TYPE: FEATURE
- Tier: structurel
- Scope: `apps/web`, `packages/document` — agents: agent-planif, agent-veille, agent-architecte-conception, agent-frontend, orchestrateur par délégation du dev (validations de la spec, mise à l'abri, bloc 0 : D-008) — commits: d7e5080..6250a0a
- Détail: première application du dépôt. Identifiants en UUID canonique, persistance du document d'espace dans IndexedDB (`y-indexeddb@9.0.12`), session d'espace, routes par fragment, barre latérale (créer, renommer, sous-page, corbeille, replier), zone principale, écrans d'état. Dans `packages/document` : fermeture de la façade, diffusion sous garde, code `facade-fermee`. Code repris en partie d'un arbre écrit en avance le 2026-10-08, archivé sur la branche `archive-arbre-2026-10-08`, puis retouché contre la spec amendée.
- Dette: résorbée D-006 (à clore par le dev) ; introduite D-008 ; laissées D-003, D-007
- ADR: ADR-0003 (amendé), ADR-0007, ADR-0008
- Tests: ajoutés, 777 tests sur 21 fichiers (256 `document`, 521 `web`), 7 scénarios de bout en bout — état: verts — preuve: checks.txt (empreinte `d06344502281`) pour Vitest, lint, contrats, couverture des critères ; relevé à la main dans `MEMORY/features/F-002.md` pour `typecheck`, `build` et le bout en bout (hors des contrôles du socle)
- Gates: SECURITY PASS · ARCHITECTURE PASS · CRAFT PASS · revue reviewer-frontend APPROVED
- Mesures: boucles — architecture conception 2 (1 FAIL, 1 PASS), reviewer-frontend 3 (2 CHANGES_REQUESTED, 1 APPROVED), architecture code 3 (1 UNVERIFIED faute de preuves au dossier, 2 PASS), sécurité 3, craft 3 · constats confirmés — architecture conception 7, reviewer-frontend 3 (preuves de `typecheck` et `build` absentes, test d'AC26 incomplet, titre sans caractère visible), architecture code 1 (format du document écrit en dur dans cinq fichiers de test) · faux positifs 0 · une escalade du hook de vérification (trois lancements sur un arbre en cours d'écriture par un agent en arrière-plan), reprise par le dev · coût non mesuré

## [2026-10-09] F-004 Identité visuelle sombre : jetons de design, coquille, largeurs d'écran

- TYPE: FEATURE
- Tier: structurel
- Scope: `apps/web` — agents: agent-planif, agent-veille, agent-architecte-conception, agent-frontend, orchestrateur par délégation du dev (validations de la spec, bloc 0, règle ESLint, contrats, script de preuve : D-008) — commits: 7f5b0f5..e388afc
- Détail: fichier des jetons et feuille d'entrée Tailwind 4.3.3 (thème par défaut vidé, thème sombre unique, mouvement en CSS seul), composants de présentation, application habillée (barre latérale à actions révélées, menu « ⋯ », renommage par double-clic ou F2, barre du haut avec fil d'Ariane et état d'échec d'enregistrement, arbre décrit pour les lecteurs d'écran), tiroir sous le seuil étroit, page de démonstration avec sa propre feuille hors de la construction de production, captures de référence. Menée en mode rapide, décidé par le dev pour cette feature : pas de plan détaillé ni de gate de conception avant le code. Le dev a vu la page de démonstration à la fin du bloc 1 : « J'aime tout ».
- Dette: aucune introduite ; laissées D-003 (étendue aux 46 scénarios, aux captures et à `preuve:construction`), D-007, D-008
- ADR: ADR-0010
- Tests: ajoutés, 1078 tests sur 32 fichiers au total (822 `web`, 256 `document`), 46 scénarios de bout en bout — état: verts — preuve: checks.txt (empreinte `2fc8bae8471c`) pour Vitest, lint, contrats, couverture des critères ; relevé à la main dans `MEMORY/features/F-004.md` pour `typecheck`, la construction et sa preuve, le bout en bout (hors des contrôles du socle)
- Gates: SECURITY PASS · ARCHITECTURE PASS · CRAFT PASS · revue reviewer-frontend APPROVED
- Mesures: boucles — reviewer-frontend 3 (2 CHANGES_REQUESTED, 1 APPROVED), architecture 3 (2 FAIL, 1 PASS, plus un lancement interrompu par la limite d'usage, relancé), sécurité 3 (même interruption), craft 3 · constats confirmés — reviewer-frontend 8 (preuves trop faibles ou qui ne pouvaient pas échouer, pied de barre absent de la démonstration, Échap sans effet quand le focus est sur `body`, contrôle sans cas fautif), architecture 9 (feuille de production dépendante de la démonstration, clé morte, sélecteur couplé au balisage, documents en retard d'un commit sur le code, homonymes) · faux positifs 0 · avant la revue, l'alignement d'`ARCHITECTURE.md` avait relevé 7 défauts de structure, corrigés · coût non mesuré

## [2026-10-12] F-030 Reprise de la persistance locale après une coupure

- TYPE: FEATURE
- Tier: structurel
- Scope: `apps/web` (`persistance/`, `espace/`, `interface/`) — agents: agent-frontend, agent-planif, agent-architecte-conception, orchestrateur — commits: 32a7e07..57e68db (code), documents jusqu'à 628f8bd
- Détail: une coupure de la persistance locale n'est plus définitive : tentatives de reprise à cadence croissante, à la demande, au retour de visibilité et à `hidden` / `pagehide` ; lecture brute jugée avant toute construction, instance neuve par tentative, fusion, preuve d'écriture avant de dire « active » ; « Enregistré sur cet appareil » seulement après cette preuve ; réparation de la base de l'appareil et d'une base de document sans son magasin ; confirmation avant de quitter par persistance. Mode rapide ; relecture de structure avant la revue.
- Dette: introduite D-009 (réparation de l'identifiant d'espace par énumération des bases de l'appareil : à remplacer par le registre de F-013 avant F-014), D-010 (lecture brute sans borne : à borner avec F-029 et F-012), D-012 (reviewer-frontend a rejeté F-030 trois fois de suite ; reprise par le dev le 2026-10-12, ligne `REPRISE D-012` de `MEMORY/gates.log`) ; laissées D-003, D-007, D-008 / résorbée aucune
- ADR: ADR-0007 et ADR-0008, amendés en place
- Tests: 115 ajoutés (1078 à 1193, 41 fichiers), neuf fichiers `reprise-*`, tests de F-002 et F-004 modifiés listés dans `MEMORY/features/F-030.md` — état: verts — preuve: checks.txt ; bout en bout (48 scénarios), types et construction relevés à la main (D-003, D-007)
- Gates: SECURITY PASS · ARCHITECTURE PASS · CRAFT PASS · revue reviewer-frontend APPROVED, sur l'empreinte `6331333e573b`
- Mesures: boucles reviewer-frontend 4, agent-architecte 4, agent-securite 4 (dont un verdict illisible), craft 4 · constats confirmés reviewer-frontend 7 (un défaut de code sur F-030-AC24, six de tests), agent-architecte 5 · faux positifs 0 · coût non relevé ; environ sept heures perdues en mises en veille du poste

## [2026-10-12] F-008 Socle serveur : serveur Express, accès à la base, contrats partagés, pile Docker

- TYPE: FEATURE
- Tier: structurel
- Scope: `apps/server`, `packages/db`, `packages/contrats`, `infra/` — agents: agent-backend, agent-bdd, agent-devops, agent-frontend (couture F-002-AC31), agent-architecte-conception, agent-planif, orchestrateur par délégation du dev (D-008) — commits: 651991f..e7a965a (code), documents jusqu'à 6bce7e2
- Détail: serveur Express qui sert `/sante` et `/pret`, refuse le reste par une enveloppe d'erreur à cinq codes, valide sa configuration, ferme la base et sort par une phrase fixe sur toute erreur d'initialisation, écoute `SIGTERM` dès le démarrage ; `packages/contrats` (schémas `zod`) ; `packages/db` (accès Drizzle, sonde bornée, erreurs typées, migrations en transaction unique, base embarquée PGlite pour les tests) ; pile Docker Compose (PostgreSQL 18.6, migration, serveur), script de fumée, règle de rétention du volume et procédure `infra/RETOUR-ARRIERE.md`. Fumée relevée par le dev sur `fbbd6b6` : `FUMEE: OK (constats 1 à 11)`, `EXIT 0`.
- Dette: introduites D-011 (sonde hors délai qui garde sa connexion), D-013 (relecteurs de F-008 qui soulèvent des points nouveaux à chaque passage ; reprise par le dev, ligne `REPRISE D-013`), D-014 (F-008 acceptée par le dev sans dernier passage des gates : sept lignes `DEROGATION D-014` sur l'empreinte `777ae8247baa`) ; proposées, non ouvertes : « Dette et limites » de `MEMORY/features/F-008.md` ; laissées D-002, D-007, D-008
- ADR: ADR-0004, ADR-0005, ADR-0006
- Tests: 1549 tests sur 63 fichiers au total (document 256, web 941, contrats 43, db 69, server 112, infra 128, relevé d'agent-architecte-conception sur `e7a965a`) — état: verts — preuve: checks.txt du dernier dossier complet (`8487522a97ae`, 62 fichiers, 1547 tests) ; fumée Docker et test de blocage relevés à la main dans `MEMORY/features/F-008.md`
- Gates: dernier passage complet (`8487522a97ae`) : SECURITY PASS · CRAFT PASS · ARCHITECTURE FAIL (documentation de la fumée, corrigée depuis) · revues reviewer-api, reviewer-bdd, reviewer-backend CHANGES_REQUESTED, reviewer-devops escalade ; empreinte finale `777ae8247baa` acceptée par DEROGATION D-014 du dev pour les sept gates, sans nouveau passage
- Mesures: boucles — 3 passages complets (reviewer-devops 3 rejets puis escalade ; reviewer-bdd et reviewer-backend 2 ; agent-architecte PASS puis 2 FAIL ; agent-securite UNVERIFIED, UNVERIFIED, PASS ; craft PASS) · constats confirmés : délais d'ouverture de PGlite (cause corrigée), service sans fermeture de la base sur une erreur d'initialisation, SIGTERM non écouté au démarrage, cas d'AC6 non testés, rétention du volume sans garde-fou · faux positifs non comptés · dernier tour d'agent-backend et d'agent-bdd arrêté par le dev, archivé sur la branche `archive-F-008-dernier-tour` · coût non mesuré

## [2026-10-13] F-003 Éditeur de page : paragraphes, titres, listes, enregistrés sur l'appareil

- TYPE: FEATURE
- Tier: structurel
- Scope: `apps/web` (`edition/`, `page/`, `interface/`), `packages/document` — agents: agent-frontend, agent-architecte-conception, orchestrateur, dev (règles de dépendances `c2ac84d`) — commits: 8cb5873..4ee3568 (code), documents jusqu'à 9c5aa7b
- Détail: éditeur Tiptap 3.31.4 sous le titre de la page (paragraphes, titres 1 à 3, listes à puces et numérotées), contenu dans un document Yjs par page enregistré dans IndexedDB, session de page, pages ouvertes, barre de blocs, grand titre « Sans titre » atténué. Tiptap confiné au module `edition/` par quatre règles de dépendances.
- Dette: introduite D-015 (F-003 acceptée par le dev après un tour ciblé, sans deuxième passage des gates : quatre lignes `DEROGATION D-015` sur l'empreinte `670976c29707`) ; restes listés dans « Dette et limites » de `MEMORY/features/F-003.md` (cycle `interface/` ↔ `edition/`, mesures au navigateur d'AC37, AC38, AC41, AC44, captures, contraste, deux `h1`) ; laissées D-003, D-007, D-008
- ADR: ADR-0009 (accepté par le dev le 2026-10-13, après le code)
- Tests: 1760 tests sur 78 fichiers (relevé d'agent-frontend sur `4ee3568`) ; bout en bout 51 scénarios, avec la configuration temporaire du conteneur (Chromium 1194) — état: verts — preuve: checks.txt du premier dossier (`0e26d9307fac`, 77 fichiers, 1712 tests) ; AC35 et AC28 ajoutés ensuite, relevés par l'agent
- Gates: premier passage (`0e26d9307fac`) : SECURITY PASS · CRAFT PASS · ARCHITECTURE FAIL · revue reviewer-frontend CHANGES_REQUESTED ; empreinte finale `670976c29707` acceptée par DEROGATION D-015 du dev pour les quatre gates
- Mesures: boucles 1 passage · constats confirmés : couture d'AC35 absente, scénario d'AC28 absent (livrés dans le tour ciblé), cycle de modules, ADR tardif, tests d'autres features modifiés non déclarés · faux positifs non comptés · coût non mesuré

## [2026-10-13] F-009 Comptes et sessions côté serveur (better-auth)

- TYPE: FEATURE
- Tier: structurel
- Scope: `apps/server`, `packages/db`, `packages/contrats`, `infra/tests` — agents: agent-backend, agent-bdd, agent-devops, agent-architecte-conception, orchestrateur, dev (règles de dépendances `8ad53a3`, scripts d'esbuild `eace358`, override pnpm `fb1ea83`) — commits: a07bcf0..fb1ea83 (code), intégration de `main` (F-003) `428d688`
- Détail: inscription, connexion, session en base avec cookie opaque signé, déconnexion vérifiée, `/api/v1/moi`, limitation de débit, journal sans secret, contrôle d'`Origin` à la place de CORS ; better-auth 1.7.7 réduit à une liste fermée de routes ; schéma des comptes et migration `0000_comptes` ; `drizzle-kit`, `tsx` et `esbuild` sortis de l'image de production par l'override `better-auth>drizzle-kit: "-"`. Fumée Docker du dev sur la tête portant `fb1ea83` : `FUMEE: OK (constats 1 à 11)`, `EXIT 0`, `trivy image` sans constat HIGH ni CRITICAL.
- Dette: introduite D-016 (F-009 acceptée par le dev par dérogation après l'intégration de F-003 ; points du gate d'architecture non traités : couture des appelants de `creerApplication` et `lireConfiguration`, variables du service `serveur` dans Compose non vérifiées) ; limites dans « Dette et limites » de `MEMORY/features/F-009.md` ; laissées D-002, D-007, D-008, D-011, D-014
- ADR: ADR-0011 (accepté par le dev le 2026-10-13, après le code)
- Tests: 2048 tests sur 95 fichiers après l'intégration de F-003 (relevé d'agent-architecte-conception sur `428d688`) — état: verts — preuve: checks.txt du dossier `0f16e390dec9` (80 fichiers, 1837 tests) ; fumée Docker relevée par le dev
- Gates: passage unique sur `0f16e390dec9` : SECURITY PASS · CRAFT PASS · revues reviewer-bdd, reviewer-backend, reviewer-api APPROVED · ARCHITECTURE FAIL (couture d'AC23, Compose, contradictions d'`ARCHITECTURE.md` corrigées depuis) ; empreinte finale après l'intégration de F-003 acceptée par DEROGATION D-016 du dev
- Mesures: boucles 1 passage · constats confirmés : 7 défauts de `f8891ab` corrigés dans `83b5802` ; image de production porteuse d'esbuild (55 constats trivy), corrigée par `fb1ea83` · faux positifs non comptés · coût non mesuré

## [2026-10-13] F-011 Espaces, membres, invitations et droits (API REST)

- TYPE: FEATURE
- Tier: structurel
- Scope: `packages/db`, `packages/contrats`, `apps/server` — agents: agent-bdd, agent-backend, agent-planif (relecture de la spec), orchestrateur — commits: f348fd5..485c83c
- Détail: tables espaces, adhésions, invitations et leur migration ; douze routes REST, matrice des droits, sept codes d'erreur ; refus répondus par l'enveloppe, jamais levés. Mode économe (décision du dev du 2026-10-13).
- Dette: introduite D-017 (gate d'architecture de F-011 non lancé, accepté par dérogation du dev : `ARCHITECTURE.md` à aligner plus tard) ; limites dans `MEMORY/features/F-011.md` ; laissées D-002, D-011, D-014
- ADR: aucun
- Tests: 2278 tests sur 103 fichiers — état: verts — preuve: checks.txt (empreinte `4b08a9c1cad0`)
- Gates: SECURITY PASS · CRAFT PASS · revues reviewer-bdd, reviewer-backend, reviewer-api APPROVED · ARCHITECTURE non lancé, DEROGATION D-017
- Mesures: boucles 1 passage, aucun rejet · faux positifs 0 · coût non mesuré

## [2026-10-13] F-029 Rang borné dans le document d'espace

- TYPE: FEATURE
- Tier: structurel
- Scope: `packages/document`, `apps/web/src/interface/messages.ts` — agents: agent-frontend, agent-planif (relecture de la spec), orchestrateur — commits: 4491fd1..40231ce
- Détail: rang de plus de 1024 caractères ignoré à la lecture, `rangEntre` sans récursion, écriture de `place` par `admettrePlace` avec redistribution des sœurs puis refus `rang-indisponible`. Mode économe.
- Dette: résorbée D-005 ; introduite D-018 (F-029 acceptée par dérogation : AC7 (d) à la borne de 1024 éprouvé une seule fois, redistribution non testée directement contre une borne abaissée, ADR-0002, ADR-0003 et `ARCHITECTURE.md` à amender avant F-012, vulnérabilité modérée de `pnpm audit` à identifier) ; laissée D-010
- ADR: ADR-0002 et ADR-0003 à amender (D-018)
- Tests: 2372 tests sur 108 fichiers — état: verts — preuve: checks.txt (empreinte `8de67271dad6`)
- Gates: CRAFT PASS · revue reviewer-frontend CHANGES_REQUESTED · SECURITY UNVERIFIED (dossier tronqué à la lecture, aucun constat dans la partie vue) · ARCHITECTURE non lancé ; les trois acceptés par DEROGATION D-018
- Mesures: boucles 1 passage · coût non mesuré

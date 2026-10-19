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

## [2026-10-13] F-010 Écrans d'inscription, de connexion et de déconnexion

- TYPE: FEATURE
- Tier: structurel
- Scope: `apps/web` (module `src/compte/`, écrans et zone de compte, routes, relais `/api` de Vite) — agents: agent-frontend, orchestrateur ; fichiers protégés par le dev — commits: a390e54..f134cb2
- Détail: écrans `#/inscription` et `#/connexion`, zone de compte dans la barre latérale (connecté, déconnecté, inconnu), état suivi par `GET /api/v1/moi`, client `better-auth/client`, messages d'erreur en français ; l'application locale reste utilisable sans compte ni serveur. Mode économe. Écarts acceptés par le dev : `Compte.tsx`, filtre de console dans `e2e/aides.ts` (AC26 disait « sans modification »), relais dans `vite.config.ts`, paquet client +125 Ko, scénario contre le vrai serveur ignoré.
- Dette: introduite D-019 (gate d'architecture non lancé, accepté par dérogation du dev) ; laissées D-003 (parcours réel prouvé seulement sous DOM simulé), D-007, D-017
- ADR: aucun
- Tests: 2497 tests sur 113 fichiers — état: verts — preuve: checks.txt (empreinte `9d33a31a271c`)
- Gates: SECURITY PASS · CRAFT PASS · revue reviewer-frontend APPROVED (deux remarques de lisibilité dans `EcranDeCompte.tsx`) · ARCHITECTURE non lancé, DEROGATION D-019
- Mesures: boucles 1 passage, aucun rejet · faux positifs 0 · coût non mesuré

## [2026-10-13] F-014 Écrans des espaces, des membres et des invitations

- TYPE: FEATURE
- Tier: structurel
- Scope: `apps/web` (client des espaces sur l'API de F-011, écrans liste, espace, membres, invitations, acceptation d'une invitation, formes d'adresse) — agents: agent-frontend, orchestrateur — commits: c18675b..b1b8d9d
- Détail: une personne connectée voit ses espaces du serveur, en crée, les renomme, les supprime ou les quitte, invite par lien, règle les rôles et retire des membres ; chaque action indisponible reste visible, désactivée avec sa raison. Mode économe : un passage des gates, un tour de correctifs sans nouvelle revue. Écarts soumis au dev : annonce « Vous avez quitté l'espace » (AC12), retour après connexion de F-010 retouché, deux listes fermées de tests étendues.
- Dette: introduite D-020 (reviewer-frontend non rejoué après le tour de correctifs, sécurité jugée sur l'empreinte précédente, gate d'architecture non lancé : acceptés par dérogation du dev) ; laissées D-003 (AC40 et historique d'AC21, AC25 non joués), D-007, D-017
- ADR: aucun
- Tests: 2591 tests sur 118 fichiers — état: verts — preuve: checks.txt (empreinte `1f7d6e54ceca`)
- Gates: sur `2b090d71be28` : SECURITY PASS · CRAFT PASS · revue reviewer-frontend CHANGES_REQUESTED (7 points, corrigés dans `b1b8d9d`) ; sur `1f7d6e54ceca` : CRAFT PASS · reviewer-frontend, sécurité et architecture par DEROGATION D-020
- Mesures: boucles 1 passage et 1 tour de correctifs · constats confirmés 7 · faux positifs 0 · coût non mesuré

## [2026-10-14] F-027 Gestion du compte : mot de passe, nom, sessions

- TYPE: FEATURE
- Tier: structurel
- Scope: `packages/contrats`, `packages/db`, `apps/server`, `apps/web` (écran `#/compte`) — agents: agent-backend, agent-bdd, agent-frontend, orchestrateur — commits: b5ec009..1b9717a
- Détail: cinq routes (nom, mot de passe, liste des sessions, révocation d'une session, révocation des autres), mot de passe actuel exigé, session courante protégée (409), débit plafonné, contrôle d'origine, écritures hors de better-auth et suppression des sessions par la fonction du serveur ; écran du compte dans le client. Mode économe : un passage des gates, un correctif ciblé sans nouvelle revue. Écarts soumis au dev : test de F-010-AC16 passé de 14 à 16 codes, mot de passe vérifié avant la cible d'une révocation, action « Fermer toutes les autres sessions », composants de F-014 réutilisés.
- Dette: introduite D-021 (revues non rejouées après le correctif, gate d'architecture non lancé : acceptés par dérogation du dev) ; laissées D-002, D-003, D-007, D-017
- ADR: aucun
- Tests: 2752 tests sur 127 fichiers — état: verts — preuve: checks.txt (empreinte `8984bebd617e`)
- Gates: sur `ac76be34805f` : SECURITY PASS · CRAFT PASS · revues reviewer-backend et reviewer-frontend APPROVED, reviewer-api CHANGES_REQUESTED (1 point, corrigé dans `1b9717a`) ; sur `8984bebd617e` : CRAFT PASS · revues, sécurité et architecture par DEROGATION D-021
- Mesures: boucles 1 passage et 1 correctif · constats confirmés 1 (non exploitable) · faux positifs 0 · coût non mesuré

## [2026-10-14] F-007 Corbeille : écran, restauration, suppression définitive

- TYPE: FEATURE
- Tier: structurel
- Scope: `packages/document` (restauration, suppression définitive, ramasse-miettes), `apps/web` (effacement local, écran `#/corbeille`) — agents: agent-frontend, orchestrateur — commits: b664766..57dfaeb
- Détail: corbeille listée au pied de la barre latérale, restauration d'une racine de corbeille, suppression définitive de la page et de sa descendance en une transaction, sessions fermées et bases IndexedDB effacées, avertissement si l'effacement échoue. Décision prise au code (mode économe) : ramasse-miettes actif sur le document d'espace, entrées retirées de `pages`, pas de compactage ; à reporter dans l'ADR-0002 et l'ADR-0001. Écarts soumis au dev : entrée « Corbeille » en bouton, assertions de F-004-AC25, AC30 et AC42 réécrites, listes fermées de tests étendues.
- Dette: introduite D-022 (reviewer-frontend non rejoué après le tour de correctifs, sécurité jugée sur l'empreinte précédente, gate d'architecture non lancé, ADR-0002 et ADR-0001 à amender : acceptés par dérogation du dev) ; laissées D-003 (`demonstration.spec.ts` rouge à 360 px, venu de F-014), D-007, D-017, D-018
- ADR: ADR-0001 et ADR-0002 à amender (avec D-018, avant F-012)
- Tests: 2841 tests sur 133 fichiers — état: verts — preuve: checks.txt (empreinte `80038b4432aa`)
- Gates: sur `6bf420991187` : SECURITY PASS · CRAFT PASS · revue reviewer-frontend CHANGES_REQUESTED (4 points, corrigés dans `57dfaeb`) ; sur `80038b4432aa` : CRAFT PASS · reviewer-frontend, sécurité et architecture par DEROGATION D-022
- Mesures: boucles 1 passage et 1 tour de correctifs · constats confirmés 3, 1 écarté (360 px préexistant) · coût non mesuré

## [2026-10-14] F-012 Synchronisation serveur des documents (Hocuspocus, instantanés Yjs, autorisation par espace)

- TYPE: FEATURE
- Tier: structurel
- Scope: `packages/contrats` (`synchro.ts`), `packages/db` (table `document`, migration `0002_documents`), `apps/server` (point de synchronisation, relais, autorisation, stockage, arrêt, fabrique d'essai), `apps/web/test` (coutures) — agents: agent-bdd, agent-backend, agent-frontend, orchestrateur ; dépendances et règles par le dev (`022f044`, poussé directement sur `main` avec `6c9e8f3`) — commits: 03dfa36..6f583fa
- Détail: premier flux WebSocket du projet ; les membres échangent leurs mises à jour par le serveur, qui les stocke en instantanés sans jamais écrire de contenu ; autorisation à chaque ouverture et réévaluée en continu ; limites de taille, de nombre, de délai ; motifs publiés au contrat ; arrêt en 1001. Mode économe. Décisions prises au code (ramasse-miettes côté serveur, document de page supprimée gardé jusqu'à l'espace, réécriture d'un identifiant supprimé non empêchée) à reporter dans l'ADR-0001.
- Dette: introduite D-023 (revues bdd, backend, api, frontend non rejouées après le tour de correctifs, sécurité UNVERIFIED faute de sorties brutes et de `trivy image`, gate d'architecture non lancé : acceptés par dérogation du dev ; constats moyens de la sécurité : pas de limite de débit sur le passage en WebSocket, copie du document d'espace à chaque mise à jour, présence usurpable jusqu'à F-015, 500 connexions pour tout le serveur) ; D-018 précisée (avis modéré : esbuild de développement par drizzle-kit) ; laissées D-002, D-003, D-007, D-011, D-014, D-017
- ADR: ADR-0001 à amender (décisions de F-012)
- Tests: 3016 tests sur 150 fichiers — état: verts — preuve: checks.txt (empreinte `6cdcfb8e70d9`)
- Gates: sur `4bafb3db120d` : CRAFT PASS · reviewer-frontend APPROVED · SECURITY FAIL (3 élevés) · reviewer-bdd, reviewer-backend, reviewer-api CHANGES_REQUESTED, corrigés dans `777dd00` ; sur `238ab634cad3` : SECURITY UNVERIFIED (test des messages de type 4, ajouté dans `6f583fa`, passé sans correctif) ; sur `6cdcfb8e70d9` : CRAFT PASS · SECURITY UNVERIFIED (aucun constat élevé ; sorties brutes et `trivy image` manquantes) · revues, sécurité et architecture par DEROGATION D-023
- Mesures: boucles 1 passage, 1 tour de correctifs, 2 passages du seul gate sécurité · constats confirmés 3 élevés et 4 autres · faux positifs 0 · coût non mesuré

## [2026-10-15] F-013 Synchronisation côté client (connexion, reprise après hors ligne, état visible)

- TYPE: FEATURE
- Tier: structurel
- Scope: `apps/web` (module `src/synchronisation/`, registre de l'appareil, zone et écrans de synchronisation, lecture seule) — agents: agent-frontend, orchestrateur ; dépendances, règles, ESLint et projets Vitest par le dev (`1290f70`, poussé directement sur `main` avec `01a6bef` et la fusion `90d09c4`) — commits: b09afeb..15e8530
- Détail: le client déclare son espace au serveur de F-012, écrit sans attendre le réseau, reprend après une coupure avec un aléa de 20 %, passe en lecture seule selon les droits, et affiche ce qui est transmis et pourquoi. Mode économe. Décisions prises au code dans `MEMORY/features/F-013.md`.
- Dette: introduite D-024 (reviewer-frontend non rejoué après le tour de correctifs, sécurité jugée sur l'empreinte précédente, gate d'architecture non lancé, AC41 sans la fermeture 1001 dans le navigateur, AC10 lu par `navigator.onLine`, AC45 sur un membre typé mais absent du README : acceptés par dérogation du dev) ; laissées D-003, D-007, D-017, D-023
- ADR: ADR-0001 et `ARCHITECTURE.md` à aligner sur F-012 et F-013
- Tests: 3184 tests sur 161 fichiers — état: verts — preuve: checks.txt (empreinte `41ce5bc56134`) ; bout en bout joué par le dev sur la pile Docker (macOS) : 56 réussis, 1 ignoré, après correction de 3 vrais défauts (perte du réseau, relecture d'un espace supprimé, infobulle à 360 px) et de 4 défauts de test
- Gates: sur `72d25cbef6ce` : SECURITY PASS · CRAFT PASS · revue reviewer-frontend CHANGES_REQUESTED (8 points, corrigés dans `6e31215`) ; sur `41ce5bc56134` : CRAFT PASS · reviewer-frontend, sécurité et architecture par DEROGATION D-024
- Mesures: boucles 1 passage et 1 tour de correctifs · constats confirmés 6, dont 2 trous réels de lecture seule ; 5 défauts trouvés par les tests et le bout en bout (effacement entre onglets, réouverture d'une page juste fermée) · coût non mesuré

## [2026-10-16] Alignement après F-013 : ROADMAP, ARCHITECTURE.md, ADR, délai du serveur d'essai

- TYPE: REFACTOR
- Tier: trivial
- Scope: `ROADMAP.md`, `ARCHITECTURE.md`, `docs/decisions/` (ADR-0013, ADR-0014 proposées ; ADR-0001 à 0004, 0007 à 0009, 0012 amendées, proposées), `apps/web/test/synchronisation/coutures-synchro.test.ts` — agents: agent-planif, agent-architecte-conception, agent-frontend, orchestrateur — commits: a39e1f3..c7361f6, fusion 2a10b99
- Détail: ROADMAP à jour (quinze features livrées, décisions du dev du 2026-10-16, CI avant toute nouvelle feature, ordre F-028, F-005, F-006, F-015 ; aucune paire des quatre parallélisable, `apps/web/src/edition/` partagé) ; structure de F-012 et F-013 décrite telle que livrée ; délai du crochet de démarrage du serveur d'essai porté à 30 s (huit autres crochets restent à 10 s).
- Dette: aucune introduite ; D-017, D-019 (alignement d'`ARCHITECTURE.md`) en attente d'acceptation des ADR par le dev
- ADR: ADR-0013, ADR-0014 (proposées) ; amendements datés du 2026-10-16 (proposés)
- Tests: 44 tests du fichier touché verts — état: verts — preuve: agent-frontend ; suite complète au pre-push
- Gates: aucun (trivial) · `gates-verts.sh main..HEAD` : OK
- Mesures: aucune boucle · coût non mesuré

## [2026-10-16] Correctif de verifier.sh : pre-push bloqué après des tests verts

- TYPE: FIX
- Tier: trivial
- Scope: `.agents/checks/verifier.sh` (ligne 41) — agents: dev — commits: ee874f0
- Détail: la substitution bash `${out//[[:space:]]/}` sur la sortie complète de la suite est quadratique (plus de 300 s mesurées pour 200 Ko) ; le pre-push restait bloqué après des tests verts, et GitHub fermait la connexion SSH. Remplacée par un `grep` linéaire, même comportement. `.agents/SOCLE.sha256` non mis à jour pour ce fichier (signalé en `[INFO]` par `test-blocage.sh`).
- Dette: aucune
- ADR: aucun
- Tests: aucun ajouté — état: verts — preuve: pre-push de F-028
- Gates: aucun (trivial)
- Mesures: coût non mesuré

## [2026-10-16] CI GitHub Actions et protection de main

- TYPE: DEBT
- Tier: structurel (infra), commité par le dev sans spec
- Scope: `.github/workflows/ci.yml` ; réglages du dépôt GitHub — agents: agent-devops (conception, hors dépôt), dev, orchestrateur — commits: b8b73b9, PR #3, fusion f3cdaf9
- Détail: quatre jobs requis sur `main` : `commits` (trailers, périmètre, secrets de chaque commit ; `main` n'avance que par merge commit), `controles` (`controles.sh <base>`), `typecheck` (`pnpm typecheck`, lint et format de tout l'arbre), `gates` (`gates-verts.sh`). Node 26.11.1, pnpm 12.10.1, actions épinglées par SHA, gitleaks et trivy vérifiés par sha256, semgrep en image épinglée. Ruleset `main` : PR obligatoire, merge commit seul, 4 checks requis, branche à jour, ni force push ni suppression, aucun contournement ; squash, rebase et auto-merge désactivés ; Actions sélectionnées, épinglage par SHA exigé, jeton en lecture. Hooks git gardés (règle 4) jusqu'à l'accord du dev.
- Dette: résorbée D-001 ; D-007 couverte en CI (`typecheck`), toujours hors des hooks
- ADR: aucun
- Tests: CI verte sur la PR #3 et sur `main` après fusion
- Gates: aucun gate LLM (fichiers protégés, commit du dev)
- Mesures: coût non mesuré

## [2026-10-16] F-028 Mise en forme dans le texte : gras, italique, liens

- TYPE: FEATURE
- Tier: structurel
- Scope: `apps/web/src/edition/` (marques, règle des adresses, lien, panneau, relecture de la sélection du navigateur), `packages/document` (version 2 du document de page), `apps/web/e2e/mise-en-forme.spec.ts` — agents: agent-veille, agent-frontend, orchestrateur ; liste blanche de `.dependency-cruiser.cjs` par le dev (d9e5a89) — commits: 4631119..ba5e77f
- Détail: gras, italique et liens sans compte ni réseau ; règle des adresses unique en double barrière, lien réduit à `href`, lien refusé reçu neutralisé au rendu, aucun lien automatique, Mod+K selon H12, version élevée paresseusement. Le bout en bout a trouvé un vrai défaut : Chromium livre `selectionchange` dans une tâche séparée, un raccourci ou un collage rapide agissait sur une sélection périmée ; corrigé par la relecture de la sélection du navigateur avant chaque frappe et chaque collage.
- Dette: introduite D-025 (reviewer-frontend non rejoué après deux séries de correctifs, dont la relecture de la sélection ; sécurité jugée sur la première empreinte ; architecture non lancée) ; laissées D-003, D-007
- ADR: aucun (version 2 inscrite dans la table de F-003)
- Tests: 3465 tests sur 167 fichiers — état: verts — preuve: checks.txt (empreinte `5df7774ce0c4`) ; AC30 en Chromium sous macOS : vert, puis 10 sur 10
- Gates: sur `9b376ff9bc97` : SECURITY PASS · CRAFT PASS · reviewer-frontend CHANGES_REQUESTED (6 points, corrigés) ; sur `61c223f307ae` puis `5df7774ce0c4` : CRAFT PASS · reviewer-frontend, sécurité et architecture par DEROGATION D-025
- Mesures: boucles 1 passage, 1 tour de correctifs, 1 correctif du bout en bout · constats confirmés 6, dont 2 règles de saisie fausses (AC3) et l'héritage d'un lien refusé (AC18) · coût non mesuré

## [2026-10-16] F-017 Modèle de table (Yjs, `packages/document`) : colonnes typées, lignes, cellules

- TYPE: FEATURE
- Tier: structurel
- Scope: `packages/document/src` (`table.ts`, `format-table.ts`, `document-table.ts` ; `insertionParmi` extraite dans `rang.ts`), `apps/web/src/interface/messages.ts` (neuf codes) — agents: agent-veille, agent-architecte-conception, agent-frontend, orchestrateur ; règle `document-coeur-pur` élargie par le dev (02f2a72) — commits: eb2668f..b230a81
- Détail: second format de document (table), sans appelant dans `apps/web` avant F-018 ; trois types racine (`colonnes`, `lignes`, `versions`), ordre par rang borné, suppression par drapeau, cellules créées avec leur ligne, comparaison avant notification, reconnaissance par les types racine ; 12 exports et 9 codes d'erreur nouveaux. Après revue : chaînes à unité UTF-16 isolée normalisées comme l'encodage V1 à l'écriture et à la lecture (décision de l'orchestrateur, sans amender la spec), oracle d'AC9 indépendant de la façade.
- Dette: introduite D-026 (reviewer-frontend non rejoué après correctifs, sécurité jugée sur la première empreinte, architecture non lancée, AC25 qui n'éprouve que la compilation des dépendants), D-027 (clé à unité isolée forgée par un pair non normalisée ; même défaut sur les titres de page de F-001) ; laissées D-003, D-007
- ADR: ADR-0016 (proposée)
- Tests: 3711 tests sur 174 fichiers, dont 651 dans `packages/document` — état: verts — preuve: checks.txt (empreinte `3515753d84af`)
- Gates: sur `24eb1f6dfe62` : SECURITY PASS · CRAFT PASS · reviewer-frontend CHANGES_REQUESTED (4 points, corrigés) ; sur `3515753d84af` : CRAFT PASS · reviewer-frontend, sécurité et architecture par DEROGATION D-026
- Mesures: boucles 1 passage, 1 tour de correctifs · constats confirmés 4 (divergence évitable, refus hors spec, AC25, oracle circulaire) · coût non mesuré

## [2026-10-16] F-031 Pile Docker de travail utilisable en une commande

- TYPE: FEATURE
- Tier: structurel
- Scope: `infra/` (`pile.sh` et ses six sous-commandes, `verification-configuration.yml`, `fumee.sh` à 17 constats, tests sans Docker), `apps/server` (`configuration.ts` : raisons des refus ; `verifier-configuration.ts` ; `.env.example`), `package.json` racine (scripts `pile`, `fumee`), `README.md`, `infra/RETOUR-ARRIERE.md` — agents: agent-planif, agent-veille, agent-architecte-conception, agent-backend, agent-devops, orchestrateur ; règle de contrats par le dev (45c66b2) — commits: ab47006..e470999
- Détail: demandée par le dev après six incidents de mise en route du 2026-10-16 (secret et mot de passe factices, raison des refus absente, volume initialisé avec un ancien mot de passe, serveur lancé sur l'hôte sans base, fumée lancée par un chemin relatif, origine non vérifiée). `preparer` crée les `.env` (mode 600, secrets aléatoires, jamais d'écrasement) ; `demarrer` vérifie la configuration par le code du serveur dans son image, sans volume ni réseau (ADR-0017), éprouve le mot de passe contre le volume, détecte les ports pris, va jusqu'à `/pret` 200 ; `accorder` remet le mot de passe d'accord sans perte de données et sans trace dans le journal de la base. Hypothèse H6 de la spec fausse (`run --no-deps` crée le volume), parée par une surcharge et un garde.
- Dette: introduite D-029 (dérogation), D-030 (Compose 2.24.0 à 2.24.3 sans preuve), D-031 (`PGPASSWORD` dans l'environnement du client le temps de l'épreuve), D-032 (origine 5174 admise sous Compose), D-033 (aucun contrôle bash au socle) ; D-018 précisée (GHSA-67mh-4wv8-2f99) ; laissées D-003, D-007
- ADR: ADR-0017 (proposée) ; amendement d'ADR-0006 prévu
- Tests: 3656 tests sur 176 fichiers — état: verts — preuve: checks.txt ; fumée d'agent `FUMEE: OK (constats 1 à 17)` sur `ec898f0` ; `test-blocage.sh` : tous les blocages effectifs ; shellcheck 0.11.0 sans constat ; fumée officielle et inscription réelle à verser par le dev
- Gates: sur `ebda9c44b1db` : CRAFT PASS · reviewer-devops, reviewer-backend CHANGES_REQUESTED (12 points, corrigés) · SECURITY UNVERIFIED (shellcheck, fumée du dev ; aucun constat élevé) ; sur l'empreinte finale : CRAFT PASS · relecteurs, sécurité et architecture par DEROGATION D-029
- Mesures: boucles 1 passage, 1 tour de correctifs · constats confirmés 12, dont 2 simulacres qui se testaient eux-mêmes et 1 défaut de création exclusive trouvé par les tests · coût non mesuré

## [2026-10-16] F-006 Glisser-déposer des blocs et des pages

- TYPE: FEATURE
- Tier: structurel
- Scope: `apps/web/src/glisser/` (nouveau, seul importateur de dnd-kit), `apps/web/src/interface/` (barre latérale, `destination-de-page.ts`, menu « ⋯ », raccourcis, annonces), `apps/web/src/edition/` (`deplacement-de-bloc.ts`, `depot.ts`, `poignee.ts`), `apps/web/package.json` et `pnpm-lock.yaml` (dnd-kit 6.3.1, poignée et curseur de dépôt Tiptap 3.31.4) — agents: agent-veille, agent-architecte-conception, agent-frontend, orchestrateur ; règles de contrats par le dev (f9a5d63) — commits: 0c2bb24..ec8b4a5
- Détail: pages réordonnées et imbriquées à la souris et au clavier (Alt+Maj+Flèche, quatre commandes du menu), premier appelant de `deplacerPage` ; blocs déplacés par la poignée, la barre de blocs et le clavier, en une transaction annulable seule ; fichiers lâchés refusés, lecture seule comprise ; pas de poignée sur écran étroit ni sous pointeur imprécis. Le bout en bout a trouvé une cible de 24 px sur écran étroit ; la revue a trouvé un fichier lâché en lecture seule ouvert par le navigateur.
- Dette: introduite D-034 (dérogation), D-035 (dnd-kit sans publication depuis décembre 2024) ; D-018 confirmée antérieure (GHSA-67mh-4wv8-2f99) ; laissées D-003, D-007
- ADR: ADR-0015 (proposée) ; amendement d'ADR-0007 (proposé)
- Tests: 3585 tests sur 173 fichiers — état: verts — preuve: checks.txt ; bout en bout `glisser-deposer.spec.ts` 3 sur 3 en Chromium
- Gates: sur `8e8746a30214` : SECURITY PASS · CRAFT PASS · reviewer-frontend CHANGES_REQUESTED (2 points et 9 suggestions, traités) ; sur l'empreinte finale : CRAFT PASS · reviewer-frontend, sécurité et architecture par DEROGATION D-034
- Mesures: boucles 1 passage, 1 tour de correctifs · constats confirmés 2, dont 1 défaut réel en lecture seule · coût non mesuré

## [2026-10-19] ADR de main alignées sur le code et acceptées

- TYPE: REFACTOR
- Tier: trivial
- Scope: `docs/decisions/` (ADR-0001 à 0004, 0006 à 0009, 0012 à 0017), commentaire de `apps/web/src/synchronisation/synchronisation.ts` — agents: agent-architecte-conception, agent-frontend, orchestrateur — commits: 34db427, 1d2d81e
- Détail: décision du dev du 2026-10-19 : les ADR « proposées » ne sont acceptées qu'après correction de leurs écarts avec le code. Audit fait pendant F-005, sorti de sa branche à la demande du gate d'architecture. Écarts de description corrigés ; ADR-0014 réécrite selon le code (la dernière lecture réussie du registre est gardée, décision du dev). Restent « proposé » : l'amendement F-012 d'ADR-0002 (`meta` d'une autre nature, corrigé dans F-018) et ADR-0015 (acceptée avec F-005).
- Dette: aucune
- ADR: ADR-0013, 0014, 0016, 0017 et les amendements du 2026-10-16 acceptés
- Tests: tests de documentation d'`infra` verts — état: verts — preuve: agent
- Gates: aucun (trivial)
- Mesures: coût non mesuré

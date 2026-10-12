# STATE — notionLike — 2026-10-12

## Où on en est

Dépôt distant : `git@github.com:budocay/notionLike.git`. Le dev reprend le projet depuis Claude Code cloud ; tout l'état utile est dans ce fichier et dans les branches poussées. Sur un clone neuf, lancer une fois `pnpm install --frozen-lockfile` et `git config core.hooksPath .githooks` (les hooks git ne se clonent pas ; sans eux aucun contrôle ne tourne au commit ni au push).

`main` porte quatre features DONE, tous gates verts : F-001 (arborescence des pages, `packages/document`), F-002 (application web locale), F-004 (identité visuelle sombre), F-030 (reprise de la persistance locale après une coupure, fusionnée le 2026-10-12, `3b6062a`). Leurs entrées sont dans `PROJECT_LOG.md` et `MEMORY/features/`.

Trois branches de travail, non fusionnées, une feature chacune :

- `F-008-socle` (socle serveur, structurel) : code FINI et vérifié, `main` intégré. Dernier commit de code ou de configuration `0fd735e`. Spec validée (26 critères). Relevé de l'orchestrateur : 61 fichiers, 1497 tests, types, lint, contrats, couverture des critères, périmètre en code 0 ; `infra/fumee.sh` sur la pile Docker réelle : `FUMEE: OK (constats 1 à 11)`. Fiche `MEMORY/features/F-008.md` écrite. ADR-0004 à 0006 et note de conception réalignés (`a926a1d`). RESTE : `ARCHITECTURE.md` à aligner par `agent-architecte-conception` (interrompu avant), puis dossier de revue et gates.
- `F-003` (éditeur de page, structurel), partie de `F-030` : sept commits de code, dernier `ddba41b` (travail interrompu, enregistré tel quel). Tests, types et lint verts (54 fichiers, 1353 tests). 43 critères sur 44 cités par un test ; manque F-003-AC39. `pnpm contrats` est ROUGE sur la branche : 21 violations de `web-src-liste-blanche`, Tiptap n'étant pas admis par `.dependency-cruiser.cjs`. Aucun rapport du producteur : ce qui est réellement prouvé reste à relire.
- `F-009` (comptes et sessions côté serveur, better-auth, structurel), partie de `F-008-socle` : schéma et migration (`e983abc`, `8618517`), better-auth 1.7.7 (`780d1b3`), règles de dépendances posées par le dev (`8ad53a3`), scripts d'`esbuild` refusés (`eace358`), code serveur en cours (`f8891ab`, travail interrompu, enregistré tel quel). Tests, types, lint et contrats verts (59 fichiers, 1531 tests). 20 critères sur 33 cités ; manquent AC11, AC12, AC14, AC16, AC17, AC20, AC24 à AC29, AC31. Aucun rapport du producteur sur le dernier bloc.

Décisions du dev en vigueur : mode rapide pour toutes les features (spec validée, code direct, gates en fin de feature) ; le 2026-10-12, développements lancés sans attendre les gates, sans relecture de structure ni documents intermédiaires ; délégation à l'orchestrateur des commits `Agent: dev` (D-008), sauf la validation d'une spec non relue et l'écriture d'un fichier protégé, que le mode auto refuse et que le dev fait lui-même.

## Prochaine action prévue

Dans l'ordre, une branche à la fois ou en parallèle (dossiers disjoints entre client et serveur) :

1. `F-008-socle` : faire aligner `ARCHITECTURE.md` par `agent-architecte-conception` (brief : décrire le code de `0fd735e` ; ajouter `apps/server/src/service.ts`, les 25 contrats, les comptes 61 fichiers et 1497 tests, 226 modules et 643 dépendances ; aucun code). Puis `.agents/checks/dossier-revue.sh F-008`, `gate.sh` pour `reviewer-devops`, `reviewer-bdd`, `reviewer-backend`, `reviewer-api`, `agent-architecte`, `agent-securite`, `craft.sh F-008`, commit de `MEMORY/gates.log`. Tous verts : entrée de `PROJECT_LOG.md`, ligne de `MEMORY/INDEX.md`, `gates-verts.sh main..HEAD` depuis la branche, lu en entier, puis fusion dans `main` par une commande séparée (`git merge --no-ff -m` avec trailers). La fumée Docker est à rejouer si un commit de code s'ajoute.
2. `F-009` : reprendre `agent-backend` sur les treize critères manquants (commencer par relire `f8891ab`, enregistré sans rapport ; vérifier que l'adaptateur Drizzle de better-auth marche malgré les deux copies physiques de `drizzle-orm@0.45.3`, point jamais rapporté). Intégrer `F-008-socle` puis `main` une fois F-008 fusionnée.
3. `F-003` : faire poser par le dev, dans `.dependency-cruiser.cjs`, l'admission de Tiptap et de ses paquets (texte à faire préparer et essayer sur copie par `agent-frontend`, comme pour F-009) ; reprendre `agent-frontend` sur F-003-AC39 et sur la relecture de `ddba41b` ; bout en bout ; intégrer `main`.
4. Ensuite : F-011, F-012 (F-029 avant F-012) côté serveur ; suite du client selon `ROADMAP.md`.

## Dettes ouvertes

- D-001 Pas de CI ni de branche protégée — depuis la génération — impact : les hooks git se contournent par `--no-verify` ; à lever maintenant qu'une plateforme git est choisie (GitHub).
- D-002 Tests d'intégration du serveur sur PGlite et non sur un PostgreSQL réel — proposée par F-008 — pas encore ouverte par le dev.
- D-003 Tests de bout en bout hors des hooks — depuis F-002 — impact : scénarios Playwright, captures et `preuve:construction` ne sont tenus que par des relevés à la main ; à lever par le dev dans `.agents/outils.env`.
- D-004 Citée par le dev dans deux lignes `REPRISE D-004` de `MEMORY/gates.log` — titre et impact écrits nulle part : à faire décrire par le dev.
- D-005 Rang de longueur non bornée et `rangEntre` récursive — depuis F-001 — impact : une mise à jour forgée peut épuiser la pile ; levée par F-029, obligatoire avant F-012.
- D-006 Rappel d'abonné qui lève, façade sans fermeture — depuis F-001 — levée par F-002 ; à clore par le dev dans `PROJECT_LOG.md`.
- D-007 Vérification des types hors des contrôles du socle — depuis F-001 — impact : `pnpm typecheck` n'est prouvé par aucun `checks.txt` ; à lever par le dev.
- D-008 Commits `Agent: dev` délégués à l'orchestrateur — depuis le 2026-10-09 — impact : le trailer ne prouve plus qu'un humain a lu une spec ou un fichier protégé ; à lever par le dev (`git log --grep='délégation explicite du dev'`).
- D-009 Réparation de l'identifiant d'espace par énumération des bases de l'appareil — depuis F-030 — à remplacer par le registre de F-013 avant F-014.
- D-010 Lecture brute sans borne (`getAll()`, deux fois par tentative) — depuis F-030 — à borner avec F-029 et F-012.
- D-011 Sonde de disponibilité hors délai qui garde sa connexion empruntée — depuis F-008 — sonde sur un client dédié à prévoir avec F-009.
- D-012 `reviewer-frontend` a rejeté F-030 trois fois de suite — reprise par le dev le 2026-10-12 (ligne `REPRISE D-012` de `MEMORY/gates.log`) ; quatrième passage vert.

## État des contrôles / gates

Les verdicts font foi dans `MEMORY/gates.log`. F-001 : verts sur `ca4cb0d41fe3`. F-002 : verts sur `d06344502281`. F-004 : verts sur `2fc8bae8471c`. F-030 : verts sur `6331333e573b`, `gates-verts.sh main..HEAD` → `RESULTAT GATES: OK` avant la fusion. F-008, F-003, F-009 : aucun gate lancé.

UNVERIFIED pour tout gate, parce que hors des contrôles du socle : `pnpm typecheck` (D-007), la construction, le bout en bout et les captures (D-003), la fumée Docker de F-008 (relevé à la main).

Non vérifié dans l'environnement cloud : la présence de Docker (fumée de F-008), de Playwright et de ses navigateurs (bout en bout), de `gitleaks`, `semgrep` et `trivy` (contrôles de sécurité du dossier de revue). Un outil absent rend le contrôle `UNVERIFIED`, jamais vert.

## Pièges actifs

- Le hook de push refuse un `main` dont une feature n'a pas ses gates verts : ne jamais renommer une branche de travail en `main` (`git branch -M main` l'a fait une fois, corrigé par le dev).
- Avant de fusionner dans `main` : `.agents/checks/gates-verts.sh main..HEAD` DEPUIS LA BRANCHE, sortie lue en entier, puis la fusion dans une commande séparée, avec `-m` et les trailers `Agent:` et `Feature:`.
- Aucun commit de code ni de configuration après le réalignement d'`ARCHITECTURE.md` et de `MEMORY/features/<F-id>.md`. `ROADMAP.md` ne porte aucun état transitoire.
- Le reviewer rejette toute assertion qui ne peut pas échouer (espion relu après sa restauration, `MutationObserver` sans `takeRecords()`, `expect(getBy…)`), tout contrôle statique sans cas fautif en données, tout critère cité par un test qui ne constate pas toute sa phrase de preuve ; le gate d'architecture rejette un calcul pur mêlé à une entrée-sortie, un nom défini deux fois, un compte faux dans `ARCHITECTURE.md`. Trois rejets consécutifs d'un gate : escalade, seule une ligne `REPRISE` du dev relance.
- Un gate dont la ligne de verdict est dans un bloc de code est lu `UNVERIFIED` : relancer le gate.
- Un seul lancement de Playwright à la fois par dépôt (port 5174, `apps/web/test-results/` vidé par tout lancement).
- Deux agents dans le même arbre commitent par chemins explicites, jamais `git add -A`. Un conflit de fusion résolu par un agent compte comme son écriture : le commit de fusion porte le trailer du propriétaire du fichier en conflit.
- Le hook de périmètre refuse toute écriture de l'orchestrateur hors de la traçabilité et toute écriture d'un agent dans un fichier protégé (`.dependency-cruiser.cjs`, scripts de `package.json`, `vitest.config.*`, `eslint.config.mjs`) : le texte se prépare et s'essaie sur une copie, le dev le pose.
- Une validation de spec ne vaut que sur la ligne où elle est commitée ; toute retouche la repasse en brouillon.
- Ne rapporter au dev aucun chiffre sans source.
- Branches d'archive, à ne pas fusionner : `planification-reunie`, `F-008`, `archive-arbre-2026-10-08` ; `F-001`, `F-002`, `F-004`, `F-030` sont déjà fusionnées.
- `fast-check@4.10.2` n'est pas dans la spec F-001 : à entériner par le dev. Stryker n'est pas installé.

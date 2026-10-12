# STATE — notionLike — 2026-10-12

## Où on en est

F-001 (arborescence des pages, `packages/document`), F-002 (application web locale : coquille, barre latérale, persistance IndexedDB) et F-004 (identité visuelle sombre) sont DONE et dans `main` (`c1df7d8`). Leurs entrées sont dans `PROJECT_LOG.md` et `MEMORY/features/`.

Mode rapide pour toutes les features (décision du dev, 2026-10-09) : spec validée, code écrit directement, relecture de structure par `agent-architecte-conception` avant la revue, gates de fin inchangés. Le dev a délégué à l'orchestrateur tous les commits `Agent: dev` (D-008).

F-030 (reprise de la persistance locale après une coupure, tier structurel) est EN REVUE dans le dépôt principal, branche `F-030`. Code fini : dernier commit de code `8527a06` (tests seulement après `a992193`). Spec validée (`381eeef`, 29 critères). Première revue sur l'empreinte `ee8cf32f4968` : craft PASS, sécurité sans constat bloquant mais verdict rendu dans un bloc de code (UNVERIFIED, à relancer), architecture FAIL, reviewer CHANGES_REQUESTED (un défaut réel sur F-030-AC24). Corrections commitées dans `a992193`, preuves relevées dans `MEMORY/features/F-030.md`, ADR-0007 et ADR-0008 réalignés (`5ece85d`).

F-008 (socle serveur, tier structurel) est codée dans le second worktree, `~/dev/notionLike-F-008`, branche `F-008-socle` : dernier commit de code `26942fe`, spec validée (`486b48e`, 26 critères), relecture de structure faite et corrigée. Relevé de l'orchestrateur sur `26942fe` : 52 fichiers, 1382 tests, types, lint, contrats (208 modules, 548 dépendances), couverture des critères, tous en code 0. Elle attend deux gestes du dev (voir plus bas).

Le Mac se met en veille écran rabattu ou par inactivité sur batterie : les agents sont coupés en pleine réponse et un bout en bout lancé pendant une veille échoue par dépassement de délai.

## Prochaine action prévue

F-030 : après le commit d'`ARCHITECTURE.md` réaligné sur `a992193` par `agent-architecte-conception`, lancer `.agents/checks/dossier-revue.sh F-030` (arbre propre), puis `gate.sh` pour `reviewer-frontend`, `agent-architecte`, `agent-securite` et `craft.sh F-030` ; commiter `MEMORY/gates.log`. Tous verts : entrée de `PROJECT_LOG.md`, ligne de `MEMORY/INDEX.md`, `gates-verts.sh main..HEAD` depuis la branche, lu en entier, puis fusion dans `main` par une commande séparée (`git merge --no-ff -m` avec trailers). C'est le deuxième passage : un troisième rejet du même gate déclenche l'escalade.

F-008, dans l'ordre : (1) le dev pose les deux règles de dépendances essayées sur copie (`infra-a-part`, `serveur-tests-par-les-entrees-de-db`, texte dans `scratchpad/f008-relecture/regles.txt`, à insérer après `db-reserve-au-serveur` dans `.dependency-cruiser.cjs`) : le mode auto refuse cette écriture à l'orchestrateur ; l'orchestrateur vérifie (`prettier`, `pnpm contrats`) et commite sous `Agent: dev` ; (2) le dev démarre Docker, copie `apps/server/.env.example` en `apps/server/.env` et lance `infra/fumee.sh` : sa sortie est la seule preuve de F-008-AC19 à AC21 ; (3) preuves relevées, `MEMORY/features/F-008.md`, ADR-0004 à 0006 et `ARCHITECTURE.md` (ajouter `apps/server/src/service.ts`), dossier de revue et gates (`reviewer-devops`, `reviewer-bdd`, `reviewer-backend`, `reviewer-api`, architecture, sécurité, craft) ; (4) intégrer `main` après la fusion de F-030, repasser les contrôles, fusionner.

Ensuite : F-003 (éditeur de page) côté client ; F-009, F-011, F-012 côté serveur, F-029 avant F-012.

## Dettes ouvertes

- D-001 Pas de CI ni de branche protégée — depuis la génération — impact : les hooks git se contournent par `--no-verify` ; à lever dès qu'une plateforme git est choisie.
- D-002 Tests d'intégration du serveur sur PGlite et non sur un PostgreSQL réel — proposée par F-008 — pas encore ouverte par le dev.
- D-003 Tests de bout en bout hors des hooks — depuis F-002 — impact : scénarios Playwright, captures et `preuve:construction` ne sont tenus que par des relevés à la main ; à lever par le dev dans `.agents/outils.env`.
- D-004 Citée par le dev dans deux lignes `REPRISE D-004` de `MEMORY/gates.log` — titre et impact écrits nulle part : à faire décrire par le dev.
- D-005 Rang de longueur non bornée et `rangEntre` récursive — depuis F-001 — impact : une mise à jour forgée peut épuiser la pile ; levée par F-029, obligatoire avant F-012.
- D-006 Rappel d'abonné qui lève, façade sans fermeture — depuis F-001 — levée par F-002 ; à clore par le dev dans `PROJECT_LOG.md`.
- D-007 Vérification des types hors des contrôles du socle — depuis F-001 — impact : `pnpm typecheck` n'est prouvé par aucun `checks.txt` ; à lever par le dev.
- D-008 Commits `Agent: dev` délégués à l'orchestrateur — depuis le 2026-10-09 — impact : le trailer ne prouve plus qu'un humain a lu une spec ou un fichier protégé ; à lever par le dev (`git log --grep='délégation explicite du dev'`).
- D-009 Réparation de l'identifiant d'espace par énumération des bases de l'appareil — depuis F-030 — impact : qui écrit dans l'IndexedDB de l'origine peut substituer l'espace ; à remplacer par le registre de F-013 avant F-014.
- D-010 Lecture brute sans borne (`getAll()`, deux fois par tentative, tentatives sans limite) — depuis F-030 — impact : une base géante ou forgée coûte mémoire et CPU à chaque tentative ; à borner avec F-029 et F-012.
- D-011 Sonde de disponibilité hors délai qui garde sa connexion empruntée — depuis F-008 — impact : la réserve de 10 connexions peut s'épuiser sur une base muette ; sonde sur un client dédié à prévoir avec F-009.

## État des contrôles / gates

Les verdicts font foi dans `MEMORY/gates.log`. F-001 : verts sur `ca4cb0d41fe3`. F-002 : verts sur `d06344502281`. F-004 : verts sur `2fc8bae8471c`. F-030 : premier passage sur `ee8cf32f4968` (voir plus haut), second passage à lancer. F-008 : aucun gate lancé.

F-030, relevé de l'orchestrateur sur `a992193` : 41 fichiers, 1192 tests, types, lint, contrats (164 modules, 490 dépendances), `preuve:construction`, couverture des critères, périmètre, bout en bout `48 passed` deux fois, tous en code 0.

UNVERIFIED pour tout gate, parce que hors des contrôles du socle : `pnpm typecheck` (D-007), la construction, le bout en bout et les captures (D-003) ; pour F-008, `infra/fumee.sh`, la construction de l'image et `trivy image` (Docker absent du poste jusqu'ici).

## Pièges actifs

- Avant de fusionner dans `main` : `.agents/checks/gates-verts.sh main..HEAD` DEPUIS LA BRANCHE, sortie lue en entier, puis la fusion dans une commande séparée, avec `-m` et les trailers `Agent:` et `Feature:`.
- Aucun commit de code ni de configuration après le réalignement d'`ARCHITECTURE.md` et de `MEMORY/features/<F-id>.md`. `ROADMAP.md` ne porte aucun état transitoire.
- Le reviewer rejette toute assertion qui ne peut pas échouer, tout contrôle statique sans cas fautif en données, tout critère cité par un test qui ne le prouve pas ; le gate d'architecture rejette un calcul pur mêlé à une entrée-sortie, un nom défini deux fois, un compte faux dans `ARCHITECTURE.md`.
- Un gate dont la ligne de verdict est dans un bloc de code est lu `UNVERIFIED` : relancer le gate.
- Un seul lancement de Playwright à la fois par dépôt (port 5174, dossier `apps/web/test-results/` vidé par tout lancement) : interdire le bout en bout aux agents pendant que l'orchestrateur le relève. Un lancement qui dure plus de deux minutes a traversé une veille : le rejouer.
- Le hook `Stop` lance les tests sur l'arbre du dépôt principal : attendre un arbre propre avant de rendre la main quand un producteur y écrit.
- Deux agents dans le même worktree commitent par chemins explicites (`git commit ... -- <chemins>`), jamais `git add -A`.
- Le hook de périmètre juge un fichier depuis la racine du worktree qui le contient ; il refuse toute écriture d'outil hors d'un worktree du dépôt et toute écriture de l'orchestrateur hors de la traçabilité. Une feature par worktree et par branche.
- Fichiers partagés en conflit prévisible à la seconde fusion (`apps/web/test/coutures.test.ts`, `ARCHITECTURE.md`, `ROADMAP.md`, fichiers racine) : chaque fichier en conflit est reposé par son propriétaire.
- Une validation de spec ne vaut que sur la ligne où elle est commitée ; toute retouche la repasse en brouillon.
- Ne rapporter au dev aucun chiffre sans source : la mesure « une fois sur huit » d'AC27 n'existait pas.
- Le hook RTK réécrit certaines commandes Bash et le mode auto ne peut alors pas les évaluer : reformuler la commande, ne pas la réémettre telle quelle.
- Branches d'archive, à ne pas fusionner : `planification-reunie`, `F-008`, `archive-arbre-2026-10-08` (code de F-003 écrit en avance, à reprendre fichier par fichier).
- `fast-check@4.10.2` n'est pas dans la spec F-001 : à entériner par le dev. `.idea/` est exclu par `.git/info/exclude`. Stryker n'est pas installé.

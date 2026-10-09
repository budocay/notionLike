# STATE — notionLike — 2026-10-09

## Où on en est

F-001 (arborescence des pages, `packages/document`), F-002 (application web locale : coquille, barre latérale, persistance IndexedDB) et F-004 (identité visuelle sombre : jetons, application habillée, tiroir sur petit écran) sont DONE et dans `main`. Leurs entrées sont dans `PROJECT_LOG.md` et `MEMORY/features/`. Le dev a vu la page de démonstration de F-004 et répondu « J'aime tout ».

Le 2026-10-09, le dev a étendu le mode rapide à toutes les features (« le mode rapide est valide pour tout ») : spec validée, code écrit directement depuis la spec et la veille, note de conception courte et ADR seulement pour ce qui est difficile à défaire, pas de gate de conception avant le code ; les gates de fin restent. Contrepartie constatée sur F-004 : faire relire la structure par `agent-architecte-conception` avant la revue, et demander au producteur un témoin jetable par critère exposé.

F-008 (socle serveur) est EN COURS dans un second worktree, `~/dev/notionLike-F-008`, branche `F-008-socle` partie de `main` : spec validée (`651991f`). Le hook de périmètre accepte depuis le 2026-10-09 les écritures d'agent dans un worktree de ce dépôt (modification du dev dans `.claude/hooks/cc-adapt.sh`, `test-blocage.sh` vert après la modification : `RESULTAT: tous les blocages sont effectifs`) : deux branches peuvent avancer en même temps, une par worktree.

La planification complète est dans `main` : 30 features et leurs specs (`ROADMAP.md` porte les comptes et l'ordre), `MEMORY/VEILLE.md`. Le statut de chaque spec est celui de sa ligne `Statut :`. Ordre du chemin client après F-004 : F-030 (reprise de la persistance après une coupure, exigée par le dev le 2026-10-09 : « les données doivent être tout le temps persistées »), puis F-003 (éditeur de page, qui livre directement la barre flottante). Le chemin serveur (F-008, F-009, F-011, F-012, puis F-013), qui apporte la base PostgreSQL, commence par F-008 (voir plus haut) ; aucun code serveur n'est encore livré.

Depuis le 2026-10-09, le dev a délégué à l'orchestrateur tous les commits `Agent: dev` (dette D-008) et a accepté d'alléger le parcours : `ARCHITECTURE.md` est aligné après le dernier bloc d'une feature et non après chaque bloc ; F-019, F-020 et F-021 sont reclassées `standard`.

Le dépôt principal (`~/dev/notionLike`) sert au chemin client ; un worktree temporaire (`scratchpad/revue-F-001`, nom hérité de la première revue) sert aux revues.

## Prochaine action prévue

Chemin client, dépôt principal, branche `F-030` : F-030 (reprise de la persistance après une coupure) est validée (`32a7e07`) et en cours de code chez `agent-frontend`, en mode rapide ; ensuite relecture de structure par `agent-architecte-conception`, preuves, documents, revue. Puis F-003.

Chemin serveur, worktree `~/dev/notionLike-F-008` : faire reposer par `agent-architecte-conception` la conception de F-008 et les ADR-0004 à 0006 depuis la branche d'archive `planification-reunie` (`a246106`), recalés sur `main` ; bloc 0 par délégation (script de la conception) ; blocs d'`agent-backend`, `agent-bdd`, `agent-devops` ; relecture de structure, puis revue (`reviewer-devops`, `reviewer-bdd`, `reviewer-backend`, `reviewer-api`, architecture, sécurité, craft).

À faire par l'orchestrateur après la fusion de F-004 : commiter sur `main` la modification du hook sous `Agent: dev` (délégation), faire inscrire le mode rapide pour toutes les features dans `ROADMAP.md` par `agent-planif`.

Règles de revue : code, puis preuves relevées sur le dernier commit de code, puis `MEMORY/features/<F-id>.md`, puis `ARCHITECTURE.md` en dernier, et seulement alors `dossier-revue.sh` et les gates ; aucun commit de code ni de configuration après le réalignement des documents. Trois rejets consécutifs d'un même gate déclenchent l'escalade (code 3), que seul le dev reprend. Avant une fusion : `gates-verts.sh main..HEAD` depuis la branche, lu en entier, puis la fusion dans une commande séparée.

## Dettes ouvertes

- D-001 Pas de CI ni de branche protégée — depuis la génération — impact : les hooks git se contournent par `--no-verify`, pas de `CODEOWNERS` ; à lever dès qu'une plateforme git est choisie.
- D-002 Tests d'intégration du serveur sur PGlite et non sur un PostgreSQL réel — proposée par F-008 (voir `ROADMAP.md`) — pas encore ouverte par le dev.
- D-003 Tests de bout en bout hors des hooks — depuis F-002 — impact : les scénarios Playwright, les captures et `preuve:construction` ne sont tenus que par des relevés à la main dans `MEMORY/features/` ; à lever par le dev en les branchant dans `.agents/outils.env`.
- D-004 Citée par le dev dans deux lignes `REPRISE D-004` de `MEMORY/gates.log` — titre et impact écrits nulle part : à faire décrire par le dev dans `PROJECT_LOG.md`.
- D-005 Rang de longueur non bornée et `rangEntre` récursive — depuis F-001 — impact : une mise à jour forgée peut épuiser la pile ; levée par F-029, obligatoire avant F-012.
- D-006 Rappel d'abonné qui lève, façade sans fermeture — depuis F-001 — levée par F-002 ; à clore par le dev dans `PROJECT_LOG.md`.
- D-007 Vérification des types hors des contrôles du socle — depuis F-001 — impact : `pnpm typecheck` n'est prouvé par aucun `checks.txt` ; à lever par le dev.
- D-008 Commits `Agent: dev` délégués à l'orchestrateur — depuis le 2026-10-09 — impact : le trailer `Agent: dev` ne prouve plus qu'un humain a lu une spec ou un fichier protégé ; à lever par le dev (retirer les règles de `.claude/settings.local.json` ou relire les commits délégués, `git log --grep='délégation explicite du dev'`).

## État des contrôles / gates

Les verdicts font foi dans `MEMORY/gates.log`. F-001 : tous verts sur l'empreinte `ca4cb0d41fe3`. F-002 : tous verts sur l'empreinte `d06344502281`. F-004 : tous verts sur l'empreinte `2fc8bae8471c`. `main` : `gates-verts.sh 275d4ef..main` → `RESULTAT GATES: OK` à la fusion de F-002.

F-004, dernier commit de code `0d0a240` : relevé de l'orchestrateur dans `MEMORY/features/F-004.md` (1078 tests sur 32 fichiers, types, lint, contrats, `preuve:construction`, couverture des critères, bout en bout `46 passed` deux fois, tous en code 0).

UNVERIFIED pour tout gate, parce que hors des contrôles du socle : `pnpm typecheck` (D-007), la construction, le bout en bout et les captures (D-003). Ce sont des relevés à la main.

## Pièges actifs

- Avant de fusionner une branche dans `main`, lancer `.agents/checks/gates-verts.sh main..HEAD` DEPUIS LA BRANCHE, lire toute la sortie, puis fusionner dans une commande séparée. Lancé depuis un worktree placé sur `main`, le script lit la spec de `main` et peut afficher un `FAIL` qui ne concerne pas la branche ; et une commande enchaînée a déjà fusionné sans que la ligne `FAIL` soit lue.
- Un commit de merge fait par `git merge` sans message porte aucun trailer : toujours passer `-m` avec `Agent:` et `Feature:`.
- Aucun commit de code ni de configuration après le réalignement d'`ARCHITECTURE.md` et de `MEMORY/features/<F-id>.md` : le gate d'architecture a rejeté deux fois F-004 pour des documents qui décrivaient un commit antérieur. `ROADMAP.md` ne porte aucun état transitoire : il renvoie aux fichiers qui font foi.
- Le reviewer rejette toute assertion qui ne peut pas échouer et tout contrôle statique sans cas fautif fourni comme donnée : demander au producteur un témoin jetable par critère exposé avant la revue.
- Le hook `Stop` lance les tests sur l'arbre courant : ne pas répondre au dev pendant qu'un producteur écrit du code en arrière-plan, sinon trois lancements sur un arbre intermédiaire déclenchent une escalade.
- Le hook de périmètre juge un fichier depuis la racine du worktree qui le contient, si ce worktree appartient à ce dépôt (modification du dev, `c1df7d8`) : une feature par worktree et par branche, jamais deux sur la même branche. Il refuse toujours toute écriture d'outil hors d'un worktree du dépôt (le scratchpad par exemple) et toute écriture de l'orchestrateur hors de la traçabilité. Le hook `Stop` ne vérifie que le dépôt principal. Les fichiers racine partagés seront en conflit à la seconde fusion : ils se résolvent par leur propriétaire, et la seconde feature repasse ses contrôles après avoir intégré `main`.
- Tout lancement de Playwright, même partiel, vide `apps/web/test-results/` : copier les captures ailleurs avant de les montrer.
- Branches d'archive, à ne pas fusionner : `planification-reunie`, `F-008` (planification, historique détaillé), `archive-arbre-2026-10-08` (arbre de travail du 2026-10-08 : code de F-003 écrit en avance, à reprendre fichier par fichier, sa conception est à refaire) ; `F-001` et `F-002` sont déjà fusionnées.
- Les commits de conception d'une feature exigent tous ses gates avant d'entrer dans `main` : ne jamais les mêler à une branche de planification ni à la branche d'une autre feature.
- Un conflit de fusion résolu par un agent compte comme une écriture de cet agent sur chaque fichier en conflit : faire reposer le fichier par son propriétaire.
- Une validation de spec ne vaut que sur la ligne où elle est commitée, et toute retouche de la spec la repasse en brouillon.
- Avant F-030, l'interface n'affirme jamais « Enregistré » : le code de F-002 passe à l'état actif sur l'évènement `synced` de `y-indexeddb`, émis même si l'écriture échoue (F-030-AC26).
- `fast-check@4.10.2` n'est pas dans la spec F-001 : à entériner par le dev.
- `.idea/` est exclu localement par `.git/info/exclude`, pas par `.gitignore`.
- Un gate dont la ligne de verdict est dans un bloc de code est lu `UNVERIFIED` : relancer le gate.
- Stryker n'est pas installé.

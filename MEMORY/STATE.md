# STATE — notionLike — 2026-10-16

## Où on en est

Dépôt distant : `git@github.com:budocay/notionLike.git`. Sur un clone neuf : `pnpm install --frozen-lockfile` et `git config core.hooksPath .githooks`. Prérequis : Node 26, pnpm 12.10.1, gitleaks, semgrep, trivy (`README.md`).

`main` porte seize features DONE : F-001, F-002, F-004, F-030, F-008, F-003, F-009, F-011, F-029, F-010, F-014, F-027, F-007, F-012, F-013 et F-028 (gras, italique, liens ; version 2 du document de page ; fusion par la PR de la branche `F-028`). Depuis F-008, chacune est acceptée par dérogation du dev (D-014 à D-025) ; leurs restes sont dans « Dette et limites » de `MEMORY/features/<F-id>.md`.

CI GitHub Actions en place depuis le 2026-10-16 (`.github/workflows/ci.yml`, PR #3) : `main` est protégée par un ruleset (PR obligatoire, merge commit seul, checks requis `commits`, `controles`, `typecheck`, `gates`, branche à jour, ni force push ni suppression, aucun contournement) ; squash, rebase et auto-merge désactivés. D-001 levée. Les hooks git restent la première barrière (règle 4) : les retirer demande l'accord du dev.

Alignement fusionné (`2a10b99`) : ROADMAP à jour, `ARCHITECTURE.md` aligné sur F-012 et F-013 ; ADR-0013 (synchronisation serveur), ADR-0014 (synchronisation client) et amendements du 2026-10-16 d'ADR-0001 à 0004, 0007 à 0009, 0012 au statut « proposé », à accepter par le dev.

Pour lancer l'application : `pnpm --filter @notionlike/web dev` (client) ; serveur et base : `infra/` (Docker Compose, `apps/server/.env` au vrai `BETTER_AUTH_SECRET`).

Décisions du dev en vigueur (2026-10-16) : mode économe levé ; plusieurs features en parallèle si leurs dossiers sont disjoints (une branche et un worktree par feature) ; par feature, un passage des gates (relecteurs de la ligne `Revue :`, sécurité, craft), un tour de correctifs, puis dérogation du dev pour ce qui n'est pas rejoué et pour l'architecture. L'orchestrateur fusionne dans `main` par PR (`gh pr create`, puis `gh pr merge --merge` quand les 4 checks sont verts) ; la traçabilité entre dans la branche avant la PR. Commits du dev (dérogations, fichiers protégés) : bloc de commandes complet, poussé par `git push origin HEAD:<branche>` après `git status -sb`. Bout en bout et fumée Docker : commandes données au dev, joués dans son clone (seul à porter `apps/server/.env`).

## Prochaine action prévue

1. Le dev accepte ou refuse ADR-0013, ADR-0014 et les amendements du 2026-10-16.
2. Fumée Docker sur `main` après F-028 (manifeste et lockfile changés) : `cd ~/dev/notionLike && infra/fumee.sh`, depuis la racine.
3. F-005 (bloc code et commandes slash, version 3 du document de page), puis F-006, F-015 ; F-017 seule parallélisable avec F-006 ou F-015 (`ROADMAP.md`). Avant F-015 : le dev tranche F-015 H12 (spec de la part retirée de F-014 d'abord, ou F-015 en l'état). F-015 doit livrer le contrôle d'identité de présence (D-023).
4. Décisions du dev en attente : `hookTimeout` de 30 s dans `apps/web/vitest.config.ts` (huit crochets de `apps/web/test/synchronisation/` démarrent un serveur d'essai sous le délai de 10 s) ; alléger le crochet `Stop` de Claude Code ; retrait des hooks git maintenant que la CI tourne ; panneau d'administration.

## Dettes ouvertes

- D-002 Tests d'intégration du serveur sur PGlite, pas sur PostgreSQL réel — proposée par F-008.
- D-003 Bout en bout, captures et `preuve:construction` hors des hooks et de la CI — depuis F-002.
- D-004 Citée par deux lignes `REPRISE D-004`, à décrire par le dev.
- D-006 Rappel d'abonné qui lève — levée par F-002, à clore par le dev.
- D-007 `pnpm typecheck` hors des hooks — couvert en CI (`typecheck`) depuis le 2026-10-16.
- D-008 Commits `Agent: dev` délégués à l'orchestrateur, sauf fichiers protégés, validations de spec et lignes DEROGATION/REPRISE.
- D-009 Réparation de l'identifiant d'espace par énumération des bases — le registre de F-013 ne la remplace pas.
- D-010 Lecture brute sans borne — depuis F-030.
- D-011 Sonde hors délai qui garde sa connexion — depuis F-008.
- D-013 Relecteurs de F-008 qui soulèvent des points nouveaux à chaque passage.
- D-014 à D-024 Features F-008 à F-013 acceptées par dérogation — restes dans `MEMORY/features/<F-id>.md` ; D-023 : pas de limite de débit sur le passage en WebSocket, présence usurpable jusqu'à F-015, 500 connexions pour tout le serveur ; D-020, D-022 : débordement à 360 px venu de F-014.
- D-025 F-028 acceptée par dérogation après correctifs — depuis le 2026-10-16 — reviewer-frontend non rejoué (relecture de la sélection du navigateur, appliquée à toute frappe, jamais relue), sécurité jugée sur la première empreinte, architecture non lancée.

## État des contrôles / gates

Les verdicts font foi dans `MEMORY/gates.log`. F-028 : sécurité, craft PASS et reviewer-frontend CHANGES_REQUESTED sur `9b376ff9bc97` ; craft PASS sur `61c223f307ae` et `5df7774ce0c4` ; dérogation D-025 sur `5df7774ce0c4` ; 167 fichiers, 3465 tests ; AC30 vert en Chromium sous macOS. `gates-verts.sh main..HEAD` : `RESULTAT GATES: OK`. CI : verte sur la PR #3 et sur `main` (`f3cdaf9`). Bout en bout complet depuis le worktree F-028 : 52 réussis, 1 ignoré, 5 en échec, déjà en échec avant F-028 (F-004-AC50, F-010, F-014-AC40, F-013-AC41 et AC43), probablement faute de serveur dans le worktree : à vérifier sur la pile Docker du dev. Fumée Docker : OK sur `797d708` (2026-10-15).

## Pièges actifs

- Le classifieur de permissions de Claude Code refuse à l'orchestrateur : les fichiers de contrôle (`.agents/**`), les lignes DEROGATION de `gates.log`, les réglages du dépôt par `gh api`. Ces actions passent par un bloc de commandes du dev.
- Plusieurs suites en parallèle sur la machine font dépasser des délais (PGlite) : une seule suite à la fois ; ne pas pousser pendant qu'un agent lance `controles.sh`.
- `main` ne reçoit plus de push direct : tout passe par une PR fusionnée en « Create a merge commit ». Un conflit se résout en local, dans un commit qui porte ses trailers (« Update branch » de GitHub avec résolution est refusé par `commits`).
- Toute correction de code après une revue change l'empreinte : dossier et gates à refaire, et la fumée si `apps/server/src`, `packages/*/src`, les manifestes ou l'infra changent.
- Les agents et l'orchestrateur ne lisent pas les `.env*` ; les valeurs factices sont prouvées par `infra/tests/exemples.test.ts`.
- Deux agents dans le même arbre commitent par chemins explicites, jamais `git add -A`.
- `infra/fumee.sh` se lance depuis la racine du dépôt.
- `.agents/SOCLE.sha256` ne correspond plus à `verifier.sh` (correctif `ee874f0`) ni à `.claude/hooks/cc-adapt.sh` : `test-blocage.sh` le signale en `[INFO]`.
- Branches d'archive, à ne pas fusionner : `planification-reunie`, `F-008`, `archive-arbre-2026-10-08`, `archive-F-008-dernier-tour` ; branches distantes `F-011` et `F-003` : copies de F-010 poussées par erreur.

# STATE — notionLike — 2026-10-16

## Où on en est

Dépôt distant : `git@github.com:budocay/notionLike.git`. Sur un clone neuf : `pnpm install --frozen-lockfile` et `git config core.hooksPath .githooks`. Prérequis : Node 26, pnpm 12.10.1, gitleaks, semgrep, trivy (`README.md`).

`main` porte dix-neuf features DONE : F-001, F-002, F-004, F-030, F-008, F-003, F-009, F-011, F-029, F-010, F-014, F-027, F-007, F-012, F-013, F-028 (gras, italique, liens ; version 2 du document de page) et F-017 (modèle de table dans `packages/document`, ADR-0016 proposée ; fusion par la PR de la branche `F-017`). F-031 (pile Docker de travail en une commande : `pnpm -w pile preparer|demarrer|etat|arreter|accorder`, `pnpm -w fumee` à 17 constats, raisons des refus de configuration, ADR-0017 proposée) fusionnée (PR #6, `f6871c3`). F-006 (glisser-déposer des pages et des blocs, module `apps/web/src/glisser/` sur dnd-kit, ADR-0015 proposée) fusionnée par la PR de la branche `F-006`. En cours : F-005 (bloc code et commandes slash, version 3 du document de page, `../notionLike-F-005`) et F-018 (vue tableau, amendement d'ADR-0002 avant le code, `../notionLike-F-018`), veille et conception lancées. Depuis F-008, chaque feature est acceptée par dérogation du dev (D-014 à D-034) ; leurs restes sont dans « Dette et limites » de `MEMORY/features/<F-id>.md`.

CI GitHub Actions en place depuis le 2026-10-16 (`.github/workflows/ci.yml`, PR #3) : `main` est protégée par un ruleset (PR obligatoire, merge commit seul, checks requis `commits`, `controles`, `typecheck`, `gates`, branche à jour, ni force push ni suppression, aucun contournement) ; squash, rebase et auto-merge désactivés. D-001 levée. Les hooks git restent la première barrière (règle 4) : les retirer demande l'accord du dev.

Alignement fusionné (`2a10b99`) : ROADMAP à jour, `ARCHITECTURE.md` aligné sur F-012 et F-013 ; ADR-0013 (synchronisation serveur), ADR-0014 (synchronisation client) et amendements du 2026-10-16 d'ADR-0001 à 0004, 0007 à 0009, 0012 au statut « proposé », à accepter par le dev.

Pour lancer l'application : `pnpm -w pile preparer` (une fois), `pnpm -w pile demarrer` (base, migration, serveur jusqu'à `/pret` 200), puis `pnpm --filter @notionlike/web dev` sur `http://127.0.0.1:5173` (Chromium ou Firefox ; Safari refuse le cookie `__Secure-` en http). Remise en accord du mot de passe d'un volume ancien : `pnpm -w pile accorder`, jamais `down -v`.

Décisions du dev en vigueur (2026-10-16) : mode économe levé ; plusieurs features en parallèle si leurs dossiers sont disjoints (une branche et un worktree par feature) ; par feature, un passage des gates (relecteurs de la ligne `Revue :`, sécurité, craft), un tour de correctifs, puis dérogation du dev pour ce qui n'est pas rejoué et pour l'architecture. L'orchestrateur fusionne dans `main` par PR (`gh pr create`, puis `gh pr merge --merge` quand les 4 checks sont verts) ; la traçabilité entre dans la branche avant la PR. Commits du dev (dérogations, fichiers protégés) : bloc de commandes complet, poussé par `git push origin HEAD:<branche>` après `git status -sb`. Bout en bout et fumée Docker : commandes données au dev, joués dans son clone (seul à porter `apps/server/.env`).

## Prochaine action prévue

1. Le dev accepte ou refuse ADR-0013, ADR-0014 et les amendements du 2026-10-16.
2. Le dev joue la fumée officielle de F-031 (`pnpm -w fumee`, AC27) et une inscription par `pnpm -w pile demarrer` sur `http://127.0.0.1:5173` en nommant le navigateur (AC28) ; sorties à verser dans `MEMORY/features/F-031.md`. Il tranche le plancher de Compose (2.24.0 ou 2.24.4, D-030).
3. F-005 et F-018 : code en parallèle si leurs fichiers sont disjoints (notes de conception), F-005 par-dessus F-006.
4. Puis F-015, F-016, F-018 (premier appelant du document de table). Avant F-015 : le dev tranche F-015 H12 (spec de la part retirée de F-014 d'abord, ou F-015 en l'état). F-015 doit livrer le contrôle d'identité de présence (D-023).
5. Décisions du dev en attente : `hookTimeout` de 30 s dans `apps/web/vitest.config.ts` (huit crochets de `apps/web/test/synchronisation/` démarrent un serveur d'essai sous le délai de 10 s) ; alléger le crochet `Stop` de Claude Code ; retrait des hooks git maintenant que la CI tourne ; panneau d'administration.

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
- D-018 précisée : GHSA-67mh-4wv8-2f99 (`esbuild` 0.18.20 par `drizzle-kit`, modérée, développement seulement, hors de l'image).
- D-014 à D-024 Features F-008 à F-013 acceptées par dérogation — restes dans `MEMORY/features/<F-id>.md` ; D-023 : pas de limite de débit sur le passage en WebSocket, présence usurpable jusqu'à F-015, 500 connexions pour tout le serveur ; D-020, D-022 : débordement à 360 px venu de F-014.
- D-026 F-017 acceptée par dérogation après correctifs — depuis le 2026-10-16 — reviewer-frontend non rejoué, sécurité jugée sur la première empreinte, architecture non lancée, AC25 n'éprouve que la compilation des paquets dépendants, pas leurs tests.
- D-027 Clé (colonne, option, ligne) à unité UTF-16 isolée forgée par un pair non normalisée : la réplique d'origine lit la clé brute, les autres U+FFFD — depuis F-017 — même défaut sur les titres de page de F-001.
- D-028 Erreur non gérée intermittente sous charge dans `apps/server/test/synchro-document.test.ts` (`fermerLesClients` ferme une WebSocket avant sa connexion) — constatée le 2026-10-16 par le crochet `Stop`, tests tous verts.
- D-034 F-006 acceptée par dérogation après correctifs — depuis le 2026-10-16 — reviewer-frontend non rejoué (lecture seule des fichiers lâchés, poignée active, annonces), architecture non lancée ; annonce de dnd-kit « déposée » après un refus typé, lecture seule réelle non jouée au bout en bout.
- D-035 dnd-kit, ancienne famille (`@dnd-kit/core` 6.3.1) sans publication depuis décembre 2024 — depuis F-006 — confinée dans `apps/web/src/glisser/` (ADR-0015).
- D-029 F-031 acceptée par dérogation après correctifs — depuis le 2026-10-16 — reviewer-devops et reviewer-backend non rejoués, sécurité UNVERIFIED (fumée du dev à verser), architecture non lancée.
- D-030 Compose 2.24.0 à 2.24.3 admises par `pile.sh` sans preuve de `!reset` et `--progress quiet` (seule la 5.6.0 essayée) — depuis F-031 — garde du volume en place ; plancher à trancher par le dev.
- D-031 `PGPASSWORD` dans l'environnement du client `docker` le temps de l'épreuve du mot de passe (CWE-214) — depuis F-031.
- D-032 Origine Playwright `http://127.0.0.1:5174` admise par le serveur sous Compose — depuis F-031 — risque local accepté (H4).
- D-033 Aucun contrôle bash au socle (semgrep ne lit que ts et js) ; shellcheck lancé à la main pour F-031 — l'ajouter à `outils.env` est une décision du dev.
- D-025 F-028 acceptée par dérogation après correctifs — depuis le 2026-10-16 — reviewer-frontend non rejoué (relecture de la sélection du navigateur, appliquée à toute frappe, jamais relue), sécurité jugée sur la première empreinte, architecture non lancée.

## État des contrôles / gates

Les verdicts font foi dans `MEMORY/gates.log` ; le déroulé de chaque feature dans `PROJECT_LOG.md`. Dernières : F-028 (D-025), F-017 (D-026), F-031 (D-029), F-006 (D-034), chacune avec craft PASS sur son empreinte finale et `RESULTAT GATES: OK` avant fusion. CI verte sur chaque PR depuis la #3. Après F-006 : 173 fichiers, 3585 tests sur sa branche. Fumée Docker : OK sur `main` `07b2163` (constats 1 à 11), puis `FUMEE: OK (constats 1 à 17)` par le dev sur F-031. Bout en bout complet : seul F-004-AC50 (débordement à 360 px, D-020) échoue, déjà avant F-006.

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

# STATE — notionLike — 2026-10-16

## Où on en est

Dépôt distant : `git@github.com:budocay/notionLike.git`. Sur un clone neuf : `pnpm install --frozen-lockfile`. Prérequis : Node 26, pnpm 12.10.1, gitleaks, semgrep, trivy (`README.md`).

`main` porte vingt-deux features DONE : F-001, F-002, F-004, F-030, F-008, F-003, F-009, F-011, F-029, F-010, F-014, F-027, F-007, F-012, F-013, F-028, F-017, F-031, F-006, F-005 (bloc code et commandes slash, version 3 du document de page, ADR-0018) et F-033 (coloration et indentation du bloc code, lowlight et highlight.js confinés à `edition/coloration.ts`, gates verts au premier passage) et F-018 (vue tableau : type de page `table`, grille écrite sans bibliothèque, réglages de vue par appareil, document d'espace v2, refus des formes forgées par le serveur et le paquet ; gates tous verts au cinquième passage, après la reprise D-039). En cours : F-032 (veille, conception, spec retouchée et revalidée le 2026-10-21, `../notionLike-F-032`, code à démarrer : intégrer `main`) et F-015 (veille et spec retouchée le 2026-10-22, Hocuspocus 4.7.1, conception en cours, `../notionLike-F-015`). Restes de chaque feature dans « Dette et limites » de `MEMORY/features/<F-id>.md`.

CI GitHub Actions en place depuis le 2026-10-16 (`.github/workflows/ci.yml`, PR #3) : `main` est protégée par un ruleset (PR obligatoire, merge commit seul, checks requis `commits`, `controles`, `typecheck`, `gates`, branche à jour, ni force push ni suppression, aucun contournement) ; squash, rebase et auto-merge désactivés. D-001 levée. Hooks git débranchés le 2026-10-21 sur décision du dev (`core.hooksPath` retiré) : la CI est la seule barrière ; l'orchestrateur passe lui-même les commandes git, commits `Agent: dev` compris, sur instruction du dev.

ADR acceptées le 2026-10-19 après correction de leurs écarts avec le code (PR #8 et F-005) : ADR-0013 à 0018 et les amendements du 2026-10-16. Acceptées le 2026-10-21 et 22 avec F-018 : ADR-0019 (et son complément AC21), amendements F-012 et F-018 d'ADR-0002, amendements F-018 d'ADR-0009 et d'ADR-0016.

Pour lancer l'application : `pnpm -w pile preparer` (une fois), `pnpm -w pile demarrer` (base, migration, serveur jusqu'à `/pret` 200), puis `pnpm --filter @notionlike/web dev` sur `http://127.0.0.1:5173` (Chromium ou Firefox ; Safari refuse le cookie `__Secure-` en http). Remise en accord du mot de passe d'un volume ancien : `pnpm -w pile accorder`, jamais `down -v`.

Décisions du dev en vigueur (2026-10-16) : mode économe levé ; plusieurs features en parallèle si leurs dossiers sont disjoints (une branche et un worktree par feature) ; par feature, un passage des gates (relecteurs de la ligne `Revue :`, sécurité, craft), un tour de correctifs, puis dérogation du dev pour ce qui n'est pas rejoué et pour l'architecture. L'orchestrateur fusionne dans `main` par PR (`gh pr create`, puis `gh pr merge --merge` quand les 4 checks sont verts) ; la traçabilité entre dans la branche avant la PR. Commits du dev (dérogations, fichiers protégés) : bloc de commandes complet, poussé par `git push origin HEAD:<branche>` après `git status -sb`. Bout en bout et fumée Docker : commandes données au dev, joués dans son clone (seul à porter `apps/server/.env`).

## Prochaine action prévue

1. F-032 : intégrer `main` (avec F-018), puis blocs 1 à 8 de sa note de conception ; puis F-015 (code après F-032 : synchronisation d'`apps/web` en commun), F-016.
2. F-018 : au dev, mesure d'une table de 5 000 lignes en navigateur réel (H9) et AC56 contre la pile réelle.
3. F-033 : part manuelle d'AC26 au dev (Entrée au clavier virtuel Android et iPhone, IME).
4. Décisions du dev en attente : plancher de Compose (D-030) ; inscription réelle sur la pile (F-031-AC28, navigateur nommé) ; `hookTimeout` de 30 s dans `apps/web/vitest.config.ts` ; alléger le crochet `Stop` ; shellcheck dans `outils.env` (D-033) ; panneau d'administration ; déplacement d'un bloc vide sur écran étroit (D-037).

## Dettes ouvertes

- D-002 Tests d'intégration du serveur sur PGlite, pas sur PostgreSQL réel — proposée par F-008.
- D-003 Bout en bout, captures et `preuve:construction` hors des hooks et de la CI — depuis F-002.
- D-004 Citée par deux lignes `REPRISE D-004`, à décrire par le dev.
- D-006 Rappel d'abonné qui lève — levée par F-002, à clore par le dev.
- D-007 `pnpm typecheck` hors des hooks — couvert en CI (`typecheck`) depuis le 2026-10-16.
- D-008 Commits `Agent: dev` délégués à l'orchestrateur, sauf fichiers protégés, validations de spec et lignes DEROGATION/REPRISE.
- D-009 Réparation de l'identifiant d'espace par énumération des bases — levée par F-032 (spec en brouillon).
- D-010 Lecture brute sans borne — depuis F-030.
- D-011 Sonde hors délai qui garde sa connexion — depuis F-008.
- D-013 Relecteurs de F-008 qui soulèvent des points nouveaux à chaque passage.
- D-018 précisée : GHSA-67mh-4wv8-2f99 (`esbuild` 0.18.20 par `drizzle-kit`, modérée, développement seulement, hors de l'image).
- D-014 à D-024 Features F-008 à F-013 acceptées par dérogation — restes dans `MEMORY/features/<F-id>.md` ; D-023 : pas de limite de débit sur le passage en WebSocket, présence usurpable jusqu'à F-015, 500 connexions pour tout le serveur ; D-020, D-022 : débordement à 360 px venu de F-014.
- D-025, D-026, D-029, D-034 F-028, F-017, F-031, F-006 acceptées par dérogation du dev après un tour de correctifs (relecteurs non rejoués, architecture non lancée) — restes dans `MEMORY/features/<F-id>.md`.
- D-027 Clé (colonne, option, ligne) à unité UTF-16 isolée forgée par un pair non normalisée : la réplique d'origine lit la clé brute, les autres U+FFFD — depuis F-017 — même défaut sur les titres de page de F-001.
- D-028 Erreur non gérée intermittente sous charge dans `apps/server/test/synchro-document.test.ts` (`fermerLesClients` ferme une WebSocket avant sa connexion) — constatée le 2026-10-16 par le crochet `Stop`, tests tous verts.
- D-039 F-018 reprise par le dev après trois rejets de reviewer-frontend et d'agent-architecte (`f3e03ab`) ; levée : gates tous verts au cinquième passage (`d72717ae7f87`).
- D-036 F-005 reprise par le dev après trois rejets de reviewer-frontend et d'agent-architecte (`42c640f`) ; levée : gates tous verts au passage suivant.
- D-038 `e2e/demonstration.spec.ts` (F-004-AC45 à 360 px) échoue sur `main` : deux conteneurs de démonstration débordent (479 et 589 px pour 326) — constaté par F-018 le 2026-10-21.
- D-037 Sur écran étroit (pas de poignée), un bloc vide ne se déplace qu'au clavier — depuis F-006, constaté par F-005 — afficher la barre sans sélection contredirait F-005-AC6 : retouche de spec à décider.
- D-035 dnd-kit, ancienne famille (`@dnd-kit/core` 6.3.1) sans publication depuis décembre 2024 — depuis F-006 — confinée dans `apps/web/src/glisser/` (ADR-0015).
- D-030 Compose 2.24.0 à 2.24.3 admises par `pile.sh` sans preuve de `!reset` et `--progress quiet` (seule la 5.6.0 essayée) — depuis F-031 — garde du volume en place ; plancher à trancher par le dev.
- D-031 `PGPASSWORD` dans l'environnement du client `docker` le temps de l'épreuve du mot de passe (CWE-214) — depuis F-031.
- D-032 Origine Playwright `http://127.0.0.1:5174` admise par le serveur sous Compose — depuis F-031 — risque local accepté (H4).
- D-033 Aucun contrôle bash au socle (semgrep ne lit que ts et js) ; shellcheck lancé à la main pour F-031 — l'ajouter à `outils.env` est une décision du dev.

## État des contrôles / gates

Les verdicts font foi dans `MEMORY/gates.log` ; le déroulé de chaque feature dans `PROJECT_LOG.md`. F-005 : cinq passages ; au dernier (`d7e7ce6f3984`) reviewer-frontend APPROVED, sécurité, architecture et craft PASS, sans dérogation ; 197 fichiers, 4237 tests ; bout en bout `bloc-code.spec.ts` et `glisser-deposer.spec.ts` verts en Chromium. Avant : F-028 (D-025), F-017 (D-026), F-031 (D-029), F-006 (D-034) par dérogation. CI verte sur chaque PR depuis la #3. Fumée Docker : `FUMEE: OK (constats 1 à 17)` par le dev sur F-031.

## Pièges actifs

- Le classifieur de permissions de Claude Code refuse à l'orchestrateur : les fichiers de contrôle (`.agents/**`), les lignes DEROGATION de `gates.log`, les réglages du dépôt par `gh api`. Ces actions passent par un bloc de commandes du dev.
- Plusieurs suites en parallèle sur la machine font dépasser des délais (PGlite) : une seule suite à la fois ; ne pas pousser pendant qu'un agent lance `controles.sh`.
- `main` ne reçoit plus de push direct : tout passe par une PR fusionnée en « Create a merge commit ». Un conflit se résout en local, dans un commit qui porte ses trailers (« Update branch » de GitHub avec résolution est refusé par `commits`).
- Toute correction de code après une revue change l'empreinte : dossier et gates à refaire, et la fumée si `apps/server/src`, `packages/*/src`, les manifestes ou l'infra changent.
- Les agents et l'orchestrateur ne lisent pas les `.env*` ; les valeurs factices sont prouvées par `infra/tests/exemples.test.ts`.
- Deux agents dans le même arbre commitent par chemins explicites, jamais `git add -A`.
- Une fusion de `main` dans une branche qui bute sur `ARCHITECTURE.md` ou `MEMORY/VEILLE.md` se résout par leur propriétaire (architecte, veille) : le hook de périmètre juge la résolution d'une fusion.
- `.agents/SOCLE.sha256` ne correspond plus à `verifier.sh` ni à `cc-adapt.sh` (`[INFO]` de `test-blocage.sh`).
- Branches d'archive, à ne pas fusionner : `planification-reunie`, `F-008`, `archive-arbre-2026-10-08`, `archive-F-008-dernier-tour` ; branches distantes `F-011` et `F-003` : copies de F-010 poussées par erreur.

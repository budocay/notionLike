# STATE — notionLike — 2026-10-30

## Où on en est

Dépôt : `git@github.com:budocay/notionLike.git`. Clone neuf : `pnpm install --frozen-lockfile`. Prérequis : Node 26, pnpm 12.10.1, gitleaks, semgrep, trivy (`README.md`).

`main` porte vingt-quatre features DONE : F-001, F-002, F-004, F-030, F-008, F-003, F-009, F-011, F-029, F-010, F-014, F-027, F-007, F-012, F-013, F-028, F-017, F-031, F-006, F-005, F-033, F-018, F-032 (dérogation D-040), F-019 (PR #16, dérogation D-043). F-020 (vue kanban) : DONE, PR en cours (5 passages, reprise D-044 levée). Restes de chaque feature dans « Dette et limites » de `MEMORY/features/<F-id>.md`.

En cours, une branche et un worktree `../notionLike-<F-id>` par feature : F-021 calendrier, 3e tour court (`c6a7145`), REPRISE D-046 et correction de H13 attendues du dev ; F-034 (création de lignes linéaire, D-041) : spec en brouillon sur la branche `F-034` (`b75a31b`), en attente pour le lot RC1 ; F-026 courriels et F-023 PWA, conception faite (ADR-0022, 0023 ; ADR-0020), specs revalidées, `main` intégrée dans F-023 ; F-015, conception en cours. Branche locale `rc-1` (jamais poussée) : essai du dev, à remplacer par le tag RC1.

CI GitHub Actions (`.github/workflows/ci.yml`) : `main` protégée par un ruleset (PR obligatoire, merge commit seul, checks `commits`, `controles`, `typecheck`, `gates`, branche à jour, ni force push ni suppression). Hooks git débranchés le 2026-10-21 : la CI est la seule barrière.

ADR acceptées : 0013 à 0019, amendements de F-018 (ADR-0002, 0009, 0016) et de F-032 (ADR-0007, 0008, 0014). À accepter par le dev : ADR-0020 (F-023), ADR-0021 et amendement F-016 d'ADR-0009, ADR-0022, ADR-0023 et amendements F-026 d'ADR-0004, 0006, 0011.

Lancer l'application : `pnpm -w pile preparer` (une fois), `pnpm -w pile demarrer`, puis `pnpm --filter @notionlike/web dev` sur `http://127.0.0.1:5173` (Chromium ou Firefox). Mot de passe d'un volume ancien : `pnpm -w pile accorder` dans le clone principal seulement, jamais `down -v`.

Décisions du dev en vigueur : plusieurs features en parallèle si leurs dossiers sont disjoints ; tours de correctifs puis dérogation du dev ; fusion par l'orchestrateur (`gh pr create`, `gh pr merge --merge` quand les 4 checks sont verts), traçabilité dans la branche avant la PR. Producteurs et veille sur Sonnet ; gates, planif, conception sur le modèle par défaut. Viser une RC1 testable (tag `v0.1.0`), puis un lot de premiers correctifs.

## Prochaine action prévue

1. F-020 : PR, fusion quand les 4 checks sont verts.
2. F-021 : REPRISE D-046 et correction de H13 par le dev, intégrer `main` (avec F-020), brancher F-021-AC25 (« Tri actif ») sur F-019, gates, traçabilité, PR.
3. Tag `v0.1.0` (RC1), puis lot de correctifs : D-042 en premier, D-045, D-040, D-043, D-041 (F-034), socle UNVERIFIED (D-047 réservée), bugs relevés par le dev.
4. F-026, F-023 : ADR acceptées et fichiers protégés commités par le dev (annexes des notes de conception), puis code par blocs ; bloc Compose Mailpit de F-026 livrable.
5. body-parser 2.4.0 (publié après le 2026-10-29 11 h 40 UTC, date passée, à faire) : retrait de l'exception (`auditConfig.ignoreGhsas` de `pnpm-workspace.yaml`, `.trivyignore`).
6. Puis F-015, F-016.
7. Au dev : bout en bout filtres-et-tris, kanban (AC29), calendrier, largeurs, F-032-AC34 ; disposition étroite du calendrier ; `LC_ALL=C sed` dans `controles.sh:32` ; alléger le crochet `Stop` ; F-018 (H9, AC56), F-033-AC26 manuel ; D-030, D-033, D-037 ; F-031-AC28.

## Dettes ouvertes

- D-002 Tests d'intégration du serveur sur PGlite, pas sur PostgreSQL réel — depuis F-008.
- D-003 Bout en bout, captures et `preuve:construction` hors des hooks et de la CI — depuis F-002.
- D-004 Citée par deux lignes `REPRISE D-004`, à décrire par le dev.
- D-006 Rappel d'abonné qui lève — levée par F-002, à clore par le dev.
- D-007 `pnpm typecheck` hors des hooks — couvert en CI depuis le 2026-10-16.
- D-008 Commits `Agent: dev` délégués à l'orchestrateur, sauf fichiers protégés, validations de spec et lignes DEROGATION/REPRISE.
- D-009 Réparation de l'identifiant d'espace par énumération des bases — levée par F-032, à clore par le dev.
- D-010 Lecture brute sans borne — depuis F-030.
- D-011 Sonde hors délai qui garde sa connexion — depuis F-008.
- D-013 Relecteurs de F-008 qui soulèvent des points nouveaux à chaque passage.
- D-014 à D-024 F-008 à F-013 acceptées par dérogation ; D-023 : pas de limite de débit en WebSocket, présence usurpable jusqu'à F-015 ; D-020, D-022 : débordement à 360 px.
- D-018 GHSA-67mh-4wv8-2f99 (`esbuild` 0.18.20 par `drizzle-kit`, modérée, développement seulement).
- D-025, D-026, D-029, D-034 F-028, F-017, F-031, F-006 acceptées par dérogation.
- D-027 Clé de table à unité UTF-16 isolée forgée par un pair non normalisée — depuis F-017.
- D-028 Erreur intermittente sous charge dans `apps/server/test/synchro-document.test.ts`.
- D-030 Compose 2.24.0 à 2.24.3 admises sans preuve — plancher à trancher par le dev.
- D-031 `PGPASSWORD` dans l'environnement du client `docker` (CWE-214) — depuis F-031.
- D-032 Origine Playwright `http://127.0.0.1:5174` admise sous Compose — risque local accepté.
- D-033 Aucun contrôle bash au socle ; shellcheck dans `outils.env` à décider par le dev.
- D-035 dnd-kit ancienne famille, sans publication depuis décembre 2024 — confinée dans `apps/web/src/glisser/`.
- D-036, D-039 Reprises de F-005 et F-018 — levées.
- D-037 Sur écran étroit, un bloc vide ne se déplace qu'au clavier — retouche de spec à décider.
- D-038 `e2e/demonstration.spec.ts` (F-004-AC45 à 360 px) échoue sur `main` — depuis F-018.
- D-040 F-032 par dérogation : AC32 (couture de l'ouverture d'un espace ajouté), AC2 (commande désactivée hors connexion) — lot RC1.
- D-041 `creerLigne` de `@notionlike/document` quadratique (500 lignes 0,3 s, 1 000 1,5 s, 2 000 9,8 s, 4 000 55 s ; cause probable : `lireEtat` complet à chaque `creerLigne`) — spec F-034 en brouillon, lot RC1.
- D-042 Tests de F-032 instables : `espace-ajout.test.tsx` l.144, l.347, l.393 et l.516, `espace-changement.test.tsx` l.353 (focus, annonce ou zone lus sans attente) — lot RC1, en premier.
- D-043 F-019 par dérogation (architecture) : coutures de `ecrireLaValeur`/`validerLeChamp` et du retrait de `LARGEUR_DES_ACTIONS`, non bloquants dans `MEMORY/features/F-019.md` — lot RC1.
- D-045 Tests lents sous charge : `vues-de-table/filtres-et-tris.test.ts` l.289 et `recalcul.test.tsx` l.48 (F-019-AC28), `fenetre.test.tsx` l.151 (F-018-AC47) dépassent 5 s si plusieurs suites tournent ; délai explicite ou référence plus rapide, à trancher par le dev — lot RC1.

## État des contrôles / gates

Verdicts dans `MEMORY/gates.log`, déroulé dans `PROJECT_LOG.md`. F-020 : `controles.sh main` code 0 sur `90d768bf2f44` (5 164 tests) ; passage 5 : reviewer-frontend APPROVED, sécurité, architecture, craft PASS ; D-044 levée. Exception datée du dev (`6677b7b`) : body-parser CVE-2026-111181 / GHSA-27r3-jxmh-p828 ignorée par `pnpm audit` et trivy jusqu'au 2026-10-29 (échue).

## Pièges actifs

- Le classifieur de Claude Code refuse à l'orchestrateur : `.agents/**`, lignes DEROGATION/REPRISE, `gh api` sur les réglages, `git merge` / `git status` dans les worktrees, réécriture d'historique, parfois un push. Jamais de contournement : bloc de commandes au dev.
- Check `commits` : `Agent:`, `Feature:` et `Co-Authored-By:` dans le même dernier paragraphe (trois `--trailer`). `git merge` n'accepte pas `--trailer` : trailers dans un second `-m`.
- Une spec retouchée passe `prettier --check` : un `*` nu dans du texte devient `_` ; mettre les motifs de fichiers entre backticks.
- Un worktree n'a pas les fichiers non suivis : copier `infra/.env` et `apps/server/.env` du clone principal.
- Plusieurs suites en parallèle font dépasser des délais (PGlite, crochet `Stop`) : dossiers l'un après l'autre.
- Toute correction après revue change l'empreinte : dossier et gates à refaire.
- Les agents et l'orchestrateur ne lisent pas les `.env*`.
- Deux agents dans le même arbre commitent par chemins explicites, jamais `git add -A`.
- Conflit sur `ARCHITECTURE.md` ou `MEMORY/VEILLE.md` : résolu par leur propriétaire (architecte, veille).
- Une nouvelle vue de table modifie forcément des tests de F-018 et les listes de coutures : les nommer dans la spec (modèle : F-020-AC27, H12).
- Branches d'archive à ne pas fusionner : `planification-reunie`, `F-008`, `archive-arbre-2026-10-08`, `archive-F-008-dernier-tour` ; distantes `F-011`, `F-003` : copies de F-010.
- Après un redémarrage, la conversation principale peut tourner sous `token-eco:eco`, dont le hook de périmètre refuse Write : la traçabilité passe alors par agent-planif.

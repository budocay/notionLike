# STATE — notionLike — 2026-11-02

## Où on en est

Dépôt : `git@github.com:budocay/notionLike.git`. Clone neuf : `pnpm install --frozen-lockfile`. Prérequis : Node 26, pnpm 12.10.1, gitleaks, semgrep, trivy (`README.md`).

`main` (`5eae856`) porte vingt-huit features DONE : F-001, F-002, F-004, F-030, F-008, F-003, F-009, F-011, F-029, F-010, F-014, F-027, F-007, F-012, F-013, F-028, F-017, F-031, F-006, F-005, F-033, F-018, F-032 (dérogation D-040), F-019 (dérogation D-043), F-020 (PR #17), F-046 (PR #19), F-035 (PR #20, 2026-11-02), F-036 (PR #21, 2026-11-02 ; D-040 résorbée, D-043 réduite et portée par F-050). Restes de chaque feature dans « Dette et limites » de `MEMORY/features/<F-id>.md`.

Décision du dev du 2026-11-02 : zéro dette ouverte. Tout ce qui est accepté est clos au `PROJECT_LOG.md` ; ce qui reste ouvert a une feature (F-034, F-048 à F-056). Les specs F-048 à F-056 sont des brouillons à valider une par une. Le tag `v0.1.0` (RC1) attend F-053 (D-038) ; le dev joue les e2e manuels avant le tag.

En cours, une branche et un worktree `../notionLike-<F-id>` par feature : F-034 (passage à une structure persistante décidé, conception en cours) ; F-021 (REPRISE D-046 et H13 du dev, intégrer `main`) ; F-015, F-026, F-023 (conception faite) ; F-016 ; F-037 à F-045 et F-047 (specs validées, dossiers ouverts). Branche locale `rc-1` (jamais poussée) : essai du dev, à remplacer par le tag.

CI GitHub Actions (`.github/workflows/ci.yml`) : `main` protégée (PR obligatoire, merge commit seul, checks `commits`, `controles`, `typecheck`, `gates`, branche à jour). Hooks git débranchés le 2026-10-21 : la CI est la seule barrière.

ADR : acceptées 0013 à 0019 et les amendements de F-018 et F-032. ADR-0020 à 0023 et les amendements de F-016 (ADR-0009) et F-026 (ADR-0004, 0006, 0011) : acceptées à la fusion de leur feature (décision du 2026-11-02).

Lancer l'application : `pnpm -w pile preparer` (une fois), `pnpm -w pile demarrer`, puis `pnpm --filter @notionlike/web dev` sur `http://127.0.0.1:5173`. Mot de passe d'un volume ancien : `pnpm -w pile accorder` dans le clone principal seulement, jamais `down -v`.

Décisions du dev en vigueur : features en parallèle si leurs dossiers sont disjoints ; tours de correctifs puis dérogation du dev ; fusion par l'orchestrateur (`gh pr create`, `gh pr merge --merge` quand les 4 checks sont verts), traçabilité dans la branche avant la PR. Délai des tests lents : 12 000 ms (F-035 H2, repris par F-054).

## Prochaine action prévue

1. Au dev : valider les specs F-048 à F-056 (une par commit).
2. F-053 en premier (bloque la RC1), puis le tag `v0.1.0` après les e2e manuels du dev.
3. F-034 (conception), F-021 (REPRISE D-046, H13), puis F-037 à F-045 et F-047 ; F-015, F-016, F-023, F-026 (fichiers protégés commités par le dev).
4. Lot de dettes : F-054, F-048, F-050, F-049, F-055, F-056 ; F-051 puis F-052 (le dev commite `ci.yml`).
5. Au dev : règle dependency-cruiser `espaces-par-un-seul-module` ; shellcheck dans `.agents/outils.env` ; `LC_ALL=C sed` dans `controles.sh:32` ; alléger le crochet `Stop` ; e2e manuels (filtres-et-tris, kanban AC29, calendrier, largeurs, F-032-AC34, F-018 H9 et AC56, F-033-AC26, F-031-AC28).

## Dettes ouvertes

Chacune a sa feature ; une dette sans feature est close au `PROJECT_LOG.md`.

- D-002 Tests d'intégration du serveur sur PGlite, pas sur PostgreSQL réel — F-051.
- D-003 Bout en bout, captures et `preuve:construction` hors de la CI — F-052.
- D-010 Lecture brute sans borne, depuis F-030 ; D-050 redistribution du rang non prouvée contre une borne abaissée (part F-029 de l'ancienne D-018) — F-048.
- D-011 Sonde hors délai qui garde sa connexion ; D-023 sans limite de débit au passage en WebSocket, copie du document d'espace à chaque mise à jour, plafond de 500 connexions — F-049 (présence usurpable : F-015).
- D-016 Coutures de `creerApplication`, `lireConfiguration`, variables du service ; D-024 AC41, AC10, AC45 de F-013 — F-056.
- D-020, D-022 Débordement à 360 px de la légende du `Tableau` ; D-037 bloc vide sans poignée sur écran étroit ; D-038 `e2e/demonstration.spec.ts` (F-004-AC45 à 360 px) rouge sur `main`, conteneurs de 479 et 589 px pour 326, origine « depuis F-018 » ou « venu de F-014 » à nommer — F-053, bloquante pour la RC1.
- D-030 Compose 2.24.0 à 2.24.3 admises sans preuve (plancher 2.24.4 si publiée, sinon close) ; D-031 `PGPASSWORD` dans l'environnement du client `docker` — F-055.
- D-043 F-019, réduite par F-036 à ses non-bloquants sans couture (mémoïsation de `triActif`/`triDe`, commentaires périmés de `use-vue-tableau.ts:73` et `BarresDeDefinition.tsx:2-3`, branche `return 0` de `tris.ts:52`) — portée par F-050 (AC11 à AC15). D-040 résorbée par F-036.
- D-041 `creerLigne` quadratique (5 000 lignes : 48 à 52 s) — F-034.
- D-046 Reprise du dev sur F-021 (revue, architecture) — close à la fusion de F-021.
- D-049 Tests lents hors F-035, `beforeAll` de `connexion`, `passe`, `refus` au-delà de 10 s, `adoption.test.ts:33`, `table-abonnement`, `compte-ecrans`, `page-ouverture`, `table-coutures` (crochet `Stop`, charge 40 à 165), cause racine le crochet `Stop` — F-054.

Closes le 2026-11-02 : D-004, D-006 à D-009, D-013, D-014 à D-029 sauf celles citées ci-dessus, D-032 à D-035, D-047, D-048 (détail au journal).

## État des contrôles / gates

Verdicts dans `MEMORY/gates.log`, déroulé dans `PROJECT_LOG.md`. F-035 : tour 5 tout vert, reprise D-042 du dev ; F-046 : tour 3 tout vert. UNVERIFIED listé : aucun. F-036 : tour 3 sur `c438b3923b0c` tout vert, fusionnée (PR #21). Les dossiers des branches F-021, F-034 sont à refaire après intégration de `main`.

## Pièges actifs

- Le classifieur de Claude Code refuse à l'orchestrateur : `.agents/**`, lignes DEROGATION/REPRISE, `gh api` sur les réglages, `git merge` et `git status` dans les worktrees, réécriture d'historique, parfois un push. Jamais de contournement : bloc de commandes au dev.
- Les validations de spec sont toujours un commit `Agent: dev` (une spec par commit, `Feature:` unique) : `perimetre.sh` refuse `specs/` à l'orchestrateur, y compris dans l'historique d'une branche.
- Le crochet `Stop` relance la suite complète sur le clone principal à chaque fin de tour : lancer les dossiers en avant-plan.
- Check `commits` : `Agent:`, `Feature:` et `Co-Authored-By:` dans le même dernier paragraphe (trois `--trailer`). `git merge` n'accepte pas `--trailer` : trailers dans un second `-m`.
- Une spec retouchée passe `prettier --check` : un `*` nu dans du texte devient `_` ; motifs de fichiers entre backticks.
- Un worktree n'a pas les fichiers non suivis : copier `infra/.env` et `apps/server/.env` du clone principal ; personne ne les lit.
- Plusieurs suites en parallèle font dépasser des délais (PGlite, crochet `Stop`) : dossiers l'un après l'autre.
- Toute correction après revue change l'empreinte : dossier et gates à refaire.
- Deux agents dans le même arbre commitent par chemins explicites, jamais `git add -A`.
- Conflit sur `ARCHITECTURE.md` ou `MEMORY/VEILLE.md` : résolu par leur propriétaire (architecte, veille).
- Une nouvelle vue de table modifie forcément des tests de F-018 et les listes de coutures : les nommer dans la spec (modèle : F-020-AC27, H12).
- Branches d'archive à ne pas fusionner : `planification-reunie`, `F-008`, `archive-arbre-2026-10-08`, `archive-F-008-dernier-tour` ; distantes `F-011`, `F-003`.
- Après un redémarrage, la conversation principale peut tourner sous `token-eco:eco`, dont le hook de périmètre refuse Write : la traçabilité passe alors par agent-planif.
- SSH GitHub cassé dans la session : push par HTTPS avec `gh auth git-credential` (jamais de push sans demande du dev).
- Les tests lents portent un délai explicite et un commentaire identique (F-035 ; 12 000 ms depuis le 2026-11-02, F-054) ; une attente se fait par `waitFor` sur l'état observable, jamais par délai fixe.

# STATE — notionLike — 2026-10-30

## Où on en est

Dépôt : `git@github.com:budocay/notionLike.git`. Clone neuf : `pnpm install --frozen-lockfile`. Prérequis : Node 26, pnpm 12.10.1, gitleaks, semgrep, trivy (`README.md`).

`main` porte vingt-cinq features DONE : F-001, F-002, F-004, F-030, F-008, F-003, F-009, F-011, F-029, F-010, F-014, F-027, F-007, F-012, F-013, F-028, F-017, F-031, F-006, F-005, F-033, F-018, F-032 (dérogation D-040), F-019 (dérogation D-043), F-020 (PR #17). F-046 (stabilité de `synchro-document.test.ts`) : DONE, PR en cours ; D-028 levée pour l'erreur non gérée, le délai de 60 s passe en D-048. Restes de chaque feature dans « Dette et limites » de `MEMORY/features/<F-id>.md`.

Lot RC2 en cours, une branche et un worktree `../notionLike-<F-id>` par feature. Dossier à passer : F-035 (code fait, 6 délais à 30 s), puis F-034 (création de lignes linéaire, D-041), F-036, F-040, F-038, F-021 (REPRISE D-046 et H13 du dev). Revues de conception à relancer : F-037, F-043. Conception à revoir : F-042 (veille faite en `43e37e6`), F-044, F-045, F-047. F-039 après F-038, F-041 après F-040. Tag RC2 à la fin. Hors lot : F-026 courriels et F-023 PWA (conception faite, ADR-0020, 0022, 0023), F-015. Branche locale `rc-1` (jamais poussée) : essai du dev.

CI GitHub Actions (`.github/workflows/ci.yml`) : `main` protégée par un ruleset (PR obligatoire, merge commit seul, checks `commits`, `controles`, `typecheck`, `gates`, branche à jour, ni force push ni suppression). Hooks git débranchés le 2026-10-21 : la CI est la seule barrière.

ADR acceptées : 0013 à 0019, amendements de F-018 (ADR-0002, 0009, 0016) et de F-032 (ADR-0007, 0008, 0014). À accepter par le dev : ADR-0020, ADR-0021 et amendement F-016 d'ADR-0009, ADR-0022, ADR-0023 et amendements F-026 d'ADR-0004, 0006, 0011.

Lancer l'application : `pnpm -w pile preparer` (une fois), `pnpm -w pile demarrer`, puis `pnpm --filter @notionlike/web dev` sur `http://127.0.0.1:5173`. Mot de passe d'un volume ancien : `pnpm -w pile accorder` dans le clone principal seulement, jamais `down -v`.

Décisions du dev en vigueur : plusieurs features en parallèle si leurs dossiers sont disjoints ; tours de correctifs puis dérogation du dev ; fusion par l'orchestrateur (`gh pr create`, `gh pr merge --merge` quand les 4 checks sont verts), traçabilité dans la branche avant la PR. Producteurs et veille sur Sonnet ; gates, planif, conception sur le modèle par défaut.

## Prochaine action prévue

1. F-046 : PR, fusion quand les 4 checks sont verts, puis ROADMAP mise à jour sur `main`.
2. Lot RC2, dossiers l'un après l'autre : F-035, F-034, F-036, F-040, F-038, F-021 (intégrer `main`, brancher F-021-AC25 sur F-019) ; puis F-039, F-041 ; relancer les revues de conception F-037, F-043 et revoir F-042, F-044, F-045, F-047. Tag RC2 à la fin.
3. Après F-035 : D-045 (tests lents), D-042, D-040, D-043, D-041, socle UNVERIFIED (D-047 réservée).
4. F-026, F-023 : ADR acceptées et fichiers protégés commités par le dev, puis code par blocs. Puis F-015, F-016.
5. Au dev : bout en bout filtres-et-tris, kanban (AC29), calendrier, largeurs, F-032-AC34 ; `LC_ALL=C sed` dans `controles.sh:32` ; alléger le crochet `Stop` ; F-018 (H9, AC56), F-033-AC26 ; D-030, D-033, D-037 ; F-031-AC28.

## Dettes ouvertes

- D-002 Tests d'intégration du serveur sur PGlite, pas sur PostgreSQL réel — depuis F-008.
- D-003 Bout en bout, captures et `preuve:construction` hors des hooks et de la CI — depuis F-002.
- D-004 Citée par deux lignes `REPRISE D-004`, à décrire par le dev.
- D-006, D-009 Levées par F-002 et F-032, à clore par le dev.
- D-007 `pnpm typecheck` hors des hooks — couvert en CI depuis le 2026-10-16.
- D-008 Commits `Agent: dev` délégués à l'orchestrateur, sauf fichiers protégés, validations de spec et lignes DEROGATION/REPRISE.
- D-010 Lecture brute sans borne — depuis F-030. D-011 Sonde hors délai qui garde sa connexion — depuis F-008.
- D-013 Relecteurs de F-008 qui soulèvent des points nouveaux à chaque passage.
- D-014 à D-024 F-008 à F-013 acceptées par dérogation ; D-023 : pas de limite de débit en WebSocket, présence usurpable jusqu'à F-015 ; D-020, D-022 : débordement à 360 px.
- D-018 GHSA-67mh-4wv8-2f99 (`esbuild` 0.18.20 par `drizzle-kit`, modérée, développement seulement).
- D-025, D-026, D-029, D-034 F-028, F-017, F-031, F-006 acceptées par dérogation.
- D-027 Clé de table à unité UTF-16 isolée forgée par un pair non normalisée — depuis F-017.
- D-028 Erreur non gérée de `synchro-document.test.ts` levée par F-046 ; délai en D-048.
- D-030 Compose 2.24.0 à 2.24.3 admises sans preuve — plancher à trancher par le dev.
- D-031 `PGPASSWORD` dans l'environnement du client `docker` (CWE-214) — depuis F-031.
- D-032 Origine Playwright `http://127.0.0.1:5174` admise sous Compose — risque local accepté.
- D-033 Aucun contrôle bash au socle ; shellcheck dans `outils.env` à décider par le dev.
- D-035 dnd-kit ancienne famille, sans publication depuis décembre 2024 — confinée dans `apps/web/src/glisser/`.
- D-037 Sur écran étroit, un bloc vide ne se déplace qu'au clavier — retouche de spec à décider.
- D-038 `e2e/demonstration.spec.ts` (F-004-AC45 à 360 px) échoue sur `main` — depuis F-018.
- D-040 F-032 par dérogation : AC32 (couture de l'ouverture d'un espace ajouté), AC2 (commande désactivée hors connexion).
- D-041 `creerLigne` de `@notionlike/document` quadratique (1 000 lignes 1,5 s, 4 000 55 s ; cause probable : `lireEtat` complet à chaque appel) — F-034.
- D-042 Tests de F-032 instables : `espace-ajout.test.tsx` l.144, l.347, l.393, l.516, `espace-changement.test.tsx` l.353 (lus sans attente).
- D-043 F-019 par dérogation : coutures de `ecrireLaValeur`/`validerLeChamp` et du retrait de `LARGEUR_DES_ACTIONS`.
- D-045 Tests lents sous charge, à reprendre après F-035 : `vues-de-table/filtres-et-tris.test.ts` l.289 et `recalcul.test.tsx` l.48 (F-019-AC28), `fenetre.test.tsx` l.151 (F-018-AC47) ; relevés sur `main` depuis le 2026-10-30 : `packages/db/test/commande.test.ts:104` (F-008-AC15), `apps/web/test/synchronisation/{adoption,convergence,motifs,refus}.test.ts` (hooks à 10 s), `apps/web/test/edition/commandes.test.tsx` (F-005-AC21), `apps/web/test/edition/convergence-deplacement.test.tsx:113` (F-006-AC22), `packages/document/test/table-contrat.test.ts:203` (F-017-AC25, 60 s), `apps/web/test/barre-du-haut.test.tsx:382` (`waitFor` à 1 s).
- D-048 Dépassement de délai de 60 s de `apps/server/test/synchro-document.test.ts` sous charge, non reproduit en 64 exécutions (D-028, symptôme 2) ; premiers passages sous saturation en échec de `synchro-fermetures.test.ts` (1/8) et `synchro-reponse.test.ts` (4 skipped), sortie perdue, non reproduits en 5/5 — depuis F-046.

## État des contrôles / gates

Verdicts dans `MEMORY/gates.log`, déroulé dans `PROJECT_LOG.md`. F-046 : dossier OK (260/260 fichiers, 5168 tests) ; tour 3 sur `84adfc9c5842` : reviewer-backend APPROVED, sécurité, architecture, craft PASS.

## Pièges actifs

- Le classifieur de Claude Code refuse à l'orchestrateur : `.agents/**`, lignes DEROGATION/REPRISE, `gh api` sur les réglages, `git merge` / `git status` dans les worktrees, réécriture d'historique, parfois un push. Jamais de contournement : bloc de commandes au dev.
- Les validations de spec sont toujours un commit `Agent: dev` : `perimetre.sh` refuse `specs/` à l'orchestrateur, y compris dans l'historique d'une branche.
- Le crochet `Stop` relance la suite complète sur le clone principal à chaque fin de tour de l'orchestrateur : lancer les dossiers en avant-plan.
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

# F-043 — Conception : administrateur d'instance

Date : 2026-10-30
Spec : `specs/F-043.md`, validée, structurel, lue sur la branche `F-043` à `fe29bef` (`main` `a64bf5f`). ADR : **ADR-0024** (proposée) : table dédiée, commande serveur, `deciderEnGestion` distincte de `decider`, contrats de `moi`, de la liste et d'un espace vu par un non-membre. Aucun amendement d'une ADR acceptée : ADR-0011 (better-auth) et ADR-0013 (synchronisation) restent vraies telles quelles.

Note écrite avant le code. `ARCHITECTURE.md` décrit le code de `main` et n'est pas touché ici ; il sera aligné après le code.

**Ordonnancement.** F-043 dépend de F-037 (`main.tsx`, barre latérale) : le code démarre après la fusion de F-037 dans `main`, puis l'intégration de `main` dans `F-043` (bloc 0). `interface/EcranDUnEspace.tsx` est aussi modifié par F-036 : fusionner F-036 d'abord, ou résoudre le conflit au bloc 5 (H8).

## Approche

Trois idées, toutes dans l'ADR-0024 :

1. **Le rôle est une ligne, relue à chaque requête.** Table `administrateur` (migration additive `0003`), lue par `autorisation.ts` seul, jamais mise en cache, jamais transportée par la session. On ne la reçoit que par la commande serveur.
2. **La gestion et le contenu ne passent pas par la même décision.** `decider` (contenu, synchronisation) ne change ni de code ni de type ; `deciderEnGestion` (routes REST d'un espace) rend une issue de plus, `administree`, pour les sept actions d'`ACTIONS_D_ADMINISTRATION` seulement. Le serveur ne peut donc pas ouvrir un document pour un administrateur non membre : aucun chemin de code n'y mène (F-043-AC14).
3. **Le client voit le drapeau, n'en décide rien.** `moi` porte `administrateur` (schéma `schemaMoi`, à part de `schemaCompte` de F-027) ; l'interface montre l'entrée « Administration » et les commandes du droit d'administration ; le serveur refuse tout le reste.

Ce que la conception écarte : colonne sur `user`, plugin « admin » de better-auth, désignation par variable ou par premier compte (ADR-0024) ; un variant de plus dans `Decision` (pris pour « autorisé » par un appelant qui teste les refus) ; `role` facultatif dans `schemaEspace` (il traverserait tout le client) ; montrer le courriel des membres à un administrateur non membre (H6, voir R2).

## Décisions par critère

- **AC1, AC2** : `administrateurs.ts` (`packages/db` et `apps/server`), entrée `administrer.ts`. Ajout idempotent : « déjà administrateur » sort en 0 sans écrire ni journaliser de nouveau (à confirmer, R4). Retrait d'un compte qui n'est pas administrateur : code 1, « Ce compte n'est pas administrateur » (R4). Courriel lu en minuscules, comme better-auth l'enregistre. Test : la commande lancée par un vrai processus `node` contre une base PGlite servie par la fabrique (modèle : `packages/db/test/commande.test.ts`), sortie inspectée (ni mot de passe, ni jeton, ni empreinte, ni courriel).
- **AC3** : test qui parcourt `ROUTES_ESPACES`, `ROUTES_DU_COMPTE`, `ROUTES_D_ADMINISTRATION`, `ROUTES_PUBLIQUES` et les routes montées par l'application de test, et constate qu'aucune n'écrit dans `administrateur` (couture : seuls `administrateurs.ts` de `packages/db` écrit la table, appelé par `apps/server/src/administrateurs.ts` seul).
- **AC4** : cascade ; test dans `packages/db`.
- **AC5, AC6, AC7** : `schemaMoi` ; `comptes.ts` relit la table à chaque appel ; couture qui énumère les consommateurs de `CHEMINS_COMPTES.moi` et de `schemaMoi` dans `apps/web/src` (`compte/moi.ts` seul), dans `apps/server/src` (`comptes.ts` seul), et constate que `schemaCompte` reste celui de `PATCH /api/v1/compte` (F-027) ; client : un 200 sans `administrateur`, ou avec une autre valeur que booléenne, rend `inconnu`.
- **AC8, AC9** : `administration.ts` (serveur) ; 501 espaces créés en base pour `tronque` ; 401 sans session, 403 pour un simple utilisateur, corps de l'enveloppe seul.
- **AC10** : `GET /api/v1/espaces` inchangé ; test : administrateur non membre absent de sa propre liste.
- **AC11, AC12, AC17** : `deciderEnGestion`, contexte de route sans adhésion (réponses de l'ADR-0024) ; `dernier-proprietaire`, quotas, jeton montré une fois : code des routes inchangé ; `action-administrateur` journalisé.
- **AC13** : `POST /api/v1/espaces` inchangé (ne passe pas par l'autorisation).
- **AC14, AC25** : couture des appelants (`decider` : `synchro-acces.ts` ; `deciderEnGestion` : `espaces.ts` ; `estAdministrateur` de `packages/db` : `autorisation.ts`) ; preuve contre le serveur réel de la fabrique : un administrateur non membre qui ouvre `espace:<id>` et `page:<id>:<id>` par la synchronisation reçoit le refus d'ouverture de F-012, sans connexion gardée ; base coupée pendant `deciderEnGestion` : 503.
- **AC15** : rien de neuf : invitation puis acceptation, chemins de F-011 et F-014 ; test de bout en bout du serveur.
- **AC16** : retrait d'un administrateur : aucune fermeture (test : une connexion de synchronisation tenue par l'administrateur comme membre d'un autre espace reste ouverte).
- **AC18 à AC21** : `#/administration` (`navigation/route.ts`, `EcranDEspaces` gagne `{ ecran: "administration" }`), écran montré par `navigation-espaces.ts` seulement si l'état est `connecte` avec `administrateur: true`, sinon la route des pages, donc « Page introuvable » sans requête ; `EcranDAdministration.tsx` ; `EcranDUnEspace.tsx` et son contexte (`contexte-espace.ts`) lisent l'espace par `compte.administration` quand le compte est administrateur et la lecture ordinaire est « introuvable » ; mention d'AC20 ; commandes du droit d'administration (`commandes-espaces.ts`, liste `COMMANDES_D_ADMINISTRATION` déduite d'`ACTIONS_D_ADMINISTRATION`, réexportée par `compte/regles-espaces.ts` : `interface/` n'importe pas les contrats) ; ni « Quitter », ni « Ouvrir cet espace », ni éditeur ; hors ligne : F-014-AC29 ; stockage énuméré après la visite.
- **AC22** : test qui rejoue la matrice (trois rôles, dix actions, non-membre) pour un simple utilisateur sur `deciderEnGestion` et `decider`, et constate les mêmes issues que `decider` avant F-043 (table attendue écrite dans le test, comme `droits.test.ts` l.351).
- **AC23** : jeu `packages/db/test/migrations-essai/etat-f-012/` (nouveau : journal et migrations `0000` à `0002`), base peuplée, `0003` appliquée par la commande, lignes inchangées ; PGlite sous `pnpm test` ; PostgreSQL hors des hooks (D-002), par le dev.
- **AC24** : `e2e/administration.spec.ts` ; C est désigné par la commande (`pnpm --filter @notionlike/server administrateur:ajouter <courriel>`, lancée par le test sur la pile de F-031 ; le fichier d'environnement est lu par `node`, jamais par le test) ; joué par le dev (D-003).
- **AC26** : identifiants seulement ; test sur les lignes du journal d'un scénario complet (aucun courriel, nom ni jeton).

## Plan par blocs (un commit par bloc)

0. Orchestrateur : fusion de `main` (avec F-037, et F-036 si elle est fusionnée) dans `F-043`. Le dev commite les scripts de l'annexe dans `apps/server/package.json` (avant le bloc 3, qui les emploie).
1. **`agent-bdd` — `packages/db`** : `schema.ts` (table), `migrations/0003_administrateurs.sql`, `meta/0003_snapshot.json`, `meta/_journal.json`, `descentes/0003_administrateurs.sql`, `src/administrateurs.ts`, `src/espaces.ts` (`listerLesEspacesDeLInstance`, `lireLEspace`), `src/index.ts`. Tests nouveaux : `administrateurs.test.ts`, `administrateurs-migration.test.ts` (AC23, jeu `etat-f-012`, descente), `couture-administrateurs.test.ts` (un seul module d'`apps/server/src` importe chaque fonction de la table). Tests modifiés : `structure.test.ts`, `documents-migration.test.ts` (voir la liste).
2. **`agent-backend` — `packages/contrats`** : `comptes.ts` (`schemaMoi`), `espaces.ts` (`ACTIONS_D_ADMINISTRATION`, `schemaEspaceSansAdhesion`), `administration.ts`, `index.ts`. Test nouveau : `administration.test.ts` (schémas stricts, sous-ensemble d'`ACTIONS`, route protégée, plafond). Aucun test existant modifié.
3. **`agent-backend` — `apps/server`, autorisation et commande** : `autorisation.ts` (`deciderEnGestion`, `estAdministrateurDeLInstance`), `journal.ts`, `administrateurs.ts`, `administrer.ts`. Tests nouveaux : `administrateurs-commande.test.ts` (AC1, AC2, AC26), `administration-droits.test.ts` (AC14 couture, AC22, AC25 base coupée). Tests modifiés : `coutures.test.ts` (F-031-AC14 : `administrer.ts` touche `process`).
4. **`agent-backend` — `apps/server`, routes** : `espaces.ts` (`deciderEnGestion`, contexte sans adhésion, réponses, journal ; `accueillir` exporté), `administration.ts`, `comptes.ts` (`moi`), montage dans `application.ts`. Tests nouveaux : `administration.test.ts` (AC5, AC8 à AC13, AC17), `administration-synchro.test.ts` (AC14 et AC16 contre le serveur réel), `administration-routes.test.ts` (AC3). Tests modifiés : `connexion.test.ts`, `couture-espaces.test.ts`, `gestion-du-compte.test.ts`, `aides-comptes.ts`, `coutures.test.ts` (imports par fichier).
5. **`agent-frontend` — `apps/web`** : `compte/{moi,client-administration,client-espaces,index,regles-espaces}.ts`, `navigation/route.ts`, `interface/{EcranDAdministration,Application,EcranDUnEspace,ActionsDeLEspace,MembresDeLEspace,InvitationsDeLEspace}.tsx`, `interface/{navigation-espaces,contexte-espace,commandes-espaces,messages-espaces}.ts`, `main.tsx` si l'assemblage du compte y vit. Tests nouveaux : `administration-client.test.ts` (AC6 : drapeau absent ou mal typé → `inconnu` ; 200 sans rôle → « introuvable » pour `lireEspace` et `renommerEspace`), `administration-ecran.test.tsx` (AC18 à AC21), `administration-coutures.test.ts` (AC6 : consommateurs de `moi` ; appelants de `compte.administration`). Test modifié : `aides-compte.tsx` (`moi200`).
6. **`agent-frontend` — bout en bout** : `e2e/administration.spec.ts` (AC24), ignoré sans serveur.
7. `agent-architecte-conception` : `ARCHITECTURE.md` aligné sur le code livré (modules des trois paquets et d'`apps/server`, flux d'autorisation, menaces), après le code.

## Tests d'autres features modifiés, confrontés à la liste fermée de H7

Constat par lecture d'`origin/main` `a64bf5f` le 2026-10-30.

Dans la liste de H7 :

- `apps/server/test/connexion.test.ts` (« tests de `GET /api/v1/moi` ») : F-009-AC10 l.275 à l.291 (corps strict, clés exactes : `administrateur` s'ajoute).
- `apps/web/test/aides-compte.tsx` : `moi200` (l.50) répond par `schemaMoi`, `administrateur: false` par défaut, deuxième paramètre pour `true` ; `COMPTE` (l.26) reste un `Compte`. Tous les tests qui simulent `moi` passent par `moi200` (`compte-suivi`, `compte-zone`, `compte-ecrans`, `gestion-du-compte-*`, `espaces-*`, `espace-*`, `synchronisation-ecrans`, et les aides `aides-espaces.tsx`, `aides-onglet.tsx`, `aides-ecrans-des-espaces.tsx`, `aides-gestion-du-compte.tsx`) : non modifiés. L'état `connecte` d'un simple utilisateur garde sa forme (`{ statut, id, nom }`) : `compte-suivi.test.ts` (l.21, `CONNECTE`) passe tel quel.
- `apps/server/test/droits.test.ts` et `apps/web/test/compte-client.test.ts` : nommés par H7, **non modifiés** (cas nouveaux dans des fichiers nouveaux ; `droits.test.ts` l.140 lit les routes montées par `arrayContaining` et l.142 n'exige qu'une session sur toute route non publique, ce que la route nouvelle respecte).
- `packages/contrats` : H7 prévoyait la retouche du test de forme de `moi` et de `ROUTES_ESPACES` : **aucune** (`schemaMoi` et `ROUTES_D_ADMINISTRATION` sont neufs, testés dans un fichier neuf ; `schemaCompte` et `ROUTES_ESPACES` inchangés).

Hors de la liste, nécessaires (retouche de H7, voir R1) :

- **E1** `apps/server/test/aides-comptes.ts` : `compteDe` (l.193) lit `schemaMoi` et rend le `Compte` sans le drapeau ; sans cela `connexion.test.ts` l.84 et `session.test.ts` l.434 lèvent (schéma strict).
- **E2** `apps/server/test/couture-espaces.test.ts` : F-011-AC33, l.107 (`schemaCompte.parse` du corps de `moi`, clés exactes).
- **E3** `apps/server/test/gestion-du-compte.test.ts` : F-027-AC1, l.113 (`schemaCompte.parse` du corps de `moi`).
- **E4** `apps/server/test/coutures.test.ts` : F-008-AC23 et suivants, l.43 et l.120 (noms importés de `@notionlike/contrats` et de `@notionlike/db` par fichier d'`apps/server/src` : `autorisation.ts`, `comptes.ts`, `espaces.ts`, `journal.ts` changent, `administration.ts`, `administrateurs.ts` et `administrer.ts` s'ajoutent) ; F-031-AC14, l.405 (fichiers qui touchent `process` : `administrer.ts` s'ajoute).
- **E5** `packages/db/test/structure.test.ts` : F-008-AC17 et suivants, l.105 (noms exacts de l'entrée publique : quatre ou cinq de plus).
- **E6** `packages/db/test/documents-migration.test.ts` : F-012-AC28, l.60 et l.125 (tables publiques après la montée complète, sans filtre : `administrateur` s'ajoute ; ou filtre aux tables de F-011 et F-012, comme `comptes.test.ts` l.57 et `espaces-migration.test.ts` l.65).

Constatés inchangés (filtrés ou indépendants du nombre de migrations) : `packages/db/test/{comptes,espaces-migration,migration,couture-comptes,couture-espaces,couture-documents}.test.ts` ; à reconstater par `agent-bdd` au bloc 1 en lançant la suite (le journal lu par `SUIVI_APRES_MONTEE` gagne une entrée sans changer d'assertion). `apps/server/test/{session,routes-comptes,debit,couture-gestion-du-compte,gestion-du-compte-debit-journal,synchro-*}.test.ts` : statuts seuls, ou `schemaCompte` de `PATCH /api/v1/compte`. `apps/web` : tests de F-013, F-014 et F-032 non modifiés (un simple utilisateur ne voit rien de neuf ; `EcranDUnEspace` d'un membre inchangé).

## Fichiers

Nouveaux : `packages/db/src/administrateurs.ts`, `packages/db/migrations/0003_administrateurs.sql`, `packages/db/migrations/meta/0003_snapshot.json`, `packages/db/descentes/0003_administrateurs.sql`, `packages/db/test/migrations-essai/etat-f-012/**` ; `packages/contrats/src/administration.ts` ; `apps/server/src/{administration,administrateurs,administrer}.ts` ; `apps/web/src/compte/client-administration.ts`, `apps/web/src/interface/EcranDAdministration.tsx` ; les tests nommés au plan.

Modifiés : `packages/db/src/{schema,espaces,index}.ts`, `packages/db/migrations/meta/_journal.json` ; `packages/contrats/src/{comptes,espaces,index}.ts` ; `apps/server/src/{autorisation,espaces,comptes,journal,application}.ts` ; `apps/web/src/compte/{moi,client-espaces,index,regles-espaces}.ts`, `apps/web/src/navigation/route.ts`, `apps/web/src/interface/{Application,EcranDUnEspace,ActionsDeLEspace,MembresDeLEspace,InvitationsDeLEspace}.tsx`, `apps/web/src/interface/{navigation-espaces,contexte-espace,commandes-espaces,messages-espaces}.ts`.

Non touchés : `apps/server/src/{synchronisation,synchro-acces,synchro-relais,synchro-stockage,synchro-reglages,adhesions,authentification}.ts` (F-043-AC14, H4), `apps/web/src/synchronisation/**`, `apps/web/src/espace/**`, `apps/web/src/persistance/**`, `infra/**`, `.dependency-cruiser.cjs`, `eslint.config.mjs`, `vitest.config.*`, `pnpm-lock.yaml`.

Dépendances : aucune (H10). Contrats de dépendances : aucun changement : `apps/server/src` importe l'entrée publique de `db` et de `contrats` (`serveur-liste-blanche`) ; `compte/` importe l'entrée publique de `contrats` (`web-compte-liste-blanche`) ; `interface/` importe `compte/` et `navigation/`.

## Retouches de spec à proposer au dev (spec non modifiée)

- **R1 (H7)** : ajouter E1 à E6 à la liste fermée ; retirer de la liste ce qui ne change pas (`droits.test.ts`, `compte-client.test.ts`, tests de `packages/contrats`), ou les y laisser comme plafond.
- **R2 (AC11, AC19, H6, à confirmer)** : un administrateur non membre reçoit la liste des membres **sans courriel** (vue d'un éditeur ou d'un lecteur), et le changement de rôle lui rend le membre sans courriel. Raison : H6 met hors périmètre « voir les courriels de comptes sans espace commun ». Conséquence : il reconnaît les membres par leur nom seul. L'autre lecture (vue d'un propriétaire, courriels compris) est un changement d'une ligne au serveur, si le dev la préfère.
- **R3 (vocabulaire, AC12, à confirmer)** : un administrateur **membre** d'un espace avec un rôle qui ne permet pas l'action (par exemple `lecteur` qui renomme) reçoit lui aussi le droit d'administration pour les sept actions ; à la lettre, la spec ne le dit que pour un non-membre, ce qui ferait d'un administrateur lecteur un administrateur moindre qu'un administrateur absent. Proposition : « sur tout espace, que l'administrateur en soit membre ou non ». `quitter-espace`, `lire-contenu`, `ecrire-contenu` restent ceux de son rôle.
- **R4 (AC1)** : préciser les deux cas limites de la commande : ajouter un administrateur déjà inscrit (proposé : code 0, aucune écriture ni journal) ; retirer un compte qui n'est pas administrateur (proposé : code 1, « Ce compte n'est pas administrateur »).
- **R5 (AC8, information)** : « ordre stable (nom, puis identifiant) » est tenu en collation `"C"` (ordre des codes, identique sur PGlite et PostgreSQL) ; l'écran peut retrier pour l'affichage.
- **R6 (AC9, information)** : la route d'administration vérifie l'origine même en `GET`, comme toutes les routes d'espace (`accueillir`) ; AC9 parle des « routes à effet ».

## Menaces propres à F-043

- **Élévation par le client** : le drapeau de `moi` ne décide rien ; chaque requête relit la table (AC7, AC25). Une marque forgée côté client montre au plus une entrée qui mène à un 403.
- **Accès au contenu d'un autre espace par l'administrateur** : la synchronisation ne connaît que `decider` ; `deciderEnGestion` n'est jamais appelée pour `lire-contenu` ou `ecrire-contenu` (type et couture, AC14) ; preuve contre le serveur réel.
- **Désignation détournée** : aucune route n'écrit la table (AC3, test) ; seule la commande, lancée par qui tient le serveur, le fait ; l'inscription ouverte (H4) ne donne aucun rôle.
- **Base indisponible** : refus, jamais accès par défaut (503).
- **Fuite par la liste** : 403 sans corps révélateur pour un simple utilisateur ; courriels non montrés à un non-membre (R2) ; journal à identifiants seulement (AC26).
- **Administrateur retiré** : le retrait vaut dès la requête suivante (relecture) ; il ne tenait aucune connexion au titre du rôle (AC16).
- **Invitation rejouée** : inchangé (jeton haché, un seul dénouement, F-011) ; l'administrateur qui s'invite laisse une trace (`action-administrateur`, `invitation-creee`, `invitation-acceptee`, liste des membres).
- **Mise à jour forgée ou géante, contenu de page piégé, membre retiré qui garde une copie locale** : inchangés (F-012, F-011 H2) ; un administrateur retiré d'un espace qu'il avait adopté reçoit 200 sans rôle à la lecture de l'espace, que le client traite comme le 404 d'un ancien membre (« Ne se synchronise plus avec ce compte »).

## Annexe : fichiers partagés que le dev commite

`apps/server/package.json` (partagé ; les clés `test`, `lint`, `format`, `typecheck` ne changent pas), deux scripts ajoutés dans `scripts`, après `demarrer` :

```json
    "demarrer": "node --env-file=.env src/main.ts",
    "administrateur:ajouter": "node --env-file=.env src/administrer.ts ajouter",
    "administrateur:retirer": "node --env-file=.env src/administrer.ts retirer"
```

Emploi : `pnpm --filter @notionlike/server administrateur:ajouter alice@exemple.fr`. Dans le conteneur de la pile : `docker compose exec serveur node apps/server/src/administrer.ts ajouter alice@exemple.fr` (l'environnement du conteneur tient lieu de `.env`). Une ligne dans `README.md` (partagé) est à décider par le dev.

Aucun changement de `.dependency-cruiser.cjs`, d'`eslint.config.mjs`, de `vitest.config.*`, de `playwright.config.ts`, de `pnpm-lock.yaml`.

# ADR-0024 — Administrateur d'instance : table dédiée, commande serveur, décision de gestion distincte de celle du contenu

Statut : proposé
Date : 2026-10-30

## Contexte et problème

F-043 (`specs/F-043.md`, validée) crée un rôle global : un administrateur voit tous les espaces du serveur et les gère (renommage, suppression, membres, rôles, invitations) sans en être membre, mais n'en lit pas le contenu (H3, option A). Quatre choix sont difficiles à défaire : où vit le rôle (H2), comment on le reçoit (H1), comment l'autorisation l'applique sans l'étendre à la synchronisation (F-043-AC14, AC25), et ce que les contrats montrent au client (`GET /api/v1/moi`, routes d'un espace vues par un non-membre, nouvelle liste).

Contraintes héritées : un seul module du serveur décide (`apps/server/src/autorisation.ts`, F-011-AC9, AC32), droits relus en base à chaque requête (F-011-AC28) ; la synchronisation ouvre un document d'après l'adhésion seule (F-012-AC5, AC6, ADR-0013) ; les tables de better-auth ne sont pas retouchées (F-009 H2, ADR-0011) ; les schémas de `packages/contrats` sont stricts (ADR-0004) ; l'inscription reste ouverte (H4).

## Options étudiées

Représentation (H2) :

- (a) Colonne sur `user` : touche le schéma natif de better-auth (ADR-0011), et chaque lecture de session porterait le drapeau.
- (b) Plugin « admin » de better-auth : routes nouvelles à fort périmètre (bannissement, usurpation), contraire à F-043-AC3.
- (c) **Table dédiée `administrateur`**, une ligne par compte, clé étrangère vers `user` en cascade. Retenue.

Désignation (H1) : premier compte créé, variable d'environnement, ou **commande serveur** (retenue : explicite, journalisée, possible sur une instance déjà peuplée, aucune surface réseau).

Extension de l'autorisation :

- (i) Étendre `decider` : la synchronisation l'appelle (`synchro-acces.ts`, à l'ouverture et à la réévaluation) ; un variant de plus dans son union `Decision` serait pris pour « autorisé » par tout appelant qui teste `introuvable` puis `refusee` et laisse passer le reste.
- (ii) **Une seconde fonction, `deciderEnGestion`, au type de retour distinct**, appelée par les seules routes REST d'un espace ; `decider` et son type restent ceux de F-011. Retenue : la séparation est tenue par le type et énumérée par un test de couture (F-043-AC14).

Contrat de `moi` : (α) ajouter `administrateur` à `schemaCompte` : ce schéma est aussi la réponse de `PATCH /api/v1/compte` (F-027), qui devrait porter le drapeau ; (β) **un schéma `schemaMoi`**, `schemaCompte` plus `administrateur`, pour `GET /api/v1/moi` seul. Retenue (β).

Réponses d'un espace vu par un administrateur non membre : (α) rendre `role` facultatif dans `schemaEspace` : tout le client (F-013, F-014, F-032) recevrait `Role | undefined` ; (β) **un schéma à part, `schemaEspaceSansAdhesion`**, pour `GET` et `PATCH /api/v1/espaces/:idEspace` quand le demandeur n'est pas membre. Retenue (β).

## Décision

### Données (`packages/db`)

- Table `administrateur` : `idCompte` `uuid` clé primaire, clé étrangère vers `user.id` `on delete cascade` (F-043-AC4), `creeLe` `timestamp with time zone` non nul, par défaut `now()`. Migration additive `migrations/0003_administrateurs.sql` (générée par `drizzle-kit`, avec `meta/0003_snapshot.json` et son entrée du journal), descente `descentes/0003_administrateurs.sql` (supprime la table et la ligne de suivi ; à lancer avant `0002`, `0001` et `0000`). Aucune ligne existante n'est touchée, aucun compte n'est administrateur après elle (F-043-AC23).
- Module `src/administrateurs.ts` : `estAdministrateur(db, idCompte)` (un UUID non canonique rend `false` sans requête), `ajouterAdministrateur(db, courriel)` et `retirerAdministrateur(db, courriel)`, qui cherchent le compte par son courriel en minuscules (contrainte `user_email_minuscules`) et rendent leur issue en valeur (`ajoute` | `deja-administrateur` | `compte-inconnu` ; `retire` | `pas-administrateur` | `compte-inconnu`) avec l'identifiant du compte, jamais le courriel ; insertion `on conflict do nothing` (idempotent, AC1).
- `src/espaces.ts` : `listerLesEspacesDeLInstance(db, { idCompte, plafond })` (tous les espaces, nombre de membres et de propriétaires, rôle de `idCompte` s'il est membre, tri `nom` en collation `"C"` puis identifiant, `plafond + 1` lignes lues pour dire `tronque`) et `lireLEspace(db, idEspace)` (identifiant et nom, `undefined` pour un espace absent ou un identifiant non canonique).
- Erreurs réduites à `ErreurBase` `requete-echouee` (`sansFuite`), comme les autres requêtes.

### Contrats (`packages/contrats`)

- `comptes.ts` : `schemaMoi`, objet strict `{ id, nom, courriel, administrateur: boolean }`, type `Moi`. `schemaCompte` inchangé (F-027).
- `espaces.ts` : `ACTIONS_D_ADMINISTRATION`, liste fermée des sept actions du droit d'administration (`lire-espace`, `lister-membres`, `renommer-espace`, `supprimer-espace`, `inviter`, `retirer-membre`, `changer-role`), sous-ensemble typé d'`ACTIONS` ; `schemaEspaceSansAdhesion`, objet strict `{ idEspace, nom }`. `ACTIONS`, `MATRICE_DES_DROITS`, `ROUTES_ESPACES` et `CODES_ERREUR` ne changent pas.
- `administration.ts` (nouveau) : `CHEMINS_D_ADMINISTRATION` (`espaces` : `/api/v1/administration/espaces`), `ROUTES_D_ADMINISTRATION` (une route `GET`, protégée), `PLAFOND_DE_LA_LISTE_D_ADMINISTRATION` (500), `schemaEspaceDeLInstance` (strict : `idEspace`, `nom`, `membres` entier positif, `proprietaires` entier positif ou nul, `role` facultatif) et `schemaListeDAdministration` (strict : `espaces`, 500 au plus, `tronque`).
- Aucune route, nulle part, n'écrit dans `administrateur` (F-043-AC3).

### Serveur (`apps/server`)

- `autorisation.ts` reste le seul module qui décide, et devient le seul qui lit la table `administrateur` :
  - `decider(base, demande)` : inchangé, type `Decision` inchangé ; appelé par la synchronisation seule.
  - `deciderEnGestion(base, demande): Promise<DecisionDeGestion>`, où `DecisionDeGestion = Decision | { issue: "administree"; espace: { idEspace; nom }; adhesion: EspaceDuMembre | undefined }`. Ordre : adhésion ; rôle permis par la matrice → `autorisee` sans lire la table ; action hors d'`ACTIONS_D_ADMINISTRATION` → issue de `decider` ; sinon `estAdministrateur` relu en base ; non → issue de `decider` ; oui → `lireLEspace` (absent → `introuvable`) puis `administree`. Une lecture en échec lève, comme aujourd'hui : 503 `base-indisponible`, aucun accès par défaut (F-043-AC25).
  - `estAdministrateurDeLInstance(base, idCompte)` : pour `moi` et la liste.
- `espaces.ts` : les routes d'un espace appellent `deciderEnGestion`. Le contexte d'une route porte `espace` (identifiant, nom) et `adhesion` (absente pour un administrateur non membre). Un non-membre administrateur reçoit `schemaEspaceSansAdhesion` sur `GET` et `PATCH` d'un espace, la liste des membres sans courriel (`schemaListeMembres`) et, sur un changement de rôle, le membre sans courriel (`schemaMembre`) : le courriel d'un compte sans espace commun n'est pas montré (H6). Chaque décision `administree` est journalisée `action-administrateur` (action, identifiant de l'espace, identifiant du compte) avant le traitement, puis l'événement ordinaire de la route s'il aboutit. Les règles de F-011 (dernier propriétaire, quotas, jeton montré une fois) sont celles des routes, inchangées.
- `administration.ts` (nouveau) : `GET /api/v1/administration/espaces` : session (401), origine (comme les routes d'espace), administrateur (sinon 403 `acces-refuse`, sans corps qui révèle un espace), puis la liste.
- `comptes.ts` : `GET /api/v1/moi` répond par `schemaMoi`, le drapeau relu en base à chaque requête (aucun cache) ; une base indisponible donne 503.
- `journal.ts` : type `action-administrateur` (avec `action`), et `evenementDAdministrateur({ type: "administrateur-ajoute" | "administrateur-retire", idCompte })` ; identifiants seulement (F-043-AC26).
- Commande : `src/administrer.ts` (entrée : `process.argv`, `lireConfiguration(process.env)`, `ouvrirBase`, fermeture, `process.exitCode`) appelle `administrer(base, journal, ordre, courriel)` de `src/administrateurs.ts`, qui rend le code de sortie : 0 (ajouté, déjà administrateur, retiré), 1 (« Aucun compte avec ce courriel », « Ce compte n'est pas administrateur », ordre inconnu), 1 sur une erreur de base (phrase fixe). Elle n'écrit ni mot de passe, ni jeton, ni empreinte, ni courriel dans le journal (AC2). Scripts `administrateur:ajouter` et `administrateur:retirer` d'`apps/server/package.json` ; dans le conteneur : `node apps/server/src/administrer.ts ajouter <courriel>`.
- La synchronisation (`synchronisation.ts`, `synchro-acces.ts`, `synchro-*.ts`) n'est pas modifiée.

### Client (`apps/web`)

- `compte/moi.ts` lit `schemaMoi` : un drapeau absent rend l'état `inconnu` (F-043-AC6). L'état `connecte` porte `administrateur: true` pour un administrateur, et rien pour un autre compte : la forme de l'état d'un simple utilisateur ne change pas.
- `compte/client-administration.ts` (nouveau, propriété facultative `administration` de `Compte`) : la liste, la lecture et le renommage d'un espace vus en administration (union `schemaEspace | schemaEspaceSansAdhesion`). Les méthodes de `client-espaces.ts` gardent leur contrat : une réponse 200 sans rôle y vaut « introuvable », comme le 404 d'un non-membre, pour que l'adoption, la synchronisation (F-013) et l'ajout à l'appareil (F-032) d'un administrateur retiré d'un espace le traitent en ancien membre et non en échec passager.
- Le drapeau ne sert qu'à montrer ou masquer (F-043-AC7) ; aucune décision du client ne s'y fie.

## Conséquences

- Deux fonctions de décision coexistent ; leur partage est tenu par le type (`decider` ne peut rendre `administree`) et par un test de couture qui énumère les appelants : `decider` par la synchronisation (et la présence de F-015 si elle l'appelle), `deciderEnGestion` par les routes d'espace seules.
- Une requête de plus par appel de `moi`, et par route d'espace quand le rôle ne suffit pas ; aucune quand il suffit.
- Les tests qui fixent la forme de `moi` ou la liste exacte des exports changent (voir la note de conception) ; ceux de F-027 (`schemaCompte`) non.
- Le courriel des membres reste réservé aux propriétaires : un administrateur non membre identifie les membres par leur nom. Le rouvrir demande une décision (H6).
- Un administrateur qui veut lire un contenu s'invite (F-043-AC15) : trace dans le journal et dans la liste des membres. L'option B de H3 (lecture implicite) demanderait d'étendre `decider` et la synchronisation : elle remplacerait cette ADR.
- Retirer un administrateur ne ferme rien (il ne tenait aucune connexion à ce titre) ; supprimer son compte retire sa ligne par la cascade.
- La descente `0003` précède désormais celle de `0000` (clé étrangère vers `user`).
- Note de conception : `docs/decisions/F-043-conception.md`.

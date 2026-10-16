# ADR-0004 — Socle serveur : frontière des trois paquets, enveloppe d'erreur, composition de l'application

Statut : accepté ; section « Amendement F-012 » : écrite après coup le 2026-10-16, proposée, à accepter par le dev
Date : 2026-10-08 ; amendement F-012 du 2026-10-16

## Contexte et problème

F-008 crée d'un coup l'application `apps/server` et deux paquets, `packages/db` et `packages/contrats`. Ce que chacun exporte et ce qu'il a le droit d'importer devient un contrat entre paquets : `packages/contrats` sera le seul lien de compilation entre le client et le serveur, `packages/db` le seul code qui parle à PostgreSQL, et l'enveloppe d'erreur sera affichée par le client dès F-010. Ces trois points se défont mal.

Statut « accepté » le 2026-10-08 : la spec `specs/F-008.md` a été validée par le dev et entérine les choix de cet ADR. Elle l'a été d'abord sur la branche d'archive `planification-reunie` (commit `38b5c5f`), puis, au même texte, le 2026-10-09 sur la ligne de `main` (branche `F-008-socle`, commit `651991f`), où cet ADR est reposé sans changement de décision. Il est resté « proposé » tant qu'elle était en brouillon.

D'où vient chaque choix :

- Arrêtés par la spec F-008 (hypothèses que sa validation entérine) : la frontière de `packages/contrats` (H2), le format d'erreur maison et la convention des codes (H3), les chemins (H4), les bibliothèques `helmet`, `pino`, `zod` (H9), les noms des paquets et les variables `PORT` et `HOTE` (H11).
- Versions : veille du 2026-10-08 (`express@5.2.1`, `helmet@8.3.0`, `pino@10.3.1`, `zod@4.6.5`).
- Ajoutés par cette conception : la structure interne des trois paquets, les quatre contrats de dépendances en liste blanche, la règle ESLint des globales de Node dans `packages/contrats`, le nom `URL_BASE_DONNEES`, la limite de corps chiffrée, le routage strict, le traitement des connexions qui ne portent pas de requête lisible, le comportement pour une origine autorisée.
- Venus de la relecture de structure du 2026-10-12, sur le code : le fichier `src/service.ts` et le processus reçu en dépendance, le rejet de l'écoute impossible et l'arrêt en échec (F-008-AC25, AC26, ajoutés à la spec au commit `cdab8cc`), les contrats `infra-a-part` et `serveur-tests-par-les-entrees-de-db`.
- Venus de la deuxième revue du 2026-10-12, sur le code (commits `5bece07` et `a0af283`) : l'initialisation impossible, l'écouteur de `SIGTERM` posé avant l'écoute, `inflate` écrit explicitement dans la lecture du corps.

## Options étudiées

Format d'erreur : RFC 9457 (`application/problem+json`) ou **enveloppe maison à trois champs** (retenue, H3). Le client ne branche que sur `code` ; trois champs suffisent.

Code de l'enveloppe : expression régulière seule (toute chaîne à la bonne forme passe) ou **liste fermée** (retenue). Une liste fermée refuse un code inconnu comme un code mal formé ; la forme est tenue par un test qui parcourt la liste.

Accès du serveur aux deux paquets : imports libres de leurs fichiers, ou **entrée publique seule** (retenue), tenue par un contrat de dépendances.

Construction de l'application : un module qui lit `process.env` et ouvre la base à l'import, ou **une fonction qui reçoit ses dépendances** (retenue) : configuration déjà validée, accès à la base, journal. C'est ce qui permet aux tests de fournir une base embarquée et un journal capturé sans qu'aucun fichier de `src/` ne connaisse les tests.

Tests HTTP : bibliothèque de test d'Express (`supertest`) ou **vrai serveur sur un port éphémère et `fetch` de Node** (retenue) : aucune dépendance de plus, et le code d'écoute et d'arrêt est exercé par chaque test.

CORS : paquet `cors` ou **quelques lignes dans l'application** (retenue). La spec ne cite pas `cors`, et le besoin tient en deux en-têtes.

## Décision

### `packages/contrats` (`@notionlike/contrats`)

Schémas `zod`, types déduits, codes d'erreur et chemins de routes ; aucune entrée-sortie, aucun état (H2). Les types sont déduits des schémas (`z.infer`), jamais écrits à côté d'eux : le serveur type par eux chaque corps qu'il envoie (`ReponseSante`, `ReponsePret`, `EnveloppeErreur`, et `CodeErreur` pour la table des statuts), et ce sont ses tests qui valident : ceux de F-008-AC1 à AC8 relisent chaque corps reçu par le schéma publié (F-008-AC22). Le serveur lui-même n'appelle aucun de ces schémas à l'exécution. H2 y admet aussi des fonctions pures que le client et le serveur doivent appliquer à l'identique : F-008 n'en livre aucune, la première arrive avec F-012 (nommage des documents). Trois fichiers dans `src/`, à plat :

- `src/erreurs.ts` : `CODES_ERREUR`, `schemaEnveloppeErreur`, types `CodeErreur` et `EnveloppeErreur` ;
- `src/sante.ts` : `CHEMINS`, `schemaReponseSante`, `schemaReponsePret`, types `ReponseSante` et `ReponsePret` ;
- `src/index.ts` : réexporte ces neuf noms, rien d'autre.

Contrat de chaque élément :

- `CODES_ERREUR` est la liste fermée des cinq codes de F-008 : `requete-invalide`, `ressource-introuvable`, `corps-trop-grand`, `base-indisponible`, `erreur-interne`. Une feature n'y touche que par ajout.
- `schemaEnveloppeErreur` est un objet strict de trois champs : `code` (un élément de `CODES_ERREUR`), `message` (chaîne non vide), `idRequete` (chaîne non vide). Tout autre champ est refusé.
- Convention des codes, commune avec `@notionlike/document` (ADR-0003) : minuscules sans accent et chiffres, mots séparés par un tiret, soit l'expression `^[a-z0-9]+(-[a-z0-9]+)*$`. Elle est tenue par un test de `packages/contrats` qui l'applique à chaque élément de `CODES_ERREUR` : ajouter un code mal formé fait échouer `pnpm test`. Elle ne vaut que pour les codes de notre enveloppe (H3).
- `CHEMINS` vaut `{ sante: "/sante", pret: "/pret" }` (H4).
- `schemaReponseSante` et `schemaReponsePret` sont des objets stricts : `{ etat: "ok" }` et `{ etat: "pret" }`.

Le paquet est un paquet source, comme `@notionlike/document` (ADR-0003) : `exports` désigne `src/index.ts`, les imports relatifs portent l'extension `.ts`. Il reste importable dans un navigateur : `zod` pour seule dépendance d'exécution, ni module intégré de Node ni globale de Node.

### `packages/db` (`@notionlike/db`)

Le seul paquet qui importe `drizzle-orm` et `pg`. Son interface, son injection pour les tests et ses migrations sont décrites par l'ADR-0005. Il n'importe ni `packages/contrats`, ni Express, et seul `apps/server` l'importe.

### `apps/server` (`@notionlike/server`)

Sept fichiers dans `src/`, à plat :

| Fichier                | Rôle                                                                                                                                                        |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/configuration.ts` | `lireConfiguration(env)` : valide les variables et rend une `Configuration` immuable, ou lève `ErreurConfiguration` ; fonction pure                         |
| `src/journal.ts`       | `creerJournal(sortie)` : journal `pino` réglé explicitement, qui écrit sur le flux reçu                                                                     |
| `src/enveloppe.ts`     | identifiant de requête ; construit et envoie l'enveloppe d'erreur ; réponse 404 ; gestionnaire d'erreurs                                                    |
| `src/application.ts`   | `creerApplication({ configuration, base, journal })` : compose les middlewares et les deux routes ; n'écoute pas, ne lit pas `process`                      |
| `src/serveur.ts`       | `demarrerServeur({ application, hote, port, delaiArretMs })` : écoute, et rend le port réel et `arreter()` ; rejette si l'écoute échoue                     |
| `src/service.ts`       | `servir({ configuration, base, processus })` : vie du serveur dans le processus reçu ; écoute `SIGTERM` et fixe le code de sortie par lui (ADR-0006)        |
| `src/main.ts`          | point d'entrée du processus (ADR-0006) : le seul fichier qui touche au `process` global ; il lit `process.env`, ouvre la base et passe `process` à `servir` |

Sens des dépendances : `main → configuration, service` ; `service → application, journal, serveur` et le type `Configuration` ; `application → enveloppe` et les types `Configuration` et `Journal` ; `enveloppe →` le type `Journal`. `configuration.ts`, `journal.ts` et `serveur.ts` n'importent aucun autre fichier du serveur. `@notionlike/db` est importé par `main.ts` (`ouvrirBase`), `application.ts` (`ErreurBase`, type `Base`), `service.ts` (type `Base`) et `journal.ts` (type `CodeErreurBase`) ; `@notionlike/contrats` par `application.ts` et `enveloppe.ts`. Un test de couture énumère ces fichiers et les noms que chacun fait entrer (`test/coutures.test.ts`, F-008-AC23).

Le processus est une dépendance, comme la base : `servir` reçoit un objet qui a une sortie standard, une sortie d'erreur, `once("SIGTERM", …)` et `exit(code)`. `process` le satisfait, et un test lui en passe un autre. `main.ts` est ainsi le seul fichier de `src/` qui nomme `process`.

**Configuration.** Cinq variables, lues une seule fois :

| Variable              | Règle                                                                                                       | Défaut        |
| --------------------- | ----------------------------------------------------------------------------------------------------------- | ------------- |
| `NODE_ENV`            | `development`, `test` ou `production`                                                                       | `development` |
| `HOTE`                | chaîne non vide                                                                                             | `127.0.0.1`   |
| `PORT`                | entier de 0 à 65535 ; 0 demande un port libre au système (tests)                                            | `3000`        |
| `URL_BASE_DONNEES`    | obligatoire ; URL de protocole `postgres:` ou `postgresql:`                                                 | aucun         |
| `ORIGINES_AUTORISEES` | liste séparée par des virgules ; chaque entrée est une origine exacte (`new URL(entrée).origin === entrée`) | liste vide    |

- `Configuration` a quatre champs : `hote`, `port`, `urlBaseDonnees`, `originesAutorisees`. `NODE_ENV` est validée et sert à la règle de F-008-AC14 ci-dessous, sans être exposée : aucun code de F-008 ne la lirait.
- `*` n'est pas une origine exacte : le joker est refusé par la règle générale (F-008-AC10, AC12).
- `ErreurConfiguration` porte les noms des variables fautives et jamais leur valeur ; son message est `Configuration invalide : <noms séparés par une virgule>`.
- F-008-AC14 : quand `NODE_ENV` vaut `production`, le mot de passe extrait de `URL_BASE_DONNEES` (composant `password` de l'URL, décodé) ne doit pas être égal à `MOT_DE_PASSE_FACTICE`, constante `"factice-a-remplacer"` de `configuration.ts`. Sinon `URL_BASE_DONNEES` est déclarée fautive. La même valeur factice figure dans les deux fichiers d'exemple ; deux tests le vérifient en lisant ces fichiers comme du texte (le serveur, lui, ne lit jamais un fichier `.env`).

**Ordre de composition de `creerApplication`**, fixe :

1. réglages d'Express : pas d'en-tête `X-Powered-By`, pas d'`ETag`, routage strict (`/sante/` n'est pas `/sante`) et sensible à la casse ;
2. identifiant de requête : `crypto.randomUUID()`, posé dans `X-Request-Id` avant tout autre traitement ; l'en-tête reçu n'est jamais lu (F-008-AC4) ;
3. ligne de journal à la fin de chaque réponse ;
4. `helmet`, avec les trois en-têtes de F-008-AC9 passés en options explicites : `Content-Security-Policy: default-src 'none';frame-ancestors 'none'` (sans les directives par défaut), `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff` ;
5. origines : si l'en-tête `Origin` est une entrée de `ORIGINES_AUTORISEES`, la réponse porte `Access-Control-Allow-Origin` (cette origine) et `Access-Control-Allow-Credentials: true` ; sinon aucun des deux. `Vary: Origin` est posé dans tous les cas ;
6. lecture du corps JSON : `express.json` avec `limit` à `LIMITE_CORPS_OCTETS` (100 000 octets), `inflate` à vrai, `strict` à vrai et `type` à `application/json`, passés explicitement (H9). `inflate` à vrai est la valeur par défaut de `body-parser`, écrite pour être lue : un corps compressé (`gzip`, `deflate`, `br`) est décompressé et la limite vaut pour le corps décompressé ; un jeu de caractères qui ne commence pas par `utf-` ou un encodage de compression inconnu est refusé par le lecteur (415), donc rendu en 400 par le gestionnaire (F-008-AC6) ;
7. routes `GET /sante` et `GET /pret` ;
8. toute autre requête : 404 `ressource-introuvable` ;
9. gestionnaire d'erreurs.

F-009 montera l'authentification entre les étapes 5 et 6 (better-auth veut passer avant la lecture du corps) : c'est une modification de cette liste, couverte par son test de couture (F-009-AC23), pas un mécanisme d'extension à prévoir ici.

**Routes.** `GET /sante` répond 200 `{ "etat": "ok" }` sans toucher à la base. `GET /pret` appelle `base.sonder()` (ADR-0005) : 200 `{ "etat": "pret" }` si elle aboutit ; 503 `base-indisponible` si elle lève une `ErreurBase` ; toute autre erreur suit le gestionnaire d'erreurs. Le délai de 2 secondes appartient à `packages/db`, pas à la route.

**Erreurs.** Une seule fonction écrit une enveloppe ; statut et message sortent d'une table indexée par le code : `requete-invalide` 400, `ressource-introuvable` 404, `corps-trop-grand` 413, `base-indisponible` 503, `erreur-interne` 500. Le gestionnaire d'erreurs applique une règle unique :

- l'erreur porte un `status` numérique entre 400 et 499 (erreurs de lecture du corps et de décodage d'Express) : 413 donne `corps-trop-grand`, tout autre donne 400 `requete-invalide`. L'objet d'erreur n'est pas journalisé : celui d'un corps illisible porte ce corps ;
- sinon : 500 `erreur-interne`, message générique, et l'erreur est écrite dans le journal avec l'identifiant de requête (F-008-AC8).

**Journal.** `pino`, une ligne JSON par événement sur le flux passé à `creerJournal` : la sortie standard du processus reçu par `servir`, un flux capturé dans les tests. Les champs sont une liste fermée écrite par le code, jamais un objet de requête ou de réponse :

- ligne de requête : `idRequete`, `methode`, `chemin` (sans chaîne de requête), `statut`, `dureeMs` ;
- erreur non prévue : `idRequete` et `erreur`, liste d'au plus cinq éléments `{ type, message, pile }` qui suit la chaîne des `cause`. Aucune autre propriété de l'objet d'erreur n'est écrite ;
- base indisponible : `idRequete` et le `code` de l'`ErreurBase`, typé par `CodeErreurBase` de `@notionlike/db`, sans l'objet d'erreur ;
- écoute et arrêt : `hote`, `port`. La configuration n'est jamais journalisée, et ni une initialisation impossible, ni une écoute impossible, ni un arrêt en échec n'écrivent de ligne.

**Écoute et arrêt (`serveur.ts`).** `demarrerServeur` rend une promesse du port réellement ouvert et d'`arreter()`. Si l'écoute échoue (port déjà pris), la promesse est rejetée au lieu de laisser Node émettre l'erreur sans écouteur (F-008-AC25) ; l'écoute établie, cet écouteur est retiré. `arreter()` appelle `cesserDeServir` : le serveur cesse d'accepter des connexions, chaque connexion est fermée dès qu'elle n'a plus de requête en cours (fermeture des inactives répétée toutes les 20 ms, sans quoi elle resterait ouverte le temps du maintien de connexion de Node), et ce qui reste après `delaiArretMs` est coupé. Arrêter un serveur déjà arrêté est sans effet. Une connexion qui n'envoie pas une requête HTTP lisible (erreur d'analyse, en-têtes trop gros, délai dépassé) est fermée sans réponse : le serveur ne répond qu'à des requêtes que l'application a vues, donc toujours avec ses en-têtes et son enveloppe.

**Service (`service.ts`).** `servir` pose d'abord l'écouteur de `SIGTERM` du processus reçu, avant toute autre étape ; puis il crée le journal sur la sortie standard du processus, compose l'application et demande l'écoute avec un délai d'arrêt de 8 000 ms. Quatre issues, dont les trois en échec passent par une seule fonction (`sortirEnEchec`) qui écrit une phrase fixe sur la sortie d'erreur puis sort en code 1 :

- initialisation impossible (F-008-AC25) : la création du journal ou la composition de l'application lève ; la base est fermée, que sa fermeture aboutisse ou non, puis « Initialisation impossible : le serveur ne démarre pas. » et le code 1 ; rien n'a écouté ;
- écoute impossible (F-008-AC25) : la base est fermée, que sa fermeture aboutisse ou non, puis « Écoute impossible sur l'adresse configurée : le serveur ne démarre pas. » et le code 1 ;
- `SIGTERM` (F-008-AC7) : `arreter()`, puis `base.fermer()`, puis la ligne de journal `arret` et `exit(0)`. Reçu pendant le démarrage, le signal est noté et l'arrêt part dès que le serveur sert ; reçu après une initialisation ou une écoute impossible, il ne fait rien ;
- arrêt ou fermeture de la base qui rejette (F-008-AC26) : « Arrêt en échec : le serveur n'a pas pu tout fermer. » et le code 1.

Dans les trois échecs, l'objet d'erreur n'est écrit nulle part, ni sur la sortie d'erreur ni dans le journal : il peut porter l'URL de connexion, donc le mot de passe. La suite du processus est décrite par l'ADR-0006.

### Amendement F-012 (2026-10-16) : passage en WebSocket, assemblage, liste blanche du serveur

Contexte : F-012 (`797d708`) ajoute la synchronisation des documents au serveur (ADR-0013) sans amender cet ADR (mode économe, D-023). Trois points de la décision ci-dessus ne décrivent plus le code.

- **Le serveur répond aussi à des demandes que l'application n'a pas vues.** La phrase « le serveur ne répond qu'à des requêtes que l'application a vues, donc toujours avec ses en-têtes et son enveloppe » ne vaut plus pour la demande de passage en WebSocket : `demarrerServeur` remet l'événement `upgrade` au `Passage` qu'il reçoit (`apps/server/src/serveur.ts`), et la synchronisation refuse une demande par une ligne d'état HTTP sans corps (401, 403, 404, 429, 500, 503), écrite sur la socket avant de la détruire (`refuserLePassage`, `apps/server/src/synchronisation.ts`) : ni enveloppe, ni `X-Request-Id`, ni en-têtes de `helmet`. Le motif n'est écrit que dans le journal (ligne `synchro`). Une requête HTTP ordinaire suit toujours le chemin de l'application et de son enveloppe.
- **Composition.** `service.ts` n'appelle plus `creerApplication` ni `creerSuppressionDeSessions` : il appelle `assembler` (`apps/server/src/assemblage.ts`), seule fonction qui réunit l'application HTTP, la fonction de suppression de session, le module des adhésions et la synchronisation, et que la fabrique d'essai (`apps/server/test/fabrique.ts`) appelle aussi. Sens des dépendances : `service → assemblage, configuration (type), journal, serveur` ; `assemblage → adhesions, application, authentification, debit, sessions, synchronisation`, et `configuration`, `journal`, `synchro-reglages` pour des types. `arreter()` de l'écoute attend aussi l'arrêt de la synchronisation. `serveur.ts` n'importe toujours aucun autre fichier du serveur.
- **Liste blanche du serveur élargie** (`serveur-liste-blanche`, commit du dev `022f044`) : `@hocuspocus/server`, `ws` et ses types, `y-protocols`, `yjs` et `lib0` sont admis depuis `apps/server/src/` ; `@notionlike/document`, `@hocuspocus/provider` et la fabrique d'essai y restent refusés. La règle `apps-isolees` admet une exception, les tests d'`apps/web`, qui n'atteignent `apps/server` que par la fabrique (`web-tests-serveur-par-la-fabrique`).
- **Manifeste** : `apps/server/package.json` a désormais un champ `exports`, une seule entrée, `./essai` vers `test/fabrique.ts` (F-012 H16).
- **Contrat partagé** : la première fonction pure que le client et le serveur appliquent à l'identique, annoncée ci-dessus pour F-012, est `nomDeDocument` et son schéma `schemaNomDeDocument` (`packages/contrats/src/synchro.ts`).

### Contrats de dépendances

Six règles de F-008 dans `.dependency-cruiser.cjs`. Les quatre premières viennent de la conception (texte et preuve dans `docs/decisions/F-008-conception.md`) :

- `contrats-zod-seulement` : depuis `packages/contrats/src`, seuls un fichier de `packages/contrats/src` et le paquet `zod` sont importables ;
- `db-liste-blanche` : depuis `packages/db/src`, seuls un fichier de `packages/db/src`, `drizzle-orm`, `pg` et les modules intégrés de Node ;
- `serveur-liste-blanche` : depuis `apps/server/src`, seuls un fichier de `apps/server/src`, `packages/db/src/index.ts`, `packages/contrats/src/index.ts`, `express`, `helmet`, `pino`, `zod` et les modules intégrés de Node ;
- `db-reserve-au-serveur` : seuls `packages/db` et `apps/server` importent un fichier de `packages/db`.

Les deux dernières viennent de la relecture de structure (commit `0fd735e`) :

- `infra-a-part` : aucun fichier d'`apps/` ni de `packages/` n'importe un fichier d'`infra/` ;
- `serveur-tests-par-les-entrees-de-db` : depuis `apps/server/test`, seuls `packages/db/src/index.ts` et `packages/db/test/essai.ts` sont importables dans `packages/db`, soit les deux entrées du manifeste (`@notionlike/db`, `@notionlike/db/essai`).

S'y ajoute une règle ESLint `no-restricted-globals` sur `packages/contrats/src` (`process`, `Buffer`, `global`, `require`, `module`, `__dirname`, `__filename`, `setImmediate`, `clearImmediate`) : ces globales s'utilisent sans import, hors de vue des contrats de dépendances.

## Conséquences

- Le client et le serveur partagent neuf noms ; ajouter un contrat est un ajout dans `packages/contrats`, sans toucher au serveur.
- Depuis `src/`, le serveur ne peut atteindre ni `pg`, ni `drizzle-orm`, ni PGlite, ni un fichier interne ou un fichier de test de `packages/db` : `pnpm contrats` échoue. Toute requête SQL s'écrit donc dans `packages/db`. Ses tests n'atteignent `packages/db` que par ses deux entrées.
- Une nouvelle dépendance directe d'`apps/server` ou de `packages/db` demande une retouche de la liste blanche, fichier protégé : c'est voulu, le dev voit passer chaque dépendance. F-009 devra y ajouter `better-auth` et `@better-auth/*` pour le serveur.
- La limite de corps est de 100 000 octets : un corps de 100 001 octets reçoit 413, quelle que soit la lecture de « kilo-octet » (1 000 ou 1 024). Un corps JSON valide qui n'est ni un objet ni un tableau reçoit 400 (`strict`).
- `HEAD /sante` et `HEAD /pret` répondent comme `GET`, sans corps (comportement d'Express, conservé). Toute autre méthode sur ces chemins reçoit 404, `OPTIONS` comprise.
- Les requêtes de pré-vérification CORS (`OPTIONS` avec `Access-Control-Request-Method`) ne sont pas traitées : les deux routes de F-008 n'en déclenchent pas. La première feature qui expose une route appelée depuis une autre origine avec un corps JSON (F-009 ou F-010) devra les traiter.
- `helmet` pose aussi ses autres en-têtes par défaut (`Strict-Transport-Security`, `X-Frame-Options`, `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`…). Ils ne sont pas requis par la spec ; ils sont laissés, et aucun test ne les fixe.
- Les messages d'erreur de Drizzle contiennent la requête SQL et ses paramètres (« Failed query: … params: … », constaté à l'essai). Le journal de F-008 n'en reçoit aucun qui porte une donnée de membre ; F-009 devra en tenir compte pour F-009-AC19 avant de journaliser une erreur de requête.
- Une erreur hors requête (promesse rejetée sans traitement, exception non interceptée) garde le comportement de Node : le processus s'arrête. Aucun critère de F-008 ne le couvre.
- Une initialisation impossible, une écoute impossible et un arrêt en échec ne laissent qu'une phrase fixe : la cause n'est écrite nulle part. C'est le prix de ne jamais écrire un objet d'erreur qui peut porter l'URL de connexion ; le diagnostic se fait hors du serveur (port occupé, état de la base).
- Que l'écouteur d'erreur de l'écoute soit bien retiré une fois l'écoute établie n'est tenu par aucune assertion : le serveur HTTP n'est pas exposé hors de `serveur.ts`.
- Amendement F-012 : le serveur tient un état en mémoire qui ne se reconstruit pas d'une requête à l'autre (connexions, ouvertures, documents chargés, époques des droits) ; une seconde instance n'est pas possible sans diffusion partagée (ADR-0013). Un refus de passage en WebSocket est lisible par un client hors navigateur seulement, sans enveloppe.

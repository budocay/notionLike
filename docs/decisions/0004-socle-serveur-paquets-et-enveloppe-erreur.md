# ADR-0004 — Socle serveur : frontière des trois paquets, enveloppe d'erreur, composition de l'application

Statut : accepté
Date : 2026-10-08

## Contexte et problème

F-008 crée d'un coup l'application `apps/server` et deux paquets, `packages/db` et `packages/contrats`. Ce que chacun exporte et ce qu'il a le droit d'importer devient un contrat entre paquets : `packages/contrats` sera le seul lien de compilation entre le client et le serveur, `packages/db` le seul code qui parle à PostgreSQL, et l'enveloppe d'erreur sera affichée par le client dès F-010. Ces trois points se défont mal.

Statut « accepté » le 2026-10-08 : la spec `specs/F-008.md` a été validée par le dev et entérine les choix de cet ADR. Elle l'a été d'abord sur la branche d'archive `planification-reunie` (commit `38b5c5f`), puis, au même texte, le 2026-10-09 sur la ligne de `main` (branche `F-008-socle`, commit `651991f`), où cet ADR est reposé sans changement de décision. Il est resté « proposé » tant qu'elle était en brouillon.

D'où vient chaque choix :

- Arrêtés par la spec F-008 (hypothèses que sa validation entérine) : la frontière de `packages/contrats` (H2), le format d'erreur maison et la convention des codes (H3), les chemins (H4), les bibliothèques `helmet`, `pino`, `zod` (H9), les noms des paquets et les variables `PORT` et `HOTE` (H11).
- Versions : veille du 2026-10-08 (`express@5.2.1`, `helmet@8.3.0`, `pino@10.3.1`, `zod@4.6.5`).
- Ajoutés par cette conception : la structure interne des trois paquets, les quatre contrats de dépendances en liste blanche, la règle ESLint des globales de Node dans `packages/contrats`, le nom `URL_BASE_DONNEES`, la limite de corps chiffrée, le routage strict, le traitement des connexions qui ne portent pas de requête lisible, le comportement pour une origine autorisée.

## Options étudiées

Format d'erreur : RFC 9457 (`application/problem+json`) ou **enveloppe maison à trois champs** (retenue, H3). Le client ne branche que sur `code` ; trois champs suffisent.

Code de l'enveloppe : expression régulière seule (toute chaîne à la bonne forme passe) ou **liste fermée** (retenue). Une liste fermée refuse un code inconnu comme un code mal formé ; la forme est tenue par un test qui parcourt la liste.

Accès du serveur aux deux paquets : imports libres de leurs fichiers, ou **entrée publique seule** (retenue), tenue par un contrat de dépendances.

Construction de l'application : un module qui lit `process.env` et ouvre la base à l'import, ou **une fonction qui reçoit ses dépendances** (retenue) : configuration déjà validée, accès à la base, journal. C'est ce qui permet aux tests de fournir une base embarquée et un journal capturé sans qu'aucun fichier de `src/` ne connaisse les tests.

Tests HTTP : bibliothèque de test d'Express (`supertest`) ou **vrai serveur sur un port éphémère et `fetch` de Node** (retenue) : aucune dépendance de plus, et le code d'écoute et d'arrêt est exercé par chaque test.

CORS : paquet `cors` ou **quelques lignes dans l'application** (retenue). La spec ne cite pas `cors`, et le besoin tient en deux en-têtes.

## Décision

### `packages/contrats` (`@notionlike/contrats`)

Schémas `zod`, types déduits, codes d'erreur et chemins de routes ; aucune entrée-sortie, aucun état (H2). H2 y admet aussi des fonctions pures que le client et le serveur doivent appliquer à l'identique : F-008 n'en livre aucune, la première arrive avec F-012 (nommage des documents). Trois fichiers dans `src/`, à plat :

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

Six fichiers dans `src/`, à plat :

| Fichier                | Rôle                                                                                                                                   |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `src/configuration.ts` | `lireConfiguration(env)` : valide les variables et rend une `Configuration` immuable, ou lève `ErreurConfiguration` ; fonction pure    |
| `src/journal.ts`       | `creerJournal(sortie?)` : journal `pino` réglé explicitement                                                                           |
| `src/enveloppe.ts`     | construit et envoie l'enveloppe d'erreur ; réponse 404 ; gestionnaire d'erreurs                                                        |
| `src/application.ts`   | `creerApplication({ configuration, base, journal })` : compose les middlewares et les deux routes ; n'écoute pas, ne lit pas `process` |
| `src/serveur.ts`       | `demarrerServeur({ application, hote, port, delaiArretMs })` : écoute, et rend le port réel et `arreter()`                             |
| `src/main.ts`          | point d'entrée du processus (ADR-0006) : le seul fichier qui lit `process.env`, écoute les signaux et fixe le code de sortie           |

Sens des dépendances : `main → configuration, journal, application, serveur` ; `application → enveloppe, configuration, journal` ; `enveloppe → journal`. `configuration.ts` et `serveur.ts` n'importent aucun autre fichier du serveur.

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
6. lecture du corps JSON : `express.json` avec `limit` à `LIMITE_CORPS_OCTETS` (100 000 octets), `strict` à vrai et `type` à `application/json`, passés explicitement (H9) ;
7. routes `GET /sante` et `GET /pret` ;
8. toute autre requête : 404 `ressource-introuvable` ;
9. gestionnaire d'erreurs.

F-009 montera l'authentification entre les étapes 5 et 6 (better-auth veut passer avant la lecture du corps) : c'est une modification de cette liste, couverte par son test de couture (F-009-AC23), pas un mécanisme d'extension à prévoir ici.

**Routes.** `GET /sante` répond 200 `{ "etat": "ok" }` sans toucher à la base. `GET /pret` appelle `base.sonder()` (ADR-0005) : 200 `{ "etat": "pret" }` si elle aboutit ; 503 `base-indisponible` si elle lève une `ErreurBase` ; toute autre erreur suit le gestionnaire d'erreurs. Le délai de 2 secondes appartient à `packages/db`, pas à la route.

**Erreurs.** Une seule fonction écrit une enveloppe ; statut et message sortent d'une table indexée par le code : `requete-invalide` 400, `ressource-introuvable` 404, `corps-trop-grand` 413, `base-indisponible` 503, `erreur-interne` 500. Le gestionnaire d'erreurs applique une règle unique :

- l'erreur porte un `status` numérique entre 400 et 499 (erreurs de lecture du corps et de décodage d'Express) : 413 donne `corps-trop-grand`, tout autre donne 400 `requete-invalide`. L'objet d'erreur n'est pas journalisé : celui d'un corps illisible porte ce corps ;
- sinon : 500 `erreur-interne`, message générique, et l'erreur est écrite dans le journal avec l'identifiant de requête (F-008-AC8).

**Journal.** `pino`, une ligne JSON par événement sur la sortie standard, ou sur le flux passé à `creerJournal` (tests). Les champs sont une liste fermée écrite par le code, jamais un objet de requête ou de réponse :

- ligne de requête : `idRequete`, `methode`, `chemin` (sans chaîne de requête), `statut`, `dureeMs` ;
- erreur non prévue : `idRequete` et `erreur`, liste d'au plus cinq éléments `{ type, message, pile }` qui suit la chaîne des `cause`. Aucune autre propriété de l'objet d'erreur n'est écrite ;
- base indisponible : `idRequete` et le `code` de l'`ErreurBase`, sans l'objet d'erreur ;
- écoute et arrêt : `hote`, `port`. La configuration n'est jamais journalisée.

**Écoute et arrêt.** `demarrerServeur` rend le port réellement ouvert et `arreter()`, qui cesse d'accepter des connexions, ferme les connexions inactives, ferme chaque connexion dès que sa requête en cours a reçu sa réponse, et coupe ce qui reste après `delaiArretMs`. Une connexion qui n'envoie pas une requête HTTP lisible (erreur d'analyse, en-têtes trop gros, délai dépassé) est fermée sans réponse : le serveur ne répond qu'à des requêtes que l'application a vues, donc toujours avec ses en-têtes et son enveloppe.

### Contrats de dépendances

Quatre règles ajoutées à `.dependency-cruiser.cjs`, écrites en liste blanche (texte exact et preuve dans `docs/decisions/F-008-conception.md`) :

- `contrats-zod-seulement` : depuis `packages/contrats/src`, seuls un fichier de `packages/contrats/src` et le paquet `zod` sont importables ;
- `db-liste-blanche` : depuis `packages/db/src`, seuls un fichier de `packages/db/src`, `drizzle-orm`, `pg` et les modules intégrés de Node ;
- `serveur-liste-blanche` : depuis `apps/server/src`, seuls un fichier de `apps/server/src`, `packages/db/src/index.ts`, `packages/contrats/src/index.ts`, `express`, `helmet`, `pino`, `zod` et les modules intégrés de Node ;
- `db-reserve-au-serveur` : seuls `packages/db` et `apps/server` importent un fichier de `packages/db`.

S'y ajoute une règle ESLint `no-restricted-globals` sur `packages/contrats/src` (`process`, `Buffer`, `global`, `require`, `module`, `__dirname`, `__filename`, `setImmediate`, `clearImmediate`) : ces globales s'utilisent sans import, hors de vue des contrats de dépendances.

## Conséquences

- Le client et le serveur partagent neuf noms ; ajouter un contrat est un ajout dans `packages/contrats`, sans toucher au serveur.
- Le serveur ne peut atteindre ni `pg`, ni `drizzle-orm`, ni PGlite, ni un fichier interne ou un fichier de test de `packages/db` : `pnpm contrats` échoue. Toute requête SQL s'écrit donc dans `packages/db`.
- Une nouvelle dépendance directe d'`apps/server` ou de `packages/db` demande une retouche de la liste blanche, fichier protégé : c'est voulu, le dev voit passer chaque dépendance. F-009 devra y ajouter `better-auth` et `@better-auth/*` pour le serveur.
- La limite de corps est de 100 000 octets : un corps de 100 001 octets reçoit 413, quelle que soit la lecture de « kilo-octet » (1 000 ou 1 024). Un corps JSON valide qui n'est ni un objet ni un tableau reçoit 400 (`strict`).
- `HEAD /sante` et `HEAD /pret` répondent comme `GET`, sans corps (comportement d'Express, conservé). Toute autre méthode sur ces chemins reçoit 404, `OPTIONS` comprise.
- Les requêtes de pré-vérification CORS (`OPTIONS` avec `Access-Control-Request-Method`) ne sont pas traitées : les deux routes de F-008 n'en déclenchent pas. La première feature qui expose une route appelée depuis une autre origine avec un corps JSON (F-009 ou F-010) devra les traiter.
- `helmet` pose aussi ses autres en-têtes par défaut (`Strict-Transport-Security`, `X-Frame-Options`, `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`…). Ils ne sont pas requis par la spec ; ils sont laissés, et aucun test ne les fixe.
- Les messages d'erreur de Drizzle contiennent la requête SQL et ses paramètres (« Failed query: … params: … », constaté à l'essai). Le journal de F-008 n'en reçoit aucun qui porte une donnée de membre ; F-009 devra en tenir compte pour F-009-AC19 avant de journaliser une erreur de requête.
- Une erreur hors requête (promesse rejetée sans traitement, exception non interceptée) garde le comportement de Node : le processus s'arrête. Aucun critère de F-008 ne le couvre.

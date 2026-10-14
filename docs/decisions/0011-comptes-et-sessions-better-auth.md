# ADR-0011 — Comptes et sessions : better-auth monté derrière le code du serveur, session en base, schéma natif dans `packages/db`

Statut : accepté ; section « Amendement du 2026-10-14 » comprise, acceptée par le dev le 2026-10-14
Date : 2026-10-13 ; amendement du 2026-10-14 (F-010, F-011, F-027)
Accepté par le dev le 2026-10-13, après le code (écart de calendrier relevé pour F-009).

## Contexte et problème

F-009 apporte la première authentification du projet : comptes, mots de passe, sessions, et la vérification de session sur laquelle toute route protégée s'appuiera (F-010, F-011, F-012). Plusieurs choix se défont mal : la stratégie de session et le nom du cookie (changer l'un déconnecte tout le monde), le format des routes d'authentification (le client officiel de better-auth de F-010 en dépend), le schéma des tables (F-011 pose ses clés étrangères sur l'identifiant du compte), le format des empreintes de mot de passe, et le point unique par lequel une session est supprimée (F-012, F-025, F-026, F-027 s'y branchent).

La spec `specs/F-009.md` (validée) arrête l'essentiel de ces choix dans ses hypothèses H1 à H4, H14, H18 et H20 ; elle ne demandait pas d'ADR nommément. Cet ADR les consigne, avec les moyens que le code livré a retenus là où la spec laissait le choix à la conception (H17, H20). Il est écrit après le code (dernier commit de code `4181e75`, branche `F-009`) : il décrit des décisions déjà appliquées, au statut « proposé » jusqu'à ce que le dev l'accepte.

D'où vient chaque choix :

- Arrêtés par la spec : session en base et cookie opaque signé, sans jeton autoporté ni cache dans le cookie (H1) ; routes natives de better-auth sous `/api/auth/`, réduites à quatre couples méthode et chemin (H2, F-009-AC17, H21) ; modèle de données natif écrit à la main en Drizzle, identifiants `uuid` (H3) ; Argon2id de `node:crypto` au format PHC (H4) ; `URL_PUBLIQUE` obligatoire et caractère `Secure` réglé par le serveur (H14) ; aucune ouverture entre origines (H18, F-009-AC32) ; une seule fonction de suppression de session et son signal (H20, F-009-AC33) ; compteurs de débit en mémoire du processus (H7).
- Versions : `better-auth@1.7.7` (dépendance directe d'`apps/server`, commit `780d1b3`), `drizzle-kit@0.31.11` (développement de `packages/db`, commit `e983abc`), veille du 2026-10-08.
- Tranchés par le code livré : la requête que better-auth reçoit est reconstruite par le serveur ; la suppression native d'une session est détournée par le crochet `databaseHooks.session.delete.before` ; la déconnexion est vérifiée après coup ; les compteurs natifs sont tenus par le stockage du serveur.

## Options étudiées

Montage de better-auth :

1. Passer la requête Express telle quelle au gestionnaire de better-auth (adaptateur Node fourni par la bibliothèque). Écartée : better-auth lirait `Host`, `X-Forwarded-For`, `X-Forwarded-Proto` et `Authorization` du client, et appliquerait ses propres défauts dépendants de `NODE_ENV` (contrôle d'origine coupé sous `test`).
2. **Reconstruire la requête** (retenue) : le code du serveur filtre, compte et valide, puis construit une `Request` sur `URL_PUBLIQUE` avec une liste fermée d'en-têtes et le corps relu par le schéma publié ; la réponse native est recopiée telle quelle (statut, type, cookies, `Cache-Control`, corps).
3. Écrire nos propres routes et n'utiliser better-auth que comme bibliothèque. Écartée par la spec (H2) : le client officiel de F-010 attend les routes natives.

Suppression d'une session par la fonction unique (H20) :

- a. Supprimer la session par la fonction avant de passer la main à better-auth. Écartée : better-auth supprime aussi des sessions ailleurs que dans la déconnexion (session expirée relue par `get-session` ou par la vérification de `GET /api/v1/moi`), que ce moyen ne verrait pas.
- b. **Crochet `databaseHooks.session.delete.before`** (retenue) : il appelle la fonction de suppression, puis rend `false`, ce qui annule la suppression native. Toute suppression d'une session par better-auth, quelle que soit la route, passe ainsi par la fonction. Le test de couture lit les sources de better-auth installé et énumère les routes ouvertes et les méthodes internes qui suppriment.

Déconnexion en échec (H17) :

- a. Se fier au statut de better-auth. Écartée : better-auth tait l'échec d'une lecture faite avant sa suppression et répond 200.
- b. **Relire la session présentée après la réponse de better-auth** (retenue) : si elle vit encore, la fonction la supprime ; si elle ne le peut pas, la route répond 500 `erreur-interne`, en gardant l'effacement du cookie.

Compteurs de débit :

- a. Stockage mémoire natif de better-auth, plus un compteur à part pour le plafond global. Écartée : deux mécanismes, deux bornes de mémoire.
- b. **Un seul compteur du serveur** (`debit.ts`, fenêtre fixe par clé, 100 000 clés au plus), passé à better-auth comme `rateLimit.customStorage` et utilisé directement pour le plafond global (retenue).

## Décision

- Session : en base (table `session`), jeton opaque signé par `BETTER_AUTH_SECRET` dans un cookie `HttpOnly`, `SameSite=Lax`, `Path=/`, sans `Domain` ; cache de session dans le cookie désactivé ; 7 jours glissants, prolongés après 24 heures. `advanced.useSecureCookies` vaut vrai en production ou quand `URL_PUBLIQUE` est en `https://` : le cookie s'appelle alors `__Secure-…`. Toute requête protégée relit la session en base.
- Montage : `apps/server/src/comptes.ts` monte, après les en-têtes de sécurité et avant la lecture JSON de F-008, dans cet ordre : le plafond global (60 requêtes par minute et par adresse sous `/api/auth`), la liste fermée des quatre routes (404 ailleurs, `OPTIONS` compris), la lecture du corps brut bornée à 100 000 octets, la validation du corps par `packages/contrats`, puis la transmission à better-auth. Dans le code d'exécution, seul `apps/server/src/authentification.ts` construit better-auth ; il écrit chaque réglage dont le défaut dépend de `NODE_ENV` ou de la requête (contrôle d'origine et de CSRF, limitation, URL de base, origines de confiance, en-tête d'adresse, cookies sécurisés, télémétrie coupée, journal interne branché sur le nôtre sans message ni valeur jointe).
- Adresse de la requête : celle de la connexion, ou celle que `PROXYS_DE_CONFIANCE` désigne dans `X-Forwarded-For` ; better-auth ne reçoit que cette valeur dans `X-Forwarded-For`.
- Schéma : les quatre tables natives (`user`, `session`, `account`, `verification`) écrites à la main dans `packages/db/src/schema.ts`, sans renommage, identifiants `uuid`, cascade des sessions et identifiants de connexion d'un compte, contrainte de courriel en minuscules en base, index sur `session.expiresAt`. Migration `0000_comptes` générée par `drizzle-kit` et appliquée par le migrateur de F-008 ; descente manuelle dans `packages/db/descentes/0000_comptes.sql`, hors du migrateur. `Base["db"]` est typé par ce schéma ; l'adaptateur Drizzle de better-auth le reçoit tel quel.
- Empreintes : Argon2id de `node:crypto` (m = 19 456 Kio, t = 2, p = 1, sel de 16 octets, clé de 32), au format PHC, vérifiées en temps constant avec les paramètres lus dans la chaîne, bornés pour qu'une ligne altérée n'épuise pas la mémoire.
- Suppression de session : `supprimerSessions` (`packages/db/src/sessions.ts`) est la seule requête qui efface une ligne de `session` ; son seul appelant est `creerSuppressionDeSessions` (`apps/server/src/sessions.ts`), qui l'exécute dans une transaction et ne signale ses abonnés, par identifiant de session et de compte, qu'après la validation. better-auth y est branché par son crochet de suppression.
- Origines : aucun en-tête `Access-Control-Allow-*`, aucune pré-vérification ; `ORIGINES_AUTORISEES` et l'origine de `URL_PUBLIQUE` ne servent qu'au contrôle d'`Origin` de better-auth. Amendé le 2026-10-14 : ils servent aussi au contrôle d'origine des routes de F-011 et de F-027 (plus bas).
- Dépendances : better-auth et `@better-auth/*` réservés à `apps/server`, par sous-chemin (trois règles de `.dependency-cruiser.cjs`, commit `8ad53a3`). Amendé le 2026-10-14 : `better-auth/client` est importé par un module d'`apps/web` (plus bas).

### Amendement du 2026-10-14 : client dans `apps/web`, origines des routes à nous

Deux phrases de la décision ci-dessus sont devenues inexactes avec F-010, F-011 et F-027 ; cet amendement dit ce que fait le code de `main` à `5bc0d40`.

- **`better-auth/client` dans `apps/web`** (F-010, commit du dev `f134cb2`). Le serveur reste le seul à importer `better-auth` et ses autres sous-chemins. Le sous-chemin `better-auth/client`, que la règle `better-auth-reserve-au-serveur` exceptait déjà, est importé par un seul module, `apps/web/src/compte/client-auth.ts` : la règle `better-auth-client-un-seul-module` l'admet depuis ce fichier seul (`from: { pathNot }`), et `better-auth/react` comme `better-auth/client/plugins` restent interdits partout. `apps/web/package.json` déclare `better-auth` 1.7.7, la version exacte du serveur. Le confinement côté client est l'objet de l'ADR-0012.
- **`ORIGINES_AUTORISEES` et `URL_PUBLIQUE` hors de better-auth** (F-011, puis F-027). `apps/server/src/origine.ts` (`origineAdmise`) refuse en 403 `origine-refusee` toute écriture (`POST`, `PATCH`, `DELETE`) des routes des espaces et de la gestion du compte dont l'en-tête `Origin` n'est ni `URL_PUBLIQUE` ni une entrée d'`ORIGINES_AUTORISEES` ; une requête sans `Origin` passe. Ces deux réglages servent donc à deux contrôles : celui de better-auth sur `/api/auth`, et celui du serveur sur ses propres routes protégées. Le reste de la décision « Origines » tient : aucun en-tête `Access-Control-Allow-*`, aucune pré-vérification.

## Conséquences

- Changer de stratégie de session, de nom de cookie ou de caractère `Secure` déconnecte tous les membres ; changer le format des routes casse le client de F-010 dès sa livraison ; renommer une table ou une colonne casse l'adaptateur de better-auth et les clés étrangères de F-011.
- Une montée de version de better-auth est une retouche à revalider : statuts et corps natifs cités par la spec (H2), forme des sources que lit le test de couture de F-009-AC33, comportement du crochet de suppression et de la déconnexion. Le test de couture échoue si une route ouverte se met à supprimer des sessions ou si une méthode interne supprime sans crochet.
- Le crochet rend `false` après avoir supprimé la première session visée : une suppression groupée de better-auth (`deleteSessions`, `deleteUserSessions`) s'arrêterait donc après la première session. Aucune des quatre routes ouvertes n'en appelle une ; les features qui suppriment plusieurs sessions (F-025, F-026, F-027) appellent la fonction du serveur, jamais une suppression groupée de better-auth.
- Le serveur écrit dans les tables natives par Drizzle pour les flux de F-025, F-026 et F-027 (H21) : possible parce que le schéma est le nôtre, fragile à chaque montée de version.
- Une lecture en base par requête authentifiée, sur la réserve de 10 connexions que la sonde de `GET /pret` partage (dette D-011, toujours ouverte).
- Compteurs de débit en mémoire d'un seul processus : ils repartent de zéro au redémarrage, et plusieurs instances demanderaient un stockage partagé.
- better-auth enregistre avec la session une adresse IPv6 réduite à son réseau /64 (normalisation de `@better-auth/core` 1.7.7, réglage `ipv6Subnet` laissé à son défaut) ; le journal porte l'adresse entière.
- La descente de la migration est destructive et se lance à la main, sauvegarde prise d'abord ; aucun contrôle ne la joue sur une pile réelle.

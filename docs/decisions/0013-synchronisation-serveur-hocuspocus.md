# ADR-0013 — Synchronisation serveur : Hocuspocus greffé derrière le code du serveur, un instantané par document, une seule instance

Statut : proposé (écrit après le code, le 2026-10-16 : consigne les choix de F-012, livrée sans ADR en mode économe et acceptée par dérogation, D-023 ; à accepter par le dev)
Date : 2026-10-16

## Contexte et problème

F-012 (spec validée par le dev au commit `34c5f6f`, fusionnée dans `main` par `797d708`) fait du serveur d'`apps/server` le relais et le dépôt des documents Yjs : les appareils des membres d'un espace y échangent leurs mises à jour et les y retrouvent après une absence. Le code a été écrit sans conception ni ADR (mode économe du dev, dette D-023) ; `MEMORY/features/F-012.md` liste les décisions prises au code. Plusieurs se défont mal :

- le point de synchronisation, son authentification et le contrat de ses refus, dont dépend tout client (F-013 les lit déjà) ;
- le format stocké des documents, que chaque ligne de la base porte ;
- la bibliothèque de synchronisation et la manière de s'y greffer, dont la montée de version touche aux critères ;
- l'hypothèse d'une seule instance du serveur, que les compteurs, les signaux et les documents en mémoire supposent.

Cet ADR les consigne d'après le code de `main` à `7746e17` (le code d'`apps/server` y est celui de `797d708`) et la spec (H1 à H21).

## Options étudiées

Transport :

1. Classe `Server` de `@hocuspocus/server` : elle crée son propre serveur HTTP et ses propres gestionnaires de signaux. Écartée (F-012 H10) : elle doublerait l'écoute et l'arrêt de F-008 (ADR-0004, ADR-0006) et ne laisserait pas le code du serveur juger la demande de passage.
2. **Classe `Hocuspocus`, greffée sur le serveur HTTP de F-008** (retenue, H10) : le code du serveur traite l'événement `upgrade`, crée la WebSocket par `ws` et la remet à la bibliothèque.
3. Protocole écrit à la main (`y-protocols` seul). Écarté : disproportionné pour un outil interne, et la bibliothèque traite déjà l'échange de synchronisation, l'accusé et la présence.

Authentification :

- jeton dans l'adresse, en `Authorization`, en sous-protocole ou dans le message d'authentification du protocole ; ou **cookie de session de F-009 sur la demande de passage, vérifié par le code des routes protégées** (retenue, H1) : le point est servi sur la même origine et le même port, si bien que le cookie `SameSite=Lax` y parvient sans jeton à faire circuler. Le jeton que le client officiel envoie dans son message d'authentification n'est pas lu.

Stockage :

- journal des mises à jour ; ou **un instantané complet par document, remplacé à chaque enregistrement** (retenue, H3) : chaque appareil garde ses modifications, et l'échange de synchronisation renvoie au serveur ce qui lui manque.

Contrôles :

- dans les seuls crochets de la bibliothèque ; ou **un relais de messages devant la bibliothèque, plus ses crochets** (retenue, H10) : la bibliothèque n'applique ni débit, ni plafond de présence, ni compte d'ouvertures pour une connexion authentifiée (veille citée par H7).

Échelle :

- plusieurs instances, avec une diffusion partagée ; ou **une seule instance** (retenue, H9) : un document n'a qu'une copie en mémoire, et compteurs et signaux vivent dans le processus.

## Décision

- **Un seul point de synchronisation**, `CHEMIN_SYNCHRO` (`/api/v1/synchro`, `packages/contrats/src/synchro.ts`), servi par le serveur HTTP de F-008 : `demarrerServeur` reçoit un `Passage` et lui remet chaque événement `upgrade` (`apps/server/src/serveur.ts`). La synchronisation (`apps/server/src/synchronisation.ts`) examine la demande dans cet ordre : chemin (404), arrêt en cours (503), `Origin` présent et égal à `URL_PUBLIQUE` ou à une entrée de `ORIGINES_AUTORISEES` (403, `origineDuPassageAdmise`, `apps/server/src/origine.ts`), plafond du serveur (503), session lue par `Authentification.lireLaSession` sur les en-têtes de `enTetesPourBetterAuth` (`apps/server/src/comptes.ts`, 401, ou 500 si la lecture lève), plafond du compte (429). Un refus est une ligne d'état HTTP écrite sur la socket, sans corps ni enveloppe, puis la socket détruite ; la place est réservée avant `handleUpgrade` et rendue à l'établissement ou à la fermeture de la socket.
- **WebSocket et bibliothèque.** `WebSocketServer` de `ws` 8.22.0 sans serveur propre, `maxPayload` de 5 Mio, sans compression ; la WebSocket est remise à `Hocuspocus.handleConnection` de `@hocuspocus/server` 4.7.0 avec l'identité de la connexion en contexte. Réglages écrits : `debounce` 2 000 ms, `maxDebounce` 10 000 ms, `unloadImmediately`, `quiet`, `yDocOptions: { gc: true, gcFilter: () => true }` (ADR-0001). Crochets posés : `onAuthenticate`, `connected`, `onLoadDocument`, `onStoreDocument`, `onChange`, `beforeSync`.
- **Relais** (`apps/server/src/synchro-relais.ts`) : chaque message entrant passe par lui avant la bibliothèque. Débit de 600 messages par fenêtre fixe de 10 secondes, au-delà la connexion est fermée en 1008 `trop-de-requetes` ; adresse de message bornée à 144 octets ; ouvertures suivies d'après les messages que la bibliothèque envoie (accord, refus, fermeture) ; une demande d'ouverture n'est remise que pour un nom que la connexion ne tient pas, tout autre message que pour un nom ouvert ou en attente ; présence de 16 Kio au plus ; types sans état ou inconnus jamais remis.
- **Autorisation** (`apps/server/src/synchro-acces.ts`), à chaque ouverture : nom de document lu par `schemaNomDeDocument` ; 100 ouvertures au plus par connexion, place réservée avant toute attente ; décision de F-011 (`decider`, `apps/server/src/autorisation.ts`, action `lire-contenu`), lecture seule si le rôle n'a pas `ecrire-contenu`. Le serveur ne lit pas le document d'espace pour autoriser une page : l'identifiant de l'espace est dans le nom (ADR-0001, amendement du 2026-10-16). Droits réévalués sur le signal des adhésions (`apps/server/src/adhesions.ts`) dans le même tour : retrait, fermeture `acces-refuse` ; changement du droit d'écrire, lecture seule posée puis fermeture `droits-modifies` ; une époque par espace et par compte referme une ouverture établie après un changement survenu pendant sa décision. Filet de 60 secondes : chaque session relue, puis le rôle lu une fois par espace et par compte. Toute suppression de session ferme ses connexions en 1008 `non-authentifie` (abonnement à la fonction de suppression, `apps/server/src/sessions.ts`).
- **Stockage** (`apps/server/src/synchro-stockage.ts`, seul module du serveur qui lit une mise à jour ou écrit un instantané ; `packages/db/src/documents.ts`, seules requêtes de la table `document`) : un instantané complet par document, au format V1 de `Y.encodeStateAsUpdate`, une ligne remplacée en entier par enregistrement, sous le verrou de la ligne de l'espace (`verrouillerEspace`). Avant toute application d'une mise à jour d'une ouverture en écriture (`beforeSync`) : un message sans effet passe sans contrôle ; une mise à jour qui laisserait des structures en attente est refusée ; pour un document d'espace, la version de `meta` est éprouvée sur une copie (ADR-0002, amendement du 2026-10-16) ; la taille comptée (instantané stocké plus mises à jour acceptées depuis) reste sous 20 Mio ; la création d'une ligne passe le quota de 5 000 documents par espace. Un instantané illisible au chargement refuse l'ouverture (`erreur-interne`), sans servir de document vide. Un enregistrement en échec est relancé 10 secondes après, tant que le document est chargé, et jamais après ; un espace supprimé entre-temps n'est jamais recréé.
- **Contrat publié** (`packages/contrats/src/synchro.ts`) : chemin, types et nom de document, `LIMITES_SYNCHRO`, liste fermée de onze motifs (`MOTIFS_SYNCHRO`), canal de chaque motif (`CANAUX_DES_MOTIFS`), code de fermeture à l'arrêt (1001), versions admises du document d'espace. Aucune dépendance vers Yjs ni vers la bibliothèque.
- **Arrêt** (`Synchronisation.arreter`, attendu par `Ecoute.arreter`) : plus aucune demande acceptée, enregistrements en attente lancés et relances essayées une fois, attente de 3 secondes au plus, puis chaque WebSocket fermée en 1001, ce qui ferme ses ouvertures sans message et décharge les documents ; une WebSocket encore ouverte après une seconde attente de 3 secondes est coupée (`terminate`).
- **Assemblage** (`apps/server/src/assemblage.ts`) : la seule fonction qui réunit l'application HTTP et la synchronisation, appelée par `service.ts` en production, sans paramètre d'essai, et par la fabrique d'essai (`apps/server/test/fabrique.ts`, publiée par le manifeste sous `@notionlike/server/essai`, contrats `fabrique-d-essai-reservee-aux-tests` et `web-tests-serveur-par-la-fabrique`). La synchronisation lit les sessions par sa propre instance de better-auth, construite par la même fonction (`creerAuthentification`) sur la même base et la même fonction de suppression.
- **Journal** : une ligne `synchro` par événement (onze types, `apps/server/src/journal.ts`), aux champs fermés : type, adresse, compte, nom de document tronqué à 79 caractères, motif, code, classe de l'erreur ; jamais un octet de document ou de présence, ni le message d'une erreur, ni un cookie.
- **Dépendances** en versions exactes : `@hocuspocus/server` 4.7.0, `ws` 8.22.0, `y-protocols` 1.0.7, `yjs` 13.6.33, `lib0` 0.2.119 (contrat `serveur-liste-blanche` élargi, contrat `hocuspocus-serveur-et-ws-reserves-au-serveur`). Le serveur n'importe pas `@notionlike/document` à l'exécution (F-012 H5). `apps/server/src/stockage-local-neutre.ts`, importé en premier par chaque module qui charge `lib0`, remplace le `localStorage` global de Node 26 par `undefined` pour que la sortie d'erreur reste vide (F-008-AC11).

## Conséquences

- Tout client dépend du chemin, du cookie de session et de la table des motifs et des canaux : en changer un est une retouche de `packages/contrats` et des deux côtés. Un navigateur ne lit ni le statut ni le corps d'un refus de passage : il ne voit qu'une connexion qui n'aboutit pas, et doit en chercher la cause ailleurs (F-013 relit `GET /api/v1/moi`).
- Une seule instance : connexions, compteurs de débit, époques des droits et documents chargés vivent dans le processus. Une seconde instance demanderait une diffusion partagée et rouvrirait F-012-AC12 à AC14, AC18 et AC24 (H9).
- Instantané complet : chaque enregistrement réécrit tout le document (20 Mio au plus) ; aucun historique n'est gardé. Changer de format (V2, journal) demande de réencoder chaque ligne.
- Le serveur ne valide pas le contenu, hors la version du document d'espace et la complétude structurelle d'une mise à jour : un `editeur` peut écrire un document mal formé, et créer dans son espace jusqu'à 5 000 documents de page qu'aucune entrée de l'arborescence ne désigne (H2).
- Un refus de passage ne porte ni l'enveloppe d'erreur ni les en-têtes de `helmet` : exception à l'ADR-0004, amendé le 2026-10-16.
- Couplage à la bibliothèque : le relais relit le protocole (types de message, issue de l'authentification codée 1 et 2) et l'arrêt lit des membres de l'instance (`documents`, `debouncer.isDebounced`, `debouncer.isCurrentlyExecuting`, `saveMutex`). `@hocuspocus/server` 4.7.1 change des comportements dont dépend F-012-AC34 : une montée de version impose une retouche de la spec (`MEMORY/features/F-012.md`).
- Coûts relevés par la sécurité et non traités (D-023) : aucune limite de débit sur les demandes de passage, dont chacune lit une session en base avant le plafond du compte ; une copie complète du document d'espace par mise à jour (contrôle de version) ; 500 connexions pour tout le serveur ; présence relayée sans contrôle d'identité jusqu'à F-015.
- Le délai d'inactivité de la bibliothèque (60 secondes, fermeture 4408) reste à sa valeur par défaut et n'est pas au contrat.
- La fabrique d'essai fait d'`apps/server` une dépendance de développement d'`apps/web` : seule exception à la règle `apps-isolees`, réservée aux tests.

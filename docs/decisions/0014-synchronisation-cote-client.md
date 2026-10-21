# ADR-0014 — Synchronisation côté client : module `synchronisation/` d'`apps/web`, une connexion par onglet, registre de l'appareil, réplique de la page affichée

Statut : accepté (décision du dev du 2026-10-19, après correction des écarts) ; écrit après le code, le 2026-10-16 : consigne les choix de F-013, livrée sans ADR en mode économe et acceptée par dérogation, D-024 ; relu le 2026-10-19, « Registre de l'appareil » réécrit sur décision du dev du même jour pour une relecture illisible après une lecture réussie
Date : 2026-10-16 ; écarts au code corrigés le 2026-10-19

## Contexte et problème

F-013 (spec validée par le dev au commit `0847706`, fusionnée dans `main` par `0d04c60`) branche l'application du navigateur sur le point de synchronisation de F-012 (ADR-0013) : une personne connectée déclare au serveur l'espace de son appareil, écrit sans attendre le réseau, retrouve au retour du réseau ses modifications et celles des autres, et lit à l'écran ce qui est transmis. Le code a été écrit sans conception ni ADR (mode économe, dette D-024) ; `MEMORY/features/F-013.md` liste les décisions prises au code. Plusieurs se défont mal :

- le registre de l'appareil, écrit dans IndexedDB sur chaque appareil, qu'une version suivante devra relire ;
- la diffusion entre onglets, protocole entre deux onglets qui peuvent porter deux versions de l'application ;
- la place du réseau dans le client, que l'ADR-0012 réservait au module `compte/` ;
- le chemin d'une mise à jour reçue jusqu'au document que l'éditeur lie, où une perte serait destructive et propagée (F-013 H8).

Cet ADR les consigne d'après le code de `main` à `7746e17` et la spec (H1 à H20).

## Options étudiées

Place du module :

1. Dans `compte/`, seul module qui parle au serveur depuis l'ADR-0012. Écarté : `compte/` n'importe ni Yjs ni la persistance (contrat `web-compte-liste-blanche`), et la synchronisation tient des documents.
2. Dans `espace/`, à côté de la session. Écarté : `espace/` nomme le DOM et ne s'éprouve pas sous Node contre le serveur réel.
3. **Un module neuf, `apps/web/src/synchronisation/`, qui reçoit son environnement** (retenue, F-013 H13) : constructeur de WebSocket, horloge, aléa, signaux et canal entre onglets lui sont passés ; un seul fichier les assemble pour le navigateur. Il s'éprouve sous Vitest, environnement Node, contre le serveur de la fabrique d'essai.

Connexion :

- le fournisseur `@hocuspocus/provider` avec sa propre reconnexion ; ou **le fournisseur sans reconnexion, une WebSocket neuve par tentative, la reprise réglée par le module** (retenue, H12, H15) : la veille constate que le fournisseur se reconnecte seul et renvoie en boucle un message refusé par 1009 ; ou un client du protocole écrit à la main, écarté (disproportionné).

Page affichée :

- le fournisseur branché sur le document que l'éditeur lie ; ou **une réplique que le fournisseur et le canal modifient, recopiée dans le document lié après contrôle de version** (retenue, H8, seconde barrière après la garde de version de F-003).

Couverture de l'espace :

- la seule page affichée ; ou **une passe de fond qui échange chaque page de l'arborescence et de la corbeille à chaque connexion** (retenue, H6) : une page modifiée hors ligne puis quittée rejoint le serveur, et une page jamais ouverte est lisible hors ligne.

Onglets :

- une connexion partagée par un travailleur ; ou **une connexion par onglet, et un canal `BroadcastChannel` par document entre onglets** (retenue, H9, H15) : sans dépendance, sans serveur, et utile à l'espace qui n'est pas adopté.

Registre :

- une base IndexedDB à lui ; ou **une clé par espace dans la base de l'appareil**, à côté de l'identifiant de l'espace local (retenue, H3).

## Décision

- **Module `apps/web/src/synchronisation/`**, vingt fichiers, interface `index.ts` (contrat `web-synchronisation-par-son-interface`), qui n'exporte aucun type du fournisseur (test de couture `coutures-synchro.test.ts`). Il n'importe que lui-même, `persistance/index.ts` (par `stockage.ts` seul), les exports de `@notionlike/document`, l'entrée de `@notionlike/contrats`, `yjs` et `@hocuspocus/provider` (contrat `web-synchronisation-liste-blanche`) : ni React, ni l'interface, ni le compte, ni les sessions. Le fournisseur n'est importé que par ce module dans `apps/web` (contrat `hocuspocus-provider-confine`). `reseau.ts` est le seul fichier d'`apps/web/src` qui lit la globale `WebSocket` (`environnement.ts` et `connexion.ts` n'en nomment que le type) et le seul du module qui lit l'adresse de la page, ses signaux et `getRandomValues` (bloc ESLint dédié) ; les autres fichiers du module n'ont ni `window`, ni `document`, ni `navigator`, ni `location` (autre bloc ESLint).
- **Branchement** : `main.tsx` passe à `Application` une fabrique qui joint l'environnement du navigateur, l'état du compte et le client des espaces de `compte/`, adaptés par `interface/branchement-synchronisation.ts` ; `interface/synchronisation-ouverte.ts` démarre la synchronisation dans un effet quand l'écran de l'espace a son identifiant et son `Y.Doc` (état `pret`), et la ferme quand l'écran disparaît. Rien n'attend le réseau : l'arborescence et l'éditeur s'affichent dès leur relecture locale.
- **Adoption explicite** (H1, H2, `adoption.ts`) : « Synchroniser cet espace » envoie l'identifiant de l'espace local et le nom saisi par la création d'espace de F-011 (`POST /api/v1/espaces`, 201, ou 200 pour une création rejouée) ; sur 409 `identifiant-indisponible`, une lecture de l'espace dit si le compte en est membre (rattachement avec son rôle) ou non (l'espace reste local). Aucune WebSocket n'est ouverte avant l'adoption, ni tant que le compte n'est pas connecté.
- **Registre de l'appareil** (`apps/web/src/persistance/registre.ts`, H3) : dans la base `notionlike:appareil`, magasin `reglages`, une clé `registre:<idEspace>` par espace adopté, de valeur `{ rattachement: "adopte", droit: "ecriture" | "lecture" }`, deux champs exactement. Une entrée absente vaut `local`, et rien n'inscrit jamais `local`. Toute autre valeur, ou un échec, rend la lecture `illisible` : l'adoption n'est pas proposée, et la lecture est refaite de 2 à 60 secondes. L'onglet garde la dernière entrée lue avec succès (`synchronisation.ts`, `#lireLeRegistre`) : un espace dont l'entrée a déjà été lue reste adopté, avec son droit, et reste connecté pendant une relecture illisible ; il n'est tenu pour local que si aucune lecture n'a encore abouti dans l'onglet. Décision du dev du 2026-10-19 : un incident passager d'IndexedDB ne doit pas couper la synchronisation. Le registre ne crée ni ne répare la base : c'est l'affaire de l'ouverture de l'espace local (ADR-0008). Il ne porte ni nom, ni courriel, ni identifiant de compte.
- **Une connexion par onglet** (`connexion.ts`) : une `HocuspocusProviderWebsocket` neuve par tentative, `autoConnect: false`, `maxAttempts: 1`, détruite à la fin de la tentative ; échéance de 10 secondes par tentative. Reprise (`reprise.ts`) : 1 seconde, puis l'attente double jusqu'à 30 secondes, avec un aléa de 20 % au plus, sans limite de nombre, jamais plus d'une tentative par seconde ; aussitôt au retour du réseau ou de l'onglet. La perte du réseau (`offline`) coupe la connexion sans attendre la WebSocket. Chaque message sortant est mesuré : au-delà de la limite publiée il n'est pas émis et son document passe en envoi bloqué ; la passe de fond ne prend que la moitié du débit publié (le quart après une fermeture `trop-de-requetes`).
- **Une ouverture par document** (`ouverture.ts`) : un `HocuspocusProvider` attaché à la WebSocket de la tentative, sans présence, avec un jeton constant sans secret ; acquise à la réception de l'état du document, jamais au seul message `authenticated` ; portée inconnue lue comme lecture seule. Une ouverture fermée par le serveur est retirée de `configuration.providerMap` avant destruction, sans message de fermeture en retour ; une nouvelle ouverture d'un nom que l'onglet vient de fermer attend l'écho du serveur (5 secondes au plus, `fermetures.ts`). La conduite devant chaque couple (motif, canal) publié est une table fermée (`conduites.ts`) ; un motif d'ouverture hors de la liste se lit comme `nom-de-document-invalide` ; une connexion fermée sur une raison hors de la liste est reprise selon les délais.
- **Page affichée** (`page-affichee.ts`, `miroir.ts`) : une réplique du document lié, construite après sa relecture locale ; le fournisseur et le canal entre onglets n'écrivent que dans elle. Chaque mise à jour de la réplique n'atteint le document lié qu'après la lecture de sa version de page ; une version non prise en charge détruit l'éditeur (`refuserLaVersion` de la session de page), plus rien n'est recopié, et la réplique est enregistrée telle quelle dans la base de la page.
- **Passe de fond** (`passe-de-fond.ts`) : à chaque connexion, une fois l'ouverture du document d'espace acquise, chaque page de l'arborescence et de la corbeille qui n'est ni affichée, ni en envoi bloqué, ni quittée en attente d'accusé est ouverte avec sa base, échangée, écrite dans sa base, puis refermée ; quatre à la fois au plus, trois réouvertures au plus par page et par passe quand le motif en demande une ; la passe ne retient rien d'une fois à l'autre ; l'orchestre retient les envois bloqués, exclus des passes suivantes jusqu'à un geste ou au rechargement.
- **Entre onglets** (`canal.ts`) : un `BroadcastChannel` par document, nommé par le nom de document de F-012 (identifiant d'espace compris), qui porte des mises à jour V1 (`{ sorte: "maj" }`) et, à l'ouverture, une demande du vecteur d'état (`{ sorte: "demande" }`) ; une mise à jour reçue du serveur ou d'un autre onglet n'y est pas renvoyée. Un canal `registre:<idEspace>` annonce aux autres onglets l'adoption et l'effacement.
- **Effacements** (`stockage.ts`) : une suppression définitive reçue (serveur ou autre onglet) ferme, dans l'onglet, les documents des pages retirées (page affichée et pages conservées) et efface leurs bases ; « Effacer la copie locale » ferme tout, efface la base de l'espace et celle de chaque page, et, pour un espace détaché ou jamais adopté, retire l'entrée du registre et l'identifiant de l'espace local.
- **État visible** (`etat.ts`) : un état et un seul parmi huit (`detache`, `erreur`, `local`, `pause`, `hors-ligne`, `connexion`, `en-cours`, `synchronise`), le premier dont la condition est vraie ; « Synchronisé » exige les ouvertures acquises, aucune modification en attente d'accusé et la passe achevée. Le droit retenu au registre met l'espace en lecture seule : commandes désactivées avec leur raison, opérations refusées, éditeur non modifiable.
- **Garde d'onglet** : la confirmation avant de quitter n'est plus demandée pour une modification non enregistrée sur l'appareil mais acquittée par le serveur, document par document (`brancherLAcquittement`, `espace/garde-onglet.ts`).

### Amendement F-032 (2026-10-21, proposé) : changement d'espace, attente d'acquittement, retrait d'un espace

Contexte : F-032 ouvre dans l'onglet un espace choisi parmi ceux de l'appareil, et en retire (`specs/F-032.md`, AC12, AC15, AC20, AC21, H6). La synchronisation reste celle du seul espace ouvert. Détail dans `docs/decisions/F-032-conception.md`.

- **Une connexion par onglet, pour l'espace ouvert** (H6) : au changement, l'interface ferme la synchronisation de l'espace quitté (`fermer()`, qui détruit la WebSocket de la tentative de façon synchrone) avant que le pilote de l'onglet ouvre l'espace choisi ; la synchronisation de celui-ci naît dans l'écran remonté, sur une WebSocket neuve. La veille du 2026-10-21 constate contre le serveur réel que cette destruction suffit : le serveur voit la déconnexion puis décharge chaque document en moins de 5 ms. Les espaces non ouverts ne sont pas synchronisés en fond : leurs modifications en attente partent à leur prochaine ouverture, par la passe de fond.
- **`attendreLAcquittement(delaiMs)`**, onzième membre de `Synchronisation` : rend `acquitte` dès que toute modification de l'espace ouvert est acquittée, `non-acquitte` aussitôt si la connexion n'est pas établie, à l'échéance sur l'horloge de l'environnement, ou à la fermeture ; jamais rejetée. L'interface l'appelle avec 2 secondes avant un changement (F-032-AC12).
- **`retirerDeLAppareil({ environnement, idEspace })`** (`synchronisation/retrait.ts`, exportée par `index.ts`) : retrait d'un espace qui n'est pas ouvert dans l'onglet. Elle annonce `effacement` sur le canal `registre:<idEspace>`, efface les bases de l'espace énumérées par leur nom ou, sans énumération, la base du document d'espace et celles des pages lues dans un document témoin ouvert sur cette base le temps de la lecture, retire l'entrée du registre (et ce que l'appareil retient de l'espace, ADR-0008 amendé), puis annonce `efface`. Le protocole du canal du registre ne change pas : un onglet ouvert sur cet espace se ferme et se recharge par le code de F-013-AC24, une version de F-013 comprise.
- **Effacement de la copie locale** (`stockage.ts`) : par la même énumération, les pages lues de l'arborescence et de la corbeille servant de repli ; il emporte donc aussi les bases orphelines de l'espace. L'oubli d'un espace détaché ou jamais adopté passe par `retirerDuRegistre`, qui retire désormais aussi son nom, sa marque et l'espace retenu s'il le désigne : le rechargement qui suit rouvre l'espace de l'appareil.
- **`droitDuRole`** est exporté par `index.ts` : l'ajout d'un espace à l'appareil inscrit le droit par la même règle que l'adoption.
- **Canal des espaces de l'appareil** : `espaces-de-l-appareil`, tenu par `espace/appareil.ts`, hors du module ; la synchronisation n'en connaît rien. Il ouvre ses canaux par la fonction `ouvrirUnCanal` de l'environnement du navigateur, que `main.tsx` lui passe.

Conséquences de l'amendement :

- Une modification faite dans un espace puis laissée sans accusé au changement ne part qu'à la prochaine ouverture de cet espace sur cet appareil ; le plafond de 20 connexions par compte reste celui d'un onglet par connexion.
- Le canal `registre:<idEspace>` sert désormais à un onglet qui n'a pas cet espace ouvert : un script de la même origine pouvait déjà y faire fermer un onglet (consigné plus bas), rien ne s'y ajoute.
- Le repli sans énumération ouvre la base d'un espace non ouvert pour lire ses pages : il écrit l'enregistrement vide de deux octets de F-002 H15 dans une base aussitôt effacée.

## Conséquences

- Le registre est un format stocké sur les appareils : sa clé et sa valeur sont à relire telles quelles par toute version suivante ; une valeur de plus serait lue `illisible` par cette version, qui ne proposerait plus l'adoption. Il ne remplace pas la réparation de l'identifiant de l'espace local par énumération des bases (D-009 reste ouverte).
- Une connexion par onglet : le plafond de 20 connexions par compte (ADR-0013) borne le nombre d'onglets et d'appareils synchronisés à la fois.
- Le protocole entre onglets n'a pas de version : un onglet d'une version plus récente envoie ses mises à jour à un onglet plus ancien ouvert sur le même document. Pour une page, la réplique et sa garde de version les arrêtent ; pour l'espace, c'est la façade de la session qui refuse la version (ADR-0002, ADR-0007). Ce canal ne passe par aucun contrôle du serveur : tout script de la même origine y écrit.
- La lecture seule n'est qu'un confort côté client : le serveur reste juge (ADR-0013) et refuse toute écriture d'un lecteur.
- Dépendances à la bibliothèque : `configuration.providerMap`, membre typé de l'interface publique de `@hocuspocus/provider` 4.7.0 absent de son README (un test de couture le vérifie sur les types installés) ; l'écho `provider_initiated` d'une fermeture demandée par le client ; la lecture des messages du protocole par `protocole.ts`. La version du fournisseur est égale à celle du serveur (4.7.0 dans les deux manifestes), sans test qui tienne cette égalité.
- Une copie locale reste lisible et modifiable sur l'appareil après une déconnexion ou un retrait du compte (accepté par la spec, F-010 H4) ; seul le geste « Effacer la copie locale » la retire.
- La session d'espace est fermée en production pour la première fois (avant l'effacement de la copie locale, et quand un autre onglet annonce le sien), contrairement à ce que l'ADR-0007 prévoyait (F-014), amendé le 2026-10-16.
- Le réseau n'est plus le fait du seul module `compte/` : l'ADR-0012 est amendé le 2026-10-16. Les deux requêtes REST de la synchronisation passent toujours par le client des espaces de `compte/`.

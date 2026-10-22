# ADR-0020 — Présence : table d'attribution du serveur, état publié réduit à l'identifiant et au curseur, objet de présence filtré côté client

Statut : proposé
Date : 2026-10-22

## Contexte et problème

F-015 affiche qui a la page ouverte et où chacun a son curseur, sous un nom que le serveur atteste (`specs/F-015.md`, H1 à H4). Trois choix y sont difficiles à défaire, parce qu'ils fixent un format échangé entre versions du client et du serveur, ou la forme de deux interfaces de modules livrées (synchronisation de F-013, édition de F-003) :

1. Comment le serveur attribue un identifiant de client Yjs à un compte, pour écarter un état, une modification ou un retrait qui touche la présence d'un autre compte (F-015-AC16, AC17, AC23, AC34). La veille du 2026-10-22 (`MEMORY/VEILLE.md`, « @hocuspocus/server et @hocuspocus/provider 4.7.0 et 4.7.1 ») constate que la bibliothèque ne rattache un identifiant à une ouverture qu'à sa première apparition dans le document chargé : après une reconnexion, l'état republié n'est rattaché à aucune ouverture, n'est pas retiré à la fermeture suivante, et un retrait forgé par un autre membre l'efface en 4.7.1.
2. La forme de l'état de présence qui circule sur le réseau (F-015-AC2, AC30). Tout champ de plus serait écrit par l'appareil d'un pair, donc falsifiable ; un schéma strict validé par le serveur refuse ensuite tout champ qu'un client plus récent ajouterait.
3. Ce que reçoit l'extension de curseurs de Tiptap (F-015-AC12, AC20, AC29). Elle n'est pas tolérante (un état hostile lève une exception non interceptée et fige ensuite l'affichage de tous les curseurs), elle écrit `color` et `name` dans l'objet `user` du pair, elle écrit son curseur dans l'objet de présence qu'on lui remet à chaque changement de sélection sans regroupement, et le greffon écarte le client dont l'identifiant est celui du `Y.Doc` lié à l'éditeur (veille, « @tiptap/extension-collaboration-caret 3.31.4 et greffon de curseurs de @tiptap/y-tiptap 3.0.9 »). Or le document que l'éditeur lie n'est pas celui que le fournisseur synchronise : la page affichée passe par une réplique (ADR-0014, `synchronisation/miroir.ts`), d'identifiant de client différent.

## Options étudiées

Attribution côté serveur :

- s'appuyer sur les ouvertures que tient la bibliothèque (`document.connections.get(connexion).clients`) : écarté, faux après une reconnexion (constaté, H4 d) ;
- ajouter soi-même l'identifiant accepté à ce champ : corrige l'effet (constaté) mais le champ n'est pas documenté comme interface ; écarté ;
- décoder la présence dans le relais de messages de F-012 : écarté, le relais ne lit que l'adresse et le type d'un message (F-012-AC25), et la bibliothèque décode déjà la mise à jour en une carte modifiable dans son crochet ;
- **une table propre au serveur, par document, de l'identifiant de client vers le compte et l'ouverture qui l'ont publié, tenue dans le crochet `beforeHandleAwareness` et vidée au crochet `onDisconnect`** : retenue (F-015-AC17 la prescrit).

Forme de l'état publié :

- l'état par défaut de l'extension (`user` fusionné avec `{ name: null, color: null }`, nom et couleur fournis par l'appareil) : écarté par H1 ;
- **`{ user: { id }, cursor: null | { anchor, head } }`, schéma strict publié par `packages/contrats`, borné à 1 Kio** : retenu ; le nom vient de la liste des membres, la couleur d'une fonction pure de l'identifiant.

Ce que reçoit l'extension :

- l'objet de présence du fournisseur lui-même : écarté ; les états hostiles l'atteignent, le greffon modifie les états reçus, et son curseur partirait sans regroupement (F-015-AC20) ;
- le greffon `yCursorPlugin` monté seul avec `awarenessStateFilter` : le filtre écarte un état avant sa lecture, mais ne règle ni le regroupement ni la modification des états conformes par le greffon, et un greffon ajouté après la création de l'éditeur reconfigure l'état ProseMirror, ce qui détruit et recrée toutes les vues de greffons, liaison Yjs comprise ; écarté ;
- **un objet de présence filtré, propre au module de présence d'`apps/web`, remis à l'extension à la création de l'éditeur : il ne tient que des copies validées des états reçus, et l'état local que l'extension y écrit n'est lu que pour son curseur** : retenu (premier moyen de F-015-AC2 et de F-015-AC12).

## Décision

**Serveur.** Un module `apps/server/src/synchro-presence.ts` tient, par nom de document, une table `identifiant de client → { compte, ouverture }`, l'ouverture étant désignée par l'objet de contexte que la bibliothèque garde pour elle et remet à ses deux crochets (`connection.context` dans `beforeHandleAwareness`, `context` dans `onDisconnect`). Le crochet de présence ne lève jamais : il retire des entrées de `states` et de `removedClients` (champ de 4.7.1), la bibliothèque réencodant ce qui reste. Pour chaque état du message : vide (`{}`), il passe sans attribution ni ligne, sauf sous un identifiant attribué à un autre compte ; non conforme au schéma, d'un autre compte que celui de la connexion, ou sous un identifiant attribué à un autre compte, il est écarté ; sous un identifiant du même compte, il passe et l'identifiant est rattaché à l'ouverture courante ; sous un identifiant inconnu, il est inscrit, sauf si le compte en tient déjà 20 sur ce document (plafond lu dans le contrat). Un retrait d'un identifiant attribué à un autre compte est écarté ; un retrait par le même compte passe et garde l'attribution jusqu'à la fermeture de l'ouverture. Chaque écart donne une ligne `presence-ecartee` (compte, document, cause ; aucun octet de l'état). À la fermeture d'une ouverture, quelle qu'en soit la cause, les identifiants que la table lui attribue sont retirés de l'objet de présence du document (`removeAwarenessStates` de `y-protocols`, que la bibliothèque diffuse) et de la table. Rien n'est stocké ; la table vit dans le processus (une seule instance, ADR-0013).

**Contrat.** `packages/contrats/src/presence.ts` publie le schéma strict de l'état (`user`, objet dont le seul champ est `id`, au format de `schemaCompte` ; `cursor` absent, nul, ou `{ anchor, head }`, chacun une position relative Yjs sérialisée de forme close et bornée, dont au moins `item`, `type` ou `tname`), la liste fermée des champs, la borne de 1 024 octets de l'état sérialisé, le plafond d'états par compte et par document (`LIMITES_SYNCHRO.connexionsParCompte`) et le nom d'événement `presence-ecartee`. Serveur et client valident par ce schéma, sans le recopier. Le contrat ne dépend ni de Yjs ni de Hocuspocus.

**Client, deux objets de présence par page affichée.**

- _L'objet publié_, propriété du module de synchronisation : un `Awareness` de `y-protocols` créé sur la réplique, pour chaque ouverture de la seule page affichée (le document d'espace, la table affichée et la passe de fond restent sans présence, F-013-AC9), remis au fournisseur, détruit avec lui. L'horloge de présence est reportée de l'objet de l'ouverture précédente sur le suivant avant toute publication (F-015-AC35). Le module retient le dernier état demandé, ne l'applique que l'ouverture acquise, et le republie une fois à chaque ouverture acquise. L'interface du module expose un canal de présence par document lié (`presence(doc)`) qui n'expose aucun type du fournisseur : publier, oublier, lire et observer les états reçus, savoir s'il est disponible et sous quel identifiant de client l'onglet publie.
- _L'objet filtré_, propriété du nouveau module `apps/web/src/presence/` (sans React, sans DOM, sans fournisseur, sans Tiptap) : un `Awareness` créé sur le document que l'éditeur lie, donc de même identifiant de client que la liaison, qui ne tient comme états distants que des copies des états conformes reçus par le canal (50 au plus, les premiers reçus ; ni l'identifiant publié par l'onglet ni le sien). Le module remplace ces copies et émet lui-même `change`. Il lit le curseur que l'extension écrit dans l'état local de cet objet, compose `{ user: { id }, cursor }` avec l'identifiant de compte tenu en mémoire, et le publie sur le canal, regroupé à 5 messages par seconde au plus.
- Le module d'édition reçoit l'objet filtré et une fonction `etiquette(idCompte)` (nom et couleur) ; il monte l'extension `@tiptap/extension-collaboration-caret` avec son propre rendu du trait, de l'étiquette et de l'étendue (classes des jetons, aucun style en ligne), qui ne lit de l'objet `user` que `id`.

## Conséquences

- Contrat réseau figé par un schéma strict : ajouter un champ à l'état de présence demande de déployer d'abord un serveur qui l'admet, faute de quoi chaque état d'un client plus récent est écarté et journalisé. Ce qui est publié ne change que par ajout (F-012-AC27).
- Le nom affiché dépend d'une requête REST à la liste des membres ; un membre renommé garde son ancien nom jusqu'à la requête suivante (H1).
- Deux identifiants de client par page affichée et par onglet : celui de la réplique, sous lequel l'onglet publie et que voient le serveur et les pairs ; celui du document lié, sous lequel l'extension écrit localement. Une nouvelle réplique, donc un nouvel identifiant publié, à chaque affichage d'une page.
- Le module de synchronisation écrit l'horloge d'un objet de présence neuf par son champ public `meta` (constaté par la veille) ; le module de présence remplace les états distants de l'objet filtré par son champ public `states`. Deux usages de champs publics de `y-protocols` 1.0.7 non décrits comme interface dans sa documentation : un test de couture les éprouve sur le paquet installé, et une montée de `y-protocols` les rejoue.
- L'étiquette d'un curseur est un widget ProseMirror dont la clé est l'identifiant de client : un nom résolu après le premier rendu n'y apparaît que si le module de présence retire puis rajoute la copie de ce client.
- Un membre peut prendre l'identifiant de client publié d'un autre entre la fermeture d'une ouverture de ce dernier et sa republication : il ne se montre pas sous son nom (contrôle d'identité), mais le rend invisible sur cette page jusqu'à son prochain affichage de page, qui change d'identifiant. Risque accepté : la spec interdit d'attribuer un état vide (F-015-AC34).
- La table vit dans le processus : plusieurs instances du serveur demanderaient de la partager (hors périmètre, F-012 H9).
- Le défaut D-023 « présence usurpable » est levé par ce contrôle ; les autres points de D-023 restent.

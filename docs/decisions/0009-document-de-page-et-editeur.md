# ADR-0009 — Document de page : contenu Tiptap dans un fragment Yjs, version à maximum, éditeur confiné

Statut : accepté
Date : 2026-10-12 (écrit après le code, sur `c2ac84d` ; la spec F-003 demandait cet ADR avant le premier commit de code, il ne l'a pas précédé)
Accepté par le dev le 2026-10-13, après le code (écart de calendrier relevé par le gate d'architecture de F-003).

## Contexte et problème

F-003 donne un contenu aux pages : un document Yjs par page (ADR-0001), édité dans le navigateur. Trois décisions de la spec F-003 se défont mal, parce que chaque appareil, puis le serveur (F-012), conserveront ce que le client écrit : le modèle du contenu (H1), l'interface du paquet `@notionlike/document` pour ce document (H3), la forme stockée de sa version (H4). La spec les tranche et demande qu'elles soient consignées ici.

Fait établi par la veille du 2026-10-08 (`MEMORY/VEILLE.md`, Tiptap 3.31.4, `@tiptap/y-tiptap` 3.0.9) : la liaison entre Tiptap et Yjs supprime du document partagé tout nœud que son schéma ne connaît pas, à l'ouverture comme à la réception d'une mise à jour, et cette suppression se propage à toutes les répliques. Une application plus ancienne détruirait donc un contenu plus récent : le numéro de version doit être connu avant que la liaison n'existe, et sa garde doit agir avant les observateurs profonds de la liaison.

## Options étudiées

Modèle du contenu :

1. **Fragment XML Yjs piloté par le schéma de Tiptap 3** (retenue) : la liaison existe et traite sélection, collage, saisie par méthode d'entrée et annulation.
2. Arbre de blocs maison (une `Y.Map` par bloc avec identifiant, type, texte et rang, sur le modèle de l'ADR-0002). Écarté : la liaison serait à écrire bloc par bloc, disproportionné pour un outil interne.

Forme stockée de la version :

- a. Une valeur unique, la dernière écriture gagnant. Écartée : deux élévations concurrentes à 2 et à 3 peuvent laisser 2 sur un document qui contient un élément de la version 3.
- b. **Un type racine `Y.Array` distinct du fragment, une entrée par version atteinte, jamais retirée, lue au maximum** (retenue).
- c. Une version inscrite dans le fragment. Écartée : l'historique d'annulation de la liaison, qui suit le fragment, la déferait.

Interface du paquet :

- i. Le `Y.Doc` seul (ADR-0003). Insuffisant : la liaison a besoin du fragment, et `apps/web` n'a pas le droit de le demander (ESLint y interdit `getXmlFragment`).
- ii. **Une façade `DocumentPage` sur le modèle complet de `DocumentEspace`, qui expose aussi le fragment** (retenue).

Place de la bibliothèque d'édition : partout dans `apps/web`, ou **confinée à un module d'édition atteint par sa seule interface** (retenue, F-003-AC27).

## Décision

- Format (`packages/document/src/format-page.ts`, seul fichier qui en connaît les noms) : type racine `contenu`, un `Y.XmlFragment`, seul type où l'éditeur écrit ; type racine `versions`, un `Y.Array`. La version lue est le plus grand entier supérieur ou égal à 1 du tableau, et 1 s'il est vide : rien n'est inscrit pour la version 1, ni à l'ouverture ni à la création d'une page. Une entrée qui n'est pas un tel entier, une entrée nommée, ou un type racine déjà lu sous une autre nature rendent le document non pris en charge.
- Table des versions : `TABLE_DES_VERSIONS_PAGE`, une ligne par version (nœuds et leurs attributs, marques, types partagés ajoutés). Ligne 1 : `doc`, `paragraph`, `text`, `heading` (`level`), `bulletList`, `orderedList` (`start`, `type`), `listItem`, aucune marque. `VERSION_PAGE_PRISE_EN_CHARGE` est le numéro de la dernière ligne. Le schéma de l'éditeur est cette dernière ligne (test de F-003-AC22).
- Façade : `ouvrirDocumentPage(doc)` n'écrit rien et lève `version-non-prise-en-charge` sur un document non pris en charge. `DocumentPage` porte `doc`, `contenu`, `lireVersion()`, `eleverVersion(n)` (ajout seul, sans effet si `n` ne dépasse pas la version lue ; refus `facade-fermee` puis `version-invalide`, nouveau code du paquet), `garderVersion(rappel)` et `fermer()`. `lireVersionPage(doc)` lit la version sans lever ni observer. Aucune fonction de création.
- Garde de version : la façade observe `versions` par un observateur simple, que Yjs appelle avant les observateurs profonds ; la liaison observe le fragment en profondeur. Le rappel de garde de la session de page détruit l'éditeur dans la transaction même qui inscrit une version non prise en charge, avant que la liaison ne retire le contenu nouveau.
- Éditeur : Tiptap 3.31.4 en paquets unitaires, sans kit de départ ; l'annulation est celle de l'extension de collaboration, dont la portée est le seul fragment. `@tiptap/y-tiptap` 3.0.9 et `y-protocols` 1.0.7 sont déclarés par `apps/web` pour la liaison, et aucun fichier de `src/` ne les importe. Pas de `@floating-ui/dom` : la position de la barre de blocs est un calcul sur les rectangles mesurés (`edition/placement.ts`).
- Confinement : Tiptap, ProseMirror et la liaison ne sont importés que par `apps/web/src/edition/` et l'aide de ses tests ; hors du module, seul `edition/index.ts` est importable, et il n'exporte que le composant `EditeurDePage` et le type de ses propriétés, faites de types de `yjs` et de fonctions. Contrats `edition-confinee`, `web-edition-par-son-interface`, `web-edition-liste-blanche` et `web-page-liste-blanche`, posés par le dev (`c2ac84d`).

## Conséquences

- Entorse à l'ADR-0003 : le paquet expose un type partagé, le fragment du contenu. Le reste du format (noms des types racines, forme de la version) n'en sort pas.
- Le format stocké est dicté par une bibliothèque, les blocs n'ont pas d'identifiant stable, et Yjs ne sait pas déplacer un nœud (F-006, F-016). Changer de modèle demanderait de convertir chaque page sur chaque appareil.
- Toute feature qui ajoute au schéma un nœud, un attribut, une marque, ou un type partagé au document, ajoute une ligne à la table, relève la version prise en charge et appelle `eleverVersion` au plus tard dans la transaction qui inscrit le premier élément nouveau. Dans F-003, `eleverVersion` n'a aucun appelant de production.
- Non garanti : un contenu nouveau reçu dans une mise à jour, et sa version dans une mise à jour suivante. La liaison retire le contenu avant que la version ne soit connue ; risque accepté par la spec F-003 (H4, cas a), qui ne peut venir que d'un client qui enfreint la règle ci-dessus ou d'un maillon qui scinde une transaction.
- Un document conservé par le client et par le serveur garde le tableau `versions` pour toujours ; il ne grandit que d'une entrée par version atteinte et par réplique qui l'élève.

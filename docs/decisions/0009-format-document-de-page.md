# ADR-0009 — Format du document de page : fragment `contenu`, versions inscrites dans `versions`, garde par observateur simple

Statut : proposé
Date : 2026-10-08

## Contexte et problème

F-003 fait naître le document de page (ADR-0001 : un document Yjs par page). Son format se défait mal : il sera conservé sur chaque appareil, puis par le serveur. Trois faits de la veille du 2026-10-08 le contraignent :

- la liaison Yjs de Tiptap supprime du document partagé tout nœud ou marque que son schéma ignore, pour toutes les répliques : la version de format est la seule parade, et elle doit agir avant la liaison ;
- dans une transaction, Yjs appelle les observateurs simples de chaque type modifié avant tout observateur profond ; la liaison observe le fragment en profondeur ;
- l'historique d'annulation de la liaison ne suit que le fragment.

La spec impose (F-003 H1, H3, H4) : contenu dans un fragment XML piloté par le schéma de Tiptap ; version lue égale à la plus haute jamais inscrite ; forme stockée hors du fragment ; aucune écriture à l'ouverture ; `packages/document` avec `yjs` seul.

## Options étudiées

Contenu :

- **A. Un fragment XML Yjs écrit par la liaison de Tiptap** (retenue, F-003 H1). Prix connu : pas d'identifiant de bloc, un déplacement est une suppression suivie d'une insertion, le format des nœuds est dicté par Tiptap.
- B. Un arbre de blocs maison, une entrée Yjs par bloc. Écartée : la liaison avec un éditeur serait à écrire bloc par bloc, disproportionné pour un outil interne.

Forme stockée de la version :

- A. Une clé `version` dans une `Y.Map`, dernière écriture gagnante, comme le document d'espace. Écartée : deux élévations concurrentes à 2 et à 3 peuvent laisser 2 sur un document qui contient un élément de la version 3.
- **B. Un tableau racine en ajout seul, `Y.Array` d'entiers ; la version lue est le maximum** (retenue). Deux ajouts concurrents survivent tous deux, quels que soient l'ordre et les identifiants de client ; la validité se lit sur les valeurs elles-mêmes.
- C. Une `Y.Map` dont les clés sont les numéros de version. Équivalente pour la convergence ; écartée parce que la version y serait une clé textuelle à analyser.
- D. Un attribut du fragment. Écartée : dans la portée de l'historique d'annulation, une annulation pourrait abaisser la version.

Garde :

- **A. Un observateur simple (`observe`) du tableau `versions`** (retenue). Essayé avec un éditeur réel dans les trois cas de F-003-AC29 : l'éditeur est détruit avant que la liaison n'agisse, le nœud inconnu reste dans le document.
- B. L'événement `beforeObserverCalls` du document. Tenable aussi ; écarté parce qu'il s'exécute à chaque transaction, y compris à chaque frappe.
- C. `observeDeep`, `afterTransaction`, `update`. Écartées : la liaison passe avant (veille).

## Décision

Un document de page porte deux types racine, dont `packages/document/src/format-page.ts` est le seul à connaître les noms :

| Type racine | Type Yjs        | Écrit par                                         |
| ----------- | --------------- | ------------------------------------------------- |
| `contenu`   | `Y.XmlFragment` | la liaison de Tiptap, dans le module d'édition    |
| `versions`  | `Y.Array`       | `eleverVersionPage`, et elle seule ; jamais vidée |

- Version lue : le plus grand entier supérieur ou égal à 1 de `versions`, ou 1 si le tableau est vide. Rien n'est inscrit pour la version 1 : ouvrir ou créer une page n'écrit rien.
- Élévation : `eleverVersionPage(doc, v)` ajoute `v` si `v` dépasse la version lue, sans transaction propre (elle rejoint celle de l'appelant) ; elle refuse par `version-invalide` ce qui n'est pas un entier supérieur ou égal à 1 ; elle n'est pas bornée par la version prise en charge. Aucun appelant dans l'application tant que le schéma n'est pas étendu.
- Refus : `ouvrirDocumentPage` lève `version-non-prise-en-charge` si la version lue dépasse la version prise en charge, ou si `versions` porte autre chose que des entiers supérieurs ou égaux à 1.
- Table des versions : `TABLE_DES_VERSIONS_PAGE`, dans `format-page.ts`, exportée. Une ligne par version : nœuds et leurs attributs, marques, types racine ajoutés à côté de `contenu`. Ligne 1 : `doc`, `paragraph`, `text`, `heading` (`level`), `bulletList`, `orderedList` (`start`, `type`), `listItem` ; aucune marque ; aucun type ajouté. La version prise en charge est le numéro de sa dernière ligne. Une feature qui étend le format ajoute une ligne et ne retouche aucune ligne existante.
- Garde : `DocumentPage.garderVersion(rappel)` appelle `rappel` dans l'observateur simple de `versions`, à chaque modification qui laisse le document non pris en charge. Le module d'édition y détruit son éditeur ; il le crée et s'y abonne dans un même effet React, parce qu'un éditeur né pendant le rendu laisse sous `StrictMode` une seconde liaison que la garde ne détruit pas (essayé).
- Frontières : Tiptap, ProseMirror et `@tiptap/y-tiptap` ne s'importent que dans `apps/web/src/edition/` et ses tests ; ce module reçoit le fragment et la garde, pas la façade ; le schéma Tiptap y vit (F-003 H5) et un test le compare à la dernière ligne de la table.

## Conséquences

- Le fragment sort de `@notionlike/document` : entorse assumée au principe « le `Y.Doc` et lui seul » de l'ADR-0003, la liaison en a besoin. Le tableau `versions` n'en sort pas.
- Renommer `contenu` ou `versions`, ou changer la forme stockée, demande une migration de chaque page sur chaque appareil.
- `versions` peut porter des doublons après des élévations concurrentes : au plus un par réplique et par version, sans effet sur la lecture.
- Risques résiduels acceptés : un contenu nouveau reçu dans une mise à jour qui précède celle de sa version est supprimé par la liaison (F-003 H4, cas (a) ; à couvrir par F-013 avant `applyUpdate`) ; une mise à jour forgée qui supprime une entrée de `versions` abaisse la version lue (aucun réseau dans F-003 ; à traiter avec F-012 et F-013).
- Le serveur lira la version d'une page avec `lireVersionPage`, sans Tiptap.

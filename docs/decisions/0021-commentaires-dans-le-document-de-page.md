# ADR-0021 — Commentaires d'une page : type racine `commentaires` du document de page, une entrée par fil et par commentaire, ancres en positions relatives JSON, liaison `@tiptap/y-tiptap` 3.0.9

Statut : proposé
Date : 2026-10-26

## Contexte et problème

F-016 (`specs/F-016.md`, validée, structurel) fait commenter une page. La spec tranche l'emplacement (H1 : dans le document Yjs de la page, type partagé distinct du fragment), l'ancre (H6, AC36 : deux positions relatives Yjs sous leur forme JSON, plus un extrait), la règle de version (H5, AC27, AC28 : une ligne de plus dans la table des versions, élévation à l'inscription du premier commentaire) et laisse à la conception la forme exacte du type (H11), sous des contraintes de convergence qui excluent plusieurs formes naturelles :

- une réponse écrite pendant la suppression concurrente du commentaire d'origine ou du dernier commentaire de son fil est conservée, avec l'ancre et l'état du fil (AC18) ;
- une suppression concurrente d'une modification gagne, sur toutes les répliques (AC19) ;
- deux résolutions et réouvertures concurrentes convergent vers le même état (AC10) ;
- l'ordre des fils et des réponses vient de la structure du document, jamais des horloges (AC8, H11) ;
- un commentaire supprimé ou modifié quitte l'état encodé, ramasse-miettes actif (AC12, AC38) ;
- la lecture tolère tout contenu mal formé sans rien écrire (AC25), et le type est nommé et ouvert en un seul endroit, son ouverture protégée (AC37).

S'y ajoute un choix que la veille rafraîchie du 2026-10-26 (`MEMORY/VEILLE.md`, section « F-016 : rafraîchissement ») oblige à faire : `@tiptap/y-tiptap` 3.0.10, publiée le 2026-10-13 et imposée par `@tiptap/extension-collaboration` 3.32.0, suit les blocs déplacés, ce que 3.0.9, installée, ne fait pas.

Difficile à défaire : le format est stocké sur chaque appareil et sur le serveur ; un numéro de version livré ne change plus de sens (F-028 H1).

## Options étudiées

Forme du type racine :

1. `Y.Map` racine, identifiant → valeur JSON immuable par commentaire. Écartée : une modification concurrente d'une suppression crée une nouvelle valeur que la suppression n'a pas vue, et le commentaire revient (contraire à AC19). L'ordre devrait venir d'un champ (date : contraire à AC8 ; rang : voir 2).
2. `Y.Map` racine, identifiant → `Y.Map` par commentaire, ordre par rang fractionnaire (`rang.ts`, F-029, comme le document de table). Tient AC19 ; mais un commentaire ne change jamais de place : le rang n'apporte que du code (lecture du dernier rang, départage de deux rangs égaux) pour un ajout en fin de liste.
3. Fil portant ses réponses dans un type imbriqué. Écartée par la veille (constat rejoué le 2026-10-26) : une réponse ajoutée dans une entrée imbriquée retirée en même temps est perdue (contraire à AC18).
4. **`Y.Array` racine de `Y.Map`, une entrée par fil et une par commentaire, ajout en fin seulement** (retenue). `push` place l'entrée après tout ce que l'appareil a vu : l'ordre du tableau est un ordre de création compatible avec la causalité, et deux ajouts concurrents sont départagés par Yjs de la même façon sur toutes les répliques (AC8). Une réponse est une entrée à part : la suppression d'une autre entrée ne la touche pas (AC18). Supprimer une entrée retire sa `Y.Map` ; une écriture concurrente dans une `Y.Map` dont l'élément est supprimé est supprimée à son intégration (AC19) ; le ramasse-miettes retire le contenu de l'élément supprimé et la valeur remplacée d'une clé (AC12, AC38).

Place de l'ancre et de l'état d'un fil :

- a. Dans le commentaire d'origine. Écartée : supprimer l'origine d'un fil qui a des réponses doit garder ancre et état (AC12) ; il faudrait vider des champs au lieu de retirer l'entrée, et une modification concurrente remettrait le texte dans l'état encodé.
- b. **Dans une fiche de fil distincte, jamais retirée** (retenue). Retirer la fiche quand son dernier commentaire est supprimé rendrait orpheline une réponse concurrente (AC18 cite « le dernier commentaire d'un fil »).

Version de la liaison Yjs de Tiptap :

- i. **Rester sur `@tiptap/y-tiptap` 3.0.9 et Tiptap 3.31.4, versions installées sur `main`** (retenue).
- ii. Monter à 3.0.10 (donc à Tiptap 3.32.0) pour que les ancres suivent un bloc déplacé. Écartée, pour cinq raisons constatées par la veille :
  - la liaison crée dans chaque document édité un type racine `__tiptap_position_migrations:root:<fragment>`, absent de la table des versions et interdit par F-016-AC39 (« sans autre type racine nouveau que celui des commentaires ») ;
  - ce type grandit sans nettoyage (20 déplacements : de 149 à 17 879 octets), et ses entrées sont vivantes : le ramasse-miettes ne les retire pas, elles s'imputent sur le plafond de 20 Mio du document (F-012-AC23) ;
  - le nœud inconnu n'est plus retiré mais suspend l'édition (`projectionError`) : F-003 H4, l'ADR-0009 et leurs tests décrivent l'inverse ;
  - un parc mixte (un appareil resté en 3.0.9) perdrait quand même les ancres des blocs qu'il déplace ;
  - F-016-AC20 exige qu'un bloc déplacé détache son fil, et H13 n'admet aucune dépendance changée : ce serait une autre feature.

## Décision

**Format.** `packages/document/src/format-page.ts` nomme le type ; `packages/document/src/commentaires.ts` en connaît les champs, et c'est le seul fichier à les lire et à les écrire.

- Type racine `commentaires`, un `Y.Array`, ouvert par `doc.getArray` dans la seule fonction `typeDesCommentaires(doc)` de `format-page.ts`, sous `try` : elle rend `undefined` si le nom a déjà été ouvert sous une autre nature.
- Chaque élément est une `Y.Map` dont la clé `sorte` vaut `"fil"` ou `"commentaire"`, et la clé `id` un UUID canonique en minuscules, tiré sur l'appareil par `crypto.randomUUID()` dans le paquet (comme les pages et les lignes de table).
- Fiche de fil :
  - `origine` : l'identifiant de son commentaire d'origine ;
  - `ancre` : absente pour un fil de page ; sinon une valeur JSON `{ debut, fin, extrait }`, où `debut` et `fin` sont la forme de `Y.relativePositionToJSON`, telle quelle, et `extrait` une chaîne d'au plus 200 unités ;
  - `resolution` : absente ou `null` pour un fil ouvert, sinon `{ auteur, date }`.
- Commentaire :
  - `fil` : l'identifiant de sa fiche ;
  - `texte` : une chaîne, telle que saisie ;
  - `auteur` : `{ id, nom }`, ou `null` pour un commentaire sans auteur ;
  - `date` : chaîne ISO 8601 donnée par l'appareil, affichée seulement ;
  - `modifie` : `true`, ou absente.
- Aucune autre clé. Les dates ne servent jamais à ordonner. Les longueurs se comptent en unités de code UTF-16, comme les autres bornes du paquet.

**Lecture.** Elle n'écrit jamais et ne lève jamais.

- Le type est **illisible** (AC37) s'il n'a pas pu être ouvert, s'il porte des entrées nommées (`_map`) ou un élément non compté (même règle que `lireFormeStockee`, amendement F-018 de l'ADR-0009). La page reste ouverte et prise en charge ; seuls les commentaires sont refusés.
- Un élément est illisible (compté, ignoré) dans chacun de ces cas :
  - ce n'est pas une `Y.Map` ;
  - une clé manque, est de mauvais type ou est inconnue ;
  - son identifiant n'est pas un UUID canonique, ou il est déjà porté par un élément précédent du tableau ;
  - sa date ne se lit pas ;
  - son ancre n'a pas la forme d'une paire de positions relatives JSON ;
  - c'est un commentaire dont la fiche de fil manque ou est illisible.
- Un fil sans commentaire lisible n'est pas rendu et n'est pas compté illisible.
- L'origine d'un fil est « supprimée » quand aucun commentaire lisible ne porte l'identifiant `origine` : s'il lui reste une réponse, le fil est rendu sous « Commentaire supprimé ».
- Les bornes s'appliquent à la lecture par une troncature signalée (texte 2 000, nom 100, extrait 200), sans rien corriger dans le document.
- Ordre rendu : celui du tableau, pour les fils comme pour les commentaires d'un fil. L'ordre d'affichage par position du passage (AC8) est calculé dans `apps/web`, qui seul résout les ancres.

**Écriture.** Une transaction Yjs par opération.

- Créer un fil ajoute la fiche et son commentaire d'origine en un seul `push`. Répondre ajoute un commentaire.
- Modifier remplace `texte` et pose `modifie`.
- Résoudre écrit `resolution` ; rouvrir y écrit `null`. C'est une seule clé : la dernière écriture gagne, de la même façon partout (AC10).
- Supprimer retire l'élément du commentaire, jamais la fiche de fil.
- Chaque écriture élève la version du document à celle des commentaires si elle est inférieure, dans la même transaction, par la fonction d'élévation déjà employée par `eleverVersion` (F-003-AC31), sans la modifier ni la doubler.
- Refus typés, avant toute écriture, dans cet ordre :
  - façade fermée ;
  - type illisible ;
  - texte vide une fois les blancs de tête et de fin retirés, ou de plus de 2 000 unités ;
  - auteur ou date non conformes ;
  - ancre non conforme, ou de début égal à la fin (`Y.compareRelativePositions`) ;
  - fil ou commentaire introuvable ;
  - 500 commentaires lisibles dans la page, ou 100 dans le fil.
- Les bornes sont déclarées une seule fois, dans `LIMITES_DES_COMMENTAIRES`, exportée par le paquet (AC26).

**Version.** La ligne 4 de `TABLE_DES_VERSIONS_PAGE`, si `main` prend encore en charge la version 3 au premier commit de code (F-016-AC27). Elle reprend les nœuds et les marques de la ligne 3 et ajoute `typesPartages: ["commentaires"]`. La version des commentaires est celle de la première ligne qui porte ce type partagé.

**Liaison.** `@tiptap/y-tiptap` reste à 3.0.9, déclarée exactement par `apps/web`, et `@tiptap/*` à 3.31.4.

- Le module d'édition importe désormais directement trois exports de la liaison : `absolutePositionToRelativePosition`, `relativePositionToAbsolutePosition` et `ySyncPluginKey` (tables de correspondance de la liaison).
- Le contrat `web-edition-liste-blanche` est élargi à ce paquet, sans règle nouvelle. Le diff exact est dans l'annexe de `docs/decisions/F-016-conception.md`.
- Changer de version de la liaison est une décision d'architecture à part, qui devra rouvrir cet ADR.

**Ancres dans l'éditeur.** `apps/web/src/edition/` est le seul module à connaître ProseMirror et la liaison.

- Sérialisation : une sélection non vide, contenue dans le texte d'un seul bloc, devient deux positions relatives JSON et un extrait.
- Résolution : un fil est ancré si ses deux bornes se résolvent, si le début précède la fin, et si les deux tombent dans le texte d'un même bloc ; sinon il est détaché. Toute exception de résolution vaut détachement.
- La résolution est relue depuis Yjs après que la liaison a synchronisé, jamais pendant l'application d'une transaction locale : le fragment n'y est pas encore écrit.
- Surlignage : décorations de ProseMirror, hors du document et hors de l'historique d'annulation.

**Module des commentaires.** `apps/web/src/commentaires/`, nouveau, porte le panneau, les formulaires, la table des droits, l'ordre d'affichage, le rôle confirmé et les annonces. Il n'importe ni `yjs` ni la bibliothèque d'édition. Il relève du contrat `web-src-liste-blanche`, qui ne l'exclut pas, et n'atteint l'édition que par son `index.ts`.

## Conséquences

- Dès qu'une page porte un commentaire, une application qui ne prend en charge que la version 3 la refuse en entier (F-003-AC19), comme pour le bloc code (ADR-0018).
- La fiche d'un fil (ancre, extrait, état, auteur déclaré de la résolution) reste dans le document après la suppression de tous ses commentaires, sans être affichée. C'est la condition d'AC18.
  - Elle part avec la page (F-007-AC11) ; son effacement plus tôt relève de F-025.
  - L'extrait est une copie d'un texte de la page, qui peut survivre à ce texte.
- Chaque élément retiré laisse dans l'état encodé une marque du ramasse-miettes de quelques octets, comme tout retrait Yjs ; son contenu, lui, part.
- La recherche d'un élément par identifiant parcourt le tableau, sans index. Le coût est négligeable sous les bornes d'écriture (500 commentaires) ; un document forgé jusqu'au plafond de 20 Mio est relu en temps linéaire à chaque modification du type, sans écriture.
- Sous 3.0.9, un déplacement de bloc fait recréer par la liaison l'un des deux blocs qu'il croise : le bloc descendu, ou le voisin que franchit un bloc monté.
  - Les fils du bloc recréé sont détachés ; ceux de l'autre bloc sont suivis.
  - Jamais un autre texte n'est surligné, et le fil détaché garde son extrait (H6, retouche proposée au dev).
- Les positions relatives JSON sont une structure interne de la famille 13 de `yjs` : passer à `yjs` 14 est une couture du format des ancres.
- Le serveur n'est pas touché et ne lit rien des commentaires (F-012 H5) ; ils suivent l'autorisation de la page (F-016 H2, H3).
- Les commentaires sont hors de l'historique d'annulation de l'éditeur, dont la portée est le seul fragment (ADR-0009) : Mod+Z ne défait ni un commentaire ni l'élévation de version qui l'accompagne (F-016-AC22, AC40).

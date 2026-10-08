# ADR-0001 — Découpage des documents Yjs : un par espace, un par page, un par table

Statut : accepté
Date : 2026-10-08

## Contexte et problème

Le contenu de notionLike vit dans des documents Yjs (local d'abord : le serveur synchronise et autorise, il n'est jamais la source d'une frappe). Il faut fixer, avant le premier paquet, ce qu'est « un document » : c'est l'unité de chargement, de persistance (IndexedDB, F-002), de synchronisation et d'autorisation (F-012). Ce choix se défait mal : il fixe les identifiants de documents, les clés de stockage côté client et côté serveur, et le grain des droits.

La spec F-001 (hypothèse H1, validée par le dev au commit `ccbcd25`) arrête le découpage ; cet ADR le consigne avec ses conséquences.

## Options étudiées

1. **Un seul document par espace**, arborescence et contenu de toutes les pages compris. Autorisation triviale (un espace = un document), mais ouvrir l'espace charge et synchronise tout son contenu, et l'historique Yjs de toutes les pages grossit dans un seul document.
2. **Un document par espace pour l'arborescence, un par page pour le contenu, un par table** (retenue). La barre latérale ne charge que l'arborescence ; une page ne charge que son contenu.
3. **Un document par page, sans document d'espace**, l'arborescence étant une donnée du serveur. Contraire au principe local d'abord : créer ou déplacer une page hors ligne deviendrait impossible.
4. **Sous-documents Yjs** (`subdocs`) dans le document d'espace. Même découpage logique que l'option 2, mais dépend de la prise en charge des sous-documents par chaque fournisseur (y-indexeddb, Hocuspocus), non vérifiée par la veille du 2026-10-08.

## Décision

Option 2.

- **Document d'espace** : un par espace. Il porte l'arborescence des pages (identifiant, titre, parent, rang, état corbeille) et rien de leur contenu. F-001 ne livre que lui ; son format est décrit par l'ADR-0002.
- **Document de page** : un par page, pour son contenu (F-003). **Document de table** : un par table (F-017). Aucun des deux n'existe à ce jour.
- **Lien entre documents** : l'identifiant de page créé dans le document d'espace est la seule référence. Le nommage des documents côté stockage et côté serveur sera fixé par les features qui les créent (F-002, F-012) à partir de cet identifiant ; il n'est pas décidé ici.
- **Encodage des mises à jour** : format V1 de Yjs (`Y.encodeStateAsUpdate`, `Y.applyUpdate`, événement `update`) sur tous les flux. Le format V2 n'est pas utilisé tant que sa prise en charge par y-indexeddb et Hocuspocus n'est pas vérifiée (veille du 2026-10-08) ; on ne mélange jamais les deux sur un même flux.
- **Bibliothèque** : `yjs@13.6.33` (ligne 13 ; aucune version 14 stable). Ramasse-miettes Yjs laissé actif (`gc` par défaut).

## Conséquences

- L'ouverture d'un espace ne charge que l'arborescence ; le coût d'une page est payé à son ouverture.
- L'autorisation (F-012) se fait par document : un document de page devra être rattaché à son espace côté serveur. C'est le prix du découpage, à traiter dans la spec de F-012.
- Une opération qui touche l'arborescence et le contenu (créer une page puis y écrire) n'est pas atomique entre deux documents : une page peut exister dans l'arborescence sans document de contenu, ce que F-003 devra traiter comme une page vide.
- Mettre une page à la corbeille ne touche que le document d'espace (drapeau, ADR-0002) ; le document de la page reste intact, ce qui rend la restauration (F-007) possible sans copie.
- Revenir à un document unique demanderait une migration de tous les documents stockés, clients compris : décision à tenir pour acquise.

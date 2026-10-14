# ADR-0001 — Découpage des documents Yjs : un par espace, un par page, un par table

Statut : accepté ; section « Amendement F-007 » comprise : écrite après coup (elle consigne une décision de la spec F-007, validée par le dev, que le code a prise sans ADR en mode économe), elle est acceptée par le dev le 2026-10-14
Date : 2026-10-08 ; amendement F-007 du 2026-10-14

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

### Amendement F-007 (2026-10-14) : ramasse-miettes du document d'espace, suppression définitive

Contexte : F-007 (spec validée, H1, H2, H8, H14, H16 à H18) introduit le premier effacement du contenu d'un espace : une page de la corbeille peut être supprimée définitivement. La ligne « Bibliothèque » ci-dessus disait seulement que le ramasse-miettes est laissé à son défaut ; or `ouvrirDocumentEspace(doc)` reçoit un `Y.Doc` construit par l'appelant, et sans ramasse-miettes le titre d'une page retirée resterait dans le document et dans son état encodé, envoyé à chaque réplique. Le code de F-007 (`b664766`, `e6b30bd`, `902f29a`, `57dfaeb`) a tranché sans ADR (mode économe, `MEMORY/features/F-007.md`, « Décisions ») ; cet amendement le consigne. Options que la spec a écartées : un second drapeau « supprimée » (règle de lecture nouvelle, donc version 2 et migration, et titre lisible pour toujours, H2) ; confier l'effacement de la base à `y-indexeddb` (`clearData()` se résout avant la fin de la suppression et n'écoute pas `blocked`, H16) ; compacter le journal de la base d'espace après une suppression (sans effet sur les autres onglets et appareils, H18).

- **Ramasse-miettes actif sur tout `Y.Doc` qui porte un document d'espace.** C'est une décision de format et de confidentialité, opposable à tout porteur du document : client, serveur (F-012), outils de purge (F-025). Qui construit ces `Y.Doc` aujourd'hui : `creerDocumentEspace` (`packages/document/src/document-espace.ts`) et la session d'espace (`apps/web/src/espace/session-espace.ts`), chacun par `new Y.Doc({ gc: true })`, réglage écrit explicitement. `ouvrirDocumentEspace(doc)` ne règle rien : c'est à l'appelant qui construit le `Y.Doc` de le faire. Comment c'est tenu : `packages/document/test/corbeille.test.ts` (le document rendu par `creerDocumentEspace` a le ramasse-miettes, et le texte du module pose `{ gc: true }`) et `apps/web/test/corbeille-coutures.test.ts` (liste fermée des modules d'`apps/web/src` qui construisent un `Y.Doc`, aucun ne coupe le ramasse-miettes, la session le pose explicitement). Rien ne le tient hors de ces deux paquets : le serveur de F-012 devra construire ses `Y.Doc` d'espace de même, et le tenir par un test.
- **Documents de page.** `apps/web/src/page/pages-ouvertes.ts` les construit par `new Y.Doc()`, ramasse-miettes laissé à son défaut, donc actif ; le test d'`apps/web` ci-dessus refuse qu'on l'y coupe. Aucune décision ne fixe le réglage du document de page au-delà : son contenu n'est pas retiré entrée par entrée, sa base est effacée entière (plus bas).
- **Suppression définitive** (format : ADR-0002, amendement F-007) : l'entrée de la page et celles de sa descendance lue quittent `pages` en une transaction ; le ramasse-miettes libère leur contenu du `Y.Doc` et de son état encodé, où restent des marqueurs de suppression (environ 13 % de la taille d'origine pour 1 000 entrées, veille citée par F-007 H1). Une réplique qui reçoit le retrait libère le contenu à son tour.
- **Base locale d'une page supprimée** : sur l'appareil et dans l'onglet qui suppriment, la session de chaque page retirée est fermée, son `Y.Doc` détruit et sa persistance fermée (`PagesOuvertes.effacer`), puis sa base `notionlike:page:<idEspace>:<idPage>` est effacée par `indexedDB.deleteDatabase` (`apps/web/src/persistance/effacement.ts`) : une demande bloquée par une autre connexion est attendue jusqu'à une échéance de 10 secondes, la promesse n'est jamais rejetée, l'issue est `effacee` (événement `success`) ou `echec`, sans nouvel essai. L'effacement n'est pas tenté pendant une coupure de la persistance de l'espace ni tant que l'espace est inconnu (issue `echec`). Un échec est signalé à l'écran et ne défait jamais la suppression (H8) : la base orpheline reste à balayer par F-025.
- **Pas de compactage** de la base de l'espace après une suppression (H18) : le journal de `y-indexeddb` garde les mises à jour qui portaient le titre jusqu'à son propre compactage (seuil de la bibliothèque, 500 enregistrements). L'effacement garanti, sur tous les appareils, reste à F-025.

## Conséquences

- L'ouverture d'un espace ne charge que l'arborescence ; le coût d'une page est payé à son ouverture.
- L'autorisation (F-012) se fait par document : un document de page devra être rattaché à son espace côté serveur. C'est le prix du découpage, à traiter dans la spec de F-012.
- Une opération qui touche l'arborescence et le contenu (créer une page puis y écrire) n'est pas atomique entre deux documents : une page peut exister dans l'arborescence sans document de contenu, ce que F-003 devra traiter comme une page vide.
- Mettre une page à la corbeille ne touche que le document d'espace (drapeau, ADR-0002) ; le document de la page reste intact, ce qui rend la restauration (F-007) possible sans copie.
- Revenir à un document unique demanderait une migration de tous les documents stockés, clients compris : décision à tenir pour acquise.
- Amendement F-007 : le ramasse-miettes du document d'espace ne se coupe plus. Toute fonction qui le demanderait (historique de versions, instantanés Yjs relisibles) est fermée pour ce document ; la rouvrir demande un nouvel ADR et une décision sur la confidentialité des pages supprimées.
- Amendement F-007 : une suppression définitive est irréversible. Le contenu retiré ne revient pas, même si un pair qui contourne `packages/document` réécrit l'entrée sous le même identifiant (lue alors comme une page neuve, F-007 H15). Le refuser demanderait un registre des identifiants supprimés (version 2 du format) ou un contrôle du serveur (F-012).
- Amendement F-007, à la charge de F-012 : construire avec le ramasse-miettes tout `Y.Doc` d'espace tenu par le serveur ; dire ce que devient, côté serveur, le document de page d'une page supprimée (aucun code n'en décide aujourd'hui) ; l'effacement local ne vaut que pour l'onglet et l'appareil qui suppriment (H8, H17), un autre onglet resté sur la page pouvant recréer une base orpheline.

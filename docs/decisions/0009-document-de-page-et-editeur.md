# ADR-0009 — Document de page : contenu Tiptap dans un fragment Yjs, version à maximum, éditeur confiné

Statut : accepté ; section « Amendement F-012 et F-013 » : écrite après coup le 2026-10-16, relue le 2026-10-19 : accepté (décision du dev du 2026-10-19, après correction des écarts) ; section « Amendement F-005 » : écrite le 2026-10-19, d'après le code de la branche `F-005` ; elle reporte une décision de l'ADR-0018 et en suit le statut (accepté) ; section « Amendement F-018 » : écrite le 2026-10-21, d'après le code de la branche `F-018` (`60258d0`), à la demande du gate d'architecture de F-018 : acceptée par le dev le 2026-10-21, avec l'amendement F-018 de l'ADR-0002 et l'ADR-0019
Date : 2026-10-12 (écrit après le code, sur `c2ac84d` ; la spec F-003 demandait cet ADR avant le premier commit de code, il ne l'a pas précédé) ; amendement F-012 et F-013 du 2026-10-16 ; écarts au code corrigés le 2026-10-19 ; amendement F-005 du 2026-10-19 ; amendement F-018 du 2026-10-21
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

### Amendement F-012 et F-013 (2026-10-16) : seconde barrière de version, lecture seule, serveur qui ne lit pas la page

Contexte : F-012 (`797d708`) et F-013 (`0d04c60`) font arriver dans le document d'une page des mises à jour d'autres appareils et d'autres onglets, sans amender cet ADR (mode économe, D-023, D-024). F-013 H8 demande deux barrières de version, parce que la perte serait destructive et propagée.

- **Seconde barrière : la réplique** (`apps/web/src/synchronisation/miroir.ts`, `page-affichee.ts`). Le document que l'éditeur lie ne reçoit plus rien directement du réseau ni d'un autre onglet : le fournisseur et le canal entre onglets écrivent dans une réplique, construite à la fin de la relecture locale de la page, qu'elle ait abouti ou échoué. Chaque mise à jour de la réplique n'est recopiée dans le document lié qu'après lecture du numéro de version de la réplique (`lireVersionPage`, `VERSION_PAGE_PRISE_EN_CHARGE`). Un numéro supérieur à la version prise en charge n'atteint jamais le document lié : la synchronisation appelle `refuserLaVersion` de la session de page (`apps/web/src/page/session-page.ts`), qui a le même effet que la garde (éditeur détruit, façade et persistance fermées, note affichée), plus rien n'est recopié dans un sens ni dans l'autre, et la réplique est enregistrée telle quelle dans la base de la page et continue de recevoir. La réplique ne juge que le numéro : une forme de version mal formée (entrée non entière ou nommée), que la façade tient pour non prise en charge, passe la seconde barrière. La première barrière, la garde de version dans la transaction, reste en place pour ce qui atteint quand même le document lié : cette forme mal formée, ou ce que la persistance applique en se branchant après le jugement du témoin ; la relecture de la base est, elle, jugée avant toute fusion sur un document témoin (F-030-AC10).
- **Ce que la réplique ne couvre pas** : le cas « Non garanti » des « Conséquences » demeure. Un contenu nouveau reçu dans une mise à jour, sa version dans une suivante : la réplique est encore en version prise en charge, la mise à jour est recopiée, la liaison retire le contenu inconnu du document lié, et ce retrait repart par la réplique vers le serveur et les autres appareils.
- **Le serveur ne lit pas la version d'une page** : il ne contrôle que celle du document d'espace (ADR-0002, amendement F-012), et relaie et stocke tout document de page tel qu'un `editeur` l'écrit.
- **Lecture seule** : `EditeurDePage` reçoit `lectureSeule` (`apps/web/src/edition/EditeurDePage.tsx`) quand le dernier droit connu de l'espace est la lecture (ADR-0014) : l'éditeur n'est plus modifiable (`setEditable(false)`), ni la barre de blocs ni les poignées de bloc (F-006) ne sont rendues, et les raccourcis de la zone d'édition ne sont plus traités.
- **Construction du document lié inchangée** : `page/pages-ouvertes.ts` le construit toujours par `new Y.Doc()` ; la réplique prend le même réglage du ramasse-miettes (`new Y.Doc({ gc: lie.gc })`).

### Amendement F-005 (2026-10-19) : positionnement du menu slash, interface du module d'édition

Contexte : F-005 (ADR-0018) ajoute au module d'édition le bloc code et le menu slash. Deux phrases de la décision ci-dessus ne décrivent plus le code ; la décision qui les change est celle de l'ADR-0018 et de `specs/F-005.md` (H9, AC33), que cet amendement ne fait que reporter.

- **« Pas de `@floating-ui/dom` » ne vaut plus pour le menu slash.** `@floating-ui/dom` 1.8.0 est une dépendance directe d'`apps/web`, importée par le seul `apps/web/src/edition/menu-slash.ts` (`shift`), avec `@tiptap/suggestion` 3.31.4 ; le placement du menu passe par `props.mount` de l'utilitaire, qui le calcule par cette bibliothèque. Règle `suggestion-et-positionnement-confines` (ni l'un ni l'autre hors de `apps/web/src/edition/`, tests compris) et `web-edition-liste-blanche` élargie (commit du dev `d39cd86`). La barre de blocs reste placée par `edition/placement.ts`.
- **L'interface `edition/index.ts` n'exporte plus le seul composant.** Elle exporte `EditeurDePage` et le type de ses propriétés, les fonctions pures des adresses de F-028 (`adresseAcceptee`, `adresseDUneSaisie`), et, depuis F-005, la liste des commandes de bloc (`LISTE_DES_COMMANDES`, de `commandes-de-bloc.ts`, sans import) et son filtre (`commandesFiltrees`, de `filtre-des-commandes.ts`, sans import) : données et fonctions pures, sans aucun type de la bibliothèque d'édition. Seuls des tests consomment ces quatre derniers.

### Amendement F-018 (2026-10-21) : élément non compté dans `versions`

Statut : accepté par le dev le 2026-10-21, avec l'amendement F-018 de l'ADR-0002 et l'ADR-0019. Contexte : F-018 change `lireFormeStockee` (`packages/document/src/format-page.ts`, `60258d0`), fonction commune aux documents de page, d'espace et de table ; la décision est celle de l'addendum du 2026-10-21 de l'amendement F-018 de l'ADR-0002 (« Élément non compté dans `versions` »), que cet amendement reporte pour la page.

- **Règle de lecture complétée** : la fonction parcourt les éléments du type `versions`, supprimés exceptés. Un élément non compté (attribut de mise en forme d'un `Y.Text` écrit sous ce nom, que `forEach` et `toArray` passaient sous silence) rend la forme non admise, comme une entrée non entière ou nommée : `ouvrirDocumentPage` lève `version-non-prise-en-charge`, et la garde de version relit par la même fonction.
- **Seconde barrière inchangée** : la réplique de la page affichée (`apps/web/src/synchronisation/miroir.ts`, `lireVersionPage`) ne juge que le numéro ; un tel élément la passe, comme une entrée mal formée (amendement F-012 et F-013), et c'est la façade qui le refuse.
- **Couture** : `packages/document/test/formes-forgees.test.ts` énumère les appelants de `lireFormeStockee` dans les sources et éprouve l'ouverture de chacun, dont `document-page.ts` (F-018-AC58).

### Amendement F-044 (2026-10-30) : copie du contenu d'une page

Statut : proposé. Spec : `specs/F-044.md` (validée, H4). Note de conception : `docs/decisions/F-044-conception.md`.

Contexte : « Enregistrer comme modèle » et « Nouvelle page depuis un modèle » copient le contenu d'un document de page dans un autre, sans identifiant Yjs partagé, en gardant la version de la source (F-044-AC5).

Options étudiées :

- A. Encoder l'état de la source et l'appliquer à la cible (`encodeStateAsUpdate`). Écarté : la cible partagerait les identifiants d'éléments et l'historique de la source ; une modification de l'une se fondrait dans l'autre si les deux mises à jour se rencontraient.
- B. `clone()` de Yjs sur chaque nœud. Écarté : il recopie tout, y compris un nœud, un attribut ou une marque forgés que la version de la source n'admet pas.
- C. **Copie filtrée par la table des versions** (retenue), dans `@notionlike/document`.

Décision :

- Opération `copierDe(source)` de la façade `DocumentPage`, dans `packages/document/src/copie-de-page.ts`. Une transaction sur la cible : la version de la cible est portée au moins à celle de la source, puis le contenu de la cible est remplacé par des éléments neufs (`Y.XmlElement`, `Y.XmlText` par `applyDelta`) qui ne gardent que les nœuds, attributs et marques de la dernière ligne de `TABLE_DES_VERSIONS_PAGE`. Un nœud non admis est omis avec son sous-arbre. Rien n'est écrit dans la source.
- La façade ne rend toujours pas le `Y.Doc` ; `apps/web` n'importe pas Yjs pour copier.

## Conséquences

- Entorse à l'ADR-0003 : le paquet expose un type partagé, le fragment du contenu. Le reste du format (noms des types racines, forme de la version) n'en sort pas.
- Le format stocké est dicté par une bibliothèque, les blocs n'ont pas d'identifiant stable, et Yjs ne sait pas déplacer un nœud (F-006, F-016). Changer de modèle demanderait de convertir chaque page sur chaque appareil.
- Toute feature qui ajoute au schéma un nœud, un attribut, une marque, ou un type partagé au document, ajoute une ligne à la table, relève la version prise en charge et appelle `eleverVersion` au plus tard dans la transaction qui inscrit le premier élément nouveau. Dans F-003, `eleverVersion` n'a aucun appelant de production.
- Non garanti : un contenu nouveau reçu dans une mise à jour, et sa version dans une mise à jour suivante. La liaison retire le contenu avant que la version ne soit connue ; risque accepté par la spec F-003 (H4, cas a), qui ne peut venir que d'un client qui enfreint la règle ci-dessus ou d'un maillon qui scinde une transaction.
- Un document conservé par le client et par le serveur garde le tableau `versions` pour toujours ; il ne grandit que d'une entrée par version atteinte et par réplique qui l'élève.
- Amendement F-012 et F-013 : la page affichée vit en deux `Y.Doc` dans l'onglet, le document lié et sa réplique, chacun avec l'état complet de la page ; la mémoire d'une page affichée double.
- Amendement F-018 : un document de page qui porte déjà un élément non compté dans `versions` (forgé hors de l'application ; le serveur ne lit pas la page) s'ouvrait avant F-018 et est désormais refusé par la façade, qui n'y retire rien. Seule une mise à jour qui supprime l'élément le rend lisible ; aucun code de l'application ne l'écrit, et aucune réparation n'est prévue.
- Amendement F-044 : une page copiée ne garde aucun lien avec sa source ; son historique commence à la copie. Ce qui n'est pas admis par la version courante n'est pas recopié : une copie peut être plus courte qu'une source forgée, jamais plus longue.
- Amendement F-044 : la copie et la création de l'entrée de page touchent deux documents et ne sont pas atomiques : une interruption laisse une page au bon titre et au contenu vide.

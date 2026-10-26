# F-016 — Conception : commentaires sur une page

Date : 2026-10-26
Spec : `specs/F-016.md`, validée (structurel, `Revue : reviewer-frontend`), lue sur la branche `F-016` à `d8dfef1` (`main` `d592ad8` plus la veille). Veille : `MEMORY/VEILLE.md`, section du 2026-10-26 « F-016 : rafraîchissement » (constats du 2026-10-08 rejoués sous `yjs` 13.6.33, `@tiptap/*` 3.31.4, `@tiptap/y-tiptap` 3.0.9, et comparés à 3.32.0 et 3.0.10). Décisions difficiles à défaire : ADR-0021 (proposé) ; amendement F-016 de l'ADR-0009 (proposé). Pas d'amendement de l'ADR-0018 : F-016 n'ajoute ni nœud, ni commande de bloc, ni entrée au menu slash, et « Commenter » rejoint la barre de blocs sans changer son placement ni la liste `LISTE_DES_COMMANDES` ; l'ADR-0007 n'est pas touchée non plus, le serveur ne lisant toujours pas la page.

Note écrite avant le code. `ARCHITECTURE.md` décrit `main` et n'est pas touché ici : il sera aligné sur le diff livré (bloc 8).

**Ordonnancement.** Le code commence après la fusion de F-032 dans `main`, puis de `main` dans `F-016`. Les blocs 1 et 2 ne touchent que `packages/document` et `apps/web/src/page/`, que ni F-032 ni F-015 ne modifient : ils peuvent partir dès ce moment. Les blocs 3 à 5 touchent l'édition et la coquille, comme F-015 : ils s'écrivent sur `main` après la fusion de F-015 (ordre recommandé, voir « Recouvrements »). Chaque bloc se relit contre le code fusionné, pas contre cette note.

**Constats d'ordre au 2026-10-26, à refaire au premier commit de code (bloc 0)** :

- `main` prend en charge la version 3 du document de page (F-005) : la ligne des commentaires est la 4 (F-016-AC27).
- F-027 est fusionnée (`2e65313`) : F-016-AC43 a un objet, et F-027 s'ajoute aux prérequis (H15 b).
- F-025 ne l'est pas (spec validée seulement, `f984436`) : F-016-AC41 et AC42 sont sans objet.

## Approche

1. **Les commentaires sont du contenu de la page, pas une fonction du serveur** (H1). Ils vivent dans un type racine `commentaires` du document de page, un `Y.Array` de `Y.Map`, avec une fiche par fil et une entrée par commentaire, ajoutées en fin seulement (ADR-0021). Ils s'écrivent hors ligne, se persistent, se synchronisent et partent avec la page sans une ligne de code dans la persistance, la synchronisation ni le serveur (AC6, AC33).
2. **`@notionlike/document` porte le format, la lecture tolérante, les bornes et les écritures.** La façade `DocumentPage` gagne huit membres (AC29), qui reçoivent l'ancre déjà sérialisée et ne connaissent ni éditeur ni DOM. La version est élevée dans la transaction de l'écriture, par la fonction d'élévation existante (AC28, AC39).
3. **Le module d'édition porte tout ce qui touche ProseMirror et la liaison** (AC32) : il sérialise une sélection en ancre, résout les ancres en fils ancrés ou détachés, et rend le surlignage par des décorations. Il n'expose que des types faits de données et de fonctions.
4. **Le module des commentaires** (`apps/web/src/commentaires/`, nouveau) porte le panneau, la table des droits, l'ordre d'affichage, le rôle confirmé et les annonces. Il ne connaît ni `yjs` ni Tiptap. La coquille le place à côté de l'éditeur et lui donne le compte, le droit, le rattachement et la lecture de l'espace.
5. **Rien n'est écrit pour constater** : le détachement, l'ordre, la troncature et l'illisibilité se calculent à l'affichage, sur chaque appareil (AC20, AC25, AC28).

## Choix de la liaison : rester sur `@tiptap/y-tiptap` 3.0.9

La recommandation de l'orchestrateur est **confirmée** : ni dépendance nouvelle, ni montée. Argumentaire complet dans l'ADR-0021 (« Options étudiées ») ; en bref, 3.0.10 suivrait les blocs déplacés, mais :

- elle ajoute à chaque page éditée un type racine hors de la table des versions, que F-016-AC39 interdit ;
- ce type grandit sans fin (20 déplacements : de 149 à 17 879 octets), sans que le ramasse-miettes puisse le réduire ;
- elle inverse le traitement du nœud inconnu sur lequel reposent F-003 H4 et l'ADR-0009 ;
- un parc mixte perdrait quand même des ancres ;
- elle rendrait faux le test qu'AC20 prescrit (un bloc déplacé y est détaché).

Une montée future est une feature à part, qui devra :

- inscrire le type des transferts dans la table des versions (donc une ligne et une version de plus) ;
- borner sa croissance ;
- réécrire F-003 H4 et ses tests ;
- revoir AC20 ;
- rouvrir l'ADR-0021.

Conséquence assumée sous 3.0.9 (veille du 2026-10-26) : un déplacement fait recréer par la liaison l'un des deux blocs qu'il croise. C'est le bloc descendu, ou le voisin que franchit un bloc monté. Le détachement d'AC20 couvre les deux cas sans code de plus, parce que la règle est appliquée à chaque fil à chaque modification, quel que soit le bloc déplacé : borne nulle, étendue vide, ou bornes dans deux blocs. Le test le prouve pour le voisin (bloc 3). La lettre de H6 et le test d'AC20 sont à retoucher (R1, R2).

Garde-fou : le test d'AC32 fixe les versions exactes de `@tiptap/*` (3.31.4) et de `@tiptap/y-tiptap` (3.0.9). Une montée le fait échouer, et oblige ainsi à rouvrir la conception.

## Décisions par critère

### `packages/document` (bloc 1)

- **Format** (`format-page.ts`) :
  - `TYPE_COMMENTAIRES = "commentaires"` ;
  - `typeDesCommentaires(doc)`, ouverture par `getArray` sous `lireTypeRacine` (AC37 : seul endroit qui nomme et ouvre le type) ;
  - ligne 4 de `TABLE_DES_VERSIONS_PAGE` (nœuds et marques de la ligne 3, `typesPartages: ["commentaires"]`) ;
  - `VERSION_DES_COMMENTAIRES`, constante interne : le numéro de la première ligne qui porte ce type.
  - `estPriseEnCharge`, `lireFormeStockee` et `inscrireVersion` ne changent pas (AC39).
- **Champs, lecture, écriture** (`commentaires.ts`, nouveau, seul fichier qui connaît les champs) : la forme et les règles sont celles de l'ADR-0021.
  - `lireLesCommentaires(type | undefined)` rend `{ lisible, fils, illisibles, nombre }`, où `nombre` compte les commentaires lisibles (borne de 500).
  - Écritures : `ecrireUnFil`, `ecrireUneReponse`, `ecrireLeTexte`, `ecrireLaResolution`, `retirerLeCommentaire`. Contrôles : texte (vide une fois les blancs retirés, ou plus de 2 000 unités telles que saisies : R5), auteur (`null`, ou `{ id }` chaîne non vide et `{ nom }` de 1 à 100 unités), date (forme ISO 8601 et `Date.parse` fini), ancre (paire de positions de la forme de `relativePositionToJSON`, extrait d'au plus 200 unités, début différent de la fin par `Y.compareRelativePositions`).
  - `LIMITES_DES_COMMENTAIRES = { texte: 2000, nom: 100, extrait: 200, parFil: 100, parPage: 500 }`, gelée.
  - Aucun texte n'est normalisé ni rogné à l'écriture (AC4) ; la troncature de lecture est signalée (`tronque`).
- **Façade** (`document-page.ts`). `ouvrirDocumentPage` ouvre aussi le type des commentaires et l'observe en profondeur. Son échec ne refuse pas la page : il rend les commentaires illisibles (AC37). Membres ajoutés à `DocumentPage` :
  - `lireLesFils(): FilsLus`, gardé tant que le type ne change pas : même objet d'une lecture à l'autre, pour `useSyncExternalStore` ;
  - `observerLesCommentaires(rappel: (recue: boolean) => void): () => void` : un appel par transaction qui change le type, `recue` valant `!transaction.local` ;
  - `creerUnFil(nouveau): { fil, commentaire }` ;
  - `repondre(fil, nouveau): string` ;
  - `modifierLeCommentaire(id, texte)` ;
  - `resoudreLeFil(fil, declaration)` et `rouvrirLeFil(fil)` ;
  - `supprimerLeCommentaire(id)`.
  - Chaque écriture appelle `elever(versions, forme, VERSION_DES_COMMENTAIRES)` puis l'écriture, dans un seul `doc.transact`, sans origine. `fermer()` retire aussi cet observateur ; après la fermeture, `lireLesFils` rend la dernière lecture et toute écriture lève `facade-fermee`.
  - Les identifiants sont tirés par `crypto.randomUUID()` dans le paquet, comme `document-espace.ts` et `document-table.ts` : `apps/web` n'a pas le droit de le lire hors d'`espace/` (ESLint, F-002-AC26).
- **Codes d'erreur** (`erreurs.ts`) : `commentaires-illisibles`, `texte-non-admis`, `declaration-non-conforme`, `ancre-non-admise`, `fil-introuvable`, `commentaire-introuvable`, `limite-de-commentaires`. Aucun code nouveau pour la version (AC39).
- **Exports** (`index.ts`) : `LIMITES_DES_COMMENTAIRES` et les types `FilsLus`, `FilLu`, `CommentaireLu`, `AuteurDeclare`, `NouveauCommentaire`, `NouveauFil`, `AncreSerialisee`, `DeclarationDeResolution`. Aucune fonction exportée de plus : les opérations sont des membres de la façade (R6).

### Session de page (bloc 2)

- `page/session-page.ts` : l'état `pret` gagne `commentaires: CommentairesDeLaPage`, objet stable lié à la façade (les huit membres). Une écriture sur une session fermée lève `facade-fermee`, que le module des commentaires traite comme une commande indisponible. Le reste de la session ne change pas ; `eleverPour` et `versionExigee` restent valables, la ligne 4 n'introduisant ni nœud ni marque.
- Ramasse-miettes (AC38) : `pages-ouvertes.ts` (`new Y.Doc()`), `miroir.ts` (`gc: lie.gc`) et `passe-de-fond.ts` (`new Y.Doc()`) sont inchangés. Un test énumère les `new Y.Doc(` d'`apps/web/src` contre une liste fermée et refuse `gc: false` ; pour chaque constructeur d'un document de page, il constate `doc.gc === true` à l'exécution.

### Module d'édition (bloc 3)

- **`edition/ancres.ts`** (nouveau), seul importateur de `@tiptap/y-tiptap` (annexe) :
  - `ancreDeLaSelection(etat, fragment)` rend une `AncreDeLEditeur` (`debut`, `fin` par `absolutePositionToRelativePosition(pos, fragment, binding.mapping)` puis `Y.relativePositionToJSON`, la liaison lue par `ySyncPluginKey.getState(etat)` ; `extrait` par `textBetween` tronqué à 200), ou la raison de son absence : `selection-vide` ou `plusieurs-blocs`. Une sélection vide, une sélection de nœud, une sélection qui sort du texte d'un bloc, ou deux positions égales ne sont jamais sérialisées (AC3, AC36).
  - `resoudre(etat, fragment, fils)` rend, pour chaque fil, `{ de, a }` ou `null` (détaché). Elle passe par `createRelativePositionFromJSON` et `relativePositionToAbsolutePosition(doc, fragment, position, binding.mapping)`, sous `try`. Elle exige `de < a`, un même parent pour `$de` et `$a`, que ce parent soit un bloc de texte, et que les deux bornes soient dans son contenu.
- **`edition/commentaires.ts`** (nouveau) : une extension Tiptap qui porte un greffon ProseMirror.
  - État du greffon : un `DecorationSet` de décorations en ligne, de classe `CLASSE_DU_PASSAGE_COMMENTE`. L'identifiant du fil est gardé dans la spécification de la décoration, jamais dans un attribut du DOM.
  - **Moment de la résolution** (piège) : la liaison écrit une transaction locale dans le fragment dans sa vue (`update`), après l'application de l'état. Résoudre dans `apply` lirait l'ancien fragment avec les nouvelles positions.
    - La résolution complète est donc relancée par un observateur profond du fragment, posé à la création de l'éditeur, après celui de la liaison, et par tout changement de la liste des fils reçue en propriété.
    - Elle est différée d'une microtâche, puis publiée par une transaction de méta-données seule (`addToHistory: false`, aucun pas).
    - Entre-temps, `apply` déplace les décorations par `tr.mapping`, pour l'affichage seulement.
    - Une transaction sans pas ne change pas le fragment : aucune boucle, aucune mise à jour Yjs (AC20, AC22).
  - Sortie vers le module des commentaires : `surResolution({ ordre, detaches })`, appelée seulement quand l'ordre des fils ancrés (par `de`, puis ordre de création) ou l'ensemble des détachés change, et non à chaque frappe.
  - Clic sur un passage, ou Mod+Alt+M curseur dans un passage : `surFilActive(id)` (AC23).
  - `brancher(actions)` donne au panneau `allerAuPassage(id)` : sélection posée, défilement (`scrollIntoView`), focus.
- **`EditeurDePage.tsx`** : propriété facultative `passages?: PassagesCommentes`. Sans elle, ni greffon ni commande : tous les tests et appelants actuels restent valables. Elle porte :
  - les fils ouverts à surligner (identifiant et ancre) ;
  - la disponibilité (`true`, ou la raison) ;
  - le prédicat de Mod+Alt+M ;
  - `surCommenter(ancre)`, `surFilActive`, `surResolution` et `brancher`.
  - « Commenter » s'ajoute aux commandes de la barre de blocs (`BarreDeBlocs`), indisponible avec sa raison hors d'une sélection admise, sauf curseur dans un passage surligné (R3).
  - Annuler le formulaire rend le focus par `editor.commands.focus()`, la sélection de l'éditeur étant intacte (AC1).
- **`edition/index.ts`** exporte les types `PassagesCommentes`, `AncreDeLEditeur`, `ActionsDesPassages` et `ResolutionDesPassages`, faits de données et de fonctions.
- **Présentation** (`interface/composants/Edition.tsx`, `edition.classes.ts`) : `CLASSE_DU_PASSAGE_COMMENTE`, soulignement plus fond de jeton, jamais la couleur seule (AC22, AC31). `styles/jetons.css` gagne deux jetons sémantiques, le fond du passage et son trait, avec la paire « texte sur fond du passage » au test de contraste de F-004-AC7 (≥ 4,5).
- **Textes** (`interface/messages.ts`) : `COMMENTER`, raisons « Sélectionnez un passage dans un seul bloc », « Lecture seule », « Commentaires illisibles ».

### Module des commentaires (bloc 4)

- **`droits.ts`** : `TABLE_DES_DROITS`, la seule table (AC13), et `commandesPermises(contexte, commentaire?)`.
  - Le contexte est `{ ecriture, rattachement, compte, moderateur }`. `ecriture` vaut le droit d'écriture de F-013, ou vrai pour un espace `local` ; `moderateur` vaut le rôle `proprietaire` confirmé.
  - « Le sien » : compte `connecte` et `auteur.id === compte.id`. Un commentaire sans auteur se modifie et se supprime par tout membre en écriture.
  - Aucun champ d'un commentaire n'entre dans le contexte (AC17).
- **`moderation.ts`** : `lireLeRole({ idEspace, rattachement, compte, lireEspace, horloge })`.
  - Appelée à chaque ouverture du panneau, elle n'émet `GET /api/v1/espaces/:idEspace` que pour un espace `adopte` et un compte `connecte`, au plus une fois par 60 s.
  - La lecture est validée par le client existant (`compte/client-espaces.ts`, `schemaEspace`), et le rôle est tenu en mémoire dans le module.
  - Un échec, une échéance ou l'absence de réseau laissent `moderateur` faux, sans message (AC14). Le remontage de F-032 à chaque changement d'espace remet ce rôle à zéro.
- **`affichage.ts`** : `filsAffiches(lus, resolution, filtre)`, fonction pure.
  - Ordre d'AC8 : fils ancrés selon `resolution.ordre`, puis fils de page, puis détachés, chacun dans l'ordre de création ; même règle pour le filtre « Résolus ».
  - Coupe aux 500 premiers commentaires dans cet ordre, avec « N autres commentaires ne sont pas affichés » (AC26) ; mention « N commentaires illisibles » (AC25).
  - Avant la première résolution par l'éditeur, les fils à ancre ne sont rangés ni ancrés ni détachés : ils sont rendus en fin de liste, sans intertitre, jusqu'au premier `surResolution`.
- **`annonces.ts`** : une annonce au plus par 5 s, horloge injectée, pour l'arrivée d'un commentaire par `observerLesCommentaires(recue = true)` : un identifiant nouveau parmi les lus (AC30).
- **`use-commentaires.ts`** : abonnement à `commentaires` par `useSyncExternalStore`, et opérations complétées de l'auteur déclaré (AC5 : `compte.statut === "connecte"` donne `{ id, nom }`, sinon `null`) et de la date de l'appareil (horloge injectée, `toISOString`). Les erreurs typées sont rendues en messages qui citent la règle ou la limite (AC4, AC26).
- **Composants** : `PanneauDesCommentaires.tsx` (région « Commentaires », phrase d'AC16 permanente, filtre « Résolus », intertitre « Détachés », « Commenter la page »), `FilAffiche.tsx` (groupe nommé par l'auteur et le début du texte ; « Aller au passage » sur un fil ancré seulement), `FormulaireDeCommentaire.tsx` (champ nommé, message rattaché, compteur sous 200 restants, Mod+Entrée, Échap), `BoutonDesCommentaires.tsx` (`aria-expanded`, nombre de fils ouverts). La confirmation de suppression est la boîte d'alerte existante, focus sur « Annuler ».
  - Tout texte venu d'un commentaire est un nœud de texte React ; les sauts de ligne viennent de `white-space: pre-wrap`, et le nom est dans un `<bdi>`.
  - Aucun `href`, `src` ni `style` ne vient d'un commentaire (AC24). Les dates sont affichées à la minute par `Intl.DateTimeFormat` (AC16).
- **Textes** (`commentaires/textes.ts`), tous en un fichier, pour le parcours d'AC16. **Présentation** : `interface/composants/Commentaires.tsx` et `commentaires.classes.ts` (jetons seulement, `transform` et `opacity` sur des jetons de durée, AC31).

### Coquille et écran du compte (bloc 5)

- **`ZonePrincipale.tsx`** : `CorpsDePage` porte l'éditeur (avec `passages`) et, à côté, le panneau. La mise en page vient de `Commentaires.tsx` : côte à côte sur écran large, empilés sur écran étroit, sans défilement horizontal à 360 px. Le bouton « Commentaires » est en tête du corps de la page.
- **`Application.tsx`** : donne à la zone le compte (`compte.suivi`), la lecture de l'espace (`compte.espaces.lireEspace`), l'identifiant et le rattachement de l'espace ouvert, et le droit. Le panneau est fermé au changement de page.
- **`interface/raccourcis.ts`** : `commenter: { touche: "m", modificateurs: ["Mod", "Alt"] }`, et le prédicat que la zone passe à l'éditeur. Piège : sous macOS, Option change `key` (« µ ») ; le prédicat admet aussi `code === "KeyM"` quand `key` n'est pas une lettre. À éprouver au bloc 5 et par AC35 (Chromium).
- **AC15** : avec R4, le panneau expose ses sept commandes indisponibles, raison « Lecture seule » ; la barre de blocs reste non rendue (F-013-AC25) et Mod+Alt+M n'ouvre rien. Le test de F-013-AC25 (`test/synchronisation-ecrans.test.tsx`) est étendu à ces commandes. Sans décision sur R4, la barre est rendue en lecture seule avec la seule commande « Commenter », indisponible : c'est la lettre d'AC15, et une exception à F-013-AC25 à consigner.
- **AC43** (F-027 fusionnée) : `messages-gestion-du-compte.ts` gagne `COMMENTAIRES_GARDENT_L_ANCIEN_NOM` ; `EcranDuCompte.tsx` annonce « Nom modifié. Les commentaires que vous avez déjà écrits gardent votre ancien nom. » ; `test/gestion-du-compte-ecran.test.tsx` ne change que ce texte. Aucune écriture dans un document.

## Plan par blocs (un commit par bloc)

0. **Orchestrateur et dev, avant le code** :
   - fusion de `main` (F-032 fusionnée, et F-015 si elle l'est) dans `F-016` ;
   - constats d'ordre ci-dessus refaits (version prise en charge, F-025, F-027) ;
   - décisions du dev sur R1 à R9 ;
   - commit du dev qui applique le diff de l'annexe (`.dependency-cruiser.cjs`) ;
   - `dossier-revue.sh --conception F-016`, puis `gate.sh agent-architecte F-016`.
1. **agent-frontend — `packages/document`** : `format-page.ts`, `commentaires.ts`, `document-page.ts`, `erreurs.ts`, `index.ts`. Tests sous Node, `yjs` seul :
   - AC10 et AC18 ;
   - AC19 (`fast-check`, deux puis trois répliques, suites de créer, répondre, modifier, résoudre, rouvrir, supprimer, échanges dans un ordre quelconque) ;
   - AC25 (table des formes mal formées) ;
   - AC26 et AC29 (refus typés, aucune écriture) ;
   - AC12 et AC38 (texte et nom témoins absents de `Y.encodeStateAsUpdate` après suppression et modification, sur la réplique qui écrit et sur celle qui reçoit) ;
   - AC36 (aller-retour JSON par `compareRelativePositions`, refus de l'ancre vide) ;
   - AC37 (type ouvert par `getMap` avant la façade : page ouverte, lecture `lisible: false`, écritures refusées, aucune mise à jour) ;
   - AC27, AC28 (élévation dans la transaction du premier commentaire, aucune écriture à l'ouverture, refus du document par une table limitée à la version 3) et AC39 (exports, codes, couture des appelants de la version) ;
   - volet « position nulle » d'AC20 par `yjs` seul.
   - Tests modifiés : `test/structure.test.ts` (liste des exports allongée des seuls ajouts), `test/page-version.test.ts` (ligne 4), et les listes de codes d'erreur s'il y en a.
2. **agent-frontend — session de page** : `page/session-page.ts`. Tests : `commentaires` de l'état `pret` sur un document de chaque ligne et de la version 5 (AC39, appelants d'`apps/web`), AC38 (énumération des `new Y.Doc(`), AC28 (ouverture d'une page commentée : aucune mise à jour).
3. **agent-frontend — édition** : `edition/ancres.ts`, `edition/commentaires.ts`, `EditeurDePage.tsx`, `schema.ts` (extension ajoutée quand `passages` est donné), `index.ts`, `interface/composants/Edition.tsx`, `edition.classes.ts`, `interface/messages.ts`, `styles/jetons.css`. Tests jsdom, éditeur et liaison réels :
   - AC3 ;
   - AC20 : texte commenté supprimé, bloc supprimé, bloc descendu et voisin franchi par un bloc monté, par la suppression suivie d'une insertion et par la commande de F-006, bloc supprimé puis remplacé, fusion avec le précédent. Dans chaque cas : fil détaché, nombre de commentaires inchangé, aucune mise à jour émise par l'affichage, aucun autre texte surligné. Pour tout déplacement : ancré sur le passage d'origine ou détaché ;
   - AC21 (insertion avant et dans le passage, fusion du suivant, annulation d'une suppression seule dans son pas) ;
   - AC22 (fragment, schéma, historique, presse-papiers inchangés) ;
   - AC23 côté éditeur (sélection posée ; le défilement n'est pas mesurable sous jsdom) ;
   - AC36 (aucune occurrence d'`encodeRelativePosition` ni de `decodeRelativePosition` dans `apps/web/src` et `packages/document/src`) ;
   - AC32 (dépendances `@tiptap/*` de tous les manifestes, versions exactes, aucun `@tiptap-pro`, résolutions du verrou sur le registre public) ;
   - mesure : 500 fils sur une page de 2 000 blocs, durée d'une résolution complète consignée. Au-delà de 16 ms, la publication est regroupée par image, ce qui reste conforme à AC20 (calcul à chaque modification) ;
   - tests modifiés : `test/structure-edition.test.ts` et `test/dependances-edition.test.ts`, listes allongées de `@tiptap/y-tiptap` importée par l'édition.
4. **agent-frontend — module des commentaires** : `apps/web/src/commentaires/**`, `interface/composants/Commentaires.tsx`, `commentaires.classes.ts`. Tests jsdom, façade réelle, éditeur simulé par ses types :
   - AC2, AC4, AC5, AC7 à AC9, AC11, AC12 (boîte, focus), AC13 (rôles de `ROLES` de `@notionlike/contrats`, espace `local`, chaque état du compte), AC14 (horloge injectée, requête comptée), AC16, AC17 ;
   - AC24 (table des valeurs piégées en un seul fichier d'aide, écrites par `yjs` seul) ;
   - affichage d'AC25, AC26 et AC37 ; AC30 (sauf la mesure réelle) ; AC31 (contrôles statiques de F-004) ; AC34 (requêtes, console, stockages espionnés).
5. **agent-frontend — coquille** : `ZonePrincipale.tsx`, `Application.tsx`, `raccourcis.ts`, `EcranDuCompte.tsx`, `messages-gestion-du-compte.ts`, aides de la coquille, démonstration si son test exige chaque composant de présentation. Tests jsdom :
   - AC1 de bout en bout dans la coquille (Mod+Alt+M, Publier, surlignage, focus, Échap) ;
   - AC15 (extension du test de F-013-AC25, état encodé identique octet pour octet) ;
   - AC23 (panneau ouvert sur le fil) ;
   - AC28 (panneau ouvert sans écriture) ;
   - AC40 (premier commentaire ancré puis de page, annulation jusqu'à épuisement, version et commentaire intacts, document vierge qui reçoit les mises à jour) ;
   - volet client d'AC33 (couture des appelants d'`EditeurDePage` et de la façade, F-003-AC2, AC12, AC14, AC19, AC22, AC29, F-003-AC25) ;
   - AC43.
6. **agent-frontend — serveur réel** (Node, projet `web-synchronisation`, fabrique d'essai) : AC6 (WebSocket coupée, écriture, rechargement depuis fake-indexeddb, reconnexion, lecture sur un second client) et volet serveur d'AC33 (document rempli de commentaires relu à l'identique par le serveur ; suppression définitive ; passe de fond qui transmet sans lire), sans modification d'`apps/server`, de `packages/contrats` ni de `packages/db`.
7. **agent-frontend — `apps/web/e2e/commentaires.spec.ts`** (AC35), ignoré sans serveur comme ceux de F-013, joué par le dev sur la pile de F-031 avant le DONE (D-003).
8. **agent-architecte-conception** : `ARCHITECTURE.md` aligné sur le diff livré (module des commentaires, format, flux d'une écriture, menaces), addendum de cette note et de l'ADR-0021, amendement de l'ADR-0009 corrigé d'après le code.

Puis : dossier de revue, gates (`reviewer-frontend`, sécurité, architecture, craft).

## Fichiers

- Nouveaux :
  - `packages/document/src/commentaires.ts` ;
  - `apps/web/src/edition/{ancres,commentaires}.ts` ;
  - `apps/web/src/commentaires/{index,droits,moderation,affichage,annonces,textes,use-commentaires}.ts` ;
  - `apps/web/src/commentaires/{PanneauDesCommentaires,FilAffiche,FormulaireDeCommentaire,BoutonDesCommentaires}.tsx` ;
  - `apps/web/src/interface/composants/{Commentaires.tsx,commentaires.classes.ts}` ;
  - les tests de chaque bloc, `apps/web/e2e/commentaires.spec.ts`.
- Modifiés :
  - `packages/document/src/{format-page,document-page,erreurs,index}.ts` ;
  - `apps/web/src/page/session-page.ts` ;
  - `apps/web/src/edition/{EditeurDePage.tsx,schema.ts,index.ts}` ;
  - `apps/web/src/interface/{ZonePrincipale,Application,EcranDuCompte}.tsx` ;
  - `apps/web/src/interface/{raccourcis,messages,messages-gestion-du-compte}.ts` ;
  - `apps/web/src/interface/composants/{Edition.tsx,edition.classes.ts}` ;
  - `apps/web/src/styles/jetons.css` (et `entree.css` s'il le faut).
- Tests modifiés, chacun parce qu'une liste fermée s'allonge ou qu'un critère l'exige :
  - `packages/document/test/{structure,page-version}.test.ts` ;
  - `apps/web/test/{structure-edition,dependances-edition,synchronisation-ecrans,gestion-du-compte-ecran,jetons}.test.ts(x)` ;
  - `apps/web/test/aides-jetons.ts` et les aides de la coquille.
- Protégé : `.dependency-cruiser.cjs`, commit du dev (annexe).
- Non touchés :
  - `apps/server/**`, `packages/contrats/**`, `packages/db/**` (AC33) ;
  - `apps/web/src/{persistance,synchronisation,espace,compte,glisser,table,vues-de-table,navigation,identifiants}/**` ;
  - `apps/web/package.json`, `packages/document/package.json` (`fast-check` 4.10.2 y est déjà) ;
  - `pnpm-lock.yaml`, `eslint.config.mjs`, `vitest.config.*`, l'infra, la configuration.

## Ce qui est prouvé, et où

- **Vitest, Node, `yjs` seul** (`packages/document`) : format, convergence, propriétés, lecture tolérante et protégée, bornes, état encodé, version et coutures (H14 a).
- **Vitest, jsdom** (`apps/web`) : éditeur et liaison réels pour l'ancrage et le surlignage ; panneau et coquille sur une façade réelle ; droits, rôle, annonces et délais par horloge injectée (H14 b). Sous jsdom, le défilement d'AC23 n'est prouvé que par la sélection posée, et Mod y vaut Ctrl.
- **Vitest, Node contre le serveur réel** : AC6 et le volet serveur d'AC33 (H14 c).
- **Navigateur seulement** (AC35, D-003) : rien ne s'exécute d'un commentaire piégé ; le couper-coller détache un fil ; Mod+Alt+M réel (macOS et Option) ; mise en page à 360 px ; focus visible ; contraste rendu.
- **Non prouvés** :
  - la règle exacte par laquelle 3.0.9 choisit le bloc recréé (constatée sur des cas, non lue dans le code) ;
  - l'annulation d'un déplacement de bloc dans l'éditeur (H6, hors d'AC21) ;
  - Firefox et WebKit.

## Recouvrements

Lus en lecture seule : `git show F-032:docs/decisions/F-032-conception.md` et `git show F-015:docs/decisions/F-015-conception.md`.

- **F-032** (plusieurs espaces ; code à venir, puis fusion avant F-016). Fichiers communs :
  - `interface/Application.tsx` (propriété `espaces`, changement d'espace, sélecteur) ;
  - `interface/ZonePrincipale.tsx` (accueil vide) ;
  - `interface/messages.ts` ;
  - `demonstration/{PageDemonstration.tsx,donnees.ts}` ;
  - les aides de la coquille et `test/structure.test.ts`.
  - Aucun conflit de sens : le remontage par clé de F-032 remet à zéro le panneau et le rôle confirmé à chaque changement d'espace, ce qui est le comportement voulu (AC14 : « pendant la session »). F-032 ne touche ni `packages/**`, ni `page/**`, ni `edition/**`.
- **F-015** (présence ; conception faite, code après F-032). Fichiers communs :
  - `edition/{schema.ts,EditeurDePage.tsx,index.ts}` (F-015 : extension de curseurs et propriété `presence` ; F-016 : greffon des passages et propriété `passages`) ;
  - `interface/composants/{Edition.tsx,edition.classes.ts}` et `styles/jetons.css` (huit couleurs de présence ; deux jetons du passage) ;
  - `interface/ZonePrincipale.tsx` (`CorpsDePage` : liste des présents puis éditeur ; éditeur et panneau) ;
  - `interface/Application.tsx` ;
  - les tests `structure-edition`, `dependances-edition`, `jetons`, la couture des appelants d'`EditeurDePage` (F-015-AC31, F-016-AC33), et la liste attendue des `@tiptap/*` d'AC32 (F-015 ajoute `@tiptap/extension-collaboration-caret`) ;
  - `.dependency-cruiser.cjs` : la même ligne de `web-edition-liste-blanche` (F-015 ajoute `collaboration-caret`, F-016 ajoute `y-tiptap`). F-016 ne touche pas `web-src-liste-blanche` ni la synchronisation.
  - F-015 ne touche pas `packages/document` ni `page/`.
- **Ordre de fusion recommandé : F-032, puis F-015, puis F-016.** C'est l'ordre de `MEMORY/STATE.md`, et F-015 est plus avancée. Les blocs 1 et 2 de F-016 peuvent être codés pendant F-015, sans conflit. Si F-016 devait passer avant F-015, celle-ci recomposerait ses deux fichiers d'édition et la ligne commune du contrat (annexe, variante).
- **Numéros** : ADR-0019 est prise par F-018, ADR-0020 par F-015 (sur sa branche) ; F-016 prend ADR-0021. Version de page : 4, sauf si une autre feature qui élève la version (F-022) fusionne avant le premier commit de code.

## Retouches de spec à proposer au dev (spec non modifiée)

- **R1 (H6, comportement réel sous 3.0.9)** : remplacer « La veille constate qu'une ancre suit le texte quand on insère avant elle, et ne suit PAS un bloc déplacé (une suppression suivie d'une insertion, F-006) : elle se résout alors à la frontière de deux autres blocs. » par : « La veille constate (2026-10-08, rejoué le 2026-10-26 sous `@tiptap/y-tiptap` 3.0.9) qu'une ancre suit le texte quand on insère avant elle, et qu'un déplacement de bloc (une suppression suivie d'une insertion du même nœud, F-006) fait recréer par la liaison l'un des deux blocs qu'il croise : le bloc descendu, ou le voisin que franchit un bloc monté. Les ancres du bloc recréé ne se résolvent plus (étendue vide à une frontière de bloc chez l'auteur du déplacement, positions nulles chez une réplique qui le reçoit et au rechargement) ; celles de l'autre bloc sont suivies. Un déplacement peut donc détacher le fil d'un bloc que personne n'a déplacé et garder celui du bloc déplacé ; jamais un autre texte n'est surligné. » Et, dans le point (1) de H6, « L'étendue d'un bloc déplacé, supprimé ou fusionné avec le précédent » devient « L'étendue d'un bloc recréé par la liaison lors d'un déplacement, supprimé ou fusionné avec le précédent ».
- **R2 (AC20, test)** : remplacer « déplacer le bloc par une suppression suivie d'une insertion, comme le fait F-006 (et par la commande de F-006 si elle est livrée) » par « descendre le bloc d'un cran par une suppression suivie d'une insertion, comme le fait F-006, et par la commande de F-006 ; monter au-dessus de lui, par les mêmes moyens, le bloc qui le suit » ; et ajouter à la fin de la phrase qui énumère les constats : « ; et, pour tout déplacement de bloc, le fil est ancré sur son passage d'origine ou détaché ». Dans la dernière phrase, « pour les mêmes opérations » devient « pour les opérations qui retirent le texte du bloc commenté ou le recréent (texte supprimé, bloc supprimé, bloc déplacé, bloc remplacé, bloc fusionné avec le précédent) ».
- **R3 (AC3 et AC23)** : AC3 dit la commande indisponible sur une sélection vide, AC23 l'ouvre sur un curseur dans un passage surligné. Ajouter à AC3, après « s'étend sur plusieurs blocs, » : « hors d'un passage surligné où se trouve le curseur (F-016-AC23), ».
- **R4 (AC15 contre F-013-AC25)** : en lecture seule, la barre de blocs n'est pas rendue (F-013-AC25, ADR-0009, amendement F-012 et F-013) ; « Commenter » ne peut donc pas y être exposée. Proposition : dans AC15, remplacer « « Commenter », « Commenter la page » » par « « Commenter la page » » et ajouter après l'énumération : « ; « Commenter » n'est pas offerte, la barre de blocs n'étant pas rendue en lecture seule (F-013-AC25), et Mod+Alt+M n'ouvre rien et n'écrit rien ». Sans décision : barre rendue en lecture seule avec la seule commande « Commenter », indisponible (décision par critère, bloc 5).
- **R5 (AC4, mesure)** : le texte est enregistré tel que saisi, mais la borne se juge sur le texte sans ses blancs de tête et de fin : un texte de 1 990 caractères suivi de 50 espaces serait accepté puis lu « (tronqué) ». Proposition : « SI le texte saisi, blancs de tête et de fin retirés, est vide, ou si le texte tel que saisi dépasse 2 000 caractères (unités de code UTF-16, comme les autres bornes de `@notionlike/document`), ALORS ». Le compteur compte alors le texte tel que saisi.
- **R6 (AC39, exports)** : AC26 exige des bornes déclarées dans `@notionlike/document`, lues aussi par le panneau (compteur, coupe à 500), et les opérations ont des types. Proposition : « sans autre export nouveau que les opérations sur les commentaires de F-016-AC29, leurs types et la constante des limites de F-016-AC26 ». La conception n'exporte aucune fonction de plus : les opérations sont des membres de la façade.
- **R7 (H7, information)** : la fiche d'un fil reste dans le document après la suppression de tous ses commentaires, sans être affichée. C'est ce qui permet à une réponse concurrente de retrouver son fil (AC18). Phrase proposée à la fin de H7 : « La fiche d'un fil (ancre, extrait, état et auteur déclaré de sa résolution) reste dans le document après la suppression de tous ses commentaires, sans être affichée, pour qu'une réponse concurrente retrouve son fil (F-016-AC18) ; elle part avec la page. »
- **R8 (prérequis, `.dependency-cruiser.cjs`)** : la ligne « aucune règle de plus n'est exigée » tient, mais un contrat change : le module d'édition importe désormais `@tiptap/y-tiptap` (positions relatives et table de correspondance de la liaison), que `web-edition-liste-blanche` n'admet pas, et que l'ADR-0009 dit importé par aucun fichier de `src/`. Proposition : ajouter « ; `web-edition-liste-blanche` admet `@tiptap/y-tiptap`, déjà déclarée par `apps/web` (diff de la conception) ».
- **R9 (H15, constat d'ordre)** : F-027 est fusionnée dans `main` (`2e65313`), F-025 ne l'est pas. F-016-AC43 a donc un objet, et F-027 s'ajoute aux prérequis ; F-016-AC41 et AC42 sont sans objet, sous réserve du constat du bloc 0. Rien à réécrire si l'ordre ne change pas d'ici là.

## Menaces propres à F-016

- **Contenu de page piégé** (texte, nom, extrait, ancre forgés par un membre en écriture). Le panneau ne crée que des nœuds de texte, et aucun attribut `href`, `src` ni `style` ne vient d'un commentaire (AC24, table de valeurs). Les décorations ne portent que des classes de l'application ; l'identifiant reste dans leur spécification. Une ancre forgée est validée en forme par le paquet, résolue sous `try`, et jamais surlignée hors du texte d'un seul bloc (AC20).
- **Auteur ou date usurpés** : possible pour tout membre en écriture (H3), accepté. La phrase d'AC16 le dit ; aucun texte ne le présente comme vérifié. Un commentaire forgé au nom du compte connecté n'y gagne que « le sien » (AC17) ; ni rôle ni champ inconnu n'entrent dans la table des droits.
- **Volume** : bornes à l'écriture (2 000, 100, 500), affichage coupé à 500, lecture linéaire. Le seul plafond qu'un client modifié ne franchit pas est celui du document, 20 Mio (F-012-AC23). Le coût de la résolution des ancres de tous les fils ouverts à chaque modification du contenu est mesuré au bloc 3.
- **Type forgé** : un pair ne choisit pas le constructeur local, mais il peut écrire des entrées nommées ou des éléments non comptés sous `commentaires`. Le type est alors illisible (AC37), sans écriture ni exception, et l'éditeur reste utilisable.
- **Version** : un document de version 4 est refusé en entier par une application de version 3 (F-003-AC19, seconde barrière de F-013). Des commentaires forgés dans un document resté en version 3 sont lus, et la première écriture élève la version.
- **Lecteur** : le serveur lui impose la lecture seule sur le document de page (F-012-AC10). Un client modifié ne peut donc pas écrire de commentaire ; les commandes sont indisponibles côté interface (AC15).
- **Membre retiré qui garde une copie locale** : il garde les commentaires comme le reste de la page (F-011 H2, inchangé).
- **Effacement** : un commentaire supprimé quitte l'état encodé tenu en mémoire, mais pas les mises à jour déjà émises ni les sauvegardes (H7, F-025). La fiche d'un fil survit à ses commentaires (R7).
- **Fuites** : aucun texte, extrait ni nom dans une adresse, la console ou un stockage autre que la base de la page (AC34, test espion). La seule requête nouvelle est celle du rôle, sans contenu.
- **Accès à un document d'un autre espace, invitation rejouée, mise à jour de synchronisation géante** : inchangés. Aucune route, aucun message ni aucun nom de document nouveau.

## Annexe : fichiers protégés

**`.dependency-cruiser.cjs`** : un seul contrat change, `web-edition-liste-blanche`, élargi à `@tiptap/y-tiptap`. `edition-confinee` réserve déjà ce paquet au module d'édition (`@tiptap/` partout ailleurs), aucune règle n'est ajoutée.

Diff contre `main` `d592ad8`, à appliquer par `git apply` depuis la racine. Vérifié sur la branche `F-016` à `d8dfef1` :

- `git apply --check` vert ;
- `depcruise --config <copie modifiée> apps packages` : `✔ no dependency violations found (653 modules, 2823 dependencies cruised)`.

L'admission effective d'un import de `@tiptap/y-tiptap` depuis `apps/web/src/edition/` sera constatée au bloc 3, par `pnpm contrats`, à son premier import. Lignes coupées ici pour la lecture : le diff réel remplace chaque ligne en entier.

```diff
--- a/.dependency-cruiser.cjs
+++ b/.dependency-cruiser.cjs
@@ -442,7 +442,7 @@
       name: "web-edition-liste-blanche",
       severity: "error",
       comment:
-        "F-003-AC27, F-006-AC32, F-005-AC33, F-033-AC25 : le module d'édition n'importe que lui-même, le composant de présentation de l'édition, les textes de l'interface, react, yjs, les paquets Tiptap qu'il emploie, poignée de bloc (drag-handle, drag-handle-react, node-range), curseur de dépôt (@tiptap/extensions), bloc code (extension-code-block) et utilitaire de suggestion (suggestion) compris, @floating-ui/dom (placement du menu slash), et, depuis F-033, lowlight, highlight.js et les types hast (coloration du bloc code, réservés à coloration.ts par coloration-confinee) ; ni @floating-ui/core, ni @floating-ui/utils, ni @dnd-kit/*.",
+        "F-003-AC27, F-006-AC32, F-005-AC33, F-033-AC25, F-016-AC32 : le module d'édition n'importe que lui-même, le composant de présentation de l'édition, les textes de l'interface, react, yjs, les paquets Tiptap qu'il emploie, poignée de bloc (drag-handle, drag-handle-react, node-range), curseur de dépôt (@tiptap/extensions), bloc code (extension-code-block), utilitaire de suggestion (suggestion) et liaison Yjs (y-tiptap, positions relatives des ancres de commentaire, ADR-0021) compris, @floating-ui/dom (placement du menu slash), et, depuis F-033, lowlight, highlight.js et les types hast (coloration du bloc code, réservés à coloration.ts par coloration-confinee) ; ni @floating-ui/core, ni @floating-ui/utils, ni @dnd-kit/*.",
       from: { path: "^apps/web/src/edition/" },
       to: {
         pathNot: [
@@ -450,7 +450,7 @@
           "^apps/web/src/interface/composants/Edition\\.tsx$",
           "^apps/web/src/interface/messages\\.ts$",
           "(^|/)node_modules/(react|yjs)/",
-          "(^|/)node_modules/@tiptap/(core|pm|react|extensions|suggestion|extension-(bold|code-block|collaboration|document|drag-handle|drag-handle-react|heading|italic|link|list|node-range|paragraph|text))/",
+          "(^|/)node_modules/@tiptap/(core|pm|react|extensions|suggestion|y-tiptap|extension-(bold|code-block|collaboration|document|drag-handle|drag-handle-react|heading|italic|link|list|node-range|paragraph|text))/",
           "(^|/)node_modules/@floating-ui/dom/",
           "(^|/)node_modules/(lowlight|highlight\\.js|@types/hast)/",
         ],
```

**Variante si F-015 est fusionnée avant** : son annexe réécrit ces deux mêmes lignes (`F-015-AC29` dans le commentaire, `collaboration-caret` dans l'expression). Le diff de F-016 s'y applique en ajoutant ` F-016-AC32` après `F-015-AC29`, le membre de phrase sur la liaison après celui de F-015, et `y-tiptap|` avant `extension-(` dans l'expression. Le texte final est à regénérer contre ce `main`-là, au bloc 0.

**Aucun autre fichier protégé** : ni `eslint.config.mjs` (`randomUUID`, `transact` et `getArray` restent hors d'`apps/web/src`, la façade les porte), ni `vitest.config.*` (projets existants : `packages/document` sous Node, `apps/web` sous jsdom et `web-synchronisation` sous Node), ni aucun `package.json` (`fast-check` 4.10.2 est déjà dans `packages/document`, `@tiptap/y-tiptap` 3.0.9 déjà dans `apps/web`), ni `pnpm-lock.yaml`.

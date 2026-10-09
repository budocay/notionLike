# ADR-0008 — Persistance locale : `y-indexeddb` confinée, nom des bases, espace local, délai et échecs

Statut : accepté. Les trois conséquences qui citent F-002-AC16, AC17 et AC24, écrites « proposées » contre le texte de ces critères amendé au commit `3a1253a`, sont acceptées depuis que le dev a revalidé `specs/F-002.md` (commit `86542e8`, `Agent: dev`)
Date : 2026-10-08 ; révisé le même jour après le premier rejet du gate de conception de F-002 ; précisé le 2026-10-09 après le bloc 2 (valeur nulle et base de l'appareil sans son magasin, dans « Identifiant de l'espace local »), sans changement de décision

## Contexte et problème

Le document d'espace doit être enregistré sur l'appareil et relu à chaque ouverture (F-002-AC2), sans jamais bloquer l'écran (AC3, AC16, AC24), sans mêler les espaces d'un même appareil (AC25), sans qu'un identifiant de forme inattendue n'entre dans un nom de base (AC28), et sans qu'aucune erreur de stockage ne s'échappe (AC16). La spec retient `y-indexeddb@9.0.12` (H2), dont la veille et la lecture du source montrent les limites :

- aucune gestion d'erreur : ouverture refusée, lecture ou écriture en échec deviennent des rejets de promesse que personne ne peut attacher ; `indexedDB` absent donne un rejet non géré et une promesse `whenSynced` qui ne se résout jamais ;
- aucun délai ;
- à l'ouverture, elle écrit l'état du document reçu avant d'appliquer ce qui est stocké ;
- chaque mise à jour est écrite dans une transaction qu'elle laisse le navigateur valider seul ;
- le nom de la base est celui passé au constructeur.

Ce qui se défait mal : le nom des bases et le format stocké (migration sur chaque appareil).

## Options étudiées

- **A. `y-indexeddb` derrière un module qui porte ce qu'elle ne fait pas** (retenue).
- B. Écrire la persistance sur IndexedDB sans bibliothèque. Écartée pour F-002 : la spec et la fiche retiennent `y-indexeddb`, et le compactage du journal serait à réécrire. Le module de l'option A rend ce remplacement local s'il devient nécessaire.
- C. `y-indexeddb` appelée directement par la session. Écartée : F-002-AC22 l'interdit, et F-003, F-007, F-013 et F-018 ont besoin du même délai et des mêmes échecs.

Pour l'identifiant de l'espace local (spec H1 : « conservé sur l'appareil », sans dire où) :

- **A. Une base IndexedDB de l'appareil, lue et écrite dans une seule transaction** (retenue).
- B. `localStorage`. Écartée : lecture puis écriture n'y sont pas atomiques entre onglets ; deux onglets lancés ensemble au premier lancement retiendraient deux identifiants, et l'un perdrait sa page au rechargement (F-002-AC4).
- C. Déduire l'espace de l'énumération des bases. Écartée : ambiguë dès F-014, et sujette à la même course.

## Décision

**Un module, une interface.** `apps/web/src/persistance/` ; le reste de l'application n'importe que `persistance/index.ts`, qui n'expose aucun type de `y-indexeddb` :

```ts
type DesignationDocument =
  | { readonly type: "espace"; readonly idEspace: string }
  | { readonly type: "page"; readonly idEspace: string; readonly idPage: string }
  | { readonly type: "table"; readonly idEspace: string; readonly idTable: string };

type EtatPersistance = "relecture" | "active" | "coupee" | "fermee";

interface Persistance {
  lireEtat(): EtatPersistance;
  abonner(rappel: () => void): () => void;
  fermer(): void;
}

function ouvrirPersistance(doc: Y.Doc, designation: DesignationDocument): Persistance;
function ouvrirEspaceLocal(doc: Y.Doc, idCandidat: string): Persistance;
class ErreurPersistance extends Error {} // code "identifiant-invalide"
```

`y-indexeddb` n'est importée que par `persistance/indexeddb.ts` (contrat `web-y-indexeddb-confinee`, tests compris). `indexedDB` n'est nommé que dans ce module (ESLint). Le module n'importe ni React ni `@notionlike/document` ; hors de lui-même, il n'importe que `yjs`, `y-indexeddb` et la fonction de forme d'`identifiants/` (ADR-0007).

**Nom des bases (difficile à défaire).** Une seule fonction, interne au module, dans un fichier qui ne fait que calculer (`nom-de-base.ts` : aucun accès à IndexedDB, aucun import hors d'`identifiants/`, tenu par le contrat `web-formes-pures` et par une règle ESLint sur les globales, ADR-0007), produit le nom à partir d'une désignation : `notionlike:espace:<idEspace>`, `notionlike:page:<idEspace>:<idPage>`, `notionlike:table:<idEspace>:<idTable>` (spec H3). Le type `DesignationDocument` rend l'identifiant d'espace obligatoire pour une page ou une table. Cette fonction applique `estUuidCanonique` (ADR-0007 : 36 caractères, `8-4-4-4-12` en hexadécimal minuscule, longueur comparée d'abord) à chacun des identifiants qu'elle reçoit, espace, page ou table ; un seul identifiant refusé lève `ErreurPersistance` (code `identifiant-invalide`) avant toute ouverture, donc sans base ouverte ni créée (F-002-AC25, AC28). Le message de l'erreur ne cite pas l'identifiant. Deux garanties s'additionnent : l'isolation entre espaces tient au préfixe, de longueur fixe et sans autre `:`, fixé par l'identifiant d'espace ; le contrôle de l'identifiant de page ou de table écarte en plus toute chaîne qui n'a pas la forme produite par l'application, `:` compris. Tout littéral contenant `notionlike:` est interdit par ESLint dans `apps/web/src`, hors de deux fichiers du module : `nom-de-base.ts`, et `espace-local.ts` pour le nom de la base de l'appareil.

**Identifiant de l'espace local.** Il vit dans la base `notionlike:appareil` (version 1, magasin `reglages`, clé `espace-local`), qui n'est pas une base de document. `ouvrirEspaceLocal` contrôle le candidat par la fonction de nommage, puis lit la clé et, si elle manque, y inscrit le candidat, dans une seule transaction en écriture : IndexedDB sérialise les transactions d'un même magasin entre onglets, deux onglets lancés ensemble retiennent donc le même identifiant (essayé dans Chromium, essai B2). L'identifiant relu sur l'appareil repasse par la fonction de nommage avant de nommer une base : s'il n'est pas une chaîne, ou pas un UUID canonique, aucune base d'espace n'est ouverte et la persistance est `coupee` : le document reste en mémoire (F-002-AC28). Seule l'absence de la clé (`undefined`) vaut premier lancement et fait inscrire le candidat : une valeur nulle est une valeur relue, illisible comme toute autre, et elle n'est pas remplacée. La prendre pour une absence ferait ouvrir la base du candidat sans l'inscrire : chaque lancement tirerait un autre espace et perdrait les pages du précédent (F-002-AC2), ce que faisait le code de l'archive. Le candidat est tiré par la session (`crypto.randomUUID()`), jamais par le module. Si la base de l'appareil est inutilisable, même issue : ouverture refusée, transaction annulée, ou base présente sans son magasin `reglages`, cas où l'ouverture de la transaction lève et où le module ferme la connexion et coupe aussitôt, au lieu de laisser l'exception s'échapper et l'échéance courir (défaut de l'archive, corrigé au bloc 2). Le module ne répare ni la valeur ni la base : l'appareil reste sans enregistrement jusqu'à l'effacement des données du site, que F-007 apportera. L'identifiant retenu n'est pas exposé par l'interface du module dans F-002 : rien ne le lit en production (l'état de la session ne le porte pas, ADR-0007) et aucun critère ne le demande ; les tests le constatent par le nom de la base d'espace qu'ils énumèrent (`indexedDB.databases()`). F-003, premier lecteur, ajoutera l'accesseur avec son appelant. F-013 ajoutera son registre à cette base.

**États et délai.** `relecture` à l'ouverture ; `active` quand la relecture a abouti ; `coupee` sur tout échec ou à l'échéance ; `fermee` après `fermer()`. `coupee` et `fermee` sont définitifs jusqu'au rechargement. Une échéance de 10 secondes (`DELAI_RELECTURE_MS`, dans le module) part à l'appel d'`ouvrirPersistance` ou d'`ouvrirEspaceLocal` et couvre tout ce qui précède `active` (base de l'appareil, sonde, relecture). Passer à `coupee` ou `fermee` détruit l'instance de la bibliothèque : elle se désabonne du document et, son drapeau de destruction levé, n'applique ni n'écrit plus rien, même si l'ouverture aboutit plus tard (essai E9). Le document reste utilisable en mémoire.

**Échecs, sans rejet non géré.** Quatre parades, chacune essayée (essais E5 à E9, B3, B4) :

1. `indexedDB` absent : testé par `typeof` avant toute chose ; la bibliothèque n'est jamais construite ; l'état est `coupee` dès le retour de l'appel.
2. Ouverture refusée (exception ou erreur de la demande) : le module sonde d'abord la base par sa propre demande `indexedDB.open(nom)`, dont il traite les erreurs ; si la base n'existe pas, il annule la transaction de création, ce qui la laisse absente, et tient l'ouverture pour possible. La bibliothèque n'est construite qu'après une sonde réussie.
3. Lecture ou écriture en échec après l'ouverture : le module pose sur la connexion de la bibliothèque un écouteur `error` en phase de capture, qui arrête la propagation et passe à `coupee`. La demande fautive ne reçoit pas l'événement, la promesse de la bibliothèque ne se règle donc jamais et aucun rejet n'est émis. Des écouteurs `abort` (transaction annulée, quota) et `close` (fermeture anormale) passent aussi à `coupee`.
4. Ni succès ni échec : l'échéance.

**Validation de chaque écriture.** La bibliothèque laisse le navigateur valider seul la transaction de chaque mise à jour, un aller-retour plus tard : un rechargement lancé entre-temps annule la transaction, et la dernière écriture est perdue (le producteur l'a relevé une fois sur quatre dans Chromium sur un titre validé puis rechargé aussitôt ; relevé du code, non rejoué par cette conception). Le module enveloppe donc la fonction d'écriture de la bibliothèque : la transaction qu'elle ouvre pendant cet appel synchrone, et elle seule, est validée par `commit()` dès que la demande d'ajout est posée. La relecture et le compactage gardent la validation automatique, dont leurs étapes successives ont besoin. Un navigateur sans `commit()` garde le comportement de la bibliothèque ; un `commit()` qui lève parce que le moteur a déjà terminé la transaction est absorbé, l'annulation arrivant par l'écouteur `abort`. Le format stocké ne change pas : mêmes magasins, mêmes enregistrements (F-002-AC20, tests de `persistance-validation.test.ts`).

**Champs internes de la bibliothèque.** Le module touche deux champs préfixés de `y-indexeddb`, tous deux déclarés dans ses types : `_db` (la promesse de connexion, pour poser les écouteurs de la parade 3 et pour envelopper l'écriture) et `_storeUpdate` (la fonction d'écriture, remplacée par son enveloppe). La version de la bibliothèque est figée (`9.0.12`, sans intervalle) ; les tests de lecture en échec et de validation des écritures cassent si l'un de ces champs change de nom ou de rôle. Toute montée de version de `y-indexeddb` repasse par ces tests.

**Version non prise en charge.** La session appelle `fermer()` de la persistance dès que la façade refuse la version : plus aucune mise à jour n'est écrite (F-002-AC17).

## Conséquences

- Remplacer `y-indexeddb` ne touche qu'`indexeddb.ts` ; le format stocké (magasins `updates` et `custom`, mises à jour V1) resterait à relire ou à migrer.
- Chaque ouverture coûte une demande de plus (la sonde). F-002-AC16 nomme les trois cas couverts sans rejet non géré (`indexedDB` absent, ouverture refusée, lecture ou écriture en échec après l'ouverture : parades 1 à 3) et écrit comme limite acceptée la fenêtre que la sonde laisse : une ouverture qui réussit pour la sonde puis échoue aussitôt après pour la bibliothèque donnerait un rejet émis par celle-ci. L'échéance rend quand même la main, comme le critère l'exige ; aucun test ne couvre ce cas.
- La bibliothèque écrit un enregistrement vide (deux octets `0, 0`) à chaque ouverture, avant de relire. F-002-AC17 l'admet et exige ce qui est tenu : après l'ouverture d'un document de version non prise en charge, la persistance est fermée dès le refus, aucun enregistrement non vide n'est ajouté, et l'état relu de la base est identique octet pour octet à l'état relu avant (essai E10). Ne pas écrire cet enregistrement demanderait de relire la base sans la bibliothèque.
- `active` suit l'évènement `synced` de la bibliothèque, qui ne prouve pas l'écriture : elle l'émet après avoir appliqué ce qu'elle a relu, sans attendre que l'ajout de l'état complet du document soit validé, donc même quand cet ajout échoue (veille du 2026-10-09, exécutée ; code de la bibliothèque relu). Effet borné dans F-002 : le document est vide à l'ouverture, l'état complet est l'enregistrement de deux octets, et les écouteurs `error` et `abort` de la parade 3 ramènent ensuite à `coupee`. Que ces évènements soient émis par un vrai navigateur dans ce cas n'est pas vérifié, et aucun test de F-002 ne fait échouer cette écriture. La borne tombe dès qu'une persistance s'ouvre sur un document non vide (reprise après coupure) : F-030-AC26 remplace `synced` par une preuve d'écriture comme condition de l'état actif, et sa conception amendera « États et délai ».
- Après l'échéance, si l'ouverture aboutit tard, la bibliothèque termine la lecture qu'elle avait lancée. F-002-AC24 l'admet et porte sur les effets : rien de ce qu'elle lit n'est appliqué au document ni affiché, et rien n'est écrit (essai E9).
- L'enveloppe d'écriture dépend de deux champs internes d'une bibliothèque dont la maintenance est incertaine (spec H2) : c'est le prix du rechargement immédiat sans perte. Remplacer la bibliothèque (option B) la ferait disparaître.
- Un identifiant de page ou de table qui n'est pas un UUID canonique ne peut pas avoir de base : F-003 et F-018 créent leurs identifiants par `crypto.randomUUID`, comme F-001 le fait pour les pages. Un identifiant de page de forme inattendue, inscrit dans une arborescence reçue (cas laissé à F-012 par la spec), donnera à F-003 un refus à l'ouverture de sa base, à traiter par son écran.
- F-003 et F-018 ouvrent leurs documents par `ouvrirPersistance` avec une désignation `page` ou `table` : même délai, mêmes échecs. F-007 ajoutera l'effacement d'une base au module ; la fermeture d'une connexion par un autre onglet (F-007-AC33) est déjà vue par l'écouteur `close`, le cas `versionchange` reste à sa charge.
- La base `notionlike:appareil` s'ajoute à ce qu'énumère un test qui liste les bases de l'appareil (F-014).

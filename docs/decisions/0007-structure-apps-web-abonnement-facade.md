# ADR-0007 — Structure d'`apps/web` et abonnement de React à la façade du document d'espace

Statut : accepté
Date : 2026-10-08

## Contexte et problème

F-002 crée la première application du workspace, `apps/web` (`@notionlike/web`) : une coquille (barre latérale, zone principale) qui lit et écrit le document d'espace par `@notionlike/document`, l'enregistre sur l'appareil (ADR-0008) et désigne la page sélectionnée par le fragment de l'adresse. Sa structure sera reprise par toutes les features d'interface (F-003, F-004, F-007, F-010, F-013, F-014, F-018) : elle se défait mal.

Faits du code de F-001 qui contraignent le choix (`packages/document/src/document-espace.ts`) :

- `ouvrirDocumentEspace(doc)` reçoit un `Y.Doc` construit par l'appelant ; elle ne lève pas sur une version non prise en charge, `lire()` et les écritures lèvent alors `version-non-prise-en-charge` ;
- `lire()` rend la même référence tant qu'aucune transaction n'a changé la lecture, et elle est en retard à l'intérieur d'une transaction englobante de l'appelant ;
- `abonner(rappel)` notifie en fin de transaction ; à la fin de F-001 la façade n'a pas de fermeture et un rappel qui lève prive les suivants (dette D-006). F-002 lève cette dette avant d'appeler la façade : fermeture et récepteur d'exception, décidés par l'amendement F-002 de l'ADR-0003 ;
- une clé `version` absente vaut la version 1 : un `Y.Doc` vierge est un document d'espace valide et vide ;
- une entrée incomplète est un état passager normal de la synchronisation : une page peut disparaître de la lecture puis y revenir ;
- le paquet est du TypeScript source sans build (`exports` vers `./src/index.ts`).

Questions à trancher : découpage en modules, état de l'application, mode d'abonnement de React, cycle de vie du `Y.Doc` et de la façade, routage, forme des identifiants lus dans l'adresse, accessibilité de l'arbre au clavier.

## Options étudiées

Abonnement de React à la façade :

- **A. `useSyncExternalStore` sur un magasin hors de React** (retenue). Un objet « session d'espace », créé avant le premier rendu, tient le `Y.Doc`, la persistance et la façade, et expose `abonner` et `lireEtat`. Essayé (essais R1 à R5 et F du plan) : rendu sous `StrictMode`, mise à jour reçue par `Y.applyUpdate` répercutée sans rechargement, aucune boucle de rendu, une seule façade après cinq montages et démontages.
- B. `useEffect` + `useState` dans un composant qui ouvre la persistance et recopie `lire()`. Écartée : sous `StrictMode` l'effet s'exécute deux fois (deux ouvertures de la base, deux façades à fermer), et une notification survenue entre le rendu et l'effet est perdue.
- C. Bibliothèque d'état (Zustand, Redux, Jotai). Écartée : une dépendance directe de plus pour un état qui se réduit à une lecture externe et à trois valeurs d'écran.

Routage : fragment de l'adresse sans bibliothèque (spec H4, retenue) ; `react-router` ou `wouter` écartées par la spec.

Contrôle de la forme d'un identifiant (F-002-AC27 pour l'adresse, F-002-AC28 pour le nom d'une base) :

- **A. Une fonction, dans un module pur que la navigation et la persistance importent** (retenue) : une seule définition de « UUID canonique » dans `apps/web`.
- B. Deux copies de l'expression, une par module, tenues égales par un test. Écartée : deux définitions d'une règle de sécurité, et un test de plus pour dire qu'elles n'en font qu'une.
- C. Exporter la fonction de `@notionlike/document`. Écartée : la spec interdit tout autre changement de son interface.

Arbre de la barre latérale :

- **A. Liste plate de rangées et commandes natives** (retenue) : `nav` nommée, une seule liste `ul`, un `li` par page visible, la profondeur portée par `aria-level` et par le retrait ; un lien par page, des boutons pour les actions, un bouton de dépliage à `aria-expanded`.
- B. Listes imbriquées (`ul` dans `li`). Écartée après écriture du code : la profondeur d'une arborescence reçue n'est pas bornée, et un rendu imbriqué fait un composant récursif par niveau. Le producteur a relevé un débordement de pile dans Chromium vers 1 000 niveaux (relevé du code, non rejoué par cette conception) ; la liste plate et des parcours itératifs suppriment la récursion.
- C. Motif ARIA `tree` (`role="tree"`, `treeitem`, tabulation itinérante, flèches). Écartée pour F-002 : le motif s'accommode mal de plusieurs commandes par rangée, demande une gestion du focus à écrire et à tester, et la spec n'exige que tabulation, Entrée et Échap (F-002-AC10 ; les raccourcis sont à F-024).

## Décision

**Modules.** `apps/web/src` a cinq dossiers et un point d'entrée ; les dépendances ne vont que dans un sens.

| Module                  | Rôle                                                                                           | Peut importer                                                                                           |
| ----------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `src/identifiants/`     | forme d'un identifiant : `estUuidCanonique` (pur, une fonction)                                | lui-même                                                                                                |
| `src/persistance/`      | enregistrement local (ADR-0008) ; interface dans `index.ts`                                    | lui-même, `identifiants/`, `yjs` (types), `y-indexeddb` (un seul fichier)                               |
| `src/espace/`           | session d'espace : garde de contexte sécurisé, `Y.Doc`, persistance, façade, état lu par React | lui-même, `persistance/index.ts`, `@notionlike/document`, `yjs`                                         |
| `src/navigation/`       | fragment de l'adresse : forme des routes (pur), lecture, écriture, abonnement à `hashchange`   | lui-même, `identifiants/`                                                                               |
| `src/interface/`        | composants React, textes français, état d'écran                                                | lui-même, `espace/`, `navigation/`, `identifiants/`, `@notionlike/document` (types et erreurs), `react` |
| `src/main.tsx` (entrée) | démarre la session puis monte `<Application session={…} />` dans `#racine`, sous `StrictMode`  | `interface/`, `espace/`, `react`, `react-dom`, la feuille de style                                      |

Ni `interface/` ni `navigation/` n'importent `yjs` ; rien hors de `persistance/` n'importe `y-indexeddb` ; rien hors de `espace/` n'importe `persistance/`. Ces sens sont tenus par huit contrats en liste blanche ou en confinement (plan, « Règles de dépendances »).

**Forme d'un identifiant.** `estUuidCanonique(valeur)` est vraie pour une chaîne de 36 caractères exactement, de la forme `8-4-4-4-12` en hexadécimal minuscule, celle que produit `crypto.randomUUID` ; la longueur est comparée avant toute analyse, et la version de l'UUID n'est pas contrôlée. C'est la seule définition de cette forme dans `apps/web` : la navigation l'applique à ce qu'elle lit dans l'adresse (F-002-AC27), la persistance à tout identifiant qui entre dans un nom de base (F-002-AC28, ADR-0008).

**Session d'espace, seule abonnée de la façade.** `demarrerSessionEspace()` est l'unique point de démarrage. Dans l'ordre :

1. elle teste `typeof crypto.randomUUID === "function"` ; sinon elle rend une session figée dans la phase `contexte-non-securise`, sans créer de `Y.Doc`, d'identifiant ni de persistance (F-002-AC26) ;
2. elle construit `new Y.Doc()` (le `Y.Doc` de l'instance de `yjs` d'`apps/web`), tire un identifiant candidat par `crypto.randomUUID()` et ouvre la persistance de l'espace local (ADR-0008) ;
3. tant que la persistance est en `relecture`, la phase est `chargement` et la façade n'existe pas : aucune action de modification n'est possible, par construction (F-002-AC3) ;
4. quand la relecture a abouti, échoué ou dépassé le délai, elle appelle `ouvrirDocumentEspace(doc, recepteur)`, s'abonne une fois à la façade, et lit.

`creerDocumentEspace()` n'est pas appelée par l'application : elle écrirait la version dans un document neuf avant la relecture, donc dans la base (la bibliothèque enregistre l'état du document avant d'appliquer ce qui est stocké), au risque d'écrire dans un document de version non prise en charge. Un `Y.Doc` vierge suffit, la version absente valant 1.

L'état rendu par `lireEtat()` est un objet immuable, remplacé seulement quand quelque chose change :

```ts
type EtatSession =
  | { readonly phase: "contexte-non-securise" }
  | { readonly phase: "chargement" }
  | { readonly phase: "version-non-prise-en-charge" }
  | {
      readonly phase: "pret";
      readonly arborescence: Arborescence; // la référence stable de lire()
      readonly enregistre: boolean; // faux : session en mémoire, avertissement affiché
      readonly operations: Pick<
        DocumentEspace,
        "creerPage" | "renommerPage" | "mettreALaCorbeille"
      >;
    };

interface SessionEspace {
  lireEtat(): EtatSession;
  abonner(rappel: () => void): () => void;
  readonly doc: Y.Doc | undefined; // absent hors contexte sécurisé ; reçoit les mises à jour (F-013, tests)
  fermer(): void;
}
```

- `lire()` est appelée dans un `try` : `version-non-prise-en-charge` fait passer à la phase du même nom, ferme la persistance (F-002-AC17) et ferme la façade, à l'ouverture comme après une mise à jour reçue. Cette phase est définitive jusqu'au rechargement : la façade n'a plus de lecteur.
- La façade n'a pas d'autre abonné dans `apps/web` ; les composants ne reçoivent que les trois opérations, ni `abonner`, ni `deplacerPage` (hors périmètre de F-002), ni `fermer`, ni le `Y.Doc` par l'état.
- `apps/web/src` n'ouvre aucune transaction Yjs (`transact` est interdit par ESLint) : `lire()` n'est donc jamais en retard sur une écriture de l'application.

**Exception d'un abonné (F-002-AC29).** La session applique à ses propres abonnés la règle que l'amendement F-002 de l'ADR-0003 donne à la façade : quand l'état change, elle prévient tous ses abonnés, même si l'un lève, puis relance ce qui a été levé (l'exception seule, ou une `AggregateError` s'il y en a plusieurs). Sur le chemin ordinaire, celui d'un changement du document, cet appel vient de la façade : c'est elle qui rattrape l'exception et la remet au récepteur que la session lui a donné à l'ouverture. Sur le chemin qui ne passe pas par la façade (changement d'état de la persistance), la session la remet elle-même au même récepteur. Ce récepteur est une fonction de la session : il écrit l'exception sur la console d'erreur du navigateur (`console.error`, phrase fixe en français suivie de l'exception) et ne fait rien d'autre. Aucune exception d'abonné ne remonte donc par une opération, par `Y.applyUpdate` ni par un rappel d'IndexedDB, et l'application reste utilisable (essai F du plan).

**Fermeture (F-002-AC30).** `SessionEspace.fermer()` ferme la façade si elle est ouverte, ferme la persistance, oublie ses abonnés ; une seconde fermeture est sans effet. La session naît hors de React : montages et démontages répétés de `<Application>`, `StrictMode` compris, n'ouvrent ni ne ferment aucune façade, ils ne font qu'abonner et désabonner un rendu (essai F : un écouteur après cinq montages, zéro après `fermer()`). Appelants de `fermer()` dans F-002 : le chemin `version-non-prise-en-charge` pour la façade et la persistance ; les tests, qui ferment chaque session qu'ils démarrent (F-002-AC31). L'entrée `main.tsx` ne l'appelle pas : la session y vit autant que l'onglet, et fermer sur `pagehide` casserait une page rendue par le cache de navigation du navigateur. F-014 (changement d'espace) sera le premier écran à fermer une session.

**React.** `Application` lit la session par `useSyncExternalStore(session.abonner, session.lireEtat)` et le fragment par `useSyncExternalStore(abonnerAuFragment, lireFragment)` (une chaîne : référence stable). Pas de bibliothèque d'état. L'état d'écran (pages repliées, saisie de titre en cours, message d'erreur) vit dans `Application` par `useState`. Tout ce qui s'affiche de l'arbre est dérivé de `arborescence` au rendu : aucun effet ne « répare » l'état quand l'arbre change. Une page sélectionnée qui disparaît de la lecture affiche « Page introuvable » et revient d'elle-même si la page revient ; seule l'action locale de mise à la corbeille ramène à l'accueil.

**Routage.** Trois formes de route : la page (`#/page/<idPage>`), l'accueil (tout fragment qui ne commence pas par `#/page/`, écrit `#/`), et la page introuvable (un fragment qui commence par `#/page/` et dont le reste n'est pas un UUID canonique). `lireRoute(fragment)` prend le reste du fragment tel quel, sans le décoder, et ne lui applique que `estUuidCanonique` : s'il échoue, la route rendue est `page-introuvable` et ne porte pas la chaîne. La chaîne refusée n'est donc ni décodée, ni cherchée dans l'arborescence, ni passée à une opération du document ou à la persistance, ni affichée (F-002-AC27). `fragmentDe` écrit l'identifiant tel quel : un UUID canonique n'a rien à encoder. Écriture par `location.hash`, lecture sur `hashchange` ; `pushState` et `replaceState` sont interdits par ESLint. La sélection n'est pas un état : elle se déduit de la route et de l'arborescence.

**Barre latérale au clavier.** `nav` de nom « Pages » ; un bouton « Nouvelle page » ; une liste plate, un élément par page visible, de niveau `aria-level` ; chaque élément porte : un bouton « Replier » ou « Déplier » (`aria-expanded`, présent seulement si la page a des sous-pages), un lien vers `#/page/<id>` dont le texte est le titre ou « Sans titre » (`aria-current="page"` sur la page courante), puis trois boutons dont le nom accessible cite le titre : « Renommer », « Ajouter une sous-page », « Mettre à la corbeille ». Toutes les commandes sont des éléments natifs dans l'ordre de tabulation. La saisie du titre est un champ nommé « Titre de la page » : Entrée et sortie du champ valident, Échap annule. Le focus va au champ à son ouverture, revient au lien de la page à sa fermeture au clavier, et au bouton « Nouvelle page » quand la rangée qui le portait disparaît. Messages : `role="status"` pour le chargement, `role="alert"` pour l'avertissement de persistance, les erreurs de saisie et d'opération, l'écran de version et l'écran de contexte non sécurisé.

**Ce qui est stable, et ce qui ne l'est pas.** Stable pour les features suivantes : les modules et leurs sens, la session, les routes, les fonctions d'action de la barre latérale (créer, ouvrir la saisie, valider, annuler, mettre à la corbeille, basculer le repli), les textes et les noms accessibles. Non figé : l'élément qui porte chaque commande d'une rangée. F-004 (brouillon, F-004-AC25 à AC27) remplacera les trois boutons de rangée par deux boutons et un menu, en appelant les mêmes fonctions d'action ; les composants de rangée reçoivent donc ces fonctions en propriété et ne portent aucune logique d'opération, et les tests atteignent une action de rangée par une aide unique (plan, « Ce que F-004 remplacera »).

**Affichage sûr.** Les titres passent par les enfants texte de JSX et par `document.title` ; `dangerouslySetInnerHTML`, `innerHTML`, `outerHTML` et `insertAdjacentHTML` sont interdits par ESLint dans `apps/web/src` (F-002-AC18).

## Conséquences

- La session se crée hors de React : `StrictMode` ne double aucune ouverture, et les tests rendent `<Application session={demarrerSessionEspace()} />` exactement comme l'entrée.
- F-003 ajoute son éditeur dans un module d'édition et une session de page à côté ; elle aura besoin de l'identifiant de l'espace, que l'état `pret` ne porte pas dans F-002 (aucun écran ne s'en sert) : F-003 l'y ajoutera, et le contrat `web-src-liste-blanche` sera étendu par le dev. F-014 remplacera l'ouverture de l'espace local par une ouverture par identifiant d'espace : la session est le seul appelant à changer.
- F-004 change l'habillage et le chemin vers les actions de rangée ; les rôles de ces commandes changeront avec elle (bouton vers entrée de menu), pas leurs noms ni leurs effets. Le test de F-002-AC10, qui fixe les commandes natives d'une rangée, sera réécrit par F-004 ; les autres tests passent par l'aide.
- La liste plate ne donne pas la navigation aux flèches d'un arbre ARIA ; F-024 pourra l'ajouter sans changer les rôles des commandes.
- La limite de 200 caractères n'est pas exportée par `@notionlike/document` : `interface/` en garde une constante pour le message de F-002-AC14, tenue par un test de couture (200 accepté, 201 refusé par la façade).
- L'exception d'un abonné n'apparaît que sur la console d'erreur : aucun écran ne la montre. C'est voulu pour F-002, où le seul abonné de la session est le rendu de React.
- L'interdiction de `fetch`, `WebSocket`, `localStorage` et consorts dans `apps/web/src` devra être levée module par module par les features réseau (F-010, F-013) et de réglages (F-018), dans `eslint.config.mjs`, par le dev.

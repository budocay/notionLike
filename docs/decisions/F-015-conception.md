# F-015 — Conception (mode rapide) : présence et curseurs des autres membres

Date : 2026-10-22. Spec : `specs/F-015.md`, revalidée par le dev (`ae18490`). Mode rapide : pas de gate de conception avant le code. Décisions difficiles à défaire : ADR-0020 (proposé). Veille : `MEMORY/VEILLE.md`, les trois sections du 2026-10-22 (Hocuspocus 4.7.0 et 4.7.1, `y-protocols` 1.0.7, extension de curseurs 3.31.4 et greffon de `@tiptap/y-tiptap` 3.0.9).

Le code démarre après la fusion de F-018 puis de F-032 dans `main`, puis celle de `main` dans `F-015` (bloc 0). Les noms de la synchronisation cités ici sont ceux de F-018 (`#affiche`, `afficherPage`, `afficherTable`, `afficherAucun`, `PageSynchronisee.idDocument`). `ARCHITECTURE.md` sera aligné après le code.

## Approche

- **Serveur** : un contrôle d'identité de présence dans le crochet `beforeHandleAwareness` de la bibliothèque. Il s'appuie sur une table propre au serveur (identifiant de client → compte et ouverture), vidée et appliquée à la fermeture de chaque ouverture (`onDisconnect`). Le relais de F-012 garde ses plafonds en amont, sans changement.
- **Contrat** : `packages/contrats/src/presence.ts`, schéma strict `{ user: { id }, cursor }`, borné à 1 Kio.
- **Client** : deux objets de présence de `y-protocols` par page affichée.
  - L'objet _publié_ vit dans `synchronisation/` : sur la réplique, un par ouverture, horloge reportée, une republication par ouverture acquise.
  - L'objet _filtré_ vit dans le nouveau module `presence/` : sur le document lié à l'éditeur, il ne tient que des copies validées des états reçus. C'est le seul que reçoit l'extension de curseurs, montée dans `edition/` avec un rendu du projet.
  - La liste des présents est dans `interface/`.
- Aucune minuterie de renouvellement ni d'extinction n'est écrite (F-015-AC24) : ces durées sont celles de `y-protocols`, côté serveur comme côté client. Les seules minuteries du projet sont le regroupement des publications, celui des annonces, le délai et le débit de la requête des membres, et la restriction de F-015-AC21. Toutes passent par une horloge injectée.

## Serveur : contrôle d'identité de présence (agent-backend)

Nouveau `apps/server/src/synchro-presence.ts`, `creerControleDePresence({ journal })`, qui rend trois fonctions sans exception :

- `filtrer({ documentName, context, states, removedClients })`, appelée par le crochet `beforeHandleAwareness` (payload 4.7.1). L'ouverture est désignée par l'objet `context` de la bibliothèque (`connection.context`), le même qu'elle remet à `onDisconnect` (lu dans `ClientConnection.ts` : `hookPayload.context`). Le compte est `context.connexion.idCompte`. Règles, état par état, dans cet ordre :
  1. `{}` (aucune clé) : passe, sans attribution, sans ligne ni décompte (F-015-AC34), sauf sous un identifiant attribué à un autre compte : écarté, cause `autre-compte`.
  2. Non conforme à `schemaEtatDePresence` : écarté, cause `non-conforme`.
  3. `user.id` différent du compte de la connexion : écarté, cause `identite`.
  4. Identifiant attribué à un autre compte : écarté, cause `autre-compte`.
  5. Identifiant attribué au même compte : passe ; l'entrée est rattachée à l'ouverture courante (reconnexion, F-015-AC17).
  6. Identifiant inconnu : inscrit `{ idCompte, context }`, sauf si le compte tient déjà `ETATS_DE_PRESENCE_PAR_COMPTE` entrées sur ce document : écarté, cause `plafond`.
  - Retraits (`removedClients`) : un identifiant attribué à un autre compte est retiré de l'ensemble (cause `autre-compte`). Un retrait par le même compte, ou d'un identifiant inconnu, passe. L'attribution reste jusqu'à la fermeture de l'ouverture, pour que personne ne reprenne l'identifiant dans l'intervalle.
  - `context` absent (écriture interne, inexistante dans `apps/server`) : `states` et `removedClients` vidés, sans ligne (défaut sûr).
  - Toute exception inattendue : `states` et `removedClients` vidés, ligne `presence-ecartee` cause `erreur-interne` avec la classe de l'erreur. Le crochet ne lève jamais, car une exception fermerait l'ouverture de l'émetteur (H4 b).
  - Seuls l'identifiant de client, `user.id` et la forme de l'état sont lus, jamais une position résolue (F-015-AC18). Aucun objet d'état n'est modifié : des entrées sont seulement retirées des deux collections.
- `surFermeture({ documentName, document, context })`, appelée par `onDisconnect`. Elle retire de la table les entrées de ce `context`, puis appelle `removeAwarenessStates(document.awareness, ids, null)` pour celles dont la bibliothèque tient encore un état. Ce retrait est diffusé aux autres ouvertures (`Document.handleAwarenessUpdate`). Elle couvre les identifiants revenus après une reconnexion (F-015-AC23). La table du document est supprimée quand elle est vide.
- La table : `Map<nomDuDocument, Map<idClient, { idCompte, context }>>`, en mémoire du processus, jamais stockée.

`synchronisation.ts` pose les deux crochets `beforeHandleAwareness` et `onDisconnect`, qui délèguent au contrôle. `journal.ts` gagne le type `presence-ecartee` (constante du contrat), avec les champs déjà fermés `idCompte`, `document` et `motif` (la cause) : aucun octet d'état. Aucune règle de dépendances ne change côté serveur (`y-protocols` y est déjà admis).

Tests serveur (Node, fabrique d'essai et client du protocole de F-012 H11) :

- `aides-synchro.ts` gagne l'écriture brute d'un retrait (`removedClients`, état nul à l'horloge courante) et d'une demande de présence (`QueryAwareness`, type 3). La réponse à cette demande donne « l'état de présence du document sur le serveur » (F-015-AC16, AC34) sans accès au code de production.
- Pour F-015-AC2 (« lire, côté serveur, les états reçus »), un paramètre d'essai facultatif `surPresenceRecue` de `DependancesDeSynchro`, passé par la fabrique comme `defaillance`, appelé dans le crochet avec une copie des états avant filtrage.
- Le test de couture F-015-AC18 énumère les points où une présence est lue, appliquée ou relayée : relais (débit, 16 Kio, nom ouvert), crochet, réponse à `QueryAwareness`, `onDisconnect`.

## Contrat : `packages/contrats/src/presence.ts` (agent-backend)

- `CHAMPS_DE_PRESENCE = ["user", "cursor"] as const` ; `OCTETS_MAX_D_UN_ETAT_DE_PRESENCE = 1024` ; `ETATS_DE_PRESENCE_PAR_COMPTE = LIMITES_SYNCHRO.connexionsParCompte` (20) ; `EVENEMENT_PRESENCE_ECARTEE = "presence-ecartee"`.
- `schemaUtilisateurDePresence = z.strictObject({ id: schemaCompte.shape.id })`. Il sert aussi à l'affichage pour garder dans la liste une personne dont le curseur n'est pas conforme (F-015-AC12).
- Position relative : `z.strictObject({ type?, tname?, item?, assoc? })`, avec :
  - `type` et `item` : `{ client, clock }`, entiers (`client` de 0 à 2^32 − 1, `clock` de 0 à `Number.MAX_SAFE_INTEGER`) ;
  - `tname` : chaîne de 1 à 64 caractères ;
  - `assoc` : entier de −1 à 0 ;
  - au moins `item`, `type` ou `tname` (raffinement). Sans aucun des trois, `createAbsolutePositionFromRelativePosition` lève (« Unexpected case »), ce qui couvre `cursor: {}`, la tête sans ancre et les positions numériques de la veille.
  - Les valeurs réelles d'`assoc` émises par `@tiptap/y-tiptap` 3.0.9 (−1 et 0 lus dans la liaison) sont reconstatées par le test de F-015-AC2 : il échoue dès le premier état réel hors borne.
- `schemaEtatDePresence = z.strictObject({ user, cursor: z.strictObject({ anchor, head }).nullable().optional() })`, raffiné par la taille UTF-8 de `JSON.stringify(etat)`, au plus 1 024 (`TextEncoder`, global admis dans le paquet). L'état le plus lourd que le client émet pèse moins de 500 octets.
- Exports ajoutés à `index.ts`, par ajout seul (F-012-AC27) ; aucune dépendance vers Yjs ni Hocuspocus (F-008-AC23).

## Client : synchronisation, canal de présence (agent-frontend)

- Nouveau `synchronisation/presence.ts`, classe `PresenceDuDocument`, tenue par `PageSynchronisee` (jamais par `TableSynchronisee`, par le document d'espace ni par la passe de fond) :
  - `creerObjet(replique)` : un `Awareness` neuf par ouverture ; son horloge est portée à la dernière retenue (`meta.set(clientID, { clock, lastUpdated })`, `lastUpdated` gardé) avant de le remettre au fournisseur.
  - `retenirLHorloge(objet)` : appelé après `fermer()`, donc après la destruction du fournisseur, qui incrémente l'horloge.
  - `publier(etat)` retient le dernier état et ne l'applique (`setLocalState`) que l'ouverture acquise ; `oublier()` efface l'état retenu, sans rien publier.
  - `surAcquise()` republie une fois l'état retenu (F-015-AC35) ; `surPerdue()` vide les états reçus et prévient les observateurs (F-015-AC25).
  - `quitter()` publie un curseur nul (F-015-AC22).
  - `restreindre(jusqua)` : curseurs nuls seulement (F-015-AC21).
- `ouverture.ts` : option `presence?: PresenceDuDocument`. Le fournisseur reçoit `awareness: presence?.creerObjet(doc) ?? null`. Le commentaire « fournisseur 4.7.0 » de `providerMap` devient 4.7.1 (bloc 1).
- `document-suivi.ts` : option `presence` transmise à `ouvrir`. Il appelle `surAcquise` à l'issue `acquise` et `surPerdue` à `defaire`, à une fermeture par le serveur ou à un refus, puis `retenirLHorloge` après `fermer`. C'est le seul endroit qui voit chaque ouverture naître et mourir : une seule republication par ouverture acquise.
- `page-affichee.ts` : `PageSynchronisee` crée sa `PresenceDuDocument` et l'expose.
- `synchronisation.ts` :
  - un membre de plus, `presence(doc: Y.Doc): CanalDePresence`, qui rend un canal lié au document que l'éditeur lie. Le canal est disponible quand `#affiche` est une `PageSynchronisee` de document lié `doc` et que son ouverture est acquise ; sinon il est indisponible, sans état reçu, et l'état publié y est retenu. Il est donc indifférent à l'ordre des effets de l'interface.
  - `#afficher` appelle `quitter()` sur la page quittée avant `#quitter`.
  - Après une fermeture `trop-de-requetes` (conduite `ralentir`), la première ouverture acquise ouvre une fenêtre de 60 secondes de curseurs nuls (horloge injectée).
- `CanalDePresence` (exporté en type par `index.ts`) :
  - `estDisponible()`, `idDuClientPublie()` ;
  - `publier(etat: EtatDePresence)`, `oublier()` ;
  - `etatsRecus(): ReadonlyMap<number, unknown>` (états bruts de l'objet publié, sauf le sien ; vide hors ouverture acquise) ;
  - `observer(rappel)`, `fermer()`.
  - Aucun type du fournisseur n'en sort (F-015-AC29).
- Hors de la page affichée, rien ne change : fournisseurs sans objet de présence (F-013-AC9), canal entre onglets sans présence (F-015-AC19).

## Client : module de présence `apps/web/src/presence/` (agent-frontend)

Sans React, sans DOM, sans minuterie propre (règles de l'annexe). Il reçoit une horloge, le canal (par sa forme `SourceDePresence`, sans importer la synchronisation), le compte et la lecture des membres.

- `couleur.ts` : `couleurDuCompte(id): 0..7`, fonction pure (somme des unités de code modulo 8, par exemple). Jamais lue dans un état ni dans une réponse (F-015-AC6).
- `annuaire.ts` : `creerAnnuaire({ lire, horloge })`, un par espace.
  - Liste des membres en mémoire seulement.
  - Requête à la première personne présente autre que soi, puis pour un identifiant inconnu, au plus une par tranche de 10 s.
  - Délai de 10 s ; un échec, une réponse non conforme ou un identifiant absent donnent « Membre de l'espace ».
  - Aucun rejet non géré (F-015-AC8).
- `objet-filtre.ts` : `ObjetDePresenceFiltre extends Awareness`, créé sur le document lié.
  - `remplacerLesEtatsDistants(copies)` met à jour `states` pour les distants : ni `meta`, donc pas d'extinction propre, ni l'identifiant local.
  - Il émet `change` et `update` avec l'origine `presence`.
  - Au plus 50 distants, les premiers reçus (F-015-AC13).
  - Les copies sont les sorties de `schemaEtatDePresence.parse`, objets neufs non gelés, que le greffon peut modifier sans toucher au canal (F-015-AC12).
  - Quand l'étiquette d'un compte change (nom résolu), les copies de ses clients sont retirées puis rajoutées au tour suivant (`horloge.programmer(…, 0)`), car le widget ProseMirror de clé identique ne se redessine pas.
- `publication.ts` :
  - écoute les `change` d'origine `local` de l'objet filtré, lit le seul `cursor` de l'état local et le valide ;
  - compose `{ user: { id }, cursor }` avec l'identifiant du compte `connecte` tenu en mémoire (F-015-AC1, AC23) ;
  - regroupe : intervalle `max(1000 / 5, fenetreDesMessagesMs / (messagesParFenetre / 10))` = 200 ms, envoi en tête et en queue, le dernier état au plus 200 ms après le dernier déplacement (F-015-AC20) ;
  - compte `inconnu` : un curseur nul, puis plus rien jusqu'au retour à `connecte` ; `deconnecte` : `oublier()` ;
  - onglet masqué : curseur nul jusqu'au retour visible (F-015-AC4) ;
  - un état identique au dernier publié n'est pas republié.
- `annonces.ts` : arrivées et départs regroupés, une annonce au plus par 5 s ; un déplacement n'est jamais annoncé (F-015-AC26).
- `presence-de-la-page.ts` : `creerPresenceDeLaPage({ doc, horloge, annuaire, compte })`.
  - Membres : `objet`, `etiquette(idCompte) → { nom, couleur }` (soi par `moi`), `brancher(source)`, `debrancher()`, `signalerVisibilite(visible)`, `lire()`, `abonner()`, `fermer()`.
  - `lire()` rend l'état de la liste : `sans-presence`, `en-attente` avant la première ouverture acquise de cet affichage, `indisponible` après une perte, ou `disponible` avec les entrées (soi d'abord, puis par nom ; une par compte ; au plus le quota de membres de `QUOTAS`) et l'annonce courante.
  - La liste lit `user.id` par `schemaUtilisateurDePresence` même quand le curseur n'est pas conforme (F-015-AC12).
- `index.ts` : l'interface du module.

## Client : édition (agent-frontend)

- `edition/curseurs.ts` : `curseursDesAutres({ objet, etiquette })` rend `CollaborationCaret.configure({ provider: { awareness: objet }, user: {}, render, selectionRender })`.
  - L'extension reçoit l'objet filtré, jamais le fournisseur (F-015-AC29). L'option `user` reste locale et n'est jamais publiée : seul le curseur est lu par le module de présence (premier moyen de F-015-AC2).
  - `render(user)` ne lit que `user.id` (chaîne, sinon un trait sans étiquette). Il crée par `document.createElement` un trait et une étiquette, avec les classes de la couleur, `aria-hidden="true"` et le nom en nœud de texte dans un `<bdi>` (F-015-AC7, AC15, AC26).
  - `selectionRender` rend `{ nodeName: "span", class }`. Aucun attribut `style` ni classe du rendu par défaut.
- `schema.ts` : `extensionsDeLEditeur(..., presence?)` ajoute l'extension quand `presence` est donnée.
- `EditeurDePage.tsx` : propriété `presence?: PresenceDeLEditeur`, stable pendant la vie de l'éditeur et transmise à `creerLEditeur`.
- `index.ts` : exporte le type `PresenceDeLEditeur` (`objet`, de type `Awareness`, import de type seul ; `etiquette`).
- `interface/composants/Edition.tsx` et `edition.classes.ts` : `CLASSES_DES_CURSEURS`, huit triplets (trait, étiquette, étendue), étiquette tronquée par une classe, sans pointeur ni sélection, transitions par `transform` et `opacity` sur des jetons de durée, aucune animation en boucle (F-015-AC28).
- `styles/jetons.css` (et la correspondance Tailwind d'`entree.css` s'il le faut) : huit couleurs de présence, chacune en deux jetons sémantiques (trait et fond d'étiquette ; fond de sélection opaque), contrôlés par le test de contraste de F-004-AC7 (F-015-AC27).

## Client : interface (agent-frontend)

- `interface/presence-de-la-page.ts` : `usePresenceDeLaPage({ synchro, idEspace, page, compte, lireLesMembres })`.
  - Annuaire par `idEspace` (`useMemo`, sans effet de bord).
  - Présence de la page créée dans un `useLayoutEffect` par document lié, fermée au nettoyage : l'`Awareness` démarre une minuterie dès sa construction et ne naît donc pas pendant un rendu.
  - Branchement du canal `synchro?.presence(doc)` dans un `useEffect`.
  - Écoute de `visibilitychange` ; horloge du navigateur.
  - L'éditeur n'est rendu qu'une fois l'objet filtré créé (l'effet de mise en page le crée avant l'affichage) : l'extension est présente dès la création de l'éditeur, qui n'est jamais recréé pour elle.
- `interface/PersonnesSurLaPage.tsx`, `interface/composants/Presence.tsx`, `presence.classes.ts`, `interface/messages-presence.ts` :
  - région nommée « Personnes sur cette page », description « Membres dont une session a cette page ouverte » (F-015-AC19) ;
  - entrées nom, initiales et couleur, « (vous) » ;
  - cinq entrées puis « +N », qui s'ouvre et se ferme au clavier (Échap rend le focus) ;
  - région `status` pour les annonces ;
  - « Présence indisponible hors connexion » (F-015-AC25) ;
  - liste masquée pour un espace `local` et avant la première ouverture acquise ;
  - aucun texte ne dit « écrit », « lit » ni « est là ».
- `ZonePrincipale.tsx` : sous l'en-tête, dans `CorpsDePage`, la liste puis l'éditeur, qui reçoit `presence.editeur`.
- `Application.tsx` : appelle le crochet avec la synchronisation, le compte (`compte.suivi`, `compte.espaces.listerMembres`) et l'espace ouvert, puis passe le résultat à `ZonePrincipale`.
- Si le test de la page de démonstration exige chaque composant de présentation, `Presence.tsx` y est montré (`demonstration/`).

## Montée Hocuspocus 4.7.1 et extension de curseurs

- Versions exactes, sans `^` :
  - `apps/server/package.json` : `@hocuspocus/server` 4.7.0 → 4.7.1 (dépendances) et `@hocuspocus/provider` 4.7.0 → 4.7.1 (dépendances de développement) ;
  - `apps/web/package.json` : `@hocuspocus/provider` 4.7.0 → 4.7.1 ;
  - `@hocuspocus/common` est résolu en 4.7.1 par le verrou.
  - Publiées le 2026-10-12 (au-dessus de `minimumReleaseAge`), MIT. `lib0` reste 0.2.119.
- Effets de 4.7.1 sur ce qui est livré :
  - l'entrée fantôme disparaît ;
  - un état nul est appliqué (le `destroy()` d'un fournisseur qui porte un objet de présence publie un départ, désormais vu) ;
  - `removedClients` apparaît dans le crochet ;
  - une connexion fermée pendant `onAuthenticate` n'est plus mise en place (PR #1188) ;
  - `disconnect()` et `destroy()` annulent une reconnexion programmée (PR #1183 ; `connexion.ts` appelle déjà `disconnect()`).
  - Aucun test de F-012 ni de F-013 ne doit changer au bloc 1. S'il en change un, on s'arrête et on le signale au dev, sans le modifier. On surveille D-028.
- `@tiptap/extension-collaboration-caret@3.31.4` (MIT, 2026-09-30, pairs `@tiptap/core`, `@tiptap/pm`, `@tiptap/y-tiptap` déjà déclarés), ajoutée à `apps/web/package.json` au bloc 6, avec son premier import. Ni `@tiptap/*` 3.32.0, ni `@tiptap/y-tiptap` 3.0.10.
- Constaté par la veille sur une copie : le verrou ne change que pour ces quatre paquets, la politique `minimumReleaseAge` passe, et une seule version de `yjs`, `y-protocols` et `lib0` reste résolue (F-015-AC31).
- Fichiers partagés modifiés (à signaler au dev) : les deux manifestes et `pnpm-lock.yaml`.

## Plan par blocs (un commit par bloc)

0. **Dev** : fusion de `main` (F-018 puis F-032 fusionnées) dans `F-015`, puis application des deux diffs de l'annexe (`git apply`, depuis la racine), commit `Agent: dev`. Aucune installation.
1. **agent-frontend** — montée Hocuspocus 4.7.1 : les deux manifestes, `pnpm-lock.yaml`, le commentaire de `ouverture.ts`. Aucun code. Preuves :
   - `pnpm install --frozen-lockfile` ;
   - `pnpm why -r yjs y-protocols lib0` (une version chacun) ;
   - `.agents/checks/controles.sh main` vert, dont la couture de `providerMap` (F-013-AC45) sur les types installés.
2. **agent-backend** — contrat : `packages/contrats/src/presence.ts`, `index.ts`, `test/presence.test.ts` (table d'états admis et refusés, borne de 1 Kio, liste fermée des champs, valeurs lues dans `LIMITES_SYNCHRO`), liste des exports du test de structure s'il y en a une. F-015-AC30.
3. **agent-backend** — serveur : `synchro-presence.ts`, crochets dans `synchronisation.ts`, `journal.ts`, paramètre d'essai `surPresenceRecue` et `fabrique.ts`, `aides-synchro.ts`, nouveau `test/synchro-presence.test.ts`, couture F-015-AC18, listes fermées du journal. F-015-AC16 à AC18, AC23 (côté serveur), AC34.
4. **agent-frontend** — synchronisation : `presence.ts`, `ouverture.ts`, `document-suivi.ts`, `page-affichee.ts`, `synchronisation.ts`, `index.ts`. Tests Node contre le serveur réel (`test/synchronisation/presence-*.test.ts`) : F-015-AC1, AC3 (le test de F-013-AC9 est remplacé comme la spec l'exige), AC21, AC22, AC23, AC24, AC25, AC35. Pour F-015-AC24, simuler `Date`, `setInterval` et `clearInterval` (pas `setTimeout`, dont vivent les WebSocket et PGlite) avant l'import dynamique de `yjs`, `y-protocols` et de la fabrique (H13).
5. **agent-frontend** — module de présence : `apps/web/src/presence/**`. Tests :
   - sous `test/presence/` (unitaires, horloge injectée) : F-015-AC6, AC8, AC9, AC12 (liste), AC13, AC20, AC26 (annonces) ;
   - sous `test/synchronisation/` (module et canal réels contre le serveur réel) : F-015-AC20 compté à la WebSocket mesurée, AC23 (changement de compte).
6. **agent-frontend** — édition et jetons : `apps/web/package.json` et verrou (extension de curseurs), `edition/curseurs.ts`, `schema.ts`, `EditeurDePage.tsx`, `index.ts`, `interface/composants/Edition.tsx`, `edition.classes.ts`, `styles/jetons.css`, et les tests de structure de l'édition (`structure-edition.test.ts`, `dependances-edition.test.ts`). Tests jsdom : F-015-AC4 (focus simulé, éditeur non modifiable), AC7, AC10, AC11, AC12 (extension réelle, états hostiles de la veille), AC14 (historique d'annulation), AC15, AC26, AC27, AC28.
7. **agent-frontend** — interface : `presence-de-la-page.ts`, `PersonnesSurLaPage.tsx`, `composants/Presence.tsx`, `presence.classes.ts`, `messages-presence.ts`, `ZonePrincipale.tsx`, `Application.tsx`, aides de la coquille. Tests jsdom : F-015-AC5, AC7, AC9, AC15 (liste), AC19, AC25, AC26 (clavier, Échap).
8. **agent-frontend** — preuves de bout en bout sous Vitest : éditeur, extension, module de présence et synchronisation réels contre le serveur réel, dans un fichier de `test/synchronisation/` qui porte `// @vitest-environment jsdom`.
   - F-015-AC2 : parcours ouverture, frappe, sélection, perte de focus, changement de page, lu par `surPresenceRecue`.
   - F-015-AC4 contre le serveur, AC14 (deux clients, instantané du serveur et base locale parcourus).
   - F-015-AC31 : couture qui énumère les appelants de `Synchronisation` et d'`EditeurDePage`, puis F-003-AC2, AC12, AC19, AC29, F-013-AC25, AC34 et AC36 éditeur relié.
   - Si Vitest refuse la directive dans ce projet, demander au dev un troisième projet (texte en annexe, conditionnel).
9. **agent-frontend** — `apps/web/e2e/presence.spec.ts` (F-015-AC33), lancé à la main par le dev avec la pile (D-003).

Puis : alignement d'`ARCHITECTURE.md` et addendum de l'ADR-0020 (agent-architecte-conception), dossier de revue, gates (`reviewer-frontend`, `reviewer-backend`, `reviewer-api`, sécurité, architecture, craft).

## Fichiers touchés

- `packages/contrats` : nouveaux `src/presence.ts`, `test/presence.test.ts` ; modifié `src/index.ts`.
- `apps/server` :
  - nouveaux `src/synchro-presence.ts`, `test/synchro-presence.test.ts` ;
  - modifiés `src/synchronisation.ts`, `src/journal.ts`, `test/fabrique.ts`, `test/aides-synchro.ts`, `test/synchro-coutures.test.ts` ou une couture nouvelle, les tests du journal qui tiennent la liste fermée des types ;
  - `package.json` (partagé).
- `apps/web/src` :
  - nouveaux `presence/**`, `synchronisation/presence.ts`, `edition/curseurs.ts`, `interface/presence-de-la-page.ts`, `interface/PersonnesSurLaPage.tsx`, `interface/composants/Presence.tsx`, `interface/composants/presence.classes.ts`, `interface/messages-presence.ts` ;
  - modifiés `synchronisation/{ouverture,document-suivi,page-affichee,synchronisation,index}.ts`, `edition/{schema.ts,EditeurDePage.tsx,index.ts}`, `interface/composants/{Edition.tsx,edition.classes.ts}`, `interface/{ZonePrincipale,Application}.tsx`, `styles/jetons.css` (et `styles/entree.css` s'il le faut).
- `apps/web/test` :
  - nouveaux `test/presence/**`, `test/synchronisation/presence-*.test.ts`, les tests jsdom de l'édition et de la liste ;
  - modifiés `test/synchronisation/adoption.test.ts` (F-013-AC9, F-015-AC3), `test/synchronisation/aides-synchro.ts`, `test/synchronisation/coutures-synchro.test.ts`, `test/structure.test.ts`, `test/structure-edition.test.ts`, `test/dependances-edition.test.ts`, `test/aides-jetons.ts`, `test/jetons.test.ts`, les aides de la coquille ;
  - `apps/web/e2e/presence.spec.ts`.
- Partagés : `apps/web/package.json`, `apps/server/package.json`, `pnpm-lock.yaml`. Protégés (dev) : `.dependency-cruiser.cjs`, `eslint.config.mjs`.

**Non touchés** :

- `packages/document/**`, `packages/db/**` (aucune migration) ;
- `apps/server/src/synchro-relais.ts`, `synchro-acces.ts`, `synchro-stockage.ts` ;
- `synchronisation/{connexion,canal,miroir,passe-de-fond,stockage,conduites,etat,fermetures,reprise,protocole,reseau,environnement}.ts`, `synchronisation/table-affichee.ts` (F-018) ;
- `page/**`, `espace/**`, `persistance/**`, `compte/**` (le client des membres est seulement appelé), `glisser/**`, `table/**`, `vues-de-table/**`, `navigation/**` ;
- `interface/synchronisation-ouverte.ts`, `interface/messages.ts` ;
- `vitest.config.*` (sauf repli de l'annexe), l'infra, Compose, `.env*`, la configuration.

## Ce qui est prouvé, et où

- **Vitest, Node, serveur réel et fournisseur réel** (F-015-AC32) : F-015-AC1, AC3, AC16, AC17, AC18, AC20 (débit compté à la WebSocket mesurée, horloge injectée pour le regroupement), AC21, AC22, AC23 (fermeture, reconnexion puis fermeture, déconnexion, changement de compte), AC24 (horloge simulée de `y-protocols`), AC25, AC34, AC35.
- **Vitest, jsdom et serveur réel** : F-015-AC2, AC4, AC14, AC31.
- **Vitest, jsdom, canal simulé** : F-015-AC5 à AC13, AC15, AC19, AC26, et AC27 et AC28 par les contrôles statiques de F-004.
  - Sous jsdom, les coordonnées valent zéro : la place d'un trait est prouvée par sa position dans le document (H13).
- **Navigateur seulement** (F-015-AC33, bout en bout lancé à la main, D-003) :
  - rendu réel des traits, étiquettes et étendues ;
  - durée de transition calculée nulle sous mouvement réduit ;
  - onglet réellement fermé ou rechargé (F-015-AC23), coupure du réseau, `pagehide` ;
  - focus réel d'un éditeur non modifiable (F-015-AC4, H6 non vérifié).
- **Non prouvés** : la coupure brutale sans trame de fermeture au-delà de l'extinction simulée ; le réveil d'un onglet suspendu qui éteint ses pairs (déduit par la veille, couvert par le filtre des retraits).
- **À surveiller** : le test de F-003-AC16 (texte lu de l'éditeur) ne doit pas compter le texte des étiquettes (`aria-hidden`, mais présent dans `textContent`).

## Recouvrements avec F-018 et F-032

Lus en lecture seule : `../notionLike-F-018/docs/decisions/F-018-conception.md` (branche à `f456afe`) et `../notionLike-F-032/docs/decisions/F-032-conception.md` (à `78ce6bc`).

- `synchronisation/synchronisation.ts` :
  - F-018 renomme `#page` en `#affiche`, ajoute `afficherTable`, `afficherAucun`, `typeDe` et `#afficher` ;
  - F-032 ajoute l'attente de l'acquittement et le retrait de l'appareil ;
  - F-015 ajoute `presence(doc)`, l'appel à `quitter()` dans `#afficher` et la restriction après `ralentir`. À écrire sur le code fusionné.
- `synchronisation/index.ts` : exports ajoutés par les trois features.
- `synchronisation/page-affichee.ts` : F-018 (`idPage` → `idDocument`) ; F-015 y ajoute la présence. `ouverture.ts` et `document-suivi.ts` ne sont touchés que par F-015.
- `interface/Application.tsx`, `interface/ZonePrincipale.tsx` :
  - F-018 : table ouverte, `lectureSeule` booléen ;
  - F-032 : propriété `espaces`, changement d'espace, accueil vide ;
  - F-015 : crochet de présence et liste dans `CorpsDePage`.
  - Le changement d'espace de F-032 doit fermer la présence de la page (objet filtré et canal) ; c'est le cas si elle est fermée avec l'éditeur et la synchronisation de l'espace, à vérifier par un test du bloc 7.
  - `interface/synchronisation-ouverte.ts`, touché par F-018 et F-032, n'est pas touché par F-015.
- Tests :
  - `test/structure.test.ts`, `test/synchronisation/coutures-synchro.test.ts`, `test/synchronisation/aides-synchro.ts` : les trois features ;
  - `test/structure-edition.test.ts` : F-018 et F-015 ;
  - aides de la coquille : F-018 et F-032 ;
  - `test/synchronisation/adoption.test.ts` : F-015, F-032 à confirmer.
- `packages/contrats` : F-018 modifie `src/synchro.ts` ; F-015 ajoute un fichier et des exports à `index.ts`, sans recouvrement de lignes.
- `.dependency-cruiser.cjs` : F-018 modifie la ligne de `web-src-liste-blanche` que F-015 étend. L'annexe est écrite contre la version de F-018 et ne s'applique pas sur le `main` d'aujourd'hui.
- `eslint.config.mjs` : F-018 modifie `FICHIERS_NOM_DE_BASE_WEB` ; F-015 ajoute un bloc distinct (son diff s'applique sur les deux versions). F-032 ne touche aucun fichier protégé.
- Numéros d'ADR : ADR-0019 est prise par F-018 ; F-032 n'en crée pas ; F-015 prend ADR-0020.
- `ARCHITECTURE.md` : aligné par chaque feature après son code, dans l'ordre des fusions.

## Retouches de spec à proposer au dev (spec non modifiée)

- **R-a (F-015-AC22, AC35, clarification)** : chaque affichage d'une page crée une réplique neuve (ADR-0014), donc un identifiant de client publié neuf, dont l'horloge part de zéro sans risque. Le report d'horloge ne porte que sur les réouvertures d'un même affichage (droits modifiés, reconnexion). Proposition : « sur le même document de présence » au lieu de « sur le même `Y.Doc` » dans F-015-AC22.
- **R-b (F-015-AC21)** : point de départ des 60 secondes. Proposition : « pendant les 60 secondes qui suivent la première ouverture acquise après la reprise » (retenu par cette conception).
- **R-c (F-015-AC5, AC25)** : texte de la liste hors ouverture acquise. Cette conception masque la liste pour un espace `local` et avant la première ouverture acquise d'un affichage, et affiche « Présence indisponible hors connexion » après une perte, compte déconnecté compris (où « hors connexion » est approximatif). À confirmer.
- **R-d (sécurité, F-015-AC18)** : « un état écarté donne une ligne de journal ». Un message de présence de 16 Kio peut porter environ 2 000 entrées, à 600 messages par 10 s : jusqu'à 120 000 lignes par seconde pour un seul membre. Proposition : une ligne par message et par cause, avec le nombre d'états écartés. La conception suit la spec actuelle, et l'appel du journal reçoit déjà un décompte.
- **R-e (prérequis)** : les prérequis ne citent que `.dependency-cruiser.cjs`. L'annexe ajoute `eslint.config.mjs` (module de présence sans DOM ni minuterie) et `y-protocols` aux listes blanches de la synchronisation et de l'édition (types seuls pour l'édition). L'extension de curseurs entre au bloc 6, avec son premier import, et non avec la montée.

## Menaces propres à F-015

- **Usurpation** : un membre, `lecteur` compris, qui publie l'identifiant de compte d'un autre est écarté (F-015-AC16).
- **Retrait forgé ou relayé** : un retrait ou une modification de l'état d'un autre compte est écarté, y compris après une reconnexion de la victime (table, F-015-AC17).
- **Squat d'identifiant de client** : résiduel, accepté, consigné dans l'ADR-0020.
- **État piégé (exception, gel de l'affichage)** : il n'atteint jamais l'extension (copies validées).
- **Nom piégé (HTML, sens d'écriture)** : nœud de texte dans `<bdi>`, aucun attribut tiré d'un nom.
- **Inondation** : plafonds du relais inchangés, 20 états par compte et par document, regroupement client à 5 messages par seconde ; le journal reste exposé (R-d).
- **Fuite** : rien n'est stocké, ni sur le serveur, ni dans la base locale, ni dans le canal entre onglets (F-015-AC14, AC19).

## Annexe : fichiers protégés

Texte exact, écrit contre la branche `F-018` à `f456afe` : c'est l'état de `main` après la fusion de F-018, puisque F-032 ne touche aucun fichier protégé. Il est éprouvé sur une copie jetable de cette branche (`git archive`, `pnpm install --frozen-lockfile --offline`) :

- `depcruise` : `✔ no dependency violations found`, 56 règles au lieu de 53 ;
- onze violations attendues sont levées par des fichiers fautifs posés puis retirés :
  - depuis `presence/` : React, `@hocuspocus/provider` (deux règles), `@tiptap/core` (deux règles), la synchronisation, l'édition ;
  - un fichier interne de `presence/` importé par l'interface et par un test de `test/synchronisation/` ;
  - `y-protocols` importé à l'exécution par l'édition et par l'interface ;
- aucune violation pour les imports admis :
  - `yjs`, `y-protocols` et `@notionlike/contrats` depuis `presence/` ;
  - `y-protocols` depuis `synchronisation/` ;
  - l'extension de curseurs et le type `Awareness` depuis `edition/` ;
  - `presence/index.ts` depuis l'interface ;
  - un fichier interne depuis `test/presence/` ;
- ESLint : `setTimeout`, `setInterval`, `document`, `window`, `location`, `navigator` et `localStorage` refusés dans `presence/`, `apps/web/src`, `apps/server/src` et `packages` restent sans erreur ;
- Prettier conforme ; `git apply --check` vert sur `F-018`. Le diff d'ESLint s'applique aussi sur le `main` d'aujourd'hui, pas celui de dependency-cruiser.

À appliquer par `git apply` depuis la racine du dépôt, après la fusion de `main` dans `F-015` (bloc 0).

```diff
--- a/.dependency-cruiser.cjs
+++ b/.dependency-cruiser.cjs
@@ -306,11 +306,11 @@ module.exports = {
       name: "web-src-liste-blanche",
       severity: "error",
       comment:
-        "ADR-0007, F-003-AC27, F-010, F-013, F-006, F-018 : hors persistance, espace, navigation, identifiants, édition, page, compte, synchronisation, glisser-déposer, table et vues de table, le code d'apps/web n'importe que src/ (persistance et identifiants exceptés), les exports de @notionlike/document, react et react-dom : ni yjs, ni y-indexeddb, ni dépendance de test, ni module de Node.",
+        "ADR-0007, F-003-AC27, F-010, F-013, F-006, F-018, F-015 : hors persistance, espace, navigation, identifiants, édition, page, compte, synchronisation, glisser-déposer, table, vues de table et présence, le code d'apps/web n'importe que src/ (persistance et identifiants exceptés), les exports de @notionlike/document, react et react-dom : ni yjs, ni y-indexeddb, ni dépendance de test, ni module de Node.",
       from: {
         path: "^apps/web/src/",
         pathNot:
-          "^apps/web/src/(persistance|espace|navigation|identifiants|edition|page|compte|synchronisation|glisser|table|vues-de-table)/",
+          "^apps/web/src/(persistance|espace|navigation|identifiants|edition|page|compte|synchronisation|glisser|table|vues-de-table|presence)/",
       },
       to: {
         pathNot: [
@@ -354,7 +354,7 @@ module.exports = {
       name: "web-synchronisation-liste-blanche",
       severity: "error",
       comment:
-        "F-013-AC38, H13 : le module de synchronisation n'importe que lui-même, l'interface de la persistance, le contrôle de forme des identifiants, les exports de @notionlike/document, l'entrée publique de @notionlike/contrats, yjs et @hocuspocus/provider : ni React, ni l'édition, ni l'interface, ni le compte, ni la session d'espace ou de page.",
+        "F-013-AC38, H13, F-015, ADR-0020 : le module de synchronisation n'importe que lui-même, l'interface de la persistance, le contrôle de forme des identifiants, les exports de @notionlike/document, l'entrée publique de @notionlike/contrats, yjs, y-protocols (objet de présence de l'ouverture de la page affichée) et @hocuspocus/provider : ni React, ni l'édition, ni l'interface, ni le compte, ni la session d'espace ou de page.",
       from: { path: "^apps/web/src/synchronisation/" },
       to: {
         pathNot: [
@@ -363,7 +363,7 @@ module.exports = {
           "^apps/web/src/identifiants/",
           "^packages/document/src/index\\.ts$",
           "^packages/contrats/src/index\\.ts$",
-          "(^|/)node_modules/(yjs|@hocuspocus/provider)/",
+          "(^|/)node_modules/(yjs|y-protocols|@hocuspocus/provider)/",
           "^@hocuspocus/provider$",
         ],
       },
@@ -430,6 +430,36 @@ module.exports = {
         ],
       },
     },
+    {
+      name: "edition-y-protocols-types-seulement",
+      severity: "error",
+      comment:
+        "F-015-AC29, ADR-0020 : le module d'édition ne nomme l'objet de présence que par son type ; il n'en crée aucun et n'importe rien d'exécutable de y-protocols.",
+      from: { path: "^apps/web/src/edition/" },
+      to: { path: "(^|/)node_modules/y-protocols/", dependencyTypesNot: ["type-only"] },
+    },
+    {
+      name: "web-presence-liste-blanche",
+      severity: "error",
+      comment:
+        "F-015-AC29, H13, ADR-0020 : le module de présence n'importe que lui-même, l'entrée publique de @notionlike/contrats, yjs et y-protocols : ni React, ni le fournisseur, ni Tiptap ou ProseMirror, ni la synchronisation, l'édition, le compte ou l'interface.",
+      from: { path: "^apps/web/src/presence/" },
+      to: {
+        pathNot: [
+          "^apps/web/src/presence/",
+          "^packages/contrats/src/index\\.ts$",
+          "(^|/)node_modules/(yjs|y-protocols)/",
+        ],
+      },
+    },
+    {
+      name: "web-presence-par-son-interface",
+      severity: "error",
+      comment:
+        "F-015-AC29 : hors du module de présence et de ses tests (test/presence/), seul son index.ts est importable.",
+      from: { path: "^apps/web/", pathNot: "^apps/web/(src|test)/presence/" },
+      to: { path: "^apps/web/src/presence/", pathNot: "^apps/web/src/presence/index\\.ts$" },
+    },
     {
       name: "web-edition-par-son-interface",
       severity: "error",
@@ -442,15 +472,15 @@ module.exports = {
       name: "web-edition-liste-blanche",
       severity: "error",
       comment:
-        "F-003-AC27, F-006-AC32, F-005-AC33, F-033-AC25 : le module d'édition n'importe que lui-même, le composant de présentation de l'édition, les textes de l'interface, react, yjs, les paquets Tiptap qu'il emploie, poignée de bloc (drag-handle, drag-handle-react, node-range), curseur de dépôt (@tiptap/extensions), bloc code (extension-code-block) et utilitaire de suggestion (suggestion) compris, @floating-ui/dom (placement du menu slash), et, depuis F-033, lowlight, highlight.js et les types hast (coloration du bloc code, réservés à coloration.ts par coloration-confinee) ; ni @floating-ui/core, ni @floating-ui/utils, ni @dnd-kit/*.",
+        "F-003-AC27, F-006-AC32, F-005-AC33, F-033-AC25, F-015-AC29 : le module d'édition n'importe que lui-même, le composant de présentation de l'édition, les textes de l'interface, react, yjs, les paquets Tiptap qu'il emploie, poignée de bloc (drag-handle, drag-handle-react, node-range), curseur de dépôt (@tiptap/extensions), bloc code (extension-code-block), utilitaire de suggestion (suggestion) et curseurs des autres membres (extension-collaboration-caret) compris, @floating-ui/dom (placement du menu slash), lowlight, highlight.js et les types hast (coloration du bloc code, réservés à coloration.ts par coloration-confinee), et, depuis F-015, les types de y-protocols (objet de présence, par edition-y-protocols-types-seulement) ; ni @floating-ui/core, ni @floating-ui/utils, ni @dnd-kit/*.",
       from: { path: "^apps/web/src/edition/" },
       to: {
         pathNot: [
           "^apps/web/src/edition/",
           "^apps/web/src/interface/composants/Edition\\.tsx$",
           "^apps/web/src/interface/messages\\.ts$",
-          "(^|/)node_modules/(react|yjs)/",
-          "(^|/)node_modules/@tiptap/(core|pm|react|extensions|suggestion|extension-(bold|code-block|collaboration|document|drag-handle|drag-handle-react|heading|italic|link|list|node-range|paragraph|text))/",
+          "(^|/)node_modules/(react|yjs|y-protocols)/",
+          "(^|/)node_modules/@tiptap/(core|pm|react|extensions|suggestion|extension-(bold|code-block|collaboration|collaboration-caret|document|drag-handle|drag-handle-react|heading|italic|link|list|node-range|paragraph|text))/",
           "(^|/)node_modules/@floating-ui/dom/",
           "(^|/)node_modules/(lowlight|highlight\\.js|@types/hast)/",
         ],
```

```diff
--- a/eslint.config.mjs
+++ b/eslint.config.mjs
@@ -106,6 +106,23 @@
   name,
   message: `F-013 H13 : le module de synchronisation reçoit son environnement de ${FICHIER_ENVIRONNEMENT_SYNCHRONISATION}.`,
 }));
+// F-015 H13, AC24, AC29 : le module de présence s'éprouve sous Node ; il ne nomme aucune globale du
+// navigateur et ne programme aucune minuterie : son horloge, son canal et la visibilité de l'onglet
+// lui sont donnés.
+const GLOBALES_INTERDITES_PRESENCE = [
+  "window",
+  "self",
+  "document",
+  "location",
+  "history",
+  "navigator",
+  "setTimeout",
+  "setInterval",
+].map((name) => ({
+  name,
+  message:
+    "F-015 H13 : le module de présence reçoit son horloge, son canal et la visibilité de l'onglet.",
+}));
 const PROPRIETE_RANDOMUUID = {
   property: "randomUUID",
   message: "F-002-AC26 : crypto.randomUUID n'est lue que par apps/web/src/espace.",
@@ -274,6 +291,18 @@
     },
   },
   {
+    files: ["apps/web/src/presence/**"],
+    rules: {
+      "no-restricted-globals": [
+        "error",
+        {
+          globals: [...GLOBALES_INTERDITES_WEB, GLOBALE_INDEXEDDB, ...GLOBALES_INTERDITES_PRESENCE],
+          checkGlobalObject: true,
+        },
+      ],
+    },
+  },
+  {
     files: FICHIERS_NOM_DE_BASE_WEB,
     rules: {
       "no-restricted-syntax": ["error", SYNTAXE_HTML_BRUT],
```

Repli conditionnel, seulement si Vitest refuse la directive `// @vitest-environment jsdom` dans un fichier du projet `web-synchronisation` (bloc 8). Il ajoute dans `apps/web/vitest.config.ts` un troisième projet, et le fichier concerné prend le suffixe `.dom.test.ts`. La préparation `test/preparation.ts` n'est pas chargée : le fichier importe ce qu'il lui faut.

```ts
const SYNCHRONISATION_DOM = "test/synchronisation/**/*.dom.test.ts";
// projet « web-synchronisation » : exclude: [SYNCHRONISATION_DOM]
{
  test: {
    name: "web-synchronisation-dom",
    environment: "jsdom",
    include: [SYNCHRONISATION_DOM],
    restoreMocks: true,
    unstubGlobals: true,
  },
},
```

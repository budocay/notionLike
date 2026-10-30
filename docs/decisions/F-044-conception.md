# F-044 — Conception : modèles de page et modèles de ligne de table

Date : 2026-10-30
Spec : `specs/F-044.md`, validée, lue sur la branche `F-044` (base `c060a55`). ADR : amendements F-044 des ADR-0002, ADR-0009 et ADR-0016 (proposés). Code lu sur `main` : `packages/document/src/{arbre,format,document-espace,format-page,document-page,format-table,document-table,erreurs,index}.ts`, `packages/document/test/{borne-contrat,corbeille}.test.ts`, `apps/web/src/{interface,page,espace}/`. Dépend de la conception de F-045 (`docs/decisions/F-045-conception.md`, branche `F-045`, `d3773d0`).

`ARCHITECTURE.md` décrit `main` et n'est pas touché ici : il sera aligné sur le code livré.

## Recommandation : scinder la spec (H1)

Deux formats de document, deux interfaces, deux séries de coutures, et une dépendance qui ne vaut que pour la seconde moitié : la feature ne tient pas dans une session de production. **Retouche de spec proposée** :

- **F-044, modèles de page** : AC1 à AC11, AC24 et AC26 limités au document d'espace et au document de page, AC25, et la moitié « page » de AC27. **Ne dépend pas de F-045** : la ligne de dépendance tombe, F-044 peut partir dès que sa conception passe le gate.
- **Nouvelle feature, modèles de ligne de table** (identifiant à attribuer par agent-planif) : AC12 à AC23, AC24 et AC26 pour le document de table, et la moitié « table » de AC27. Dépend de F-045 (H7 : valeurs `etiquettes` ; version de table 3 après la version 2 de F-045). Sa spec reprend H6 à H9.

La suite de cette note couvre les deux moitiés, pour que la scission ne demande pas de seconde conception : chaque section dit à quelle moitié elle appartient.

## Approche

- **Modèle de page = entrée du document d'espace marquée `modele: true`** (H2). Son contenu est un document de page ordinaire : même base locale, mêmes droits, même synchronisation, même corbeille, même effacement (F-018-AC49). Le serveur ne lit pas les entrées du document d'espace au-delà de sa version (ADR-0013) : il n'a rien à changer.
- **Pas d'élévation du document d'espace (H3 confirmée).** Une application plus ancienne ignore le champ `modele` et voit le modèle comme une page de la racine : rien n'est perdu, et ce qu'elle peut y faire (renommer, déplacer, créer une sous-page, jeter) n'efface jamais la marque, puisque le module n'écrit que les champs qu'il nomme. Une sous-page créée sous un modèle par une telle application se lit à la racine dans l'application courante. Élever la version ferait refuser tout l'espace aux applications anciennes pour un gain d'affichage : écarté. Ni `packages/contrats`, ni le serveur, ni agent-backend.
- **Copie du contenu dans `@notionlike/document`**, par une opération de la façade `DocumentPage` : elle connaît la table des versions et les types Yjs, que `apps/web/src/interface` ne doit pas importer. Elle crée des éléments neufs (aucun identifiant Yjs partagé, F-044 H4).
- **Modèles de ligne dans le document de table** (H6) : un type racine `modeles`, la version 3, une lecture distincte de `lire()` (F-044-AC23). Ligne créée depuis un modèle : la `creerLigne(valeurs)` existante, une transaction (F-044-AC16).
- Aucune dépendance, aucun paquet, aucune règle de `.dependency-cruiser.cjs` nouvelle : `page/` peut importer `@notionlike/document` et la persistance, `interface/` les exports du paquet seulement.

## Moitié « page » : document d'espace (amendement F-044 de l'ADR-0002)

| Point                     | Décision                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Marque                    | champ `modele` d'une entrée de `pages`, écrit `true` à la création et jamais réécrit ni retiré. Une entrée est un modèle **si et seulement si** `modele === true` et son type se lit `page`. Toute autre valeur (`false`, chaîne, nombre, type de mauvaise nature), ou une marque sur une table : page ordinaire de l'arborescence (F-044-AC11, la même sur toutes les répliques) |
| Lecture de l'arborescence | `lire()` garde sa forme et **ne rend aucun modèle**, ni dans `racines` ni dans `corbeille` (F-044-AC25). Les modèles sont écartés avant la construction de l'arbre : une entrée dont le parent est un modèle se lit à la racine, comme un parent absent                                                                                                                           |
| Lecture des modèles       | `lireModeles(): Arborescence` : `racines`, les modèles hors corbeille, à plat (`enfants` vides), dans l'ordre du rang puis de l'identifiant ; `corbeille`, les modèles jetés, même ordre. Aucun type exporté nouveau                                                                                                                                                              |
| Création                  | `creerModele(titre): IdPage` : entrée de racine (`place.parent` nul), rang après le dernier modèle, par `ecrireNouvellePage` complétée du champ `modele` (la liste des écritures de place figée par F-029-AC15 reste `["ecrireNouvellePage", "ecrirePlace"]`). Refus : ceux de `creerPage` (titre)                                                                                |
| Opérations sur un modèle  | `renommerPage`, `mettreALaCorbeille`, `restaurerPage`, `supprimerDefinitivement` acceptent un modèle (restauré, il reste un modèle, F-044-AC8). `deplacerPage(modele, …)` et `creerPage` / `creerTable` sous un modèle : refus `page-introuvable` (aucun code nouveau). Mettre une page à la corbeille ne touche aucun modèle                                                     |
| Abonnement                | `abonner` notifie aussi quand les modèles lus changent (comparaison de `lireModeles()` en plus de `lire()`)                                                                                                                                                                                                                                                                       |

Exports et codes d'erreur de la moitié « page » : **inchangés** (deux méthodes de façade nouvelles, un champ facultatif nulle part). Les listes figées de `corbeille.test.ts` et `borne-contrat.test.ts` restent vraies.

## Moitié « page » : copie du contenu (amendement F-044 de l'ADR-0009)

Opération `DocumentPage.copierDe(source: DocumentPage): void`, dans un fichier nouveau `packages/document/src/copie-de-page.ts` (pur Yjs, importé par `document-page.ts`) :

1. Élève la version de la cible au moins à celle de la source (`eleverVersion(source.lireVersion())`), dans la transaction de la copie et avant tout élément (F-044-AC5).
2. Remplace tout le contenu de la cible par une copie **filtrée** du fragment `contenu` de la source : chaque nœud dont le nom figure dans la dernière ligne de `TABLE_DES_VERSIONS_PAGE` devient un `Y.XmlElement` neuf portant ses seuls attributs admis ; chaque texte un `Y.XmlText` neuf par `applyDelta`, ses seules marques admises gardées. Un nœud inconnu (forgé) est omis avec son sous-arbre ; un attribut ou une marque inconnus sont omis. Aucun `clone()` de Yjs : il recopierait aussi ce qui n'est pas admis.
3. Une seule transaction sur la cible, aucune écriture sur la source. Refus : `facade-fermee` sur l'une ou l'autre ; la source s'ouvre déjà en refusant une version non prise en charge.

Côté application (`apps/web/src/page/depuis-un-modele.ts`, nouveau) :

- **« Nouvelle page depuis un modèle »** : ouvre le document du modèle (`page/pages-ouvertes.ts`) et attend qu'il soit **disponible** (base locale existante, ou premier état reçu par la synchronisation, F-013) ; sinon, ou si l'ouverture lève `version-non-prise-en-charge` : rien n'est créé, annonce de F-044-AC6. Disponible : `creerPage(parent, titre du modèle)`, puis ouverture de la nouvelle page, `copierDe`, fermeture.
- **« Enregistrer comme modèle »** : même chemin, source la page, cible un `creerModele(titre de la page)`.
- **« Nouveau modèle de page »** : `creerModele("")`, sans copie.

La création de l'entrée et la copie touchent deux documents : elles ne sont pas atomiques. Une interruption entre les deux laisse une page au bon titre et au contenu vide, jamais un modèle modifié (risque accepté, ci-dessous).

## Moitié « page » : écran

| Fichier (`apps/web/src`)                                    | Rôle                                                                                                                            |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `interface/SectionDesModeles.tsx` (nouveau)                 | section « Modèles » de la barre latérale : liste, « Nouveau modèle de page », sélection, renommage ; lecture seule (F-044-AC10) |
| `interface/BarreLaterale.tsx`, `RangeePage.tsx`, `pages.ts` | « Enregistrer comme modèle » (page seulement), « Nouvelle page depuis un modèle » (racine et sous-page), choix du modèle        |
| `interface/EcranDeLaCorbeille.tsx`, `messages-corbeille.ts` | modèles jetés, marqués, nom accessible « Modèle … » (F-044-AC8)                                                                 |
| `interface/page-ouverte.ts`, `ZonePrincipale.tsx`           | bandeau « Modèle » (texte, pas la couleur seule, F-044-AC7)                                                                     |
| `interface/messages.ts` ou un `messages-modeles.ts` nouveau | libellés et annonces                                                                                                            |
| `page/depuis-un-modele.ts` (nouveau)                        | disponibilité et copie (ci-dessus)                                                                                              |
| `interface/composants/*`                                    | composants de présentation existants ; aucun fichier de classes nouveau (`styles.test.ts` l. 226 en compte quinze)              |

**Couture de l'arborescence (F-044-AC25)** : `apps/web/test/coutures-modeles.test.ts` (nouveau) énumère les sources d'`apps/web/src` qui appellent `.lire()` d'une façade d'espace ou lisent une `Arborescence`, et éprouve chacune sur un espace qui contient un modèle : aucune ne le reçoit (barre latérale, glisser-déposer de F-006, rang, changement de parent, corbeille des pages).

## Moitié « table » : modèles de ligne (amendement F-044 de l'ADR-0016)

| Point                  | Décision                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Forme stockée          | type racine `modeles`, une `Y.Map` : clé, l'identifiant (UUID) ; valeur, une `Y.Map` à champs `nom`, `rang`, `supprimee`, `valeurs` (une `Y.Map` créée dans la transaction qui crée le modèle, constat 1). `valeurs` a la forme de `cellules` : clé `<idColonne>` pour une valeur simple, `<idColonne>/<idOption>` pour une étiquette (amendement F-045)                                                                                                                          |
| Version                | 3 ; inscrite dans la transaction qui crée le premier modèle d'un document lu inférieur. La liste blanche des types racine devient `colonnes`, `lignes`, `versions`, `modeles`. Une application de la version 2 refuse le document entier par sa version, avant la liste blanche (F-044-AC22)                                                                                                                                                                                      |
| Lecture                | `lireModelesDeLigne(): readonly ModeleDeLigneLu[]`, distincte de `lire()` dont la forme ne change pas (F-044-AC23). `ModeleDeLigneLu = { id, nom, valeurs: ReadonlyMap<IdColonne, ValeurDeCellule>, inactives: readonly IdColonne[] }` : `valeurs`, les seules valeurs conformes à une colonne lue ; `inactives`, les colonnes lues dont la valeur stockée ne se lit pas (option retirée, valeur non conforme, F-044-AC17). Mêmes règles de tolérance et d'ordre que les colonnes |
| Opérations             | `creerModeleDeLigne(nom, position?)`, `renommerModeleDeLigne`, `deplacerModeleDeLigne`, `supprimerModeleDeLigne` (drapeau, F-017 H5), `ecrireValeurParDefaut(modele, colonne, valeur \| null)` (mêmes contrôles que `ecrireCellule`, rien n'est émis si la valeur est déjà lue)                                                                                                                                                                                                   |
| Ligne depuis un modèle | `creerLigne(modele.valeurs)` : la seule `creerLigne` existante, une transaction, les abonnés voient une création (F-044-AC16)                                                                                                                                                                                                                                                                                                                                                     |
| Abonnement             | `abonner` notifie aussi quand les modèles lus changent                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Contrat                | exports nouveaux `ModeleDeLigneLu`, `IdModeleDeLigne` ; code nouveau `modele-introuvable` (modèle absent ou supprimé, F-044-AC18)                                                                                                                                                                                                                                                                                                                                                 |

Écran : `vues-de-table/modeles-de-ligne.ts` (pur : état de l'édition, valeurs inactives), `vues-de-table/ModelesDeLigne.tsx` (liste et édition, champs de cellule réutilisés de F-018 et F-045), menu de « Nouvelle ligne » (`menus.ts`, `VueTableau.tsx`) dont la commande principale ne change pas (F-044-AC19). Classes dans `interface/composants/Table.tsx`.

## Plan par blocs (agent-frontend ; un commit par bloc)

Moitié « page » (F-044 après scission) :

| Bloc | Contenu                                                                                                                     | Preuves                        |
| ---- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| 1    | Document d'espace : marque, `lire()` sans modèles, `lireModeles`, `creerModele`, refus, abonnement                          | AC9, AC11, AC25 (paquet)       |
| 2    | `DocumentPage.copierDe` et son test énumérant la dernière ligne de `TABLE_DES_VERSIONS_PAGE`                                | AC3 (copie complète), AC4, AC5 |
| 3    | Écran : section « Modèles », bandeau, « Nouveau modèle », « Enregistrer comme modèle », « Depuis un modèle », disponibilité | AC1 à AC3, AC6, AC7, AC10      |
| 4    | Corbeille, couture de l'arborescence, bout en bout (moitié page)                                                            | AC8, AC25, AC27                |

Moitié « table » (nouvelle feature) :

| Bloc | Contenu                                                                                               | Preuves                                   |
| ---- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| 5    | Document de table : `modeles`, version 3, lecture, opérations, contrat                                | AC13, AC15, AC17, AC18, AC20, AC22 à AC24 |
| 6    | Écran : liste, édition des valeurs, « Depuis un modèle », lecture seule ; bout en bout (moitié table) | AC12, AC14, AC16, AC19, AC21, AC27        |

Aucun bloc pour agent-backend ni agent-bdd.

## Tests livrés modifiés : liste confrontée à H10

| Fichier (feature)                                                                    | Changement                                                                                                         | Dans H10           |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ------------------ |
| `packages/document/test/corbeille.test.ts` (F-001, F-007)                            | moitié page : aucun ; moitié table : `EXPORTS_ATTENDUS` (+2), `CODES_ATTENDUS` (+1)                                | oui                |
| `packages/document/test/structure.test.ts` (F-001)                                   | `copie-de-page.ts` si la liste des sources du paquet y est figée                                                   | oui                |
| `packages/document/test/robustesse.test.ts` (F-001)                                  | aucun (pas d'élévation du document d'espace)                                                                       | oui (conditionnel) |
| `packages/document/test/table-contrat.test.ts` (F-017)                               | moitié table : listes d'exports et de codes                                                                        | oui                |
| `packages/document/test/table-lecture.test.ts`, `aides-table.ts` (F-017)             | moitié table : liste blanche à quatre racines si un test l'énumère ; versions refusées déjà forgées à 99 par F-045 | oui                |
| `apps/web/test/vues-de-table/structure.test.ts` (F-018)                              | aucun attendu (règles sans liste de modules)                                                                       | oui                |
| **`packages/document/test/borne-contrat.test.ts` (F-029-AC15, F-017-AC25)**          | moitié table : `EXPORTS_DU_PAQUET` l. 57 (+2), union des codes l. 145 (+1) ; moitié page : aucun                   | **non : écart**    |
| **`apps/web/test/vues-de-table/coutures-etiquettes.test.ts` (F-045-AC29, à livrer)** | moitié table : les fichiers nouveaux qui lisent `ValeurDeCellule` ou `.options` entrent dans sa liste fermée       | **non : écart**    |
| tests de F-006, F-007, F-018 sur l'arborescence et la corbeille                      | aucun : `lire()` ne change pas de forme ni de contenu sans modèle                                                  | oui                |

Retouche de spec proposée : ajouter les deux fichiers en écart à H10 de la moitié « table » ; dans la moitié « page », H10 se réduit à `structure.test.ts` (conditionnel).

## Ordre et conflits

- **F-044 (pages)** : indépendante de F-045 après scission. Fichiers communs avec F-021, F-038, F-039 : aucun. Avec F-037 et F-043 (en conception) : `interface/BarreLaterale.tsx` probable, à vérifier à leur conception. Avec F-007 livrée : `EcranDeLaCorbeille.tsx`. Peut partir en parallèle de F-045.
- **Modèles de ligne** : après F-045 (version 2, clés composées, `coutures-etiquettes.test.ts`), donc après F-034, F-021, F-038 et F-039.
- `docs/decisions/0016-format-du-document-de-table.md` reçoit un amendement dans F-045 et dans F-044 : conflit d'ajout à la fusion, à résoudre par agent-architecte-conception (amendement F-045 d'abord).
- Fichiers protégés ou partagés pour le dev : aucun.

## Risques

- Copie non atomique entre deux documents : une page au contenu vide peut rester après une interruption ; elle est visible et se jette. Pas de compensation automatique (elle écrirait dans le document d'espace pendant une panne).
- Disponibilité d'un modèle jamais ouvert sur l'appareil : la distinction « base locale absente » / « base locale vide » repose sur la persistance (`persistance/`) ; le producteur la vérifie au bloc 3 et la teste (F-044-AC6).
- Application ancienne : elle montre les modèles comme des pages de la racine et peut leur créer des sous-pages, qui réapparaissent à la racine dans l'application courante. Dégradation acceptée par H3.
- Un modèle de page mal formé forgé (`modele` d'un autre type) devient une page ordinaire visible : voulu (F-044-AC11), pas de perte.

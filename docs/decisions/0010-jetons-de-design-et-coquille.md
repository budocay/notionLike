# ADR-0010 — Jetons de design d'`apps/web` et tiroir de la barre latérale

Statut : accepté
Date : 2026-10-09 (décision prise avant le code ; texte mis d'accord avec le code livré, dernier commit de code `0d0a240` ; la décision sur les jetons et le tiroir n'a pas changé)

## Contexte et problème

F-004 (`specs/F-004.md`, validée) pose l'identité visuelle. Deux choix se défont mal : la forme et les noms des jetons, que chaque composant à venir portera dans ses classes, et le moyen du tiroir sur écran étroit (F-004-AC42), qui fixe la structure de la coquille et la façon de la tester. Deux autres choix, pris dans le code, sont écrits ici parce que chaque composant à venir les portera : le nombre de feuilles CSS, et l'endroit où s'écrivent les classes. Faits : veille du 2026-10-09 (`MEMORY/VEILLE.md`, sections Tailwind et « Tiroir accessible ») et essais de `docs/decisions/F-004-conception.md`.

## Options étudiées

Jetons :

- **A. Un fichier CSS unique sous `@theme static`, deux couches pour les couleurs** (retenue).
- B. Jetons en TypeScript, injectés en variables CSS. Écartée : deux sources, et Tailwind 4 se configure en CSS.
- C. Trois couches (primitif, sémantique, composant). Écartée par la spec (H11) : une seule application.

Feuilles :

- A. Une seule feuille, dont les `@source` désignent aussi les fichiers de la page de démonstration. Livrée d'abord, le 2026-10-09 (`53caa41`), puis refusée par le gate d'architecture : les classes propres à la page et trois jetons qui ne servaient qu'à elle entraient dans la feuille de production, contre F-004-AC50.
- **B. Deux feuilles : la feuille d'entrée, et une feuille de démonstration qui l'importe** (retenue).

Classes :

- A. Classes écrites dans le JSX de chaque composant. Écartée : Tailwind analyserait tout `src/`, et le contrôle classe par classe de F-004-AC3 porterait sur du code.
- **B. Toute classe dans un fichier `*.classes.ts`, lu seulement par son dossier** (retenue).

Tiroir :

- A. `dialog` natif ouvert par `showModal()`. Inertie, focus et Échap viennent de la plateforme. Mais jsdom 30.1.1 n'a ni `showModal` ni `close` : tout test de composant passerait par une simulation de la plateforme ; la barre latérale changerait de parent au passage du seuil (remontage) ; l'état ouvert aurait deux sources (attribut `open`, état React) ; la fermeture au clic sur le voile reste à écrire.
- **B. `div` portant `role="dialog"` et `aria-modal="true"` quand il est ouvert, le reste de la coquille portant `inert`** (retenue).

## Décision

**Jetons.** Fichier des jetons : `apps/web/src/styles/jetons.css`, un seul bloc `@theme static`, première déclaration `--*: initial;`, une déclaration par jeton (les deux dégradés s'étendent sur plusieurs lignes), les images clés dans le bloc, puis le bloc `@media (prefers-reduced-motion: reduce)` hors de `@theme`. Feuille d'entrée : `apps/web/src/styles/entree.css` (`@import "tailwindcss" source(none);`, un `@source` vers les fichiers de classes des composants, `@import "./jetons.css";`, la base, les classes nommées). Noms :

| Catégorie                            | Forme du nom                                                                                                           | Remarque                                                                                               |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| couleur primitive                    | `--primitif-<famille>-<nuance>`                                                                                        | hexadécimal à six chiffres ; aucune classe ne peut la consommer                                        |
| couleur sémantique                   | `--color-surface-<usage>`, `--color-texte-<usage>`, `--color-repere-<usage>`                                           | `var(--primitif-…)` seul ; le préfixe dit le rôle, les tests s'y fient                                 |
| dégradé                              | `--degrade-accent`, `--degrade-halo`                                                                                   | hors espace de noms : consommés par une classe nommée                                                  |
| typographie                          | `--text-<nom>`, `--text-<nom>--line-height`, `--text-<nom>--letter-spacing`, `--font-weight-<nom>`, `--tracking-<nom>` | tailles et hauteurs de ligne en `rem`                                                                  |
| espacement et taille, largeur bornée | `--spacing-<nom>`, `--container-<nom>`                                                                                 | pas de `--spacing` de base ; les tailles d'éléments (cible, rangée, icône) sont des espacements nommés |
| trait, rayon, ombre                  | `--epaisseur-<nom>`, `--radius-<nom>`, `--shadow-<nom>`                                                                | épaisseurs en pixels ; une ombre porte une couleur littérale transparente                              |
| plan d'empilement                    | `--plan-<nom>`                                                                                                         | entier ; consommé par une classe nommée `plan-<nom>`                                                   |
| mouvement                            | `--duree-<nom>`, `--duree-boucle-<nom>`, `--ease-<nom>`, `--animate-<nom>`                                             | millisecondes entières ; `--animate-*` par `var(…)`                                                    |
| seuil                                | `--breakpoint-etroit`                                                                                                  | en `rem` ; lu par le code avec `getComputedStyle` (essai B1)                                           |

Trois rôles de couleur seulement. Un filet de séparation est peint avec un jeton de surface, sans quatrième rôle : aucune couleur de texte, de surface ou de repère n'échappe à la règle de contraste universelle (F-004-AC7, AC8). Livré : les quatre ombres portent une couleur littérale transparente, hors des deux couches et hors de cette règle ; le voile du tiroir est l'une d'elles (`--shadow-voile`). Une classe sans jeton derrière elle (`opacity-0`, `flex-1`) est une classe nommée déclarée une fois par `@utility` dans la feuille d'entrée ; livré : vingt-huit classes nommées dans la feuille d'entrée et cinq dans la feuille de démonstration, les épaisseurs et les plans d'empilement sont devenus des jetons qu'elles consomment, et une classe de structure sans valeur (`flex`, `hidden`, `absolute`, `truncate`) s'écrit telle quelle.

Seuil : le jeton s'appelle `--breakpoint-etroit` et donne la variante `etroit:`. Elle s'applique à partir du seuil, donc sur écran large ; la classe sans variante vaut pour l'écran étroit. Dans le code, `etroit` (`useEcranEtroit`) est vrai sous le seuil. Le même mot désigne ainsi le seuil dans la feuille et le côté étroit dans le code.

**Deux feuilles.** `apps/web` a trois fichiers CSS et pas un de plus : le fichier des jetons, la feuille d'entrée et la feuille de démonstration (`apps/web/src/demonstration/demonstration.css`). La feuille d'entrée est seule à importer Tailwind et le fichier des jetons, seule atteinte depuis l'entrée de production, et ne désigne aucun fichier de la page de démonstration. La feuille de démonstration importe la feuille d'entrée, et ni Tailwind ni les jetons ; elle désigne par ses propres `@source` les fichiers de la page, porte les classes nommées propres à la page et ne déclare aucun jeton : une dimension propre à la page se calcule sur les jetons existants. Seule l'entrée de la page l'importe. Le fichier des jetons reste unique et ne porte aucun jeton pour la page seule.

**Classes.** Toute classe utilitaire s'écrit dans un fichier `*.classes.ts`, objet ou chaîne constante, et nulle part ailleurs. Un fichier de classes n'importe rien et n'est lu que par les fichiers de son dossier. Hors d'`apps/web/src/interface/composants/`, l'application n'habille donc aucune balise : elle rend un composant de présentation, enveloppes comprises (la hauteur de fenêtre, l'écran sans coquille et la zone principale sont rendus par `Coquille`, `EcranPlein` et `Principale`). Tailwind n'analyse que ces fichiers et le gabarit de la page de démonstration. La règle est tenue par `apps/web/test/styles.test.ts` (classe en dur refusée, import d'un fichier de classes depuis un autre dossier refusé, clé sans lecteur refusée), au `pre-push` ; aucun contrat de dépendances ne la tient.

**Tiroir.** Une seule structure de coquille aux deux largeurs : conteneur de la barre latérale, voile, puis un conteneur « reste » (avertissement, barre du haut, zone principale). L'état vient de React seul : `etroit` (abonnement à `matchMedia` bâti sur le jeton, requête `(width >= <valeur>)`) et une demande d'ouverture ; livré, `ouvert` vaut `etroit && demande`, et la demande est oubliée quand la fenêtre repasse au-dessus du seuil. Quand le tiroir est ouvert, le conteneur de la barre porte `role="dialog"`, `aria-modal` et le nom « Barre latérale », le voile est rendu, le reste porte `inert`. Sous le seuil et fermé, le conteneur est caché par la feuille (`hidden etroit:flex`) : l'affichage de la barre est décidé par la feuille, le dialogue par React, sur le même jeton. Le projet écrit : focus sur « Fermer la barre latérale » à l'ouverture, Échap, clic sur le voile, retour du focus au bouton d'ouverture une fois `inert` retiré, fermeture à la sélection. Livré en plus : Échap est écouté sur le document tant que le tiroir est ouvert, où que soit le focus, par le module qui tient l'état (`interface/tiroir.ts`), après la saisie de titre et les surfaces flottantes, qui gardent la main ; la coquille ne reçoit aucun rappel de frappe ; le bouton de fermeture n'est rendu que tiroir ouvert, dans la tête de la barre ; choisir une page porte le focus sur la zone principale ; créer une page laisse le tiroir ouvert ; la largeur du tiroir est `min(19 rem, 100 % − 44 pixels)` ; le voile est peint par une ombre. Pas de piège de focus : le reste étant inerte, un arrêt sur l'interface du navigateur est admis par F-004-AC42. Entrée animée par `transform` et `opacity` avec `@starting-style` ; aucune animation de sortie (elle demanderait de transiter `display`, que F-004-AC11 interdit, et la spec la place hors périmètre).

## Conséquences

- Sous jsdom, l'option retenue se teste sans simulation : attributs posés et retirés (`role`, `aria-modal`, `inert`, `aria-expanded`, `aria-controls`) et gestionnaires du projet, avec l'aide unique qui simule `matchMedia`. L'option A aurait exigé de simuler `showModal` et `close`, et les tests auraient éprouvé la simulation.
- L'inertie réelle et le focus ne sont prouvés que dans Chromium (F-004-AC42, [navigateur]) ; la suite des douze tabulations, non essayée par la conception, l'est par un scénario de bout en bout livré (`e2e/largeurs.spec.ts`), hors des hooks.
- Renommer un jeton sémantique touche chaque fichier qui le consomme : les noms d'usage ont été choisis au bloc 1 (sept surfaces, cinq textes, six repères) et sont à tenir. Renommer le seuil toucherait chaque classe `etroit:` des fichiers de classes.
- Un thème clair redéfinirait les jetons sémantiques sans toucher aux composants.
- Se défait : passer au `dialog` natif ne change que la coquille et ses tests. Livré : la structure décidée ici est écrite une seule fois, dans le composant de présentation `apps/web/src/interface/composants/Coquille.tsx` (cadre, conteneur de la barre ou tiroir, voile, reste), qui reçoit l'état sans le tenir, et le même fichier rend les enveloppes (hauteur de fenêtre par la propriété `fenetre`, `EcranPlein`, `Principale`) ; l'état est dans `interface/tiroir.ts` et `interface/largeur.ts`, et `interface/Application.tsx` relie les deux.
- La page de démonstration rend ce même composant, fermé puis ouvert, dans un aperçu : elle montre la structure décidée ici, pas l'état du tiroir, l'inertie ni le focus.
- La convention des fichiers de classes se défait mal : chaque composant à venir la porte. Une feature qui a besoin d'une balise habillée hors d'`interface/composants/` y ajoute un composant de présentation ; elle n'importe pas un fichier de classes.
- La feuille de démonstration coûte un contrôle de plus (les feuilles énumérées depuis le disque) et une preuve lancée à la main sur `dist/` (`apps/web/test/construction-sans-demonstration.ts`, hors des hooks), en échange d'une feuille de production qui ne porte rien de la page. Changer un jeton sur lequel une classe de la page est calculée change aussi la page.

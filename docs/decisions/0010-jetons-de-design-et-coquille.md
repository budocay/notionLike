# ADR-0010 — Jetons de design d'`apps/web` et tiroir de la barre latérale

Statut : accepté
Date : 2026-10-09

## Contexte et problème

F-004 (`specs/F-004.md`, validée) pose l'identité visuelle. Deux choix se défont mal : la forme et les noms des jetons, que chaque composant à venir portera dans ses classes, et le moyen du tiroir sur écran étroit (F-004-AC42), qui fixe la structure de la coquille et la façon de la tester. Faits : veille du 2026-10-09 (`MEMORY/VEILLE.md`, sections Tailwind et « Tiroir accessible ») et essais de `docs/decisions/F-004-conception.md`.

## Options étudiées

Jetons :

- **A. Un fichier CSS unique sous `@theme static`, deux couches pour les couleurs** (retenue).
- B. Jetons en TypeScript, injectés en variables CSS. Écartée : deux sources, et Tailwind 4 se configure en CSS.
- C. Trois couches (primitif, sémantique, composant). Écartée par la spec (H11) : une seule application.

Tiroir :

- A. `dialog` natif ouvert par `showModal()`. Inertie, focus et Échap viennent de la plateforme. Mais jsdom 30.1.1 n'a ni `showModal` ni `close` : tout test de composant passerait par une simulation de la plateforme ; la barre latérale changerait de parent au passage du seuil (remontage) ; l'état ouvert aurait deux sources (attribut `open`, état React) ; la fermeture au clic sur le voile reste à écrire.
- **B. `div` portant `role="dialog"` et `aria-modal="true"` quand il est ouvert, le reste de la coquille portant `inert`** (retenue).

## Décision

**Jetons.** Fichier des jetons : `apps/web/src/styles/jetons.css`, un seul bloc `@theme static`, première déclaration `--*: initial;`, une déclaration par ligne, puis le bloc `@media (prefers-reduced-motion: reduce)` hors de `@theme`. Feuille d'entrée : `apps/web/src/styles/entree.css` (`@import "tailwindcss" source(none);`, les `@source`, `@import "./jetons.css";`, la base, les classes nommées). Noms :

| Catégorie                | Forme du nom                                                                 | Remarque                                                               |
| ------------------------ | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| couleur primitive        | `--primitif-<famille>-<nuance>`                                              | hexadécimal à six chiffres ; aucune classe ne peut la consommer        |
| couleur sémantique       | `--color-surface-<usage>`, `--color-texte-<usage>`, `--color-repere-<usage>` | `var(--primitif-…)` seul ; le préfixe dit le rôle, les tests s'y fient |
| dégradé                  | `--degrade-accent`, `--degrade-halo`                                         | hors espace de noms : consommés par une classe nommée                  |
| typographie              | `--text-<nom>`, `--text-<nom>--line-height`, `--font-weight-<nom>`           | en `rem`                                                               |
| espacement, rayon, ombre | `--spacing-<nom>`, `--radius-<nom>`, `--shadow-<nom>`                        | pas de `--spacing` de base                                             |
| mouvement                | `--duree-<nom>`, `--duree-boucle-<nom>`, `--ease-<nom>`, `--animate-<nom>`   | millisecondes entières ; `--animate-*` par `var(…)`                    |
| seuil                    | `--breakpoint-etroit`                                                        | en `rem` ; lu par le code avec `getComputedStyle` (essai B1)           |

Trois rôles de couleur seulement. Un filet de séparation est peint avec un jeton de surface, sans quatrième rôle : aucune couleur n'échappe à la règle de contraste universelle (F-004-AC7, AC8). Une classe sans jeton derrière elle (`opacity-0`, `flex-1`, épaisseur de contour) est une classe nommée déclarée une fois par `@utility` dans la feuille d'entrée.

**Tiroir.** Une seule structure de coquille aux deux largeurs : conteneur de la barre latérale, voile, puis un conteneur « reste » (avertissement, barre du haut, zone principale). L'état vient de React seul : `etroit` (abonnement à `matchMedia` bâti sur le jeton) et `ouvert`. Quand `etroit && ouvert`, le conteneur de la barre porte `role="dialog"` et `aria-modal`, le voile est rendu, le reste porte `inert`. Le projet écrit : focus sur « Fermer la barre latérale » à l'ouverture, Échap, clic sur le voile, retour du focus au bouton d'ouverture une fois `inert` retiré, fermeture à la sélection. Pas de piège de focus : le reste étant inerte, un arrêt sur l'interface du navigateur est admis par F-004-AC42. Entrée animée par `transform` et `opacity` avec `@starting-style` ; aucune animation de sortie (elle demanderait de transiter `display`, que F-004-AC11 interdit, et la spec la place hors périmètre).

## Conséquences

- Sous jsdom, l'option retenue se teste sans simulation : attributs posés et retirés (`role`, `aria-modal`, `inert`, `aria-expanded`, `aria-controls`) et gestionnaires du projet, avec l'aide unique qui simule `matchMedia`. L'option A aurait exigé de simuler `showModal` et `close`, et les tests auraient éprouvé la simulation.
- L'inertie réelle et le focus ne sont prouvés que dans Chromium (F-004-AC42, [navigateur]) ; la suite des douze tabulations n'a pas été essayée par cette conception.
- Renommer un jeton sémantique touche chaque fichier qui le consomme : les noms d'usage sont à choisir au bloc 1 et à tenir.
- Un thème clair redéfinirait les jetons sémantiques sans toucher aux composants.
- Se défait : passer au `dialog` natif ne change que le composant de coquille et ses tests.

# F-004 — Conception (mode rapide) : essais, décisions, points de la spec

Date : 2026-10-09
Spec : `specs/F-004.md` (validée, `7f5b0f5`). ADR : ADR-0010 (jetons, tiroir).

Document court, sur décision du dev du 2026-10-09 : pas de plan par blocs ni de gate de conception ; le bloc 0 est commité (`4238f25`). Ce document ne décrit pas le code livré.

## Essais exécutés

Gabarit : `git archive HEAD` de `7f5b0f5` dans le scratchpad, `pnpm install --frozen-lockfile`, puis `pnpm --filter @notionlike/web add -D --save-exact tailwindcss@4.3.3 @tailwindcss/vite@4.3.3` et le plugin dans `vite.config.ts`. Node 26, pnpm 12.10.1, Chromium de Playwright 1.63.0. Prototype : `src/styles/jetons.css` (`@theme static`, `--*: initial`, `--breakpoint-etroit: 51.25rem`, `--duree-rapide: 150ms`, `--duree-boucle-chargement: 1200ms`, `--animate-chargement`, bloc de mouvement réduit), `src/styles/entree.css` (`source(none)`, trois `@source`, `@custom-variant sans-survol (@media (hover: none))`, deux `@utility`), `demo.html` et `src/demonstration/entree.tsx`.

| Essai | Question                                                              | Commande                                                        | Résultat                                                                                                                                                                                                                                                |
| ----- | --------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A0    | Ligne de base                                                         | `pnpm exec vitest run` ; `pnpm contrats`                        | `Test Files 21 passed (21)`, `Tests 777 passed (777)` ; 14 fichiers pour `web` ; `no dependency violations found (76 modules, 203 dependencies cruised)`                                                                                                |
| A1    | `src/main.tsx` importe la feuille d'entrée : les tests cassent-ils ?  | `pnpm exec vitest run` (import ajouté à côté de `./styles.css`) | `21 passed`, `777 passed`, aucune ligne `Errors` : Vitest ne traite pas la feuille, `apps/web/vitest.config.ts` ne charge pas le plugin                                                                                                                 |
| A2    | Contrats et types avec les nouveaux fichiers                          | `pnpm contrats` ; `pnpm typecheck`                              | `no dependency violations found (81 modules, 207 dependencies cruised)` ; code 0. Les seize contrats couvrent `src/styles/` et `src/demonstration/` sans retouche                                                                                       |
| B1    | Jeton `--breakpoint-*` lu par `getComputedStyle` dans Chromium        | scénario Playwright, serveur de développement, à 768 puis 1024  | valeur lue `51.25rem` sur `/demo.html` et sur `/` ; `matchMedia("(min-width: " + valeur + ")").matches` : `false` à 768, `true` à 1024                                                                                                                  |
| B2    | Mouvement réduit par `page.emulateMedia({ reducedMotion: "reduce" })` | même scénario                                                   | sans émulation : `transition-duration 0.15s`, `animation-name pouls`, `animation-duration 1.2s` ; avec : `0s`, `none`, `0s`                                                                                                                             |
| B3    | `hover: none` et `pointer: coarse`                                    | même scénario                                                   | CDP `Emulation.setEmulatedMedia` avec `features` `hover` et `pointer` : SANS EFFET. `browser.newContext({ hasTouch: true, isMobile: true, viewport })` : les deux requêtes sont vraies, `sans-survol:` et `pointer-coarse:` s'appliquent (essayé à 360) |
| B4    | État de survol forcé pour une capture                                 | CDP `CSS.forcePseudoState` (`hover`) sur un nœud                | l'opacité calculée passe de `0` à `1` ; plusieurs états peuvent donc figurer sur une même capture                                                                                                                                                       |
| B5    | Nettoyage de `test-results/`                                          | deux lancements de `playwright test`, le second avec `-g`       | au début de chaque lancement, complet ou partiel, le dossier est vidé : fichier témoin et capture du lancement précédent absents ; une capture écrite par `page.screenshot({ path: "test-results/captures/…" })` y reste jusqu'au lancement suivant     |
| C1    | Page de démonstration hors de la construction                         | `pnpm --filter @notionlike/web build` ; `grep -rl` sur `dist/`  | `dist/` : `index.html` et deux fichiers sous `assets/` ; ni `demo.html`, ni le marqueur, ni « demonstration » (code de `grep` 1). Les classes que seule la page emploie sont en revanche dans la feuille de production                                  |

Constats annexes : `hover:opacity-100` est produite thème vidé (classe à nombre nu, à refuser selon F-004-AC19) ; `@starting-style` et une requête `@media` s'écrivent dans un `@utility`.

Non essayé : lecture du graphe de `dependency-cruiser` depuis un test (F-004-AC52) ; relevé à chaque validation de rendu (F-004-AC54) ; suite des tabulations avec `inert` ; fermeture d'un `dialog` ; lecture d'`eslint.config.mjs` par un test (F-004-AC58) ; propriété personnalisée lue par `getComputedStyle` sous jsdom ; API `compile` de Tailwind sous Vitest ; lecture du jeton sur la construction de production ; `hover: none` à 1280 ; stabilité des captures d'une machine à l'autre.

## Décisions

- **Jetons** (ADR-0010) : `src/styles/jetons.css`, bloc `@theme static` unique ; couleurs en deux couches, trois rôles (`surface`, `texte`, `repere`) ; filets peints avec un jeton de surface ; classes sans jeton déclarées par `@utility` dans `src/styles/entree.css`. Raison : une source, lisible par un test sans analyseur, et aucune couleur hors de la règle de contraste.
- **Tiroir** (ADR-0010) : `div` avec `role="dialog"`, `aria-modal` et `inert` sur le reste, état tenu par React. Raison : une seule structure aux deux largeurs, tests de composant sans simulation de `showModal`. Sous jsdom : attributs et gestionnaires ; inertie et focus dans Chromium.
- **Largeur** : un seul module d'`interface/` lit `--breakpoint-etroit` sur la racine et s'abonne à `matchMedia` (essai B1). Sous jsdom, l'aide de test unique pose la valeur du jeton et simule `matchMedia`.
- **Page de démonstration** : gabarit `apps/web/demo.html`, entrée `apps/web/src/demonstration/entree.tsx`, qui importe la feuille d'entrée ; servie à `/demo.html` par le serveur de développement. Elle reste hors de la construction parce que Vite ne construit que `index.html` (essai C1) : aucune garde à écrire, à condition que rien d'atteint depuis `src/main.tsx` n'importe `src/demonstration/`, ce que le test de F-004-AC50 tient. `demo.html` est un fichier de style et figure dans un `@source`.
- **Composants montrés** : composants de présentation à propriétés simples (titres, adresses, états), sans type de `@notionlike/document`, dans `src/interface/composants/` ; les quatre fichiers de F-002 (`BarreLaterale`, `RangeePage`, `SaisieTitre`, `ZonePrincipale`) gardent leur chemin et les composent quand l'application bascule. Raison : la page ne touche ni document ni session, et aucune entrée des listes fermées de F-002 n'est retirée.
- **Émulations** : mouvement réduit par `page.emulateMedia` ; absence de survol et pointeur imprécis par un contexte `hasTouch` et `isMobile` (essais B2, B3), sans projet Playwright ajouté.
- **Captures de la page** : survol et focus forcés par `CSS.forcePseudoState` (essai B4) ; tiroir ouvert par une capture de plus aux largeurs étroites.

## Palette de départ

Proposition calculée (formule de la veille), à juger par le dev sur les captures. Base encre bleu pétrole, accent cuivre vers or réservé aux repères, focus givre.

| Jeton sémantique               | Primitif                 | Valeur    |
| ------------------------------ | ------------------------ | --------- |
| `--color-surface-retrait`      | `--primitif-encre-950`   | `#0b0e14` |
| `--color-surface-application`  | `--primitif-encre-900`   | `#10151c` |
| `--color-surface-relief`       | `--primitif-encre-850`   | `#171e26` |
| `--color-surface-survol`       | `--primitif-encre-800`   | `#1d242d` |
| `--color-surface-active`       | `--primitif-encre-750`   | `#232c36` |
| `--color-surface-filet`        | `--primitif-encre-700`   | `#2c353f` |
| `--color-surface-halo`         | `--primitif-lagune-900`  | `#122a30` |
| `--color-texte-principal`      | `--primitif-brume-100`   | `#e8ecf2` |
| `--color-texte-secondaire`     | `--primitif-brume-400`   | `#a6b1bf` |
| `--color-texte-erreur`         | `--primitif-corail-300`  | `#ff99a0` |
| `--color-texte-avertissement`  | `--primitif-or-200`      | `#f6d179` |
| `--color-repere-focus`         | `--primitif-givre-300`   | `#85d2ff` |
| `--color-repere-contour`       | `--primitif-ardoise-400` | `#8392a5` |
| `--color-repere-erreur`        | `--primitif-rouge-400`   | `#ff6b7a` |
| `--color-repere-avertissement` | `--primitif-or-300`      | `#f1bf4b` |
| `--color-repere-accent-debut`  | `--primitif-cuivre-400`  | `#e17f47` |
| `--color-repere-accent-fin`    | `--primitif-or-300`      | `#f1bf4b` |

Calculé : texte sur surface, minimum 5,72 (secondaire sur filet), maximum 16,29 ; repère sur surface, minimum 3,92 (contour sur filet) ; dégradé d'accent, 17 points interpolés en sRGB, minimum 4,34 ; teintes des surfaces de 192° à 220° (arc de 28°) ; saturation minimale 18 % ; luminance du fond de l'application 0,0073. Typographie, espacements, rayons, ombres et durées : laissés au producteur, dans les règles de la spec.

## Points de la spec

1. **F-004-AC3 et H25 contre F-004-AC50.** H25 range AC3 (énumération sans exemption) dans le bloc 1, et AC50 veut la page de démonstration « avant d'habiller l'application ». Tant que `src/styles.css` et les composants de F-002 existent, l'énumération échoue sur leurs couleurs littérales. Les deux ne tiennent ensemble que si AC3, AC6, AC10 et AC16 ne deviennent vrais qu'au bloc qui supprime `styles.css`, ou si le bloc 1 la supprime et laisse l'application sans habillage jusqu'au bloc 2. Au producteur de dire lequel dans son message de fin ; H25 autorise le déplacement d'un critère.
2. **F-004-AC17 contre F-004-AC41.** Les tests de composant de F-002 rendent l'application sans `matchMedia`, que jsdom n'a pas. Le poser par défaut demande une ligne dans `test/preparation.ts`, fichier de préparation qui n'entre dans aucun des trois motifs de modification d'AC17. Lecture retenue : ce n'est pas un test, aucune vérification n'y est retirée ; il est à inscrire dans la liste des fichiers modifiés de `MEMORY/features/F-004.md`. Si cette lecture est refusée, la simulation passe par `test/aides-coquille.tsx` et `importerEntree`.
3. **F-004-AC43 et AC44.** L'émulation tient par un contexte tactile, pas par une requête émulée seule (essai B3) : à 1280, `hover: none` s'obtient par un contexte `hasTouch` et `isMobile` de 1280 de large, non essayé.
4. **F-004-AC11 et tiroir.** Aucune animation de sortie n'est possible sans transiter `display` : le tiroir, le menu et le voile se ferment sans mouvement. Conforme à la spec, à dire au dev avant les captures.
5. **F-004-AC19.** Toute classe à nombre nu est refusée, `opacity-0`, `flex-1` et `z-10` comprises : la feuille d'entrée portera donc plus de classes nommées qu'un projet Tailwind habituel.

## Note de fin (2026-10-09, après le dernier bloc)

`ARCHITECTURE.md` a été aligné une seule fois sur le code livré (`6b5daed`), et l'ADR-0010 mis d'accord avec lui sans changement de décision. Ce qui précède reste la conception d'avant le code : la palette de départ, en particulier, n'est pas celle livrée (`--color-texte-secondaire` renvoie à `--primitif-brume-300`, et un troisième texte, `--color-texte-discret`, a été ajouté).

Constats de l'alignement, détaillés dans `ARCHITECTURE.md` :

- Les seize contrats de dépendances passent (138 modules, 372 dépendances) mais ne disent rien de F-004 : la frontière des composants de présentation et l'exclusion de la page de démonstration ne sont tenues par aucun d'eux (essai sur une copie jetable).
- Bout en bout relancé : `2 failed`, `41 passed` ; le scénario F-004-AC24 à 360 et 768 est instable (deux échecs sur neuf relances), par une égalité stricte de hauteurs mesurées.

Règles proposées au dev pour `.dependency-cruiser.cjs`, fichier protégé. Essayées sur une copie jetable de `HEAD` : aucune violation sur le code livré, et chacune refuse l'import fautif qui la concerne.

```js
{
  name: "web-composants-de-presentation",
  severity: "error",
  comment:
    "F-004 : un composant de présentation n'importe que son dossier et react (ni document, ni session, ni navigation, ni messages).",
  from: { path: "^apps/web/src/interface/composants/" },
  to: { pathNot: ["^apps/web/src/interface/composants/", "(^|/)node_modules/react/"] },
},
{
  name: "web-demonstration-hors-production",
  severity: "error",
  comment: "F-004-AC50 : hors de la page de démonstration, aucun fichier de src/ ne l'importe.",
  from: { path: "^apps/web/src/", pathNot: "^apps/web/src/demonstration/" },
  to: { path: "^apps/web/src/demonstration/" },
},
{
  name: "web-demonstration-liste-blanche",
  severity: "error",
  comment:
    "F-004-AC50 : la page de démonstration n'importe qu'elle-même, les composants de présentation, les textes de l'interface, les styles, react et react-dom.",
  from: { path: "^apps/web/src/demonstration/" },
  to: {
    pathNot: [
      "^apps/web/src/demonstration/",
      "^apps/web/src/interface/composants/",
      "^apps/web/src/interface/messages\\.ts$",
      "^apps/web/src/styles/",
      "(^|/)node_modules/(react|react-dom)/",
    ],
  },
},
```

La feuille d'entrée désigne `demonstration/*.classes.ts` par un `@source` : ce n'est pas un import, aucune de ces règles ne le voit, et les classes de la page restent dans la feuille de production.

Suite (2026-10-09) : le dev a ajouté ces trois règles en `e4f2399` (dix-neuf contrats ; la liste blanche de la démonstration admet en plus `interface/raccourcis.ts`), et les défauts de structure relevés à l'alignement ont été corrigés par `agent-frontend` en `c230381` : un seul composant `Coquille` rendu par l'application et par la page de démonstration, plus aucun texte recopié par la page, un nom par chose (`CheminDePage`, `RepliDeRangee`, `CadreDeBarre.tsx`, `BoutonIcone.tsx`), `Bouton`, `touches` et `portee` supprimés, requête de largeur gardée par montage, une seule aide de graphe pour les tests de F-004, scénario F-004-AC24 stabilisé. Sont reportés : `interface/pages.ts` à deux rôles (parcours de l'arborescence et adresse d'une page), le sélecteur `li a[href]` par lequel le tiroir reconnaît le choix d'une page, et les deux propriétés `menuOuvert` et `menu` de `Rangee`. `ARCHITECTURE.md` a été réaligné sur `c230381`.

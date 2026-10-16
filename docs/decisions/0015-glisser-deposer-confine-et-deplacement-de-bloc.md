# ADR-0015 — Glisser-déposer : dnd-kit (ancienne famille) confiné à `apps/web/src/glisser/`, déplacement de bloc par retrait et réinsertion sans identifiant

Statut : proposé
Date : 2026-10-16

## Contexte et problème

F-006 (`specs/F-006.md`, validée) fait glisser les pages de la barre latérale et les blocs d'une page. Deux décisions se défont mal.

1. La bibliothèque de glisser-déposer de la barre latérale. La fiche du projet nomme dnd-kit, et F-020 (kanban) réutilisera le module qui l'emploie. Deux familles existent (veille du 2026-10-08, `MEMORY/VEILLE.md`, « dnd-kit ») : l'ancienne (`@dnd-kit/core` 6.3.1, `@dnd-kit/sortable` 10.0.0, `@dnd-kit/utilities` 3.2.2, MIT), stable mais sans aucune publication depuis décembre 2024 ; la nouvelle (`@dnd-kit/react` 0.5.0), en 0.x, qui échoue à l'import sous jsdom et injecte une feuille de style. Le choix entre dans le code de chaque écran qui glisse, et F-020 en hérite.
2. La forme d'un déplacement de bloc dans le document de page. Yjs ne déplace pas un nœud : la liaison de Tiptap traduit un déplacement en un retrait suivi d'une insertion (ADR-0009, « Conséquences »). Sans identifiant de bloc, trois comportements sont acquis entre répliques : une modification concurrente du bloc déplacé est perdue, deux déplacements concurrents le dupliquent, une suppression concurrente est sans effet (F-006 H1, AC24 à AC26). Ajouter des identifiants changerait le format du document de page (version, application ancienne exclue).

## Options étudiées

Bibliothèque de la barre latérale :

- A. **Ancienne famille dnd-kit, confinée derrière un module dont l'interface n'expose aucun de ses types** (retenue). Seule famille exécutée sans friction sous React 19 en mode strict et sous jsdom ; aucune feuille injectée ; annonces en anglais remplaçables par ses options.
- B. Nouvelle famille `@dnd-kit/react` 0.x. Écartée : rupture possible à chaque mineure, `ResizeObserver` et `document.getAnimations` à fournir dans la préparation des tests (fichier protégé), feuille de style hors des contrôles de F-004.
- C. Glisser-déposer natif du navigateur écrit dans l'application. Écarté pour F-006 : capteur clavier, annonces et placement à écrire et à prouver ; il reste le remplaçant naturel de A, derrière la même interface.

Déplacement d'un bloc :

- a. **Une opération du module d'édition qui retire le bloc et le réinsère dans une seule transaction de l'éditeur, donc une seule mise à jour Yjs, sans identifiant de bloc ; le geste et le clavier y passent tous deux** (retenue).
- b. Identifiants de bloc (extension `unique-id`). Écartée par la spec (H1) : version du format élevée, extension non éprouvée par la veille avec la collaboration, et la perte de saisie concurrente demeure.
- c. Laisser le lâcher de la poignée au dépôt d'origine de ProseMirror et écrire à part le déplacement au clavier. Écartée : deux chemins pour un même effet, dont un seul prouvé sous Vitest (F-006-AC16).

## Décision

- **Module `apps/web/src/glisser/`** : seul importateur de `@dnd-kit/core`, `@dnd-kit/sortable` et `@dnd-kit/utilities`, en versions exactes. Il n'importe que lui-même, `react` et ces trois paquets. Son interface, `index.ts`, n'expose que des types de React, du DOM et des chaînes : `ListeGlissable`, `useElementGlissable`, `ZoneDeDepot` (`avant`, `apres`, `dans`), `AnnoncesDuGlisser`, `TouchesDuGlisser`. Il ne porte que le geste : la destination (fonction pure `interface/destination-de-page.ts`, sans aucun import), l'appel de `deplacerPage`, les textes et les commandes au clavier sont à l'application. Le détail est dans `docs/decisions/F-006-conception.md`.
- **Contrats** (à commiter par le dev, texte dans la note de conception) : `dnd-kit-confine` (aucun autre fichier, tests compris, n'importe `@dnd-kit/*`), `web-glisser-liste-blanche`, `web-glisser-par-son-interface`, `web-destination-pure` ; `glisser` rejoint les modules exclus de `web-src-liste-blanche`.
- **Opération de déplacement de bloc** : `deplacerLeBloc(editeur, de, vers)` dans `apps/web/src/edition/`, indices parmi les blocs de premier niveau. Retrait et insertion dans une transaction de l'éditeur, faite de deux `ReplaceStep` ; rien n'est émis quand la place ne change pas ; le gestionnaire d'annulation de la liaison cesse de capturer avant et après, pour que l'annulation ne défasse que le déplacement. Le lâcher de la poignée est intercepté (`handleDrop`) et ramené à cette opération ; un fichier survolé ou lâché est refusé par `handleDOMEvents` (`dragenter`, `dragover`, `drop`), lecture seule comprise ; un contenu extérieur garde le chemin du collage. Un raccourci sans destination ne déplace rien et est annoncé « indisponible ».
- **Poignée et curseur de dépôt** : `@tiptap/extension-drag-handle` et `-react`, `@tiptap/extension-node-range`, `Dropcursor` de `@tiptap/extensions`, tous en 3.31.4 et confinés au module d'édition (`edition-confinee`, liste blanche élargie). `@floating-ui/dom` entre au verrou par la poignée (1.8.0, déjà résolue) sans qu'aucun fichier ne l'importe.
- **Poignée au bloc du curseur** (F-006-AC14) : la poignée de Tiptap ne suit que le pointeur ; l'application rend la même poignée, non glissable, au bloc du curseur tant que l'éditeur a le focus et que celle de Tiptap ne montre rien (`apps/web/src/edition/poignee.ts`) ; activée, elle sélectionne le bloc et mène aux commandes « Monter le bloc » et « Descendre le bloc » de la barre de blocs. Aucune poignée sur écran étroit ni sous pointeur imprécis : le bloc s'y déplace par la barre de blocs et le clavier.
- **Format** : aucun nœud, attribut, marque ni identifiant ajouté ; aucune version élevée par un déplacement.

## Conséquences

- L'ancienne famille dnd-kit peut ne plus recevoir de correctif, ni de compatibilité avec une version future de React. La remplacer (option B devenue stable, ou C) ne touche que `src/glisser/` tant que son interface reste celle-ci ; F-020 étendra cette interface (plusieurs conteneurs) sans y laisser entrer de type de la bibliothèque.
- Les limites de convergence d'un bloc déplacé (saisie perdue, bloc dupliqué, suppression sans effet) sont des constats figés par des tests, pas des garanties : elles dépendent de `@tiptap/y-tiptap` et peuvent changer avec elle. Les lever demanderait des identifiants de bloc, donc un changement du format du document de page et une version de plus.
- La poignée de Tiptap s'enregistre après la création de l'éditeur (`registerPlugin`) ; constaté sans mise à jour Yjs (essai E5 de la note de conception, puis tests de F-006-AC14).
- Le geste au pointeur sur un bloc n'est offert qu'aux écrans larges sous pointeur fin.
- Écrit le 2026-10-16 avant le code et relu après lui (`eb01a5f`, puis après les correctifs `7f42f60` et `3135f66`) : les écarts du code avec la note de conception sont datés dans sa « Note de fin ».
- Alt+Maj+Flèche haut et bas sont pris dans l'éditeur : sous macOS, l'extension de la sélection par paragraphe au clavier n'y existe plus (F-006 H5). Changer la combinaison ne touche que `interface/raccourcis.ts`.
- `deplacerPage` a un appelant de production pour la première fois : l'ADR-0007 (« ni `deplacerPage` (hors périmètre de F-002) ») sera amendé à l'alignement d'`ARCHITECTURE.md`.

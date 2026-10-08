# ARCHITECTURE — notionLike

Dernière mise à jour : 2026-10-08

Ce fichier décrit le code présent dans le dépôt, pas une cible. Les décisions sont dans `docs/decisions/`, les intentions dans `specs/` et `ROADMAP.md`.

## Modules réels et dépendances

Aucun module applicatif n'existe à ce jour : `apps/` et `packages/` sont vides.

Le dépôt est un workspace pnpm (`apps/*`, `packages/*`) qui ne contient que l'outillage : TypeScript, ESLint, Prettier, Vitest, dependency-cruiser.

Contrats de dépendances en vigueur (`.dependency-cruiser.cjs`, vérifiés par `pnpm contrats`), sans code auquel s'appliquer pour l'instant :

- `pas-de-cycle` : aucune dépendance cyclique.
- `domaine-pur` : un dossier `domain` ne dépend ni de l'infrastructure ni de l'interface.
- `paquets-sans-apps` : un paquet de `packages/` ne dépend jamais d'une application.
- `apps-isolees` : deux applications ne s'importent pas.
- `document-sans-reseau-ni-base` : `packages/document` ne dépend ni de `packages/db` ni de `packages/contrats`.

## Flux de synchronisation

Aucun : ni document Yjs, ni persistance, ni serveur dans le dépôt.

## Menaces du produit

Le dépôt ne contient encore ni donnée, ni point d'entrée, ni parade. Cette section fixe ce qui est à protéger et les abus à couvrir ; elle sera complétée à mesure que le code arrive, chaque parade citant alors le fichier qui la porte.

Actifs : le contenu des espaces (pages, tables), les comptes nominatifs (courriel, nom ; RGPD), les droits d'accès aux espaces.

Acteurs : membre d'un espace ; ancien membre ; titulaire d'un compte sans droit sur l'espace visé ; inconnu sans compte.

| Abus plausible                                              | Parade dans le code à ce jour |
| ----------------------------------------------------------- | ----------------------------- |
| Accès à un document d'un autre espace                       | aucune (pas de serveur)       |
| Membre retiré qui garde une copie locale                    | aucune (pas de client)        |
| Mise à jour de synchronisation forgée ou géante             | aucune (pas de document)      |
| Invitation rejouée                                          | aucune (pas d'invitation)     |
| Contenu de page piégé (titre, bloc, lien interprété à tort) | aucune (pas d'affichage)      |

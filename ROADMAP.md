# ROADMAP — notionLike

Dernière mise à jour : 2026-10-08

Source du besoin : `.agents/fiche.yaml`. Seule F-001 a une spec ; les titres, tiers et dépendances des autres features sont une proposition, précisée à l'écriture de chaque spec.

Chemin critique (collaboration temps réel, la chaîne la plus longue) :

- côté client : F-001 → F-002 → F-003 → F-013 ;
- côté serveur : F-008 → F-009 → F-011 → F-012 → F-013.

Les deux chaînes sont indépendantes jusqu'à F-013 et peuvent avancer en alternance. F-015, F-016, F-022 et F-025 attendent F-013.

## En cours

- [ ] F-001 Arborescence des pages d'un espace (modèle Yjs, `packages/document`) — tier: structurel — dépend de: rien — agents: agent-frontend — spec: specs/F-001.md (brouillon, à valider par le dev)

## À faire (ordonné)

- [ ] F-002 Application web locale : coquille `apps/web`, barre latérale des pages, persistance IndexedDB, premier test de bout en bout — tier: structurel — dépend de: F-001 — agents: agent-frontend — spec: à écrire
- [ ] F-003 Éditeur de page : paragraphes, titres, listes, enregistrés sur l'appareil — tier: structurel — dépend de: F-002 — agents: agent-frontend — spec: à écrire
- [ ] F-004 Identité visuelle sombre : jetons de design, dégradés, animations de base — tier: structurel — dépend de: F-002 — agents: agent-frontend — spec: à écrire
- [ ] F-005 Bloc code et commandes slash — tier: standard — dépend de: F-003 — agents: agent-frontend — spec: à écrire
- [ ] F-006 Glisser-déposer des blocs et des pages — tier: structurel — dépend de: F-003 — agents: agent-frontend — spec: à écrire
- [ ] F-007 Corbeille : restauration et suppression définitive d'une page — tier: standard — dépend de: F-002 — agents: agent-frontend — spec: à écrire
- [ ] F-008 Socle serveur : `apps/server`, PostgreSQL sous Docker Compose, `packages/db`, `packages/contrats`, point de santé — tier: structurel — dépend de: rien — agents: agent-devops, agent-bdd, agent-backend — spec: à écrire
- [ ] F-009 Comptes et sessions côté serveur (better-auth) — tier: structurel — dépend de: F-008 — agents: agent-bdd, agent-backend — spec: à écrire
- [ ] F-010 Écrans d'inscription, de connexion et de déconnexion — tier: structurel — dépend de: F-002, F-009 — agents: agent-frontend — spec: à écrire
- [ ] F-011 Espaces, membres, invitations et droits (API REST) — tier: structurel — dépend de: F-009 — agents: agent-bdd, agent-backend — spec: à écrire
- [ ] F-012 Synchronisation serveur des documents : Hocuspocus, stockage des mises à jour Yjs, autorisation par espace — tier: structurel — dépend de: F-011 — agents: agent-bdd, agent-backend — spec: à écrire
- [ ] F-013 Synchronisation côté client : connexion, reprise après hors ligne, état de synchronisation visible — tier: structurel — dépend de: F-003, F-010, F-012 — agents: agent-frontend — spec: à écrire
- [ ] F-014 Écrans des espaces, des membres et des invitations — tier: standard — dépend de: F-010, F-011 — agents: agent-frontend — spec: à écrire
- [ ] F-015 Présence et curseurs des autres membres — tier: standard — dépend de: F-013 — agents: agent-frontend — spec: à écrire
- [ ] F-016 Commentaires sur une page — tier: structurel — dépend de: F-013 — agents: agent-frontend — spec: à écrire
- [ ] F-017 Modèle de table (Yjs, `packages/document`) : colonnes typées, lignes — tier: structurel — dépend de: F-001 — agents: agent-frontend — spec: à écrire
- [ ] F-018 Vue tableau d'une base de données — tier: structurel — dépend de: F-002, F-017 — agents: agent-frontend — spec: à écrire
- [ ] F-019 Filtres et tris d'une vue — tier: standard — dépend de: F-018 — agents: agent-frontend — spec: à écrire
- [ ] F-020 Vue kanban — tier: standard — dépend de: F-006, F-018 — agents: agent-frontend — spec: à écrire
- [ ] F-021 Vue calendrier — tier: standard — dépend de: F-018 — agents: agent-frontend — spec: à écrire
- [ ] F-022 Bloc image : fichier disponible hors ligne, téléversement à la reconnexion — tier: structurel — dépend de: F-003, F-013 — agents: agent-bdd, agent-backend, agent-frontend — spec: à écrire
- [ ] F-023 PWA installable : coquille servie hors ligne, mise à jour de version — tier: structurel — dépend de: F-002 — agents: agent-frontend, agent-devops — spec: à écrire
- [ ] F-024 Raccourcis clavier et palette de commandes — tier: standard — dépend de: F-003 — agents: agent-frontend — spec: à écrire
- [ ] F-025 RGPD : export des données d'un compte, suppression d'un compte — tier: structurel — dépend de: F-011, F-013 — agents: agent-bdd, agent-backend, agent-frontend — spec: à écrire

Notes d'ordonnancement :

- Aucune feature n'est `trivial` : un changement trivial n'a ni spec ni ligne ici.
- F-002 est le premier écran : Playwright est à installer par le dev avant elle. Stryker reste « envisagé plus tard » (fiche), non planifié.
- F-021 passe `structurel` si elle demande une bibliothèque de calendrier ; F-020 aussi si elle ne peut pas réutiliser le glisser-déposer de F-006.
- Chaque feature qui crée un paquet ou une application (F-001, F-002, F-008) attend du dev le squelette du paquet (`package.json` avec ses scripts, `vitest.config.*`).

## Refactors planifiés (par blocs)

Aucun.

Dette ouverte, non planifiée : D-001 (pas de CI ni de branche protégée). Elle reste ouverte tant que le dev n'a pas choisi de plateforme git ; aucune feature de cette ROADMAP ne la résorbe.

## Terminé (lien PROJECT_LOG)

Aucune feature terminée.

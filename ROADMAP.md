# ROADMAP — notionLike

Dernière mise à jour : 2026-10-08

Source du besoin : `.agents/fiche.yaml`. Cinq features ont une spec : F-001 (validée), F-002, F-008, F-009 et F-017 (brouillons alignés sur la veille du 2026-10-08, à valider par le dev). Les titres, tiers et dépendances des autres features sont une proposition, précisée à l'écriture de chaque spec.

Chemin critique (collaboration temps réel, la chaîne la plus longue) :

- côté client : F-001 → F-002 → F-003 → F-013 ;
- côté serveur : F-008 → F-009 → F-011 → F-012 → F-013.

Les deux chaînes sont indépendantes jusqu'à F-013 et peuvent avancer en alternance. F-015, F-016, F-022 et F-025 attendent F-013. F-026 et F-027 sont hors du chemin critique.

## En cours

- [ ] F-001 Arborescence des pages d'un espace (modèle Yjs, `packages/document`) — tier: structurel — dépend de: rien — agents: agent-veille, agent-architecte-conception, agent-frontend — spec: specs/F-001.md (validée)

## À faire (ordonné)

- [ ] F-002 Application web locale : coquille `apps/web`, barre latérale des pages, persistance IndexedDB, premier test de bout en bout — tier: structurel — dépend de: F-001 — agents: agent-frontend — spec: specs/F-002.md (brouillon, à valider par le dev)
- [ ] F-003 Éditeur de page : paragraphes, titres, listes, enregistrés sur l'appareil — tier: structurel — dépend de: F-002 — agents: agent-frontend — spec: à écrire
- [ ] F-004 Identité visuelle sombre : jetons de design, dégradés, animations de base — tier: structurel — dépend de: F-002 — agents: agent-frontend — spec: à écrire
- [ ] F-005 Bloc code et commandes slash — tier: standard — dépend de: F-003 — agents: agent-frontend — spec: à écrire
- [ ] F-006 Glisser-déposer des blocs et des pages — tier: structurel — dépend de: F-003 — agents: agent-frontend — spec: à écrire
- [ ] F-007 Corbeille : restauration et suppression définitive d'une page — tier: standard — dépend de: F-002 — agents: agent-frontend — spec: à écrire
- [ ] F-008 Socle serveur : `apps/server`, PostgreSQL sous Docker Compose, `packages/db`, `packages/contrats` — tier: structurel — dépend de: rien — agents: agent-devops, agent-bdd, agent-backend — spec: specs/F-008.md (brouillon, à valider par le dev)
- [ ] F-009 Comptes et sessions côté serveur (better-auth) — tier: structurel — dépend de: F-008 — agents: agent-bdd, agent-backend — spec: specs/F-009.md (brouillon, à valider par le dev)
- [ ] F-010 Écrans d'inscription, de connexion et de déconnexion — tier: structurel — dépend de: F-002, F-009 — agents: agent-frontend — spec: à écrire
- [ ] F-011 Espaces, membres, invitations et droits (API REST) — tier: structurel — dépend de: F-009 — agents: agent-bdd, agent-backend — spec: à écrire
- [ ] F-012 Synchronisation serveur des documents : Hocuspocus, stockage des mises à jour Yjs, autorisation par espace — tier: structurel — dépend de: F-011 — agents: agent-bdd, agent-backend — spec: à écrire
- [ ] F-013 Synchronisation côté client : connexion, reprise après hors ligne, état de synchronisation visible — tier: structurel — dépend de: F-003, F-010, F-012 — agents: agent-frontend — spec: à écrire
- [ ] F-014 Écrans des espaces, des membres et des invitations — tier: standard — dépend de: F-010, F-011 — agents: agent-frontend — spec: à écrire
- [ ] F-015 Présence et curseurs des autres membres — tier: standard — dépend de: F-013 — agents: agent-frontend — spec: à écrire
- [ ] F-016 Commentaires sur une page — tier: structurel — dépend de: F-013 — agents: agent-frontend — spec: à écrire
- [ ] F-017 Modèle de table (Yjs, `packages/document`) : colonnes typées, lignes, cellules — tier: structurel — dépend de: F-001 — agents: agent-frontend — spec: specs/F-017.md (brouillon, à valider par le dev)
- [ ] F-018 Vue tableau d'une base de données — tier: structurel — dépend de: F-002, F-017 — agents: agent-frontend — spec: à écrire
- [ ] F-019 Filtres et tris d'une vue — tier: standard — dépend de: F-018 — agents: agent-frontend — spec: à écrire
- [ ] F-020 Vue kanban — tier: standard — dépend de: F-006, F-018 — agents: agent-frontend — spec: à écrire
- [ ] F-021 Vue calendrier — tier: standard — dépend de: F-018 — agents: agent-frontend — spec: à écrire
- [ ] F-022 Bloc image : fichier disponible hors ligne, téléversement à la reconnexion — tier: structurel — dépend de: F-003, F-013 — agents: agent-bdd, agent-backend, agent-frontend — spec: à écrire
- [ ] F-023 PWA installable : coquille servie hors ligne, mise à jour de version — tier: structurel — dépend de: F-002 — agents: agent-frontend, agent-devops — spec: à écrire
- [ ] F-024 Raccourcis clavier et palette de commandes — tier: standard — dépend de: F-003 — agents: agent-frontend — spec: à écrire
- [ ] F-025 RGPD : export des données d'un compte, suppression d'un compte — tier: structurel — dépend de: F-011, F-013 — agents: agent-bdd, agent-backend, agent-frontend — spec: à écrire
- [ ] F-026 Courriels : vérification d'adresse et réinitialisation du mot de passe — tier: structurel — dépend de: F-009 — agents: agent-devops, agent-backend — spec: à écrire
- [ ] F-027 Gestion du compte : changement de mot de passe et de nom, liste et révocation des sessions — tier: standard — dépend de: F-009, F-010 — agents: agent-backend, agent-frontend — spec: à écrire

Notes d'ordonnancement :

- Aucune feature n'est `trivial` : un changement trivial n'a ni spec ni ligne ici.
- Prochaines validations attendues du dev : F-002 et F-008 (têtes des deux chaînes), puis F-009 et F-017. Une spec retouchée après validation impose une revalidation.
- F-002 est le premier écran : Playwright est à installer par le dev avant elle. Stryker reste « envisagé plus tard » (fiche), non planifié.
- F-021 passe `structurel` si elle demande une bibliothèque de calendrier ; F-020 aussi si elle ne peut pas réutiliser le glisser-déposer de F-006.
- Chaque feature qui crée un paquet ou une application (F-001, F-002, F-008) attend du dev le squelette du paquet (`package.json` avec ses scripts, `vitest.config.*`).
- F-026 et F-027 sont placées en fin de liste faute d'être sur le chemin critique ; elles peuvent remonter dès que leurs dépendances sont livrées. F-026 est `structurel` (premier envoi de courriel : dépendance et service nouveaux) ; l'écran de saisie du nouveau mot de passe lui ajoutera F-010 en dépendance si elle le porte. F-027 ouvre des routes natives de better-auth que F-009 garde fermées : c'est un changement de contrat, avec son test de couture.

Ce que les specs écrites reportent sur les features à venir (à reprendre à l'écriture de chacune) :

- F-006 porte le premier appel de `deplacerPage` depuis un écran (F-002 ne l'appelle pas).
- F-007 garde l'écran de la corbeille, la restauration et la suppression définitive (F-002 ne fait que mettre à la corbeille).
- F-011 accepte un identifiant d'espace fourni par le client (celui de l'espace local de F-002) et tranche l'inscription ouverte ou sur invitation (F-009 livre une inscription ouverte).
- F-012 porte les contrats WebSocket de `packages/contrats` et l'authentification de la connexion WebSocket par le cookie de session de F-009.
- F-013 porte la diffusion en direct entre onglets et l'adoption de l'identifiant de l'espace local par le serveur.
- F-018 porte le rattachement d'une table à l'arborescence des pages et la persistance du document de table (F-017 ne livre que le modèle).
- F-025 porte la purge des sessions expirées (F-009 les refuse sans les effacer).

Manque signalé, sans feature : le déploiement hors du poste du dev (TLS, proxy inverse, sauvegarde et restauration de la base) n'est couvert par aucune ligne de cette ROADMAP. F-008 et F-009 le laissent hors périmètre ; F-009 en dépend pour un usage réel (cookie `Secure`, `PROXYS_DE_CONFIANCE`). Le dev décide s'il devient une feature.

## Refactors planifiés (par blocs)

Aucun.

Dette ouverte, non planifiée : D-001 (pas de CI ni de branche protégée). Elle reste ouverte tant que le dev n'a pas choisi de plateforme git ; aucune feature de cette ROADMAP ne la résorbe.

Dettes proposées, à ouvrir par le dev à la validation des specs concernées (elles ne sont inscrites nulle part ailleurs à ce jour) :

- D-002 Tests d'intégration du serveur sur PGlite et non sur un PostgreSQL réel — origine : F-008 (H5) — impact : concurrence, pool, droits et pilote `pg` ne sont vérifiés que par le script de fumée manuel de F-008-AC19 ; à lever avec D-001 (une CI peut lancer PostgreSQL).
- D-003 Tests de bout en bout hors des hooks — origine : F-002 (H9) — impact : `TEST_CMD` ne lance que Vitest, donc F-002-AC23, AC4 et AC19 ne sont tenus que par un lancement manuel ; à lever quand le dev branche Playwright dans `.agents/outils.env`.

## Terminé (lien PROJECT_LOG)

Aucune feature terminée.

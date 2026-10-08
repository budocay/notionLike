# ROADMAP — notionLike

Dernière mise à jour : 2026-10-08

Source du besoin : `.agents/fiche.yaml`. Onze features ont une spec : F-001 (validée par le dev, commit de validation sur la branche `F-001`) et dix brouillons à valider par le dev : F-002, F-003, F-004, F-007, F-008, F-009, F-010, F-011, F-012 et F-017. Les titres, tiers et dépendances des dix-sept autres features sont une proposition, précisée à l'écriture de chaque spec.

Chemin critique (collaboration temps réel, la chaîne la plus longue) :

- côté client : F-001 → F-002 → F-003 → F-013 ;
- côté serveur : F-008 → F-009 → F-011 → F-012 → F-013.

Les deux chaînes se rejoignent dès F-012, qui dépend de F-011 et de F-001 (son test de couture lit le document d'espace par `@notionlike/document`) : F-001 est donc en amont des deux. Entre F-001 et F-012 elles avancent en alternance ; F-013 attend F-003, F-010 et F-012. F-015, F-016, F-022 et F-025 attendent F-013. F-026, F-027 et F-028 sont hors du chemin critique.

État au 2026-10-08 :

- F-001 est en escalade : sa conception a été rejetée trois fois par le gate architecture ; les corrections sont appliquées ; la reprise par le dev est attendue (lui seul inscrit la reprise au journal des gates). Tout le chemin critique en dépend.
- F-008 a sa conception écrite (`docs/decisions/F-008-conception.md`, ADR-0004 à 0006 proposés), préparée avant la validation de sa spec : elle attend cette validation et n'a pas été présentée au gate.
- Aucun code applicatif n'est livré.

## En cours

- [ ] F-001 Arborescence des pages d'un espace (modèle Yjs, `packages/document`) — tier: structurel — dépend de: rien — agents: agent-veille, agent-architecte-conception, agent-frontend — spec: specs/F-001.md (validée) — état : escalade, conception rejetée trois fois par le gate architecture, reprise par le dev attendue

## À faire (ordonné)

- [ ] F-002 Application web locale : coquille `apps/web`, barre latérale des pages, persistance IndexedDB, premier test de bout en bout — tier: structurel — dépend de: F-001 — agents: agent-veille, agent-architecte-conception, agent-frontend — spec: specs/F-002.md (brouillon, à valider par le dev)
- [ ] F-003 Éditeur de page : paragraphes, titres, listes, enregistrés sur l'appareil — tier: structurel — dépend de: F-002 — agents: agent-veille, agent-architecte-conception, agent-frontend — spec: specs/F-003.md (brouillon, à valider par le dev)
- [ ] F-004 Identité visuelle sombre : jetons de design, dégradés, animations de base — tier: structurel — dépend de: F-002 — agents: agent-veille, agent-architecte-conception, agent-frontend — spec: specs/F-004.md (brouillon, à valider par le dev)
- [ ] F-005 Bloc code et commandes slash — tier: structurel — dépend de: F-003 — agents: agent-veille, agent-architecte-conception, agent-frontend — spec: à écrire
- [ ] F-006 Glisser-déposer des blocs et des pages — tier: structurel — dépend de: F-003 — agents: agent-veille, agent-architecte-conception, agent-frontend — spec: à écrire
- [ ] F-007 Corbeille : écran de la corbeille, restauration et suppression définitive d'une page — tier: structurel — dépend de: F-002 — agents: agent-veille, agent-architecte-conception, agent-frontend — spec: specs/F-007.md (brouillon, à valider par le dev)
- [ ] F-008 Socle serveur : `apps/server`, PostgreSQL sous Docker Compose, `packages/db`, `packages/contrats` — tier: structurel — dépend de: rien — agents: agent-veille, agent-architecte-conception, agent-devops, agent-bdd, agent-backend — spec: specs/F-008.md (brouillon, à valider par le dev) — état : conception écrite, en attente de la validation de la spec
- [ ] F-009 Comptes et sessions côté serveur (better-auth) — tier: structurel — dépend de: F-008 — agents: agent-veille, agent-architecte-conception, agent-bdd, agent-backend — spec: specs/F-009.md (brouillon, à valider par le dev)
- [ ] F-010 Écrans d'inscription, de connexion et de déconnexion — tier: structurel — dépend de: F-002, F-009 — agents: agent-veille, agent-architecte-conception, agent-frontend — spec: specs/F-010.md (brouillon, à valider par le dev)
- [ ] F-011 Espaces, membres, invitations et droits (API REST) — tier: structurel — dépend de: F-009 — agents: agent-veille, agent-architecte-conception, agent-bdd, agent-backend — spec: specs/F-011.md (brouillon, à valider par le dev)
- [ ] F-012 Synchronisation serveur des documents : Hocuspocus, stockage des instantanés Yjs, autorisation par espace — tier: structurel — dépend de: F-011, F-001 — agents: agent-veille, agent-architecte-conception, agent-bdd, agent-backend — spec: specs/F-012.md (brouillon, à valider par le dev)
- [ ] F-013 Synchronisation côté client : connexion, reprise après hors ligne, état de synchronisation visible — tier: structurel — dépend de: F-003, F-010, F-012 — agents: agent-veille, agent-architecte-conception, agent-frontend — spec: à écrire
- [ ] F-014 Écrans des espaces, des membres et des invitations — tier: standard — dépend de: F-010, F-011 — agents: agent-frontend — spec: à écrire
- [ ] F-015 Présence et curseurs des autres membres — tier: standard — dépend de: F-013 — agents: agent-frontend — spec: à écrire
- [ ] F-016 Commentaires sur une page — tier: structurel — dépend de: F-013 — agents: agent-veille, agent-architecte-conception, agent-frontend — spec: à écrire
- [ ] F-017 Modèle de table (Yjs, `packages/document`) : colonnes typées, lignes, cellules — tier: structurel — dépend de: F-001 — agents: agent-veille, agent-architecte-conception, agent-frontend — spec: specs/F-017.md (brouillon, à valider par le dev)
- [ ] F-018 Vue tableau d'une base de données — tier: structurel — dépend de: F-002, F-017 — agents: agent-veille, agent-architecte-conception, agent-frontend — spec: à écrire
- [ ] F-019 Filtres et tris d'une vue — tier: standard — dépend de: F-018 — agents: agent-frontend — spec: à écrire
- [ ] F-020 Vue kanban — tier: standard — dépend de: F-006, F-018 — agents: agent-frontend — spec: à écrire
- [ ] F-021 Vue calendrier — tier: standard — dépend de: F-018 — agents: agent-frontend — spec: à écrire
- [ ] F-022 Bloc image : fichier disponible hors ligne, téléversement à la reconnexion — tier: structurel — dépend de: F-003, F-013 — agents: agent-veille, agent-architecte-conception, agent-bdd, agent-backend, agent-frontend — spec: à écrire
- [ ] F-023 PWA installable : coquille servie hors ligne, mise à jour de version — tier: structurel — dépend de: F-002 — agents: agent-veille, agent-architecte-conception, agent-frontend, agent-devops — spec: à écrire
- [ ] F-024 Raccourcis clavier et palette de commandes — tier: standard — dépend de: F-003 — agents: agent-frontend — spec: à écrire
- [ ] F-025 RGPD : export des données d'un compte, suppression d'un compte — tier: structurel — dépend de: F-011, F-013 — agents: agent-veille, agent-architecte-conception, agent-bdd, agent-backend, agent-frontend — spec: à écrire
- [ ] F-026 Courriels : vérification d'adresse et réinitialisation du mot de passe — tier: structurel — dépend de: F-009 — agents: agent-veille, agent-architecte-conception, agent-devops, agent-backend — spec: à écrire
- [ ] F-027 Gestion du compte : changement de mot de passe et de nom, liste et révocation des sessions — tier: standard — dépend de: F-009, F-010 — agents: agent-backend, agent-frontend — spec: à écrire
- [ ] F-028 Mise en forme dans le texte : gras, italique, liens — tier: structurel — dépend de: F-003 — agents: agent-veille, agent-architecte-conception, agent-frontend — spec: à écrire

Notes d'ordonnancement :

- Aucune feature n'est `trivial` : un changement trivial n'a ni spec ni ligne ici.
- Toute feature `structurel` commence par `agent-veille` puis `agent-architecte-conception` (skill `pipeline-feature`) : ils figurent en tête de ses agents.
- Prochaines validations attendues du dev, dans l'ordre du chemin critique : F-002 et F-008 (têtes des deux chaînes après F-001), puis F-009, F-003, F-011, F-012 ; ensuite F-017, F-010, F-004 et F-007. Une spec retouchée après validation impose une revalidation.
- F-002 est le premier écran : Playwright est à installer par le dev avant elle. Stryker reste « envisagé plus tard » (fiche), non planifié.
- F-005 passe `structurel` : le bloc code est un nœud ajouté au schéma de l'éditeur, donc une extension du format stocké avec incrément de la version du document de page (F-003, H4), et une dépendance directe nouvelle est probable (coloration syntaxique, utilitaire de suggestion du menu slash).
- F-007 passe `structurel` (sa spec, H11) : contrat public de `@notionlike/document` élargi, premier effacement dans le format du document d'espace. L'amendement de l'ADR-0002 (« aucune entrée n'est jamais supprimée de `pages` ») par `agent-architecte-conception` est un préalable à son code.
- F-028 est nouvelle : aucune ligne ne portait la mise en forme dans le texte, que F-003 laisse hors de son schéma sans marque (F-003, H2). Elle est `structurel` parce qu'elle étend le format stocké (marques ajoutées, version du document de page incrémentée). Elle est placée en fin de liste par son identifiant ; elle peut remonter juste après F-003, et gagne à passer avant F-013 (voir les reports de F-013).
- F-005, F-022 et F-028 étendent chacune le schéma de l'éditeur : chacune incrémente la version du format du document de page et porte le test de couture du format (F-003, H4). Une application qui ne connaît pas la version refuse d'ouvrir le document : la liaison Yjs de Tiptap supprime du document partagé tout contenu que son schéma ignore (veille du 2026-10-08).
- Motion (bibliothèque d'animation de la fiche) n'est pas installée par F-004, qui s'en tient au CSS (F-004, H3). Elle est rattachée à la première feature qui demande une animation de sortie ou de réordonnancement : F-006 ou F-024. F-024 passe alors `structurel` (dépendance directe nouvelle). La mention de F-002 qui rangeait Motion dans F-004 est caduque.
- F-021 passe `structurel` si elle demande une bibliothèque de calendrier ; F-020 aussi si elle ne peut pas réutiliser le glisser-déposer de F-006.
- Chaque feature qui crée un paquet ou une application (F-001, F-002, F-008) attend du dev le squelette du paquet (`package.json` avec ses scripts, `vitest.config.*`). F-003 lui demande en plus `apps/web/vitest.config.ts` (fichier de préparation des tests : quatre fonctions de mise en page manquent à jsdom).
- Listes d'exports de `@notionlike/document` : F-003 (façade du document de page), F-007 (deux opérations de corbeille, un code d'erreur) et F-017 (modèle de table) élargissent toutes trois ce paquet, et chacune a un test de couture qui compare la liste des exports et des codes d'erreur à une liste attendue. Leur ordre de livraison est libre : la dernière livrée met à jour les listes attendues des tests de couture des autres (F-003-AC24, F-007-AC24 et H13).
- F-026 et F-027 sont placées en fin de liste faute d'être sur le chemin critique ; elles peuvent remonter dès que leurs dépendances sont livrées. F-026 est `structurel` (premier envoi de courriel : dépendance et service nouveaux) ; l'écran de saisie du nouveau mot de passe lui ajoutera F-010 en dépendance si elle le porte. F-027 ouvre des routes natives de better-auth que F-009 garde fermées : c'est un changement de contrat, avec son test de couture.

Ce que les specs écrites reportent sur les features à venir (à reprendre à l'écriture de chacune) :

- F-006 :
  - deux déplacements simultanés du même bloc le dupliquent (constaté par la veille : Yjs n'a pas de déplacement, F-003 H1) ;
  - un déplacement de bloc concurrent d'une modification de ce bloc perd cette modification (constaté, F-003 H1) ;
  - F-006 écrit ces deux comportements dans ses critères de convergence et les accepte, ou ajoute des identifiants de bloc, qui étendent le format et ne règlent pas la perte ;
  - le premier appel de `deplacerPage` depuis un écran (F-002 ne l'appelle pas) ; restaurer une page ailleurs qu'à sa place est un déplacement (F-007).
- F-013 :
  - la rencontre de deux versions du schéma sur un même document, dont le cas que F-003 ne garantit pas : version et contenu nouveau reçus dans la même mise à jour pendant que l'éditeur est affiché (non vérifié par la veille ; F-003 H4, F-003-AC29) ; un client de version inférieure ne doit jamais monter l'éditeur sur un document de version supérieure ;
  - la propagation de l'effacement des bases de page aux autres appareils d'un espace synchronisé (F-007 n'efface que sur l'appareil qui supprime) ;
  - l'espace « détaché » après le retrait d'un membre, à dire à l'utilisateur, et l'offre d'effacer sa copie locale (F-011 H2 ; F-010 H4 pour la déconnexion) ;
  - l'adoption de l'espace local par le serveur (appel de `POST /espaces` avec l'identifiant local, F-011 H3) et le nom à lui donner (F-011 H6) ;
  - la correspondance entre les noms des bases IndexedDB (F-002 H3) et les noms de document du serveur (F-012 H2) ;
  - le client qui renvoie en boucle un message trop grand : un appareil dont les modifications hors ligne dépassent la limite de message ne peut pas les envoyer et doit le dire (F-012 H7) ;
  - le relais WebSocket du serveur de développement de Vite (F-012 ; F-010 ne relaie que `/api` en HTTP) ;
  - la diffusion en direct entre onglets (F-002, F-003).
- F-014 :
  - avertir le propriétaire qu'un retrait ne reprend pas ce que le membre a déjà lu (F-011 H2) ;
  - la confirmation de suppression d'un espace (F-011 H9) ;
  - l'aperçu d'une invitation avant acceptation, qui est un ajout de contrat (F-011).
- F-015 :
  - la confiance dans l'identité annoncée par un message de présence (F-012 se borne à relayer) ;
  - un lecteur peut émettre de la présence (F-012-AC25 la relaie entre toutes les connexions qui ont ouvert le document).
- F-016 : un commentaire ancré par une position relative Yjs ne suit pas un bloc déplacé et perd son texte d'ancrage (constaté par la veille, F-003 H1) ; le stockage des commentaires reste à décider.
- F-018 : le rattachement d'une table à l'arborescence des pages et la persistance du document de table (F-017 ne livre que le modèle).
- F-025 :
  - l'effacement garanti des octets d'une page supprimée : historique Yjs, journal de la persistance, autres appareils, serveur, sauvegardes (F-007 H1 ne le garantit pas) ;
  - le balayage des bases de page orphelines laissées par un effacement manqué (F-007-AC21) ;
  - le sort des espaces dont le compte supprimé est le dernier propriétaire (F-011) ;
  - la purge des invitations expirées ou consommées (F-011) et celle des sessions expirées (F-009) ;
  - la suppression côté serveur d'un document de page ou de table isolé, qui demande une route ou un signal nouveau (F-012 : un document n'y disparaît qu'avec son espace) ;
  - l'adresse IP et l'agent utilisateur des sessions dans l'export (F-009 H10).

Manque signalé, sans feature : le déploiement hors du poste du dev (TLS, proxy inverse, sauvegarde et restauration de la base) n'est couvert par aucune ligne de cette ROADMAP. F-008 et F-009 le laissent hors périmètre ; F-009 en dépend pour un usage réel (cookie `Secure`, `PROXYS_DE_CONFIANCE`). Sont à rouvrir avec lui : l'inscription ouverte, que F-011 (H4) n'accepte que parce que le serveur n'est pas exposé ; `wss://` pour le point de synchronisation de F-012 ; le service de l'application et de l'API sous une même origine (F-010). Le dev décide s'il devient une feature.

## Refactors planifiés (par blocs)

Aucun.

Dette ouverte, non planifiée : D-001 (pas de CI ni de branche protégée). Elle reste ouverte tant que le dev n'a pas choisi de plateforme git ; aucune feature de cette ROADMAP ne la résorbe.

Dettes proposées, à ouvrir par le dev à la validation des specs concernées (elles ne sont inscrites nulle part ailleurs à ce jour) :

- D-002 Tests d'intégration du serveur sur PGlite et non sur un PostgreSQL réel — origine : F-008 (H5), étendue par F-011 (H10) et F-012 (H11) — impact : concurrence, pool, droits et pilote `pg` ne sont vérifiés que par le script de fumée manuel de F-008-AC19 ; les volets « en même temps » de F-011-AC17 (dernier propriétaire) et F-011-AC22 (invitation à usage unique) ne sont prouvés que par la présence du verrou et des contraintes, sans concurrence réelle ; la colonne binaire des instantanés de F-012-AC28 n'est pas éprouvée sur un vrai PostgreSQL ; à lever avec D-001 (une CI peut lancer PostgreSQL).
- D-003 Tests de bout en bout hors des hooks — origine : F-002 (H9), étendue aux scénarios de F-003, F-004, F-007 et F-010 — impact : `TEST_CMD` ne lance que Vitest, donc F-002-AC23, AC4 et AC19, F-003-AC28 (seule preuve de la frappe réelle dans l'éditeur), F-004-AC22 (seule preuve du rendu réel), F-007-AC28 et le scénario de F-010 contre le serveur réel (F-010 H8) ne sont tenus que par un lancement manuel ; à lever quand le dev branche Playwright dans `.agents/outils.env`.

## Terminé (lien PROJECT_LOG)

Aucune feature terminée.

# ROADMAP — notionLike

Dernière mise à jour : 2026-10-08

Source du besoin : `.agents/fiche.yaml`. Dix-huit features ont une spec : une validée, F-001 (commit de validation du dev sur la branche `F-001`), et dix-sept brouillons à valider par le dev : F-002 à F-017 et F-028. Restent à écrire les specs de F-018 à F-027 : leurs titres, tiers et dépendances sont une proposition, précisée à l'écriture de chaque spec. Les agents et les dépendances des dix-huit autres sont ceux de l'en-tête de leur spec.

Chemin critique (collaboration temps réel, la chaîne la plus longue) :

- côté client : F-001 → F-002 → F-003 → F-013 ;
- côté serveur : F-008 → F-009 → F-011 → F-012 → F-013 ;
- après la jonction : F-013 → F-014 → F-015.

Les deux chaînes se rejoignent dès F-012, qui dépend de F-011 et de F-001 (son test de couture lit le document d'espace par `@notionlike/document`) : F-001 est donc en amont des deux. Entre F-001 et F-012 elles avancent en alternance ; F-013 attend F-003, F-007, F-010 et F-012. F-014 attend F-013 (et F-010, F-011) ; F-015 attend F-013 et F-004 et se place après F-014, sans dépendre de son code (F-015 H12 : sans F-014, aucun second appareil n'ouvre un espace hors des tests). F-016, F-022 et F-025 attendent F-013. F-028, F-005 et F-006 ne sont pas sur le chemin critique, mais F-028 gagne à passer avant F-013 (voir l'ordre recommandé). F-026 et F-027 sont hors du chemin critique.

État au 2026-10-08 :

- F-001 est en escalade : sa conception a été rejetée trois fois par le gate architecture ; les corrections sont appliquées ; la reprise par le dev est attendue (lui seul inscrit la reprise au journal des gates). Tout le chemin critique en dépend.
- F-008 a sa conception écrite (`docs/decisions/F-008-conception.md`, ADR-0004 à 0006 proposés), préparée avant la validation de sa spec : la spec est à valider par le dev, et la conception n'a pas été présentée au gate.
- Aucun code applicatif n'est livré.

## En cours

- [ ] F-001 Arborescence des pages d'un espace (modèle Yjs, `packages/document`) — tier: structurel — dépend de: rien — agents: agent-veille, agent-architecte-conception, agent-frontend — spec: specs/F-001.md (validée) — état : escalade, conception rejetée trois fois par le gate architecture, corrections appliquées, reprise par le dev attendue

## À faire (ordonné)

- [ ] F-002 Application web locale : coquille `apps/web`, barre latérale des pages, persistance IndexedDB, premier test de bout en bout — tier: structurel — dépend de: F-001 — agents: agent-veille, agent-architecte-conception, agent-frontend — spec: specs/F-002.md (brouillon, à valider par le dev)
- [ ] F-003 Éditeur de page : paragraphes, titres, listes, enregistrés sur l'appareil — tier: structurel — dépend de: F-002 — agents: agent-veille, agent-architecte-conception, agent-frontend — spec: specs/F-003.md (brouillon, à valider par le dev)
- [ ] F-028 Mise en forme dans le texte : gras, italique, liens — tier: structurel — dépend de: F-003 — agents: agent-veille, agent-architecte-conception, agent-frontend — spec: specs/F-028.md (brouillon, à valider par le dev)
- [ ] F-005 Bloc code et commandes slash — tier: structurel — dépend de: F-003 — agents: agent-veille, agent-architecte-conception, agent-frontend — spec: specs/F-005.md (brouillon, à valider par le dev)
- [ ] F-004 Identité visuelle sombre : jetons de design, dégradés, animations de base — tier: structurel — dépend de: F-002 — agents: agent-veille, agent-architecte-conception, agent-frontend — spec: specs/F-004.md (brouillon, à valider par le dev)
- [ ] F-006 Glisser-déposer des blocs et des pages — tier: structurel — dépend de: F-003, F-002 — agents: agent-veille, agent-architecte-conception, agent-frontend — spec: specs/F-006.md (brouillon, à valider par le dev)
- [ ] F-007 Corbeille : écran de la corbeille, restauration et suppression définitive d'une page — tier: structurel — dépend de: F-002 — agents: agent-veille, agent-architecte-conception, agent-frontend — spec: specs/F-007.md (brouillon, à valider par le dev)
- [ ] F-008 Socle serveur : `apps/server`, PostgreSQL sous Docker Compose, `packages/db`, `packages/contrats` — tier: structurel — dépend de: rien — agents: agent-veille, agent-architecte-conception, agent-devops, agent-bdd, agent-backend — spec: specs/F-008.md (brouillon, à valider par le dev) — état : conception écrite, spec à valider par le dev
- [ ] F-009 Comptes et sessions côté serveur (better-auth) — tier: structurel — dépend de: F-008 — agents: agent-veille, agent-architecte-conception, agent-bdd, agent-backend — spec: specs/F-009.md (brouillon, à valider par le dev)
- [ ] F-010 Écrans d'inscription, de connexion et de déconnexion (`apps/web`) — tier: structurel — dépend de: F-002, F-009 — agents: agent-veille, agent-architecte-conception, agent-frontend — spec: specs/F-010.md (brouillon, à valider par le dev)
- [ ] F-011 Espaces, membres, invitations et droits (API REST) — tier: structurel — dépend de: F-009 (F-010 conditionnelle, voir les notes) — agents: agent-veille, agent-architecte-conception, agent-bdd, agent-backend (agent-frontend pour un seul bloc, seulement si F-010 est fusionnée avant) — spec: specs/F-011.md (brouillon, à valider par le dev)
- [ ] F-012 Synchronisation serveur des documents : Hocuspocus, stockage des instantanés Yjs, autorisation par espace — tier: structurel — dépend de: F-011, F-001 — agents: agent-veille, agent-architecte-conception, agent-bdd, agent-backend — spec: specs/F-012.md (brouillon, à valider par le dev)
- [ ] F-013 Synchronisation côté client : connexion au serveur, reprise après hors ligne, état de synchronisation visible — tier: structurel — dépend de: F-003, F-007, F-010, F-012 — agents: agent-veille, agent-architecte-conception, agent-frontend — spec: specs/F-013.md (brouillon, à valider par le dev)
- [ ] F-014 Écrans des espaces, des membres et des invitations (`apps/web`) — tier: structurel — dépend de: F-010, F-011, F-013 — agents: agent-veille, agent-architecte-conception, agent-frontend — spec: specs/F-014.md (brouillon, à valider par le dev)
- [ ] F-015 Présence et curseurs des autres membres — tier: structurel — dépend de: F-013, F-004 — agents: agent-veille, agent-architecte-conception, agent-backend, agent-frontend — spec: specs/F-015.md (brouillon, à valider par le dev)
- [ ] F-016 Commentaires sur une page — tier: structurel — dépend de: F-013 — agents: agent-veille, agent-architecte-conception, agent-frontend — spec: specs/F-016.md (brouillon, à valider par le dev)
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

Notes d'ordonnancement :

- Aucune feature n'est `trivial` : un changement trivial n'a ni spec ni ligne ici.
- Toute feature `structurel` commence par `agent-veille` puis `agent-architecte-conception` (skill `pipeline-feature`) : ils figurent en tête de ses agents.
- Ordre recommandé : la liste ci-dessus, dans l'ordre. F-028 est placée juste après F-003 et avant F-005 (elles prennent ainsi les versions 2 et 3 du document de page), et avant F-013 : la rencontre de deux versions du schéma se règle mieux avant qu'un document circule entre appareils. F-014 suit immédiatement F-013 ; F-015 vient après F-014.
- Prochaines validations attendues du dev, dans l'ordre du chemin critique : F-002 et F-008 (têtes des deux chaînes après F-001), puis F-009, F-003, F-011, F-012 ; puis F-007, F-010 et F-013 ; puis F-014, F-004 et F-015 ; ensuite F-028, F-005, F-006, F-016 et F-017. Une spec retouchée après validation impose une revalidation.
- F-002 est le premier écran : Playwright est à installer par le dev avant elle. Stryker reste « envisagé plus tard » (fiche), non planifié.
- Changements de tier, tranchés par les specs : F-005 `structurel` (nœud ajouté au schéma, version du document de page incrémentée, utilitaire de suggestion du menu slash) ; F-007 `structurel` (contrat public de `@notionlike/document` élargi, premier effacement dans le document d'espace ; l'amendement de l'ADR-0002 par `agent-architecte-conception` est un préalable à son code) ; F-014 `structurel`, et non `standard` (sa spec, « Pourquoi ce tier ») ; F-015 `structurel`, et non `standard` (F-015 H5 : dépendance directe nouvelle, contrat nouveau dans `packages/contrats`, nouveau module d'`apps/web`, contrôle de sécurité ajouté au relais du serveur) ; F-028 `structurel` (marques ajoutées au format stocké).
- F-011 et F-010 : F-011 dépend de F-009 seulement. F-010 est une dépendance conditionnelle : celle des deux qui est fusionnée en second porte, dans `apps/web`, les messages des codes d'erreur que F-011 ajoute (F-011-AC34, F-010-AC16). Si F-010 est déjà fusionnée quand F-011 est codée, F-011 reçoit `agent-frontend` pour ce seul bloc, et `reviewer-frontend` à sa revue.
- F-012 et F-013 : la fabrique d'essai du serveur est livrée par F-012 (F-012-AC36) ; F-013 n'écrit rien dans `apps/server`, et `agent-backend` ne figure pas à ses agents.
- F-012 et F-015 : F-012 se livre en simple relais des messages de présence ; le contrôle d'identité de présence (le serveur vérifie que l'identifiant de compte annoncé est celui de la session de la connexion) est livré par F-015, avec `agent-backend`, et sa réserve est écrite dans F-012-AC25 et F-012 H12 (retouche R1).
- F-021 passe `structurel` si elle demande une bibliothèque de calendrier ; F-020 aussi si elle ne peut pas réutiliser le glisser-déposer de F-006.
- Chaque feature qui crée un paquet ou une application (F-001, F-002, F-008) attend du dev le squelette du paquet (`package.json` avec ses scripts, `vitest.config.*`). F-003 lui demande en plus `apps/web/vitest.config.ts` (fichier de préparation des tests : quatre fonctions de mise en page manquent à jsdom).
- Listes d'exports de `@notionlike/document` : F-003 (façade du document de page), F-007 (deux opérations de corbeille, un code d'erreur), F-016 (opérations sur les commentaires) et F-017 (modèle de table) élargissent ce paquet, et chacune a un test de couture qui compare la liste des exports et des codes d'erreur à une liste attendue. Leur ordre de livraison est libre : la dernière livrée met à jour les listes attendues des tests de couture des autres (F-003-AC24, F-007-AC24 et H13, F-016-AC29).
- F-026 et F-027 sont placées en fin de liste faute d'être sur le chemin critique ; elles peuvent remonter dès que leurs dépendances sont livrées. F-026 est `structurel` (premier envoi de courriel : dépendance et service nouveaux) ; l'écran de saisie du nouveau mot de passe lui ajoutera F-010 en dépendance si elle le porte. F-027 ouvre des routes natives de better-auth que F-009 garde fermées : c'est un changement de contrat, avec son test de couture.

Décisions transverses (écrites dans les specs, rappelées ici une fois) :

- Version du document de page : F-003 livre le socle (lecture « la plus haute jamais inscrite », opération d'élévation, table des versions, dont elle écrit la ligne 1). F-028, F-005, F-016 et F-022 incrémentent chacune la version. Le numéro qu'une feature introduit est la version prise en charge par `main` à son premier commit de code, plus un. La version d'un document n'est écrite que lorsqu'un élément nouveau y est inscrit, jamais à l'ouverture. Une application plus ancienne refuse alors la page entière.
- Nom des bases locales : `notionlike:espace:<idEspace>`, `notionlike:page:<idEspace>:<idPage>`, `notionlike:table:<idEspace>:<idTable>`. L'identifiant d'espace dans le nom isole les espaces d'un même appareil, et le nom correspond terme à terme au nom de document du serveur (F-002 H3, F-012 H2, F-013-AC16).
- Motion (bibliothèque d'animation de la fiche) n'est installée ni par F-004 ni par F-006 : le CSS leur suffit (F-004 H3, F-006 H8). Elle reste à F-024 ou à une feature dédiée, qui serait alors `structurel` (dépendance directe nouvelle).
- Dépendances directes décidées par les specs après la veille, hors de celles que la fiche nomme : `@floating-ui/dom`, dépendance de pair obligatoire de `@tiptap/suggestion`, déclarée par F-005 et confinée au module d'édition (F-005 H9, F-005-AC33) ; l'ancienne famille dnd-kit (`@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`, et non `@dnd-kit/react`), retenue par F-006 (F-006 H6).
- Contexte sécurisé : la coquille refuse de tourner hors d'un contexte sécurisé et l'explique, sans générateur d'identifiants de secours (F-002-AC26, F-002 H12) ; prérequis du dev : servir l'application en `https` ou à une adresse locale de la machine (`localhost`, `127.0.0.1`), y compris pour un essai depuis un autre appareil du réseau.

Limites acceptées par les specs (à dire au dev avant validation) :

- Un `lecteur` lit les commentaires et n'en écrit pas (F-016 H2).
- Aucun auteur de commentaire n'est vérifié par le serveur : l'auteur et la date sont déclarés par l'appareil (F-016 H3).
- Un bloc déplacé peut être dupliqué par deux déplacements simultanés, ou perdre une modification concurrente (F-006-AC24, AC25).
- Un membre retiré d'un espace garde sa copie locale de ce qu'il a déjà reçu (F-011 H2).
- Sur un appareil partagé, les modifications hors ligne d'une personne partent sous le compte de la suivante si elle est membre de l'espace (F-013 H3, H5).
- Un client défectueux ou malveillant qui a le droit d'écriture peut faire perdre à tous le contenu qu'un client plus ancien ne connaît pas, en envoyant ce contenu avant la version qui le déclare (deux mises à jour) : aucun critère d'aucune spec ne garantit ce cas, la parade complète (vérifier chaque mise à jour contre le schéma avant la liaison) n'est pas retenue et reste à décider par le dev (F-003 H4, cas (a) ; F-013 H8).

Ce que les specs écrites reportent sur les features à venir (à reprendre à l'écriture de chacune) :

- F-004 : un jeton de police à chasse fixe, que le bloc code de F-005 emploie s'il existe (F-005-AC8).
- F-007 : si la restauration d'une page appelle `deplacerPage`, elle entre dans l'énumération des appelants de F-006 (F-006-AC30).
- F-018 :
  - le rattachement d'une table à l'arborescence des pages et la persistance du document de table (F-017 ne livre que le modèle) ;
  - brancher le type `table` à la passe de fond de F-013, qui n'en fixe que le nom (F-013-AC16).
- F-022 :
  - la même règle de version que F-028, F-005 et F-016 (voir les décisions transverses) ;
  - sa commande à ajouter à la liste du menu slash de F-005 (F-005-AC21) ;
  - les fichiers lâchés dans l'éditeur, que F-006 refuse explicitement (F-006-AC35).
- F-024 : recenser les raccourcis déjà livrés par les features d'éditeur : Mod+B, Mod+I, Mod+K (F-028), Mod+Entrée (F-005, F-016), Alt+Maj+Flèches (F-006), Mod+Alt+M (F-016).
- F-025 :
  - l'effacement garanti des octets d'une page supprimée : historique Yjs, journal de la persistance, autres appareils, serveur, sauvegardes (F-007 H1 ne le garantit pas) ;
  - le balayage des bases de page orphelines laissées par un effacement manqué (F-007-AC21) ou par une suppression propagée (F-013-AC37) ;
  - le document du serveur d'une page supprimée définitivement, ou d'une table isolée : sa suppression demande une route ou un signal nouveau (F-012 : un document n'y disparaît qu'avec son espace ; F-013 ne le fait pas) ;
  - l'export des commentaires dont un compte est l'auteur déclaré, qui demande de lire les documents de page (F-016 H7) ;
  - le nom et l'identifiant d'un compte supprimé dans ses commentaires, que le serveur ne peut pas effacer lui-même (F-016 H7) ;
  - l'effacement garanti des octets d'un commentaire supprimé (F-016 H7) ;
  - le sort des espaces dont le compte supprimé est le dernier propriétaire (F-011) ;
  - la purge des invitations expirées ou consommées (F-011) et celle des sessions expirées (F-009) ;
  - l'adresse IP et l'agent utilisateur des sessions dans l'export (F-009 H10).

Manques signalés, sans feature (le dev décide si l'un d'eux devient une feature) :

- Le déploiement hors du poste du dev (TLS, proxy inverse, sauvegarde et restauration de la base) n'est couvert par aucune ligne de cette ROADMAP. F-008 et F-009 le laissent hors périmètre ; F-009 en dépend pour un usage réel (cookie `Secure`, `PROXYS_DE_CONFIANCE`). Sont à rouvrir avec lui : l'inscription ouverte, que F-011 (H4) n'accepte que parce que le serveur n'est pas exposé ; `wss://` pour le point de synchronisation de F-012 ; le service de l'application et de l'API sous une même origine (F-010).
- La coloration syntaxique du bloc code est exclue de F-005 (H4), qui enregistre pourtant le langage ; aucune ligne ne la porte.
- Déplacer un élément de liste seul est exclu de F-006 ; aucune ligne ne le porte.
- L'aperçu d'une invitation avant acceptation est exclu de F-014 (H3) : il demanderait une route nouvelle dans F-011 ; aucune ligne ne le porte.

## Refactors planifiés (par blocs)

Aucun.

Dette ouverte, non planifiée : D-001 (pas de CI ni de branche protégée). Elle reste ouverte tant que le dev n'a pas choisi de plateforme git ; aucune feature de cette ROADMAP ne la résorbe.

Dettes proposées, à ouvrir par le dev à la validation des specs concernées (elles ne sont inscrites nulle part ailleurs à ce jour) :

- D-002 Tests d'intégration du serveur sur PGlite et non sur un PostgreSQL réel — origine : F-008 (H5), étendue par F-011 (H10) et F-012 (H11) — impact : concurrence, pool, droits et pilote `pg` ne sont vérifiés que par le script de fumée manuel de F-008-AC19 ; les volets « en même temps » de F-011-AC17 (dernier propriétaire) et F-011-AC22 (invitation à usage unique) ne sont prouvés que par la présence du verrou et des contraintes, sans concurrence réelle ; la colonne binaire des instantanés de F-012-AC28 n'est pas éprouvée sur un vrai PostgreSQL ; à lever avec D-001 (une CI peut lancer PostgreSQL).
- D-003 Tests de bout en bout hors des hooks — origine : F-002 (H9), étendue aux scénarios de F-003, F-004, F-007 et F-010, puis à ceux de F-005, F-006, F-013, F-014, F-015, F-016 et F-028 — impact : `TEST_CMD` ne lance que Vitest, donc ne sont tenus que par un lancement manuel : F-002-AC23, AC4 et AC19 ; F-003-AC28 (seule preuve de la frappe réelle dans l'éditeur) ; F-004-AC22 (seule preuve du rendu réel) ; F-007-AC28 ; le scénario de F-010 contre le serveur réel (F-010 H8) ; F-005-AC34 (frappe réelle, position du menu, rendu du bloc code) ; pour F-006, tout le geste au pointeur (repères de dépôt, poignée, abandon par Échap : F-006-AC1 à AC3, AC7, AC14, AC15, AC34), que rien d'autre ne prouve ; les scénarios de bout en bout de F-013 (deux onglets réels, cookie joint par le navigateur, F-013 H13) et de F-014 (contre la pile réelle, F-014 H11) ; F-015-AC33, le rendu réel des curseurs et le retrait à la fermeture de l'onglet (F-015 H13) ; F-016-AC35 (seule preuve dans un vrai navigateur que rien ne s'exécute et que le couper-coller détache un fil) ; F-028-AC30 (seule preuve que rien ne s'exécute dans un vrai navigateur) ; à lever quand le dev branche Playwright dans `.agents/outils.env`.

## Terminé (lien PROJECT_LOG)

Aucune feature terminée.

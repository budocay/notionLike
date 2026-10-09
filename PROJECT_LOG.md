# PROJECT_LOG — notionLike

## [2026-10-08] F-001 Arborescence des pages d'un espace (modèle Yjs)

- TYPE: FEATURE
- Tier: structurel
- Scope: `packages/document` — agents: agent-planif, agent-veille, agent-architecte-conception, agent-frontend, dev (validation de la spec, bloc 0, reprise du gate) — commits: 275d4ef..a9aa1b8
- Détail: paquet `@notionlike/document`, document d'espace Yjs qui porte l'arborescence des pages (identifiant, titre, parent, rang, corbeille) sans leur contenu. Créer, renommer, déplacer, mettre à la corbeille, s'abonner ; convergence entre répliques (créations simultanées, déplacements croisés sans cycle ni page perdue) ; lecture tolérante et refus d'une version de format inconnue. Le code des blocs 1 à 4 est livré en un seul commit (`76146f5`) : l'historique par bloc a été perdu lors d'une coupure de courant.
- Dette: introduite D-005, D-006, D-007 ; D-004 citée par le dev dans `MEMORY/gates.log`, à décrire par lui
- ADR: ADR-0001, ADR-0002, ADR-0003
- Tests: ajoutés, 224 tests sur 6 fichiers (exemples et propriétés fast-check) — état: verts — preuve: checks.txt (empreinte `ca4cb0d41fe3`)
- Gates: SECURITY PASS · ARCHITECTURE PASS · CRAFT PASS · revue reviewer-frontend APPROVED
- Mesures: boucles — architecture conception 4 (3 FAIL, reprise du dev, 1 PASS), architecture code 2, reviewer-frontend 2, sécurité 2 (dont 1 UNVERIFIED : verdict écrit dans un bloc de code), craft 2 · constats confirmés — architecture conception 19 (8 + 6 + 5), reviewer-frontend 2 · faux positifs 0 · coût non mesuré

## [2026-10-08] D-005 Rang de longueur non bornée et `rangEntre` récursive

- TYPE: DEBT
- Tier: standard
- Scope: `packages/document/src/rang.ts` — agents: agent-securite (constat M2, CWE-674) — commits: aucun
- Détail: une mise à jour forgée peut porter un rang très long ; `estUnRang` ne borne pas sa longueur et `rangEntre` est récursive. À lever avant F-012 (première réception de mises à jour venues du réseau) : borner la longueur, rendre `rangEntre` itérative. Touche ADR-0002.
- Dette: introduite D-005
- ADR: ADR-0002
- Tests: aucun — état: UNVERIFIED — preuve: aucune
- Gates: sans objet
- Mesures: sans objet

## [2026-10-08] D-006 Rappel d'abonné qui lève, façade sans fermeture

- TYPE: DEBT
- Tier: standard
- Scope: `packages/document/src/document-espace.ts` — agents: reviewer-frontend, agent-securite (constats F1, F2) — commits: aucun
- Détail: un rappel d'abonné qui lève interrompt la diffusion (les abonnés suivants ne sont pas notifiés) et l'erreur remonte par `Y.applyUpdate` ; la façade n'a pas de fermeture qui retire son écouteur du `Y.Doc`. Limite écrite dans `ARCHITECTURE.md`. À lever avec F-002 (premier appelant réel).
- Dette: introduite D-006
- ADR: ADR-0003
- Tests: aucun — état: UNVERIFIED — preuve: aucune
- Gates: sans objet
- Mesures: sans objet

## [2026-10-08] D-007 Vérification des types hors des contrôles du socle

- TYPE: DEBT
- Tier: trivial
- Scope: `.agents/outils.env`, `controles.sh` (réservés au dev) — agents: reviewer-frontend, agent-architecte, agent-securite — commits: aucun
- Détail: aucun contrôle ne lance `pnpm typecheck`. La barrière « ni DOM ni types Node » du `tsconfig.json` de `packages/document` (F-001-AC19) n'est prouvée dans aucun `checks.txt` ; seule la règle ESLint des globales interdites l'est. À lever par le dev en branchant `pnpm typecheck` dans les contrôles.
- Dette: introduite D-007
- ADR: aucun
- Tests: aucun — état: UNVERIFIED — preuve: `pnpm typecheck` lancé à la main le 2026-10-08, vert
- Gates: sans objet
- Mesures: sans objet

## [2026-10-09] D-008 Commits `Agent: dev` délégués à l'orchestrateur

- TYPE: DEBT
- Tier: structurel
- Scope: socle de contrôle (validation des specs, fichiers protégés, blocs 0) — agents: orchestrateur, sur décision du dev — commits: 86542e8 (dev lui-même), f1946e2, b88f66e (orchestrateur)
- Détail: le 2026-10-09, le dev a délégué à l'orchestrateur tous les commits `Agent: dev` (validations de spec, blocs 0, mise à l'abri), pour toutes les features, et a ajouté les règles d'autorisation `Bash(git commit:*)` et `Bash(sed -i:*)` dans `.claude/settings.local.json`. Chaque commit délégué le dit dans son message. Conséquence : le trailer `Agent: dev` ne prouve plus qu'un humain a lu ; `spec_validee`, la protection des fichiers de configuration des contrôles et les lignes `REPRISE` ou `DEROGATION` reposent sur la retenue de l'orchestrateur. À lever par le dev : retirer les deux règles, ou relire a posteriori les commits délégués (`git log --grep='délégation explicite du dev'`). L'orchestrateur ne s'en sert ni pour une `DEROGATION`, ni pour une `REPRISE`, ni pour modifier un script de contrôle, un test ou `.agents/outils.env`.
- Dette: introduite D-008
- ADR: aucun
- Tests: aucun — état: UNVERIFIED — preuve: aucune
- Gates: sans objet
- Mesures: sans objet

## [2026-10-09] F-002 Application web locale : coquille, barre latérale des pages, persistance IndexedDB

- TYPE: FEATURE
- Tier: structurel
- Scope: `apps/web`, `packages/document` — agents: agent-planif, agent-veille, agent-architecte-conception, agent-frontend, orchestrateur par délégation du dev (validations de la spec, mise à l'abri, bloc 0 : D-008) — commits: d7e5080..6250a0a
- Détail: première application du dépôt. Identifiants en UUID canonique, persistance du document d'espace dans IndexedDB (`y-indexeddb@9.0.12`), session d'espace, routes par fragment, barre latérale (créer, renommer, sous-page, corbeille, replier), zone principale, écrans d'état. Dans `packages/document` : fermeture de la façade, diffusion sous garde, code `facade-fermee`. Code repris en partie d'un arbre écrit en avance le 2026-10-08, archivé sur la branche `archive-arbre-2026-10-08`, puis retouché contre la spec amendée.
- Dette: résorbée D-006 (à clore par le dev) ; introduite D-008 ; laissées D-003, D-007
- ADR: ADR-0003 (amendé), ADR-0007, ADR-0008
- Tests: ajoutés, 777 tests sur 21 fichiers (256 `document`, 521 `web`), 7 scénarios de bout en bout — état: verts — preuve: checks.txt (empreinte `d06344502281`) pour Vitest, lint, contrats, couverture des critères ; relevé à la main dans `MEMORY/features/F-002.md` pour `typecheck`, `build` et le bout en bout (hors des contrôles du socle)
- Gates: SECURITY PASS · ARCHITECTURE PASS · CRAFT PASS · revue reviewer-frontend APPROVED
- Mesures: boucles — architecture conception 2 (1 FAIL, 1 PASS), reviewer-frontend 3 (2 CHANGES_REQUESTED, 1 APPROVED), architecture code 3 (1 UNVERIFIED faute de preuves au dossier, 2 PASS), sécurité 3, craft 3 · constats confirmés — architecture conception 7, reviewer-frontend 3 (preuves de `typecheck` et `build` absentes, test d'AC26 incomplet, titre sans caractère visible), architecture code 1 (format du document écrit en dur dans cinq fichiers de test) · faux positifs 0 · une escalade du hook de vérification (trois lancements sur un arbre en cours d'écriture par un agent en arrière-plan), reprise par le dev · coût non mesuré

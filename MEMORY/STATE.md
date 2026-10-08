# STATE — notionLike — 2026-10-08

## Où on en est

Aucun code applicatif, aucune feature DONE. Une journée de planification menée en l'absence du dev, sur sa consigne d'avancer sans lui.

- F-001 (arborescence des pages, `packages/document`, structurel) : spec validée (`ccbcd25`, branche `F-001`), veille faite, conception en révision 4 (`38a5117`). **En escalade** : le gate `agent-architecte` a rejeté la conception trois fois (`MEMORY/gates.log`, `ddcb081`). Les révisions 3 (corrections du troisième rejet) et 4 (`vitest.config.ts` racine du bloc 0) n'ont pas repassé le gate.
- F-008 (socle serveur, structurel) : spec en brouillon, conception écrite et essayée sur une pile Docker réelle hors dépôt (ADR-0004 à 0006 en « proposé », `docs/decisions/F-008-conception.md`). Aucun gate passé.
- Dix-huit specs existent, 578 critères : F-001 validée, dix-sept brouillons (F-002 à F-017, F-028). Restent à écrire F-018 à F-027. `ROADMAP.md` (28 features) est à jour au commit `f1b6d8d`. `MEMORY/VEILLE.md` couvre les bibliothèques citées par ces specs, par exécution hors dépôt, jamais dans un navigateur réel.

## Prochaine action prévue

Le dev tranche l'escalade de F-001 : ligne `REPRISE D-xxx` ou `DEROGATION D-xxx` dans `MEMORY/gates.log`, commit `Agent: dev`, sur la branche `F-001` ; puis `.agents/checks/dossier-revue.sh --conception F-001` et `.agents/checks/gate.sh agent-architecte F-001`.

## Ce qui attend le dev

Aucun commit `Agent: dev` n'a été fait par un agent : le harness l'a refusé à l'orchestrateur.

- Escalade F-001 (ci-dessus), puis bloc 0 de F-001 : huit fichiers, textes dans `docs/decisions/F-001-conception.md` (branche `F-001`).
- Validation de `specs/F-008.md`, dont H10 (image Node Alpine) et H15 (risque accepté sur l'image `postgres:18.6` : 2 CRITICAL et 82 HIGH à `trivy image`). Puis ADR-0004 à 0006 à passer à « accepté », gate de conception, et bloc 0 de F-008 : quatorze fichiers, textes dans `docs/decisions/F-008-conception.md`.
- Validation des seize autres brouillons. Choix tranchés sans le dev, à relire en priorité :
  - F-003 H1 : contenu de page en fragment Yjs piloté par le schéma Tiptap, sans identifiant de bloc (un bloc déplacé peut être dupliqué ou perdre une modification concurrente, F-006).
  - F-003 H4 : risque résiduel accepté : un client en écriture défectueux ou malveillant peut faire perdre à tous le contenu qu'un client plus ancien ne connaît pas ; parade complète notée, non retenue.
  - F-016 H2, H3 : un `lecteur` ne commente pas ; aucun auteur de commentaire n'est vérifié.
  - F-011 : inscription ouverte, invitation par lien au porteur, un membre retiré garde sa copie locale.
  - F-012 H3 : stockage par instantané seul, sans journal.
  - F-013 H3, H5 : sur un appareil partagé, les modifications hors ligne partent sous le compte suivant.
  - F-007 H2 : la suppression définitive retire des entrées du document d'espace (amende l'ADR-0002) ; ramasse-miettes Yjs actif (ferme l'historique de versions).
  - F-002-AC26 : l'application refuse de tourner hors contexte sécurisé ; servir en `https` ou à une adresse locale.
  - F-006 H6 : ancienne famille dnd-kit, sans publication depuis décembre 2024.
- Ordre de livraison et ligne `Revue :` de F-011 (H14) si F-010 passe avant elle.
- Fusion des branches (voir Pièges).

## Dettes ouvertes

- D-001 Pas de CI ni de branche protégée — depuis la génération — impact : les hooks git se contournent par `--no-verify`, pas de `CODEOWNERS`.

Proposées dans `ROADMAP.md`, à ouvrir par le dev :

- D-002 Tests d'intégration sur PGlite et non sur un PostgreSQL réel — origine F-008 H5 — impact : pilote `pg`, concurrence, droits et colonne binaire de F-012 non couverts par les hooks.
- D-003 Tests de bout en bout hors des hooks (`TEST_CMD` ne lance que Vitest) — origine F-002 H9 — impact : les critères Playwright de F-002 à F-016 et F-028 ne sont tenus que par un lancement manuel ; pour F-006, tout le geste au pointeur.

## État des contrôles / gates

- 2026-10-08 : `test-blocage.sh` → `RESULTAT: tous les blocages sont effectifs` ; `controles.sh --tout` → `RESULTAT: OK` (avant la planification ; non relancés depuis).
- F-001, conception : `dossier-revue.sh --conception` code 0 trois fois ; `agent-architecte` → FAIL (`ba180a02ed89`), FAIL (`9b7747b9dabb`), FAIL (`3daa8ec5caca`), puis ESCALADE code 3. Révisions 3 et 4 : UNVERIFIED.
- F-008, conception : aucun dossier de revue, aucun gate. UNVERIFIED.
- Specs : contrôle mécanique des renvois croisés (existence des numéros) fait par `agent-planif` sur les dix-huit specs et la ROADMAP, aucun hors borne ; le sens des renvois n'est pas contrôlé.
- Aucun contrôle n'a tourné sur du code : il n'y en a pas.

## Pièges actifs

- **Deux branches, planification en double.** `F-001` porte la spec validée, la conception de F-001 et le journal des gates. `F-008` part de `main` et porte toute la planification (specs, ROADMAP, veille, ce fichier) plus la conception de F-008 ; les premiers commits de planification y ont été repris par cherry-pick, donc ils existent aussi sur `F-001` avec un contenu identique. Sur `F-008`, `specs/F-001.md` est encore en brouillon et les ADR-0001 à 0003 sont absents : la version de référence est celle de `F-001`. La fusion des deux n'a pas été essayée ; `MEMORY/STATE.md` y sera en conflit (garder celui de `F-008`).
- **Blocs 0 de F-001 et F-008** : ils touchent les mêmes fichiers racine. `vitest.config.ts` racine entre en conflit d'ajout à la fusion : garder celui de F-008 (fichier 10). `pnpm-lock.yaml` se régénère par `pnpm install`.
- **`.idea/` est exclu par `.git/info/exclude`**, pas par `.gitignore` (protégé) : exclusion locale posée par l'orchestrateur pour que `dossier-revue.sh` accepte l'arbre.
- **Le worktree isolé des sous-agents ne fonctionne pas** (`WorktreeCreate hook failed`, hook de Claude Terminal dans `~/.claude/settings.json`) : les agents parallèles partagent un seul arbre et commitent par chemin (`git commit … -- <chemin>`). Un gate lancé pendant qu'un agent écrit serait INVALIDE.
- **Le hook de périmètre ne voit pas les écritures faites par Bash** : plusieurs agents ont écrit puis supprimé des fichiers dans `/tmp` malgré la consigne. Des restes d'essais antérieurs traînent dans `/private/tmp` (`gabarit-f001.*`, `f001-scripts/`).
- **Un client plus ancien détruit le contenu récent** : la liaison Tiptap-Yjs supprime du document partagé tout nœud ou marque inconnus de son schéma. D'où la version du document de page (socle par F-003, incréments par F-028, F-005, F-016, F-022), stockée dans un type racine hors du fragment, et la garde par observateur simple avant toute liaison.
- **Bases locales nommées avec l'espace** : `notionlike:page:<idEspace>:<idPage>` (F-002-AC25, F-013-AC44).
- **Hocuspocus 4.7.0** : jamais sous 4.3.0 ; un message de fermeture tardif referme la prochaine ouverture du même nom (parade à écrire dans le relais, F-012-AC37, non exécutée par la veille).
- Versions sensibles au seuil de 7 jours de pnpm le jour de l'installation : `pino`, `@types/node`, `better-auth`, `vite` (voir `MEMORY/VEILLE.md`). L'image Docker se construit en Node 26.10.0, le poste est en 26.11.0. Des images `node` et `postgres` tirées par la veille restent sur le poste.
- Un nouveau paquet de workspace (`package.json` avec scripts, `vitest.config.*`) est créé par le dev, pas par un agent. Playwright et Stryker ne sont pas installés.

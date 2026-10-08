## Agents proposés pour notionLike

| Agent | Rôle | Pourquoi | Reviewer | Périmètre | Modèle |
|-------|------|----------|----------|-----------|--------|
| agent-backend | Serveur : synchronisation Hocuspocus, REST Express, authentification, droits | `backend` et `api_style` non vides, même code | reviewer-backend + reviewer-api | `apps/server/**`, `packages/contrats/**` | hérité |
| agent-frontend | Client React, éditeur Tiptap, vues de bases de données, modèle de document Yjs, hors ligne | `frontend` non vide ; le modèle de document est surtout consommé par le client | reviewer-frontend | `apps/web/**`, `packages/document/**` | hérité |
| agent-bdd | Schéma Drizzle, migrations PostgreSQL, stockage des mises à jour Yjs | `base_de_donnees` et `orm` non vides | reviewer-bdd | `packages/db/**` | hérité |
| agent-devops | Docker, Compose, déploiement ; propose la CI | `infra` et `packaging` non vides | reviewer-devops | `Dockerfile*`, `docker-compose*.yml`, `.dockerignore`, `infra/**`, `deploy/**` | hérité |
| agent-planif | Specs, ROADMAP, bilan des gates | structurel | — | `ROADMAP.md`, `specs/*.md`, `MEMORY/BILAN_GATES.md` | hérité |
| agent-architecte-conception | ADR, ARCHITECTURE.md | structurel | agent-architecte | `ARCHITECTURE.md`, `docs/decisions/**` | opus |
| agent-architecte | Gate architecture | structurel | — | aucun | opus |
| agent-securite | Gate sécurité | structurel | — | aucun | opus |
| agent-craft | Règles de lisibilité ; gate assemblé par `craft.sh` | structurel | — | aucun | sonnet |
| agent-veille | Veille datée et sourcée | structurel | — | `MEMORY/VEILLE.md` | sonnet |

Agents structurels (non négociables) : agent-planif, agent-securite, agent-architecte,
agent-architecte-conception, agent-craft, agent-veille.
Conversation principale : orchestrateur (délègue ; périmètre : orchestrateur.txt, vide)
Gates requis par tier (outils.env) : GATES_STANDARD=agent-architecte agent-securite agent-craft · GATES_STRUCTUREL=idem ; reviewers : ligne « Revue : » de chaque spec
Harness ciblés et projections : claude-code (`.claude/agents/`, `.claude/skills/`, `CLAUDE.md`)
Contrôles par moment : écriture oui (adaptateur Claude Code) · commit · push · merge : non (pas de plateforme)
Indépendance des gates : processus séparé (`gate.sh`, `claude -p --setting-sources project`)
Modes dégradés actifs :
- D-001 — pas de CI ni de branche protégée : les hooks git se contournent par `--no-verify` et rien ne le rattrape ; pas de `CODEOWNERS`. À lever dès qu'une plateforme git est choisie (extraction avec `--ci github|gitlab`, `CODEOWNER` dans outils.env).
- Les modèles des agents (`opus`, `sonnet`) ne valent qu'en route B ; en route A, le gate tourne sur le modèle par défaut de `claude -p`.

Hypothèses prises sans confirmation (le dev a délégué : « je te fais confiance sur tout ») :
- Nom provisoire `notionLike` ; branche principale `main`.
- TypeScript 6.0 et non 7.0 (incompatible avec typescript-eslint 8.71).
- Tiptap plutôt que BlockNote (style sur mesure).
- Tables des bases de données stockées dans Yjs (hors ligne et temps réel comme les pages).
- RGPD retenu (comptes nominatifs) ; pas de second fournisseur de modèle.
- `packages/document` (modèle Yjs) attribué à agent-frontend ; `packages/contrats` à agent-backend.
- Tests : `vitest run --passWithNoTests` à la racine (dépôt neuf sans test) ; Playwright et Stryker ajoutés plus tard par le dev.
- Un nouveau paquet de workspace (`package.json` avec scripts, `vitest.config.*`) est créé par le dev : ces fichiers portent la configuration des contrôles.
- `GATE_CMD` écarte la configuration personnelle du poste (plugins, instructions globales) pour garder les gates neutres.
- Règles ESLint bloquantes : complexité 10, bloc vide, nombres magiques, variables inutilisées, `any`, `console.log`.

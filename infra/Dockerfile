# Image unique du serveur et de la migration (F-008-AC20, ADR-0006). Contexte : la racine du dépôt.
# Étiquette et empreinte relues au registre le 2026-10-09 ; à relire à chaque mise à jour. Les deux
# FROM portent la même référence.

# Étape de dépendances : pnpm vient de npm (corepack est absent de l'image), à la version du champ
# packageManager. Les paquets du workspace restent à leur place, reliés par les liens de pnpm : Node
# refuse d'exécuter un fichier .ts situé sous node_modules.
FROM node:26.11.1-alpine3.24@sha256:143494b1da2945f061539253adc65e4f1569ddf07da2d384c022c791a9d90a4a AS dependances
WORKDIR /app
RUN npm install -g pnpm@12.10.1
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/
COPY packages/contrats/package.json packages/contrats/
COPY packages/db/package.json packages/db/
RUN pnpm install --frozen-lockfile --prod

# Étape d'exécution : ni npm, ni npx, ni pnpm ; rien ne s'y installe.
FROM node:26.11.1-alpine3.24@sha256:143494b1da2945f061539253adc65e4f1569ddf07da2d384c022c791a9d90a4a AS execution
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
ENV NODE_ENV=production
WORKDIR /app
COPY --from=dependances /app/node_modules node_modules
COPY --from=dependances /app/apps/server/node_modules apps/server/node_modules
COPY --from=dependances /app/packages/contrats/node_modules packages/contrats/node_modules
COPY --from=dependances /app/packages/db/node_modules packages/db/node_modules
COPY package.json ./
COPY apps/server/package.json apps/server/
COPY packages/contrats/package.json packages/contrats/
COPY packages/db/package.json packages/db/
COPY apps/server/src apps/server/src
COPY packages/contrats/src packages/contrats/src
COPY packages/db/src packages/db/src
COPY packages/db/migrations packages/db/migrations

# L'image de base tourne en root : l'utilisateur est posé ici.
USER node

HEALTHCHECK --interval=3s --timeout=3s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/sante').then((reponse) => process.exit(reponse.ok ? 0 : 1), () => process.exit(1))"]

# Forme tableau : Node reçoit SIGTERM directement.
CMD ["node", "apps/server/src/main.ts"]

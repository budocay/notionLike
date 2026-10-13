import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

const HOTE_LOCAL = "127.0.0.1";
// F-010 H10 : en développement, `/api` est relayé vers le serveur de F-008, pour que le navigateur
// n'ait qu'une origine. Forme objet, sans `changeOrigin` ni `rewriteWsOrigin` : `Host`, `Origin` et
// `Cookie` arrivent tels que le navigateur les a émis ; `ws` sert déjà la synchronisation (F-013).
// La cible se règle par `NOTIONLIKE_RELAIS_API`, que le client ne reçoit pas (préfixe hors `VITE_`).
const RELAIS_API_PAR_DEFAUT = "http://127.0.0.1:3000";

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  server: {
    host: HOTE_LOCAL,
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: loadEnv(mode, ".", "NOTIONLIKE_").NOTIONLIKE_RELAIS_API ?? RELAIS_API_PAR_DEFAUT,
        ws: true,
      },
    },
  },
}));

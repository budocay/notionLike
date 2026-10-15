import { defineConfig } from "vitest/config";

// F-013 H13 : le module de synchronisation s'éprouve sous Node, contre le serveur réel démarré par
// la fabrique d'essai (F-012-AC36) ; ses tests (test/synchronisation/) n'ont ni DOM simulé ni la
// préparation des écrans. Tout le reste d'apps/web garde le DOM simulé.
const SYNCHRONISATION = "test/synchronisation/**/*.test.ts";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "web",
          environment: "jsdom",
          include: ["test/**/*.test.{ts,tsx}"],
          exclude: [SYNCHRONISATION],
          setupFiles: ["./test/preparation.ts"],
          restoreMocks: true,
          unstubGlobals: true,
        },
      },
      {
        test: {
          name: "web-synchronisation",
          environment: "node",
          include: [SYNCHRONISATION],
          restoreMocks: true,
          unstubGlobals: true,
        },
      },
    ],
  },
});

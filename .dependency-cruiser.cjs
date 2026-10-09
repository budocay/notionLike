// Contrats de dépendances exécutables (ARCHITECTURE GATE, points 1 et 3). Fichier protégé :
// agent-architecte-conception propose les évolutions, le dev les commite.
module.exports = {
  forbidden: [
    {
      name: "pas-de-cycle",
      severity: "error",
      comment: "Aucune dépendance cyclique.",
      from: {},
      to: { circular: true },
    },
    {
      name: "domaine-pur",
      severity: "error",
      comment: "Le domaine ne dépend ni de l'infrastructure ni de l'interface.",
      from: { path: "/domain/" },
      to: { path: "/(infrastructure|adapters|ui|routes)/" },
    },
    {
      name: "paquets-sans-apps",
      severity: "error",
      comment: "Un paquet partagé ne dépend jamais d'une application.",
      from: { path: "^packages/" },
      to: { path: "^apps/" },
    },
    {
      name: "apps-isolees",
      severity: "error",
      comment: "Le client et le serveur ne s'importent pas : ils passent par packages/.",
      from: { path: "^apps/([^/]+)/" },
      to: { path: "^apps/([^/]+)/", pathNot: "^apps/$1/" },
    },
    {
      name: "contrats-zod-seulement",
      severity: "error",
      comment:
        "F-008-AC23 : depuis packages/contrats/src, seuls un fichier de packages/contrats/src et le paquet zod sont importables.",
      from: { path: "^packages/contrats/src/" },
      to: { pathNot: ["^packages/contrats/src/", "(^|/)node_modules/zod/"] },
    },
    {
      name: "db-liste-blanche",
      severity: "error",
      comment:
        "F-008-AC23 : depuis packages/db/src, seuls packages/db/src, drizzle-orm, pg et les modules intégrés de Node sont importables.",
      from: { path: "^packages/db/src/" },
      to: {
        pathNot: ["^packages/db/src/", "(^|/)node_modules/(drizzle-orm|pg)/"],
        dependencyTypesNot: ["core"],
      },
    },
    {
      name: "serveur-liste-blanche",
      severity: "error",
      comment:
        "ADR-0004 : depuis apps/server/src, seuls apps/server/src, l'entrée publique de db et de contrats, express, helmet, pino, zod et les modules intégrés de Node sont importables.",
      from: { path: "^apps/server/src/" },
      to: {
        pathNot: [
          "^apps/server/src/",
          "^packages/(db|contrats)/src/index\\.ts$",
          "(^|/)node_modules/(express|helmet|pino|zod)/",
        ],
        dependencyTypesNot: ["core"],
      },
    },
    {
      name: "db-reserve-au-serveur",
      severity: "error",
      comment: "F-008-AC23 : seuls packages/db et apps/server importent packages/db.",
      from: { pathNot: "^(packages/db|apps/server)/" },
      to: { path: "^packages/db/" },
    },
    {
      name: "document-sans-reseau-ni-base",
      severity: "error",
      comment: "Le modèle de document (CRDT) reste pur : ni base serveur ni contrats HTTP.",
      from: { path: "^packages/document/" },
      to: { path: "^packages/(db|contrats)/" },
    },
    {
      name: "document-yjs-seulement",
      severity: "error",
      comment:
        "F-001-AC19 : depuis packages/document/src, seuls un fichier de packages/document/src et le paquet yjs sont importables.",
      from: { path: "^packages/document/src/" },
      to: { pathNot: ["^packages/document/src/", "(^|/)node_modules/yjs/"] },
    },
    {
      name: "document-coeur-pur",
      severity: "error",
      comment:
        "ADR-0003 : rang, arbre et erreurs sont purs ; ils n'importent qu'eux-mêmes (ni yjs, ni format, ni document-espace).",
      from: { path: "^packages/document/src/(rang|arbre|erreurs)\\.ts$" },
      to: { pathNot: "^packages/document/src/(rang|arbre|erreurs)\\.ts$" },
    },
    {
      name: "web-y-indexeddb-confinee",
      severity: "error",
      comment:
        "F-002-AC22 : dans apps/web (tests compris), seul src/persistance/indexeddb.ts importe y-indexeddb.",
      from: { path: "^apps/web/", pathNot: "^apps/web/src/persistance/indexeddb\\.ts$" },
      to: { path: "(^|/)node_modules/y-indexeddb/" },
    },
    {
      name: "web-document-par-ses-exports",
      severity: "error",
      comment:
        "F-002-AC22 : apps/web (tests compris) n'atteint packages/document que par son point d'entrée.",
      from: { path: "^apps/web/" },
      to: {
        path: "^(packages|@notionlike)/document/",
        pathNot: "^packages/document/src/index\\.ts$",
      },
    },
    {
      name: "web-persistance-par-son-interface",
      severity: "error",
      comment:
        "F-002-AC22 : hors du module de persistance, seul son index.ts est importable (tests compris).",
      from: { path: "^apps/web/", pathNot: "^apps/web/src/persistance/" },
      to: { path: "^apps/web/src/persistance/", pathNot: "^apps/web/src/persistance/index\\.ts$" },
    },
    {
      name: "web-identifiants-pur",
      severity: "error",
      comment:
        "F-002-AC27 : le contrôle de forme des identifiants n'importe que lui-même (ni paquet, ni le reste de l'application).",
      from: { path: "^apps/web/src/identifiants/" },
      to: { pathNot: "^apps/web/src/identifiants/" },
    },
    {
      name: "web-persistance-liste-blanche",
      severity: "error",
      comment:
        "ADR-0008 : le module de persistance n'importe que lui-même, le contrôle de forme des identifiants, yjs et y-indexeddb (ni React, ni façade, ni le reste de l'application).",
      from: { path: "^apps/web/src/persistance/" },
      to: {
        pathNot: [
          "^apps/web/src/persistance/",
          "^apps/web/src/identifiants/",
          "(^|/)node_modules/yjs/",
          "(^|/)node_modules/y-indexeddb/",
        ],
      },
    },
    {
      name: "web-espace-liste-blanche",
      severity: "error",
      comment:
        "ADR-0007 : la session d'espace n'importe qu'elle-même, l'interface de la persistance, les exports de @notionlike/document et yjs (pas React).",
      from: { path: "^apps/web/src/espace/" },
      to: {
        pathNot: [
          "^apps/web/src/espace/",
          "^apps/web/src/persistance/index\\.ts$",
          "^packages/document/src/index\\.ts$",
          "(^|/)node_modules/yjs/",
        ],
      },
    },
    {
      name: "web-navigation-liste-blanche",
      severity: "error",
      comment:
        "ADR-0007 : le module de navigation n'importe que lui-même et le contrôle de forme des identifiants.",
      from: { path: "^apps/web/src/navigation/" },
      to: { pathNot: ["^apps/web/src/navigation/", "^apps/web/src/identifiants/"] },
    },
    {
      name: "web-formes-pures",
      severity: "error",
      comment:
        "ADR-0007, ADR-0008 : la forme des routes et le nom des bases sont des calculs purs ; ces deux fichiers n'importent que le contrôle de forme des identifiants (ni leur propre module, ni aucun paquet).",
      from: { path: "^apps/web/src/(navigation/route|persistance/nom-de-base)\\.ts$" },
      to: { pathNot: "^apps/web/src/identifiants/" },
    },
    {
      name: "web-src-liste-blanche",
      severity: "error",
      comment:
        "ADR-0007 : hors persistance, espace, navigation et identifiants, le code d'apps/web n'importe que src/ (persistance et identifiants exceptés), les exports de @notionlike/document, react et react-dom : ni yjs, ni y-indexeddb, ni dépendance de test, ni module de Node.",
      from: {
        path: "^apps/web/src/",
        pathNot: "^apps/web/src/(persistance|espace|navigation|identifiants)/",
      },
      to: {
        pathNot: [
          "^apps/web/src/(?!(persistance|identifiants)/)",
          "^packages/document/src/index\\.ts$",
          "(^|/)node_modules/(react|react-dom)/",
        ],
      },
    },
    {
      name: "web-composants-de-presentation",
      severity: "error",
      comment:
        "F-004 : un composant de présentation n'importe que son dossier et react (ni document, ni session, ni navigation, ni messages).",
      from: { path: "^apps/web/src/interface/composants/" },
      to: { pathNot: ["^apps/web/src/interface/composants/", "(^|/)node_modules/react/"] },
    },
    {
      name: "web-demonstration-hors-production",
      severity: "error",
      comment: "F-004-AC50 : hors de la page de démonstration, aucun fichier de src/ ne l'importe.",
      from: { path: "^apps/web/src/", pathNot: "^apps/web/src/demonstration/" },
      to: { path: "^apps/web/src/demonstration/" },
    },
    {
      name: "web-demonstration-liste-blanche",
      severity: "error",
      comment:
        "F-004-AC50 : la page de démonstration n'importe qu'elle-même, les composants de présentation, les textes et les raccourcis de l'interface, les styles, react et react-dom.",
      from: { path: "^apps/web/src/demonstration/" },
      to: {
        pathNot: [
          "^apps/web/src/demonstration/",
          "^apps/web/src/interface/composants/",
          "^apps/web/src/interface/messages\\.ts$",
          "^apps/web/src/interface/raccourcis\\.ts$",
          "^apps/web/src/styles/",
          "(^|/)node_modules/(react|react-dom)/",
        ],
      },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: { path: "^(apps|packages)/[^/]+/(dist|coverage)/" },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
    },
  },
};

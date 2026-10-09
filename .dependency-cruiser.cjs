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
      name: "web-persistance-liste-blanche",
      severity: "error",
      comment:
        "ADR-0008 : le module de persistance n'importe que lui-même, yjs et y-indexeddb (ni React, ni façade, ni le reste de l'application).",
      from: { path: "^apps/web/src/persistance/" },
      to: {
        pathNot: [
          "^apps/web/src/persistance/",
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
      name: "web-navigation-pure",
      severity: "error",
      comment: "ADR-0007 : le module de navigation n'importe que lui-même.",
      from: { path: "^apps/web/src/navigation/" },
      to: { pathNot: "^apps/web/src/navigation/" },
    },
    {
      name: "web-src-liste-blanche",
      severity: "error",
      comment:
        "ADR-0007 : hors persistance, espace, page et édition, le code d'apps/web n'importe que src/ (la persistance exceptée), les exports de @notionlike/document, react et react-dom : ni yjs, ni y-indexeddb, ni dépendance de test, ni module de Node.",
      from: { path: "^apps/web/src/", pathNot: "^apps/web/src/(persistance|espace|page|edition)/" },
      to: {
        pathNot: [
          "^apps/web/src/(?!persistance/)",
          "^packages/document/src/index\\.ts$",
          "(^|/)node_modules/(react|react-dom)/",
        ],
      },
    },
    {
      name: "edition-confinee",
      severity: "error",
      comment:
        "F-003-AC27 : Tiptap, ProseMirror et leur liaison Yjs ne s'importent que dans apps/web/src/edition et dans ses tests (apps/web/test/edition).",
      from: { path: "^(apps|packages)/", pathNot: "^apps/web/(src|test)/edition/" },
      to: { path: "(^|/)node_modules/(@tiptap|prosemirror-[^/]+|y-prosemirror|y-protocols)/" },
    },
    {
      name: "web-edition-par-son-interface",
      severity: "error",
      comment:
        "F-003-AC27 : hors du module d'édition et de ses tests, seul son index.ts est importable.",
      from: { path: "^apps/web/", pathNot: "^apps/web/(src|test)/edition/" },
      to: { path: "^apps/web/src/edition/", pathNot: "^apps/web/src/edition/index\\.ts$" },
    },
    {
      name: "web-edition-liste-blanche",
      severity: "error",
      comment:
        "ADR-0009 : le module d'édition n'importe que lui-même, react, react-dom, Tiptap et yjs (ni persistance, ni façade, ni le reste de l'application).",
      from: { path: "^apps/web/src/edition/" },
      to: {
        pathNot: ["^apps/web/src/edition/", "(^|/)node_modules/(react|react-dom|yjs|@tiptap)/"],
      },
    },
    {
      name: "web-page-liste-blanche",
      severity: "error",
      comment:
        "ADR-0009 : la session de page n'importe qu'elle-même, l'interface de la persistance, les exports de @notionlike/document et yjs (ni React, ni Tiptap).",
      from: { path: "^apps/web/src/page/" },
      to: {
        pathNot: [
          "^apps/web/src/page/",
          "^apps/web/src/persistance/index\\.ts$",
          "^packages/document/src/index\\.ts$",
          "(^|/)node_modules/yjs/",
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

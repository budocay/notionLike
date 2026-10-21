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
      comment:
        "Le client et le serveur ne s'importent pas : ils passent par packages/. Seule exception, les tests d'apps/web, qui n'atteignent apps/server que par la fabrique d'essai (F-012-AC32, AC36 : web-tests-serveur-par-la-fabrique).",
      from: { path: "^apps/([^/]+)/", pathNot: "^apps/web/test/" },
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
        "ADR-0004, F-009, F-012 : depuis apps/server/src, seuls apps/server/src, l'entrée publique de db et de contrats, express, helmet, pino, zod, better-auth, les paquets @better-auth/*, @hocuspocus/server, ws (et ses types), y-protocols, yjs, lib0 et les modules intégrés de Node sont importables ; ni @notionlike/document (F-012-AC29), ni @hocuspocus/provider, ni la fabrique d'essai (F-012-AC36).",
      from: { path: "^apps/server/src/" },
      to: {
        pathNot: [
          "^apps/server/src/",
          "^packages/(db|contrats)/src/index\\.ts$",
          "(^|/)node_modules/(express|helmet|pino|zod|better-auth|@better-auth/[^/]+)/",
          "(^|/)node_modules/(@hocuspocus/server|ws|@types/ws|y-protocols|yjs|lib0)/",
        ],
        dependencyTypesNot: ["core"],
      },
    },
    {
      name: "serveur-verification-de-configuration-confinee",
      severity: "error",
      comment:
        "F-031 H6, ADR-0017 : l'entrée de vérification de la configuration et configuration.ts n'importent que configuration.ts et zod (ni base, ni réseau, ni module de Node) ; lancée avec les secrets du service, la vérification n'ouvre aucune connexion et n'écoute sur aucun port.",
      from: { path: "^apps/server/src/(configuration|verifier-configuration)\\.ts$" },
      to: { pathNot: ["^apps/server/src/configuration\\.ts$", "(^|/)node_modules/zod/"] },
    },
    {
      name: "db-reserve-au-serveur",
      severity: "error",
      comment: "F-008-AC23 : seuls packages/db et apps/server importent packages/db.",
      from: { pathNot: "^(packages/db|apps/server)/" },
      to: { path: "^packages/db/" },
    },
    // F-009-AC24, par sous-chemin. Deux expressions par cible : le fichier que le sous-chemin désigne
    // dans le paquet installé (better-auth/client -> dist/client/index, better-auth/react ->
    // dist/client/react/, better-auth/client/plugins -> dist/client/plugins/), et le sous-chemin tel
    // qu'il est écrit, que dependency-cruiser garde quand le paquet n'est pas installé chez l'importateur.
    {
      name: "better-auth-reserve-au-serveur",
      severity: "error",
      comment:
        "F-009-AC24 : hors d'apps/server, ni better-auth (sa racine et ses sous-chemins autres que better-auth/client) ni un paquet @better-auth/* ne sont importables.",
      from: { pathNot: "^apps/server/" },
      to: {
        path: [
          "(^|/)node_modules/(better-auth|@better-auth/[^/]+)/",
          "^(better-auth|@better-auth/[^/]+)(/|$)",
        ],
        pathNot: [
          "(^|/)node_modules/better-auth/dist/client/index\\.(d\\.mts|mjs)$",
          "^better-auth/client$",
        ],
      },
    },
    {
      name: "better-auth-client-un-seul-module",
      severity: "error",
      comment:
        "F-009-AC24, F-010-AC22 : better-auth/client n'est importé par aucun module du serveur ni d'un paquet, et par un seul module d'apps/web, src/compte/client-auth.ts.",
      from: { pathNot: "^apps/web/src/compte/client-auth\\.ts$" },
      to: {
        path: [
          "(^|/)node_modules/better-auth/dist/client/index\\.(d\\.mts|mjs)$",
          "^better-auth/client$",
        ],
      },
    },
    {
      name: "better-auth-react-et-greffons-interdits",
      severity: "error",
      comment:
        "F-009-AC24 : better-auth/react et better-auth/client/plugins ne sont importés nulle part.",
      from: {},
      to: {
        path: [
          "(^|/)node_modules/better-auth/dist/client/(react|plugins)/",
          "^better-auth/(react|client/plugins)(/|$)",
        ],
      },
    },
    {
      name: "infra-a-part",
      severity: "error",
      comment: "F-008 : aucun fichier d'apps/ ni de packages/ n'importe infra/.",
      from: { path: "^(apps|packages)/" },
      to: { path: "^infra/" },
    },
    {
      name: "serveur-tests-par-les-entrees-de-db",
      severity: "error",
      comment:
        "F-008 : les tests d'apps/server n'atteignent packages/db que par ses deux entrées, @notionlike/db et @notionlike/db/essai.",
      from: { path: "^apps/server/test/" },
      to: { path: "^packages/db/", pathNot: "^packages/db/(src/index|test/essai)\\.ts$" },
    },
    // F-012-AC32, par paquet. Deux expressions par cible, comme pour better-auth : le fichier installé
    // et le nom tel qu'il est écrit, gardé quand le paquet n'est pas installé chez l'importateur.
    {
      name: "hocuspocus-serveur-et-ws-reserves-au-serveur",
      severity: "error",
      comment:
        "F-012-AC32 : hors d'apps/server, aucun fichier (tests compris) n'importe directement @hocuspocus/server ni ws.",
      from: { pathNot: "^apps/server/" },
      to: {
        path: [
          "(^|/)node_modules/(@hocuspocus/server|ws|@types/ws)/",
          "^(@hocuspocus/server|ws)(/|$)",
        ],
      },
    },
    {
      name: "serveur-tests-document-par-son-entree",
      severity: "error",
      comment:
        "F-012-AC29 : apps/server n'atteint packages/document que par son point d'entrée, et seulement depuis ses tests (son code d'exécution ne l'importe pas : serveur-liste-blanche).",
      from: { path: "^apps/server/" },
      to: {
        path: "^(packages/document/|@notionlike/document(/|$))",
        pathNot: "^packages/document/src/index\\.ts$",
      },
    },
    // F-012-AC36 : la fabrique d'essai, seule entrée du manifeste d'apps/server
    // (`@notionlike/server/essai` -> apps/server/test/fabrique.ts).
    {
      name: "fabrique-d-essai-reservee-aux-tests",
      severity: "error",
      comment:
        "F-012-AC36 : la fabrique d'essai du serveur n'est importée que par des fichiers de test d'apps/server et d'apps/web.",
      from: { pathNot: "^apps/(server|web)/test/" },
      to: { path: "^apps/server/test/fabrique\\.ts$" },
    },
    {
      name: "web-tests-serveur-par-la-fabrique",
      severity: "error",
      comment:
        "F-012-AC32, AC36 : les tests d'apps/web n'atteignent apps/server que par la fabrique d'essai (exception unique à apps-isolees).",
      from: { path: "^apps/web/test/" },
      to: {
        path: ["^apps/(?!web/)", "^@notionlike/server(/|$)"],
        pathNot: "^apps/server/test/fabrique\\.ts$",
      },
    },
    {
      name: "web-execution-sans-serveur",
      severity: "error",
      comment:
        "F-012-AC32 : aucun module d'apps/web hors de test/ n'importe @notionlike/server, par quelque sous-chemin que ce soit.",
      from: { path: "^apps/web/", pathNot: "^apps/web/test/" },
      to: { path: ["^apps/server/", "^@notionlike/server(/|$)"] },
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
        "ADR-0003, ADR-0016 : rang, arbre, table et erreurs sont purs ; ils n'importent qu'eux-mêmes (ni yjs, ni format, ni format-table, ni façade).",
      from: { path: "^packages/document/src/(rang|arbre|table|erreurs)\\.ts$" },
      to: { pathNot: "^packages/document/src/(rang|arbre|table|erreurs)\\.ts$" },
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
        "ADR-0007, F-003-AC27, F-010, F-013, F-006, F-018 : hors persistance, espace, navigation, identifiants, édition, page, compte, synchronisation, glisser-déposer, table et vues de table, le code d'apps/web n'importe que src/ (persistance et identifiants exceptés), les exports de @notionlike/document, react et react-dom : ni yjs, ni y-indexeddb, ni dépendance de test, ni module de Node.",
      from: {
        path: "^apps/web/src/",
        pathNot:
          "^apps/web/src/(persistance|espace|navigation|identifiants|edition|page|compte|synchronisation|glisser|table|vues-de-table)/",
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
      name: "web-compte-liste-blanche",
      severity: "error",
      comment:
        "F-010-AC22, F-010-AC27 : le module de compte n'importe que lui-même, l'entrée publique de @notionlike/contrats et better-auth/client (réservé à compte/client-auth.ts par better-auth-client-un-seul-module) : ni React, ni l'interface, ni la persistance.",
      from: { path: "^apps/web/src/compte/" },
      to: {
        pathNot: [
          "^apps/web/src/compte/",
          "^packages/contrats/src/index\\.ts$",
          "(^|/)node_modules/better-auth/dist/client/index\\.(d\\.mts|mjs)$",
          "^better-auth/client$",
        ],
      },
    },
    // F-013-AC38, par paquet. Deux expressions par cible, comme pour better-auth : le fichier installé
    // et le nom tel qu'il est écrit, gardé quand le paquet n'est pas installé chez l'importateur.
    {
      name: "hocuspocus-provider-confine",
      severity: "error",
      comment:
        "F-013-AC38, F-012 H11 : @hocuspocus/provider (et @hocuspocus/common, qu'il emploie) n'est importé que par le module de synchronisation d'apps/web (src/synchronisation/) et par les tests d'apps/server : ni par un autre fichier d'apps/web (tests compris), ni par un paquet, ni par le code d'exécution du serveur.",
      from: { pathNot: "^apps/(web/src/synchronisation|server/test)/" },
      to: {
        path: [
          "(^|/)node_modules/@hocuspocus/(provider|common)/",
          "^@hocuspocus/(provider|common)(/|$)",
        ],
      },
    },
    {
      name: "web-synchronisation-liste-blanche",
      severity: "error",
      comment:
        "F-013-AC38, H13 : le module de synchronisation n'importe que lui-même, l'interface de la persistance, le contrôle de forme des identifiants, les exports de @notionlike/document, l'entrée publique de @notionlike/contrats, yjs et @hocuspocus/provider : ni React, ni l'édition, ni l'interface, ni le compte, ni la session d'espace ou de page.",
      from: { path: "^apps/web/src/synchronisation/" },
      to: {
        pathNot: [
          "^apps/web/src/synchronisation/",
          "^apps/web/src/persistance/index\\.ts$",
          "^apps/web/src/identifiants/",
          "^packages/document/src/index\\.ts$",
          "^packages/contrats/src/index\\.ts$",
          "(^|/)node_modules/(yjs|@hocuspocus/provider)/",
          "^@hocuspocus/provider$",
        ],
      },
    },
    {
      name: "web-synchronisation-par-son-interface",
      severity: "error",
      comment:
        "F-013-AC38 : hors du module de synchronisation et de ses tests (test/synchronisation/), seul son index.ts est importable ; c'est l'interface qui n'expose aucun type du fournisseur.",
      from: { path: "^apps/web/", pathNot: "^apps/web/(src|test)/synchronisation/" },
      to: {
        path: "^apps/web/src/synchronisation/",
        pathNot: "^apps/web/src/synchronisation/index\\.ts$",
      },
    },
    {
      name: "edition-confinee",
      severity: "error",
      comment:
        "F-003-AC27 : Tiptap, ProseMirror et leur liaison Yjs ne sont importés que par le module d'édition (src/edition/) et l'aide de ses tests (test/edition/).",
      from: { path: "^(apps|packages)/", pathNot: "^apps/web/(src|test)/edition/" },
      to: { path: "(^|/)node_modules/(@tiptap|prosemirror-[^/]+|y-prosemirror)/" },
    },
    // F-005-AC33, par paquet. Deux expressions par cible, comme pour better-auth : le fichier installé
    // et le nom tel qu'il est écrit, gardé quand le paquet n'est pas installé chez l'importateur.
    {
      name: "suggestion-et-positionnement-confines",
      severity: "error",
      comment:
        "F-005-AC33, H9 : l'utilitaire de suggestion de Tiptap (@tiptap/suggestion) et la bibliothèque de positionnement (tout paquet @floating-ui/*) ne sont importés que par le module d'édition d'apps/web (src/edition/) : ni par ses tests, ni par un autre fichier d'apps/web, ni par un paquet, ni par le serveur.",
      from: { pathNot: "^apps/web/src/edition/" },
      to: {
        path: [
          "(^|/)node_modules/(@tiptap/suggestion|@floating-ui/[^/]+)/",
          "^(@tiptap/suggestion|@floating-ui/[^/]+)(/|$)",
        ],
      },
    },
    {
      name: "web-edition-par-son-interface",
      severity: "error",
      comment:
        "F-003-AC27 : hors du module d'édition, seul son index.ts est importable (tests compris).",
      from: { path: "^apps/web/", pathNot: "^apps/web/src/edition/" },
      to: { path: "^apps/web/src/edition/", pathNot: "^apps/web/src/edition/index\\.ts$" },
    },
    {
      name: "web-edition-liste-blanche",
      severity: "error",
      comment:
        "F-003-AC27, F-006-AC32, F-005-AC33 : le module d'édition n'importe que lui-même, le composant de présentation de l'édition, les textes de l'interface, react, yjs, les paquets Tiptap qu'il emploie, poignée de bloc (drag-handle, drag-handle-react, node-range), curseur de dépôt (@tiptap/extensions), bloc code (extension-code-block) et utilitaire de suggestion (suggestion) compris, et @floating-ui/dom (placement du menu slash) ; ni @floating-ui/core, ni @floating-ui/utils, ni @dnd-kit/*.",
      from: { path: "^apps/web/src/edition/" },
      to: {
        pathNot: [
          "^apps/web/src/edition/",
          "^apps/web/src/interface/composants/Edition\\.tsx$",
          "^apps/web/src/interface/messages\\.ts$",
          "(^|/)node_modules/(react|yjs)/",
          "(^|/)node_modules/@tiptap/(core|pm|react|extensions|suggestion|extension-(bold|code-block|collaboration|document|drag-handle|drag-handle-react|heading|italic|link|list|node-range|paragraph|text))/",
          "(^|/)node_modules/@floating-ui/dom/",
        ],
      },
    },
    // F-006-AC32, par paquet. Deux expressions par cible, comme pour better-auth : le fichier installé
    // et le nom tel qu'il est écrit, gardé quand le paquet n'est pas installé chez l'importateur.
    {
      name: "dnd-kit-confine",
      severity: "error",
      comment:
        "F-006-AC32, H6 : la bibliothèque de glisser-déposer (tout paquet @dnd-kit/*) n'est importée que par le module de glisser-déposer d'apps/web (src/glisser/) : ni par un autre fichier d'apps/web (tests compris), ni par un paquet, ni par le serveur.",
      from: { pathNot: "^apps/web/src/glisser/" },
      to: { path: ["(^|/)node_modules/@dnd-kit/", "^@dnd-kit/"] },
    },
    {
      name: "web-glisser-liste-blanche",
      severity: "error",
      comment:
        "F-006-AC32, ADR-0015 : le module de glisser-déposer n'importe que lui-même, react et les trois paquets de l'ancienne famille dnd-kit (core, sortable, utilities) : ni react-dom, ni le document, ni l'interface, ni bibliothèque d'animation.",
      from: { path: "^apps/web/src/glisser/" },
      to: {
        pathNot: [
          "^apps/web/src/glisser/",
          "(^|/)node_modules/react/",
          "(^|/)node_modules/@dnd-kit/(core|sortable|utilities)/",
        ],
      },
    },
    {
      name: "web-glisser-par-son-interface",
      severity: "error",
      comment:
        "F-006-AC32 : hors du module de glisser-déposer et de ses tests (test/glisser/), seul son index.ts est importable ; c'est l'interface qui n'expose aucun type de dnd-kit.",
      from: { path: "^apps/web/", pathNot: "^apps/web/(src|test)/glisser/" },
      to: { path: "^apps/web/src/glisser/", pathNot: "^apps/web/src/glisser/index\\.ts$" },
    },
    {
      name: "web-destination-pure",
      severity: "error",
      comment:
        "F-006-AC4 : le calcul de la destination d'un déplacement de page est sans DOM ni bibliothèque ; il n'importe que les exports de @notionlike/document et les parcours purs de l'arborescence (interface/pages.ts).",
      from: { path: "^apps/web/src/interface/destination-de-page\\.ts$" },
      to: {
        pathNot: ["^packages/document/src/index\\.ts$", "^apps/web/src/interface/pages\\.ts$"],
      },
    },
    {
      name: "web-page-liste-blanche",
      severity: "error",
      comment:
        "F-003 : la session de page n'importe qu'elle-même, l'interface de la persistance, la garde d'onglet, les exports de @notionlike/document et yjs (ni React, ni Tiptap).",
      from: { path: "^apps/web/src/page/" },
      to: {
        pathNot: [
          "^apps/web/src/page/",
          "^apps/web/src/persistance/index\\.ts$",
          "^apps/web/src/espace/garde-onglet\\.ts$",
          "^packages/document/src/index\\.ts$",
          "(^|/)node_modules/yjs/",
        ],
      },
    },
    {
      name: "web-table-liste-blanche",
      severity: "error",
      comment:
        "F-018, ADR-0019 : la session de table n'importe qu'elle-même, l'interface de la persistance, la garde d'onglet, les exports de @notionlike/document et yjs (ni React, ni les vues de table).",
      from: { path: "^apps/web/src/table/" },
      to: {
        pathNot: [
          "^apps/web/src/table/",
          "^apps/web/src/persistance/index\\.ts$",
          "^apps/web/src/espace/garde-onglet\\.ts$",
          "^packages/document/src/index\\.ts$",
          "(^|/)node_modules/yjs/",
        ],
      },
    },
    {
      name: "web-vues-de-table-liste-blanche",
      severity: "error",
      comment:
        "F-018-AC54, ADR-0019 : le module des vues de table n'importe que lui-même, l'interface de la persistance (réglages de vue), le type d'état de la session de table, les composants de présentation, les textes et les raccourcis de l'interface, les exports de @notionlike/document, react, react-dom et la seule bibliothèque de table admise : ni yjs (aucun type partagé lu ou écrit), ni bibliothèque de défilement virtuel, de dates ou de glisser-déposer.",
      from: { path: "^apps/web/src/vues-de-table/" },
      to: {
        pathNot: [
          "^apps/web/src/vues-de-table/",
          "^apps/web/src/persistance/index\\.ts$",
          "^apps/web/src/table/session-table\\.ts$",
          "^apps/web/src/interface/composants/",
          "^apps/web/src/interface/(messages|raccourcis)\\.ts$",
          "^packages/document/src/index\\.ts$",
          "(^|/)node_modules/(react|react-dom|@tanstack/react-table)/",
          "^@tanstack/react-table$",
        ],
      },
    },
    {
      name: "web-vues-de-table-par-son-interface",
      severity: "error",
      comment:
        "F-018-AC54 : hors du module des vues de table et de ses tests (test/vues-de-table/), seul son index.ts est importable ; c'est l'interface qui n'expose aucun type de bibliothèque.",
      from: { path: "^apps/web/", pathNot: "^apps/web/(src|test)/vues-de-table/" },
      to: {
        path: "^apps/web/src/vues-de-table/",
        pathNot: "^apps/web/src/vues-de-table/index\\.ts$",
      },
    },
    // F-018-AC54, par paquet. Deux expressions par cible, comme pour better-auth : le fichier installé
    // et le nom tel qu'il est écrit, gardé quand le paquet n'est pas installé chez l'importateur.
    {
      name: "bibliotheque-de-table-reservee-aux-vues-de-table",
      severity: "error",
      comment:
        "F-018-AC54, H8 : aucun paquet @tanstack/* n'est importé hors du module des vues de table d'apps/web (tests compris, ceux du module exceptés) ; le module lui-même n'admet que @tanstack/react-table (web-vues-de-table-liste-blanche).",
      from: { pathNot: "^apps/web/(src|test)/vues-de-table/" },
      to: { path: ["(^|/)node_modules/@tanstack/", "^@tanstack/"] },
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

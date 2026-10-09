// Règles objectives du CRAFT GATE : ce fichier est protégé (Agent: dev uniquement).
import js from "@eslint/js";
import tseslint from "typescript-eslint";

const COMPLEXITE_CYCLOMATIQUE_MAX = 10;
const NOMBRES_NON_MAGIQUES = [-1, 0, 1, 2];
const GLOBALES_INTERDITES_DOCUMENT = [
  "window",
  "document",
  "navigator",
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "EventSource",
  "indexedDB",
  "localStorage",
  "sessionStorage",
  "process",
].map((name) => ({
  name,
  message: "F-001-AC19 : packages/document/src reste sans DOM, sans réseau et sans stockage.",
}));

const GLOBALES_INTERDITES_WEB = [
  ["fetch", "F-002-AC19 : aucune requête réseau depuis apps/web."],
  ["XMLHttpRequest", "F-002-AC19 : aucune requête réseau depuis apps/web."],
  ["WebSocket", "F-002-AC19 : aucune requête réseau depuis apps/web."],
  ["EventSource", "F-002-AC19 : aucune requête réseau depuis apps/web."],
  ["localStorage", "ADR-0008 : rien n'est conservé hors du module de persistance."],
  ["sessionStorage", "ADR-0008 : rien n'est conservé hors du module de persistance."],
].map(([name, message]) => ({ name, message }));
const GLOBALE_INDEXEDDB = {
  name: "indexedDB",
  message: "F-002-AC22 : seul apps/web/src/persistance appelle IndexedDB.",
};
const GLOBALES_D_ENTREE_SORTIE_WEB = [
  "window",
  "self",
  "globalThis",
  "document",
  "location",
  "history",
  "navigator",
  "crypto",
].map((name) => ({
  name,
  message: "ADR-0007, ADR-0008 : ce fichier est un calcul pur, sans DOM, adresse ni stockage.",
}));
const FICHIERS_PURS_WEB = [
  "apps/web/src/identifiants/**",
  "apps/web/src/navigation/route.ts",
  "apps/web/src/persistance/nom-de-base.ts",
];
const FICHIERS_NOM_DE_BASE_WEB = [
  "apps/web/src/persistance/nom-de-base.ts",
  "apps/web/src/persistance/espace-local.ts",
];
const PROPRIETES_INTERDITES_WEB = [
  ["random", "Math", "F-002-AC26 : aucun identifiant ni aléa hors de crypto.randomUUID."],
  ["getRandomValues", undefined, "F-002-AC26 : aucun générateur de secours."],
  ["pushState", undefined, "F-002 H4 : le fragment s'écrit par location.hash."],
  ["replaceState", undefined, "F-002 H4 : le fragment s'écrit par location.hash."],
  ["sendBeacon", undefined, "F-002-AC19 : aucune requête réseau depuis apps/web."],
  ["innerHTML", undefined, "F-002-AC18 : un titre s'affiche comme du texte."],
  ["outerHTML", undefined, "F-002-AC18 : un titre s'affiche comme du texte."],
  ["insertAdjacentHTML", undefined, "F-002-AC18 : un titre s'affiche comme du texte."],
  ["transact", undefined, "ADR-0007 : pas de transaction englobante, lire() y serait en retard."],
  ["getMap", undefined, "F-002-AC22 : le document se lit par @notionlike/document."],
  ["getArray", undefined, "F-002-AC22 : le document se lit par @notionlike/document."],
  ["getText", undefined, "F-002-AC22 : le document se lit par @notionlike/document."],
  ["getXmlFragment", undefined, "F-002-AC22 : le document se lit par @notionlike/document."],
  ["getXmlElement", undefined, "F-002-AC22 : le document se lit par @notionlike/document."],
].map(([property, object, message]) =>
  object === undefined ? { property, message } : { object, property, message },
);
const PROPRIETE_RANDOMUUID = {
  property: "randomUUID",
  message: "F-002-AC26 : crypto.randomUUID n'est lue que par apps/web/src/espace.",
};
const SYNTAXE_HTML_BRUT = {
  selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
  message: "F-002-AC18 : un titre s'affiche comme du texte.",
};
const SYNTAXES_NOM_DE_BASE = [
  "Literal[value=/notionlike:/]",
  "TemplateElement[value.raw=/notionlike:/]",
].map((selector) => ({
  selector,
  message: "F-002-AC25 : seuls nom-de-base.ts et espace-local.ts écrivent un nom de base.",
}));

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/coverage/**",
      "**/playwright-report/**",
      "**/test-results/**",
      ".agents/**",
      ".claude/**",
      ".githooks/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      complexity: ["error", COMPLEXITE_CYCLOMATIQUE_MAX],
      eqeqeq: ["error", "always"],
      "no-empty": ["error", { allowEmptyCatch: false }],
      "no-console": ["error", { allow: ["warn", "error"] }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-magic-numbers": [
        "error",
        {
          ignore: NOMBRES_NON_MAGIQUES,
          ignoreEnums: true,
          ignoreNumericLiteralTypes: true,
          ignoreReadonlyClassProperties: true,
          ignoreDefaultValues: true,
        },
      ],
    },
  },
  {
    files: ["**/*.test.*", "**/*.spec.*", "**/test/**", "**/e2e/**", "**/*.config.*"],
    rules: { "@typescript-eslint/no-magic-numbers": "off" },
  },
  {
    files: ["packages/document/src/**"],
    rules: {
      "no-restricted-globals": [
        "error",
        {
          globals: GLOBALES_INTERDITES_DOCUMENT,
          checkGlobalObject: true,
        },
      ],
    },
  },
  {
    files: ["apps/web/src/**"],
    languageOptions: { globals: { window: "readonly", self: "readonly" } },
    rules: {
      "no-restricted-globals": [
        "error",
        { globals: [...GLOBALES_INTERDITES_WEB, GLOBALE_INDEXEDDB], checkGlobalObject: true },
      ],
      "no-restricted-properties": ["error", ...PROPRIETES_INTERDITES_WEB, PROPRIETE_RANDOMUUID],
      "no-restricted-syntax": ["error", SYNTAXE_HTML_BRUT, ...SYNTAXES_NOM_DE_BASE],
    },
  },
  {
    files: ["apps/web/src/**"],
    rules: {
      "max-lines-per-function": ["error", { max: 50, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    files: ["apps/web/src/persistance/**"],
    rules: {
      "no-restricted-globals": [
        "error",
        { globals: GLOBALES_INTERDITES_WEB, checkGlobalObject: true },
      ],
    },
  },
  {
    files: FICHIERS_NOM_DE_BASE_WEB,
    rules: {
      "no-restricted-syntax": ["error", SYNTAXE_HTML_BRUT],
    },
  },
  {
    files: ["apps/web/src/espace/**"],
    rules: {
      "no-restricted-properties": ["error", ...PROPRIETES_INTERDITES_WEB],
    },
  },
  {
    files: FICHIERS_PURS_WEB,
    rules: {
      "no-restricted-globals": [
        "error",
        {
          globals: [...GLOBALES_INTERDITES_WEB, GLOBALE_INDEXEDDB, ...GLOBALES_D_ENTREE_SORTIE_WEB],
          checkGlobalObject: true,
        },
      ],
    },
  },
  {
    files: ["**/*.cjs"],
    languageOptions: {
      sourceType: "commonjs",
      globals: { module: "writable", require: "readonly", __dirname: "readonly" },
    },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
);

// Couture d'apps/server avec @notionlike/contrats et @notionlike/db : les fichiers de src/ sont lus
// comme du texte et chaque nom qu'ils font entrer de ces deux paquets est énuméré ici. Un appelant
// de plus, ou un nom de plus, fait échouer ce test : il se déclare, avec le test qui l'exerce.
import { readdirSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const SRC = new URL("../src/", import.meta.url);
const SERVEUR = new URL("../", import.meta.url);
const RACINE = new URL("../../../", import.meta.url);
const PAQUETS = ["@notionlike/contrats", "@notionlike/db"] as const;

type Entrees = Readonly<Record<string, readonly string[]>>;

// Les noms importés d'un paquet par un texte source, `type` retiré, triés ; un import qui n'est
// pas une liste de noms (espace de noms, défaut, effet de bord, import dynamique) est rendu tel quel.
function nomsImportes(texte: string, paquet: string): string[] {
  const declaration = new RegExp(
    `import\\s+(?:type\\s+)?([^;]*?)\\s+from\\s+"${paquet}(/[^"]*)?"`,
    "g",
  );
  const autres = new RegExp(`(?:import|require)\\s*\\(?\\s*"${paquet}(?:/[^"]*)?"\\)?`, "g");
  const noms = [...texte.matchAll(declaration)].flatMap(([, liste = "", sousChemin = ""]) =>
    /^\{[^}]*\}$/.test(liste) && sousChemin === ""
      ? liste
          .slice(1, -1)
          .split(",")
          .map((nom) => nom.trim().replace(/^type\s+/, ""))
      : [`${liste} depuis ${paquet}${sousChemin}`],
  );
  return [...noms.filter((nom) => nom !== ""), ...(texte.match(autres) ?? [])].sort();
}

function entreesDe(fichiers: ReadonlyMap<string, string>, paquet: string): Entrees {
  const entrees = [...fichiers].map(([nom, texte]) => [nom, nomsImportes(texte, paquet)] as const);
  return Object.fromEntries(entrees.filter(([, noms]) => noms.length > 0));
}

const sources = new Map(
  readdirSync(SRC).map((nom) => [nom, readFileSync(new URL(nom, SRC), "utf8")] as const),
);

describe("appelants des deux paquets", () => {
  it("F-008-AC23 F-009-AC23 F-011-AC31 F-027-AC19 F-012-AC27 les fichiers d'apps/server/src qui consomment @notionlike/contrats sont énumérés", () => {
    expect(entreesDe(sources, "@notionlike/contrats")).toEqual({
      "adhesions.ts": ["Role"],
      "application.ts": ["CHEMINS", "ReponsePret", "ReponseSante"],
      "autorisation.ts": ["Action", "MATRICE_DES_DROITS", "Role"],
      "comptes.ts": [
        "CHEMINS_COMPTES",
        "schemaCompte",
        "schemaCompteNatif",
        "schemaCorpsConnexion",
        "schemaCorpsInscription",
      ],
      "enveloppe.ts": ["CodeErreur", "EnveloppeErreur"],
      // F-027-AC19 : le module de la gestion du compte.
      "gestion-du-compte.ts": [
        "CHEMINS_DU_COMPTE",
        "PLAFONDS_DU_COMPTE",
        "SessionDuCompte",
        "schemaCompte",
        "schemaCorpsChangementDeMotDePasse",
        "schemaCorpsChangementDeNom",
        "schemaCorpsRevocation",
        "schemaListeSessions",
        "schemaRevocationDesAutres",
      ],
      "espaces.ts": [
        "Action",
        "CHEMINS_ESPACES",
        "FORME_DU_JETON",
        "Methode",
        "QUOTAS",
        "schemaCorpsAcceptation",
        "schemaCorpsChangementDeRole",
        "schemaCorpsCreationEspace",
        "schemaCorpsCreationInvitation",
        "schemaCorpsRenommage",
        "schemaEspace",
        "schemaInvitationCreee",
        "schemaListeEspaces",
        "schemaListeInvitations",
        "schemaListeMembres",
        "schemaListeMembresVueParUnProprietaire",
        "schemaMembreVuParUnProprietaire",
      ],
      // F-012-AC27 : la synchronisation, par ses quatre modules.
      "synchro-acces.ts": [
        "DocumentNomme",
        "LONGUEUR_MAX_DU_NOM_DE_DOCUMENT",
        "Role",
        "nomDeDocument",
        "schemaNomDeDocument",
      ],
      "synchro-reglages.ts": ["LIMITES_SYNCHRO", "LimitesSynchro"],
      // F-012-AC7 : la borne de l'adresse d'un message.
      "synchro-relais.ts": ["LONGUEUR_MAX_DU_NOM_DE_DOCUMENT"],
      "synchro-stockage.ts": [
        "DocumentNomme",
        "VERSION_DU_DOCUMENT_D_ESPACE",
        "schemaNomDeDocument",
      ],
      "synchronisation.ts": [
        "CHEMIN_SYNCHRO",
        "CODE_DE_FERMETURE_A_L_ARRET",
        "LONGUEUR_MAX_DU_NOM_DE_DOCUMENT",
      ],
    });
  });

  it("F-008-AC23 F-009-AC23 F-011-AC32 F-027-AC20 F-012-AC31 les fichiers d'apps/server/src qui consomment @notionlike/db sont énumérés", () => {
    expect(entreesDe(sources, "@notionlike/db")).toEqual({
      // F-011-AC32 : le seul module qui écrit une adhésion.
      "adhesions.ts": [
        "Acceptation",
        "AdhesionSupprimee",
        "Base",
        "CreationEspace",
        "IssueAcceptation",
        "IssueChangementDeRole",
        "IssueCreationEspace",
        "IssueRetrait",
        "MembreVise",
        "accepterInvitation",
        "changerRole",
        "creerEspace",
        "retirerMembre",
        "supprimerEspace",
      ],
      "application.ts": ["Base", "ErreurBase"],
      "assemblage.ts": ["Base"],
      "authentification.ts": ["Base", "SessionSupprimee", "schemaComptes"],
      // F-011-AC32 : le seul module qui lit une adhésion pour autoriser.
      "autorisation.ts": ["Base", "EspaceDuMembre", "lireAdhesion"],
      "espaces.ts": [
        "Base",
        "EspaceDuMembre",
        "InvitationLue",
        "creerInvitation",
        "listerEspaces",
        "listerInvitationsEnAttente",
        "listerMembres",
        "renommerEspace",
        "revoquerInvitation",
      ],
      // F-027 H1 : le seul module qui écrit le nom et l'empreinte d'un compte et lit ses sessions.
      "gestion-du-compte.ts": [
        "Base",
        "SessionDuCompteLue",
        "ecrireEmpreinte",
        "lireEmpreinte",
        "listerSessions",
        "renommerCompte",
        "verrouillerSessionDuCompte",
      ],
      "journal.ts": ["CodeErreurBase"],
      "main.ts": ["ouvrirBase"],
      "service.ts": ["Base"],
      "sessions.ts": ["Base", "SessionSupprimee", "SessionsVisees", "supprimerSessions"],
      "synchro-acces.ts": ["Base"],
      // F-012-AC18 à AC21, AC24 : le seul module qui lit, écrit ou compte des instantanés.
      "synchro-stockage.ts": ["Base", "compterDocuments", "enregistrerDocument", "lireDocument"],
      "synchronisation.ts": ["Base"],
    });
  });

  it.each(PAQUETS)("F-008-AC23 un import de %s hors de la liste de noms est vu", (paquet) => {
    const fautifs = new Map([
      ["nom-en-plus.ts", `import { type Base, ouvrirPilotePg } from "${paquet}";`],
      ["espace-de-noms.ts", `import * as tout from "${paquet}";`],
      ["sous-chemin.ts", `import { ouvrirBaseEmbarquee } from "${paquet}/essai";`],
      ["dynamique.ts", `const paquet = await import("${paquet}");`],
      ["sans-import.ts", `export const texte = "${paquet}";`],
    ]);

    expect(entreesDe(fautifs, paquet)).toEqual({
      "nom-en-plus.ts": ["Base", "ouvrirPilotePg"],
      "espace-de-noms.ts": [`* as tout depuis ${paquet}`],
      "sous-chemin.ts": [`{ ouvrirBaseEmbarquee } depuis ${paquet}/essai`],
      "dynamique.ts": [`import("${paquet}")`],
    });
  });
});

// Couture de F-008-AC25 : `demarrerServeur` rejette désormais quand l'écoute échoue, et `servir`
// reçoit la base et le processus au lieu de les prendre lui-même. Leurs appelants sont énumérés :
// `service.ts` change le rejet en phrase fixe (service.test.ts), `aides.ts` et `comptes-echec.test.ts`
// (F-009, doublure de l'authentification) le laissent monter au test qui lance le serveur ;
// `main.ts` et les entrées d'essai donnent à `servir` ses dépendances.
function appelantsDe(nom: string): string[] {
  const appel = new RegExp(`(?<!function )\\b${nom}\\(`);
  return readdirSync(SERVEUR, { recursive: true, encoding: "utf8" })
    .filter((chemin) => /^(src|test)\/.*\.ts$/.test(chemin))
    .filter((chemin) => appel.test(readFileSync(new URL(chemin, SERVEUR), "utf8")))
    .sort();
}

describe("appelants de l'écoute et du service", () => {
  it("F-008-AC25 les fichiers qui appellent demarrerServeur sont énumérés", () => {
    expect(appelantsDe("demarrerServeur")).toEqual([
      "src/service.ts",
      "test/aides.ts",
      "test/comptes-echec.test.ts",
      // F-012-AC36 : la fabrique d'essai, avec le passage en WebSocket.
      "test/fabrique.ts",
      "test/service.test.ts",
    ]);
  });

  it("F-008-AC26 les fichiers qui appellent servir sont énumérés", () => {
    expect(appelantsDe("servir")).toEqual([
      "src/main.ts",
      "test/essai/main-base-embarquee.ts",
      "test/essai/main-fermeture-en-echec.ts",
      "test/service.test.ts",
    ]);
  });
});

// Couture de F-012 : `adresseDe` et `enTetesPourBetterAuth` reçoivent un type structurel (une
// requête d'Express le satisfait, la demande de passage en WebSocket aussi, par un adaptateur), et
// `enTetesPourBetterAuth` est exporté ; le journal gagne `evenementDeSynchro`. Leurs appelants et
// les implémentations du journal sont énumérés : chacun est exercé par ses tests de bout en bout
// (routes de F-009, F-011, F-027 ; `synchro-connexion.test.ts` pour la synchronisation).
function implementationsDuJournal(): string[] {
  const methode = /(?<![.\w])evenementDeCompte\s*\(/;
  return readdirSync(SERVEUR, { recursive: true, encoding: "utf8" })
    .filter((chemin) => /^(src|test)\/.*\.ts$/.test(chemin))
    .filter((chemin) => methode.test(readFileSync(new URL(chemin, SERVEUR), "utf8")))
    .sort();
}

describe("appelants des fonctions élargies par F-012", () => {
  it("F-012-AC26 F-012-AC31 les appelants de adresseDe sont énumérés", () => {
    expect(appelantsDe("adresseDe")).toEqual([
      "src/comptes.ts",
      "src/gestion-du-compte.ts",
      "src/synchronisation.ts",
    ]);
  });

  it("F-012-AC1 F-012-AC31 les appelants de enTetesPourBetterAuth sont énumérés", () => {
    expect(appelantsDe("enTetesPourBetterAuth")).toEqual([
      "src/comptes.ts",
      "src/synchronisation.ts",
    ]);
  });

  it("F-012-AC26 le journal n'a qu'une implémentation, et ses constructeurs sont énumérés", () => {
    expect(implementationsDuJournal()).toEqual(["src/journal.ts"]);
    expect(appelantsDe("creerJournal")).toEqual([
      "src/service.ts",
      "test/aides.ts",
      "test/comptes-echec.test.ts",
      "test/couture-espaces.test.ts",
      "test/fabrique.ts",
      "test/suppression.test.ts",
      "test/synchro-coutures.test.ts",
    ]);
  });
});

// Couture de F-031-AC14 : le texte du refus de configuration change de format (raisons, une ligne
// par variable), et ErreurConfiguration change de constructeur. Les fichiers d'apps/, packages/ et
// infra/ qui citent la lecture de la configuration, son erreur, ses constantes factices ou la
// fonction du texte sont énumérés, avec ce qu'ils citent : chacun est exercé par ses tests.
const NOMS_DE_LA_CONFIGURATION = [
  "lireConfiguration",
  "ErreurConfiguration",
  "MOT_DE_PASSE_FACTICE",
  "SECRET_FACTICE",
  "texteDuRefusDeConfiguration",
] as const;
const DOSSIERS_IGNORES = new Set([
  "node_modules",
  "dist",
  "coverage",
  "test-results",
  "playwright-report",
]);
const CODE = /\.(?:[cm]?[jt]s|tsx|sh)$/;

// Les fichiers de code d'un dossier, de proche en proche, par leur chemin depuis la racine.
function fichiersDeCode(dossier: string): Map<string, string> {
  const fichiers = new Map<string, string>();
  for (const entree of readdirSync(new URL(`${dossier}/`, RACINE), { withFileTypes: true })) {
    const chemin = `${dossier}/${entree.name}`;
    if (entree.isDirectory() && !DOSSIERS_IGNORES.has(entree.name)) {
      for (const [sous, texte] of fichiersDeCode(chemin)) {
        fichiers.set(sous, texte);
      }
    } else if (entree.isFile() && CODE.test(entree.name)) {
      fichiers.set(chemin, readFileSync(new URL(chemin, RACINE), "utf8"));
    }
  }
  return fichiers;
}

function citationsDeLaConfiguration(fichiers: ReadonlyMap<string, string>): Entrees {
  const citations = [...fichiers].map(
    ([chemin, texte]) =>
      [
        chemin,
        NOMS_DE_LA_CONFIGURATION.filter((nom) => new RegExp(`\\b${nom}\\b`).test(texte)).sort(),
      ] as const,
  );
  return Object.fromEntries(citations.filter(([, noms]) => noms.length > 0).sort());
}

describe("appelants de la configuration (F-031-AC14)", () => {
  it("F-031-AC14 les fichiers d'apps/, packages/ et infra/ qui citent la configuration, son erreur, ses constantes factices ou le texte du refus sont énumérés", () => {
    const fichiers = new Map(
      ["apps", "packages", "infra"].flatMap((dossier) => [...fichiersDeCode(dossier)]),
    );

    expect(citationsDeLaConfiguration(fichiers)).toEqual({
      "apps/server/src/configuration.ts": [
        "ErreurConfiguration",
        "MOT_DE_PASSE_FACTICE",
        "SECRET_FACTICE",
        "lireConfiguration",
        "texteDuRefusDeConfiguration",
      ],
      // Les deux entrées qui écrivent le texte du refus (F-008-AC12, ADR-0017).
      "apps/server/src/main.ts": [
        "ErreurConfiguration",
        "lireConfiguration",
        "texteDuRefusDeConfiguration",
      ],
      "apps/server/src/verifier-configuration.ts": [
        "ErreurConfiguration",
        "lireConfiguration",
        "texteDuRefusDeConfiguration",
      ],
      // Les aides et les entrées d'essai lisent une configuration acceptée.
      "apps/server/test/aides.ts": ["lireConfiguration"],
      "apps/server/test/configuration.test.ts": [
        "ErreurConfiguration",
        "MOT_DE_PASSE_FACTICE",
        "SECRET_FACTICE",
        "lireConfiguration",
        "texteDuRefusDeConfiguration",
      ],
      "apps/server/test/coutures.test.ts": [
        "ErreurConfiguration",
        "MOT_DE_PASSE_FACTICE",
        "SECRET_FACTICE",
        "lireConfiguration",
        "texteDuRefusDeConfiguration",
      ],
      "apps/server/test/essai/main-base-embarquee.ts": ["lireConfiguration"],
      "apps/server/test/essai/main-fermeture-en-echec.ts": ["lireConfiguration"],
      "apps/server/test/fabrique.ts": ["lireConfiguration"],
      "apps/server/test/processus.test.ts": [
        "MOT_DE_PASSE_FACTICE",
        "SECRET_FACTICE",
        "lireConfiguration",
      ],
      "apps/server/test/service.test.ts": ["lireConfiguration"],
      "apps/server/test/synchro-coutures.test.ts": ["lireConfiguration"],
      "apps/server/test/verifier-configuration.test.ts": [
        "ErreurConfiguration",
        "lireConfiguration",
        "texteDuRefusDeConfiguration",
      ],
      // F-031-AC9 : sa propre valeur factice, en shell, pour POSTGRES_PASSWORD ; la vérification de
      // la configuration du serveur passe par l'entrée de vérification (ADR-0017).
      "infra/pile.sh": ["MOT_DE_PASSE_FACTICE"],
    });
  });

  it("F-031-AC14 un appelant de plus, un nom de plus, ou un fichier hors de src/ et test/ est vu ; un nom qui en contient un autre ne l'est pas", () => {
    const fautifs = new Map([
      [
        "infra/tests/nouveau.test.ts",
        "import { lireConfiguration } from '../../apps/server/src/configuration.ts';",
      ],
      ["infra/script.sh", 'echo "$SECRET_FACTICE"'],
      ["apps/web/src/ailleurs.ts", "if (erreur instanceof ErreurConfiguration) {}"],
      ["apps/web/src/homonyme.ts", "const lireConfigurationDuClient = 1;"],
    ]);

    expect(citationsDeLaConfiguration(fautifs)).toEqual({
      "apps/web/src/ailleurs.ts": ["ErreurConfiguration"],
      "infra/script.sh": ["SECRET_FACTICE"],
      "infra/tests/nouveau.test.ts": ["lireConfiguration"],
    });
  });
});

// ADR-0006 amendé par ADR-0017 : deux fichiers d'apps/server/src touchent au `process` global, les
// deux points d'entrée lancés par `node` ; tout autre module reçoit le processus en dépendance.
function fichiersQuiTouchentAuProcessus(fichiers: ReadonlyMap<string, string>): string[] {
  const sansCommentaires = (texte: string): string => texte.replace(/^\s*\/\/.*$/gm, "");
  return [...fichiers]
    .filter(([, texte]) => /(?<![\w.$])process(?![\w$])/.test(sansCommentaires(texte)))
    .map(([nom]) => nom)
    .sort();
}

describe("le processus global (ADR-0006, ADR-0017)", () => {
  it("F-031-AC14 seuls main.ts et verifier-configuration.ts touchent au process global", () => {
    expect(fichiersQuiTouchentAuProcessus(sources)).toEqual([
      "main.ts",
      "verifier-configuration.ts",
    ]);
  });

  it("F-031-AC14 un usage du process hors d'un commentaire est vu, un commentaire ou un nom voisin ne l'est pas", () => {
    const fautifs = new Map([
      ["lit.ts", "const port = process.env.PORT;"],
      ["recoit.ts", "lancer({ processus: process });"],
      ["commente.ts", "// ne touche pas au `process` global\nconst processus = 1;"],
      ["voisin.ts", "const x = options.process;"],
    ]);

    expect(fichiersQuiTouchentAuProcessus(fautifs)).toEqual(["lit.ts", "recoit.ts"]);
  });
});

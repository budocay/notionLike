// Couture d'apps/server avec @notionlike/contrats et @notionlike/db : les fichiers de src/ sont lus
// comme du texte et chaque nom qu'ils font entrer de ces deux paquets est énuméré ici. Un appelant
// de plus, ou un nom de plus, fait échouer ce test : il se déclare, avec le test qui l'exerce.
import { readdirSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const SRC = new URL("../src/", import.meta.url);
const SERVEUR = new URL("../", import.meta.url);
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
      "synchro-acces.ts": ["DocumentNomme", "Role", "nomDeDocument", "schemaNomDeDocument"],
      "synchro-reglages.ts": ["LIMITES_SYNCHRO", "LimitesSynchro"],
      "synchro-stockage.ts": [
        "DocumentNomme",
        "VERSION_DU_DOCUMENT_D_ESPACE",
        "schemaNomDeDocument",
      ],
      "synchronisation.ts": ["CHEMIN_SYNCHRO", "CODE_DE_FERMETURE_A_L_ARRET"],
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

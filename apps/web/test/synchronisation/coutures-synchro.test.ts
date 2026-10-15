// Coutures du module de synchronisation (F-013-AC8, AC30, AC38, AC39, AC40) : la liste fermée des
// couples (motif, canal) publiée par `packages/contrats`, le confinement du fournisseur, l'instance
// unique de `yjs`, et ce qu'un espace local et le registre de l'appareil ne font ni ne portent.
import { readdirSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { CANAUX_DES_MOTIFS, type CanalDUnMotif, MOTIFS_SYNCHRO } from "@notionlike/contrats";
import { demarrerServeurDEssai, type ServeurDEssai } from "@notionlike/server/essai";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { MESSAGES_DES_MOTIFS } from "../../src/interface/messages-synchronisation.ts";
import {
  conduiteDeConnexion,
  conduiteDOuverture,
  CONDUITES,
} from "../../src/synchronisation/conduites.ts";
import { type Constat, etatAffiche } from "../../src/synchronisation/etat.ts";
import {
  adopterEtAttendre,
  attendreQue,
  contenuDeLAppareil,
  entreeDuRegistre,
  fermerLesOnglets,
  ouvrirUnOnglet,
  pause,
  requetesVues,
} from "./aides-synchro.ts";

vi.setConfig({ testTimeout: 45_000 });

const WEB = fileURLToPath(new URL("../../", import.meta.url));
const RACINE = fileURLToPath(new URL("../../../../", import.meta.url));
const SOURCES = join(WEB, "src");
const MODULE = join(SOURCES, "synchronisation");

function fichiersDe(dossier: string): string[] {
  return readdirSync(dossier, { recursive: true, encoding: "utf8" })
    .filter((nom) => /\.tsx?$/.test(nom))
    .map((nom) => join(dossier, nom));
}

/** Le code, sans ses commentaires : une mention en commentaire n'est ni un import ni un appel. */
function codeDe(chemin: string): string {
  return readFileSync(chemin, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

function relatif(chemin: string): string {
  return relative(WEB, chemin).split("\\").join("/");
}

// ---------------------------------------------------------------------------------------------
// F-013-AC30 : chaque couple publié, sa conduite, son message, et le test qui le provoque.

function cleDu(motif: string, canal: CanalDUnMotif): string {
  return "statut" in canal
    ? `${motif} ${canal.canal} ${String(canal.statut)}`
    : `${motif} ${canal.canal}`;
}

/** Couple publié → fichier de test et fragment du titre du test qui le provoque sur le serveur réel. */
const PREUVES: Readonly<Record<string, readonly [string, string]>> = {
  "non-authentifie refus-de-connexion 401": ["refus.test.ts", "« non-authentifie » 401"],
  "non-authentifie fermeture-de-connexion": [
    "connexion.test.ts",
    "une fermeture « non-authentifie »",
  ],
  "origine-refusee refus-de-connexion 403": ["refus.test.ts", "« origine-refusee » 403"],
  "acces-refuse refus-d-ouverture": ["refus.test.ts", "« acces-refuse » en refus d'ouverture"],
  "acces-refuse fermeture-d-ouverture": [
    "motifs.test.ts",
    "un retrait fait fermer les ouvertures par acces-refuse",
  ],
  "droits-modifies fermeture-d-ouverture": ["motifs.test.ts", "promu, le lecteur rouvre"],
  "nom-de-document-invalide refus-d-ouverture": ["motifs.test.ts", "« nom-de-document-invalide »"],
  "document-trop-grand fermeture-d-ouverture": ["motifs.test.ts", "« document-trop-grand »"],
  "quota-atteint refus-de-connexion 429": ["refus.test.ts", "« quota-atteint » 429"],
  "quota-atteint refus-de-connexion 503": ["refus.test.ts", "« quota-atteint » 503"],
  "quota-atteint refus-d-ouverture": [
    "motifs.test.ts",
    "« quota-atteint » : le document qui dépasse",
  ],
  "quota-atteint fermeture-d-ouverture": [
    "refus.test.ts",
    "« quota-atteint » en fermeture d'ouverture",
  ],
  "trop-de-requetes fermeture-de-connexion": [
    "connexion.test.ts",
    "une fermeture « trop-de-requetes »",
  ],
  "message-trop-grand fermeture-sans-raison": ["volume.test.ts", "après une fermeture 1009"],
  "erreur-interne refus-de-connexion 500": ["refus.test.ts", "« erreur-interne » 500"],
  "erreur-interne refus-d-ouverture": [
    "motifs.test.ts",
    "« erreur-interne » : l'ouverture est rouverte",
  ],
  "erreur-interne fermeture-d-ouverture": [
    "refus.test.ts",
    "« erreur-interne » en fermeture d'ouverture",
  ],
  "erreur-interne fermeture-de-connexion": [
    "refus.test.ts",
    "« erreur-interne » en fermeture de connexion",
  ],
  "version-refusee fermeture-d-ouverture": ["motifs.test.ts", "« version-refusee »"],
};

const COUPLES = MOTIFS_SYNCHRO.flatMap((motif) =>
  CANAUX_DES_MOTIFS[motif].map((canal) => ({ motif, canal, cle: cleDu(motif, canal) })),
);

function echapper(texte: string): string {
  return texte.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

describe("F-013-AC30 liste fermée des motifs et de leurs canaux", () => {
  it("F-013-AC30 chaque couple publié a une preuve, et aucune preuve ne vise un couple qui ne l'est pas", () => {
    expect(new Set(Object.keys(PREUVES))).toEqual(new Set(COUPLES.map(({ cle }) => cle)));
  });

  it.each(COUPLES)(
    "F-013-AC30 $cle : une conduite, un message français, un test sur le serveur réel",
    ({ motif, canal, cle }) => {
      expect(CONDUITES[motif][canal.canal]).toBeDefined();
      const message = MESSAGES_DES_MOTIFS[motif][canal.canal];
      expect(message?.trim()).toMatch(/[a-zàâçéèêëîïôûù]{3}/i);
      const [fichier, fragment] = PREUVES[cle] ?? ["", ""];
      const texte = readFileSync(fileURLToPath(new URL(fichier, import.meta.url)), "utf8");
      expect(texte).toMatch(new RegExp(`it\\(\\s*"F-013-AC[^"]*${echapper(fragment)}`));
    },
  );

  it("F-013-AC30 un motif absent de la liste publiée bloque l'ouverture ; une raison inconnue fait reprendre la connexion", () => {
    expect(conduiteDOuverture("motif-de-demain", true)).toBe("bloquer");
    expect(conduiteDOuverture("motif-de-demain", false)).toBe("bloquer");
    expect(conduiteDeConnexion(1008, "motif-de-demain")).toBe("reprendre");
    // La raison décide, jamais le code (F-013-AC21).
    expect(conduiteDeConnexion(1008, "trop-de-requetes")).toBe("ralentir");
    expect(conduiteDeConnexion(4000, "trop-de-requetes")).toBe("ralentir");
  });
});

// ---------------------------------------------------------------------------------------------
// F-013-AC38, AC8 : confinement.

describe("F-013-AC38 confinement du fournisseur et de la WebSocket", () => {
  it("F-013-AC38 seul le module de synchronisation importe le fournisseur ou nomme WebSocket dans son code", () => {
    const hors = fichiersDe(SOURCES)
      .filter((chemin) => !chemin.startsWith(`${MODULE}/`))
      .filter((chemin) => /@hocuspocus\/|\bWebSocket\b/.test(codeDe(chemin)))
      .map(relatif);
    expect(hors).toEqual([]);
    const dedans = fichiersDe(MODULE)
      .filter((chemin) => /from "@hocuspocus\/provider"/.test(codeDe(chemin)))
      .map(relatif);
    expect(dedans.length).toBeGreaterThan(0);
  });

  it("F-013-AC38 le module n'importe ni React, ni l'édition, ni l'interface, ni le compte, ni les sessions", () => {
    const interdits = fichiersDe(MODULE).flatMap((chemin) =>
      [...codeDe(chemin).matchAll(/from "([^"]+)"/g)]
        .map(([, cible = ""]) => cible)
        .filter((cible) =>
          /^(react|react-dom)(\/|$)|^@tiptap\/|\.\.\/(edition|interface|compte|espace|page)\//.test(
            cible,
          ),
        )
        .map((cible) => `${relatif(chemin)} → ${cible}`),
    );
    expect(interdits).toEqual([]);
  });

  it("F-013-AC38 l'interface du module n'expose aucun type du fournisseur", () => {
    const interfaceDuModule = codeDe(join(MODULE, "index.ts"));
    expect(interfaceDuModule).not.toMatch(/hocuspocus|Provider|ouverture\.ts|connexion\.ts/i);
  });

  it("F-013-AC8 le module ne lit aucun cookie et ne pose aucun en-tête d'autorisation", () => {
    const fautifs = fichiersDe(MODULE)
      .filter((chemin) =>
        /document\.cookie|Authorization|localStorage|sessionStorage/.test(codeDe(chemin)),
      )
      .map(relatif);
    expect(fautifs).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// F-013-AC39 : une seule instance de yjs.

describe("F-013-AC39 une seule instance de yjs", () => {
  it("F-013-AC39 le fichier de verrouillage ne résout qu'une version de yjs, de y-protocols et de lib0", () => {
    const verrou = readFileSync(join(RACINE, "pnpm-lock.yaml"), "utf8");
    for (const paquet of ["yjs", "y-protocols", "lib0"]) {
      const versions = new Set(
        [
          ...verrou.matchAll(new RegExp(`(?:^|[\\s'(/])${echapper(paquet)}@(\\d[\\w.-]*)`, "gm")),
        ].map(([, version]) => version),
      );
      expect([...versions], paquet).toHaveLength(1);
    }
  });

  it("F-013-AC39 le yjs que le fournisseur importe est le fichier même qu'apps/web importe", () => {
    const depuisWeb = createRequire(join(WEB, "package.json"));
    const depuisLeFournisseur = createRequire(depuisWeb.resolve("@hocuspocus/provider"));
    const paquetDe = (chemin: string): string => {
      const reel = realpathSync(chemin);
      return reel.slice(0, reel.lastIndexOf("/node_modules/yjs/") + "/node_modules/yjs/".length);
    };
    expect(paquetDe(depuisLeFournisseur.resolve("yjs"))).toBe(paquetDe(depuisWeb.resolve("yjs")));
    expect(paquetDe(depuisWeb.resolve("yjs"))).toContain("/node_modules/yjs/");
  });
});

// ---------------------------------------------------------------------------------------------
// F-013-AC40 : un espace local ne parle pas au serveur ; le registre ne porte rien du compte.

let serveur: ServeurDEssai;
beforeAll(async () => {
  serveur = await demarrerServeurDEssai();
});
afterAll(async () => {
  await serveur.fermer();
});
afterEach(() => {
  fermerLesOnglets();
});

describe("F-013-AC40 couture avec F-002, F-007 et F-010", () => {
  it("F-013-AC40 compte connecté, un espace local n'ouvre aucune WebSocket et n'émet aucune requête, quoi qu'on y fasse", async () => {
    const membre = await serveur.inscrire();
    const requetes = requetesVues.length;
    const onglet = await ouvrirUnOnglet({
      serveur,
      cookie: membre.cookie,
      idEspace: crypto.randomUUID(),
    });
    await attendreQue(() => onglet.synchro.lireEtat().registreLu);
    const idPage = onglet.facade.creerPage("Locale");
    onglet.facade.renommerPage(idPage, "Toujours locale");
    onglet.facade.mettreALaCorbeille(idPage);
    onglet.signaler("reseau");
    onglet.signaler("visible");
    await pause(1500);

    expect(onglet.synchro.lireEtat().affiche).toBe("local");
    expect(onglet.reseau.ouvertes()).toBe(0);
    expect(requetesVues.length).toBe(requetes);
    // L'interface du module : des fonctions, aucun objet du fournisseur.
    expect(Object.keys(onglet.synchro).sort()).toEqual(
      [
        "abonner",
        "adopter",
        "afficherPage",
        "effacerLaCopieLocale",
        "fermer",
        "lireEtat",
        "reessayer",
        "reessayerLeDocument",
        "toutEstAcquitte",
      ].sort(),
    );
  });

  it("F-013-AC40 le registre de l'appareil ne porte ni nom, ni courriel, ni identifiant de compte, ni jeton", async () => {
    const membre = await serveur.inscrire();
    const onglet = await ouvrirUnOnglet({
      serveur,
      cookie: membre.cookie,
      idEspace: crypto.randomUUID(),
    });
    await adopterEtAttendre(onglet, "Espace du registre");

    const contenu = await contenuDeLAppareil(onglet.appareil);

    expect(contenu).toContain(`registre:${onglet.idEspace}`);
    expect(await entreeDuRegistre(onglet.appareil, onglet.idEspace)).toEqual({
      rattachement: "adopte",
      droit: "ecriture",
    });
    const jeton = membre.cookie.slice(membre.cookie.indexOf("=") + 1);
    for (const secret of [
      membre.courriel,
      membre.idCompte,
      jeton,
      membre.motDePasse,
      "Espace du registre",
    ]) {
      expect(contenu).not.toContain(secret);
    }
  });

  it("F-013-AC40 F-010-AC4 aucun module d'apps/web n'appelle get-session", () => {
    expect(
      fichiersDe(SOURCES)
        .filter((chemin) => codeDe(chemin).includes("get-session"))
        .map(relatif),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// F-013-AC31, AC32 : le premier état dont la condition est vraie ; « Synchronisé » et ses quatre
// conditions.

const SYNCHRONISE: Constat = {
  rattachement: "adopte",
  compte: "connecte",
  connexion: "etablie",
  refusDeConnexion: false,
  detache: false,
  enErreur: false,
  ouverturesAcquises: true,
  modificationsEnAttente: false,
  passeAchevee: true,
};

describe("F-013-AC31 F-013-AC32 l'état affiché", () => {
  it("F-013-AC31 chaque condition l'emporte sur toutes celles qui la suivent dans la liste fermée", () => {
    const cas: readonly [Partial<Constat>, string][] = [
      [{ detache: true, enErreur: true, rattachement: "local", compte: "deconnecte" }, "detache"],
      [{ enErreur: true, rattachement: "local", compte: "deconnecte" }, "erreur"],
      [{ refusDeConnexion: true, connexion: "absente" }, "erreur"],
      [{ rattachement: "local", compte: "deconnecte", connexion: "absente" }, "local"],
      [{ compte: "deconnecte", connexion: "absente" }, "pause"],
      [{ refusDeConnexion: true, compte: "inconnu", connexion: "absente" }, "hors-ligne"],
      [{ connexion: "tentative", modificationsEnAttente: true }, "connexion"],
      [{ modificationsEnAttente: true }, "en-cours"],
      [{}, "synchronise"],
    ];
    for (const [ecart, attendu] of cas) {
      expect(etatAffiche({ ...SYNCHRONISE, ...ecart }), JSON.stringify(ecart)).toBe(attendu);
    }
  });

  it("F-013-AC32 « Synchronisé » exige au même instant connexion établie, ouvertures acquises, rien en attente, passe achevée sans erreur", () => {
    expect(etatAffiche(SYNCHRONISE)).toBe("synchronise");
    for (const ecart of [
      { connexion: "tentative" },
      { connexion: "absente" },
      { ouverturesAcquises: false },
      { modificationsEnAttente: true },
      { passeAchevee: false },
      { enErreur: true },
    ] as const) {
      expect(etatAffiche({ ...SYNCHRONISE, ...ecart }), JSON.stringify(ecart)).not.toBe(
        "synchronise",
      );
    }
  });
});

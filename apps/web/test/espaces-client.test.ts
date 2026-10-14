// Client des espaces et coutures de F-014 : un seul module appelle les routes de F-011, chaque appel
// rend un succès validé ou une erreur classée, les commandes des écrans sont rattachées à la matrice.
import {
  ACTIONS,
  CHEMINS_ESPACES,
  CODES_ERREUR,
  FORME_DU_JETON,
  ROUTES_ESPACES,
} from "@notionlike/contrats";
import { afterEach, describe, expect, it, vi } from "vitest";

import { cheminDe, creerClientDesEspaces } from "../src/compte/client-espaces.ts";
import { estUnJetonDInvitation, estUnNomDEspace } from "../src/compte/regles-espaces.ts";
import { tirerIdentifiantDEspace } from "../src/espace/identifiant-d-espace.ts";
import { COMMANDES } from "../src/interface/commandes-espaces.ts";
import { enveloppe, jamais, json, pageHtml, serveurSimule } from "./aides-compte.tsx";
import { lire, lister } from "./aides-disque.ts";
import {
  BOB_EDITEUR,
  espace,
  espace200,
  ID_BOB,
  ID_ESPACE,
  ID_INVITATION,
  INVITATION,
  invitationCreee201,
  invitations200,
  JETON_INVITATION,
  liste200,
  membre,
  membres200,
  R,
  vide204,
} from "./aides-espaces.tsx";

afterEach(() => {
  vi.useRealTimers();
});

describe("client des espaces : les douze routes", () => {
  it("F-014-AC37 F-014-AC39 F-014-AC34 chaque appel vise la route du contrat, sur l'origine de l'application, par le seul cookie, avec un corps strict, et rend la valeur validée", async () => {
    const serveur = serveurSimule({
      [R.espaces]: () => liste200([espace("lecteur")]),
      [R.creer]: () => espace200(espace("proprietaire"), 201),
      [R.lire()]: () => espace200(espace("proprietaire")),
      [R.renommer()]: () => espace200(espace("proprietaire", "Nouveau nom")),
      [R.supprimer()]: () => vide204(),
      [R.membres()]: () => membres200([BOB_EDITEUR]),
      [R.role(ID_BOB)]: () => json(200, { ...BOB_EDITEUR, role: "lecteur" }),
      [R.retirer(ID_BOB)]: () => vide204(),
      [R.inviter]: () => invitationCreee201(),
      [R.invitations]: () => invitations200([INVITATION]),
      [R.revoquer]: () => vide204(),
      [R.accepter]: () => espace200(espace("lecteur")),
    });
    const client = creerClientDesEspaces(serveur.requeter);

    const valeurs = [
      await client.listerEspaces(),
      await client.creerEspace({ idEspace: ID_ESPACE, nom: "Projet" }),
      await client.lireEspace(ID_ESPACE),
      await client.renommerEspace(ID_ESPACE, { nom: "Nouveau nom" }),
      await client.supprimerEspace(ID_ESPACE),
      await client.listerMembres(ID_ESPACE),
      await client.changerRole(ID_ESPACE, ID_BOB, { role: "lecteur" }),
      await client.retirerMembre(ID_ESPACE, ID_BOB),
      await client.creerInvitation(ID_ESPACE, { role: "lecteur" }),
      await client.listerInvitations(ID_ESPACE),
      await client.revoquerInvitation(ID_ESPACE, ID_INVITATION),
      await client.accepterInvitation({ jeton: JETON_INVITATION }),
    ];

    expect(valeurs.every((resultat) => resultat.ok)).toBe(true);
    expect(valeurs[0]).toEqual({ ok: true, valeur: [espace("lecteur")] });
    expect(valeurs[5]).toEqual({ ok: true, valeur: [BOB_EDITEUR] });
    expect(valeurs[4]).toEqual({ ok: true, valeur: null });
    // Les douze routes du contrat, chacune une fois.
    expect(new Set(serveur.routesAppelees()).size).toBe(ROUTES_ESPACES.length);
    for (const requete of serveur.requetes) {
      expect(requete.adresse.origin).toBe(window.location.origin);
      expect(
        [...requete.entetes.keys()].filter((cle) => cle !== "accept" && cle !== "content-type"),
      ).toEqual([]);
    }
    expect(
      serveur.requetes.map(({ corps }) => corps).filter((corps) => corps !== undefined),
    ).toEqual([
      JSON.stringify({ idEspace: ID_ESPACE, nom: "Projet" }),
      JSON.stringify({ nom: "Nouveau nom" }),
      JSON.stringify({ role: "lecteur" }),
      JSON.stringify({ role: "lecteur" }),
      JSON.stringify({ jeton: JETON_INVITATION }),
    ]);
  });

  it("F-014-AC34 un corps hors du schéma strict n'est jamais envoyé", async () => {
    const serveur = serveurSimule();
    const client = creerClientDesEspaces(serveur.requeter);

    const refus = await client.creerEspace({ idEspace: "PAS-UN-UUID", nom: "x" });
    const enTrop = await client.renommerEspace(ID_ESPACE, {
      nom: "x",
      autre: 1,
    } as unknown as { nom: string });

    expect(refus).toEqual({ ok: false, erreur: { type: "generique" } });
    expect(enTrop).toEqual({ ok: false, erreur: { type: "generique" } });
    expect(serveur.requetes).toEqual([]);
  });

  it("F-014-AC37 F-014-AC31 erreurs classées : code de l'enveloppe, 429 et son délai, réseau, délai de 10 secondes, réponse non conforme ou illisible", async () => {
    const serveur = serveurSimule({
      [R.espaces]: () => enveloppe(409, "quota-atteint"),
    });
    const client = creerClientDesEspaces(serveur.requeter, 50);

    expect(await client.listerEspaces()).toEqual({
      ok: false,
      erreur: { type: "enveloppe", code: "quota-atteint", idRequete: "req-7c2e91" },
    });
    serveur.poser(R.espaces, () => enveloppe(429, "trop-de-requetes", { "Retry-After": "12" }));
    expect(await client.listerEspaces()).toEqual({
      ok: false,
      erreur: { type: "trop-de-requetes", delaiSecondes: 12 },
    });
    serveur.poser(R.espaces, () => json(429, {}));
    expect(await client.listerEspaces()).toEqual({
      ok: false,
      erreur: { type: "trop-de-requetes", delaiSecondes: 60 },
    });
    serveur.poser(R.espaces, () => json(200, { espaces: [{ ...espace("lecteur"), cache: 1 }] }));
    expect((await client.listerEspaces()).ok).toBe(false);
    serveur.poser(R.espaces, () => pageHtml());
    expect(await client.listerEspaces()).toEqual({ ok: false, erreur: { type: "generique" } });
    serveur.poser(R.espaces, () =>
      json(418, { code: "code-inconnu", message: "x", idRequete: "r" }),
    );
    expect(await client.listerEspaces()).toEqual({ ok: false, erreur: { type: "generique" } });
    serveur.poser(R.espaces, () => jamais());
    expect(await client.listerEspaces()).toEqual({ ok: false, erreur: { type: "hors-ligne" } });
    serveur.retirer(R.espaces);
    expect(await client.listerEspaces()).toEqual({ ok: false, erreur: { type: "hors-ligne" } });
  });

  it("F-014-AC31 le délai par défaut est de 10 secondes : à 9,9 s rien n'est tranché, à 10 s la requête est abandonnée", async () => {
    vi.useFakeTimers();
    const serveur = serveurSimule({ [R.espaces]: () => jamais() });
    const client = creerClientDesEspaces(serveur.requeter);
    let issue: unknown;
    void client.listerEspaces().then((resultat) => {
      issue = resultat;
    });

    await vi.advanceTimersByTimeAsync(9_900);
    expect(issue).toBeUndefined();
    await vi.advanceTimersByTimeAsync(100);
    expect(issue).toEqual({ ok: false, erreur: { type: "hors-ligne" } });
  });

  it("F-014-AC13 la liste des membres vue par un propriétaire porte les courriels, celle d'un autre rôle non", async () => {
    const serveur = serveurSimule({
      [R.membres()]: () => membres200([membre(ID_BOB, "Bob", "editeur")]),
    });
    const client = creerClientDesEspaces(serveur.requeter);

    expect(await client.listerMembres(ID_ESPACE)).toEqual({
      ok: true,
      valeur: [{ idCompte: ID_BOB, nom: "Bob", role: "editeur" }],
    });
    serveur.poser(R.membres(), () => membres200([BOB_EDITEUR]));
    expect(await client.listerMembres(ID_ESPACE)).toEqual({ ok: true, valeur: [BOB_EDITEUR] });
  });

  it("F-014-AC37 un paramètre de chemin est toujours encodé", () => {
    expect(cheminDe(CHEMINS_ESPACES.espace, { idEspace: "a/../b" })).toBe(
      "/api/v1/espaces/a%2F..%2Fb",
    );
  });
});

// ── Coutures statiques ───────────────────────────────────────────────────────────────────────────

const sources = new Map(
  lister("src")
    .filter((chemin) => /\.tsx?$/.test(chemin))
    .map((chemin) => [chemin, lire(chemin)]),
);

describe("coutures du client des espaces", () => {
  it("F-014-AC37 F-014-AC39 seul src/compte/client-espaces.ts emploie les chemins de F-011 ; aucun chemin d'espace n'est recopié", () => {
    const employeurs = [...sources]
      .filter(([, texte]) => /\bCHEMINS_ESPACES\b/.test(texte))
      .map(([chemin]) => chemin);
    expect(employeurs).toEqual(["src/compte/client-espaces.ts"]);
    const recopies = [...sources].filter(([, texte]) =>
      /["'`]\/?(api\/v1\/)?(espaces|invitations)\//.test(texte),
    );
    expect(recopies.map(([chemin]) => chemin)).toEqual([]);
  });

  it("F-014-AC39 la matrice, les rôles, les quotas et la forme du jeton ne sont lus que dans les contrats, par le module des règles", () => {
    const lecteurs = [...sources]
      .filter(([, texte]) =>
        /\b(MATRICE_DES_DROITS|schemaJetonInvitation|FORME_DU_JETON)\b/.test(texte),
      )
      .map(([chemin]) => chemin);
    expect(lecteurs).toEqual(["src/compte/regles-espaces.ts"]);
    const recopies = [...sources].filter(([, texte]) =>
      /\{43\}|\b"proprietaire",\s*"editeur"/.test(texte),
    );
    expect(recopies.map(([chemin]) => chemin)).toEqual([]);
  });

  it("F-014-AC26 chaque commande est rattachée à une action de la matrice, et chaque action citée a sa commande", () => {
    const actionsDesCommandes = new Set<string>(Object.values(COMMANDES));
    for (const action of actionsDesCommandes) {
      expect(ACTIONS).toContain(action);
    }
    const citees = [
      "renommer-espace",
      "supprimer-espace",
      "inviter",
      "retirer-membre",
      "changer-role",
      "quitter-espace",
      "lister-membres",
      "lire-espace",
    ];
    expect([...actionsDesCommandes].sort()).toEqual([...citees].sort());
  });

  it("F-014-AC26 chaque commande rendue par les écrans est nommée par COMMANDES, et chaque commande de COMMANDES est employée", () => {
    const ecrans = [...sources].filter(([chemin]) =>
      /^src\/interface\/(ActionsDeLEspace|MembresDeLEspace|InvitationsDeLEspace|contexte-espace|EcranDesEspaces)\./.test(
        chemin,
      ),
    );
    const employees = new Set(
      ecrans.flatMap(([, texte]) =>
        [...texte.matchAll(/peut\([^,]+,\s*"([a-z-]+)"\)/g)].map(([, nom]) => nom),
      ),
    );
    expect([...employees].sort()).toEqual(Object.keys(COMMANDES).sort());
  });

  it("F-014-AC43 le code courriel-non-verifie n'est pas publié par les contrats : son test sera livré par F-026, fusionnée en second (H16)", () => {
    expect(CODES_ERREUR).not.toContain("courriel-non-verifie");
  });

  it("F-014-AC21 la forme du jeton est celle du contrat, comparée telle quelle", () => {
    expect(FORME_DU_JETON.test(JETON_INVITATION)).toBe(true);
    expect(estUnJetonDInvitation(JETON_INVITATION)).toBe(true);
    for (const fautif of [
      JETON_INVITATION.slice(1),
      `${JETON_INVITATION}A`,
      `${JETON_INVITATION.slice(1)}+`,
      `${JETON_INVITATION.slice(1)}/`,
      `${JETON_INVITATION.slice(1)}=`,
      `${JETON_INVITATION.slice(3)}%2D`,
      ` ${JETON_INVITATION.slice(1)}`,
      "",
    ]) {
      expect(estUnJetonDInvitation(fautif), fautif).toBe(false);
    }
  });

  it("F-014-AC8 le nom d'un espace suit le schéma du contrat : vide, blancs seuls ou plus de 100 caractères sont refusés", () => {
    expect(estUnNomDEspace("Projet")).toBe(true);
    expect(estUnNomDEspace("é".repeat(100))).toBe(true);
    for (const fautif of ["", "   ", "x".repeat(101)]) {
      expect(estUnNomDEspace(fautif)).toBe(false);
    }
  });

  it("F-014-AC42 l'identifiant vient de crypto.randomUUID seul ; sans elle, aucun identifiant n'est fabriqué", () => {
    expect(tirerIdentifiantDEspace()).toMatch(/^[0-9a-f-]{36}$/);
    const aleatoire = vi.spyOn(Math, "random");
    vi.stubGlobal("crypto", { getRandomValues: () => new Uint8Array(16) });
    expect(tirerIdentifiantDEspace()).toBeUndefined();
    expect(aleatoire).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
    const identifiant = sources.get("src/espace/identifiant-d-espace.ts") ?? "";
    expect(identifiant).not.toMatch(/Math\.random|getRandomValues|Date\.now/);
  });
});

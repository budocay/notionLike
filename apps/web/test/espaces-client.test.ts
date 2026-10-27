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
import {
  type Commande,
  COMMANDES,
  COMMANDES_DE_L_APPAREIL,
} from "../src/interface/commandes-espaces.ts";
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

// ── F-032-AC28 : chaque commande rendue par les écrans des espaces, classée ───────────────────────────────────

/** Les écrans des espaces : les fichiers d'`interface/` qu'ils importent, de proche en proche. */
const ENTREES_DES_ECRANS = [
  "src/interface/EcranDesEspaces.tsx",
  "src/interface/EcranDUnEspace.tsx",
  "src/interface/EcranDInvitation.tsx",
];

function fichiersDesEcrans(fichiers: ReadonlyMap<string, string>): string[] {
  const vus = new Set<string>();
  const aVoir = [...ENTREES_DES_ECRANS];
  for (let chemin = aVoir.pop(); chemin !== undefined; chemin = aVoir.pop()) {
    const texte = fichiers.get(chemin);
    if (vus.has(chemin) || texte === undefined) {
      continue;
    }
    vus.add(chemin);
    for (const [, importe] of texte.matchAll(/from "\.\/([\w-]+\.tsx?)"/g)) {
      aVoir.push(`src/interface/${importe}`);
    }
  }
  return [...vus].sort();
}

/**
 * Éléments qui rendent une commande, désignée par son libellé (bouton, lien, relais) ou, pour une
 * liste de choix, par son nom accessible.
 */
const ELEMENT_DE_COMMANDE =
  /<(?:(?:Bouton|Lien|EchecOuChargement)\b[\s\S]*?\blibelle|Choix\b[\s\S]*?\bnom)=\{([^{}]+)\}/g;

/**
 * Commandes rattachées à une action de la matrice : le libellé rendu, et la commande de `COMMANDES`
 * dont le fichier doit l'avoir gardée par `peut(…, "<commande>")` avant de la rendre. Les commandes
 * d'une boîte (valider, confirmer, copier) sont rattachées à la commande qui l'ouvre.
 */
const RATTACHEES: Readonly<Record<string, Commande>> = {
  RENOMMER: "renommer",
  VALIDER_LE_NOM: "renommer",
  QUITTER_CET_ESPACE: "quitter",
  QUITTER: "quitter",
  SUPPRIMER_CET_ESPACE: "supprimer",
  SUPPRIMER_DEFINITIVEMENT: "supprimer",
  RETIRER: "retirer-membre",
  "nomRoleDuMembre(membre.nom)": "changer-role",
  RELIRE_LES_MEMBRES: "voir-membres",
  ROLE_DE_L_INVITATION: "creer-invitation",
  CREER_UN_LIEN: "creer-invitation",
  COPIER_LE_LIEN: "creer-invitation",
  REVOQUER: "revoquer-invitation",
  RELIRE_LES_INVITATIONS: "voir-invitations",
  // F-032-AC28 : « Ouvrir cet espace » d'un espace du serveur, et le lien vers l'écran d'un espace.
  OUVRIR_CET_ESPACE: "ouvrir-espace",
  "espace.nom": "ouvrir-espace",
  nom: "ouvrir-espace",
};

/**
 * Contrôles des écrans qui ne sont pas des commandes de F-014-AC26 : ils n'agissent sur aucun espace
 * où le compte a un rôle, ni sur l'appareil. Liste fermée, à étendre dans ce test seulement.
 */
const HORS_MATRICE: Readonly<Record<string, string>> = {
  ANNULER: "ferme une boîte",
  FERMER: "ferme une boîte",
  REESSAYER: "relit après un échec",
  RELIRE_L_ESPACE: "relit après un échec",
  RETOUR_AUX_ESPACES: "navigation",
  VOIR_LES_ESPACES: "navigation",
  VOIR_CET_ESPACE: "navigation, après l'acceptation (F-014-AC23)",
  SE_CONNECTER: "navigation vers le compte",
  CREER_UN_COMPTE: "navigation vers le compte",
  IGNORER: "oublie l'invitation dans l'onglet",
  NOUVEL_ESPACE: "création : aucun rôle avant (F-014-AC7)",
  CREER_L_ESPACE: "création : aucun rôle avant (F-014-AC7)",
  REJOINDRE_L_ESPACE: "acceptation : aucun rôle avant (F-014-AC23)",
};

/** Libellés relayés : le composant rend celui que chaque appelant lui donne, énuméré chez lui. */
const RELAIS: Readonly<Record<string, string>> = {
  "src/interface/EchecOuChargement.tsx": "props.libelle",
};

interface CommandeRendue {
  readonly fichier: string;
  readonly libelle: string;
  readonly classe: "action" | "appareil" | "hors-matrice" | "relais" | undefined;
}

/** Chaque commande rendue par ces fichiers, avec sa classe ; `undefined` : non classée. */
function commandesRendues(fichiers: ReadonlyMap<string, string>): CommandeRendue[] {
  return [...fichiers].flatMap(([fichier, texte]) =>
    [...texte.matchAll(ELEMENT_DE_COMMANDE)].map((trouve): CommandeRendue => {
      const libelle = (trouve[1] ?? "").trim();
      const avant = texte.slice(0, trouve.index);
      const deLAppareil = /^libelleDeLAppareil\(\s*"([a-z-]+)"\s*\)$/.exec(libelle)?.[1];
      const commande = RATTACHEES[libelle];
      let classe: CommandeRendue["classe"];
      if (deLAppareil !== undefined) {
        classe = (COMMANDES_DE_L_APPAREIL as readonly string[]).includes(deLAppareil)
          ? "appareil"
          : undefined;
      } else if (
        commande !== undefined &&
        new RegExp(`\\bpeut\\([^,]+,\\s*"${commande}"\\)`).test(avant)
      ) {
        classe = "action";
      } else if (libelle in HORS_MATRICE) {
        classe = "hors-matrice";
      } else if (RELAIS[fichier] === libelle) {
        classe = "relais";
      }
      return { fichier, libelle, classe };
    }),
  );
}

function nonClassees(fichiers: ReadonlyMap<string, string>): string[] {
  return commandesRendues(fichiers)
    .filter(({ classe }) => classe === undefined)
    .map(({ fichier, libelle }) => `${fichier} : ${libelle}`);
}

describe("coutures du client des espaces", () => {
  it("F-014-AC26 F-032-AC28 chaque commande rendue par les écrans des espaces (libellé d'un Bouton, d'un Lien ou d'un relais) passe par `peut` ou par `libelleDeLAppareil`, ou figure dans la liste fermée des contrôles hors matrice ; une commande ajoutée sans l'un des trois fait échouer la vérification", () => {
    const desEcrans = new Map(
      fichiersDesEcrans(sources).map((chemin) => [chemin, sources.get(chemin) ?? ""]),
    );
    const rendues = commandesRendues(desEcrans);
    // Les fichiers qui rendent des commandes, trouvés par les imports et non plus nommés à la main :
    // ceux du test précédent, plus le relais de relecture.
    expect([...new Set(rendues.map(({ fichier }) => fichier))].sort()).toEqual([
      "src/interface/ActionsDeLEspace.tsx",
      "src/interface/EchecOuChargement.tsx",
      "src/interface/EcranDInvitation.tsx",
      "src/interface/EcranDUnEspace.tsx",
      "src/interface/EcranDesEspaces.tsx",
      "src/interface/EspacesDeLAppareil.tsx",
      "src/interface/InvitationsDeLEspace.tsx",
      "src/interface/MembresDeLEspace.tsx",
      "src/interface/OuvertureDUnEspace.tsx",
      "src/interface/RetraitDeLAppareil.tsx",
    ]);
    expect([...desEcrans.keys()]).toContain("src/interface/contexte-espace.ts");

    expect(nonClassees(desEcrans)).toEqual([]);
    // Les écrans rendent des commandes de chaque classe, et chaque entrée des listes sert.
    expect(new Set(rendues.map(({ classe }) => classe))).toEqual(
      new Set(["action", "appareil", "hors-matrice", "relais"]),
    );
    const libelles = new Set(rendues.map(({ libelle }) => libelle));
    for (const libelle of [...Object.keys(RATTACHEES), ...Object.keys(HORS_MATRICE)]) {
      expect(libelles, libelle).toContain(libelle);
    }
    expect(new Set(Object.values(RATTACHEES))).toEqual(new Set(Object.keys(COMMANDES)));
    for (const commande of COMMANDES_DE_L_APPAREIL) {
      expect(libelles).toContain(`libelleDeLAppareil("${commande}")`);
    }
    for (const libelle of Object.keys(HORS_MATRICE)) {
      expect(Object.keys(RATTACHEES)).not.toContain(libelle);
    }
  });

  it("F-014-AC26 F-032-AC28 cas fautifs donnés comme données : commande sans garde, garde après la commande, commande de l'appareil hors liste, libellé inconnu, relais hors de son fichier ; la commande gardée passe", () => {
    const fautifs = new Map([
      ["src/interface/Inconnu.tsx", "<Bouton libelle={EFFACER_TOUT} surActivation={effacer} />"],
      [
        "src/interface/SansGarde.tsx",
        "<Bouton\n  libelle={RENOMMER}\n  surActivation={renommer}\n/>",
      ],
      [
        "src/interface/GardeApres.tsx",
        '<Bouton libelle={SUPPRIMER_CET_ESPACE} />\n{peut(role, "supprimer") && null}',
      ],
      ["src/interface/AutreGarde.tsx", '{peut(role, "quitter") && <Bouton libelle={RENOMMER} />}'],
      [
        "src/interface/HorsListe.tsx",
        '<Bouton libelle={libelleDeLAppareil("vider-l-appareil")} surActivation={vider} />',
      ],
      ["src/interface/Relais.tsx", "<Bouton libelle={props.libelle} />"],
      ["src/interface/Lien.tsx", '<Lien libelle={nom} adresse="#/espaces" />'],
      ["src/interface/Choix.tsx", "<Choix nom={nomDuTri(table.nom)} surChoix={trier} />"],
      [
        "src/interface/Garde.tsx",
        '{peut(espace.role, "renommer") && (\n  <Bouton libelle={RENOMMER} surActivation={renommer} />\n)}',
      ],
    ]);

    expect(nonClassees(fautifs)).toEqual([
      "src/interface/Inconnu.tsx : EFFACER_TOUT",
      "src/interface/SansGarde.tsx : RENOMMER",
      "src/interface/GardeApres.tsx : SUPPRIMER_CET_ESPACE",
      "src/interface/AutreGarde.tsx : RENOMMER",
      'src/interface/HorsListe.tsx : libelleDeLAppareil("vider-l-appareil")',
      "src/interface/Relais.tsx : props.libelle",
      "src/interface/Lien.tsx : nom",
      "src/interface/Choix.tsx : nomDuTri(table.nom)",
    ]);
  });

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

  // F-032 H10, test de F-014-AC26 amendé par F-032-AC28 : les écrans des espaces comptent les
  // fichiers de F-032 qui rendent leurs commandes, et une commande y est soit rattachée à une action
  // (`peut`), soit dans la liste fermée des commandes de l'appareil (`libelleDeLAppareil`).
  it("F-014-AC26 F-032-AC28 chaque commande rendue par les écrans est nommée par COMMANDES ou par la liste fermée des commandes de l'appareil, et chacune des deux listes est employée", () => {
    const ecrans = [...sources].filter(([chemin]) =>
      /^src\/interface\/(ActionsDeLEspace|MembresDeLEspace|InvitationsDeLEspace|contexte-espace|EcranDesEspaces|EcranDUnEspace|EcranDInvitation|EspacesDeLAppareil|OuvertureDUnEspace|RetraitDeLAppareil)\./.test(
        chemin,
      ),
    );
    const employees = new Set(
      ecrans.flatMap(([, texte]) =>
        [...texte.matchAll(/peut\([^,]+,\s*"([a-z-]+)"\)/g)].map(([, nom]) => nom),
      ),
    );
    expect([...employees].sort()).toEqual(Object.keys(COMMANDES).sort());
    const deLAppareil = new Set(
      ecrans.flatMap(([, texte]) =>
        [...texte.matchAll(/libelleDeLAppareil\(\s*"([a-z-]+)"\s*\)/g)].map(([, nom]) => nom),
      ),
    );
    expect([...COMMANDES_DE_L_APPAREIL]).toEqual([
      "ouvrir-sur-l-appareil",
      "retirer-de-l-appareil",
    ]);
    expect([...deLAppareil].sort()).toEqual([...COMMANDES_DE_L_APPAREIL].sort());
    for (const commande of COMMANDES_DE_L_APPAREIL) {
      expect(Object.keys(COMMANDES)).not.toContain(commande);
    }
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

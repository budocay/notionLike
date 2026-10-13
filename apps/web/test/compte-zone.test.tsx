// Zone de compte et local d'abord (F-010) : l'application sans compte, la déconnexion, le stockage du
// navigateur, et la couture de F-002 et F-004 (F-010-AC26).
import { act, screen, waitFor, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import { CODE_NATIF_COMPTE_EXISTANT } from "../src/compte/client-auth.ts";
import {
  AVERTISSEMENT_NON_ENREGISTRE,
  TITRE_VERSION_NON_PRISE_EN_CHARGE,
} from "../src/interface/messages.ts";
import {
  activerActionDeRangee,
  creerPageNommee,
  docDe,
  etatEncode,
  nomDuRepli,
  rendreApplication,
  titresParFratrie,
  versionInconnueVenueDAilleurs,
} from "./aides-coquille.tsx";
import {
  COMPTE,
  compteNatif,
  deconnexionReussie,
  enveloppe,
  etatAnnonce,
  jamais,
  JETON,
  moi200,
  moi401,
  MOT_DE_PASSE,
  natif,
  ouvrirAvecCompte,
  ROUTES,
  type ServeurSimule,
  serveurSimule,
  zoneDeCompte,
} from "./aides-compte.tsx";
import { laisserIndexedDbTravailler, nomsDesBases } from "./aides-persistance.ts";

const ETATS_DU_COMPTE = {
  inconnu: () => serveurSimule(),
  deconnecte: () => serveurSimule({ [ROUTES.moi]: moi401 }),
  connecte: () => serveurSimule({ [ROUTES.moi]: () => moi200() }),
} as const;
const TEXTES_DES_ETATS = {
  inconnu: "Compte indisponible hors connexion",
  deconnecte: "Non connecté.",
  connecte: `Connecté : ${COMPTE.nom}`,
} as const;

function barreLaterale(): HTMLElement {
  return screen.getByRole("navigation", { name: "Pages" });
}

async function attendreLEtat(texte: string): Promise<void> {
  await waitFor(() => expect(etatAnnonce()).toContain(texte));
}

/** Un serveur à état : l'inscription et la connexion ouvrent la session, la déconnexion la ferme. */
function serveurAvecSession(): ServeurSimule {
  const serveur = serveurSimule({ [ROUTES.moi]: moi401 });
  const ouvrir = (): Response => {
    serveur.poser(ROUTES.moi, () => moi200());
    return compteNatif();
  };
  serveur.poser(ROUTES.inscription, ouvrir);
  serveur.poser(ROUTES.connexion, ouvrir);
  serveur.poser(ROUTES.deconnexion, () => {
    serveur.poser(ROUTES.moi, moi401);
    return deconnexionReussie();
  });
  return serveur;
}

async function remplirEtEnvoyer(
  utilisateur: UserEvent,
  champs: Readonly<Record<string, string>>,
  envoi: string,
): Promise<void> {
  for (const [etiquette, valeur] of Object.entries(champs)) {
    await utilisateur.type(await screen.findByLabelText(etiquette, { exact: false }), valeur);
  }
  await utilisateur.click(screen.getByRole("button", { name: envoi }));
}

async function sInscrire(utilisateur: UserEvent): Promise<void> {
  await utilisateur.click(within(zoneDeCompte()).getByRole("link", { name: "Créer un compte" }));
  await remplirEtEnvoyer(
    utilisateur,
    { Nom: COMPTE.nom, Courriel: COMPTE.courriel, "Mot de passe": MOT_DE_PASSE },
    "Créer le compte",
  );
}

async function seConnecter(utilisateur: UserEvent): Promise<void> {
  await utilisateur.click(within(zoneDeCompte()).getByRole("link", { name: "Se connecter" }));
  await remplirEtEnvoyer(
    utilisateur,
    { Courriel: COMPTE.courriel, "Mot de passe": MOT_DE_PASSE },
    "Se connecter",
  );
}

async function seDeconnecter(utilisateur: UserEvent): Promise<void> {
  await utilisateur.click(within(zoneDeCompte()).getByRole("button", { name: "Se déconnecter" }));
}

function rendreVisible(): void {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  document.dispatchEvent(new Event("visibilitychange"));
  Reflect.deleteProperty(document, "visibilityState");
}

describe("local d'abord : l'application sans compte", () => {
  it("F-010-AC1 moi ne répond jamais : la coquille s'affiche et chaque action de la barre latérale aboutit", async () => {
    const serveur = serveurSimule({ [ROUTES.moi]: jamais });
    const { utilisateur } = await ouvrirAvecCompte(serveur);

    expect(etatAnnonce()).toBe("Vérification du compte…");
    await creerPageNommee(utilisateur, "Racine");
    await activerActionDeRangee(utilisateur, "ajouter-une-sous-page", "Racine");
    await utilisateur.keyboard("Feuille{Enter}");
    await activerActionDeRangee(utilisateur, "renommer", "Feuille");
    await utilisateur.keyboard("{Control>}a{/Control}Renommée{Enter}");
    await utilisateur.click(screen.getByRole("button", { name: nomDuRepli("Racine") }));
    expect(titresParFratrie(barreLaterale())).toEqual([["Racine"]]);
    await activerActionDeRangee(utilisateur, "mettre-a-la-corbeille", "Racine");

    expect(titresParFratrie(barreLaterale())).toEqual([]);
    expect(etatAnnonce()).toBe("Vérification du compte…");
  });

  it.each(Object.keys(ETATS_DU_COMPTE) as (keyof typeof ETATS_DU_COMPTE)[])(
    "F-010-AC1 F-010-AC26 compte %s : les actions de la barre latérale de F-002 restent les mêmes et aboutissent",
    async (etat) => {
      const { utilisateur } = await ouvrirAvecCompte(ETATS_DU_COMPTE[etat]());
      await attendreLEtat(TEXTES_DES_ETATS[etat]);

      await creerPageNommee(utilisateur, "Une page");
      await activerActionDeRangee(utilisateur, "ajouter-une-sous-page", "Une page");
      await utilisateur.keyboard("Sa fille{Enter}");

      expect(titresParFratrie(barreLaterale())).toEqual([["Une page"], ["Sa fille"]]);
      const commandes = within(barreLaterale()).getAllByRole("button");
      expect(commandes[0]?.textContent).toBe("Nouvelle page");
    },
  );

  it("F-010-AC2 moi en échec : « Compte indisponible hors connexion » et « Réessayer » dans la zone, aucune alerte ailleurs ; réessayer relit moi", async () => {
    const serveur = serveurSimule({ [ROUTES.moi]: () => enveloppe(503, "base-indisponible") });
    const { utilisateur } = await ouvrirAvecCompte(serveur);

    await attendreLEtat("Compte indisponible hors connexion");
    expect(screen.queryAllByRole("alert")).toEqual([]);
    expect(screen.queryByText(/indisponible/, { ignore: "section *" })).toBeNull();
    serveur.poser(ROUTES.moi, () => moi200());
    await utilisateur.click(within(zoneDeCompte()).getByRole("button", { name: "Réessayer" }));

    await attendreLEtat(`Connecté : ${COMPTE.nom}`);
    expect(serveur.routesAppelees()).toEqual([ROUTES.moi, ROUTES.moi]);
  });

  it("F-010-AC18 le nom du compte, porteur de balises, s'affiche comme du texte", async () => {
    const nom = '<script>window.piege = 1</script><img src="x" onerror="window.piege = 2">';
    const serveur = serveurSimule({ [ROUTES.moi]: () => moi200({ ...COMPTE, nom }) });
    await ouvrirAvecCompte(serveur);

    await attendreLEtat(`Connecté : ${nom}`);
    expect(zoneDeCompte().querySelectorAll("script, img")).toHaveLength(0);
    expect(Reflect.get(window, "piege")).toBeUndefined();
  });
});

describe("déconnexion", () => {
  it("F-010-AC12 se déconnecter appelle la déconnexion puis moi, et n'annonce l'état déconnecté qu'au 401", async () => {
    let repondre: (reponse: Response) => void = () => undefined;
    const serveur = serveurSimule({
      [ROUTES.moi]: () => moi200(),
      [ROUTES.deconnexion]: () => {
        serveur.poser(ROUTES.moi, () => new Promise((resoudre) => (repondre = resoudre)));
        return deconnexionReussie();
      },
    });
    const { utilisateur } = await ouvrirAvecCompte(serveur);
    await attendreLEtat("Connecté");

    await seDeconnecter(utilisateur);
    await waitFor(() => expect(serveur.routesAppelees()).toHaveLength(3));
    expect(etatAnnonce()).toContain(`Connecté : ${COMPTE.nom}`);
    expect(etatAnnonce()).toContain("Déconnexion en cours…");
    expect(within(zoneDeCompte()).getByRole("button")).toHaveProperty("disabled", true);
    act(() => repondre(moi401()));

    await attendreLEtat("Non connecté.");
    expect(etatAnnonce()).toContain("Vous êtes déconnecté.Vos pages restent sur cet appareil.");
    expect(serveur.routesAppelees()).toEqual([ROUTES.moi, ROUTES.deconnexion, ROUTES.moi]);
  });

  it.each([
    ["un 500 (F-009-AC26)", () => enveloppe(500, "erreur-interne"), false],
    ["un corps natif d'erreur", () => natif(400, "FAILED_TO_SIGN_OUT"), false],
    ["une page HTML", () => new Response("<p>ok</p>", { status: 200 }), false],
    ["un réseau coupé", undefined, true],
  ])(
    "F-010-AC13 la déconnexion échoue par %s : non confirmée, l'état reste connecté, on peut réessayer",
    async (_cas, reponse, horsLigne) => {
      const serveur = serveurSimule({ [ROUTES.moi]: () => moi200() });
      if (reponse !== undefined) {
        serveur.poser(ROUTES.deconnexion, reponse);
      }
      const { utilisateur } = await ouvrirAvecCompte(serveur);
      await attendreLEtat("Connecté");

      await seDeconnecter(utilisateur);

      await attendreLEtat("La déconnexion n'est pas confirmée.");
      expect(etatAnnonce()).toContain(`Connecté : ${COMPTE.nom}`);
      expect(etatAnnonce().includes("demande une connexion au serveur")).toBe(horsLigne);
      expect(etatAnnonce()).not.toContain("Vous êtes déconnecté");
      const bouton = within(zoneDeCompte()).getByRole("button", {
        name: "Réessayer la déconnexion",
      });
      serveur.poser(ROUTES.deconnexion, () => {
        serveur.poser(ROUTES.moi, moi401);
        return deconnexionReussie();
      });
      await utilisateur.click(bouton);
      await attendreLEtat("Vous êtes déconnecté.");
    },
  );

  it("F-010-AC13 moi répond encore 200 après la déconnexion : non confirmée, l'état reste connecté", async () => {
    const serveur = serveurSimule({
      [ROUTES.moi]: () => moi200(),
      [ROUTES.deconnexion]: deconnexionReussie,
    });
    const { utilisateur } = await ouvrirAvecCompte(serveur);
    await attendreLEtat("Connecté");

    await seDeconnecter(utilisateur);

    await attendreLEtat("La déconnexion n'est pas confirmée.");
    expect(etatAnnonce()).toContain(`Connecté : ${COMPTE.nom}`);
    expect(etatAnnonce()).not.toContain("Vous êtes déconnecté");
  });

  it("F-010-AC13 moi injoignable après la déconnexion : non confirmée, l'état devient inconnu", async () => {
    const serveur = serveurSimule({ [ROUTES.moi]: () => moi200() });
    serveur.poser(ROUTES.deconnexion, () => {
      serveur.retirer(ROUTES.moi);
      return deconnexionReussie();
    });
    const { utilisateur } = await ouvrirAvecCompte(serveur);
    await attendreLEtat("Connecté");

    await seDeconnecter(utilisateur);

    await attendreLEtat("La déconnexion n'est pas confirmée.");
    expect(etatAnnonce()).toContain("Compte indisponible hors connexion");
    expect(etatAnnonce()).not.toContain("Vous êtes déconnecté");
  });

  it("F-010-AC10 pendant une déconnexion, un second clic n'envoie pas de seconde requête", async () => {
    const serveur = serveurSimule({ [ROUTES.moi]: () => moi200(), [ROUTES.deconnexion]: jamais });
    const { utilisateur } = await ouvrirAvecCompte(serveur);
    await attendreLEtat("Connecté");
    const bouton = within(zoneDeCompte()).getByRole("button", { name: "Se déconnecter" });

    await utilisateur.click(bouton);
    await utilisateur.click(bouton);
    act(() => bouton.click());

    expect(serveur.routesAppelees()).toEqual([ROUTES.moi, ROUTES.deconnexion]);
    expect(bouton).toHaveProperty("disabled", true);
  });
});

describe("l'espace local ne dépend pas du compte", () => {
  it("F-010-AC3 F-010-AC5 inscription, connexion, déconnexion et session expirée laissent l'arborescence, son repli et le document tels quels", async () => {
    const serveur = serveurAvecSession();
    const { session, utilisateur } = await ouvrirAvecCompte(serveur);
    await creerPageNommee(utilisateur, "Racine");
    await activerActionDeRangee(utilisateur, "ajouter-une-sous-page", "Racine");
    await utilisateur.keyboard("Feuille{Enter}");
    await utilisateur.click(screen.getByRole("button", { name: nomDuRepli("Racine") }));
    await creerPageNommee(utilisateur, "Ouverte");
    const hash = window.location.hash;
    const arborescence = titresParFratrie(barreLaterale());
    const document_ = etatEncode(session);
    const constater = (): void => {
      expect(titresParFratrie(barreLaterale())).toEqual(arborescence);
      expect(etatEncode(session)).toEqual(document_);
      expect(window.location.hash).toBe(hash);
    };

    await sInscrire(utilisateur);
    await attendreLEtat("Connecté");
    constater();
    await seDeconnecter(utilisateur);
    await attendreLEtat("Vous êtes déconnecté.");
    constater();
    await seConnecter(utilisateur);
    await attendreLEtat("Connecté");
    constater();
    serveur.poser(ROUTES.moi, moi401);
    act(() => rendreVisible());
    await attendreLEtat("Non connecté.");
    constater();
  });

  it("F-010-AC19 F-010-AC4 après inscription, connexion et déconnexion, le stockage ne porte que la liste fermée, sans rien du compte ni jeton ; aucune requête vers get-session", async () => {
    const serveur = serveurAvecSession();
    const { utilisateur } = await ouvrirAvecCompte(serveur);
    await creerPageNommee(utilisateur, "Une page");

    await sInscrire(utilisateur);
    await attendreLEtat("Connecté");
    await seDeconnecter(utilisateur);
    await attendreLEtat("Vous êtes déconnecté.");
    await seConnecter(utilisateur);
    await attendreLEtat("Connecté");
    await seDeconnecter(utilisateur);
    await attendreLEtat("Vous êtes déconnecté.");
    act(() => rendreVisible());
    act(() => window.dispatchEvent(new Event("online")));
    await waitFor(() => expect(serveur.routesAppelees().at(-1)).toBe(ROUTES.moi));
    await new Promise((resoudre) => setTimeout(resoudre, 50));

    const entrees = await inventaireDuStockage();
    expect(entrees.filter((entree) => !estDeclaree(entree))).toEqual([]);
    // Le contenu des bases est bien lu : le titre de la page y est, le compte non.
    expect(entrees.some(({ contenu }) => contenu.includes("Une page"))).toBe(true);
    for (const secret of [JETON, COMPTE.courriel, COMPTE.nom, COMPTE.id, MOT_DE_PASSE]) {
      expect(entrees.filter(({ nom, contenu }) => `${nom} ${contenu}`.includes(secret))).toEqual(
        [],
      );
    }
    expect(serveur.routesAppelees().filter((route) => route.includes("get-session"))).toEqual([]);
    expect(new Set(serveur.routesAppelees())).toEqual(
      new Set([ROUTES.moi, ROUTES.inscription, ROUTES.connexion, ROUTES.deconnexion]),
    );
  });

  it("F-010-AC19 l'inventaire voit une entrée non déclarée, et une clé du client d'authentification", async () => {
    window.localStorage.setItem("better-auth.message", "{}");
    window.sessionStorage.setItem("notionlike:vue:x", "1");
    document.cookie = "temoin=1";

    const nonDeclarees = (await inventaireDuStockage()).filter((entree) => !estDeclaree(entree));

    expect(nonDeclarees.map(({ support, nom }) => `${support} ${nom}`)).toEqual([
      "localStorage better-auth.message",
      "sessionStorage notionlike:vue:x",
      "cookie temoin",
    ]);
    window.localStorage.clear();
    window.sessionStorage.clear();
    document.cookie = "temoin=; expires=Thu, 01 Jan 1970 00:00:00 GMT";
  });
});

// Liste fermée des entrées que l'application écrit dans le stockage du navigateur accessible au
// script (F-010-AC19, H14). Toute feature qui en écrit une nouvelle l'ajoute ici, avec son support
// et la feature qui l'écrit, et prouve qu'elle ne porte rien du compte ni aucun jeton.
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const ENTREES_DECLAREES: readonly {
  readonly support: Support;
  readonly motif: RegExp;
  readonly feature: string;
}[] = [
  { support: "indexedDB", motif: /^notionlike:appareil$/, feature: "F-002" },
  { support: "indexedDB", motif: new RegExp(`^notionlike:espace:${UUID}$`), feature: "F-002" },
  {
    support: "indexedDB",
    motif: new RegExp(`^notionlike:page:${UUID}:${UUID}$`),
    feature: "F-003",
  },
];

type Support = "localStorage" | "sessionStorage" | "indexedDB" | "caches" | "cookie";

interface Entree {
  readonly support: Support;
  readonly nom: string;
  readonly contenu: string;
}

function estDeclaree({ support, nom }: Entree): boolean {
  return ENTREES_DECLAREES.some((entree) => entree.support === support && entree.motif.test(nom));
}

function entreesDe(support: Support, stockage: Storage): Entree[] {
  return Object.keys(stockage).map((nom) => ({
    support,
    nom,
    contenu: stockage.getItem(nom) ?? "",
  }));
}

function demander<T>(demande: IDBRequest<T>): Promise<T> {
  return new Promise((resoudre, rejeter) => {
    demande.onsuccess = () => resoudre(demande.result);
    demande.onerror = () => rejeter(demande.error ?? new Error("demande en échec"));
  });
}

/** Clés et valeurs de chaque magasin de la base, octets décodés en texte. */
async function contenuDeLaBase(nom: string): Promise<string> {
  const connexion = await demander(indexedDB.open(nom));
  const magasins = [...connexion.objectStoreNames];
  const decodeur = new TextDecoder();
  const textes = await Promise.all(
    magasins.map(async (magasin) => {
      const lecture = connexion.transaction(magasin).objectStore(magasin);
      const [cles, valeurs] = await Promise.all([
        demander(lecture.getAllKeys()),
        demander(lecture.getAll()),
      ]);
      return [...cles, ...valeurs]
        .map((valeur) =>
          ArrayBuffer.isView(valeur) ? decodeur.decode(valeur) : JSON.stringify(valeur),
        )
        .join(" ");
    }),
  );
  connexion.close();
  return textes.join(" ");
}

async function inventaireDuStockage(): Promise<Entree[]> {
  await laisserIndexedDbTravailler();
  const bases = await nomsDesBases();
  const contenus = await Promise.all(bases.map(contenuDeLaBase));
  const caches = Reflect.get(window, "caches") as CacheStorage | undefined;
  return [
    ...entreesDe("localStorage", window.localStorage),
    ...entreesDe("sessionStorage", window.sessionStorage),
    ...bases.map((nom, rang) => ({
      support: "indexedDB" as const,
      nom,
      contenu: contenus[rang] ?? "",
    })),
    ...(caches === undefined ? [] : await caches.keys()).map((nom) => ({
      support: "caches" as const,
      nom,
      contenu: "",
    })),
    ...document.cookie
      .split(";")
      .map((paire) => paire.trim())
      .filter((paire) => paire !== "")
      .map((paire) => ({
        support: "cookie" as const,
        nom: paire.split("=")[0] ?? "",
        contenu: paire,
      })),
  ];
}

describe("couture de F-002 et de F-004", () => {
  it.each(Object.keys(ETATS_DU_COMPTE) as (keyof typeof ETATS_DU_COMPTE)[])(
    "F-010-AC26 compte %s : sans IndexedDB, l'avertissement de persistance de F-002-AC16 s'affiche comme avant",
    async (etat) => {
      vi.stubGlobal("indexedDB", undefined);
      await ouvrirAvecCompte(ETATS_DU_COMPTE[etat]());
      await attendreLEtat(TEXTES_DES_ETATS[etat]);

      expect(screen.getByRole("alert").textContent).toContain(AVERTISSEMENT_NON_ENREGISTRE);
    },
  );

  it.each(Object.keys(ETATS_DU_COMPTE) as (keyof typeof ETATS_DU_COMPTE)[])(
    "F-010-AC26 compte %s : une version non prise en charge affiche l'écran de F-002-AC17 comme avant",
    async (etat) => {
      const { session } = await ouvrirAvecCompte(ETATS_DU_COMPTE[etat]());
      await attendreLEtat(TEXTES_DES_ETATS[etat]);

      act(() => Y.applyUpdate(docDe(session), versionInconnueVenueDAilleurs(session)));

      expect(screen.getByRole("alert").textContent).toContain(TITRE_VERSION_NON_PRISE_EN_CHARGE);
      expect(screen.queryByRole("region", { name: "Compte" })).toBeNull();
    },
  );

  it("F-010-AC26 sans compte branché, l'application est celle de F-002 : ni zone de compte, et #/connexion désigne l'accueil", async () => {
    window.location.hash = "#/connexion";
    rendreApplication();

    await screen.findByRole("button", { name: "Nouvelle page" });
    expect(screen.queryByRole("region", { name: "Compte" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: /Courriel/ })).toBeNull();
  });

  it("F-010-AC26 la zone de compte prend place dans la tête de la barre latérale, après « Nouvelle page » et avant l'arborescence, sans déplacer aucune commande", async () => {
    const { utilisateur } = await ouvrirAvecCompte(ETATS_DU_COMPTE.deconnecte());
    await creerPageNommee(utilisateur, "Une page");

    const barre = barreLaterale();
    const suit = (a: Node, b: Node): boolean =>
      (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    const nouvellePage = within(barre).getByRole("button", { name: "Nouvelle page" });
    expect(barre.contains(zoneDeCompte())).toBe(true);
    expect(suit(nouvellePage, zoneDeCompte())).toBe(true);
    expect(suit(zoneDeCompte(), within(barre).getByRole("list"))).toBe(true);
    expect(within(barre).getAllByRole("button")[0]).toBe(nouvellePage);
  });

  it("F-010-AC14 l'inscription refusée pour un courriel existant ne touche pas à l'espace local", async () => {
    const serveur = serveurSimule({
      [ROUTES.moi]: moi401,
      [ROUTES.inscription]: () => natif(422, CODE_NATIF_COMPTE_EXISTANT),
    });
    const { session, utilisateur } = await ouvrirAvecCompte(serveur);
    const avant = etatEncode(session);

    await sInscrire(utilisateur);

    await screen.findByText("Un compte existe déjà avec ce courriel.");
    expect(etatEncode(session)).toEqual(avant);
  });
});

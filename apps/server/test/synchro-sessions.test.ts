// Couture de F-012-AC14 (H18) : chaque appelant de la fonction de suppression de session présent à
// ce jour est énuméré à partir des sources, et a son scénario contre le serveur réel de la fabrique.
// La connexion de la session supprimée est fermée dans la seconde par 1008 non-authentifie, alors
// que son client continue d'envoyer des mises à jour brutes ; celle d'une autre session du même
// compte reste en service.
import { randomUUID } from "node:crypto";

import { CHEMINS_COMPTES, CHEMINS_DU_COMPTE, nomDeDocument } from "@notionlike/contrats";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import * as Y from "yjs";

import {
  brut,
  connecterBrut,
  DELAI_SYNCHRO_MS,
  fermerLesClients,
  miseAJourTexte,
  pause,
  type ClientBrut,
} from "./aides-synchro.ts";
import { sourcesDuDepot } from "./aides-sources.ts";
import { demarrerServeurDEssai, type CompteInscrit, type ServeurDEssai } from "./fabrique.ts";

let serveur: ServeurDEssai;

beforeAll(async () => {
  serveur = await demarrerServeurDEssai();
}, DELAI_SYNCHRO_MS);
afterEach(fermerLesClients);
afterAll(async () => {
  await serveur.fermer();
});

function occurrences(texte: string, motif: RegExp): number {
  return [...texte.matchAll(new RegExp(motif.source, "g"))].length;
}

// Les appelants de la fonction de suppression de session : appels directs, et crochet par lequel
// better-auth la prend pour toute suppression native (F-009-AC33).
function appelants(depot: ReadonlyMap<string, string>): string[] {
  const points: string[] = [];
  for (const [chemin, texte] of depot) {
    if (!chemin.startsWith("apps/server/src/")) {
      continue;
    }
    const appels = occurrences(texte, /\bsuppression\.(supprimer|dansUneTransaction)\(/);
    const crochets = occurrences(texte, /session:\s*\{\s*delete:\s*\{\s*before:/);
    if (appels > 0) {
      points.push(`${chemin} : appel de la fonction (${String(appels)})`);
    }
    if (crochets > 0) {
      points.push(`${chemin} : crochet de better-auth (${String(crochets)})`);
    }
  }
  return points.sort();
}

interface Sessions {
  readonly compte: CompteInscrit;
  // La session qui sera supprimée, et une autre session du même compte.
  readonly supprimee: string;
  readonly gardee: string;
}

type Action = (sessions: Sessions) => Promise<void>;

async function exiger(reponse: Promise<Response>, statut: number): Promise<void> {
  expect((await reponse).status).toBe(statut);
}

async function idDeLAutreSession(cookie: string): Promise<string> {
  const reponse = await serveur.appeler("GET", CHEMINS_DU_COMPTE.sessions, { cookie });
  const { sessions } = (await reponse.json()) as {
    sessions: { idSession: string; courante: boolean }[];
  };
  return sessions.find((session) => !session.courante)?.idSession ?? "";
}

const deconnexion: Action = ({ supprimee }) =>
  exiger(serveur.appeler("POST", CHEMINS_COMPTES.deconnexion, { cookie: supprimee }), 200);

// Le jeton de la session : la valeur du cookie avant sa signature.
function jetonDe(cookie: string): string {
  return decodeURIComponent(cookie.split("=")[1] ?? "").split(".")[0] ?? "";
}

const lectureExpiree: Action = async ({ supprimee }) => {
  await serveur.base.db.execute(
    `update "session" set "expiresAt" = now() - interval '1 minute' where "token" = '${jetonDe(supprimee)}'`,
  );
  await exiger(serveur.appeler("GET", CHEMINS_COMPTES.moi, { cookie: supprimee }), 401);
};

// Une base qui ignore la première suppression de session : better-auth annonce un succès, et la
// vérification de la déconnexion supprime la session par la fonction (F-009 H17).
const deconnexionVerifiee: Action = async (sessions) => {
  for (const instruction of [
    `create table if not exists essai_saut (n int)`,
    `create or replace function essai_saut() returns trigger language plpgsql as $$
     begin if exists (select 1 from essai_saut) then delete from essai_saut; return null; end if;
     return old; end; $$`,
    `drop trigger if exists essai_saut on "session"`,
    `create trigger essai_saut before delete on "session" for each row execute function essai_saut()`,
    `insert into essai_saut values (1)`,
  ]) {
    await serveur.base.db.execute(instruction);
  }
  try {
    await deconnexion(sessions);
  } finally {
    await serveur.base.db.execute(`drop trigger if exists essai_saut on "session"`);
  }
};

const changementDeMotDePasse: Action = ({ compte, gardee }) =>
  exiger(
    serveur.appeler("POST", CHEMINS_DU_COMPTE.motDePasse, {
      cookie: gardee,
      corps: { motDePasseActuel: compte.motDePasse, nouveauMotDePasse: `${compte.motDePasse}-2` },
    }),
    204,
  );

const revocation: Action = async ({ compte, gardee }) => {
  const idSession = await idDeLAutreSession(gardee);
  await exiger(
    serveur.appeler("POST", CHEMINS_DU_COMPTE.revocation.replace(":idSession", idSession), {
      cookie: gardee,
      corps: { motDePasseActuel: compte.motDePasse },
    }),
    204,
  );
};

const revocationDesAutres: Action = ({ compte, gardee }) =>
  exiger(
    serveur.appeler("POST", CHEMINS_DU_COMPTE.revocationDesAutres, {
      cookie: gardee,
      corps: { motDePasseActuel: compte.motDePasse },
    }),
    200,
  );

// Un scénario par appel ; un appelant de plus fait échouer l'énumération.
const SCENARIOS: Readonly<Record<string, readonly (readonly [string, Action])[]>> = {
  "apps/server/src/authentification.ts : appel de la fonction (1)": [
    ["déconnexion vérifiée", deconnexionVerifiee],
  ],
  "apps/server/src/authentification.ts : crochet de better-auth (1)": [
    ["déconnexion", deconnexion],
    ["session expirée lue", lectureExpiree],
  ],
  "apps/server/src/gestion-du-compte.ts : appel de la fonction (3)": [
    ["changement de mot de passe", changementDeMotDePasse],
    ["révocation d'une session", revocation],
    ["révocation des autres sessions", revocationDesAutres],
  ],
};

async function ouvrir(cookie: string, document: string): Promise<ClientBrut> {
  const client = await connecterBrut(serveur, { cookie });
  await client.ouvrirEtSynchroniser(document);
  return client;
}

describe("fermeture des connexions d'une session supprimée (F-012-AC14, H18)", () => {
  it("F-012-AC14 les appelants de la fonction de suppression de session sont énumérés, chacun avec ses scénarios", () => {
    expect(appelants(sourcesDuDepot())).toEqual(Object.keys(SCENARIOS).sort());
    for (const [point, scenarios] of Object.entries(SCENARIOS)) {
      expect(scenarios.length).toBeGreaterThanOrEqual(Number(/\((\d+)\)$/.exec(point)?.[1]));
    }
  });

  it.each(
    Object.entries(SCENARIOS).flatMap(([point, scenarios]) =>
      scenarios.map(([cas, action]) => [point, cas, action] as const),
    ),
  )(
    "F-012-AC14 %s, %s : la connexion de la session supprimée est fermée dans la seconde, l'autre session reste en service",
    async (_point, _cas, action) => {
      const compte = await serveur.inscrire("sessions");
      const gardee = await serveur.connecter(compte);
      const idEspace = await serveur.creerEspace(compte.cookie);
      const document = nomDeDocument({ type: "page", idEspace, idDocument: randomUUID() });
      const condamne = await ouvrir(compte.cookie, document);
      const garde = await ouvrir(gardee, document);
      let envois = 0;
      const rafale = setInterval(() => {
        if (condamne.prise.readyState === 1) {
          condamne.envoyer(
            brut.miseAJour(document, miseAJourTexte(`brut ${String(envois)}`, new Y.Doc())),
          );
          envois += 1;
        }
      }, 20);

      try {
        await action({ compte, supprimee: compte.cookie, gardee });
        const debut = Date.now();
        const fermeture = await condamne.fermeture;
        expect(Date.now() - debut).toBeLessThan(1000);
        expect(fermeture).toEqual({ code: 1008, raison: "non-authentifie" });
      } finally {
        clearInterval(rafale);
      }
      await pause(100);
      expect(garde.prise.readyState).toBe(1);
      const depuis = garde.recus.length;
      garde.envoyer(brut.miseAJour(document, miseAJourTexte("gardée", garde.doc(document))));
      expect(await garde.attendre((lu) => lu.type === "accuse", depuis)).toMatchObject({
        applique: true,
      });
    },
    DELAI_SYNCHRO_MS,
  );
});

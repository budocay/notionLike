// Authentification (F-009) : la seule construction de better-auth. Chaque réglage dont le défaut
// dépend de `NODE_ENV` ou des en-têtes de la requête est écrit ici (H7, H11, H14). Le reste du
// serveur ne voit que `Authentification`.
import { AsyncLocalStorage } from "node:async_hooks";

import { schemaComptes, type Base, type SessionSupprimee } from "@notionlike/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import type { Configuration } from "./configuration.ts";
import type { Consommer } from "./debit.ts";
import { correspond, empreinteDe } from "./empreinte.ts";
import type { Journal } from "./journal.ts";
import type { SuppressionDeSessions } from "./sessions.ts";

const MINUTE_S = 60;
const JOUR_S = 86_400;
const JOURS_DE_SESSION = 7;
const DUREE_DE_SESSION_S = JOURS_DE_SESSION * JOUR_S;
const PROLONGATION_APRES_S = JOUR_S;

// F-009-AC14 : les plafonds par route de better-auth ; les autres routes n'ont que le plafond
// global du serveur (F-009-AC31), que celui-ci reprend.
const PLAFOND_PAR_ROUTE = { window: MINUTE_S, max: 60 };
const PLAFONDS = {
  "/sign-in/email": { window: MINUTE_S, max: 5 },
  "/sign-up/email": { window: MINUTE_S, max: 3 },
};

// Ce que le traitement d'une requête laisse à la route qui l'a transmise.
interface Appel {
  readonly supprimees: SessionSupprimee[];
  // L'erreur d'une suppression de session en échec, que better-auth tait (F-009-AC26).
  suppressionEnEchec?: unknown;
  // La dernière erreur que better-auth a changée en réponse.
  erreur?: unknown;
}

// `reponse` manque quand better-auth a levé au lieu de répondre : `erreur` dit alors pourquoi.
export interface Traitement extends Appel {
  readonly reponse?: Response;
}

interface SessionLue {
  readonly compte: { readonly id: string; readonly name: string; readonly email: string };
  // Les en-têtes que better-auth pose en lisant la session (cookie prolongé ou effacé).
  readonly enTetes: Headers;
}

export interface Authentification {
  traiter(requete: Request): Promise<Traitement>;
  // `undefined` : aucune session valide.
  lireLaSession(enTetes: Headers): Promise<SessionLue | undefined>;
}

interface Dependances {
  readonly configuration: Configuration;
  readonly base: Base;
  readonly journal: Journal;
  readonly suppression: SuppressionDeSessions;
  readonly consommer: Consommer;
}

export function creerAuthentification(dependances: Dependances): Authentification {
  const { configuration, base, journal, suppression, consommer } = dependances;
  const appels = new AsyncLocalStorage<Appel>();

  // F-009-AC33 : better-auth ne supprime aucune session lui-même. Le crochet passe la main à la
  // fonction de suppression, puis rend `false` pour annuler la suppression native.
  async function supprimerParLaFonction(session: { readonly id: string }): Promise<false> {
    const appel = appels.getStore();
    try {
      const supprimees = await suppression.supprimer({ idSession: session.id });
      appel?.supprimees.push(...supprimees);
    } catch (erreur) {
      if (appel !== undefined) {
        appel.suppressionEnEchec = erreur;
      }
      throw erreur;
    }
    return false;
  }

  const auth = betterAuth({
    baseURL: configuration.urlPublique,
    secret: configuration.secretDesSessions,
    trustedOrigins: [configuration.urlPublique, ...configuration.originesAutorisees],
    database: drizzleAdapter(base.db, { provider: "pg", schema: schemaComptes }),
    databaseHooks: { session: { delete: { before: supprimerParLaFonction } } },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      password: {
        hash: empreinteDe,
        verify: ({ hash, password }) => correspond(password, hash),
      },
    },
    session: {
      expiresIn: DUREE_DE_SESSION_S,
      updateAge: PROLONGATION_APRES_S,
      cookieCache: { enabled: false },
    },
    rateLimit: {
      enabled: true,
      ...PLAFOND_PAR_ROUTE,
      customRules: PLAFONDS,
      customStorage: {
        consume: (cle, { window, max }) => {
          const { permise, attenteS } = consommer(cle, { fenetreS: window, max });
          return Promise.resolve({ allowed: permise, retryAfter: permise ? null : attenteS });
        },
      },
    },
    advanced: {
      useSecureCookies: configuration.cookiesSecurises,
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax", path: "/" },
      disableOriginCheck: false,
      disableCSRFCheck: false,
      database: { generateId: "uuid" },
      ipAddress: { ipAddressHeaders: ["x-forwarded-for"], disableIpTracking: false },
    },
    telemetry: { enabled: false },
    // F-009-AC19 : ni le message ni les valeurs jointes d'une ligne de better-auth ne sont écrits.
    logger: {
      level: "warn",
      disableColors: true,
      log: (niveau, _message, ...jointes: unknown[]) => {
        journal.bibliotheque(niveau, jointes);
      },
    },
    onAPIError: {
      onError: (erreur) => {
        const appel = appels.getStore();
        if (appel !== undefined) {
          appel.erreur = erreur;
        }
      },
    },
  });

  return {
    async traiter(requete) {
      const appel: Appel = { supprimees: [] };
      try {
        const reponse = await appels.run(appel, () => auth.handler(requete));
        return { ...appel, reponse };
      } catch (erreur) {
        return { ...appel, erreur };
      }
    },
    async lireLaSession(enTetes) {
      const lue = await auth.api.getSession({ headers: enTetes, returnHeaders: true });
      return lue.response === null
        ? undefined
        : { compte: lue.response.user, enTetes: lue.headers };
    },
  };
}

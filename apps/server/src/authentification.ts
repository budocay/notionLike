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

const STATUT_OK = 200;

// Ce que le traitement d'une requête laisse à la route qui l'a transmise.
interface Appel {
  readonly supprimees: SessionSupprimee[];
  // L'erreur d'une suppression de session en échec, que better-auth tait (F-009-AC26).
  suppressionEnEchec?: unknown;
  // Une erreur que better-auth a journalisée sans la lever, puis changée en réponse ordinaire :
  // base illisible avant une suppression, compte qu'il n'a pas pu créer (F-009-AC20, H17).
  erreurTaie?: unknown;
  // L'erreur que better-auth a levée au lieu de répondre.
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

// Une session relue vivante après la déconnexion, que la fonction de suppression n'a pas pu
// supprimer non plus.
class ErreurDeDeconnexion extends Error {
  constructor() {
    super("session toujours présente après la déconnexion");
    this.name = "ErreurDeDeconnexion";
  }
}

export interface Authentification {
  traiter(requete: Request): Promise<Traitement>;
  // La déconnexion : better-auth, puis la vérification que la session présentée n'est plus.
  deconnecter(requete: Request): Promise<Traitement>;
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

  // F-009-AC33 : toute suppression de session demandée par better-auth passe par la fonction de
  // suppression ; ce qu'elle a supprimé, ou son échec, est laissé à la route.
  async function supprimerParLaFonction(idSession: string): Promise<SessionSupprimee[]> {
    const appel = appels.getStore();
    try {
      const supprimees = await suppression.supprimer({ idSession });
      appel?.supprimees.push(...supprimees);
      return supprimees;
    } catch (erreur) {
      if (appel !== undefined) {
        appel.suppressionEnEchec = erreur;
      }
      throw erreur;
    }
  }

  // Le crochet de better-auth : la fonction supprime, puis `false` annule la suppression native.
  async function avantLaSuppressionNative(session: { readonly id: string }): Promise<false> {
    await supprimerParLaFonction(session.id);
    return false;
  }

  const auth = betterAuth({
    baseURL: configuration.urlPublique,
    secret: configuration.secretDesSessions,
    trustedOrigins: [configuration.urlPublique, ...configuration.originesAutorisees],
    // L'inscription écrit le compte, son identifiant de connexion et sa session dans une seule
    // transaction : une écriture en échec n'en laisse aucun (F-009-AC20).
    database: drizzleAdapter(base.db, {
      provider: "pg",
      schema: schemaComptes,
      transaction: true,
    }),
    databaseHooks: { session: { delete: { before: avantLaSuppressionNative } } },
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
        const taie = jointes.find((jointe) => jointe instanceof Error);
        const appel = appels.getStore();
        if (niveau === "error" && taie !== undefined && appel !== undefined) {
          appel.erreurTaie = taie;
        }
      },
    },
    // F-009-AC19 : une erreur qui n'est pas une `APIError` remonte jusqu'à `traiter`, au lieu que le
    // routeur de better-auth l'écrive en entier sur la console (texte SQL et paramètres compris).
    onAPIError: { throw: true },
  });

  async function executer(travail: (appel: Appel) => Promise<Response>): Promise<Traitement> {
    const appel: Appel = { supprimees: [] };
    try {
      const reponse = await appels.run(appel, () => travail(appel));
      return { ...appel, reponse };
    } catch (erreur) {
      return { ...appel, erreur };
    }
  }

  // H17 : better-auth tait une lecture en échec juste avant sa suppression et annonce un succès.
  // La session que la requête présentait est donc relue ; si elle vit encore, la fonction de
  // suppression la supprime, et son échec fait échouer la déconnexion (F-009-AC13, AC26).
  async function acheverLaDeconnexion(enTetes: Headers, appel: Appel): Promise<void> {
    try {
      const restante = await auth.api.getSession({
        headers: enTetes,
        query: { disableRefresh: true },
      });
      if (restante !== null && (await supprimerParLaFonction(restante.session.id)).length === 0) {
        throw new ErreurDeDeconnexion();
      }
    } catch (erreur) {
      appel.suppressionEnEchec ??= erreur;
    }
  }

  return {
    traiter: (requete) => executer(() => auth.handler(requete)),
    deconnecter: (requete) => {
      const enTetes = new Headers(requete.headers);
      return executer(async (appel) => {
        const reponse = await auth.handler(requete);
        if (reponse.status === STATUT_OK) {
          await acheverLaDeconnexion(enTetes, appel);
        }
        return reponse;
      });
    },
    async lireLaSession(enTetes) {
      const lue = await auth.api.getSession({ headers: enTetes, returnHeaders: true });
      return lue.response === null
        ? undefined
        : { compte: lue.response.user, enTetes: lue.headers };
    },
  };
}

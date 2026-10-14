// Assemblage du serveur (F-012-AC36, H16) : la seule fonction qui réunit l'application HTTP de
// F-008 à F-011 et la synchronisation de F-012, appelée par le point d'entrée de production (par
// `service.ts`) comme par la fabrique d'essai. Les réglages réduits, l'horloge et la défaillance
// provoquée ne sont que des paramètres de cette fonction : aucune variable de configuration ne les
// règle, et la production n'en passe aucun.
import type { Base } from "@notionlike/db";
import type { Express } from "express";

import { creerAdhesions, type Adhesions } from "./adhesions.ts";
import { creerApplication } from "./application.ts";
import { creerAuthentification } from "./authentification.ts";
import type { Configuration } from "./configuration.ts";
import { creerCompteurs } from "./debit.ts";
import type { Journal } from "./journal.ts";
import { creerSuppressionDeSessions, type SuppressionDeSessions } from "./sessions.ts";
import type { Defaillance, Minuterie, ReglagesSynchro } from "./synchro-reglages.ts";
import { creerSynchronisation, type Synchronisation } from "./synchronisation.ts";

export interface ParametresDEssai {
  readonly reglages?: ReglagesSynchro | undefined;
  readonly minuterie?: Minuterie | undefined;
  readonly defaillance?: Defaillance | undefined;
  // L'horloge des invitations et des plafonds de F-011 et F-027.
  readonly horloge?: (() => Date) | undefined;
}

interface Dependances {
  readonly configuration: Configuration;
  readonly base: Base;
  readonly journal: Journal;
  readonly essai?: ParametresDEssai | undefined;
}

export interface Assemblage {
  readonly application: Express;
  readonly synchronisation: Synchronisation;
  readonly suppression: SuppressionDeSessions;
  readonly adhesions: Adhesions;
}

// La synchronisation lit la session par sa propre instance de l'authentification, construite par
// la même fonction que celle des routes, sur la même base et la même fonction de suppression : la
// vérification est le même code (F-012-AC1). Elle s'abonne au module des adhésions et à la fonction
// de suppression de session que l'application emploie (F-012-AC12, AC14).
export function assembler({ configuration, base, journal, essai = {} }: Dependances): Assemblage {
  const suppression = creerSuppressionDeSessions(base, journal);
  const adhesions = creerAdhesions(base, journal);
  const application = creerApplication({
    configuration,
    base,
    journal,
    suppression,
    adhesions,
    ...(essai.horloge === undefined ? {} : { horloge: essai.horloge }),
  });
  const authentification = creerAuthentification({
    configuration,
    base,
    journal,
    suppression,
    consommer: creerCompteurs(),
  });
  const synchronisation = creerSynchronisation({
    configuration,
    base,
    journal,
    authentification,
    adhesions,
    suppression,
    reglages: essai.reglages,
    minuterie: essai.minuterie,
    defaillance: essai.defaillance,
  });
  return { application, synchronisation, suppression, adhesions };
}

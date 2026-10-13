import { z } from "zod";

export const CODES_ERREUR = [
  "requete-invalide",
  "ressource-introuvable",
  "corps-trop-grand",
  "base-indisponible",
  "erreur-interne",
  "non-authentifie",
  "trop-de-requetes",
  // F-011-AC31 : ajoutés à la fin, la liste n'étant modifiée que par ajout.
  "acces-refuse",
  "origine-refusee",
  "identifiant-indisponible",
  "dernier-proprietaire",
  "deja-membre",
  "invitation-invalide",
  "quota-atteint",
] as const;

export type CodeErreur = (typeof CODES_ERREUR)[number];

export const schemaEnveloppeErreur = z.strictObject({
  code: z.enum(CODES_ERREUR),
  message: z.string().min(1),
  idRequete: z.string().min(1),
});

export type EnveloppeErreur = z.infer<typeof schemaEnveloppeErreur>;

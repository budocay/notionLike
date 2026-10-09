import { z } from "zod";

export const CHEMINS = { sante: "/sante", pret: "/pret" } as const;

export const schemaReponseSante = z.strictObject({ etat: z.literal("ok") });

export type ReponseSante = z.infer<typeof schemaReponseSante>;

export const schemaReponsePret = z.strictObject({ etat: z.literal("pret") });

export type ReponsePret = z.infer<typeof schemaReponsePret>;

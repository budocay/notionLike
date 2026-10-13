// Schéma fermé de la version 1 du document de page (F-003-AC22, H2) : paquets unitaires, sans kit
// de départ, qui s'élargirait en silence. L'annulation est celle de la liaison Yjs : elle ne défait
// que les modifications locales (H9).
import type { Extensions } from "@tiptap/core";
import { Collaboration } from "@tiptap/extension-collaboration";
import { Document } from "@tiptap/extension-document";
import { Heading } from "@tiptap/extension-heading";
import { BulletList, ListItem, OrderedList } from "@tiptap/extension-list";
import { Paragraph } from "@tiptap/extension-paragraph";
import { Text } from "@tiptap/extension-text";
import type * as Y from "yjs";

import { INVITE_DU_BLOC_VIDE } from "../interface/messages.ts";
import { inviteDuBlocVide } from "./invite.ts";

const NIVEAU_DE_TITRE_MAX = 3;
export type NiveauDeTitre = 1 | 2 | typeof NIVEAU_DE_TITRE_MAX;
export const NIVEAUX_DE_TITRE: readonly NiveauDeTitre[] = [1, 2, NIVEAU_DE_TITRE_MAX];

export function extensionsDeLEditeur(contenu: Y.XmlFragment): Extensions {
  return [
    Document,
    Paragraph,
    Text,
    Heading.configure({ levels: [...NIVEAUX_DE_TITRE] }),
    BulletList,
    OrderedList,
    ListItem,
    Collaboration.configure({ fragment: contenu }),
    inviteDuBlocVide(INVITE_DU_BLOC_VIDE),
  ];
}

// Aujourd'hui (F-021-AC4) : la seule lecture de l'horloge et du fuseau de l'appareil de cette
// feature, dans un fichier à part. Le jour est celui de l'horloge locale : l'année, le mois et le
// quantième que l'appareil lit à cet instant, minuit passé compris.
import { ANNEE_MAX, ANNEE_MIN, ecrireLeJour } from "./jours.ts";

/** Ce que la fonction lit de l'horloge : un instant. */
export type Horloge = () => Date;

/** Le jour local de l'horloge donnée, `AAAA-MM-JJ`, ramené aux bornes du calendrier. */
export function aujourdhuiDe(horloge: Horloge): string {
  const maintenant = horloge();
  const annee = Math.min(ANNEE_MAX, Math.max(ANNEE_MIN, maintenant.getFullYear()));
  return ecrireLeJour({
    annee,
    mois: maintenant.getMonth() + 1,
    quantieme: maintenant.getDate(),
  });
}

/** Le jour d'aujourd'hui sur l'horloge de l'appareil. */
export function aujourdhui(): string {
  return aujourdhuiDe(() => new Date());
}

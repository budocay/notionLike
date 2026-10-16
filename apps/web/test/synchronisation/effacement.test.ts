// Effacement de la copie locale d'un espace détaché (F-013-AC24, AC44), sur le serveur réel : les
// bases de cet espace, et elles seules, puis l'entrée du registre ; l'autre onglet ferme tout.
import { demarrerServeurDEssai, type ServeurDEssai } from "@notionlike/server/essai";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  attendreLEtat,
  attendreQue,
  ecrireDansLaBase,
  entreeDuRegistre,
  espaceDuLancementSuivant,
  espacePartage,
  fermerLesOnglets,
  type Onglet,
  ouvrirUnOnglet,
} from "./aides-synchro.ts";

vi.setConfig({ testTimeout: 60_000 });

let serveur: ServeurDEssai;
beforeAll(async () => {
  serveur = await demarrerServeurDEssai();
});
afterAll(async () => {
  await serveur.fermer();
});
afterEach(() => {
  fermerLesOnglets();
});

async function basesDe(onglet: Onglet): Promise<string[]> {
  return (await onglet.appareil.idb.databases()).map(({ name = "" }) => name);
}

describe("effacer la copie locale", () => {
  it("F-013-AC24 F-013-AC44 espace détaché : base d'espace et bases de ses pages, arborescence et corbeille, effacées par leur désignation dans cet espace ; registre et espace local oubliés ; l'autre onglet ferme d'abord", async () => {
    const partage = await espacePartage(serveur, "editeur", ["Gardée", "Jetée"]);
    const { chez, ailleurs, idEspace } = partage;
    const jetee = chez.facade.lire().racines.find(({ titre }) => titre === "Jetée")?.id ?? "";
    chez.facade.mettreALaCorbeille(jetee);
    await attendreQue(() => ailleurs.facade.lire().corbeille.length === 1, 10_000);
    await attendreLEtat(ailleurs, "synchronise", 15_000);
    const autreEspace = crypto.randomUUID();
    const autrePage = crypto.randomUUID();
    await ecrireDansLaBase(ailleurs.appareil, autreEspace, autrePage, "ailleurs");
    const avant = await basesDe(ailleurs);
    expect(avant.filter((nom) => nom.includes(idEspace))).toHaveLength(3);

    const etapes: string[] = [];
    const second: { onglet?: Onglet } = {};
    second.onglet = await ouvrirUnOnglet({
      serveur,
      cookie: partage.membre.cookie,
      idEspace,
      appareil: ailleurs.appareil,
      rejoint: true,
      surEffacement: (etape) => {
        etapes.push(etape);
        if (etape === "demande") {
          second.onglet?.persistance.fermer();
        }
      },
    });
    await serveur.retirerMembre(partage.proprietaire.cookie, idEspace, partage.membre.idCompte);
    await attendreLEtat(ailleurs, "detache", 15_000);

    ailleurs.persistance.fermer();
    expect(await ailleurs.synchro.effacerLaCopieLocale()).toBe("effacee");

    await attendreQue(() => etapes.length === 2);
    expect(etapes).toEqual(["demande", "faite"]);
    const apres = await basesDe(ailleurs);
    expect(apres.filter((nom) => nom.includes(idEspace))).toEqual([]);
    expect(apres).toContain(`notionlike:page:${autreEspace}:${autrePage}`);
    expect(await entreeDuRegistre(ailleurs.appareil, idEspace)).toBeUndefined();
    // Le lancement suivant est un premier lancement : un espace neuf, pas celui-ci.
    const suivant = await espaceDuLancementSuivant(ailleurs.appareil);
    expect(suivant).toBeDefined();
    expect(suivant).not.toBe(idEspace);
  });
});

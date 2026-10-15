// Message trop grand (F-013-AC28, H10, AC42) : le remède premier est de ne pas l'émettre ; la
// conduite après une fermeture 1009 n'est qu'un filet, borné à deux fermetures par document.
import { LIMITES_SYNCHRO } from "@notionlike/contrats";
import { demarrerServeurDEssai, type ServeurDEssai } from "@notionlike/server/essai";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { correspondance } from "../../src/synchronisation/noms.ts";
import {
  adopterEtAttendre,
  afficher,
  attendreLEtat,
  attendreQue,
  ecrireDansLaPage,
  fermerLesOnglets,
  ouvrirUnOnglet,
  pageDEssai,
  pause,
  texteDeLaPage,
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

function contientLeTitre(instantane: Uint8Array | undefined, titre: string): boolean {
  return instantane !== undefined && new TextDecoder().decode(instantane).includes(titre);
}

describe("message trop grand", () => {
  it("F-013-AC28 des modifications hors ligne plus grandes que la limite publiée ne sont pas émises : la page est en envoi bloqué, rien n'est perdu, les autres documents continuent", async () => {
    const membre = await serveur.inscrire();
    const onglet = await ouvrirUnOnglet({
      serveur,
      cookie: membre.cookie,
      idEspace: crypto.randomUUID(),
    });
    const idPage = onglet.facade.creerPage("Volumineuse");
    await adopterEtAttendre(onglet);
    const page = pageDEssai(idPage);
    afficher(onglet, page);
    await attendreLEtat(onglet, "synchronise");
    onglet.reseau.couper();
    await attendreQue(() => onglet.synchro.lireEtat().affiche !== "synchronise");
    const volume = "v".repeat(LIMITES_SYNCHRO.octetsParMessage + 1024);
    ecrireDansLaPage(page.doc, volume);

    onglet.reseau.retablir();
    onglet.signaler("reseau");
    await attendreQue(
      () =>
        onglet.synchro
          .lireEtat()
          .documentsEnErreur.some(
            ({ idPage: bloquee, cause }) => bloquee === idPage && cause === "trop-volumineux",
          ),
      20_000,
    );

    expect(
      onglet.reseau.emis.every((octets) => octets.byteLength <= LIMITES_SYNCHRO.octetsParMessage),
    ).toBe(true);
    expect(texteDeLaPage(page.doc)).toContain(volume);
    onglet.facade.creerPage("Transmise malgré tout");
    const nomDeLEspace = correspondance("espace", onglet.idEspace).nomDeDocument;
    await attendreQue(
      async () =>
        contientLeTitre(await serveur.lireInstantane(nomDeLEspace), "Transmise malgré tout"),
      15_000,
    );
  });

  it("F-013-AC28 après une fermeture 1009, les documents sont rouverts un à un ; celui qui provoque la seconde est bloqué : jamais plus de deux fermetures 1009 pour un même document, rien n'est perdu", async () => {
    const etroit = await demarrerServeurDEssai({ reglages: { octetsParMessage: 20_000 } });
    try {
      const membre = await etroit.inscrire();
      const onglet = await ouvrirUnOnglet({
        serveur: etroit,
        cookie: membre.cookie,
        idEspace: crypto.randomUUID(),
      });
      const idPage = onglet.facade.creerPage("Trop grande pour ce serveur");
      await adopterEtAttendre(onglet);
      const page = pageDEssai(idPage);
      afficher(onglet, page);
      await attendreLEtat(onglet, "synchronise");
      const texte = "w".repeat(40_000);

      ecrireDansLaPage(page.doc, texte);
      await attendreQue(
        () =>
          onglet.synchro
            .lireEtat()
            .documentsEnErreur.some(
              ({ idPage: bloquee, cause }) => bloquee === idPage && cause === "trop-volumineux",
            ),
        30_000,
      );
      await pause(3000);

      const fermetures1009 = etroit
        .lignesDuJournal()
        .filter((ligne) => JSON.stringify(ligne).includes("message-trop-grand"));
      expect(fermetures1009.length).toBeGreaterThan(0);
      expect(fermetures1009.length).toBeLessThanOrEqual(2);
      expect(texteDeLaPage(page.doc)).toContain(texte);
      expect(onglet.synchro.lireEtat().affiche).toBe("erreur");
    } finally {
      fermerLesOnglets();
      await etroit.fermer();
    }
  });
});

// Espaces, membres et invitations dans Chromium, contre la pile de F-008 (F-014-AC40, H11) : deux
// comptes dans deux contextes de navigateur. Seule preuve, dans un navigateur réel, du remplacement
// de l'entrée d'historique qui retire le jeton de l'adresse (H4). Ignoré quand le serveur est absent.
import { type Browser, expect, type Page, test } from "@playwright/test";

import { ouvrir, titrePrincipal } from "./aides.ts";

const MOI = "/api/v1/moi";
const MOT_DE_PASSE = "un mot de passe assez long";

async function serveurPresent(page: Page): Promise<boolean> {
  const reponse = await page.request.get(MOI, { failOnStatusCode: false });
  return reponse.status() === 401 || reponse.status() === 200;
}

async function inscrire(page: Page, nom: string, courriel: string): Promise<void> {
  await page
    .getByRole("region", { name: "Compte" })
    .getByRole("link", { name: "Créer un compte" })
    .click();
  await remplir(page, nom, courriel);
  await page.getByRole("button", { name: "Créer le compte" }).click();
  await expect(page.getByRole("region", { name: "Compte" }).getByRole("status")).toHaveText(
    `Connecté : ${nom}`,
  );
}

async function remplir(page: Page, nom: string | undefined, courriel: string): Promise<void> {
  if (nom !== undefined) {
    await page.getByLabel("Nom", { exact: false }).fill(nom);
  }
  await page.getByLabel("Courriel", { exact: false }).fill(courriel);
  await page.getByLabel("Mot de passe", { exact: false }).fill(MOT_DE_PASSE);
}

async function nouvellePage(browser: Browser): Promise<Page> {
  const contexte = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"] });
  return contexte.newPage();
}

test("F-014-AC40 deux comptes : créer, inviter en lecteur, rejoindre, passer éditeur, retirer, supprimer ; le jeton ne reste jamais dans l'adresse ni dans l'historique", async ({
  browser,
}) => {
  const alice = await nouvellePage(browser);
  test.skip(!(await serveurPresent(alice)), "serveur de F-008 absent (pile Docker Compose)");
  const bob = await nouvellePage(browser);
  const suffixe = Date.now().toString(36);
  const courrielDeBob = `bob-${suffixe}@exemple.fr`;
  const nomDeLEspace = `Atlas ${suffixe}`;

  // Alice crée un espace et un lien « Lecteur », qu'elle copie.
  await ouvrir(alice);
  await inscrire(alice, "Alice Bout en bout", `alice-${suffixe}@exemple.fr`);
  await alice.getByRole("link", { name: "Espaces" }).click();
  await alice.getByRole("button", { name: "Nouvel espace" }).click();
  await alice.keyboard.type(nomDeLEspace);
  await alice.keyboard.press("Enter");
  await expect(titrePrincipal(alice)).toHaveText(nomDeLEspace);
  await alice.getByRole("combobox", { name: "Rôle donné par le lien" }).selectOption("lecteur");
  await alice.getByRole("button", { name: /^Créer un lien d'invitation/ }).click();
  const boite = alice.getByRole("dialog", { name: "Lien d'invitation" });
  await boite.getByRole("button", { name: "Copier le lien" }).click();
  await expect(boite.getByText("Lien copié")).toBeVisible();
  const lien = await alice.evaluate(() => navigator.clipboard.readText());
  expect(lien).toMatch(/\/#\/invitation\/[A-Za-z0-9_-]{43}$/);
  const jeton = lien.slice(lien.lastIndexOf("/") + 1);
  await alice.keyboard.press("Escape");

  // Bob ouvre le lien : le jeton quitte l'adresse ; précédent ne le ramène pas.
  await ouvrir(bob);
  await bob.goto(lien);
  await expect(titrePrincipal(bob)).toHaveText("Invitation");
  await expect(bob).toHaveURL(/#\/invitation$/);
  await bob.goBack();
  expect(bob.url()).not.toContain(jeton);
  await bob.goForward();
  expect(bob.url()).not.toContain(jeton);
  await bob.goto(lien);
  await expect(titrePrincipal(bob)).toHaveText("Invitation");

  // Il crée son compte par le détour, revient à l'invitation et rejoint l'espace.
  await bob.getByRole("button", { name: "Créer un compte" }).click();
  await remplir(bob, "Bob Bout en bout", courrielDeBob);
  await bob.getByRole("button", { name: "Créer le compte" }).click();
  await expect(bob).toHaveURL(/#\/invitation$/);
  await bob.getByRole("button", { name: "Rejoindre l'espace" }).click();
  await expect(
    bob.getByText(`Vous avez rejoint « ${nomDeLEspace} » en tant que Lecteur.`),
  ).toBeVisible();
  expect(bob.url()).not.toContain(jeton);
  await bob.getByRole("link", { name: "Espaces" }).click();
  await expect(
    bob.getByRole("row", { name: new RegExp(`${nomDeLEspace}.*Lecteur`) }),
  ).toBeVisible();
  await bob.getByRole("link", { name: `Ouvrir l'espace ${nomDeLEspace}` }).click();
  await expect(bob.getByRole("button", { name: /^Supprimer l'espace/ })).toHaveCount(0);
  await expect(bob.getByRole("combobox")).toHaveCount(0);
  await expect(bob.getByRole("button", { name: /^Retirer / })).toHaveCount(0);

  // Alice le passe « Éditeur » ; Bob le voit après relecture de la liste.
  await alice.reload();
  await alice.getByRole("combobox", { name: "Rôle de Bob Bout en bout" }).selectOption("editeur");
  await expect(alice.getByText("Rôle de Bob Bout en bout : Éditeur")).toBeVisible();
  await bob.getByRole("link", { name: "Retour aux espaces" }).click();
  await expect(
    bob.getByRole("row", { name: new RegExp(`${nomDeLEspace}.*Éditeur`) }),
  ).toBeVisible();

  // Alice retire Bob après avoir lu l'avertissement ; l'espace quitte la liste de Bob.
  await alice.getByRole("button", { name: "Retirer Bob Bout en bout de l'espace" }).click();
  const retrait = alice.getByRole("alertdialog");
  await expect(retrait).toContainText("Un retrait ne reprend pas ce qui a déjà été lu");
  await retrait.getByRole("button", { name: "Retirer Bob Bout en bout de l'espace" }).click();
  await expect(alice.getByText("Bob Bout en bout a été retiré de l'espace")).toBeVisible();
  await bob.reload();
  await expect(bob.getByRole("link", { name: `Ouvrir l'espace ${nomDeLEspace}` })).toHaveCount(0);

  // Alice supprime l'espace en saisissant son nom.
  await alice.getByRole("button", { name: `Supprimer l'espace ${nomDeLEspace}` }).click();
  const suppression = alice.getByRole("alertdialog");
  await suppression.getByRole("textbox").fill(nomDeLEspace);
  await suppression.getByRole("button", { name: /^Supprimer définitivement/ }).click();
  await expect(alice.getByText("Espace supprimé")).toBeVisible();
  await expect(alice).toHaveURL(/#\/espaces$/);
});

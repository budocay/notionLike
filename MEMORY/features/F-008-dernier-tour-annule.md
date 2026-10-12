# Archive : dernier tour de F-008 arrêté avant commit

Travail non commité d'agent-backend' (`enveloppe.ts`, `application.ts`, tests 4xx, deflate/br, Origin null, exhaustivité des codes) et d'agent-bdd' (`migration.ts`, plusieurs sondes en vol, assertion Drizzle), arrêtés par le dev le 2026-10-12. Ce patch casse 5 tests de `packages/db/test/migration.test.ts` ; il s'applique sur `e7a965a` par `git apply`. À reprendre avec F-009.

```diff
diff --git a/apps/server/src/application.ts b/apps/server/src/application.ts
index 92c22c0..384516a 100644
--- a/apps/server/src/application.ts
+++ b/apps/server/src/application.ts
@@ -11,6 +11,7 @@ import {
   envoyerErreur,
   identifierLaRequete,
   idRequeteDe,
+  marquerLesErreursDeLecture,
   repondreIntrouvable,
 } from "./enveloppe.ts";
 import type { Journal } from "./journal.ts";
@@ -101,14 +102,17 @@ export function creerApplication({ configuration, base, journal }: Dependances):
   application.use(autoriserLesOrigines(configuration.originesAutorisees));
   // F-008-AC6 : un corps compressé est décompressé, et la limite vaut pour le corps décompressé ;
   // un jeu de caractères autre qu'UTF ou un encodage inconnu est refusé par le lecteur (415), que
-  // le gestionnaire d'erreurs rend en 400 `requete-invalide`.
+  // le gestionnaire d'erreurs rend en 400 `requete-invalide`. Les erreurs du lecteur sont
+  // marquées à leur sortie : ce sont les seules qu'il rend en 400 ou 413.
   application.use(
-    express.json({
-      limit: LIMITE_CORPS_OCTETS,
-      inflate: true,
-      strict: true,
-      type: "application/json",
-    }),
+    marquerLesErreursDeLecture(
+      express.json({
+        limit: LIMITE_CORPS_OCTETS,
+        inflate: true,
+        strict: true,
+        type: "application/json",
+      }),
+    ),
   );
   application.get(CHEMINS.sante, repondreSante);
   application.get(CHEMINS.pret, repondrePret(base, journal));
diff --git a/apps/server/src/enveloppe.ts b/apps/server/src/enveloppe.ts
index 6e29a81..848909e 100644
--- a/apps/server/src/enveloppe.ts
+++ b/apps/server/src/enveloppe.ts
@@ -40,27 +40,56 @@ export const repondreIntrouvable: RequestHandler = (_requete, reponse) => {
   envoyerErreur(reponse, "ressource-introuvable");
 };

-// Les erreurs de lecture du corps levées par Express portent un `status` entre 400 et 499.
-function statutClientDe(erreur: unknown): number | undefined {
+// F-008-AC6 : seule une erreur émise par le lecteur du corps peut devenir une réponse 400 ou 413.
+// Elle est enveloppée à sa sortie du lecteur : un statut client porté par l'erreur d'un autre
+// maillon (une authentification, par exemple) n'est donc jamais repris, quelle que soit sa forme.
+class ErreurDeLectureDuCorps extends Error {
+  override readonly name = "ErreurDeLectureDuCorps";
+  readonly statut: number | undefined;
+
+  constructor(statut: number | undefined, cause: unknown) {
+    super("lecture du corps en échec", { cause });
+    this.statut = statut;
+  }
+}
+
+function statutDe(erreur: unknown): number | undefined {
   const statut = erreur instanceof Error && "status" in erreur ? erreur.status : undefined;
-  const estClient =
-    typeof statut === "number" &&
-    statut >= PREMIER_STATUT_CLIENT &&
-    statut < PREMIER_STATUT_SERVEUR;
-  return estClient ? statut : undefined;
+  return typeof statut === "number" ? statut : undefined;
+}
+
+export function marquerLesErreursDeLecture(lecteur: RequestHandler): RequestHandler {
+  return (requete, reponse, suivant) => {
+    void lecteur(requete, reponse, (erreur?: unknown) => {
+      if (erreur === undefined) {
+        suivant();
+      } else {
+        suivant(new ErreurDeLectureDuCorps(statutDe(erreur), erreur));
+      }
+    });
+  };
+}
+
+// Le code d'une erreur du lecteur à statut client ; toute autre erreur n'en a pas.
+function codeDeLecture(erreur: unknown): CodeErreur | undefined {
+  const statut = erreur instanceof ErreurDeLectureDuCorps ? erreur.statut : undefined;
+  if (statut === undefined || statut < PREMIER_STATUT_CLIENT || statut >= PREMIER_STATUT_SERVEUR) {
+    return undefined;
+  }
+  return statut === STATUT_CORPS_TROP_GRAND ? "corps-trop-grand" : "requete-invalide";
 }

-// L'erreur d'un corps illisible porte ce corps : elle n'est pas journalisée. Toute autre erreur
-// l'est en entier, et la réponse n'en dit rien (F-008-AC8).
+// L'erreur d'un corps illisible porte ce corps : elle n'est pas journalisée. Toute autre erreur,
+// même porteuse d'un statut client, est une erreur non prévue : journalisée en entier, et la
+// réponse n'en dit rien (F-008-AC8).
 export function creerGestionnaireDErreurs(journal: Journal): ErrorRequestHandler {
   return (erreur: unknown, _requete, reponse, _suivant) => {
-    const statutClient = statutClientDe(erreur);
-    if (statutClient === undefined) {
+    const code = codeDeLecture(erreur);
+    if (code === undefined) {
       journal.erreurInterne(idRequeteDe(reponse), erreur);
       envoyerErreur(reponse, "erreur-interne");
     } else {
-      const trop = statutClient === STATUT_CORPS_TROP_GRAND;
-      envoyerErreur(reponse, trop ? "corps-trop-grand" : "requete-invalide");
+      envoyerErreur(reponse, code);
     }
   };
 }
diff --git a/apps/server/test/coutures.test.ts b/apps/server/test/coutures.test.ts
index afb7e13..551eb17 100644
--- a/apps/server/test/coutures.test.ts
+++ b/apps/server/test/coutures.test.ts
@@ -103,3 +103,16 @@ describe("appelants de l'écoute et du service", () => {
     ]);
   });
 });
+
+// Couture de F-008-AC6 et AC8 : le gestionnaire d'erreurs ne rend plus en 400 ou 413 que les
+// erreurs marquées à la sortie du lecteur du corps. Ses appelants sont énumérés : en production,
+// seule `application.ts` le pose, et c'est elle qui marque le lecteur (erreurs.test.ts le prouve
+// par HTTP pour chaque refus du lecteur) ; `enveloppe.test.ts` les assemble pour ses coutures.
+describe("appelants du gestionnaire d'erreurs", () => {
+  it.each(["creerGestionnaireDErreurs", "marquerLesErreursDeLecture"])(
+    "F-008-AC6 les fichiers qui appellent %s sont énumérés",
+    (nom) => {
+      expect(appelantsDe(nom)).toEqual(["src/application.ts", "test/enveloppe.test.ts"]);
+    },
+  );
+});
diff --git a/apps/server/test/en-tetes.test.ts b/apps/server/test/en-tetes.test.ts
index 09d75ff..2493c1a 100644
--- a/apps/server/test/en-tetes.test.ts
+++ b/apps/server/test/en-tetes.test.ts
@@ -190,6 +190,26 @@ describe("origines", () => {
     expect(reponse.headers.get("vary")).toBe("Origin");
   });

+  it.each([
+    ["absent", {}],
+    ["null", { Origin: "null" }],
+  ])(
+    "F-008-AC10 avec une liste non vide, un en-tête Origin %s ne reçoit aucun en-tête d'autorisation",
+    async (_cas, entetes) => {
+      const serveur = await lancerServeur(embarquee.base, {
+        env: { ORIGINES_AUTORISEES: `${AUTRE_ORIGINE},${ORIGINE_AUTORISEE}` },
+      });
+
+      const reponse = await fetch(`${serveur.url}${CHEMINS.sante}`, { headers: entetes });
+
+      expect(reponse.status).toBe(200);
+      expect(await santeDe(reponse)).toEqual({ etat: "ok" });
+      expect(reponse.headers.has("access-control-allow-origin")).toBe(false);
+      expect(reponse.headers.has("access-control-allow-credentials")).toBe(false);
+      expect(reponse.headers.get("vary")).toBe("Origin");
+    },
+  );
+
   it("F-008-AC10 une origine de la liste reçoit son origine et l'autorisation des identifiants", async () => {
     const serveur = await lancerServeur(embarquee.base, {
       env: { ORIGINES_AUTORISEES: `${AUTRE_ORIGINE},${ORIGINE_AUTORISEE}` },
diff --git a/apps/server/test/erreurs.test.ts b/apps/server/test/erreurs.test.ts
index f5bdd7d..9976c14 100644
--- a/apps/server/test/erreurs.test.ts
+++ b/apps/server/test/erreurs.test.ts
@@ -1,4 +1,4 @@
-import { gzipSync } from "node:zlib";
+import { brotliCompressSync, deflateSync, gzipSync } from "node:zlib";

 import { CHEMINS } from "@notionlike/contrats";
 import { ouvrirBaseEmbarquee, type BaseEmbarquee } from "@notionlike/db/essai";
@@ -164,6 +164,49 @@ describe("jeu de caractères et compression du corps", () => {
     expect((await enveloppeDe(reponse)).code).toBe("corps-trop-grand");
   });

+  // Les deux autres encodages que le lecteur prend en charge : la limite y vaut aussi pour le corps
+  // décompressé.
+  const AUTRES_COMPRESSIONS = [
+    ["deflate", (corps: string) => deflateSync(corps)],
+    ["br", (corps: string) => brotliCompressSync(corps)],
+  ] as const;
+
+  it.each(AUTRES_COMPRESSIONS)(
+    "F-008-AC6 un corps compressé en %s est décompressé puis lu : 100 000 octets décompressés reçoivent le 404 du chemin inconnu",
+    async (encodage, compresser) => {
+      const serveur = await lancerServeur(embarquee.base);
+      const compresse = compresser(objetJsonDe(LIMITE_OCTETS));
+
+      const reponse = await posterAvec(
+        serveur,
+        { ...JSON_ENTETES, "Content-Encoding": encodage },
+        compresse,
+      );
+
+      expect(compresse.byteLength).toBeLessThan(LIMITE_OCTETS / 100);
+      expect(reponse.status).toBe(404);
+      expect((await enveloppeDe(reponse)).code).toBe("ressource-introuvable");
+    },
+  );
+
+  it.each(AUTRES_COMPRESSIONS)(
+    "F-008-AC6 la limite vaut pour le corps décompressé en %s : 100 001 octets compressés en moins de 1 000 reçoivent 413 corps-trop-grand",
+    async (encodage, compresser) => {
+      const serveur = await lancerServeur(embarquee.base);
+      const compresse = compresser(objetJsonDe(LIMITE_OCTETS + 1));
+
+      const reponse = await posterAvec(
+        serveur,
+        { ...JSON_ENTETES, "Content-Encoding": encodage },
+        compresse,
+      );
+
+      expect(compresse.byteLength).toBeLessThan(LIMITE_OCTETS / 100);
+      expect(reponse.status).toBe(413);
+      expect((await enveloppeDe(reponse)).code).toBe("corps-trop-grand");
+    },
+  );
+
   it("F-008-AC6 un corps compressé dont le JSON décompressé est tronqué reçoit 400 requete-invalide", async () => {
     const serveur = await lancerServeur(embarquee.base);

@@ -284,6 +327,32 @@ describe("erreur non prévue", () => {
     expect(ligneDErreur(serveur, idRequete)?.erreur).toMatchObject([{ message: "panne" }]);
   });

+  // Seule la lecture du corps rend une erreur en 400 ou 413 (F-008-AC6) : le statut client que
+  // porterait l'erreur d'un autre maillon (une authentification, par exemple) n'est pas repris.
+  it.each([
+    ["401", { status: 401 }],
+    ["403", { status: 403 }],
+    ["400 qui imite la lecture du corps", { status: 400, type: "entity.parse.failed" }],
+    ["413 qui imite la lecture du corps", { status: 413, type: "entity.too.large" }],
+  ])(
+    "F-008-AC8 une erreur d'un maillon qui porte un statut %s reçoit 500 erreur-interne, et elle est consignée",
+    async (_cas, proprietes) => {
+      const { serveur, reponse } = await provoquer(
+        Object.assign(new Error("refus d'un maillon"), proprietes),
+      );
+      const { idRequete, code, message } = await enveloppeDe(reponse);
+
+      expect(reponse.status).toBe(500);
+      expect(code).toBe("erreur-interne");
+      expect(message).toBe("Une erreur interne est survenue.");
+      expect(ligneDErreur(serveur, idRequete)).toMatchObject({
+        niveau: "error",
+        message: "erreur-interne",
+        erreur: [{ type: "Error", message: "refus d'un maillon" }],
+      });
+    },
+  );
+
   it("F-008-AC8 une valeur levée qui n'est pas une erreur reçoit aussi 500, et sa nature est consignée", async () => {
     const { serveur, reponse } = await provoquer("une chaîne levée");
     const { idRequete, code } = await enveloppeDe(reponse);
diff --git a/packages/db/src/migration.ts b/packages/db/src/migration.ts
index a02120a..3fed504 100644
--- a/packages/db/src/migration.ts
+++ b/packages/db/src/migration.ts
@@ -33,7 +33,7 @@ export async function lancerMigration(
     await pilote.appliquerMigrations(dossier);
     return 0;
   } catch (erreur) {
-    [PHRASE_D_ECHEC, ...messagesDeLaChaine(erreur)].forEach((ligne) => {
+    [PHRASE_D_ECHEC, String(erreur)].forEach((ligne) => {
       ecrire(ligne);
     });
     return 1;
diff --git a/packages/db/test/acces.test.ts b/packages/db/test/acces.test.ts
index 1c8fe0b..0553a55 100644
--- a/packages/db/test/acces.test.ts
+++ b/packages/db/test/acces.test.ts
@@ -1,5 +1,6 @@
 import { inspect } from "node:util";

+import { PGlite } from "@electric-sql/pglite";
 import { sql } from "drizzle-orm";
 import { Pool } from "pg";
 import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
@@ -16,6 +17,8 @@ const MOT_DE_PASSE = "mot-de-passe-de-test";
 const DELAI_MAXIMAL_DU_CAS_MS = 10_000;
 const ATTENTE_DE_LA_COUPURE_MS = 200;
 const ATTENTE_MAXIMALE_DE_LA_FERMETURE_MS = 1000;
+// Au moins trois connexions empruntées en même temps, sous les dix de la réserve.
+const SONDES_SIMULTANEES = 4;
 // Chaque base embarquée est une instance PGlite neuve. La première du fichier compile le
 // WebAssembly et fait un initdb : 1,6 à 5,6 s mesurés seul sur 4 CPU, plusieurs fois plus quand
 // toute la suite tourne en parallèle ; les suivantes partent du gabarit de `base-embarquee.ts`.
@@ -48,6 +51,27 @@ function echecSynchroneDe(action: () => unknown): ErreurBase {
   return issue as ErreurBase;
 }

+// Les connexions qu'une réserve a prêtées (`acquire`) et pas encore reprises (`release`), lues
+// dans les événements qu'elle a émis, dans l'ordre.
+function connexionsEmpruntees(evenements: readonly (readonly unknown[])[]): Set<unknown> {
+  const empruntees = new Set<unknown>();
+  for (const [nom, ...valeurs] of evenements) {
+    if (nom === "acquire") {
+      empruntees.add(valeurs[0]);
+    } else if (nom === "release") {
+      empruntees.delete(valeurs[1]);
+    }
+  }
+  return empruntees;
+}
+
+// Le moteur PGlite d'une base embarquée, que Drizzle garde sous `$client`.
+function moteurDe(embarquee: BaseEmbarquee): PGlite {
+  const { $client: moteur } = embarquee.pilote.db as unknown as { readonly $client: unknown };
+  expect(moteur).toBeInstanceOf(PGlite);
+  return moteur as PGlite;
+}
+
 function attendre(dureeMs: number): Promise<void> {
   return new Promise((resolve) => {
     setTimeout(resolve, dureeMs);
@@ -133,6 +157,83 @@ describe("accès à une base embarquée", () => {
   });
 });

+// L'isolement ne doit pas dépendre de l'ordre des tests : le gabarit est pris à la première
+// ouverture du module, quel que soit le test qui la fait. Chaque cas ouvre ses bases lui-même.
+describe("isolement des bases embarquées, quel que soit l'ordre des tests", () => {
+  const chercher = sql`select to_regclass('essai_ordre')::text as table_trouvee`;
+
+  // Une base ouverte, qui reçoit une table et une ligne, puis une seconde ouverte après : que la
+  // première soit la source du gabarit ou une copie, la seconde n'en voit rien.
+  async function constaterQueLaSecondeNeVoitRien(
+    ouvrir: () => Promise<BaseEmbarquee>,
+  ): Promise<void> {
+    const premiere = await ouvrir();
+    let seconde: BaseEmbarquee | undefined;
+    try {
+      await premiere.base.db.execute(sql`create table essai_ordre (id integer primary key)`);
+      await premiere.base.db.execute(sql`insert into essai_ordre (id) values (1)`);
+
+      seconde = await ouvrir();
+
+      expect(lignesDe(await premiere.base.db.execute(chercher))).toEqual([
+        { table_trouvee: "essai_ordre" },
+      ]);
+      expect(lignesDe(await seconde.base.db.execute(chercher))).toEqual([{ table_trouvee: null }]);
+    } finally {
+      await seconde?.base.fermer();
+      await premiere.base.fermer();
+    }
+  }
+
+  it(
+    "F-008-AC18 une base qui a déjà servi avant l'ouverture d'une seconde ne lui transmet rien",
+    () => constaterQueLaSecondeNeVoitRien(ouvrirBaseEmbarquee),
+    2 * DELAI_D_OUVERTURE_D_UNE_BASE_MS,
+  );
+
+  // Un module neuf n'a pas encore de gabarit : sa première base en est la source, quel que soit
+  // l'ordre des tests de ce fichier. La copie (`dumpDataDir`) de son moteur doit être finie quand
+  // l'ouverture rend la base, donc avant qu'elle ne serve, et n'être jamais reprise ensuite ; la
+  // seconde base part de cette copie sans que son propre moteur soit copié. PGlite copie aussi, en
+  // interne, le moteur jetable de son initdb : seules les copies des moteurs rendus sont comptées.
+  it(
+    "F-008-AC18 dans un module neuf, la copie du gabarit est finie avant que sa première base ne serve",
+    async () => {
+      const copier = PGlite.prototype.dumpDataDir;
+      const copiesFinies = new Map<PGlite, number>();
+      const copies = vi.spyOn(PGlite.prototype, "dumpDataDir").mockImplementation(async function (
+        this: PGlite,
+        ...options
+      ) {
+        const copie = await copier.apply(this, options);
+        copiesFinies.set(this, (copiesFinies.get(this) ?? 0) + 1);
+        return copie;
+      });
+      try {
+        vi.resetModules();
+        const neuf = await import("./base-embarquee.ts");
+        const moteurs: PGlite[] = [];
+        const copiesQuandElleEstRendue: number[] = [];
+        const ouvrirEnRelevantLesCopies = async (): Promise<BaseEmbarquee> => {
+          const embarquee = await neuf.ouvrirBaseEmbarquee();
+          const moteur = moteurDe(embarquee);
+          moteurs.push(moteur);
+          copiesQuandElleEstRendue.push(copiesFinies.get(moteur) ?? 0);
+          return embarquee;
+        };
+
+        await constaterQueLaSecondeNeVoitRien(ouvrirEnRelevantLesCopies);
+
+        expect(copiesQuandElleEstRendue).toEqual([1, 0]);
+        expect(moteurs.map((moteur) => copiesFinies.get(moteur) ?? 0)).toEqual([1, 0]);
+      } finally {
+        copies.mockRestore();
+      }
+    },
+    2 * DELAI_D_OUVERTURE_D_UNE_BASE_MS,
+  );
+});
+
 describe("accès par le pilote pg", () => {
   it("F-008-AC17 vers un port local fermé, la sonde lève base-injoignable sans l'URL ni le mot de passe", async () => {
     const port = await portFerme();
@@ -275,6 +376,75 @@ describe("accès par le pilote pg", () => {
     DELAI_MAXIMAL_DU_CAS_MS,
   );

+  // Le cas de la limite D-011 : plusieurs sondes hors délai gardent chacune une connexion empruntée.
+  // Les emprunts et les retours sont relevés sur les événements de la réserve (`acquire`,
+  // `release`), comme `src/acces.ts` les suit, sans rien changer à ce qu'elle fait.
+  it(
+    "F-008-AC17 avec plusieurs sondes hors délai simultanées, la fermeture aboutit, chaque requête en vol est rejetée et plus aucune connexion n'est empruntée",
+    async () => {
+      const evenementsDeLaReserve = vi.spyOn(Pool.prototype, "emit");
+      const requetesDeLaReserve = vi.spyOn(Pool.prototype, "query");
+      const faux = await demarrerFauxPostgres(MOT_DE_PASSE);
+      const base = ouvrirBase(faux.url);
+      try {
+        await expect(base.sonder()).resolves.toBeUndefined();
+        faux.seTaire();
+        const echecs = await Promise.all(
+          Array.from({ length: SONDES_SIMULTANEES }, () => echecDe(base.sonder())),
+        );
+        expect(echecs.map((erreur) => erreur.code)).toEqual(
+          Array.from({ length: SONDES_SIMULTANEES }, () => "sonde-hors-delai"),
+        );
+
+        const enVol = requetesDeLaReserve.mock.results.slice(1);
+        expect(enVol.map((resultat) => resultat.type)).toEqual(
+          Array.from({ length: SONDES_SIMULTANEES }, () => "return"),
+        );
+        const issuesDesRequetes = enVol.map((resultat) =>
+          Promise.resolve(resultat.value as unknown).then(
+            () => "aboutie",
+            (erreur: unknown) => erreur,
+          ),
+        );
+        const reserves = new Set(evenementsDeLaReserve.mock.contexts);
+        expect(reserves.size).toBe(1);
+        const [reserve] = reserves as Set<Pool>;
+        expect(await Promise.race([...issuesDesRequetes, attendre(0).then(() => "en vol")])).toBe(
+          "en vol",
+        );
+        expect(connexionsEmpruntees(evenementsDeLaReserve.mock.calls).size).toBe(
+          SONDES_SIMULTANEES,
+        );
+        expect(reserve?.totalCount).toBe(SONDES_SIMULTANEES);
+
+        const issue = await Promise.race([
+          base.fermer().then(() => "fermée"),
+          attendre(ATTENTE_MAXIMALE_DE_LA_FERMETURE_MS).then(() => "toujours ouverte"),
+        ]);
+
+        expect(issue).toBe("fermée");
+        const issues = await Promise.all(issuesDesRequetes);
+        expect(issues.map((erreur) => (erreur as Error).message)).toEqual(
+          Array.from({ length: SONDES_SIMULTANEES }, () => "Connection terminated"),
+        );
+        issues.forEach((erreur) => {
+          expect(erreur).toBeInstanceOf(Error);
+        });
+        expect(connexionsEmpruntees(evenementsDeLaReserve.mock.calls)).toEqual(new Set());
+        expect(reserve?.totalCount).toBe(0);
+        expect(faux.messagesRecus).toEqual(
+          Array.from({ length: SONDES_SIMULTANEES + 1 }, () => "Q"),
+        );
+      } finally {
+        evenementsDeLaReserve.mockRestore();
+        requetesDeLaReserve.mockRestore();
+        await faux.arreter();
+        await base.fermer();
+      }
+    },
+    DELAI_MAXIMAL_DU_CAS_MS,
+  );
+
   it("F-008-AC3 des connexions inactives coupées ne lèvent aucune exception non interceptée et la sonde suivante aboutit", async () => {
     const nonInterceptees: unknown[] = [];
     const noter = (erreur: unknown): void => {
diff --git a/packages/db/test/migration.test.ts b/packages/db/test/migration.test.ts
index 9f471e1..86c57fe 100644
--- a/packages/db/test/migration.test.ts
+++ b/packages/db/test/migration.test.ts
@@ -120,11 +120,30 @@ describe("migrations sur une base embarquée", () => {
     expect(await suivi(embarquee)).toEqual(QUAND);
   });

+  // Le message vient du migrateur de Drizzle : il n'est pas figé ici, seulement qu'il nomme le
+  // journal et que les lignes écrites sont exactement la phrase fixe puis la chaîne de son erreur.
   it("F-008-AC16 un dossier sans journal finit en code 1 sans toucher à la base", async () => {
-    const lancement = await lancer(embarquee, join(JEUX_D_ESSAI, "dossier-absent"));
+    const rejets: unknown[] = [];
+    const releve: BaseEmbarquee = {
+      ...embarquee,
+      pilote: {
+        ...embarquee.pilote,
+        appliquerMigrations: (dossier) =>
+          embarquee.pilote.appliquerMigrations(dossier).catch((erreur: unknown) => {
+            rejets.push(erreur);
+            throw erreur;
+          }),
+      },
+    };
+
+    const lancement = await lancer(releve, join(JEUX_D_ESSAI, "dossier-absent"));

     expect(lancement.code).toBe(1);
-    expect(lancement.lignes).toEqual([PHRASE_D_ECHEC, "Can't find meta/_journal.json file"]);
+    expect(rejets).toHaveLength(1);
+    const [rejet] = rejets;
+    expect(rejet).toBeInstanceOf(Error);
+    expect(lancement.lignes).toEqual([PHRASE_D_ECHEC, (rejet as Error).message]);
+    expect(lancement.lignes[1]).toMatch(/_journal/);
     expect(await tablesPubliques(embarquee)).toEqual([]);
   });

```

Fichier nouveau `apps/server/test/enveloppe.test.ts` :

```text
// Coutures de l'enveloppe d'erreur : chaque code de `@notionlike/contrats` a sa réponse, et seul le
// lecteur du corps peut rendre une erreur en statut client. Une application minimale porte les
// vraies fonctions d'`enveloppe.ts`, servie sur un port libre de 127.0.0.1.
import type { AddressInfo } from "node:net";
import { Writable } from "node:stream";

import { CODES_ERREUR, type CodeErreur } from "@notionlike/contrats";
import express, { type RequestHandler } from "express";
import { afterEach, describe, expect, it } from "vitest";

import {
  creerGestionnaireDErreurs,
  envoyerErreur,
  identifierLaRequete,
  marquerLesErreursDeLecture,
} from "../src/enveloppe.ts";
import { creerJournal } from "../src/journal.ts";
import { enveloppeDe, type LigneDeJournal } from "./aides.ts";

// Indépendante de la table `REPONSES` : c'est elle que ce test compare à la table.
const STATUTS_ATTENDUS: Readonly<Record<CodeErreur, number>> = {
  "requete-invalide": 400,
  "ressource-introuvable": 404,
  "corps-trop-grand": 413,
  "base-indisponible": 503,
  "erreur-interne": 500,
};

interface Essai {
  readonly url: string;
  lignes(): LigneDeJournal[];
}

const arrets: (() => Promise<void>)[] = [];

afterEach(async () => {
  await Promise.all(arrets.splice(0).map((arreter) => arreter()));
});

async function lancerEssai(...maillons: RequestHandler[]): Promise<Essai> {
  const morceaux: string[] = [];
  const sortie = new Writable({
    write(morceau: Buffer, _encodage, fin) {
      morceaux.push(morceau.toString("utf8"));
      fin();
    },
  });
  const application = express();
  application.use(identifierLaRequete);
  application.use(...maillons);
  application.use(creerGestionnaireDErreurs(creerJournal(sortie)));
  const ecoute = application.listen(0, "127.0.0.1");
  await new Promise((resolve) => ecoute.once("listening", resolve));
  arrets.push(
    () =>
      new Promise((resolve) => {
        ecoute.close(() => {
          resolve();
        });
        ecoute.closeAllConnections();
      }),
  );
  return {
    url: `http://127.0.0.1:${(ecoute.address() as AddressInfo).port}`,
    lignes: () =>
      morceaux
        .join("")
        .split("\n")
        .filter((ligne) => ligne !== "")
        .map((ligne) => JSON.parse(ligne) as LigneDeJournal),
  };
}

const envoyerLeCodeDuChemin: RequestHandler = (requete, reponse) => {
  envoyerErreur(reponse, requete.path.slice(1) as CodeErreur);
};

describe("exhaustivité des codes d'erreur", () => {
  it("F-008-AC22 la table des statuts attendus couvre exactement la liste publiée", () => {
    expect(Object.keys(STATUTS_ATTENDUS).sort()).toEqual([...CODES_ERREUR].sort());
  });

  it.each(CODES_ERREUR)(
    "F-008-AC22 le code %s produit par envoyerErreur une enveloppe valide, avec son statut",
    async (code) => {
      const essai = await lancerEssai(envoyerLeCodeDuChemin);

      const reponse = await fetch(`${essai.url}/${code}`);
      const enveloppe = await enveloppeDe(reponse);

      expect(reponse.status).toBe(STATUTS_ATTENDUS[code]);
      expect(enveloppe.code).toBe(code);
      expect(enveloppe.idRequete).toBe(reponse.headers.get("x-request-id"));
    },
  );

  // Cas fautif : un code sans entrée dans la table ne produit pas sa propre enveloppe, il échoue
  // en erreur interne consignée ; l'énumération ci-dessus le détecterait donc.
  it.each(["code-absent", "requete_invalide"])(
    "F-008-AC22 un code hors de la liste (%s) ne produit pas son enveloppe : 500 erreur-interne, consignée",
    async (code) => {
      const essai = await lancerEssai(envoyerLeCodeDuChemin);

      const reponse = await fetch(`${essai.url}/${code}`);
      const enveloppe = await enveloppeDe(reponse);

      expect(reponse.status).toBe(STATUTS_ATTENDUS["erreur-interne"]);
      expect(enveloppe.code).toBe("erreur-interne");
      expect(enveloppe.code).not.toBe(code);
      expect(essai.lignes()).toMatchObject([
        { niveau: "error", idRequete: enveloppe.idRequete, erreur: [{ type: "TypeError" }] },
      ]);
    },
  );
});

describe("erreurs du lecteur du corps", () => {
  function lecteurQuiEmet(erreur: unknown): RequestHandler {
    return (_requete, _reponse, suivant) => {
      suivant(erreur);
    };
  }

  function erreurDeStatut(statut: number): Error {
    return Object.assign(new Error(`statut ${statut}`), { status: statut });
  }

  it.each([
    [400, "requete-invalide"],
    [413, "corps-trop-grand"],
    [415, "requete-invalide"],
    [431, "requete-invalide"],
  ])(
    "F-008-AC6 une erreur %i émise par le lecteur reçoit son code, sans être journalisée",
    async (statut, code) => {
      const essai = await lancerEssai(
        marquerLesErreursDeLecture(lecteurQuiEmet(erreurDeStatut(statut))),
      );

      const reponse = await fetch(`${essai.url}/inconnu`);

      expect(reponse.status).toBe(STATUTS_ATTENDUS[code as CodeErreur]);
      expect((await enveloppeDe(reponse)).code).toBe(code);
      expect(essai.lignes()).toEqual([]);
    },
  );

  it.each([
    ["un statut de serveur", erreurDeStatut(500)],
    ["aucun statut", new Error("sans statut")],
  ])(
    "F-008-AC8 une erreur du lecteur portant %s reçoit 500 erreur-interne, et elle est consignée avec sa cause",
    async (_cas, erreur) => {
      const essai = await lancerEssai(marquerLesErreursDeLecture(lecteurQuiEmet(erreur)));

      const reponse = await fetch(`${essai.url}/inconnu`);
      const { idRequete, code } = await enveloppeDe(reponse);

      expect(reponse.status).toBe(STATUTS_ATTENDUS["erreur-interne"]);
      expect(code).toBe("erreur-interne");
      expect(essai.lignes()).toMatchObject([
        {
          niveau: "error",
          idRequete,
          erreur: [{ type: "ErreurDeLectureDuCorps" }, { message: erreur.message }],
        },
      ]);
    },
  );

  it("F-008-AC6 un lecteur qui laisse passer la requête n'émet aucune erreur", async () => {
    const lecteur: RequestHandler = (_requete, _reponse, suivant) => {
      suivant();
    };
    const essai = await lancerEssai(marquerLesErreursDeLecture(lecteur), envoyerLeCodeDuChemin);

    const reponse = await fetch(`${essai.url}/ressource-introuvable`);

    expect(reponse.status).toBe(STATUTS_ATTENDUS["ressource-introuvable"]);
    expect((await enveloppeDe(reponse)).code).toBe("ressource-introuvable");
    expect(essai.lignes()).toEqual([]);
  });
});
```

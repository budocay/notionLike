// Entrée d'essai de F-009, lancée par `processus-comptes.test.ts` comme `src/main.ts` l'est en
// production : le même service, sur une base embarquée migrée. Avec `ESSAI_BASE_DEFAILLANTE=1`,
// des déclencheurs font échouer certaines écritures, pour que l'erreur de Drizzle porte la requête
// et ses paramètres (courriel, empreinte, jeton) : un compte au domaine `compte-refuse.test`, un
// identifiant de connexion au domaine `identifiant-refuse.test`, et toute session d'un compte qui
// en a déjà une.
import { ouvrirBaseEmbarqueeMigree } from "@notionlike/db/essai";

import { lireConfiguration } from "../../src/configuration.ts";
import { servir } from "../../src/service.ts";

const REFUS = {
  user: `new.email like '%@compte-refuse.test'`,
  account: `(select email from "user" where id = new."userId") like '%@identifiant-refuse.test'`,
  session: `exists (select 1 from "session" where "userId" = new."userId")`,
};

const configuration = lireConfiguration(process.env);
const { base } = await ouvrirBaseEmbarqueeMigree();

if (process.env.ESSAI_BASE_DEFAILLANTE === "1") {
  for (const [table, condition] of Object.entries(REFUS)) {
    await base.db.execute(
      `create function essai_refus_${table}() returns trigger language plpgsql as $$
      begin if ${condition} then raise exception 'écriture refusée'; end if; return new; end; $$`,
    );
    await base.db.execute(
      `create trigger essai_refus_${table} before insert on "${table}" for each row
      execute function essai_refus_${table}()`,
    );
  }
}

await servir({ configuration, base, processus: process });

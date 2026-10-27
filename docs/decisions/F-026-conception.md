# Conception F-026 — Courriels : vérification d'adresse et réinitialisation du mot de passe

Date : 2026-10-27
Spec : `specs/F-026.md`, revalidée par le dev en `c1f59b5` (R1 à R7, D1 acceptée)
ADR : ADR-0022 (récupération et vérification écrites par le serveur), ADR-0023 (module d'envoi et transport SMTP), toutes deux proposées ; amendements F-026 proposés d'ADR-0004, ADR-0006 et ADR-0011
Veille : `MEMORY/VEILLE.md`, section F-026 du 2026-10-27
Ordre de livraison constaté (H10) : F-009, F-010, F-011, F-012, F-014 et F-027 sont sur `main` (`597ed63`). Les cas qui s'appliquent sont donc : (a) `agent-frontend` livre F-026-AC35 à AC39 ; F-011 fusionnée, donc F-026-AC20 applique le refus à la route d'acceptation et livre son test ; (d) F-026-AC40 branche l'avis sur le changement de mot de passe de F-027 ; (e) le test de F-014-AC43 est livré ici ; F-012 livrée, donc F-026-AC6 prouve la fermeture des connexions contre la fabrique de F-012-AC36.
`ARCHITECTURE.md` n'est pas touché à ce stade : il décrit le code livré, et il sera aligné après le code (même règle que F-032).

## Approche

Les deux flux sont écrits par le code du serveur, sous `/api/v1/compte/`, à côté des routes de F-027 et sur le même patron (`gestion-du-compte.ts`). better-auth ne voit que son crochet d'inscription : la liste fermée de F-009-AC17 garde ses quatre couples (H1, ADR-0022).

- **Jetons.** Un jeton de courriel est tiré de `randomBytes(32)`, écrit en base64url (43 caractères). Seule son empreinte SHA-256 entre dans une table nouvelle de `packages/db` (`jeton_courriel`). La présentation suit cet ordre : forme d'abord (404 sans base), puis recherche par empreinte, puis comparaison `timingSafeEqual`, puis consommation conditionnelle dans la transaction de l'effet. Un seul jeton en attente par compte et par usage : créer un jeton efface ceux qui n'ont pas été consommés.
- **Envoi.** Un seul module, `apps/server/src/envoi.ts`, importe `nodemailer` (ADR-0023). Il reçoit un _transport_ (interface du projet) en paramètre de l'assemblage. Le point d'entrée de production lui passe le transport SMTP, les tests et les entrées d'essai le transport en mémoire. Le module tient une file bornée (100), fait une seule tentative bornée à 10 secondes, compose le texte brut lui-même, valide les adresses et journalise l'échec sans donnée. Il n'expose aucun type de `nodemailer`.
- **Non-énumération.** `oubli` répond 204 avant toute lecture en base. Le plafond par courriel (empreinte SHA-256 du courriel en minuscules) est tenu en mémoire et ne change pas la réponse. Le reste du travail (recherche du compte, jeton, courriel) est une _préparation_ remise au module d'envoi, exécutée hors du traitement de la requête, dans le même délai borné que l'envoi.
- **Effets en base.**
  - La réinitialisation passe par `suppression.dansUneTransaction` (F-009-AC33, H13). Cette transaction consomme le jeton, écrit l'empreinte (`ecrireEmpreinte` de F-027), supprime toutes les sessions du compte, efface les autres jetons de réinitialisation en attente et marque l'adresse vérifiée. Les abonnés (synchronisation de F-012) sont prévenus après la validation.
  - La vérification est une transaction de `packages/db` qui marque l'adresse vérifiée et consomme le jeton.
- **Inscription.** Le crochet `emailVerification.sendOnSignUp` + `sendVerificationEmail` ne fait que noter l'identifiant du compte dans l'appel en cours (`Appel` d'`authentification.ts`). Il n'écrit rien en base et ne touche pas au transport. `comptes.ts`, une fois la réponse native 200 rendue, remet la demande de vérification au module d'envoi : l'inscription est alors validée en base, la réponse n'attend rien, et un échec d'envoi ne la change pas.
- **Ce que la vérification change.** La route d'acceptation d'une invitation (`espaces.ts`) refuse en 403 `courriel-non-verifie` après le contrôle du corps et avant la forme du jeton. Aucune autre route ne lit `emailVerified`.
- **Pile de développement.** Le capteur Mailpit est déclaré dans le fichier Compose sous le profil `courriel`, ports sur `127.0.0.1`, sans volume. Le service `serveur` de Compose est toujours en production (F-008-AC14) et ne peut pas parler au capteur sans TLS : la retouche R8 tranche comment le capteur est atteint. Ce bloc ne se livre pas avant le 2026-10-29 (`minimumReleaseAge`, H3).
- **Client.** Le client a trois formes d'adresse nouvelles et trois écrans. Le traitement du jeton dans le fragment de F-014-AC21 est extrait pour servir aux deux jetons. Un client `compte/client-courriels.ts` suit la forme de `client-gestion-du-compte.ts`. La zone de compte reçoit l'avis « Adresse non confirmée ».

## Décisions par critère

- **AC1, AC2, AC4 :**
  - Ordre de `oubli` : origine (403) → plafond par adresse (429) → corps strict (400) → plafond par courriel (en mémoire, invisible) → réponse 204 → `envoi.remettre({ type: "reinitialisation", preparer })`.
  - `preparer` cherche le compte en minuscules, remplace le jeton et rend `{ destinataire, jeton }`, ou `undefined` si le compte n'existe pas : rien n'est envoyé.
  - Le test d'AC2 suspend la lecture par la `defaillance` d'essai de la base, puis par un transport qui ne répond jamais.
- **AC3, AC13 :**
  - `remplacerJeton(base, { idCompte, usage, empreinte, creeLe, expireLe })` efface, dans une transaction de `packages/db`, les lignes non consommées de même compte et de même usage, puis insère la nouvelle. Les durées viennent de `packages/contrats` (30 min, 24 h) ; l'horloge est injectée.
  - Un « remplacé » devient donc un « inconnu » : même 404.
  - Un index unique partiel `(id_compte, usage) WHERE consomme_le IS NULL` le garantit en base. Deux préparations concurrentes pour un même compte : la seconde échoue, ce qui est consigné en `courriel-echec`.
- **AC5, AC6, AC10 :**
  - L'empreinte Argon2id (`empreinteDe`) est calculée hors de la transaction, comme dans F-027.
  - La consommation est un `UPDATE … SET consomme_le = $maintenant WHERE id = $id AND consomme_le IS NULL AND expire_le > $maintenant RETURNING id_compte`. Zéro ligne : la transaction est annulée et la route répond 404.
  - `revokeSessionsOnPasswordReset` et `requireEmailVerification` sont écrits à `false` dans `authentification.ts` ; un test lit la configuration construite.
  - Le test d'AC6 passe par `POST /api/auth/sign-in/email` réel, `GET /api/v1/moi` avec l'ancien cookie, et la fabrique de F-012 (connexion fermée dans la seconde). Il étend l'énumération de F-012-AC14.
- **AC7, AC40 :**
  - Un seul texte d'avis (`textes-des-courriels.ts`), remis par `recuperation-de-compte.ts` après 204 et par `gestion-du-compte.ts` après le 204 du changement de mot de passe.
  - Côté F-027, `changerLeMotDePasse` reçoit `envoi` en dépendance et remet `{ type: "avis", preparer }` après la réponse ; aucun autre changement de F-027.
- **AC8, AC12 :**
  - `jetons-de-courriel.ts` (serveur) : `tirerJeton()`, `empreinteDuJeton(jeton)`, `memeEmpreinte(a, b)` (`timingSafeEqual` sur les octets, longueurs égales vérifiées avant).
  - `FORME_DU_JETON_DE_COURRIEL` (`^[A-Za-z0-9_-]{43}$`) est publiée par `packages/contrats`.
  - Une source qui compare un jeton ou une empreinte par `===` est cherchée par un test de couture qui lit les sources de `recuperation-de-compte.ts`, `adresse-du-compte.ts` et `jetons-de-courriel.ts`.
- **AC9 :** le corps strict (`schemaCorpsReinitialisation`, bornes de F-009-AC4) est validé avant la forme du jeton ; le jeton n'est pas consommé. Le corps n'est jamais journalisé (`journal.evenementDeCompte` ne reçoit que type, requête, adresse, compte).
- **AC11 :** le test tire 1 000 jetons. La table n'a aucune colonne de jeton ni de courriel ; c'est vérifié par lecture du schéma de la migration (même façon que F-011-AC30).
- **AC14 :**
  - Table `jeton_courriel` :
    - `id uuid` ;
    - `id_compte` → `user.id`, `ON DELETE CASCADE` ;
    - `usage text CHECK (usage IN ('verification','reinitialisation'))` ;
    - `empreinte text UNIQUE CHECK (empreinte ~ '^[0-9a-f]{64}$')` ;
    - `cree_le`, `expire_le` (`CHECK (expire_le > cree_le)`), `consomme_le` (nul possible) ;
    - index sur `expire_le` ;
    - index unique partiel ci-dessus.
  - Migration `0003_jetons_de_courriel`, générée par `drizzle-kit`, descente manuelle `descentes/0003_jetons_de_courriel.sql`.
  - L'essai part de l'état laissé par F-009 (fixture existante).
- **AC15 :**
  - Crochet `emailVerification: { sendOnSignUp: true, sendVerificationEmail: async ({ user }) => noterInscrit(user.id) }`. `url` et `token` natifs sont ignorés.
  - L'identifiant passe par l'`Appel` d'AsyncLocalStorage et revient dans le `Traitement`. `comptes.ts` appelle `apresInscription(idCompte)` une fois la réponse 200 écrite.
  - `apresInscription` (de `adresse-du-compte.ts`) remet `{ type: "verification", preparer }` ; `preparer` remplace le jeton `verification` et rend le destinataire.
  - Ni écriture ni transport dans le crochet : better-auth l'attend sans rien attendre de lent, et aucune transaction n'est ouverte en même temps (PGlite n'en admet qu'une).
- **AC16 :** route publique : origine → plafond partagé avec `reinitialisation` → corps strict → forme → transaction `verifierAdresse` (consommation conditionnelle + `emailVerified = true`).
- **AC17, AC18 :** routes protégées dans `adresse-du-compte.ts`, ordre de F-027 : session → origine (POST) → plafond par compte (3 par 60 min, 429 `Retry-After` 1 à 3 600) → corps (`{}` strict) → effet. `GET /api/v1/compte/courriel` répond `{ verifie }` (schéma strict). `GET /api/v1/moi` n'est pas touché.
- **AC19, AC20 :**
  - `adresseVerifiee(base, idCompte)` (`adresse-du-compte.ts`, sur une lecture de `packages/db`) est la seule fonction du serveur qui lit `emailVerified`.
  - Dans `accepterUneInvitation`, elle est appelée après `corpsSelon(schemaCorpsAcceptation)` et avant `FORME_DU_JETON.test`. La requête refusée a déjà compté dans le plafond.
  - Le test parcourt les routes de F-009 et de F-011 avec un compte non vérifié.
- **AC21 à AC23 :**
  - Compteurs `creerCompteurs(horloge)` existants (fenêtre fixe, 100 000 clés, la plus ancienne oubliée).
  - Clés :
    - `oubli|${reseauDe(adresse)}` (5 par 60 s) ;
    - `jeton|${reseauDe(adresse)}` (10 par 60 s, partagé par `reinitialisation` et `verification`) ;
    - `courriel|${sha256(courriel en minuscules)}` (3 par 60 min) ;
    - `envoi|${idCompte}` (3 par 60 min).
  - `reseauDe` garde la règle de F-009 (IPv6 réduite à son /64).
- **AC24 :** `origineAdmise` d'`origine.ts` (F-011), réutilisé tel quel ; aucun en-tête `Access-Control-Allow-*`.
- **AC25 :**
  - `envoi.remettre` rend aussitôt. Une tâche porte `preparer` puis `transport.envoyer`, sous une course avec une minuterie de 10 s ; `connectionTimeout`, `greetingTimeout` et `socketTimeout` de `nodemailer` sont bornés en dessous.
  - Au-delà de 100 tâches en cours, la tâche est écartée (`courriel-ecarte`).
  - Tout rejet est intercepté et consigné en `courriel-echec` avec `{ type, code }`. `code` vaut, dans une liste fermée : `delai`, `preparation`, `transport`, `adresse-refusee`.
  - À l'arrêt, `service.ts` attend `Promise.all([ecoute.arreter(), envoi.terminer(DELAI_ARRET_MS)])`, puis ferme la base. Une tâche abandonnée qui rejette après la fermeture reste interceptée.
- **AC26 :**
  - Message `{ from, to, subject, text, messageId, date, headers: {} }` en `text/plain; charset=utf-8`, `xMailer: false`, sans `html` ni `attachments`.
  - Destinataire, expéditeur et objet sont refusés s'ils contiennent `\r`, `\n`, `,`, `;`, `"`, `(`, `<` ou plus d'un `@`.
  - Le test lit le MIME brut du transport en mémoire et compare ses en-têtes à la liste fermée : `From`, `To`, `Subject`, `Message-ID`, `Date`, `MIME-Version`, `Content-Type`, `Content-Transfer-Encoding`. La liste exacte est à constater sur 10.1.7 (point ouvert 2).
- **AC27 :**
  - `assembler({ …, transport })`, `servir({ …, transport })`. `main.ts` est le seul appelant de `transportSmtp` ; les deux entrées d'essai et la fabrique passent `transportEnMemoire()`.
  - Preuves :
    - un test de couture lit les sources (seul `main.ts` nomme `transportSmtp`, aucun fichier de `test/` ne le nomme) ;
    - `processus.test.ts` lance le vrai `main.ts` avec `SMTP_HOTE=127.0.0.1` et le port d'un écouteur TCP du test, et constate zéro connexion ;
    - la règle `nodemailer-confine-au-module-d-envoi` interdit tout autre import.
  - Aucune variable ne choisit le transport.
- **AC28 :** `lienDuCourriel(urlPublique, usage, jeton)` dans `envoi.ts`, construit sur `configuration.urlPublique` seule, jamais sur la requête. Le test forge `Host`, `X-Forwarded-Host`, `X-Forwarded-Proto` et une origine admise autre.
- **AC29 :**
  - `configuration.ts` lit `SMTP_HOTE`, `SMTP_PORT`, `SMTP_SECURITE`, `SMTP_UTILISATEUR`, `SMTP_MOT_DE_PASSE`, `COURRIEL_EXPEDITEUR` et `SMTP_CAPTEUR_DEV`, dans l'objet `configuration.courriel`, par le seul `zod` (règle `serveur-verification-de-configuration-confinee` inchangée).
  - Les raisons nouvelles s'ajoutent à la fin de `RAISONS` (priorité inchangée pour les anciennes) ; la sortie à deux lignes de l'entrée de vérification (ADR-0017) ne change pas.
  - `optionsSmtp(courriel)`, fonction pure d'`envoi.ts`, rend les options :
    - `tls` donne `secure: true` ; `starttls` donne `secure: false, requireTLS: true` ; `aucune` donne `secure: false, ignoreTLS: true` ;
    - jamais `tls.rejectUnauthorized`, ni `logger`, ni `debug`, ni `pool`.
  - Un test énumère les cas de refus et lit les options. Aucune connexion n'est ouverte au démarrage (le transport SMTP est créé sans `verify()`).
- **AC30 :**
  - `ROUTES_PUBLIQUES` (`packages/contrats/src/espaces.ts`) prend les trois routes publiques, importées de `courriels.ts`.
  - Le test de F-011-AC8 (`droits.test.ts`) lit déjà la liste. Le test d'AC30 énumère les routes enregistrées et constate que celles qui répondent sans session sont exactement la liste.
- **AC31 :**
  - Événements ajoutés à la liste fermée de `journal.ts` (noms fixés par `agent-backend`, sauf `courriel-echec`, nommé par la spec) : réinitialisation demandée, appliquée et refusée ; adresse vérifiée ; courriel envoyé et écarté ; `courriel-echec`.
  - Les plafonds reprennent l'événement de débit existant.
  - Le test de balayage passe par `essai/main-base-embarquee.ts` (vraie sortie du processus), avec un transport en mémoire rendu défaillant par l'entrée d'essai.
- **AC32 :**
  - Nouveau `packages/contrats/src/courriels.ts` : `CHEMINS_DES_COURRIELS` (5), `ROUTES_DES_COURRIELS`, `ROUTES_PUBLIQUES_DES_COURRIELS` (3) ;
  - schémas stricts `schemaCorpsOubli`, `schemaCorpsReinitialisation`, `schemaCorpsVerification`, `schemaCorpsEnvoi`, `schemaAdresseDuCompte` ;
  - `FORME_DU_JETON_DE_COURRIEL`, `DUREE_REINITIALISATION_MS`, `DUREE_VERIFICATION_MS`.
  - `jeton-invalide` et `courriel-non-verifie` sont ajoutés à la fin de `CODES_ERREUR`. `origine-refusee` existe déjà (F-011).
- **AC33 :** le test de couture (nouveau `couture-courriels.test.ts`) :
  - énumère les quatre routes d'authentification, inscription comprise, avec le crochet monté ;
  - constate le 404 de `/api/auth/request-password-reset`, `/api/auth/reset-password`, `/api/auth/send-verification-email` et `/api/auth/verify-email` ;
  - lit la configuration construite (`sendResetPassword` absent, `revokeSessionsOnPasswordReset` et `requireEmailVerification` à faux) ;
  - énumère les écrivains du mot de passe (`ecrireEmpreinte`), de `emailVerified` et de `session`, et étend l'énumération de F-009-AC33 ;
  - vérifie que tout point qui charge la configuration fournit les variables d'AC29.
- **AC34 :** voir R8 et l'annexe ; preuve statique dans `infra/tests/`, fumée dans un script à part (`infra/fumee-courriel.sh`), pour laisser intacts les dix-sept constats de F-031 et leurs règles.
- **AC35 à AC39 :** voir le bloc 11.

## Plan par blocs (un commit par bloc)

| #   | Agent          | Fichiers                                                                                                                                                                                                                                                                                                                                                                                                                          | AC                                                                                                   |
| --- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 0   | dev            | `apps/server/package.json` (`nodemailer` 10.1.7), `pnpm-lock.yaml`, `.dependency-cruiser.cjs`, `apps/server/.env.example` (selon R8) — annexe                                                                                                                                                                                                                                                                                     | H2, AC27 (contrat), AC34 (exemple)                                                                   |
| 1   | agent-bdd      | `packages/db/src/schema.ts`, `migrations/0003_jetons_de_courriel.sql` et `meta/`, `descentes/0003_jetons_de_courriel.sql`, `src/courriels.ts` (`compteParCourriel`, `remplacerJeton`, `lireJeton`, `consommerJeton`, `effacerJetonsEnAttente`, `marquerAdresseVerifiee`, `adresseVerifieeDe`, `verifierAdresse`), `src/index.ts`, tests de migration et de requêtes                                                               | AC14, AC3 et AC13 (côté base), AC10 (écriture conditionnelle), AC11 (aucune colonne de jeton)        |
| 2   | agent-backend  | `packages/contrats/src/courriels.ts`, `erreurs.ts` (2 codes ajoutés), `index.ts`, tests de contrats ; `apps/server/src/enveloppe.ts` (statut et message des 2 codes)                                                                                                                                                                                                                                                              | AC32, AC12 (forme), AC8 (code)                                                                       |
| 3   | agent-frontend | `apps/web/src/compte/messages-erreur.ts` (2 textes d'AC39) et son test                                                                                                                                                                                                                                                                                                                                                            | AC39 (messages) — **juste après le bloc 2** : le test strict de F-010-AC16 est rouge entre les deux  |
| 4   | agent-backend  | `apps/server/src/configuration.ts` (variables, raisons), `test/configuration.test.ts`, `test/verifier-configuration.test.ts`, tout point d'essai qui charge la configuration (`test/aides.ts` `ENV_DES_COMPTES_D_ESSAI`, `test/fabrique.ts`, `test/essai/*`, environnement des tests de processus)                                                                                                                                | AC29 (lecture, refus), AC33 (variables fournies)                                                     |
| 5   | agent-backend  | `apps/server/src/envoi.ts`, `textes-des-courriels.ts`, `jetons-de-courriel.ts`, `journal.ts` (événements), `application.ts` (`envoi` en dépendance), `assemblage.ts` (`transport`), `service.ts` (arrêt), `main.ts` (`transportSmtp`), `test/fabrique.ts` (transport en mémoire, lecteur `courriels()`), `test/aides.ts`, `test/essai/*`, tests du module et de couture des appelants d'`assembler`, `servir`, `creerApplication` | AC25, AC26, AC27, AC28 (construction du lien), AC29 (options), AC11, AC12 (empreinte et comparaison) |
| 6   | agent-backend  | `apps/server/src/recuperation-de-compte.ts` (3 routes publiques), `application.ts` (montage), `packages/contrats/src/espaces.ts` (`ROUTES_PUBLIQUES`), tests ; réécriture des tests d'état de R9 (contrats `ROUTES_PUBLIQUES` vide, filtre de F-027-AC20)                                                                                                                                                                         | AC1 à AC10, AC13, AC16, AC21 à AC24, AC28, AC30, AC31 (partie récupération)                          |
| 7   | agent-backend  | `apps/server/src/authentification.ts` (crochet, options à faux), `comptes.ts` (`apresInscription`), `adresse-du-compte.ts` (2 routes protégées, `adresseVerifiee`, `apresInscription`), `application.ts`, `test/couture-courriels.test.ts`, balayage de la sortie du processus                                                                                                                                                    | AC15, AC17, AC18, AC22 (par compte), AC31, AC33                                                      |
| 8   | agent-backend  | `apps/server/src/espaces.ts` (refus d'acceptation), `test/fabrique.ts` et `test/aides-espaces.ts` (`ajouterMembre` sur un invité vérifié par le vrai lien), tests d'acceptation de F-011 passés à des comptes vérifiés (R9), inversion du test F-011-AC35 de `couture-espaces.test.ts`                                                                                                                                            | AC19, AC20                                                                                           |
| 9   | agent-backend  | `apps/server/src/gestion-du-compte.ts` (avis après changement), remplacement du test F-027-AC8 de `couture-gestion-du-compte.test.ts` (R9)                                                                                                                                                                                                                                                                                        | AC40, AC7 (voie de F-027)                                                                            |
| 10  | agent-frontend | `apps/web/src/navigation/route.ts` (formes `#/mot-de-passe-oublie`, `#/reinitialisation[/<jeton>]`, `#/verification[/<jeton>]`), extraction du traitement du jeton de F-014-AC21 de `interface/navigation-espaces.ts` vers `navigation/jeton-du-fragment.ts` (tests de F-014-AC21 inchangés)                                                                                                                                      | AC36, AC39 (couture des formes)                                                                      |
| 11  | agent-frontend | `apps/web/src/compte/client-courriels.ts`, `interface/EcranMotDePasseOublie.tsx`, `EcranDeReinitialisation.tsx`, `EcranDeVerification.tsx`, `messages-courriels.ts`, `EcranDeCompte.tsx` (lien), `ZoneDeCompte.tsx` (AC38), `Application.tsx`, test de F-014-AC43 (et `EcranDInvitation.tsx` si l'écran ne tient pas déjà ce critère)                                                                                             | AC35, AC37, AC38, AC39, F-014-AC43                                                                   |
| 12  | agent-devops   | **pas avant le 2026-10-29, après R8** : `infra/docker-compose.yml` (service `mailpit` sous le profil `courriel` ; environnement du `serveur` selon R8), `infra/tests/compose.test.ts` et `regles/compose.ts`, `infra/fumee-courriel.sh` et ses règles statiques                                                                                                                                                                   | AC34                                                                                                 |
| 13  | dev            | fumée `infra/fumee-courriel.sh` sur son clone (H15) ; relevé dans `MEMORY/features/F-026.md`                                                                                                                                                                                                                                                                                                                                      | AC34 (fumée)                                                                                         |

Après le code, `agent-architecte-conception` aligne `ARCHITECTURE.md` (modules `envoi`, `recuperation-de-compte`, `adresse-du-compte`, flux de courriel, menaces) sur le diff livré.

Rouges attendus entre deux blocs : seulement le test strict de F-010-AC16, entre 2 et 3. Les blocs 4 et 5 changent des signatures (`lireConfiguration`, `assembler`, `servir`, `creerApplication`) : chacun met à jour tous ses appelants dans le même commit, et un test de couture les énumère (piège du gate qui ne voit que le diff).

## Fichiers

- Nouveaux :
  - `apps/server/src/` : `envoi.ts`, `textes-des-courriels.ts`, `jetons-de-courriel.ts`, `recuperation-de-compte.ts`, `adresse-du-compte.ts` ;
  - `packages/contrats/src/courriels.ts` ;
  - `packages/db/src/courriels.ts`, migration et descente `0003` ;
  - `apps/web/src/compte/client-courriels.ts`, `navigation/jeton-du-fragment.ts`, trois écrans, `interface/messages-courriels.ts` ;
  - `infra/fumee-courriel.sh`.
- Modifiés :
  - `apps/server/src/` : `authentification.ts`, `comptes.ts`, `espaces.ts`, `gestion-du-compte.ts`, `application.ts`, `assemblage.ts`, `service.ts`, `main.ts`, `configuration.ts`, `journal.ts`, `enveloppe.ts` ;
  - `packages/contrats/src/` : `erreurs.ts`, `espaces.ts`, `index.ts` ;
  - `packages/db/src/` : `schema.ts`, `index.ts` ;
  - `apps/web/src/` : `navigation/route.ts`, `interface/navigation-espaces.ts`, `interface/EcranDeCompte.tsx`, `interface/ZoneDeCompte.tsx`, `interface/Application.tsx`, `compte/messages-erreur.ts` ;
  - `infra/docker-compose.yml`.
- Protégés ou partagés (dev) : `.dependency-cruiser.cjs`, `apps/server/package.json`, `pnpm-lock.yaml`, `apps/server/.env.example` (agents interdits de `.env*`).
- Tests existants modifiés, et pourquoi (R9) :
  - `packages/contrats/test/espaces.test.ts:45` (`ROUTES_PUBLIQUES` vide) ;
  - `apps/server/test/couture-gestion-du-compte.test.ts:245` : le filtre de préfixe `/api/v1/compte` devient « aucune route de `ROUTES_DU_COMPTE` n'est publique » ;
  - `apps/server/test/couture-gestion-du-compte.test.ts:254` : le test d'absence de F-027-AC8 est remplacé par celui d'AC40 ;
  - `apps/server/test/couture-espaces.test.ts:402` : le cas (b) de F-011-AC35 est inversé ;
  - tests d'acceptation de F-011 (`invitations.test.ts`, `aides-espaces.ts`, `fabrique.ts` `ajouterMembre`) : comptes vérifiés ;
  - tests de configuration et environnements d'essai : variables d'AC29 ajoutées.

## Ce qui est prouvé, et où

- Base embarquée, horloge injectée, transport en mémoire pour tout `pnpm test` (H14). L'« en même temps » d'AC10 n'est prouvé que par l'écriture conditionnelle et un test séquentiel (D-002).
- TLS exigé et certificat vérifié : par lecture des options d'`optionsSmtp` seulement ; l'envoi réel n'est exercé que par la fumée contre le capteur, sans TLS.
- Historique de l'onglet (AC36) : en bout de bout seulement (D-003) ; les écrans sous DOM simulé.
- AC27 « aucun test n'ouvre de connexion SMTP » : couture des sources + écouteur sentinelle dans `processus.test.ts` + règle de dépendances. Il n'y a pas de garde réseau globale de Vitest (`vitest.config.*` protégé) ; c'est une limite à signaler.

## Retouches de spec à proposer au dev (spec non modifiée)

- **R8 — majeure : F-026-AC34 et D1 contredisent F-008-AC14 et F-031 dans le code livré.**
  - **Constat.** Le service `serveur` de `infra/docker-compose.yml` impose `NODE_ENV: production` par son `environment` (F-008-AC14, test `compose.test.ts:331`) et charge `../apps/server/.env`. `pnpm -w pile preparer` crée ce fichier depuis `apps/server/.env.example` (F-031-AC4). Si l'exemple porte `SMTP_CAPTEUR_DEV=vrai` et `SMTP_SECURITE=aucune`, comme AC34 l'exige, AC29 refuse le serveur de la pile : `pile demarrer` s'arrête au diagnostic, et la fumée de F-031 (constat 11) échoue.
  - D1 demande aussi que « le profil Compose de développement fixe `vrai` pour le serveur qu'il lance ». Or un profil ne change pas l'environnement d'un service déjà déclaré, et le seul serveur de Compose est en production, ce qui interdit `vrai`.
  - **Option A, recommandée** (la plus proche de la spec) :
    - L'exemple garde les valeurs du capteur, conformément à AC34 : `SMTP_CAPTEUR_DEV=vrai`, `SMTP_SECURITE=aucune`, `SMTP_HOTE=localhost`, `SMTP_PORT=1025`. Elles servent au serveur en mode hôte (`pnpm --filter @notionlike/server demarrer`, mode de développement), qui atteint Mailpit publié sur `127.0.0.1:1025`.
    - L'`environment` du service `serveur` de Compose impose `SMTP_CAPTEUR_DEV: "faux"`, `SMTP_SECURITE: starttls`, `SMTP_HOTE: relais.exemple.invalid` et `SMTP_PORT: "587"`, comme il impose déjà `NODE_ENV`. Le serveur de la pile démarre, et ses envois échouent dans le journal.
    - Le profil `courriel` ne déclare que Mailpit, et aucun fichier Compose ne pose `vrai`.
    - Retouche : dans D1 et AC34, remplacer « le profil fixe `vrai` pour le serveur qu'il lance » par « le serveur en mode hôte lit `vrai` du fichier d'exemple ; le service `serveur` de Compose impose `faux` et un relais factice chiffré ». La fumée lance base, migration et Mailpit sous Compose (projet distinct), et le serveur en mode hôte.
    - Prix : sous Compose, aucun relais réel n'est configurable sans retoucher le fichier Compose. C'est acceptable, puisqu'aucune feature ne couvre le déploiement.
  - **Option B :** l'exemple porte des valeurs valides en production (`faux`, `starttls`, relais factice) et le capteur n'est atteint que par des variables préfixées sur la ligne de commande (l'environnement l'emporte sur `--env-file`). C'est une retouche d'AC34 plus forte (l'exemple ne désigne plus le capteur).
  - **Option C :** un second service `serveur-courriel` en mode de développement sous le profil. Cela contredit ADR-0006 (« sous Compose, le serveur est toujours en mode de production ») et fait tourner deux serveurs Hocuspocus sur une même base, sur deux ports. Écartée.
- **R9 — tests d'état à réécrire, à autoriser explicitement.**
  - AC40 dit que le test de couture de F-027-AC20 « reste vert sans autre changement ». Or sa dernière assertion (`ROUTES_PUBLIQUES` filtrée sur le préfixe `/api/v1/compte` vaut `[]`) échoue par construction, puisque les trois routes publiques de F-026 sont sous `/api/v1/compte/`. Retouche : permettre de la remplacer par « aucune des routes de `ROUTES_DU_COMPTE` n'est publique », qui garde l'intention de F-027-AC14.
  - Même autorisation, par ailleurs implicite dans H10, pour :
    - le test d'absence de F-027-AC8 ;
    - le cas (b) de F-011-AC35 ;
    - le test `ROUTES_PUBLIQUES` vide des contrats ;
    - le passage à des comptes vérifiés des aides d'acceptation (`ajouterMembre`), qui servent aussi aux tests de F-012, F-014 et F-027, au-delà des seuls tests d'acceptation de F-011 nommés par AC20.

## Menaces propres à F-026

| Abus                                                                   | Parade                                                                                                                                               |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Énumération des comptes par `oubli` (statut, en-têtes, durée, plafond) | 204 avant toute lecture (AC2) ; plafond par courriel invisible (AC22) ; test champ à champ (AC1)                                                     |
| Lien empoisonné par `Host` / `X-Forwarded-*` forgés                    | lien bâti sur `URL_PUBLIQUE` seule (AC28)                                                                                                            |
| Vol du jeton (base, journal, `Referer`, historique)                    | empreinte seule en base, jamais journalisé, fragment retiré de l'adresse dès la lecture, 30 min, usage unique (AC11, AC31, AC36)                     |
| Rejeu, concurrence                                                     | consommation conditionnelle dans la transaction de l'effet (AC10)                                                                                    |
| Jeton deviné                                                           | 256 bits ; plafond de 10 essais par minute et par réseau (AC21) ; forme vérifiée avant base                                                          |
| Injection d'en-tête ou de contenu dans le courriel                     | texte brut fixe, aucune valeur d'utilisateur, adresses validées, en-têtes fermés (AC26)                                                              |
| Bombardement de courriels d'une victime                                | 3 par heure par courriel et par compte (AC22) ; limite assumée H9                                                                                    |
| Saturation de la file par des demandes sur des adresses inconnues      | plafond par réseau ; file bornée à 100, écart consigné ; limite : un attaquant réparti peut retarder des courriels légitimes (perte, puis redemande) |
| Session d'un voleur qui survit à la réinitialisation                   | toutes les sessions supprimées par la fonction de F-009, connexions WebSocket fermées (AC6)                                                          |
| Capteur exposé (il montre tous les liens)                              | profil hors défaut, `127.0.0.1` seulement, `vrai` refusé en production et hors boucle locale (AC29, AC34)                                            |
| Relais SMTP en clair ou certificat non vérifié                         | `requireTLS`/`secure`, aucune option `rejectUnauthorized` (AC29)                                                                                     |
| Logiciel qui suit les liens d'un courriel                              | aucune requête à l'ouverture, geste explicite (AC36)                                                                                                 |
| Compte non vérifié qui entre dans l'espace d'autrui                    | refus d'acceptation (AC19) ; membres antérieurs gardés (H6)                                                                                          |

## Points ouverts (à constater par `agent-backend` au début du bloc 5)

1. Types de `nodemailer` 10.1.7 : le paquet porte `"types": "./dist/cjs/nodemailer.d.ts"`, mais sa carte `exports` n'a pas de condition `types`. La résolution `nodenext` d'un import ESM peut ne pas trouver les déclarations. Si `pnpm typecheck` échoue, le repli est une dépendance de développement `@types/nodemailer` à faire valider par le dev (et à ajouter à la règle de confinement), pas une déclaration écrite à la main.
2. API de 10.1.7 à relire (H2) : `streamTransport` + `buffer: true` + `newline: "unix"` pour le transport en mémoire, noms exacts des délais, `xMailer`, et en-têtes posés d'office (liste fermée d'AC26).
3. Mailpit 1.32.0 : chemins `GET`/`DELETE /api/v1/messages` et lecture d'un message, à relire par `agent-devops` au bloc 12.
4. `pnpm-lock.yaml` régénéré par le dev au bloc 0 (`minimumReleaseAge` : 10.1.7 publiée le 2026-10-18, admissible).

## Annexe : fichiers protégés ou réservés au dev

### `.dependency-cruiser.cjs` (vérifié par `git apply --check` sur `c1f59b5`, chargé par `node`)

```diff
--- a/.dependency-cruiser.cjs
+++ b/.dependency-cruiser.cjs
@@ -54,7 +54,7 @@
       name: "serveur-liste-blanche",
       severity: "error",
       comment:
-        "ADR-0004, F-009, F-012 : depuis apps/server/src, seuls apps/server/src, l'entrée publique de db et de contrats, express, helmet, pino, zod, better-auth, les paquets @better-auth/*, @hocuspocus/server, ws (et ses types), y-protocols, yjs, lib0 et les modules intégrés de Node sont importables ; ni @notionlike/document (F-012-AC29), ni @hocuspocus/provider, ni la fabrique d'essai (F-012-AC36).",
+        "ADR-0004, F-009, F-012 : depuis apps/server/src, seuls apps/server/src, l'entrée publique de db et de contrats, express, helmet, pino, zod, better-auth, les paquets @better-auth/*, @hocuspocus/server, ws (et ses types), y-protocols, yjs, lib0, nodemailer (F-026, confiné par nodemailer-confine-au-module-d-envoi) et les modules intégrés de Node sont importables ; ni @notionlike/document (F-012-AC29), ni @hocuspocus/provider, ni la fabrique d'essai (F-012-AC36).",
       from: { path: "^apps/server/src/" },
       to: {
         pathNot: [
@@ -62,6 +62,7 @@
           "^packages/(db|contrats)/src/index\\.ts$",
           "(^|/)node_modules/(express|helmet|pino|zod|better-auth|@better-auth/[^/]+)/",
           "(^|/)node_modules/(@hocuspocus/server|ws|@types/ws|y-protocols|yjs|lib0)/",
+          "(^|/)node_modules/nodemailer/",
         ],
         dependencyTypesNot: ["core"],
       },
@@ -75,6 +76,14 @@
       to: { pathNot: ["^apps/server/src/configuration\\.ts$", "(^|/)node_modules/zod/"] },
     },
     {
+      name: "nodemailer-confine-au-module-d-envoi",
+      severity: "error",
+      comment:
+        "F-026-AC27, ADR-0023 : la bibliothèque SMTP n'est importée que par apps/server/src/envoi.ts : ni par un autre fichier du serveur, ni par un test, ni par un paquet, ni par apps/web.",
+      from: { pathNot: "^apps/server/src/envoi\\.ts$" },
+      to: { path: ["(^|/)node_modules/nodemailer/", "^nodemailer(/|$)"] },
+    },
+    {
       name: "db-reserve-au-serveur",
       severity: "error",
       comment: "F-008-AC23 : seuls packages/db et apps/server importent packages/db.",
```

### `apps/server/package.json` (vérifié par `git apply --check`), puis `pnpm install` pour `pnpm-lock.yaml`

```diff
--- a/apps/server/package.json
+++ b/apps/server/package.json
@@ -21,6 +21,7 @@
     "express": "5.2.1",
     "helmet": "8.3.0",
     "lib0": "0.2.119",
+    "nodemailer": "10.1.7",
     "pino": "10.3.1",
     "ws": "8.22.0",
     "y-protocols": "1.0.7",
```

### `apps/server/.env.example` : lignes à ajouter à la fin (option A de R8 ; non lu par l'agent, texte à ajouter tel quel)

```dotenv
# F-026 : relais SMTP des courriels de service. Valeurs factices, qui désignent le capteur de courriels
# du poste (Mailpit, profil « courriel » d'infra/docker-compose.yml, publié sur 127.0.0.1:1025) ;
# lues par le serveur en mode hôte (pnpm --filter @notionlike/server demarrer). Sous Compose, le service
# serveur impose un relais factice chiffré : ses envois échouent dans le journal.
# SMTP_CAPTEUR_DEV=vrai coupe l'exigence de TLS, vers le capteur seulement ; refusé en production.
SMTP_CAPTEUR_DEV=vrai
SMTP_SECURITE=aucune
SMTP_HOTE=localhost
SMTP_PORT=1025
COURRIEL_EXPEDITEUR=ne-pas-repondre@exemple.invalid
# Identifiants d'un relais réel : tous deux présents ou tous deux absents (aucun pour le capteur).
# SMTP_UTILISATEUR=
# SMTP_MOT_DE_PASSE=
```

Option B à la place : `SMTP_CAPTEUR_DEV=faux`, `SMTP_SECURITE=starttls`, `SMTP_HOTE=relais.exemple.invalid`, `SMTP_PORT=587`, mêmes commentaires adaptés.

### `infra/docker-compose.yml` (périmètre `agent-devops`, bloc 12, pas avant le 2026-10-29 ; donné ici pour la revue de R8)

Service ajouté :

```yaml
mailpit:
  image: axllent/mailpit:v1.32.0@sha256:0790692be935ea4420d085694f7985b1f692ca6a8771ab0e0bd8ba75ac180498
  profiles: ["courriel"]
  ports:
    - "127.0.0.1:${PORT_PUBLIE_CAPTEUR_SMTP:-1025}:1025"
    - "127.0.0.1:${PORT_PUBLIE_CAPTEUR_LECTURE:-8025}:8025"
```

Sans volume, sans `depends_on` depuis le serveur, sans `restart`. Option A, lignes ajoutées à l'`environment` du service `serveur` :

```yaml
SMTP_CAPTEUR_DEV: "faux"
SMTP_SECURITE: starttls
SMTP_HOTE: relais.exemple.invalid
SMTP_PORT: "587"
```

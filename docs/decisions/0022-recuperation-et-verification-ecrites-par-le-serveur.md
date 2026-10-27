# ADR-0022 — Récupération du compte et vérification d'adresse : routes à nous, jetons par empreinte, liens dans le fragment

Statut : proposé
Date : 2026-10-27

## Contexte et problème

F-026 (`specs/F-026.md`) livre deux flux : la réinitialisation d'un mot de passe oublié et la vérification de l'adresse d'un compte. La vérification devient la condition pour accepter une invitation. Ces flux sont la cible classique d'une prise de contrôle de compte. La spec exige :

- un jeton à usage unique dont seule l'empreinte est en base ;
- une comparaison en temps constant ;
- une réponse émise avant toute lecture du compte et un plafond par courriel non observable ;
- un lien bâti sur `URL_PUBLIQUE` ;
- des sessions supprimées par la fonction de F-009 (abonnés prévenus) ;
- une adresse marquée vérifiée par la réinitialisation.

better-auth 1.7.7 offre des routes natives pour les deux flux. La veille du 2026-10-27 constate que `reset-password` ne pose pas `emailVerified` et que `revokeSessionsOnPasswordReset` supprime les sessions par `internalAdapter.deleteUserSessions`, sans la fonction de F-009. Fournir `sendVerificationEmail` active aussi `POST /send-verification-email` et `GET /verify-email`.

Ces choix sont difficiles à défaire. Des liens seront en circulation, avec leur forme d'adresse. Le schéma de la table des jetons sera migré. Les codes `jeton-invalide` et `courriel-non-verifie` entrent dans le contrat de l'enveloppe, qui ne change que par ajout. Enfin, F-026 crée les premières routes publiques sous `/api/v1/`.

## Options étudiées

1. **Ouvrir les routes natives de better-auth** dans la liste fermée de F-009-AC17.
   - Pour : moins de code.
   - Contre :
     - forme et stockage des jetons natifs hors de notre contrôle ;
     - pas de `emailVerified` à la réinitialisation ;
     - sessions supprimées hors de la fonction de F-009, donc connexions WebSocket non fermées ;
     - réponses hors de l'enveloppe de F-008 ;
     - comportement sur adresse inconnue non prouvé.

   Chaque écart demanderait un correctif autour de la route, comme F-009 en a déjà écrit quatre.

2. **Routes à nous sous `/api/v1/compte/`, table de jetons à nous** (retenue). better-auth ne garde que le crochet d'inscription, qui ne fait que noter le compte inscrit.
3. **Jetons sans état (signés, à durée)**, sans table.
   - Pour : pas de migration.
   - Contre : ni usage unique, ni remplacement du jeton précédent sans liste de révocation, ce qui revient à une table.

Pour la forme du lien : chemin (`/reinitialisation/<jeton>`), paramètre de requête ou fragment. Seul le fragment ne part ni dans la requête qui charge l'application, ni dans un `Referer`, ni dans un journal de serveur ou de mandataire.

## Décision

- **Routes** (`packages/contrats/src/courriels.ts`, enveloppe et codes de F-008) :
  - publiques, dans `apps/server/src/recuperation-de-compte.ts` : `POST /api/v1/compte/mot-de-passe/oubli`, `POST /api/v1/compte/mot-de-passe/reinitialisation`, `POST /api/v1/compte/courriel/verification` ;
  - protégées, dans `apps/server/src/adresse-du-compte.ts` : `POST /api/v1/compte/courriel/verification/envoi`, `GET /api/v1/compte/courriel`.

  `ROUTES_PUBLIQUES` (`packages/contrats/src/espaces.ts`) compte exactement les trois routes publiques. La liste fermée de better-auth garde ses quatre couples. Les routes natives de réinitialisation et de vérification restent en 404.

- **Ordre des contrôles** :
  - route publique : origine (`origineAdmise`, 403) → plafond par réseau (429) → corps strict (400) → forme du jeton (404 sans base) → base ;
  - route protégée : session → origine → plafond par compte → corps → effet.
- **Jeton de courriel** :
  - tirage : `randomBytes(32)` en base64url, 43 caractères, forme publiée par `packages/contrats` ;
  - stockage : empreinte SHA-256 hexadécimale seule ;
  - présentation : recherche par empreinte, puis `timingSafeEqual` ;
  - durées : 30 minutes (`reinitialisation`) et 24 heures (`verification`) ;
  - un seul jeton en attente par compte et par usage : la création efface les non consommés de même usage ;
  - consommation par un `UPDATE` conditionnel (`consomme_le IS NULL AND expire_le > maintenant`) dans la transaction de l'effet.

  Fonctions dans `apps/server/src/jetons-de-courriel.ts` (calcul) et `packages/db/src/courriels.ts` (requêtes).

- **Table `jeton_courriel`** (migration `0003_jetons_de_courriel`) :
  - colonnes : `id uuid`, `id_compte` → `user.id` en cascade, `usage` contraint aux deux valeurs, `empreinte` unique et contrainte à 64 caractères hexadécimaux, `cree_le`, `expire_le` (> `cree_le`), `consomme_le` ;
  - index sur `expire_le` (purge par F-025) ;
  - index unique partiel `(id_compte, usage) WHERE consomme_le IS NULL` ;
  - ni jeton ni courriel en colonne.
- **Effets** :
  - la réinitialisation est une seule transaction de `suppression.dansUneTransaction` (F-009-AC33) : consommation, `ecrireEmpreinte` (F-027), suppression de toutes les sessions, effacement des autres jetons de réinitialisation, `emailVerified = true`. Elle répond 204 sans session ni cookie ;
  - la vérification est une transaction de `packages/db` : consommation et `emailVerified = true`.

  Les écrivains de `emailVerified` sont `marquerAdresseVerifiee`, appelé par ces deux seules transactions. Son seul lecteur côté serveur est `adresseVerifiee` (`adresse-du-compte.ts`).

- **Non-énumération** : `oubli` répond 204 avant toute lecture en base. La recherche du compte et le jeton sont une préparation exécutée par le module d'envoi (ADR-0023). Le plafond par courriel est indexé par l'empreinte du courriel en minuscules et ne change pas la réponse.
- **Inscription** : crochet `emailVerification.sendOnSignUp` + `sendVerificationEmail`, qui note l'identifiant du compte dans l'appel en cours, sans base ni transport. `comptes.ts` remet la demande de vérification une fois la réponse native rendue. `emailAndPassword.sendResetPassword` est absent ; `revokeSessionsOnPasswordReset` et `requireEmailVerification` sont écrits à `false`.
- **Vérification exigée** : seulement par `POST /api/v1/invitations/acceptation`, en 403 `courriel-non-verifie`, après le corps et avant la forme du jeton d'invitation.
- **Liens** : `<URL_PUBLIQUE>/#/reinitialisation/<jeton>` et `<URL_PUBLIQUE>/#/verification/<jeton>`. Le client lit le jeton, remplace l'entrée d'historique par la forme sans jeton, le garde en mémoire et ne consomme qu'au geste explicite (traitement de F-014-AC21, extrait dans `apps/web/src/navigation/jeton-du-fragment.ts`).

## Conséquences

- Les formes d'adresse `#/reinitialisation/<jeton>` et `#/verification/<jeton>` et les cinq chemins sont un contrat : un lien envoyé reste valable jusqu'à 24 heures, et changer une forme casse les liens en circulation.
- Le serveur écrit dans les tables natives (`account.password`, `user.emailVerified`, `session`) hors de better-auth. Une montée de version qui change ces tables casse ces écritures ; le test de couture d'AC6 et AC33 (connexion native réelle) le détecte.
- La table garde les jetons consommés et expirés jusqu'à la purge de F-025. L'index sur `expire_le` la prépare.
- Deux préparations concurrentes pour un même compte : l'index unique partiel fait échouer la seconde, consignée en `courriel-echec`. La personne reçoit un seul courriel valable, ce qui est voulu.
- Un compte devenu membre avant F-026 le reste sans vérification (H6). L'inscription révèle toujours qu'un courriel est pris (F-009-AC3, hors périmètre).
- Les tests d'acceptation de F-011 et l'aide `ajouterMembre` de la fabrique emploient un invité vérifié par le vrai lien, lu sur le transport en mémoire.
- Ouvrir plus tard les routes natives de better-auth reste possible, mais ce serait une retouche de spec à revalider. L'inverse aurait coûté plus cher (H1).

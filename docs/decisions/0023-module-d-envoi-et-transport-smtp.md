# ADR-0023 — Courriels de service : un module d'envoi, `nodemailer` confiné, transport injecté, TLS exigé hors du capteur

Statut : proposé
Date : 2026-10-27

## Contexte et problème

F-026 est le premier envoi de courriel du projet. Il faut une bibliothèque SMTP (H2 : relais configuré par variables, aucun fournisseur tiers puisque `partage_externe_autorise: false`) et un capteur de courriels pour le poste (H3 : Mailpit). La spec impose plusieurs contraintes :

- l'envoi ne retient ni ne change une réponse HTTP ;
- une seule tentative, bornée à 10 secondes ;
- une file bornée à 100 ;
- aucun rejet non géré ;
- un arrêt dans le délai de F-008-AC7 ;
- un texte brut fixe, sans aucune valeur d'utilisateur, et des en-têtes fermés ;
- aucun test qui ouvre une connexion SMTP ;
- TLS exigé et certificat vérifié, sauf vers le capteur, sous un indicateur refusé en production.

Ces choix sont difficiles à défaire : une dépendance directe nouvelle, un paramètre nouveau de la fonction d'assemblage et de `servir` (tous les points d'entrée et la fabrique d'essai l'appellent), sept variables de configuration et un service de la pile Compose.

## Options étudiées

- **Bibliothèque** :
  - `nodemailer@10.1.7` (MIT-0, sans dépendance, aucun avis ouvert, veille du 2026-10-27) : retenue ;
  - un client SMTP écrit à la main sur `node:net`/`node:tls` : trop de surface (STARTTLS, AUTH, encodage) ;
  - une API HTTP de fournisseur : écartée par `partage_externe_autorise`.
- **Choix du transport** :
  - par variable de configuration : écarté, car une variable pourrait mettre la production en mémoire ;
  - par paramètre de l'assemblage : retenu.
- **Envoi** :
  - attendu dans la requête : écarté, car il change les durées et les réponses ;
  - file persistante avec nouveaux essais : hors périmètre ;
  - tâche en mémoire, bornée : retenu.
- **Capteur sans TLS** :
  - déduire l'absence de TLS de l'hôte : écarté (D1) ;
  - indicateur `SMTP_CAPTEUR_DEV` explicite, refusé en production et hors boucle locale : retenu.

## Décision

- **Module d'envoi** `apps/server/src/envoi.ts`, seul importateur de `nodemailer` (règle `nodemailer-confine-au-module-d-envoi` ; `nodemailer` ajouté à `serveur-liste-blanche`). Son interface n'expose aucun type de la bibliothèque :
  - `creerEnvoi({ transport, expediteur, urlPublique, journal, horloge })` rend `{ remettre(demande), terminer(delaiMs) }`. Une demande est `{ type: "verification" | "reinitialisation" | "avis", preparer }`, où `preparer()` rend `{ destinataire, jeton? }` ou `undefined` ;
  - `Transport` est une interface du projet : `envoyer(message)` rend une promesse ;
  - `transportSmtp(reglages)` enveloppe `createTransport(optionsSmtp(reglages))` ;
  - `transportEnMemoire()` enveloppe `streamTransport` avec `buffer: true` et retient le MIME brut, sans réseau ;
  - `optionsSmtp(reglages)` est pure et testée ;
  - `lienDuCourriel(urlPublique, usage, jeton)`.
- **Tâche** : `remettre` rend aussitôt.
  - Au-delà de 100 tâches en cours, la demande est écartée et l'écart consigné.
  - La tâche exécute `preparer` puis compose et envoie le message, le tout en course avec une minuterie de 10 secondes. Les délais de connexion, de salutation et de socket de `nodemailer` sont bornés en dessous.
  - Il n'y a pas de nouvel essai. Toute erreur est interceptée et consignée en `courriel-echec` avec `{ type, code }`, sans donnée.
  - `terminer(delaiMs)` attend les tâches en cours puis les abandonne.
- **Composition du message** : `text/plain; charset=utf-8`, objet et corps fixés dans `textes-des-courriels.ts`, sans `html` ni pièce jointe. `from` vaut `COURRIEL_EXPEDITEUR` et `to` le courriel enregistré du compte. `messageId` et `date` sont posés par le module, `xMailer: false`, aucun autre en-tête. Une adresse ou un objet qui contient un retour chariot, un saut de ligne, un guillemet, un commentaire ou plus d'une adresse est refusé avant le transport.
- **Options SMTP** :
  - `tls` donne `secure: true` ;
  - `starttls` donne `secure: false, requireTLS: true` ;
  - `aucune` (avec `SMTP_CAPTEUR_DEV=vrai` seulement) donne `ignoreTLS: true` ;
  - `auth` seulement si les deux identifiants sont présents ;
  - jamais `tls.rejectUnauthorized`, `logger`, `debug` ni `pool` ;
  - aucun `verify()` au démarrage : `GET /pret` ne dépend pas du relais.
- **Configuration** (`configuration.ts`, objet `courriel`) : `SMTP_HOTE`, `SMTP_PORT`, `SMTP_SECURITE`, `SMTP_UTILISATEUR` et `SMTP_MOT_DE_PASSE` (les deux ou aucun), `COURRIEL_EXPEDITEUR` (une adresse sans nom affiché), `SMTP_CAPTEUR_DEV` (`vrai`/`faux`, `faux` par défaut). Les refus de F-026-AC29 s'ajoutent à la fin de la liste des raisons. La sortie de l'entrée de vérification (ADR-0017) est inchangée.
- **Assemblage** :
  - `assembler({ …, transport })` crée l'envoi et le passe à l'application (`Dependances.envoi`) ;
  - `servir({ …, transport })` attend, à l'arrêt, `ecoute.arreter()` et `envoi.terminer(DELAI_ARRET_MS)` ensemble, puis ferme la base ;
  - `main.ts` est le seul appelant de `transportSmtp` ;
  - les entrées d'essai et la fabrique passent `transportEnMemoire()`.
- **Capteur** : Mailpit `v1.32.0` épinglé par empreinte, sous le profil Compose `courriel`, ports SMTP et de lecture publiés sur `127.0.0.1` seulement, sans volume. Il n'est jamais démarré par `docker compose up` sans profil, et n'entre dans aucune image. La façon dont un serveur l'atteint est fixée par la retouche R8 de `docs/decisions/F-026-conception.md`.

## Conséquences

- Toute montée de `nodemailer` relit les options (TLS exigé, délais, en-têtes posés d'office). Le test d'`optionsSmtp` et celui des en-têtes du MIME brut la gardent.
- Un courriel perdu (relais muet, file pleine, arrêt du serveur) est perdu : la personne le redemande. Seul le journal le dit (H9).
- Le transport réel n'est exercé par aucun test de `pnpm test`. Le TLS n'est prouvé que par la lecture des options ; l'envoi réel ne l'est que par la fumée contre le capteur, sans TLS (H14).
- Ajouter un courriel de service, par exemple pour un changement d'adresse, revient à ajouter un `type` et un texte. Aucune autre feature n'importe `nodemailer`.
- Les compteurs et la file sont en mémoire d'un seul processus, comme les compteurs de F-009 : plusieurs instances demanderaient un stockage partagé.
- Le relais réel, SPF, DKIM et DMARC relèvent du déploiement, qu'aucune feature ne couvre. Sans eux, un courriel réel risque d'être classé indésirable.

# Handoff — bascule du bot Motisma sur la base unifiée

Le site (session web) a généré un schéma unifié façon Neko et un dashboard admin
qui lit/écrit la base. **Le bot lit encore le `.env` + `pogo_profiles` + `levels`.**
Ce document liste ce que la session bot doit faire pour que la config éditée
depuis le dashboard prenne réellement effet.

## Tables (déjà créées, voir `server/src/db.js` → `UNIFIED_DDL`)

- **`guilds`** : config par serveur, **1 ligne** (id = `GUILD_ID`), pré-remplie
  depuis le `.env`. Colonnes = tous les réglages actuels du bot
  (`welcome_channel_id`, `levelup_channel_id`, `level_roles`,
  `team_role_mystic/valor/instinct`, `classement_role_id`,
  `classement_reminder_day/hour`, `presence_*`, `language_timeout_*`, etc.).
- **`users`** : 1 ligne par membre (`discord_id` + `guild_id` unique). Fusion de
  `pogo_profiles` (profil PoGo) + `levels` (xp chat). Champs : `level`, `xp`,
  `ign`, `pogo_team`, `pogo_xp`, `classement`, …

Les anciennes tables (`pogo_profiles`, `levels`) sont **intactes**.

## À faire côté bot

1. **Config** : remplacer la lecture de `src/config.js` (process.env) par une
   lecture de la ligne `guilds` (id = `GUILD_ID`) au démarrage + rafraîchissement
   (ou relecture à chaud). Mapping nom de colonne → champ `config.*` 1:1.
   - **`level_roles` a changé de format** : ce n'est plus `"10:roleId,20:roleId"`
     mais un **JSON** `[{"level":10,"name":"Dresseur Bronze"}, …]` (on stocke le
     **nom** du rôle, pas l'ID). Le bot doit : parser ce JSON, **créer le rôle
     s'il n'existe pas** (recherche par nom, sinon `guild.roles.create`), puis
     l'attribuer dès le palier atteint (et retirer les paliers inférieurs comme
     aujourd'hui). Ignorer les entrées sans `level` (>0) ou sans `name`.
2. **Membres** : faire lire/écrire au bot la table `users` au lieu de
   `pogo_profiles` + `levels` (xp chat → `users.xp`, profil PoGo → colonnes
   `pogo_*` / `ign` / `classement`).
3. **Migration finale** : `server/src/migrate-unified.js` a déjà copié l'existant
   (idempotent). Une fois le bot basculé, `pogo_profiles` + `levels` peuvent être
   abandonnées (garder un backup avant `DROP`).
4. **Sync rôle classement** : aujourd'hui le dashboard bascule `classement` en
   base ; le rôle Discord n'est pas resynchronisé. Après bascule, le bot doit
   réconcilier `classement_role_id` avec `users.classement`.

## Messages personnalisables (`bot_messages`)

Nouvelle table : 1 ligne par message (`guild_id`, `key`) avec `enabled`, `content`,
`embed_enabled`, `embed_title/description/color/image/thumbnail/footer`, `ephemeral`.
Clés actuelles (15, seedées verbatim depuis le texte en dur du bot) :
`welcome`, `levelup`, `classement_reminder`, `classement_onboarding`,
`classement_not_participant`, `classement_nothing_read`,
`classement_capture_refused`, `classement_join_ok`, `classement_join_closed`,
`language_fun`, `language_stern`, `verification_detection`,
`verification_tamper`, `verification_refused`, `verification_validated`.

**Pools** : `welcome`, `levelup`, `language_fun`, `language_stern` stockent
plusieurs lignes (séparées par `\n`) — le bot doit en tirer **une au hasard**
(comme aujourd'hui avec les tableaux `LINES` / templates). `levelup` n'a qu'une
ligne par défaut mais devient un pool éditable. Les autres sont des messages simples.

Variables par message (à substituer) : `{user}`, `{level}`, `{attack}`,
`{detail}`, `{target}`, `{namePart}`, `{teamPart}`, `{tamperReason}`, `{suffix}`.

NON inclus (volontairement) : embeds **dynamiques** (classements, jeux, RDV,
avatar, userinfo, niveau, sondage, logs de vérification) construits à la volée
depuis des données runtime, et micro-messages d'erreur d'interaction. Ils
restent codés dans le bot.

À faire côté bot : au lieu du texte codé en dur dans `src/features/welcome.js` et
`src/features/leveling.js`, lire la ligne `bot_messages` correspondante et
construire le message/embed depuis ses champs. Variables à substituer :
`{user}` (mention), `{level}`. Si `embed_enabled`, construire un `EmbedBuilder`
(couleur = `embed_color` hex). `ephemeral` ne s'applique qu'aux réponses
d'interaction, pas aux posts en salon (welcome/levelup l'ignorent).

## Logs granulaires (nouveau)

`guilds` a gagné des colonnes de logs (booléens) :
`logs_verification` (le SEUL déjà implémenté aujourd'hui — défaut TRUE),
`logs_joins`, `logs_leaves`, `logs_messages`, `logs_moderation`, `logs_roles`,
`logs_channels`, `logs_voice`, `logs_boosts`.
À faire côté bot : n'émettre le log de vérification que si `logs_verification`
est vrai, et implémenter les autres types quand le booléen correspondant l'est.
Les logs ne sont que des interrupteurs (pas de personnalisation d'embed).
(La colonne `log_embed_color` sur `guilds` est inutilisée.)

## Côté site (déjà fait, ne pas refaire)

- DDL : `server/src/db.js` (`UNIFIED_DDL`, appelé par `initSchema`).
- Seed/migration one-shot : `server/src/migrate-unified.js`
  (`docker compose exec api node src/migrate-unified.js`).
- API admin : `server/src/routes/admin.js` (toutes gardées par `requireAdmin`).
- Dashboard : `web/src/pages/Dashboard.jsx` + `web/src/components/dashboard/*`.

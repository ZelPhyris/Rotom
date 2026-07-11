import { basename, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ActivityType, Client, Collection, Events, GatewayIntentBits, Partials } from 'discord.js';
import { config } from './config.js';
import { collectCommandPaths } from './loadCommands.js';
import { initDb } from './db.js';
import { hydrateConfig } from './guildConfig.js';
import { registerVerification } from './features/verification.js';
import { registerTempVoice } from './features/tempVoice.js';
import { registerRdvControls } from './features/rdvControls.js';
import { registerHelpControls } from './features/helpControls.js';
import { registerLeveling } from './features/leveling.js';
import { registerForumHeart } from './features/forumHeart.js';
import { registerMoveControls } from './features/moveControls.js';
import { registerClassement } from './features/classement.js';
import { registerLanguageWatch } from './features/languageWatch.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const intents = [
  GatewayIntentBits.Guilds,
  // Privileged — required to count members per role. Enable it in the
  // Developer Portal (Bot > Privileged Gateway Intents).
  GatewayIntentBits.GuildMembers,
  // Non-privileged — lets the verification flow detect newcomers' posts.
  GatewayIntentBits.GuildMessages,
  // Non-privileged — moderators validate newcomers via ✅/❌ reactions.
  GatewayIntentBits.GuildMessageReactions,
  // Non-privileged — required for the "join to create" temp voice channels.
  GatewayIntentBits.GuildVoiceStates,
  // Non-privileged — lets participants DM the bot a screenshot to update stats.
  GatewayIntentBits.DirectMessages,
];

// Privileged — only declared when vision is configured, because declaring an
// intent that isn't enabled in the Developer Portal makes login fail.
// Enable "Message Content" in the portal at the same time you set GEMINI_API_KEY.
if (config.geminiApiKey) {
  intents.push(GatewayIntentBits.MessageContent);
}

const client = new Client({
  intents,
  // Needed to handle reactions on messages not in cache (e.g. after a restart).
  partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.User],
});

// --- Load commands ---
client.commands = new Collection();
const commandsDir = join(__dirname, 'commands');
for (const file of collectCommandPaths(commandsDir)) {
  const command = await import(pathToFileURL(file).href);
  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
  } else {
    console.warn(`[warn] ${basename(file)} is missing "data" or "execute" and was skipped.`);
  }
}

// Turn the configured emoji into a presence emoji object. Accepts a unicode
// emoji ("🏃") or a custom one written "name:id". Empty → no emoji.
function parseEmoji(raw) {
  if (!raw) return undefined;
  const custom = /^(\w+):(\d+)$/.exec(raw);
  if (custom) return { name: custom[1], id: custom[2] };
  return { name: raw };
}

// Map the configured verb to a discord.js ActivityType.
const ACTIVITY_TYPES = {
  playing: ActivityType.Playing,
  watching: ActivityType.Watching,
  listening: ActivityType.Listening,
  competing: ActivityType.Competing,
  custom: ActivityType.Custom,
};

// --- Events ---
client.once(Events.ClientReady, async (c) => {
  console.log(`Ready. Logged in as ${c.user.tag}.`);

  await initDb().catch((err) => console.error('[db] Initialization failed:', err));
  // Link to the dashboard: load config from the DB (falls back to .env), and
  // create any missing level reward roles. Re-runs periodically so dashboard
  // edits propagate without a restart.
  await hydrateConfig(c).catch((err) => console.error('[config] Hydration failed:', err));
  setInterval(() => {
    hydrateConfig(c).catch((err) => console.error('[config] Refresh failed:', err));
  }, 5 * 60 * 1000);

  // Presence uses the (possibly DB-overridden) config. Build up to two
  // activities: a custom status ("bubble") and a "Joue à …" activity. Discord
  // usually renders only the first for bots, so the custom status comes first.
  // For a custom status, Discord requires name === "Custom Status"; the visible
  // text lives in `state`.
  const activities = [];
  if (config.presenceText) {
    activities.push({
      name: 'Custom Status',
      state: config.presenceText,
      type: ActivityType.Custom,
      emoji: parseEmoji(config.presenceEmoji),
    });
  }
  if (config.presenceGame) {
    activities.push({
      name: config.presenceGame,
      type: ACTIVITY_TYPES[config.presenceGameType] ?? ActivityType.Playing,
    });
  }
  c.user.setPresence({ status: config.presenceStatus, activities });
});

// --- Features ---
registerVerification(client);
registerTempVoice(client);
registerRdvControls(client);
registerHelpControls(client);
registerLeveling(client);
registerForumHeart(client);
registerMoveControls(client);
registerClassement(client);
registerLanguageWatch(client);

client.on(Events.InteractionCreate, async (interaction) => {
  // Slash commands and message context-menu commands are both dispatched by name.
  if (!interaction.isChatInputCommand() && !interaction.isMessageContextMenuCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`Error while running /${interaction.commandName}:`, error);
    const reply = { content: 'Something went wrong while running this command.', ephemeral: true };
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(reply).catch(() => {});
    } else {
      await interaction.reply(reply).catch(() => {});
    }
  }
});

client.login(config.token);

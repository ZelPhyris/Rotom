import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Client, Collection, Events, GatewayIntentBits } from 'discord.js';
import { config } from './config.js';
import { registerMemberCount } from './features/memberCount.js';
import { registerVerification } from './features/verification.js';
import { registerTempVoice } from './features/tempVoice.js';
import { registerRdvControls } from './features/rdvControls.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    // Privileged — required to count members per role. Enable it in the
    // Developer Portal (Bot > Privileged Gateway Intents).
    GatewayIntentBits.GuildMembers,
    // Non-privileged — lets the verification flow detect newcomers' posts.
    GatewayIntentBits.GuildMessages,
    // Non-privileged — required for the "join to create" temp voice channels.
    GatewayIntentBits.GuildVoiceStates,
  ],
});

// --- Load commands ---
client.commands = new Collection();
const commandsDir = join(__dirname, 'commands');
for (const file of readdirSync(commandsDir).filter((f) => f.endsWith('.js'))) {
  const command = await import(pathToFileURL(join(commandsDir, file)).href);
  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
  } else {
    console.warn(`[warn] ${file} is missing "data" or "execute" and was skipped.`);
  }
}

// --- Events ---
client.once(Events.ClientReady, (c) => {
  console.log(`Ready. Logged in as ${c.user.tag}.`);
});

// --- Features ---
registerMemberCount(client);
registerVerification(client);
registerTempVoice(client);
registerRdvControls(client);

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

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

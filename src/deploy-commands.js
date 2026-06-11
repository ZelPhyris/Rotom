import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { REST, Routes } from 'discord.js';
import { config } from './config.js';
import { collectCommandPaths } from './loadCommands.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Collect the slash-command definitions from src/commands (recursively).
// A command that exports `global = true` is registered globally (so it also
// works in DMs); everything else is guild-scoped for instant updates.
const guildCommands = [];
const globalCommands = [];
const commandsDir = join(__dirname, 'commands');
for (const file of collectCommandPaths(commandsDir)) {
  const command = await import(pathToFileURL(file).href);
  if ('data' in command) {
    (command.global ? globalCommands : guildCommands).push(command.data.toJSON());
  }
}

const rest = new REST().setToken(config.token);

try {
  console.log(`Registering ${guildCommands.length} command(s) on guild ${config.guildId}...`);
  await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), {
    body: guildCommands,
  });

  console.log(`Registering ${globalCommands.length} global command(s) (DM-capable, ~1h to propagate)...`);
  await rest.put(Routes.applicationCommands(config.clientId), { body: globalCommands });

  console.log('Commands registered successfully.');
} catch (error) {
  console.error('Failed to register commands:', error);
  process.exitCode = 1;
}

import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { REST, Routes } from 'discord.js';
import { config } from './config.js';
import { collectCommandPaths } from './loadCommands.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Collect the slash-command definitions from src/commands (recursively).
const commands = [];
const commandsDir = join(__dirname, 'commands');
for (const file of collectCommandPaths(commandsDir)) {
  const command = await import(pathToFileURL(file).href);
  if ('data' in command) {
    commands.push(command.data.toJSON());
  }
}

const rest = new REST().setToken(config.token);

try {
  console.log(`Registering ${commands.length} command(s) on guild ${config.guildId}...`);
  await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), {
    body: commands,
  });
  console.log('Commands registered successfully.');
} catch (error) {
  console.error('Failed to register commands:', error);
  process.exitCode = 1;
}

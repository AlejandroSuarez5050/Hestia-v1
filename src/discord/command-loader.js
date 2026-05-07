import {Collection} from 'discord.js';
import fs from 'fs';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function loadCommands(client) {
  const commandsPath = path.join(__dirname, '..', 'commands');
  const files = fs.readdirSync(commandsPath).filter((f) => f.endsWith('.command.js'));
  client.commands = new Collection();
  for (const file of files) {
    const mod = await import(pathToFileURL(path.join(commandsPath, file)).href);
    const command = mod.default;
    if (!command?.data?.name || typeof command.execute !== 'function') {
      continue;
    }
    client.commands.set(command.data.name, command);
  }
}

import 'dotenv/config';
import {REST, Routes} from 'discord.js';
import fs from 'fs';
import path from 'path';
import {fileURLToPath, pathToFileURL} from 'url';
import env from '../config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function loadCommandData() {
  const commandsPath = path.join(__dirname, '..', 'commands');
  const files = fs.readdirSync(commandsPath).filter((f) => f.endsWith('.command.js'));
  const data = [];
  for (const file of files) {
    const mod = await import(pathToFileURL(path.join(commandsPath, file)).href);
    if (mod.default?.data?.toJSON && typeof mod.default.execute === 'function') {
      data.push(mod.default.data.toJSON());
    }
  }
  return data;
}

async function register() {
  if (!env.token) throw new Error('TOKEN no configurado.');
  if (!env.appId) throw new Error('APP_ID no configurado.');

  const rest = new REST({ version: '10' }).setToken(env.token);
  const commands = await loadCommandData();

  if (env.guildId) {
    await rest.put(Routes.applicationGuildCommands(env.appId, env.guildId), { body: commands });
    console.log(`Comandos registrados en guild ${env.guildId}: ${commands.length}`);
    return;
  }

  await rest.put(Routes.applicationCommands(env.appId), { body: commands });
  console.log(`Comandos registrados globalmente: ${commands.length}`);
}

register().catch((error) => {
  console.error('No se pudieron registrar comandos:', error?.message ?? error);
  process.exit(1);
});

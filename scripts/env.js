// Lectura y escritura del archivo .env (donde viven las claves de Strava).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV_PATH = path.join(ROOT, '.env');

export function loadEnv() {
  if (!fs.existsSync(ENV_PATH)) {
    console.error('No encuentro el archivo .env.');
    console.error('Copia .env.example como .env y rellena tu Client ID y Client Secret de Strava.');
    process.exit(1);
  }
  process.loadEnvFile(ENV_PATH);
  return process.env;
}

export function setEnvVar(key, value) {
  const lines = fs.readFileSync(ENV_PATH, 'utf8').split('\n');
  const line = `${key}=${value}`;
  const i = lines.findIndex((l) => l.startsWith(`${key}=`));
  if (i >= 0) lines[i] = line;
  else if (lines.at(-1) === '') lines.splice(-1, 0, line);
  else lines.push(line);
  fs.writeFileSync(ENV_PATH, lines.join('\n'));
}

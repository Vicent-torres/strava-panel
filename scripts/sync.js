// Descarga tus actividades de Strava y las guarda en docs/data/strava.json,
// que es lo que lee el panel. Solo guarda salidas de ciclismo públicas
// ("Todos") y nunca rutas, mapas, coordenadas ni pulsaciones.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadEnv, setEnvVar } from './env.js';

const OUT = path.join(ROOT, 'docs', 'data', 'strava.json');
// Deportes que se muestran en el panel (ciclismo en exterior; sin rodillo).
const SPORTS = new Set(['Ride', 'GravelRide', 'MountainBikeRide', 'EBikeRide', 'EMountainBikeRide']);
const env = loadEnv();

if (!env.STRAVA_REFRESH_TOKEN) {
  console.error('Todavía no has conectado Strava. Ejecuta primero: npm run auth');
  process.exit(1);
}

const token = await getAccessToken();

const athlete = await api('/athlete');
const all = [];
for (let page = 1; ; page++) {
  const batch = await api(`/athlete/activities?per_page=200&page=${page}`);
  all.push(...batch);
  process.stdout.write(`\r${all.length} actividades descargadas…`);
  if (batch.length < 200) break;
}
process.stdout.write('\n');

const isPublic = (a) => (a.visibility ? a.visibility === 'everyone' : !a.private);
const activities = all
  .filter((a) => isPublic(a) && SPORTS.has(a.sport_type || a.type))
  .map((a) => ({
    id: a.id,
    name: a.name,
    sport: a.sport_type || a.type,
    date: a.start_date_local.slice(0, 16), // hora local, sin zona horaria
    distance: Math.round(a.distance),
    movingTime: a.moving_time,
    elevation: Math.round(a.total_elevation_gain || 0),
    kudos: a.kudos_count,
  }))
  .sort((x, y) => (x.date < y.date ? 1 : -1));

const hidden = all.length - activities.length;
const previous = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : null;
const athleteData = { name: athlete.firstname };
if (
  previous &&
  JSON.stringify(previous.activities) === JSON.stringify(activities) &&
  JSON.stringify(previous.athlete) === JSON.stringify(athleteData)
) {
  console.log(`✓ Sin cambios: siguen siendo ${activities.length} salidas de ciclismo.`);
  process.exit(0);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ athlete: athleteData, syncedAt: new Date().toISOString(), activities }));

const added = previous ? activities.length - previous.activities.length : activities.length;
console.log(`✓ ${activities.length} salidas de ciclismo públicas guardadas en docs/data/strava.json${added > 0 ? ` (${added} nuevas)` : ''}`);
if (hidden) console.log(`  (${hidden} de otros deportes o no públicas se han dejado fuera)`);

async function getAccessToken() {
  const r = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    body: new URLSearchParams({
      client_id: env.STRAVA_CLIENT_ID,
      client_secret: env.STRAVA_CLIENT_SECRET,
      refresh_token: env.STRAVA_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  const data = await r.json();
  if (!r.ok) {
    console.error(`No se pudo renovar el acceso a Strava (${r.status}). Ejecuta de nuevo: npm run auth`);
    process.exit(1);
  }
  // Strava a veces entrega un permiso nuevo; lo guardamos para la próxima vez.
  if (data.refresh_token !== env.STRAVA_REFRESH_TOKEN) setEnvVar('STRAVA_REFRESH_TOKEN', data.refresh_token);
  return data.access_token;
}

async function api(endpoint) {
  const r = await fetch(`https://www.strava.com/api/v3${endpoint}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (r.status === 429) {
    console.error('\nStrava limita las peticiones: espera 15 minutos y vuelve a intentarlo.');
    process.exit(1);
  }
  if (!r.ok) throw new Error(`Strava respondió ${r.status} en ${endpoint}: ${await r.text()}`);
  return r.json();
}

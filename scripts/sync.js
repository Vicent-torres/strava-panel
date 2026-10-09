// Descarga tus actividades de Strava y las guarda en docs/data/strava.json,
// que es lo que lee el panel. Solo guarda salidas de ciclismo públicas
// ("Todos"), con su recorrido simplificado y su análisis de pulso.
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

const rawById = new Map(all.map((a) => [a.id, a]));
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
    route: a.map?.summary_polyline || null, // recorrido completo (formato polyline de Google)
  }))
  .sort((x, y) => (x.date < y.date ? 1 : -1));

const hidden = all.length - activities.length;
const previous = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : null;
const previousById = new Map((previous?.activities || []).map((a) => [a.id, a]));

// Pulso: la FC media/máxima viene en el resumen; las zonas y la eficiencia
// necesitan 2 peticiones por salida, así que se reutiliza lo ya calculado.
let hrZoneBounds = null;
let fetched = 0;
let rateLimited = false;
for (const act of activities) {
  const raw = rawById.get(act.id);
  if (!raw.has_heartrate) continue;
  act.avgHr = Math.round(raw.average_heartrate);
  act.maxHr = Math.round(raw.max_heartrate);

  const prev = previousById.get(act.id);
  if (prev && 'z2Speed' in prev) {
    Object.assign(act, { hrZones: prev.hrZones, z2Speed: prev.z2Speed });
    continue;
  }
  if (rateLimited) continue;
  try {
    const [zones, streams] = await Promise.all([
      api(`/activities/${act.id}/zones`),
      api(`/activities/${act.id}/streams?keys=time,distance,altitude,heartrate,velocity_smooth,moving&key_by_type=true`),
    ]);
    const hr = zones.find((z) => z.type === 'heartrate');
    act.hrZones = hr ? hr.distribution_buckets.map((b) => b.time) : null;
    if (hr && !hrZoneBounds) hrZoneBounds = hr.distribution_buckets.map((b) => b.min); // salidas más recientes primero
    const z2 = hr?.distribution_buckets[1];
    Object.assign(act, analyzeHeart(streams, z2 ? [z2.min, z2.max] : null));
    fetched++;
    process.stdout.write(`\rAnalizando el pulso: ${fetched} salidas…`);
  } catch (err) {
    if (err.rateLimited) {
      rateLimited = true;
      console.warn('\nStrava limita las peticiones: el resto del análisis de pulso se completará en la próxima actualización.');
    } else {
      console.warn(`\nNo se pudo analizar el pulso de "${act.name}": ${err.message}`);
    }
  }
}
if (fetched) process.stdout.write('\n');
hrZoneBounds ??= previous?.hrZoneBounds ?? null;

const athleteData = { name: athlete.firstname };
if (
  previous &&
  JSON.stringify(previous.activities) === JSON.stringify(activities) &&
  JSON.stringify(previous.athlete) === JSON.stringify(athleteData) &&
  JSON.stringify(previous.hrZoneBounds ?? null) === JSON.stringify(hrZoneBounds)
) {
  console.log(`✓ Sin cambios: siguen siendo ${activities.length} salidas de ciclismo.`);
  process.exit(0);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ athlete: athleteData, syncedAt: new Date().toISOString(), hrZoneBounds, activities }));

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
    const err = new Error('Strava limita las peticiones: espera 15 minutos y vuelve a intentarlo.');
    err.rateLimited = true;
    throw err;
  }
  if (!r.ok) throw new Error(`Strava respondió ${r.status} en ${endpoint}: ${await r.text()}`);
  return r.json();
}

// Forma aeróbica a partir de los datos segundo a segundo de la salida.
// Solo cuenta tramos llanos (pendiente < 2 %) y en movimiento, para que
// subidas, bajadas y paradas no distorsionen la comparación entre salidas.
//  - z2Speed: velocidad media en llano con el pulso en tu zona 2 (km/h).
//    Ir más rápido con el mismo pulso = mejor capacidad aeróbica.
function analyzeHeart(streams, z2Range) {
  const t = streams.time?.data;
  const d = streams.distance?.data;
  const alt = streams.altitude?.data;
  const hr = streams.heartrate?.data;
  const v = streams.velocity_smooth?.data;
  const moving = streams.moving?.data;
  if (!t || !d || !hr || !v || !z2Range) return { z2Speed: null };

  const n = t.length;
  const flat = [];
  let j0 = 0;
  let j1 = 0;
  for (let i = 1; i < n; i++) {
    const dt = Math.min(t[i] - t[i - 1], 5);
    if (dt <= 0 || (moving && !moving[i]) || v[i] < 4.2) continue; // menos de 15 km/h: semáforos, rotondas…
    if (alt) {
      // pendiente en una ventana de ~100 m alrededor del punto
      while (j0 < i && d[i] - d[j0] > 50) j0++;
      while (j1 < n - 1 && d[j1] - d[i] < 50) j1++;
      const dd = d[j1] - d[j0];
      if (dd < 60 || Math.abs((alt[j1] - alt[j0]) / dd) > 0.02) continue;
    }
    flat.push({ dt, v: v[i], hr: hr[i] });
  }

  const [lo, hi] = z2Range;
  const z2 = flat.filter((x) => x.hr >= lo && (hi < 0 || x.hr < hi));
  const time = z2.reduce((sum, x) => sum + x.dt, 0);
  if (time < 600) return { z2Speed: null }; // mínimo 10 min en llano y en zona 2
  const meters = z2.reduce((sum, x) => sum + x.v * x.dt, 0);
  return { z2Speed: Number(((meters / time) * 3.6).toFixed(1)) };
}

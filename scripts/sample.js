// Genera datos de ejemplo (docs/data/sample.json) para ver el panel
// antes de conectar Strava. El panel los usa si no existe strava.json.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './env.js';

const OUT = path.join(ROOT, 'docs', 'data', 'sample.json');

let seed = 20261010;
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const between = (a, b) => a + rand() * (b - a);
const pick = (list) => list[Math.floor(rand() * list.length)];
const pad = (n) => String(n).padStart(2, '0');

const activities = [];
let id = 1;
const today = new Date();
today.setHours(0, 0, 0, 0);

function add(day, hour, sport, name, km, kmh, elevation) {
  const d = new Date(day);
  d.setHours(hour, Math.floor(rand() * 60));
  const distance = Math.round(km * 1000);
  const movingTime = kmh ? Math.round((km / kmh) * 3600) : Math.round(between(40, 65) * 60);
  activities.push({
    id: id++,
    name,
    sport,
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`,
    distance,
    movingTime,
    elevation: Math.round(elevation),
    kudos: Math.floor(between(0, 18)),
  });
}

for (let i = 540; i >= 0; i--) {
  const day = new Date(today);
  day.setDate(today.getDate() - i);
  const dow = day.getDay(); // 0 = domingo
  const winter = [10, 11, 0, 1].includes(day.getMonth());

  if ((dow === 2 || dow === 4) && rand() < (winter ? 0.75 : 0.45)) {
    const km = between(25, 45);
    add(day, 19, 'VirtualRide', pick(['Zwift - Watopia', 'Zwift - Makuri', 'Rouvy - Alpes', 'Rodillo: series']), km, between(30, 34), km * between(6, 14));
  }
  if (dow === 3 && rand() < 0.55) {
    add(day, 7, 'Run', pick(['Rodaje matinal', 'Series en pista', 'Fartlek', 'Carrera suave']), between(7, 12), between(10.5, 12.6), between(20, 90));
  }
  if (dow === 5 && rand() < 0.4) add(day, 18, 'WeightTraining', 'Gimnasio', 0, 0, 0);
  if (dow === 6 && rand() < (winter ? 0.55 : 0.85)) {
    const km = between(55, 110);
    add(day, 8, 'Ride', pick(['Salida larga del sábado', 'Puertos con la grupeta', 'Ruta por la costa', 'Vuelta al pantano']), km, between(25, 29.5), km * between(9, 18));
  }
  if (dow === 0) {
    if (rand() < 0.55) add(day, 9, 'Run', pick(['Tirada larga', 'Trail por el monte', 'Carrera de domingo']), between(12, 21), between(10, 11.8), between(60, 350));
    else if (rand() < 0.5) add(day, 10, 'Walk', 'Paseo', between(4, 8), between(4.5, 5.5), between(10, 80));
  }
}

activities.sort((x, y) => (x.date < y.date ? 1 : -1));
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ athlete: { name: 'Ejemplo' }, syncedAt: new Date().toISOString(), activities }));
console.log(`✓ ${activities.length} actividades de ejemplo en docs/data/sample.json`);

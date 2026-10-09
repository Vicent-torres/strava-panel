// Conecta el panel con tu cuenta de Strava (solo hace falta una vez).
// Abre Strava en el navegador, tú autorizas, y guarda el permiso en .env.
import http from 'node:http';
import { execFile } from 'node:child_process';
import { loadEnv, setEnvVar } from './env.js';

const PORT = 8787;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;

const env = loadEnv();
const clientId = env.STRAVA_CLIENT_ID;
const clientSecret = env.STRAVA_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error('Faltan STRAVA_CLIENT_ID o STRAVA_CLIENT_SECRET en el archivo .env.');
  process.exit(1);
}

const authorizeUrl = new URL('https://www.strava.com/oauth/authorize');
authorizeUrl.search = new URLSearchParams({
  client_id: clientId,
  redirect_uri: REDIRECT_URI,
  response_type: 'code',
  approval_prompt: 'auto',
  // Solo lectura de actividades; las privadas ("solo yo") no se piden.
  scope: 'read,activity:read',
});

const HTML = { 'content-type': 'text/html; charset=utf-8' };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT_URI);
  if (url.pathname !== '/callback') {
    res.writeHead(404).end();
    return;
  }

  const code = url.searchParams.get('code');
  const scope = url.searchParams.get('scope') || '';
  if (!code) {
    res.writeHead(400, HTML).end('<p>Strava no ha dado permiso. Vuelve a ejecutar <code>npm run auth</code>.</p>');
    console.error('Autorización cancelada o rechazada:', url.searchParams.get('error') || 'sin código');
    finish(1);
    return;
  }
  if (!scope.includes('activity:read')) {
    res.writeHead(400, HTML).end('<p>Falta el permiso para leer actividades. Vuelve a ejecutar <code>npm run auth</code> y deja marcada esa casilla.</p>');
    console.error('Strava no concedió el permiso activity:read.');
    finish(1);
    return;
  }

  try {
    const r = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
      }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(`Strava respondió ${r.status}: ${JSON.stringify(data)}`);

    setEnvVar('STRAVA_REFRESH_TOKEN', data.refresh_token);
    res.writeHead(200, HTML).end('<h1>Listo ✅</h1><p>Ya puedes cerrar esta pestaña y volver al terminal.</p>');
    console.log(`✓ Conectado a Strava como ${data.athlete?.firstname ?? 'tu cuenta'}.`);
    console.log('  Ahora ejecuta: npm run sync');
    finish(0);
  } catch (err) {
    res.writeHead(500, HTML).end('<p>Algo ha fallado. Mira el mensaje en el terminal.</p>');
    console.error(err.message);
    finish(1);
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('Abriendo Strava en el navegador para que autorices el acceso…');
  console.log(`Si no se abre, copia esta dirección en el navegador:\n${authorizeUrl.href}\n`);
  execFile('open', [authorizeUrl.href]);
});

function finish(exitCode) {
  setTimeout(() => {
    server.close();
    process.exit(exitCode);
  }, 300);
}

# Panel de Strava

Un panel web con mis actividades de Strava: distancia, tiempo, desnivel,
evolución por semana/mes, tiempo por deporte, récords y últimas actividades.

Solo se publican actividades **públicas** ("Todos" en Strava) y nunca se
guardan rutas, mapas, coordenadas ni pulsaciones.

## Uso diario

```bash
npm run sync    # descarga tus actividades nuevas de Strava
npm start       # abre el panel en http://localhost:4321
```

Para publicar los cambios en la web, sube el archivo actualizado a GitHub:

```bash
git add docs/data/strava.json && git commit -m "Actualizar datos" && git push
```

## Configuración (solo la primera vez)

1. Crea una app en https://www.strava.com/settings/api
   - **Application Name**: lo que quieras (p. ej. "Mi panel")
   - **Category**: Visualizer
   - **Website**: `http://localhost`
   - **Authorization Callback Domain**: `localhost`
2. Copia `.env.example` como `.env` y pega tu **Client ID** y **Client Secret**.
   El archivo `.env` nunca se sube a GitHub.
3. `npm run auth` → autoriza en el navegador.
4. `npm run sync` → descarga tus actividades.

## Estructura

- `docs/` — la web (lo que publica GitHub Pages)
  - `data/strava.json` — tus datos (lo genera `npm run sync`)
  - `data/sample.json` — datos de ejemplo, se usan si no hay `strava.json`
- `scripts/` — conexión con Strava y servidor local

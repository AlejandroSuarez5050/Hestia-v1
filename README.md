# Hestia

Bot de musica para Discord, enfocado en estabilidad de reproduccion y gestion avanzada de cola.

## Tecnologias

- Node.js 24.15.0
- Discord.js
- Lavalink
- lavalink-client
- Docker / Docker Compose

## Comandos

### Reproduccion
- `/play <query> [next]`: reproduce una cancion o playlist por URL o busqueda.
- `/search <query>`: atajo de busqueda para anadir rapido a cola.
- `/playlist <query> [next]`: busca y encola resultados de playlist.
- `/pause`: pausa/reanuda.
- `/skip`: salta pista actual.
- `/back`: vuelve a la pista anterior.
- `/stop`: detiene reproduccion y limpia cola.
- `/volume <1-150>`: ajusta volumen.

### Cola
- `/queue show`: muestra panel de cola interactivo.
- `/queue clear`: limpia la cola.
- `/cleanup [modo] [limite] [profundo]`: limpia panel o mensajes recientes del bot en el canal.
- `/clear`: alias de limpieza.
- `/remove <position>`: elimina pista por posicion.
- `/move <from> <to>`: mueve pista entre posiciones.
- `/shuffle`: mezcla cola.

### Modo de reproduccion
- `/loop`: rota entre off -> track -> queue.
- `/autoplay`: activa/desactiva autoplay.

## Panel de cola (UI)

Desde `/queue show` puedes:

- cambiar de pagina
- seleccionar una pista
- reproducir ahora la seleccionada
- eliminar la seleccionada
- subir/bajar la seleccionada
- mezclar y limpiar cola

## Self-host

El repositorio incluye plantillas publicas. Los archivos reales de entorno y Docker deben vivir solo en tu maquina o servidor.

1. Copia `.env.example` a `.env` y completa tus credenciales.
2. Copia `application.example.yml` a `application.yml`.
3. Copia `docker-compose.example.yml` a `docker-compose.yml`.
4. Ajusta los valores privados en `.env` y, si lo necesitas, personaliza `application.yml`.
5. Levanta los servicios:

```bash
docker compose up -d --build
```

Archivos privados ignorados por Git:

- `.env`
- `.env.*`
- `application.yml`
- `docker-compose.yml`
- `docker-compose.*.yml`

## Ambientes Dev/Prod

La configuracion recomendada para mantener un bot publico estable es usar dos aplicaciones de Discord:

- `Hestia Dev`: pruebas, usa `GUILD_ID`, comandos por servidor y despliegue rapido.
- `Hestia`: produccion, no define `GUILD_ID`, comandos globales.

En tu servidor privado puedes correr ambos ambientes con stacks separados:

- `/opt/hestia/dev/.env`
- `/opt/hestia/dev/application.yml`
- `/opt/hestia/dev/docker-compose.yml`
- `/opt/hestia/prod/.env`
- `/opt/hestia/prod/application.yml`
- `/opt/hestia/prod/docker-compose.yml`

Usa nombres diferentes para contenedores/redes en cada stack, por ejemplo `hestia-dev`, `hestia-dev-lavalink`, `hestia_dev_network` para desarrollo y `hestia`, `hestia-lavalink`, `hestia_network` para produccion.

## Configuracion

1. Completa al menos `TOKEN`, `APP_ID` y datos de Lavalink en `.env`.
2. Opcional dev: define `GUILD_ID` para registrar comandos solo en tu servidor de pruebas.
3. Opcional: `MODO_VERBOSE_UI=true` para mostrar confirmaciones efimeras en botones del panel (por defecto `false`).
4. Opcional autoplay avanzado: `AUTOPLAY_BATCH_SIZE` (default `5`) y `AUTOPLAY_HISTORY_SIZE` (default `50`) para evitar repeticiones.

## Registro de slash commands

```bash
npm run commands:register
```

- Con `GUILD_ID`: registro por servidor (inmediato).
- Sin `GUILD_ID`: registro global (puede tardar en propagarse).

## Spotify playlists por OAuth (recomendado)

Si Spotify playlists devuelve 403, habilita OAuth de usuario para playlists. El bot usa `GET /me/playlists` y `GET /playlists/{id}/items`, por lo que la playlist debe aparecer en tus playlists de Spotify o ser colaborativa contigo.

1. Configura en `.env`:
   - `SPOTIFY_CLIENT_ID`
   - `SPOTIFY_CLIENT_SECRET`
   - `SPOTIFY_REDIRECT_URI` (por defecto `http://127.0.0.1:9876/callback`)
2. Genera URL de autorizacion:

```bash
npm run spotify:auth:url
```

3. Autoriza la app en el navegador y copia el parametro `code` del redirect.
4. Intercambia code por refresh token:

```bash
npm run spotify:auth:exchange -- <CODE>
```

5. Copia `SPOTIFY_REFRESH_TOKEN` al `.env` y reinicia el bot.

Los scopes usados son `user-read-private`, `playlist-read-private` y `playlist-read-collaborative`. Si ya generaste un token antes de este cambio, vuelve a generar `SPOTIFY_REFRESH_TOKEN`.

Para playlists grandes, el fallback resuelve primero `SPOTIFY_FALLBACK_INITIAL_BATCH` canciones (por defecto `25`) para iniciar mas rapido y continua agregando el resto en segundo plano. Puedes ajustar paralelismo con `SPOTIFY_FALLBACK_SEARCH_CONCURRENCY` (por defecto `10`).

### Flujo local automatico (recomendado)

Si no tienes un callback web activo y ves "Not Found", usa callback local:

1. En Spotify Developer agrega este redirect URI:
   - `http://127.0.0.1:9876/callback`
2. En tu `.env` usa:
   - `SPOTIFY_REDIRECT_URI=http://127.0.0.1:9876/callback`
3. Ejecuta:

```bash
npm run spotify:auth:local
```

El script levanta un servidor local, te da la URL de autorizacion y al volver del login imprime automaticamente `SPOTIFY_REFRESH_TOKEN`.

## Docker

```bash
docker compose up -d
docker compose logs -f
docker compose down
```

Incluye healthchecks para bot/Lavalink, reinicio automatico y rotacion de logs.

Para publicar una imagen propia puedes construir desde el `Dockerfile`:

```bash
docker build -t hestia:latest .
```

## Seguridad

- Nunca publiques `.env`, `application.yml` real ni `docker-compose.yml` real.
- Usa tokens distintos para `Hestia Dev` y `Hestia`.
- Rota credenciales si alguna vez aparecieron en logs, capturas o historial Git.
- Guarda secretos de despliegue en GitHub Environments/Secrets, no en archivos del repo.

## GitHub Actions

El repo incluye tres workflows:

- `CI`: valida sintaxis y construye la imagen Docker en `main`, `develop` y pull requests.
- `Deploy Dev`: publica `ghcr.io/<owner>/<repo>:dev` y despliega el stack privado de desarrollo desde `develop`.
- `Deploy Prod`: publica `ghcr.io/<owner>/<repo>:latest` y despliega el stack privado de produccion desde `main`.

Los workflows de deploy esperan que tu servidor ya tenga su propio `docker-compose.yml`, `.env` y `application.yml` privados. El compose del servidor debe usar la imagen publicada en GHCR en lugar de `build` local.

Configura estos secretos en los environments `dev` y `production`:

- `SERVER_HOST`
- `SERVER_USER`
- `SERVER_SSH_KEY`
- `DEPLOY_PATH`

Ejemplos de `DEPLOY_PATH`:

- Dev: `/opt/hestia/dev`
- Prod: `/opt/hestia/prod`

El deploy ejecuta en el servidor:

```bash
docker compose pull bot
docker compose up -d
docker compose exec -T bot npm run commands:register
```

## Scripts utiles

```bash
npm run start
npm run check
npm run commands:register
```

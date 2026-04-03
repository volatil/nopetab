# NopeTab

Chrome extension to block distracting sites with independent rules per domain.

Extension de Chrome para bloquear sitios distractores con reglas independientes por dominio.

## Lo Principal

- Reglas por sitio para manejar distintos dominios y subdominios por separado.
- Bloqueos por fecha y hora exactas para ventanas puntuales.
- Horarios semanales recurrentes por dias y rango horario.
- Popup con el estado actual del sitio y la proxima regla aplicable.
- Pagina de opciones para editar dominios, reglas y mensajes globales.
- Pantalla de bloqueo con desbloqueo de emergencia para la regla activa.

## Highlights

- Site-specific rules for managing different domains independently.
- One-time date/time blocks for specific windows.
- Recurring weekly schedules by day and time range.
- Popup with current-site status and the next matching rule.
- Options page for domains, rules, and global blocking messages.
- Block page with an emergency bypass for the active rule.

## Instalar En Chrome

1. Ve a `chrome://extensions`.
2. Activa `Developer mode`.
3. Haz clic en `Load unpacked`.
4. Selecciona `{{ RUTA DEL PROYECTO }}`.

## Install In Chrome

1. Open `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select `{{ PROJECT ROUTE }}`.

## Como Funciona

`NopeTab` evalua el dominio de la pestana actual y revisa las reglas guardadas para ese sitio. Si alguna regla activa coincide, la extension redirige a una pantalla de bloqueo con el mensaje configurado y una opcion de emergencia para entrar igual.

El popup sirve para consultar rapidamente el estado del sitio actual y ver la proxima regla. La pagina de opciones concentra la configuracion de dominios, reglas por fecha, horarios semanales y mensajes globales.

## How It Works

`NopeTab` checks the current tab domain and evaluates the saved rules for that site. When an active rule matches, the extension sends the user to a block page with the configured message and an emergency bypass option.

The popup is meant for quick status checks, while the options page is where domains, one-time rules, weekly schedules, and global messages are managed.

## Estructura Del Proyecto

- `manifest.json`: configuracion principal de la extension en Chrome Manifest V3.
- `src/background.js`: logica base para evaluar reglas y activar bloqueos.
- `src/popup`: interfaz rapida para consultar estado y contexto del sitio actual.
- `src/options`: configuracion de sitios, reglas y mensajes.
- `src/blocked`: pantalla mostrada cuando una regla esta activa.
- `assets`: iconos e imagenes usadas por la extension.

## Project Structure

- `manifest.json`: main Chrome Manifest V3 configuration.
- `src/background.js`: core rule evaluation and blocking flow.
- `src/popup`: quick UI for current-site status.
- `src/options`: site, rule, and message settings.
- `src/blocked`: page displayed when a rule is active.
- `assets`: extension icons and related assets.

## Desarrollo Local

NopeTab esta pensado para cargarse localmente como extension unpacked. No requiere un proceso de build para probar la version actual del repositorio: basta con cargar la carpeta del proyecto en Chrome.

El proyecto usa `Manifest V3`, `service worker` en background y paginas HTML/CSS/JS separadas para popup, opciones y pantalla de bloqueo.

## Local Development

NopeTab is currently designed to be loaded locally as an unpacked extension. There is no required build step for the current version of the repository; loading the project folder in Chrome is enough.

The project is based on `Manifest V3`, a background `service worker`, and separate HTML/CSS/JS pages for the popup, options page, and blocked screen.

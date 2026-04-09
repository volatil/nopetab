# NopeTab

v1.2:
- Grupos de webs que comparten una misma regla
- Migracion automatica desde configuracion por sitio
- Validacion para impedir webs repetidas entre grupos

v1.1:
- Lista compacta con acordeones
- Busqueda por dominio
- Resumen con estado actual y proximo bloqueo
- Duplicado de reglas
- Reordenamiento con drag and drop

Chrome extension to block distracting sites with shared rules across site groups.

Extension de Chrome para bloquear sitios distractores con reglas compartidas entre grupos de webs.

## Lo Principal

- Grupos de webs para compartir reglas entre distintos dominios y subdominios.
- Bloqueos por fecha y hora exactas para ventanas puntuales.
- Horarios semanales recurrentes por dias y rango horario.
- Popup con el estado actual de la web y la proxima regla aplicable.
- Pagina de opciones para editar grupos de webs, reglas y mensajes globales.
- Pantalla de bloqueo con desbloqueo de emergencia para la regla activa del dominio actual.

## Highlights

- Domain groups for sharing rules across multiple sites.
- One-time date/time blocks for specific windows.
- Recurring weekly schedules by day and time range.
- Popup with current-site status and the next matching rule.
- Options page for site groups, rules, and global blocking messages.
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

`NopeTab` evalua el dominio de la pestana actual y revisa los grupos de webs guardados. Si alguna regla activa coincide con la web actual o sus subdominios, la extension redirige a una pantalla de bloqueo con el mensaje configurado y una opcion de emergencia para entrar igual.

El popup sirve para consultar rapidamente el estado de la web actual y ver la proxima regla. La pagina de opciones concentra la configuracion de grupos de webs, reglas por fecha, horarios semanales y mensajes globales.

## How It Works

`NopeTab` checks the current tab domain and evaluates the saved site groups. When an active rule matches the current site or one of its subdomains, the extension sends the user to a block page with the configured message and an emergency bypass option.

The popup is meant for quick status checks, while the options page is where site groups, one-time rules, weekly schedules, and global messages are managed.

## Estructura Del Proyecto

- `manifest.json`: configuracion principal de la extension en Chrome Manifest V3.
- `src/background.js`: logica base para evaluar reglas y activar bloqueos.
- `src/popup`: interfaz rapida para consultar estado y contexto del sitio actual.
- `src/options`: configuracion de grupos, reglas y mensajes.
- `src/blocked`: pantalla mostrada cuando una regla esta activa.
- `assets`: iconos e imagenes usadas por la extension.

## Project Structure

- `manifest.json`: main Chrome Manifest V3 configuration.
- `src/background.js`: core rule evaluation and blocking flow.
- `src/popup`: quick UI for current-site status.
- `src/options`: group, rule, and message settings.
- `src/blocked`: page displayed when a rule is active.
- `assets`: extension icons and related assets.

## Desarrollo Local

NopeTab esta pensado para cargarse localmente como extension unpacked. No requiere un proceso de build para probar la version actual del repositorio: basta con cargar la carpeta del proyecto en Chrome.

El proyecto usa `Manifest V3`, `service worker` en background y paginas HTML/CSS/JS separadas para popup, opciones y pantalla de bloqueo.

## Local Development

NopeTab is currently designed to be loaded locally as an unpacked extension. There is no required build step for the current version of the repository; loading the project folder in Chrome is enough.

The project is based on `Manifest V3`, a background `service worker`, and separate HTML/CSS/JS pages for the popup, options page, and blocked screen.

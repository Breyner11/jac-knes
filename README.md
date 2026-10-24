# JAC-KNES · Club Canino Campestre

App instalable (PWA) para registrar la llegada de los perros, el hotel y los paquetes de **Paseo campo** y **Piscina**.
Los datos se leen y se guardan en vivo en la hoja de Google «Perros – App». Las fotos van a la carpeta «Perros – Fotos» del Drive de quien usa la app.

Dirección de la app: **https://breyner11.github.io/jac-knes/**

## Cómo funciona
- Es una página estática (sin servidor propio) publicada en GitHub Pages.
- Para entrar se usa «Entrar con Google» (Google Identity Services). Luego la app llama directo desde el teléfono a la API de Google Sheets y a la de Google Drive.
- Este repositorio no guarda ningún dato de clientes. Todo se lee de la hoja cuando se abre la app.
- Las fotos **nunca se hacen públicas**: se descargan con la sesión de Google y se muestran solo dentro de la app.
- Todas las horas se muestran en formato de 12 horas (AM/PM).

## Configuración
El ID de cliente de OAuth va en **`config.js`**, en la línea:

```js
var CLIENT_ID = '904655634300-jncidme3lpbgqob8utritrottrb7dd01.apps.googleusercontent.com';
```

(El ID de cliente no es secreto. Este repositorio no contiene ningún secreto.)

En la consola de Google Cloud, para ese cliente:
- **Orígenes de JavaScript autorizados:** solo `https://breyner11.github.io`. Por eso el inicio de sesión no funciona si se abre la app desde otra dirección (por ejemplo, `localhost`).
- **Pantalla de consentimiento en modo *Testing* (prueba):** solo pueden entrar los usuarios de prueba que estén en la lista (las cuentas de Jerson y Breyner). Google mostrará el aviso «Google no verificó esta app». Hay que tocar **Continuar** y aceptar todos los permisos. En modo de prueba, Google puede pedir que se vuelva a entrar más o menos cada 7 días.
- **Permisos:** la app los pide al entrar, así que no hace falta registrarlos antes:
  - `spreadsheets`, para leer y escribir la hoja;
  - `drive.file`, solo para los archivos que crea la propia app;
  - `openid` y `email`, para saber con qué cuenta se entró.
- La cuenta que usa la app debe tener la hoja «Perros – App» compartida como **Editor**.

## Instalar en Android
1. Abre https://breyner11.github.io/jac-knes/ en **Chrome**.
2. Toca «📲 Instalar app en este teléfono» o, en el menú ⋮, **Instalar app** (o «Agregar a la pantalla principal»).
3. Queda el ícono JAC-KNES. La app abre a pantalla completa, sin barra del navegador.

En iPhone se usa Safari → Compartir → «Agregar a inicio». Ojo: en iPhone, la ventanita de Google a veces no abre bien desde la app instalada. Si pasa, entra una vez desde Safari.

## Hoja de cálculo
- **Clientes**: ID, Cliente, Mascota, Dirección, Correo, Identificación, Contacto, Modalidad, Encargado, Activo, Notas, Foto. En la columna Foto solo se guarda el ID del archivo de Drive.
- **Registro**: ID registro, Fecha, ClienteID, Mascota, Tipo, Hora entrada, Hora salida, Horas, Registrado por, Nota, **Paquete** (columna K).
  - Pasadía: solo hora de entrada.
  - Hotel: entrada y salida, con las horas calculadas.
  - Paseo campo y Piscina: cada sesión marcada es una fila, con el ID del paquete en la columna K.
  - Las filas antiguas con el tipo «Paseo» se muestran como «Paseo campo».
- **Paquetes**: ID paquete, ClienteID, Mascota, Tipo, Cantidad, Fecha inicio, Estado, Nota. El Estado puede ser:
  - `Activo`;
  - `Completo`, cuando ya se usaron todas las sesiones;
  - `Cerrado`, cuando se empezó uno nuevo antes de terminar.
- **Hotel24H**: lista de nombres separados por `;`.

La app crea sola la pestaña «Paquetes» y el encabezado «Paquete» de la columna K si no existen.

## Fotos
- Se comprimen en el teléfono: la foto queda de unos 800 px y la miniatura de 200 px. Se suben a «Perros – Fotos» en el Drive de la cuenta conectada.
- Con el permiso `drive.file`, la app solo puede ver las fotos que ella misma subió. Las fotos subidas con la versión anterior (Apps Script) aparecen como «Foto guardada con otra cuenta». Basta con volver a tomarlas.

## Archivos
| Archivo | Para qué |
|---|---|
| `index.html` | Pantallas: entrar, lista y perfil |
| `styles.css` | Estilos (rojo/negro JAC-KNES) |
| `config.js` | **CLIENT_ID**, ID de la hoja, permisos y carpeta de fotos |
| `backend.js` | Conexión con Google: sesión, Sheets y Drive |
| `ui.js` | Interfaz (la misma que usa la versión Apps Script) |
| `pwa.js`, `sw.js`, `manifest.webmanifest` | Instalación y caché de la app (los datos nunca se guardan en caché) |
| `icons/`, `img/` | Íconos y logo |

## Publicar cambios
Sube los archivos a la rama `main`. GitHub Pages sirve la raíz del repositorio. Si cambias archivos de la app, sube también el número de `VERSION` en `sw.js` para que los teléfonos tomen la versión nueva.

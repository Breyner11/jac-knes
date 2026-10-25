# JAC-KNES · Club Canino Campestre

App instalable (PWA) para registrar la llegada de los perros, el hotel y los paquetes de **Paseo campo** y **Piscina**.
Los datos se leen y se guardan en vivo en la hoja de Google «Perros – App».

Dirección de la app: **https://breyner11.github.io/jac-knes/**

## Cómo funciona
- Esta página es estática (GitHub Pages). **No hace falta cuenta de Google**: se entra con un **PIN de 4 dígitos**.
- La app le habla a un pequeño servidor hecho en **Google Apps Script** (una «aplicación web» publicada por el dueño de la hoja). Ese servidor es el único que abre la hoja y la carpeta de fotos, con la cuenta de quien lo publicó.
- El PIN **no está en este repositorio**: lo revisa el servidor en cada pedido. En el teléfono queda recordado hasta que se toca **Salir** (abajo en la lista).
- Si se equivocan con el PIN 10 veces seguidas, el servidor no deja entrar a nadie durante 10 minutos.
- Este repositorio no guarda ningún dato de clientes ni ningún secreto.
- Las fotos **nunca se hacen públicas**: el servidor las entrega solo con el PIN correcto.
- Todas las horas se muestran en formato de 12 horas (AM/PM).

## Configuración
Lo único que hay que poner es la URL del servidor en **`config.js`**:

```js
API_URL: 'https://script.google.com/macros/s/……/exec',
```

Esa URL se obtiene en el editor de Apps Script → **Implementar → Nueva implementación → Aplicación web**
(Ejecutar como: **Yo** · Quién tiene acceso: **Cualquier persona**). La URL no es secreta: sin el PIN no devuelve datos.
El PIN se cambia en el editor de Apps Script → Configuración del proyecto → **Propiedades del script** → `APP_PIN`.

## Instalar en Android
1. Abre https://breyner11.github.io/jac-knes/ en **Chrome**.
2. Toca «📲 Instalar app en este teléfono» o, en el menú ⋮, **Instalar app** (o «Agregar a la pantalla principal»).
3. Queda el ícono JAC-KNES. Al abrirla la primera vez pide el PIN.

En iPhone se usa Safari → Compartir → «Agregar a inicio».

## Hoja de cálculo
- **Clientes**: ID, Cliente, Mascota, Dirección, Correo, Identificación, Contacto, Modalidad, Encargado, Activo, Notas, Foto. En la columna Foto solo se guarda el ID del archivo de Drive.
- **Registro**: ID registro, Fecha, ClienteID, Mascota, Tipo, Hora entrada, Hora salida, Horas, Registrado por, Nota, **Paquete** (columna K).
  - Pasadía: solo hora de entrada.
  - Hotel: entrada y salida, con las horas calculadas.
  - Paseo campo y Piscina: cada sesión marcada es una fila, con el ID del paquete en la columna K.
  - Las filas antiguas con el tipo «Paseo» se muestran como «Paseo campo».
- **Paquetes**: ID paquete, ClienteID, Mascota, Tipo, Cantidad, Fecha inicio, Estado, Nota. El Estado puede ser `Activo`, `Completo` (se usaron todas las sesiones) o `Cerrado` (se empezó uno nuevo antes de terminar).
- **Hotel24H**: lista de nombres separados por `;`.

El servidor crea solo la pestaña «Paquetes» y el encabezado «Paquete» de la columna K si no existen.

## Fotos
- Se comprimen en el teléfono (foto de unos 800 px y miniatura de 200 px) y el servidor las guarda en la carpeta «Perros – Fotos» del Drive de quien publicó el servidor.
- Si una foto antigua no se puede leer con esa cuenta, aparece «No se pudo cargar la foto». Basta con volver a tomarla.

## Archivos
| Archivo | Para qué |
|---|---|
| `index.html` | Pantallas: PIN, lista y perfil |
| `styles.css` | Estilos (rojo/negro JAC-KNES) |
| `config.js` | **API_URL** del servidor de Apps Script |
| `backend.js` | Conexión con el servidor (PIN y pedidos) |
| `ui.js` | Interfaz |
| `pwa.js`, `sw.js`, `manifest.webmanifest` | Instalación y caché de la app (los datos nunca se guardan en caché) |
| `icons/`, `img/` | Íconos y logo |

## Publicar cambios
Sube los archivos a la rama `main`. GitHub Pages sirve la raíz del repositorio. Si cambias archivos de la app, sube también el número de `VERSION` en `sw.js` para que los teléfonos tomen la versión nueva.

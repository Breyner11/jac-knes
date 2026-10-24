/* ==========================================================================
   JAC-KNES · Configuración
   Lo ÚNICO que hay que cambiar es CLIENT_ID (ID de cliente OAuth "Aplicación web"
   creado en Google Cloud Console, con origen autorizado https://breyner11.github.io).
   El ID de cliente NO es secreto: está pensado para ir en el navegador.
   ========================================================================== */
var CLIENT_ID = '904655634300-jncidme3lpbgqob8utritrottrb7dd01.apps.googleusercontent.com';

window.JACKNES_CONFIG = {
  CLIENT_ID: CLIENT_ID,
  // Hoja «Perros – App» (el acceso lo controla Google: solo cuentas con permiso de editor).
  SPREADSHEET_ID: '1dapbegiOjtlIXZDkMXCxXYNUPTX_CRsbLCITiTCiHPg',
  SCOPES: [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive.file',
    'openid',
    'email'
  ],
  CARPETA_FOTOS: 'Perros – Fotos',
  ZONA: 'America/Bogota'
};

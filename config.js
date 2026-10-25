/* ==========================================================================
   JAC-KNES · Configuración
   Lo ÚNICO que hay que cambiar es API_URL: la URL de la aplicación web de Apps Script
   (termina en /exec), que se copia al publicar el script en «Implementar → Nueva implementación».
   Esta URL no es secreta: los datos los protege el PIN, que se revisa en el servidor.
   ========================================================================== */
window.JACKNES_CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbymVbe0CQ-qS16REgcoW7WHFubXYOGZegBLWlgBNtBxXc-IaKn_uda5A84fTAYgdMd7IA/exec',
  ZONA: 'America/Bogota'
};

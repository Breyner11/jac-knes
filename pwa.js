/* JAC-KNES · Instalación como app (service worker + botón «Instalar app» en Android). */
(function(){
  'use strict';
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', function(){
      navigator.serviceWorker.register('sw.js').catch(function(){});
    });
  }
  var aviso = null;
  window.addEventListener('beforeinstallprompt', function(e){
    e.preventDefault(); aviso = e; pintar();
  });
  window.addEventListener('appinstalled', function(){ aviso = null; pintar(); });
  function pintar(){
    var foot = document.getElementById('foot'); if (!foot) return;
    var b = document.getElementById('bInstalar');
    if (!aviso) { if (b) b.remove(); return; }
    if (!b) {
      b = document.createElement('button'); b.id = 'bInstalar'; b.className = 'big primary';
      b.style.cssText = 'width:100%;margin:12px 0 0'; b.textContent = '📲 Instalar app en este teléfono';
      b.addEventListener('click', function(){ if (!aviso) return; aviso.prompt(); aviso.userChoice.finally(function(){ aviso = null; pintar(); }); });
    }
    foot.parentNode.insertBefore(b, foot.nextSibling);
  }
  new MutationObserver(function(){ if (aviso && !document.getElementById('bInstalar')) pintar(); })
    .observe(document.getElementById('vList'), { childList: true });
})();

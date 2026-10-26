/* ==========================================================================
   JAC-KNES · Conexión con el servidor (app instalable)
   - Sin cuentas de Google: la app habla con un script de Google Apps Script (API_URL en config.js).
   - Cada pedido es un POST con cuerpo JSON en texto plano { pin, action, ...datos } (sin encabezados
     especiales, para que el navegador no necesite permisos extra). El PIN se revisa en el servidor.
   - El PIN se recuerda en este teléfono (localStorage) hasta que se toque «Salir».
   Expone window.Backend con la misma interfaz que usa ui.js.
   ========================================================================== */
(function(){
  'use strict';
  var CFG = window.JACKNES_CONFIG || {};
  var LS_PIN = 'jk_pin';
  var ESPERA_MS = 60000;

  function ls(k, v){ try{ if(v===undefined) return localStorage.getItem(k); if(v===null) localStorage.removeItem(k); else localStorage.setItem(k,v);}catch(e){ return null; } }
  function err(msg, code){ var e = new Error(msg); if (code) e.code = code; return e; }
  // Restos de la versión con Google (ya no se usan).
  ['jk_token','jk_email'].forEach(function(k){ ls(k, null); });

  var pin = ls(LS_PIN) || '';

  function configurada(){ var u = String(CFG.API_URL || ''); return /^https:\/\//.test(u) && u.indexOf('PEGAR_URL_AQUI') < 0; }

  /** Llama una acción de la API. Resuelve con la respuesta { ok:true, ... } o rechaza con un Error en español. */
  function llamar(action, datos, conPin){
    if (!configurada()) return Promise.reject(err('Falta configurar la app: pega la URL del servidor en config.js (API_URL).', 'CONFIG'));
    var p = conPin || pin;
    if (!p) return Promise.reject(err('Escribe el PIN para entrar.', 'PIN'));
    var cuerpo = { pin: p, action: action };
    for (var k in (datos || {})) if (Object.prototype.hasOwnProperty.call(datos, k)) cuerpo[k] = datos[k];
    var ctl = window.AbortController ? new AbortController() : null;
    var reloj = ctl ? setTimeout(function(){ ctl.abort(); }, ESPERA_MS) : null;
    return fetch(CFG.API_URL, { method: 'POST', body: JSON.stringify(cuerpo), redirect: 'follow', cache: 'no-store', signal: ctl ? ctl.signal : undefined })
      .then(function(r){
        if (!r.ok) throw err('El servidor respondió con un error (' + r.status + '). Intenta de nuevo.', 'RED');
        return r.text();
      }, function(e){
        throw err(e && e.name === 'AbortError' ? 'El servidor tardó demasiado. Intenta de nuevo.' : 'Sin conexión. Revisa el internet e intenta de nuevo.', 'RED');
      })
      .then(function(t){
        var j;
        try { j = JSON.parse(t); } catch (e) { throw err('Respuesta inesperada del servidor. Revisa que API_URL en config.js sea la URL /exec de la aplicación web.', 'RED'); }
        if (!j || !j.ok) {
          var code = (j && j.error) || 'ERROR';
          if (code === 'PIN' && !conPin) { pin = ''; ls(LS_PIN, null); }
          throw err((j && j.mensaje) || 'Error en el servidor.', code);
        }
        return j;
      })
      .then(function(j){ if (reloj) clearTimeout(reloj); return j; }, function(e){ if (reloj) clearTimeout(reloj); throw e; });
  }

  /* Las escrituras van una detrás de otra, en el orden en que se tocaron. */
  var cola = Promise.resolve();
  function enCola(fn){ var p = cola.then(fn, fn); cola = p.then(function(){}, function(){}); return p; }
  function escribir(action, datos){ return enCola(function(){ return llamar(action, datos); }); }

  /* ================================ PIN ================================ */
  function tienePin(){ return !!pin; }
  /** Revisa el PIN en el servidor; si es correcto, lo recuerda en este teléfono. */
  function entrar(p){
    p = String(p || '').replace(/\D/g, '');
    if (p.length !== 4) return Promise.reject(err('El PIN tiene 4 dígitos.', 'PIN'));
    return llamar('entrar', {}, p).then(function(){ pin = p; ls(LS_PIN, p); return true; });
  }
  function salir(){ pin = ''; ls(LS_PIN, null); }

  /* ================================ Datos ================================ */
  function getData(){ return llamar('getData').then(function(j){ return j.data; }); }
  function registrarEntrada(clienteId, tipo){ return escribir('registrarEntrada', { clienteId: clienteId, tipo: tipo }); }
  // Perros: datos = { mascota, cliente, contacto, encargado, modalidad, notas, foto, mini, forzar }
  function agregarPerro(datos){ return escribir('agregarPerro', datos); }
  function editarPerro(clienteId, datos){ var d = {}; for (var k in datos) d[k] = datos[k]; d.clienteId = clienteId; return escribir('editarPerro', d); }
  function retirarPerro(clienteId){ return escribir('retirarPerro', { clienteId: clienteId }); }
  function restaurarPerro(clienteId){ return escribir('restaurarPerro', { clienteId: clienteId }); }
  function hotelAgregar(clienteId, nombre){ return escribir('hotelAgregar', { clienteId: clienteId || '', nombre: nombre || '' }); }
  function hotelSacar(nombre){ return escribir('hotelSacar', { nombre: nombre }); }
  function getDia(fecha){ return llamar('getDia', { fecha: fecha || '' }).then(function(j){ return j.dia; }); }
  function resumenMes(anio, mes){ return llamar('resumenMes', { anio: anio, mes: mes }).then(function(j){ return j.resumen; }); }
  function registrarSalida(registroId){ return escribir('registrarSalida', { registroId: registroId }); }
  function deshacer(registroId){ return escribir('deshacer', { registroId: registroId }); }
  function getResumenMes(clienteId, anio, mes){ return llamar('getResumenMes', { clienteId: clienteId, anio: anio, mes: mes }).then(function(j){ return j.resumen; }); }
  function crearPaquete(clienteId, tipo, cantidad){ return escribir('crearPaquete', { clienteId: clienteId, tipo: tipo, cantidad: cantidad }); }
  function marcarUso(paqueteId){ return escribir('marcarUso', { paqueteId: paqueteId }); }
  function cambiarCantidad(paqueteId, cantidad){ return escribir('cambiarCantidad', { paqueteId: paqueteId, cantidad: cantidad }); }
  function subirFoto(clienteId, fotoDataUrl, miniDataUrl){ return escribir('subirFoto', { clienteId: clienteId, foto: fotoDataUrl, mini: miniDataUrl }); }
  function quitarFoto(clienteId){ return escribir('quitarFoto', { clienteId: clienteId }); }
  function getFotos(ids, tam){ return llamar('getFotos', { ids: ids, tam: tam }).then(function(j){ return j.fotos || {}; }); }

  window.Backend = {
    getData: getData, registrarEntrada: registrarEntrada, registrarSalida: registrarSalida, deshacer: deshacer,
    getResumenMes: getResumenMes, crearPaquete: crearPaquete, marcarUso: marcarUso, cambiarCantidad: cambiarCantidad,
    subirFoto: subirFoto, quitarFoto: quitarFoto, getFotos: getFotos,
    agregarPerro: agregarPerro, editarPerro: editarPerro, retirarPerro: retirarPerro, restaurarPerro: restaurarPerro,
    hotelAgregar: hotelAgregar, hotelSacar: hotelSacar, getDia: getDia, resumenMes: resumenMes,
    entrar: entrar, salir: salir, tienePin: tienePin, configurada: configurada
  };
})();

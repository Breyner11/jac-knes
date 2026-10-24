/* ==========================================================================
   JAC-KNES · Conexión con Google (app instalable)
   - Inicio de sesión: Google Identity Services (token client), sin servidor propio.
   - Datos: Google Sheets API v4 sobre la hoja «Perros – App».
   - Fotos: Google Drive API v3, carpeta «Perros – Fotos» del Drive de quien usa la app
     (permiso drive.file: la app solo ve los archivos que ella misma creó; nada se hace público).
   Expone window.Backend con la misma interfaz que la versión Apps Script.
   ========================================================================== */
(function(){
  'use strict';
  var CFG = window.JACKNES_CONFIG;
  var SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets/' + CFG.SPREADSHEET_ID;
  var DRIVE = 'https://www.googleapis.com/drive/v3/files';
  var UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
  var USERINFO = 'https://www.googleapis.com/oauth2/v3/userinfo';
  var SCOPE_SHEETS = 'https://www.googleapis.com/auth/spreadsheets';
  var SCOPE_DRIVE = 'https://www.googleapis.com/auth/drive.file';
  var TIPOS = ['Pasadía', 'Paseo campo', 'Piscina', 'Hotel'];
  var PAQ_TIPOS = ['Paseo campo', 'Piscina'];
  var H_CLIENTES = 'Clientes', H_REGISTRO = 'Registro', H_HOTEL = 'Hotel24H', H_PAQUETES = 'Paquetes';
  var CAB_PAQUETES = ['ID paquete', 'ClienteID', 'Mascota', 'Tipo', 'Cantidad', 'Fecha inicio', 'Estado', 'Nota'];
  // Columnas de Registro (0-based): A..K
  var R = { ID:0, FECHA:1, CLIENTE:2, MASCOTA:3, TIPO:4, ENTRADA:5, SALIDA:6, HORAS:7, POR:8, NOTA:9, PAQUETE:10 };
  var P = { ID:0, CLIENTE:1, MASCOTA:2, TIPO:3, CANT:4, INICIO:5, ESTADO:6, NOTA:7 };
  var FORMATO_HORA = { type:'TIME', pattern:'h:mm AM/PM' };
  var LS_TOK = 'jk_token', LS_EMAIL = 'jk_email', LS_CARPETA = 'jk_carpeta_';

  function ls(k, v){ try{ if(v===undefined) return localStorage.getItem(k); if(v===null) localStorage.removeItem(k); else localStorage.setItem(k,v);}catch(e){ return null; } }
  function err(msg, code){ var e = new Error(msg); if (code) e.code = code; return e; }
  function authErr(msg){ return err(msg || 'Necesitas entrar con Google.', 'AUTH'); }

  /* ======================= Hora de Bogotá (UTC-5, sin horario de verano) ======================= */
  function ahora(){
    var ms = Date.now(), d = new Date(ms - 5*3600000), iso = d.toISOString();
    return { ms: ms, fecha: iso.slice(0,10), hora: iso.slice(11,16), mes: iso.slice(0,7), seg: d.getUTCSeconds(),
             corto: iso.slice(2,4)+iso.slice(5,7)+iso.slice(8,10)+iso.slice(11,13)+iso.slice(14,16)+iso.slice(17,19) };
  }
  // Texto visible de una celda de hora -> 'HH:mm'. Acepta '4:32 PM', '4:32 p. m.', '16:32', '4:32:00 p.m.'.
  function hora24(v){
    var s = String(v == null ? '' : v).trim().toLowerCase();
    var m = /(\d{1,2}):(\d{2})(?::\d{2})?\s*(?:([ap])\.?\s*m\.?)?/.exec(s);
    if (!m) return '';
    var h = +m[1], ap = m[3] || '';
    if (ap === 'p' && h < 12) h += 12;
    if (ap === 'a' && h === 12) h = 0;
    return (h < 10 ? '0' : '') + h + ':' + m[2];
  }
  function hora12(s){ var m=/^(\d{1,2}):(\d{2})/.exec(String(s||'')); if(!m) return String(s||''); var h=+m[1]; return ((h%12)||12)+':'+m[2]+' '+(h<12?'AM':'PM'); }
  function serialHora(t){ var p = t.hora.split(':'); return (+p[0]*3600 + +p[1]*60) / 86400; }
  function calcHoras(fecha, horaEntrada, msSalida){
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha), h = /^(\d{1,2}):(\d{2})/.exec(horaEntrada);
    if (!m || !h) return '';
    var ent = Date.UTC(+m[1], +m[2]-1, +m[3], +h[1]+5, +h[2]);
    msSalida = Math.floor(msSalida / 60000) * 60000; // ambas horas a minuto exacto, como se ven
    return Math.max(0, Math.round((msSalida - ent) / 36000) / 100);
  }
  function txt(v){ return v == null ? '' : String(v).trim(); }
  function fechaTxt(v){
    var s = txt(v), m;
    if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s))) return m[3]+'-'+('0'+m[2]).slice(-2)+'-'+('0'+m[1]).slice(-2);
    if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s))) return m[1]+'-'+('0'+m[2]).slice(-2)+'-'+('0'+m[3]).slice(-2);
    return s;
  }
  function num(v){ var s = txt(v).replace(/\s/g,''); if (!s) return ''; if (/,\d+$/.test(s)) s = s.replace(/\./g,'').replace(',', '.'); var n = parseFloat(s); return isNaN(n) ? '' : n; }
  function tipoNorm(t){ t = txt(t); return /^paseo$/i.test(t) ? 'Paseo campo' : t; }
  function nuevoId(pref){ return pref + ahora().corto + Math.floor(Math.random()*900 + 100); }
  function fotoId(v){
    var s = txt(v); if (!s) return '';
    var m = /\/d\/([-\w]{20,})/.exec(s) || /[?&]id=([-\w]{20,})/.exec(s) || /^([-\w]{20,})$/.exec(s);
    return m ? m[1] : '';
  }

  /* ================================ Sesión de Google ================================ */
  var tok = null, email = ls(LS_EMAIL) || '', cliente = null, pendiente = null, resolver = null;
  try { tok = JSON.parse(ls(LS_TOK) || 'null'); } catch (e) { tok = null; }
  function tokValido(margen){ return tok && tok.t && tok.exp - Date.now() > (margen || 30000); }
  function guardarTok(){ ls(LS_TOK, tok ? JSON.stringify(tok) : null); }
  function gisListo(){
    return !!(window.google && google.accounts && google.accounts.oauth2);
  }
  function esperarGis(ms){
    return new Promise(function(res){
      var t0 = Date.now();
      (function mirar(){ if (gisListo() || Date.now()-t0 > ms) res(gisListo()); else setTimeout(mirar, 100); })();
    });
  }
  function clienteGis(){
    if (cliente) return cliente;
    if (/^PENDIENTE/.test(CFG.CLIENT_ID)) throw err('Falta configurar el CLIENT_ID de Google en config.js.');
    cliente = google.accounts.oauth2.initTokenClient({
      client_id: CFG.CLIENT_ID,
      scope: CFG.SCOPES.join(' '),
      include_granted_scopes: true,
      callback: function(resp){
        var r = resolver; resolver = null; if (!r) return;
        if (!resp || resp.error || !resp.access_token) return r.rej(authErr(resp && resp.error === 'access_denied' ? 'No se concedió el acceso a Google.' : 'No se pudo entrar con Google.'));
        if (google.accounts.oauth2.hasGrantedAllScopes && !google.accounts.oauth2.hasGrantedAllScopes(resp, SCOPE_SHEETS))
          return r.rej(authErr('Para usar la app hay que permitir el acceso a Hojas de cálculo de Google.'));
        tok = { t: resp.access_token, exp: Date.now() + (Number(resp.expires_in || 3599) - 60) * 1000,
                fotos: !google.accounts.oauth2.hasGrantedAllScopes || google.accounts.oauth2.hasGrantedAllScopes(resp, SCOPE_DRIVE) };
        guardarTok();
        r.res(tok.t);
      },
      error_callback: function(e){
        var r = resolver; resolver = null; if (!r) return;
        var t = e && e.type;
        r.rej(authErr(t === 'popup_closed' ? 'Se cerró la ventana de Google antes de terminar.' :
                      t === 'popup_failed_to_open' ? 'Toca «Entrar con Google» para continuar.' : 'No se pudo entrar con Google.'));
      }
    });
    return cliente;
  }
  // modo: 'silencioso' (sin elegir cuenta si ya dio permiso) | 'elegir' (elegir otra cuenta)
  function pedirToken(modo){
    if (pendiente) return pendiente;
    if (!gisListo()) return esperarGis(8000).then(function(ok){
      if (!ok) throw authErr('No se pudo cargar el inicio de sesión de Google. Revisa tu conexión.');
      return pedirToken(modo);
    });
    pendiente = new Promise(function(res, rej){
      resolver = { res: res, rej: rej };
      var opts = { prompt: modo === 'elegir' ? 'select_account' : (email ? '' : 'consent') };
      if (email && modo !== 'elegir') opts.login_hint = email;
      try { clienteGis().requestAccessToken(opts); }
      catch (e) { resolver = null; rej(e.code ? e : authErr(e.message)); }
      setTimeout(function(){ if (resolver && resolver.res === res) { resolver = null; rej(authErr('Google no respondió. Intenta de nuevo.')); } }, 120000);
    });
    var p = pendiente;
    p.then(function(){ pendiente = null; }, function(){ pendiente = null; });
    return p.then(function(t){ return email ? t : cargarEmail().then(function(){ return t; }); });
  }
  function cargarEmail(){
    return fetch(USERINFO, { headers: { Authorization: 'Bearer ' + tok.t } })
      .then(function(r){ return r.ok ? r.json() : {}; })
      .then(function(u){ if (u && u.email) { email = u.email; ls(LS_EMAIL, email); } })
      .catch(function(){});
  }
  // Token vigente: el guardado, o uno nuevo sin molestar (solo si ya entró antes en este teléfono).
  function token(){
    if (tokValido()) return Promise.resolve(tok.t);
    if (!email) return Promise.reject(authErr());
    return pedirToken('silencioso');
  }
  // Renovación silenciosa aprovechando un toque (los navegadores solo dejan abrir la ventanita de Google así).
  document.addEventListener('click', function(){
    if (email && !pendiente && gisListo() && !tokValido(5*60000)) { pedirToken('silencioso').catch(function(){}); }
  }, true);

  /* ================================ HTTP ================================ */
  function api(method, url, body, opciones){
    opciones = opciones || {};
    return token().then(function(t){ return enviar(t); }).then(function(r){
      if (r.status !== 401) return r;
      // Token vencido o revocado: se intenta renovar una vez.
      tok = null; guardarTok();
      return token().then(enviar);
    }).then(function(r){
      if (r.status === 401) { tok = null; guardarTok(); throw authErr('Tu sesión de Google se cerró.'); }
      if (!r.ok) return r.text().then(function(txt){ throw errorApi(r.status, txt, opciones); });
      if (opciones.blob) return r.blob();
      return r.status === 204 ? {} : r.json();
    });
    function enviar(t){
      var h = { Authorization: 'Bearer ' + t };
      var init = { method: method, headers: h };
      if (body instanceof Blob) { init.body = body; h['Content-Type'] = opciones.tipo; }
      else if (body !== undefined) { init.body = JSON.stringify(body); h['Content-Type'] = 'application/json; charset=UTF-8'; }
      return fetch(url, init);
    }
  }
  function errorApi(status, cuerpo, opciones){
    var m = ''; try { m = JSON.parse(cuerpo).error.message; } catch (e) { m = String(cuerpo || '').slice(0, 200); }
    if (opciones.hoja && (status === 403 || status === 404))
      return err('SIN_ACCESO: Tu cuenta (' + (email || 'sin correo') + ') no tiene acceso a la hoja «Perros – App». Pide que te la compartan como Editor.');
    if (status === 403 && /insufficient|scope/i.test(m)) return authErr('Falta un permiso de Google. Vuelve a entrar y acepta todos los permisos.');
    if (status === 429) return err('Google está ocupado. Intenta de nuevo en unos segundos.');
    var e = err('Error de Google (' + status + '): ' + m); e.status = status; return e;
  }
  // Una sola escritura a la vez (evita choques entre toques rápidos).
  var cola = Promise.resolve();
  function enCola(fn){ var p = cola.then(fn, fn); cola = p.catch(function(){}); return p; }

  /* ================================ Hoja de cálculo ================================ */
  var meta = null; // { 'Clientes': sheetId, ... }
  function cargarMeta(){
    return api('GET', SHEETS + '?fields=sheets.properties(sheetId,title)', undefined, { hoja: true }).then(function(r){
      meta = {}; (r.sheets || []).forEach(function(s){ meta[s.properties.title] = s.properties.sheetId; });
      if (!(H_CLIENTES in meta) || !(H_REGISTRO in meta)) throw err('A la hoja «Perros – App» le faltan las pestañas Clientes o Registro.');
      if (H_PAQUETES in meta) return meta;
      // Crea la pestaña «Paquetes» si no existe.
      var id = 100000 + Math.floor(Math.random() * 1e9);
      return batch([
        { addSheet: { properties: { sheetId: id, title: H_PAQUETES, gridProperties: { frozenRowCount: 1 } } } },
        { updateCells: { start: { sheetId: id, rowIndex: 0, columnIndex: 0 }, rows: [fila(CAB_PAQUETES)], fields: 'userEnteredValue' } }
      ]).then(function(){ meta[H_PAQUETES] = id; return meta; });
    });
  }
  function batch(requests){ return api('POST', SHEETS + ':batchUpdate', { requests: requests }, { hoja: true }); }
  function celda(v){
    if (v && v.hora !== undefined) return { userEnteredValue: { numberValue: v.hora }, userEnteredFormat: { numberFormat: FORMATO_HORA } };
    if (v === '' || v == null) return {};
    if (typeof v === 'number') return { userEnteredValue: { numberValue: v } };
    return { userEnteredValue: { stringValue: String(v) } };
  }
  function fila(vals){ return { values: vals.map(celda) }; }
  function anexar(hoja, vals){
    return batch([{ appendCells: { sheetId: meta[hoja], rows: [fila(vals)], fields: 'userEnteredValue,userEnteredFormat.numberFormat' } }]);
  }
  function escribir(hoja, filaIdx, col, vals){
    return { updateCells: { start: { sheetId: meta[hoja], rowIndex: filaIdx, columnIndex: col }, rows: [fila(vals)], fields: 'userEnteredValue,userEnteredFormat.numberFormat' } };
  }
  // Busca la fila (0-based) de un ID en la columna A, leyendo la hoja en ese momento.
  function buscarFila(hoja, id){
    return api('GET', SHEETS + '/values/' + encodeURIComponent(hoja + '!A:A'), undefined, { hoja: true }).then(function(r){
      var v = r.values || [];
      for (var i = v.length - 1; i >= 1; i--) if (txt(v[i] && v[i][0]) === id) return i;
      return -1;
    });
  }
  var cache = null; // última lectura completa
  function leer(){
    var pre = meta ? Promise.resolve(meta) : cargarMeta();
    return pre.then(function(){
      var hojas = [H_CLIENTES, H_REGISTRO, H_PAQUETES].concat(H_HOTEL in meta ? [H_HOTEL] : []);
      var q = hojas.map(function(h){ return 'ranges=' + encodeURIComponent(h); }).join('&');
      return api('GET', SHEETS + '/values:batchGet?' + q + '&valueRenderOption=FORMATTED_VALUE', undefined, { hoja: true })
        .catch(function(e){ meta = null; throw e; });
    }).then(function(r){
      var vr = r.valueRanges || [], porHoja = {};
      vr.forEach(function(x){ porHoja[String(x.range).split('!')[0].replace(/^'|'$/g, '')] = x.values || []; });
      cache = {
        clientes: leerClientes(porHoja[H_CLIENTES] || []),
        registros: leerRegistros(porHoja[H_REGISTRO] || []),
        paquetes: leerPaquetes(porHoja[H_PAQUETES] || []),
        hotel: leerHotel(porHoja[H_HOTEL] || [])
      };
      var cab = (porHoja[H_REGISTRO] || [])[0] || [];
      if (txt(cab[R.PAQUETE]) !== 'Paquete') return batch([escribir(H_REGISTRO, 0, R.PAQUETE, ['Paquete'])]).then(function(){ return cache; });
      return cache;
    });
  }
  function leerClientes(vals){
    var head = (vals[0] || []).map(txt), ix = function(n){ return head.indexOf(n); };
    var c = { id:ix('ID'), cliente:ix('Cliente'), mascota:ix('Mascota'), direccion:ix('Dirección'), correo:ix('Correo'),
              identificacion:ix('Identificación'), contacto:ix('Contacto'), modalidad:ix('Modalidad'), encargado:ix('Encargado'),
              activo:ix('Activo'), notas:ix('Notas'), foto:ix('Foto') };
    var g = function(r, k){ return c[k] < 0 ? '' : txt(r[c[k]]); };
    var out = [];
    vals.slice(1).forEach(function(r, i){
      var id = g(r, 'id'); if (!id) return;
      var activo = c.activo < 0 ? 'Sí' : g(r, 'activo');
      if (activo && !/^s[ií]$/i.test(activo)) return;
      out.push({ id:id, cliente:g(r,'cliente'), mascota:g(r,'mascota'), direccion:g(r,'direccion'), correo:g(r,'correo'),
        identificacion:g(r,'identificacion'), contacto:g(r,'contacto'), modalidad:g(r,'modalidad'), encargado:g(r,'encargado'),
        notas:g(r,'notas'), foto:fotoId(g(r,'foto')), fila:i+1 });
    });
    return out;
  }
  function leerRegistros(vals){
    return vals.slice(1).map(function(r, i){
      return { fila:i+1, id:txt(r[R.ID]), fecha:fechaTxt(r[R.FECHA]), clienteId:txt(r[R.CLIENTE]), mascota:txt(r[R.MASCOTA]),
        tipo:tipoNorm(r[R.TIPO]), entrada:hora24(r[R.ENTRADA]), salida:hora24(r[R.SALIDA]), horas:num(r[R.HORAS]),
        por:txt(r[R.POR]), nota:txt(r[R.NOTA]), paquete:txt(r[R.PAQUETE]) };
    }).filter(function(x){ return x.id; });
  }
  function leerPaquetes(vals){
    return vals.slice(1).map(function(r, i){
      return { fila:i+1, id:txt(r[P.ID]), clienteId:txt(r[P.CLIENTE]), mascota:txt(r[P.MASCOTA]), tipo:tipoNorm(r[P.TIPO]),
        cantidad:Number(num(r[P.CANT])) || 0, inicio:fechaTxt(r[P.INICIO]), estado:txt(r[P.ESTADO]) || 'Activo', nota:txt(r[P.NOTA]) };
    }).filter(function(x){ return x.id; });
  }
  function leerHotel(vals){
    var out = [];
    vals.slice(1).forEach(function(r){ r.forEach(function(v){ txt(v).split(/\s*;\s*/).forEach(function(n){ if (n) out.push(n); }); }); });
    return out;
  }
  function limpio(o){ var c = {}; for (var k in o) if (k !== 'fila') c[k] = o[k]; return c; }
  function armarDatos(d){
    var t = ahora();
    var actuales = {};
    PAQ_TIPOS.forEach(function(tp){
      var ult = {};
      d.paquetes.forEach(function(p){ if (p.tipo === tp) ult[p.clienteId] = p; });
      Object.keys(ult).forEach(function(k){ if (ult[k].estado !== 'Cerrado') actuales[ult[k].id] = 1; });
    });
    return {
      hoy: t.fecha, hora: t.hora, mes: t.mes,
      clientes: d.clientes.map(limpio),
      registros: d.registros.filter(function(r){
        return r.fecha.slice(0,7) === t.mes || (r.tipo === 'Hotel' && !r.salida) || (r.paquete && actuales[r.paquete]);
      }).map(limpio),
      paquetes: d.paquetes.map(limpio),
      hotel: d.hotel, tipos: TIPOS, usuario: email
    };
  }
  function getData(){ return leer().then(armarDatos); }
  function respuesta(o){ return leer().then(function(d){ o.ok = true; o.data = armarDatos(d); return o; }); }
  function clienteDe(d, id){ var c = d.clientes.filter(function(x){ return x.id === id; })[0]; if (!c) throw err('Cliente no encontrado: ' + id); return c; }

  /* ================================ Registros ================================ */
  function filaRegistro(id, t, c, tipo, nota, paquete){
    return [id, t.fecha, c.id, c.mascota, tipo, { hora: serialHora(t) }, '', '', email, nota || '', paquete || ''];
  }
  function registrarEntrada(clienteId, tipo){
    tipo = tipoNorm(tipo);
    if (TIPOS.indexOf(tipo) < 0) return Promise.reject(err('Tipo no válido: ' + tipo));
    return enCola(function(){
      return leer().then(function(d){
        var c = clienteDe(d, clienteId), t = ahora();
        var rs = d.registros.filter(function(r){ return r.clienteId === clienteId; });
        var ab = rs.filter(function(r){ return r.tipo === 'Hotel' && !r.salida; })[0];
        if (ab && (tipo === 'Hotel' || tipo === 'Pasadía'))
          throw err(c.mascota + ' está en hotel desde las ' + hora12(ab.entrada) + '. Registra la salida primero.');
        if (tipo === 'Pasadía') {
          var ya = rs.filter(function(r){ return r.tipo === 'Pasadía' && r.fecha === t.fecha; })[0];
          if (ya) throw err(c.mascota + ' ya vino hoy a las ' + hora12(ya.entrada) + '.');
        }
        var id = nuevoId('R');
        return anexar(H_REGISTRO, filaRegistro(id, t, c, tipo, PAQ_TIPOS.indexOf(tipo) >= 0 ? 'Sin paquete' : '')).then(function(){
          var msg = tipo === 'Hotel' ? 'Entrada de ' + c.mascota + ' al hotel a las ' + hora12(t.hora)
                  : tipo === 'Pasadía' ? c.mascota + ' llegó a pasadía a las ' + hora12(t.hora)
                  : tipo + ' de ' + c.mascota + ' registrado a las ' + hora12(t.hora);
          return respuesta({ registroId: id, mensaje: msg });
        });
      });
    });
  }
  function registrarSalida(registroId){
    return enCola(function(){
      return leer().then(function(d){
        var r = d.registros.filter(function(x){ return x.id === registroId; })[0];
        if (!r) throw err('Registro no encontrado.');
        if (r.salida) throw err('Este registro ya tiene salida.');
        var t = ahora();
        return buscarFila(H_REGISTRO, registroId).then(function(f){
          if (f < 0) throw err('Registro no encontrado.');
          return batch([escribir(H_REGISTRO, f, R.SALIDA, [{ hora: serialHora(t) }, calcHoras(r.fecha, r.entrada, t.ms)])]);
        }).then(function(){ return respuesta({ registroId: registroId, mensaje: 'Salida de ' + r.mascota + ' a las ' + hora12(t.hora) }); });
      });
    });
  }
  function deshacer(registroId){
    return enCola(function(){
      return leer().then(function(d){
        var r = d.registros.filter(function(x){ return x.id === registroId; })[0];
        if (!r) throw err('Registro no encontrado.');
        return buscarFila(H_REGISTRO, registroId).then(function(f){
          if (f < 0) throw err('Registro no encontrado.');
          if (r.salida) return batch([escribir(H_REGISTRO, f, R.SALIDA, ['', ''])]).then(function(){ return 'Se deshizo la salida de ' + r.mascota; });
          return batch([{ deleteDimension: { range: { sheetId: meta[H_REGISTRO], dimension: 'ROWS', startIndex: f, endIndex: f + 1 } } }])
            .then(function(){
              if (!r.paquete) return r.tipo === 'Pasadía' ? 'Se eliminó la llegada de ' + r.mascota : 'Se eliminó el registro de ' + r.mascota;
              var p = d.paquetes.filter(function(x){ return x.id === r.paquete; })[0];
              var pasos = p && p.estado === 'Completo' ? estadoPaquete(p.id, 'Activo') : Promise.resolve();
              return pasos.then(function(){ return 'Se desmarcó la sesión de ' + r.mascota; });
            });
        });
      }).then(function(msg){ return respuesta({ mensaje: msg }); });
    });
  }
  function getResumenMes(clienteId, anio, mes){
    var pref = anio + '-' + ('0' + mes).slice(-2);
    return leer().then(function(d){
      var regs = d.registros.filter(function(r){ return r.clienteId === clienteId && r.fecha.slice(0,7) === pref; }).map(limpio);
      var dias = {}, horas = 0, porTipo = {};
      regs.forEach(function(r){ dias[r.fecha] = 1; if (typeof r.horas === 'number') horas += r.horas; porTipo[r.tipo] = (porTipo[r.tipo] || 0) + 1; });
      return { clienteId: clienteId, mes: pref, dias: Object.keys(dias).length, horas: Math.round(horas*100)/100, porTipo: porTipo, registros: regs };
    });
  }

  /* ================================ Paquetes ================================ */
  function estadoPaquete(paqueteId, estado){
    return buscarFila(H_PAQUETES, paqueteId).then(function(f){ if (f >= 0) return batch([escribir(H_PAQUETES, f, P.ESTADO, [estado])]); });
  }
  function actualDe(d, clienteId, tipo){
    var ps = d.paquetes.filter(function(p){ return p.clienteId === clienteId && p.tipo === tipo; });
    var p = ps[ps.length - 1];
    return p && p.estado !== 'Cerrado' ? p : null;
  }
  function usos(d, p){ return d.registros.filter(function(r){ return r.paquete === p.id; }).length; }
  function crearPaquete(clienteId, tipo, cantidad){
    tipo = tipoNorm(tipo); cantidad = Math.round(Number(cantidad));
    if (PAQ_TIPOS.indexOf(tipo) < 0) return Promise.reject(err('Los paquetes son solo para Paseo campo y Piscina.'));
    if (!(cantidad >= 1 && cantidad <= 60)) return Promise.reject(err('La cantidad debe estar entre 1 y 60.'));
    return enCola(function(){
      return leer().then(function(d){
        var c = clienteDe(d, clienteId), t = ahora(), ant = actualDe(d, clienteId, tipo);
        var cerrar = ant && usos(d, ant) < ant.cantidad ? estadoPaquete(ant.id, 'Cerrado') : Promise.resolve();
        var id = nuevoId('P');
        return cerrar.then(function(){ return anexar(H_PAQUETES, [id, c.id, c.mascota, tipo, cantidad, t.fecha, 'Activo', '']); })
          .then(function(){ return respuesta({ paqueteId: id, mensaje: 'Paquete de ' + cantidad + ' (' + tipo + ') para ' + c.mascota }); });
      });
    });
  }
  function marcarUso(paqueteId){
    return enCola(function(){
      return leer().then(function(d){
        var p = d.paquetes.filter(function(x){ return x.id === paqueteId; })[0];
        if (!p) throw err('Paquete no encontrado.');
        if (p.estado === 'Cerrado') throw err('Ese paquete ya está cerrado.');
        var c = clienteDe(d, p.clienteId), u = usos(d, p);
        if (u >= p.cantidad) throw err('El paquete ya está completo. Empieza uno nuevo.');
        var t = ahora(), id = nuevoId('R'), n = u + 1;
        return anexar(H_REGISTRO, filaRegistro(id, t, c, p.tipo, 'Paquete · sesión ' + n + ' de ' + p.cantidad, p.id))
          .then(function(){ return n >= p.cantidad ? estadoPaquete(p.id, 'Completo') : null; })
          .then(function(){
            var q = p.cantidad - n;
            return respuesta({ registroId: id, mensaje: p.tipo + ' de ' + c.mascota + ': sesión ' + n + ' de ' + p.cantidad + (q ? ' · quedan ' + q : ' · paquete completo') });
          });
      });
    });
  }
  function cambiarCantidad(paqueteId, cantidad){
    cantidad = Math.round(Number(cantidad));
    return enCola(function(){
      return leer().then(function(d){
        var p = d.paquetes.filter(function(x){ return x.id === paqueteId; })[0];
        if (!p) throw err('Paquete no encontrado.');
        var u = usos(d, p);
        if (!(cantidad >= 1 && cantidad <= 60)) throw err('La cantidad debe estar entre 1 y 60.');
        if (cantidad < u) throw err('Ya se usaron ' + u + ' sesiones; la cantidad no puede ser menor.');
        return buscarFila(H_PAQUETES, paqueteId).then(function(f){
          if (f < 0) throw err('Paquete no encontrado.');
          return batch([escribir(H_PAQUETES, f, P.CANT, [cantidad]), escribir(H_PAQUETES, f, P.ESTADO, [u >= cantidad ? 'Completo' : 'Activo'])]);
        }).then(function(){ return respuesta({ mensaje: 'Paquete de ' + p.mascota + ': ahora ' + cantidad + ' sesiones' }); });
      });
    });
  }

  /* ================================ Fotos (Drive) ================================ */
  function carpeta(){
    var k = LS_CARPETA + email, id = ls(k);
    var verificar = id ? api('GET', DRIVE + '/' + id + '?fields=id,trashed').then(function(f){ return f && !f.trashed ? f.id : null; }, function(){ return null; }) : Promise.resolve(null);
    return verificar.then(function(ok){
      if (ok) return ok;
      var q = "name='" + CFG.CARPETA_FOTOS.replace(/'/g, "\\'") + "' and mimeType='application/vnd.google-apps.folder' and trashed=false";
      return api('GET', DRIVE + '?q=' + encodeURIComponent(q) + '&fields=files(id)&spaces=drive').then(function(r){
        if (r.files && r.files[0]) return r.files[0].id;
        return api('POST', DRIVE + '?fields=id', { name: CFG.CARPETA_FOTOS, mimeType: 'application/vnd.google-apps.folder' }).then(function(f){ return f.id; });
      }).then(function(nuevo){ ls(k, nuevo); return nuevo; });
    });
  }
  function blobDe(dataUrl){
    var m = /^data:([^;]+);base64,(.*)$/.exec(dataUrl || '');
    if (!m) throw err('Imagen no válida.');
    var bin = atob(m[2]), a = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    return new Blob([a], { type: m[1] });
  }
  function subirArchivo(blob, metadatos){
    var b = 'jk' + Date.now() + Math.random().toString(16).slice(2);
    var cuerpo = new Blob(['--' + b + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(metadatos) +
      '\r\n--' + b + '\r\nContent-Type: ' + (blob.type || 'image/jpeg') + '\r\n\r\n', blob, '\r\n--' + b + '--'], { type: 'multipart/related; boundary=' + b });
    return api('POST', UPLOAD + '?uploadType=multipart&fields=id', cuerpo, { tipo: 'multipart/related; boundary=' + b }).then(function(f){ return f.id; });
  }
  function papelera(fullId){
    if (!fullId) return Promise.resolve();
    return api('GET', DRIVE + '/' + fullId + '?fields=appProperties').then(function(f){
      var ids = [fullId]; if (f.appProperties && f.appProperties.mini) ids.push(f.appProperties.mini);
      return Promise.all(ids.map(function(id){ return api('PATCH', DRIVE + '/' + id + '?fields=id', { trashed: true }).catch(function(){}); }));
    }).catch(function(){ /* de otra cuenta o ya borrada */ });
  }
  function escribirFoto(clienteId, valor){
    return api('GET', SHEETS + '/values/' + encodeURIComponent(H_CLIENTES + '!1:1'), undefined, { hoja: true }).then(function(r){
      var col = ((r.values || [])[0] || []).map(txt).indexOf('Foto');
      if (col < 0) throw err('Falta la columna «Foto» en la pestaña Clientes.');
      return buscarFila(H_CLIENTES, clienteId).then(function(f){
        if (f < 0) throw err('Cliente no encontrado: ' + clienteId);
        return batch([escribir(H_CLIENTES, f, col, [valor])]);
      });
    });
  }
  function subirFoto(clienteId, grandeDataUrl, miniDataUrl){
    return (cache ? Promise.resolve(cache) : leer()).then(function(d){
      var c = clienteDe(d, clienteId), nombre = clienteId + ' ' + (c.mascota || 'perro');
      if (tok && tok.fotos === false) throw authErr('Para guardar fotos hay que permitir el acceso a Google Drive. Vuelve a entrar y acepta todos los permisos.');
      var grande = blobDe(grandeDataUrl), mini = blobDe(miniDataUrl);
      return carpeta().then(function(dir){
        return subirArchivo(mini, { name: nombre + ' (mini).jpg', parents: [dir], mimeType: 'image/jpeg' }).then(function(miniId){
          return subirArchivo(grande, { name: nombre + '.jpg', parents: [dir], mimeType: 'image/jpeg', appProperties: { mini: miniId, cliente: clienteId } });
        });
      }).then(function(fullId){
        return enCola(function(){
          return leer().then(function(d2){
            var ant = clienteDe(d2, clienteId).foto;
            return escribirFoto(clienteId, fullId).then(function(){ if (ant && ant !== fullId) return papelera(ant); });
          }).then(function(){ return respuesta({ fotoId: fullId, mensaje: 'Foto de ' + c.mascota + ' guardada' }); });
        });
      });
    });
  }
  function quitarFoto(clienteId){
    return enCola(function(){
      return leer().then(function(d){
        var c = clienteDe(d, clienteId), ant = c.foto;
        return escribirFoto(clienteId, '').then(function(){ return papelera(ant); })
          .then(function(){ return respuesta({ mensaje: 'Foto eliminada' }); });
      });
    });
  }
  function aDataUrl(blob){
    return new Promise(function(res, rej){ var fr = new FileReader(); fr.onload = function(){ res(fr.result); }; fr.onerror = rej; fr.readAsDataURL(blob); });
  }
  // Fotos privadas: se descargan con el token y se muestran como blob/data URL (nunca enlaces públicos).
  function getFotos(ids, tam){
    var out = {}, lista = (ids || []).filter(function(id){ return /^[-\w]{20,}$/.test(String(id)); }).slice(0, 30), i = 0;
    function una(id){
      var archivo = tam === 'mini'
        ? api('GET', DRIVE + '/' + id + '?fields=appProperties').then(function(f){ return (f.appProperties && f.appProperties.mini) || id; })
        : Promise.resolve(id);
      return archivo.then(function(fid){ return api('GET', DRIVE + '/' + fid + '?alt=media', undefined, { blob: true }); })
        .then(function(b){ return tam === 'mini' ? aDataUrl(b) : URL.createObjectURL(b); })
        .then(function(src){ out[id] = src; }, function(e){ if (e && e.code === 'AUTH') throw e; });
    }
    function trabajador(){ if (i >= lista.length) return Promise.resolve(); return una(lista[i++]).then(trabajador); }
    return Promise.all([trabajador(), trabajador(), trabajador(), trabajador()]).then(function(){ return out; });
  }

  /* ================================ Entrar / salir ================================ */
  function login(){ return pedirToken(email ? 'silencioso' : 'consent').then(function(){ meta = null; }); }
  function otraCuenta(){ email = ''; ls(LS_EMAIL, null); tok = null; guardarTok(); meta = null; return pedirToken('elegir'); }
  function salir(){
    try { if (tok && tok.t && gisListo()) google.accounts.oauth2.revoke(tok.t, function(){}); } catch (e) {}
    tok = null; guardarTok(); email = ''; ls(LS_EMAIL, null); meta = null; cache = null;
  }

  window.Backend = {
    getData: getData, registrarEntrada: registrarEntrada, registrarSalida: registrarSalida, deshacer: deshacer,
    getResumenMes: getResumenMes, crearPaquete: crearPaquete, marcarUso: marcarUso, cambiarCantidad: cambiarCantidad,
    subirFoto: subirFoto, quitarFoto: quitarFoto, getFotos: getFotos,
    login: login, otraCuenta: otraCuenta, salir: salir,
    _util: { hora24: hora24, hora12: hora12, calcHoras: calcHoras, ahora: ahora }
  };
})();

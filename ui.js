/* ==========================================================================
   JAC-KNES · Interfaz de la app instalable
   Necesita window.Backend con: getData, registrarEntrada, registrarSalida, deshacer,
   crearPaquete, marcarUso, cambiarCantidad, getResumenMes, subirFoto, quitarFoto,
   getFotos, agregarPerro, editarPerro, retirarPerro, restaurarPerro, hotelAgregar,
   hotelSacar, getDia, resumenMes, entrar(pin), salir, tienePin.
   Se entra con un PIN de 4 dígitos (lo revisa el servidor); no hay cuentas de Google.
   Todas las horas internas van en 'HH:mm' (24 h) y SIEMPRE se muestran en 12 h (AM/PM).
   ========================================================================== */
(function(){
  'use strict';
  var B = window.Backend;
  var REFRESH_MS = 45000, LS_MINI = 'perros_mini_';
  var PAQ_TIPOS = ['Paseo campo','Piscina'];
  var CHIPS = [4,5,6,7];
  var state = { data:null, q:'', sel:null, tipo:'Pasadía', busy:false, lastUndoId:null,
                mesVer:null, resumen:{}, cant:5, nuevoPaq:false, editPaq:false,
                modo:'', volver:'vList', dia:null, diaData:null, mesR:null, mesData:null, form:null, h24q:'' };
  var minis = {}, grandes = {}, pedidos = {}, fallidos = {};
  var $ = function(id){ return document.getElementById(id); };
  if (window.LOGO_SRC) Array.prototype.forEach.call(document.querySelectorAll('img.logo'), function(i){ i.src = window.LOGO_SRC; });
  if (window.ICON_SRC) Array.prototype.forEach.call(document.querySelectorAll('img.mini-logo'), function(i){ i.src = window.ICON_SRC; });

  function ls(k, v){ try{ if(v===undefined) return localStorage.getItem(k); if(v===null) localStorage.removeItem(k); else localStorage.setItem(k,v);}catch(e){ return null; } }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function norm(s){ return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); }
  function call(fn){
    var args = Array.prototype.slice.call(arguments,1);
    return Promise.resolve().then(function(){ return B[fn].apply(B, args); });
  }
  function esPin(e){ return e && e.code === 'PIN'; }

  function show(id){ ['vStart','vList','vDet','vHoy','vMes','vForm','vHotel'].forEach(function(v){ $(v).classList.toggle('hidden', v!==id); }); window.scrollTo(0,0); }
  function loading(on){ $('loading').classList.toggle('hidden',!on); }
  var toastT;
  function toast(msg, undoId){
    $('toastMsg').textContent = msg; state.lastUndoId = undoId||null;
    $('toastUndo').classList.toggle('hidden', !undoId);
    $('toast').classList.remove('hidden'); clearTimeout(toastT);
    toastT = setTimeout(function(){ $('toast').classList.add('hidden'); state.lastUndoId=null; }, undoId?8000:3500);
  }
  function mensajeError(e){
    var m = (e && e.message) || String(e||'Error');
    m = m.replace(/^Error:\s*/,'');
    if (/SIN_ACCESO/.test(m)) return m.replace(/^SIN_ACCESO:\s*/,'');
    return m;
  }

  /* ----------- Fechas y horas ----------- */
  var DIAS = ['dom','lun','mar','mié','jue','vie','sáb'];
  var MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  // 'HH:mm' (24 h, interno) -> '4:32 PM'
  function h12(s){ var m=/^(\d{1,2}):(\d{2})/.exec(String(s||'')); if(!m) return String(s||''); var h=+m[1]; return ((h%12)||12)+':'+m[2]+' '+(h<12?'AM':'PM'); }
  function fechaCorta(f){ var p=String(f).split('-'); var dt=new Date(+p[0],+p[1]-1,+p[2]); return DIAS[dt.getDay()]+' '+(+p[2]); }
  function fechaLarga(f){ var p=String(f).split('-'); return fechaCorta(f)+' '+MESES[+p[1]-1].slice(0,3); }
  function nombreMes(ym){ var p=ym.split('-'); return MESES[+p[1]-1]+' '+p[0]; }
  function mesMas(ym, n){ var p=ym.split('-'), y=+p[0], m=+p[1]-1+n; y+=Math.floor(m/12); m=((m%12)+12)%12; return y+'-'+('0'+(m+1)).slice(-2); }
  function telLimpio(t){ return String(t||'').replace(/\D/g,''); }
  function waNum(t){ var n=telLimpio(t); if(n.length===12 && n.indexOf('57')===0) return n; return '57'+n; }
  function cliente(id){ return state.data.clientes.filter(function(x){ return x.id===id; })[0]; }
  function porFecha(a,b){ return (a.fecha+' '+a.entrada).localeCompare(b.fecha+' '+b.entrada); }
  function porFechaDesc(a,b){ return -porFecha(a,b); }

  /* ----------- Cálculos ----------- */
  function regsDe(id){ return (state.data.registros||[]).filter(function(r){ return r.clienteId===id; }); }
  function hotelAbierto(id){ return regsDe(id).filter(function(r){ return r.tipo==='Hotel' && !r.salida; }).sort(porFechaDesc)[0]; }
  function pasadiaHoy(id){ var hoy=state.data.hoy; return regsDe(id).filter(function(r){ return r.tipo==='Pasadía' && r.fecha===hoy; }).sort(porFechaDesc)[0]; }
  function estado(id){
    var rs = regsDe(id), hoy = state.data.hoy;
    var ab = hotelAbierto(id);
    if (ab) return { cls:'in', txt:'En hotel ahora', sub:'Desde '+h12(ab.entrada)+(ab.fecha!==hoy?' ('+fechaCorta(ab.fecha)+')':''), abierto:ab };
    var deHoy = rs.filter(function(r){ return r.fecha===hoy; }).sort(porFechaDesc);
    var pas = pasadiaHoy(id);
    if (pas) return { cls:'in', txt:'Vino hoy '+h12(pas.entrada), sub:'' };
    var sal = deHoy.filter(function(r){ return r.salida; }).sort(function(a,b){ return b.salida.localeCompare(a.salida); })[0];
    if (sal) return { cls:'out', txt:'Salió a las '+h12(sal.salida), sub:'' };
    if (deHoy[0]) return { cls:'out', txt:deHoy[0].tipo+' hoy '+h12(deHoy[0].entrada), sub:'' };
    return { cls:'', txt:'No ha llegado', sub:'' };
  }
  function diasEn(rs, ym){ var d={}; rs.forEach(function(r){ if (String(r.fecha).slice(0,7)===ym) d[r.fecha]=1; }); return Object.keys(d).length; }
  function diasTxt(n, sufijo){ return n + (n===1?' día':' días') + sufijo; }
  function diasMes(id){ return diasTxt(diasEn(regsDe(id), state.data.mes), ' este mes'); }

  /* ----------- Paquetes ----------- */
  function paqueteActual(cid, tipo){
    var ps = (state.data.paquetes||[]).filter(function(p){ return p.clienteId===cid && p.tipo===tipo; });
    var p = ps[ps.length-1];
    return (p && p.estado!=='Cerrado') ? p : null;
  }
  function usosDe(p){ return (state.data.registros||[]).filter(function(r){ return r.paquete===p.id; }).sort(porFecha); }

  /* ----------- Fotos ----------- */
  function miniDe(fid){
    if (!fid) return '';
    if (minis[fid]) return minis[fid];
    var v = ls(LS_MINI+fid); if (v) minis[fid] = v;
    return v || '';
  }
  function avatar(c, cls){
    var src = miniDe(c.foto);
    return '<div class="av '+(cls||'')+'">'+(src?'<img src="'+esc(src)+'" alt="">':'🐶')+'</div>';
  }
  function guardarMini(f, src){ minis[f]=src; if (/^data:/.test(src)) ls(LS_MINI+f, src); }
  function pedirMinis(){
    var falta = state.data.clientes.map(function(c){ return c.foto; })
      .filter(function(f){ return f && !miniDe(f) && !pedidos[f] && !fallidos[f]; });
    for (var i=0;i<falta.length;i+=30){
      (function(lote){
        lote.forEach(function(f){ pedidos[f]=1; });
        call('getFotos', lote, 'mini').then(function(r){
          lote.forEach(function(f){ delete pedidos[f]; if (r[f]) guardarMini(f, r[f]); else fallidos[f]=1; });
          renderList(); if (!$('vDet').classList.contains('hidden')) renderDet();
        }).catch(function(){ lote.forEach(function(f){ delete pedidos[f]; }); });
      })(falta.slice(i,i+30));
    }
  }
  function pedirGrande(fid){
    if (!fid || grandes[fid] || pedidos['g'+fid] || fallidos[fid]) return;
    pedidos['g'+fid]=1;
    call('getFotos',[fid],'grande').then(function(r){
      delete pedidos['g'+fid];
      if (r[fid]) grandes[fid]=r[fid]; else fallidos[fid]=1;
      if (state.sel && (cliente(state.sel)||{}).foto===fid) renderDet();
    }).catch(function(){ delete pedidos['g'+fid]; });
  }
  function cargarImagen(file){
    return new Promise(function(res,rej){
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function(){ res({img:img, url:url}); };
      img.onerror = function(){ URL.revokeObjectURL(url); rej(new Error('No se pudo leer la imagen.')); };
      img.src = url;
    });
  }
  // Comprime en el teléfono: foto ~800 px y miniatura cuadrada de 200 px.
  function reducir(img, max, cuadrado, calidad){
    var w = img.naturalWidth, h = img.naturalHeight, sx=0, sy=0, sw=w, sh=h;
    if (cuadrado){ var m=Math.min(w,h); sx=(w-m)/2; sy=(h-m)/2; sw=sh=m; w=h=m; }
    var k = Math.min(1, max/Math.max(w,h)), cw = Math.round(w*k), ch = Math.round(h*k);
    var cv = document.createElement('canvas'); cv.width=cw; cv.height=ch;
    var cx = cv.getContext('2d'); cx.fillStyle='#fff'; cx.fillRect(0,0,cw,ch);
    cx.drawImage(img, sx, sy, sw, sh, 0, 0, cw, ch);
    return cv.toDataURL('image/jpeg', calidad);
  }
  function subirFoto(file){
    var id = state.sel; if (!id || state.busy) return;
    state.busy = true; loading(true);
    cargarImagen(file).then(function(o){
      var grande = reducir(o.img, 800, false, 0.8), mini = reducir(o.img, 200, true, 0.75);
      URL.revokeObjectURL(o.url);
      return call('subirFoto', id, grande, mini).then(function(r){
        grandes[r.fotoId] = grande; guardarMini(r.fotoId, mini); delete fallidos[r.fotoId];
        setData(r.data); toast(r.mensaje);
      });
    }).catch(fallo)
      .then(function(){ state.busy=false; loading(false); $('fotoIn').value=''; });
  }

  /* ----------- PIN ----------- */
  var pinTxt = '', pinOcupado = false;
  function pintarPin(){
    Array.prototype.forEach.call($('pinDots').children, function(d, i){ d.classList.toggle('on', i < pinTxt.length); });
  }
  function pantallaPin(msg){
    pinTxt = ''; pinOcupado = false; pintarPin();
    $('pinErr').textContent = msg || '';
    $('pinBox').classList.remove('hidden','enviando');
    $('startDots').classList.add('hidden'); $('startMsg').classList.add('hidden');
    $('startRetry').classList.add('hidden'); $('startPin').classList.add('hidden');
    show('vStart');
  }
  function pinVisible(){ return !$('vStart').classList.contains('hidden') && !$('pinBox').classList.contains('hidden'); }
  function teclaPin(d){
    if (pinOcupado || !pinVisible()) return;
    if (d === 'borrar') pinTxt = pinTxt.slice(0, -1);
    else if (pinTxt.length < 4) pinTxt += d;
    $('pinErr').textContent = ''; pintarPin();
    if (pinTxt.length === 4) enviarPin();
  }
  function enviarPin(){
    pinOcupado = true; $('pinBox').classList.add('enviando');
    B.entrar(pinTxt).then(function(){
      pinOcupado = false; $('pinBox').classList.remove('enviando'); arrancar();
    }, function(e){
      pantallaPin(esPin(e) ? 'PIN incorrecto. Intenta de nuevo.' : mensajeError(e));
      if (esPin(e)) { var b = $('pinBox'); b.classList.remove('sacude'); void b.offsetWidth; b.classList.add('sacude'); }
    });
  }
  // El servidor ya no acepta el PIN guardado (lo cambiaron): se vuelve a pedir.
  function pinPerdido(){ state.data = null; state.sel = null; state.busy = false; loading(false); pantallaPin('El PIN cambió. Escribe el PIN nuevo.'); }
  function fallo(e){
    if (esPin(e)) { pinPerdido(); return; }
    toast('⚠️ '+mensajeError(e));
  }

  /* ----------- Render lista ----------- */
  function visibles(){
    var cs = state.data.clientes, q = norm(state.q);
    if (q) cs = cs.filter(function(c){ return norm(c.mascota+' '+c.cliente+' '+c.direccion+' '+c.encargado+' '+c.id).indexOf(q)>=0; });
    if (state.modo) cs = cs.filter(function(c){ return enModo(c, state.modo); });
    return cs;
  }
  function renderList(){
    if (!state.data) return;
    var cs = visibles(), grupos = {}, orden = MODOS.slice();
    cs.forEach(function(c){ var g=c.modalidad||'Sin modalidad'; (grupos[g]=grupos[g]||[]).push(c); });
    Object.keys(grupos).forEach(function(g){ if(orden.indexOf(g)<0) orden.push(g); });
    var enHotel=0, vinieron=0, html='';
    orden.forEach(function(g){
      var arr = grupos[g]; if(!arr) return;
      arr.sort(function(a,b){ return a.mascota.localeCompare(b.mascota,'es'); });
      var nHoy=0, items = arr.map(function(c){
        var e = estado(c.id); if (e.abierto) enHotel++; if (e.cls){ vinieron++; nHoy++; }
        return '<div class="item" data-id="'+esc(c.id)+'">'+avatar(c, e.cls==='in'?'in':'')+'<div class="grow"><div class="dog">'+esc(c.mascota||'(sin nombre)')+'</div>'+
          '<div class="owner">'+esc(c.cliente)+'</div></div>'+
          '<div class="right"><span class="pill '+e.cls+'">'+esc(e.txt)+'</span><div class="days">'+esc(diasMes(c.id))+'</div></div><div class="chev">›</div></div>';
      }).join('');
      html += '<div class="group"><div class="gh"><span>'+esc(g)+' · '+arr.length+'</span><span class="n">'+(nHoy?nHoy+' hoy':'')+'</span></div><div class="list">'+items+'</div></div>';
    });
    $('groups').innerHTML = html || '<div class="empty">No hay perros que coincidan.</div>';
    $('stats').innerHTML = '<span><i class="dot"></i>Vinieron hoy: <b>'+vinieron+'</b></span><span>En hotel: <b>'+enHotel+'</b></span><span class="upd">Actualizado '+esc(h12(state.data.hora))+'</span>';
    var h = state.data.hotel||[];
    $('hotelBox').innerHTML = '<button class="hotel" id="bHotel24">🏨 <b>Hotel 24H:</b> '+(h.length ? esc(h.join(' · ')) : 'nadie')+'<span class="gest">Gestionar ›</span></button>';
    renderModos();
    $('foot').innerHTML = 'Conectado con PIN · <button id="bSalir">Salir</button>';
  }

  /* ----------- Render detalle ----------- */
  function bloqueEntrada(c){
    var t = state.tipo, h = '', ab = hotelAbierto(c.id);
    if (t === 'Hotel'){
      h += '<button class="big primary" id="bIn" '+(ab?'disabled':'')+'>Registrar entrada</button>';
      h += '<button class="big dark" id="bOut" '+(ab?'':'disabled')+'>Registrar salida (Hotel)</button>';
      return h;
    }
    if (t === 'Pasadía'){
      var p = pasadiaHoy(c.id);
      if (p) h += '<button class="big primary" disabled>Vino hoy · '+esc(h12(p.entrada))+'</button>';
      else h += '<button class="big primary" id="bIn" '+(ab?'disabled':'')+'>Registrar entrada</button>';
      h += '<div class="nota">'+(ab ? 'Está en hotel: registra primero la salida del hotel.' : 'La pasadía solo registra la llegada.')+'</div>';
      return h;
    }
    return bloquePaquete(c, t);
  }
  function picker(titulo, sub, boton){
    var n = state.cant;
    return '<div class="picker"><div class="t">'+esc(titulo)+'</div>'+(sub?'<div class="s">'+esc(sub)+'</div>':'')+
      '<div class="chips">'+CHIPS.map(function(k){ return '<button class="chip'+(k===n?' on':'')+'" data-cant="'+k+'">'+k+'</button>'; }).join('')+'</div>'+
      '<div class="pk-row">Otra cantidad: <input id="pkIn" type="number" inputmode="numeric" min="1" max="60" value="'+n+'"></div>'+
      '<button class="big primary" id="bPaqOk">'+esc(boton(n))+'</button></div>';
  }
  function bloquePaquete(c, t){
    var p = paqueteActual(c.id, t), h = '<div class="card">';
    var etiquetaCrear = function(n){ return 'Crear paquete de '+n+(n===1?' sesión':' sesiones'); };
    if (!p || state.nuevoPaq){
      var sub = p ? 'El paquete actual se cerrará y empieza uno nuevo.' : 'Marca cuántas sesiones de '+t.toLowerCase()+' pagó.';
      h += picker(p ? 'Nuevo paquete de '+t : '¿Cuántas sesiones de '+t+' pagó?', sub, etiquetaCrear);
      if (state.nuevoPaq) h += '<div class="paq-links" style="margin:-4px 0 10px"><button class="tlink" id="bPaqCancel">Cancelar</button></div>';
      h += '</div>';
      if (!p) h += '<div class="paq-links"><button class="tlink" id="bSuelto">Registrar '+esc(t.toLowerCase())+' sin paquete</button></div>';
      return h;
    }
    var usos = usosDe(p), n = p.cantidad, u = usos.length, quedan = Math.max(0, n-u);
    if (state.editPaq){
      h += picker('Cambiar cantidad del paquete', 'Ya usó '+u+'. La cantidad no puede ser menor.', function(k){ return 'Guardar: '+k+(k===1?' sesión':' sesiones'); });
      h += '<div class="paq-links" style="margin:-4px 0 10px"><button class="tlink" id="bPaqCancel">Cancelar</button></div></div>';
      return h;
    }
    h += '<div class="paq"><div class="paq-h"><b>Paquete '+esc(t)+'</b><span>desde '+esc(fechaLarga(p.inicio))+'</span></div>';
    h += '<div class="paq-res" id="paqRes">Usadas <b>'+u+'</b> de '+n+' · quedan '+quedan+'</div>';
    h += '<div class="paq-bar"><i style="width:'+Math.min(100, Math.round(u*100/Math.max(n,1)))+'%"></i></div>';
    h += '<div class="slots">';
    for (var i=0;i<Math.max(n,u);i++){
      var r = usos[i];
      if (r) h += '<button class="slot on" data-desmarcar="'+esc(r.id)+'" aria-label="Uso '+(i+1)+' del '+esc(fechaLarga(r.fecha))+'"><span class="c">✓</span><span class="l">'+esc(fechaCorta(r.fecha))+'<br>'+esc(h12(r.entrada))+'</span></button>';
      else h += '<button class="slot" data-marcar="'+esc(p.id)+'" aria-label="Marcar uso '+(i+1)+'"><span class="c">'+(i+1)+'</span><span class="l">&nbsp;</span></button>';
    }
    h += '</div>';
    if (u >= n) h += '<div class="paq-ok">✓ Paquete completo</div><button class="big primary" id="bPaqNuevo" style="width:100%;margin:12px 0 0">Nuevo paquete</button>';
    h += '<div class="paq-links"><button class="tlink" id="bPaqEdit">Cambiar cantidad</button>'+(u<n?'<button class="tlink" id="bPaqNuevo">Nuevo paquete</button>':'')+'</div>';
    h += '<div class="nota" style="margin:6px 0 0">Toca un círculo para marcar una sesión usada; toca uno marcado para desmarcarlo.</div>';
    h += '</div></div>';
    return h;
  }
  function textoHist(r){
    if (r.tipo === 'Hotel') return 'Hotel · '+h12(r.entrada)+' – '+(r.salida?h12(r.salida):'ahora');
    return r.tipo+' · '+h12(r.entrada)+(r.salida?' – '+h12(r.salida):'');
  }
  function renderHist(c){
    var mesActual = state.data.mes, ym = state.mesVer || mesActual, rs, cargandoMes=false;
    if (ym === mesActual) rs = regsDe(c.id).filter(function(r){ return String(r.fecha).slice(0,7)===ym || (r.tipo==='Hotel' && !r.salida); });
    else {
      var k = c.id+'|'+ym;
      if (state.resumen[k]) rs = state.resumen[k];
      else { rs = []; cargandoMes = true; pedirMes(c.id, ym); }
    }
    rs = rs.slice().sort(porFechaDesc);
    var h = '<div class="mesnav"><button id="mesPrev" aria-label="Mes anterior">‹</button><div class="sect">'+(ym===mesActual?'Este mes':esc(nombreMes(ym)))+
      (cargandoMes?'':' · '+esc(diasTxt(diasEn(rs, ym), '')))+'</div><button id="mesNext" aria-label="Mes siguiente" '+(ym>=mesActual?'disabled':'')+'>›</button></div>';
    h += '<div class="card">'+(cargandoMes ? '<div class="empty" style="padding:20px">Cargando…</div>' : rs.length ? rs.map(function(r){
      var puede = r.fecha===state.data.hoy;
      var meta = [];
      if (r.horas!=='' && r.horas!=null) meta.push(duracion(r.horas));
      if (r.nota) meta.push(r.nota);
      if (r.por) meta.push(r.por);
      return '<div class="hist"><div class="d">'+esc(fechaCorta(r.fecha))+'</div><div class="grow">'+esc(textoHist(r))+
        '<div class="m">'+esc(meta.join(' · '))+'</div></div>'+
        (puede?'<button class="link" data-undo="'+esc(r.id)+'">Deshacer</button>':'')+'</div>';
    }).join('') : '<div class="empty" style="padding:20px">Sin registros '+(ym===mesActual?'este mes':'en '+esc(nombreMes(ym)))+'.</div>')+'</div>';
    return h;
  }
  function pedirMes(cid, ym){
    var k = cid+'|'+ym; if (pedidos['m'+k]) return; pedidos['m'+k]=1;
    var p = ym.split('-');
    call('getResumenMes', cid, +p[0], +p[1]).then(function(r){
      state.resumen[k] = (r && r.registros) || [];
    }).catch(function(e){ state.resumen[k] = []; fallo(e); })
      .then(function(){ delete pedidos['m'+k]; if (state.sel===cid) renderDet(); });
  }
  function renderDet(){
    var c = cliente(state.sel);
    if (!c){ show('vList'); return; }
    var e = estado(c.id), tel = telLimpio(c.contacto);
    var mapUrl = c.direccion ? 'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(c.direccion+', Bogotá, Colombia') : '';
    var big = c.foto ? (grandes[c.foto] || miniDe(c.foto)) : '';
    if (c.foto) pedirGrande(c.foto);
    var cargando = c.foto && !grandes[c.foto] && !fallidos[c.foto];
    var h = '';
    h += '<div class="photo">'+(big ? '<img src="'+esc(big)+'" alt="Foto de '+esc(c.mascota)+'">' :
         '<div class="ph"><span>🐶</span>'+(c.foto && fallidos[c.foto] ? 'No se pudo cargar la foto' : 'Sin foto')+'</div>')+
         (cargando?'<div class="spin2"></div>':'')+'</div>';
    h += '<div class="photobtns"><button class="tlink red" id="bFoto">📷 '+(c.foto?'Cambiar foto':'Agregar foto')+'</button>'+
         (c.foto?'<button class="tlink" id="bQuitarFoto">Quitar foto</button>':'')+'</div>';
    h += '<div class="hero"><h1>'+esc(c.mascota)+'</h1><div class="owner">'+esc(c.cliente)+'</div>'+
         '<span class="pill '+e.cls+'">'+esc(e.txt)+'</span>'+(e.sub?'<div class="days">'+esc(e.sub)+'</div>':'')+
         '<div class="days">'+esc(diasMes(c.id))+'</div></div>';
    h += '<div class="acts">'+
         '<a class="act'+(tel?'':' dis')+'" href="tel:'+esc(tel)+'" target="_top"><span>📞</span>Llamar</a>'+
         '<a class="act'+(tel?'':' dis')+'" href="https://wa.me/'+esc(waNum(tel))+'" target="_blank" rel="noopener"><span>💬</span>WhatsApp</a>'+
         '<a class="act'+(mapUrl?'':' dis')+'" href="'+esc(mapUrl)+'" target="_blank" rel="noopener"><span>📍</span>Mapa</a></div>';
    h += '<div class="seg" id="seg">'+state.data.tipos.map(function(t){ return '<button data-t="'+esc(t)+'" class="'+(t===state.tipo?'on':'')+'">'+esc(t)+'</button>'; }).join('')+'</div>';
    h += '<div id="bloque">'+bloqueEntrada(c)+'</div>';
    h += '<div class="card">'+
         kv('Dirección', c.direccion ? '<a href="'+esc(mapUrl)+'" target="_blank" rel="noopener">'+esc(c.direccion)+'</a>' : '<span style="color:var(--muted)">Sin dirección</span>')+
         kv('Teléfono', tel ? '<a href="tel:'+esc(tel)+'" target="_top">'+esc(c.contacto)+'</a>' : '—')+
         kv('Correo', esc(c.correo||'—'))+kv('Identificación', esc(c.identificacion||'—'))+
         kv('Modo de recogida', esc(c.modalidad||'—'))+kv('Encargado', esc(encTxt(c.encargado)||'—'))+
         (c.notas?kv('Notas', esc(c.notas)):'')+kv('ID', esc(c.id))+'</div>';
    h += renderHist(c);
    h += '<div class="detbtns"><button class="big light" id="bEditar">✏️ Editar datos</button><button class="big danger-o" id="bQuitar">Quitar de la lista</button></div>';
    $('det').innerHTML = h;
  }
  function kv(k,v){ return '<div class="kv"><div class="k">'+k+'</div><div class="v">'+v+'</div></div>'; }

  /* ----------- Diálogo de confirmación (botón de peligro) ----------- */
  var modalRes = null;
  function preguntar(titulo, texto, boton){
    $('modalTit').textContent = titulo; $('modalTxt').textContent = texto || '';
    $('modalSi').textContent = boton || 'Aceptar';
    $('modal').classList.remove('hidden');
    return new Promise(function(res){ modalRes = res; });
  }
  function cerrarModal(v){ $('modal').classList.add('hidden'); var r = modalRes; modalRes = null; if (r) r(v); }
  $('modalSi').addEventListener('click', function(){ cerrarModal(true); });
  $('modalNo').addEventListener('click', function(){ cerrarModal(false); });
  $('modal').addEventListener('click', function(ev){ if (ev.target.id === 'modal') cerrarModal(false); });

  /* ----------- Modos de recogida ----------- */
  var MODOS = ['Paseo','Van 01','Van 02'];
  var ICONO = { 'Paseo':'🚶', 'Van 01':'🚐', 'Van 02':'🚐' };
  // 14.18 → «14 h 11 min» (las horas del hotel vienen en decimales desde la hoja).
  function duracion(hs){
    var t = Math.round(Number(hs)*60); if (isNaN(t) || t < 0) return '';
    var hh = Math.floor(t/60), mm = t%60;
    return hh ? hh+' h'+(mm?' '+mm+' min':'') : mm+' min';
  }
  var NOMBRE_ENC = { 'Jesus':'Jesús' };
  function modos(){ return (state.data && state.data.modalidades) || MODOS; }
  function encTxt(e){ return NOMBRE_ENC[e] || e; }
  function enModo(c, m){
    if (!m) return true;
    return c.modalidad === m;
  }
  function renderModos(){
    var cs = state.data.clientes, h = '<button class="mchip'+(state.modo?'':' on')+'" data-modo="">Todos · '+cs.length+'</button>';
    modos().forEach(function(m){
      var n = cs.filter(function(c){ return enModo(c, m); }).length;
      h += '<button class="mchip'+(state.modo===m?' on':'')+'" data-modo="'+esc(m)+'">'+ICONO[m]+' '+esc(m)+' · '+n+'</button>';
    });
    $('modos').innerHTML = h;
  }
  /* ----------- Hoy (registro del día) ----------- */
  function sumarDias(f, n){ var p=f.split('-'), d=new Date(+p[0],+p[1]-1,+p[2]+n); return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2); }
  function abrirHoy(){ state.dia = state.data.hoy; state.diaData = null; renderHoy(); show('vHoy'); cargarDia(); }
  function cargarDia(silencioso){
    var f = state.dia || state.data.hoy;
    if (!silencioso) { state.diaCargando = true; renderHoy(); }
    return call('getDia', f).then(function(d){ if (f === state.dia) { state.diaData = d; } })
      .catch(function(e){ if (!silencioso) fallo(e); })
      .then(function(){ state.diaCargando = false; renderHoy(); });
  }
  function itemDia(x, linea, pill){
    var c = cliente(x.clienteId), ab = !!c;
    return '<div class="item'+(ab?'':' noab')+'" '+(ab?'data-abrir="'+esc(x.clienteId)+'"':'')+'>'+avatar(c || {foto:''})+'<div class="grow"><div class="dog">'+esc(x.mascota)+(x.activo===false?' <small class="ret">retirado</small>':'')+'</div>'+
      '<div class="owner">'+linea+'</div></div>'+(pill?'<div class="right">'+pill+'</div>':'')+(ab?'<div class="chev">›</div>':'')+'</div>';
  }
  function seccionDia(titulo, n, extra, cuerpo, vacio){
    return '<div class="group"><div class="gh"><span>'+titulo+'</span><span class="n">'+n+(extra?' · '+extra:'')+'</span></div>'+
      '<div class="list">'+(cuerpo || '<div class="empty" style="padding:16px">'+vacio+'</div>')+'</div></div>';
  }
  function porQuien(x){ return x.por ? ' · por '+esc(x.por) : ''; }
  function usoPaq(x){ return x.paquete ? '<span class="pill in">'+x.paquete.n+' de '+x.paquete.de+'</span>' : '<span class="pill">Sin paquete</span>'; }
  function renderHoy(){
    if (!state.data) return;
    var f = state.dia || state.data.hoy, d = state.diaData;
    $('diaIn').max = state.data.hoy; $('diaIn').value = f;
    $('diaNext').disabled = f >= state.data.hoy; $('diaHoy').classList.toggle('hidden', f === state.data.hoy);
    var tit = (f === state.data.hoy ? 'Hoy · ' : '') + fechaLarga(f) + ' ' + f.slice(0,4);
    if (!d || d.fecha !== f){ $('hoyBody').innerHTML = '<div class="sect" style="text-align:center">'+esc(tit)+'</div><div class="empty">Cargando…</div>'; return; }
    var h = '<div class="sect" style="text-align:center">'+esc(tit)+'</div>';
    var tot = d.llegaron.length + d.paseo.length + d.piscina.length + d.hotel.entraron + d.hotel.salieron;
    h += '<div class="resdia"><span>🐕 Llegaron <b>'+d.llegaron.length+'</b></span><span>🌳 Campo <b>'+d.paseo.length+'</b></span><span>🏊 Piscina <b>'+d.piscina.length+'</b></span><span>🏨 Hotel <b>'+d.hotel.siguen+'</b></span></div>';
    h += seccionDia('Llegaron (Pasadía)', d.llegaron.length, '', d.llegaron.map(function(x){
      return itemDia(x, 'Llegó '+esc(h12(x.entrada))+porQuien(x));
    }).join(''), 'Nadie llegó a pasadía.');
    h += seccionDia('Paseo campo', d.paseo.length, '', d.paseo.map(function(x){ return itemDia(x, esc(h12(x.entrada))+porQuien(x), usoPaq(x)); }).join(''), 'Sin paseos al campo.');
    h += seccionDia('Piscina', d.piscina.length, '', d.piscina.map(function(x){ return itemDia(x, esc(h12(x.entrada))+porQuien(x), usoPaq(x)); }).join(''), 'Sin piscina.');
    var hx = d.hotel;
    h += seccionDia('Hotel', hx.siguen+' en hotel', 'entraron '+hx.entraron+' · salieron '+hx.salieron, hx.estadias.map(function(x){
      var l = (x.entroHoy ? 'Entró '+h12(x.entrada) : 'Desde '+fechaCorta(x.fecha)+' '+h12(x.entrada));
      if (x.salida) l += x.salioHoy ? ' · Salió '+h12(x.salida) : '';
      if (x.salioHoy && x.horas !== '' && x.horas != null) l += ' · '+duracion(x.horas);
      return itemDia(x, esc(l)+porQuien(x), '<span class="pill '+(x.estado==='Salió'?'out':'in')+'">'+esc(x.estado)+'</span>');
    }).join(''), 'Nadie en hotel este día.');
    var h24 = d.hotel24, mov = h24.movimientos.map(function(m){
      return '<div class="hist"><div class="d">'+esc(h12(m.hora))+'</div><div class="grow">'+(m.accion==='Entró'?'➕ ':'➖ ')+esc(m.mascota)+' '+(m.accion==='Entró'?'entró a':'salió de')+' Hotel 24H<div class="m">'+esc(m.por)+'</div></div></div>';
    }).join('');
    h += '<div class="group"><div class="gh"><span>Hotel 24H</span><span class="n">'+h24.lista.length+'</span></div><div class="list">'+
      '<div class="hist"><div class="grow">'+(h24.lista.length ? esc(h24.lista.join(' · ')) : 'Nadie en Hotel 24H')+'</div></div>'+mov+'</div></div>';
    if (!tot && !hx.siguen) h += '<div class="nota">No hay registros este día.</div>';
    $('hoyBody').innerHTML = h;
  }

  /* ----------- Resumen del mes ----------- */
  function abrirMes(){ state.mesR = state.data.mes; state.mesData = null; renderMes(); show('vMes'); cargarMes(); }
  function cargarMes(silencioso){
    var ym = state.mesR || state.data.mes, p = ym.split('-');
    if (!silencioso) renderMes();
    return call('resumenMes', +p[0], +p[1]).then(function(r){ if (ym === state.mesR) state.mesData = r; })
      .catch(function(e){ if (!silencioso) fallo(e); }).then(renderMes);
  }
  function caja(icono, titulo, filas){
    return '<div class="mcard"><div class="mct">'+icono+' '+titulo+'</div>'+filas.map(function(f){ return '<div class="mrow"><span>'+f[0]+'</span><b>'+f[1]+'</b></div>'; }).join('')+'</div>';
  }
  function renderMes(){
    if (!state.data) return;
    var ym = state.mesR || state.data.mes, m = state.mesData;
    $('rmTit').textContent = (ym === state.data.mes ? 'Este mes · ' : '') + nombreMes(ym);
    $('rmNext').disabled = ym >= state.data.mes;
    if (!m || m.mes !== ym){ $('mesBody').innerHTML = '<div class="empty">Cargando…</div>'; return; }
    var h = '<div class="mgrid">';
    var top = m.pasadia.top.slice(0,3).map(function(t){ return esc(t.mascota)+' ('+t.n+')'; }).join(', ') || '—';
    h += caja('🐕', 'Pasadía', [['Entradas', m.pasadia.entradas], ['Días con actividad', m.pasadia.dias]]) ;
    h += caja('🌳', 'Paseo campo', [['Sesiones', m.paseo.sesiones], ['Paquetes vendidos', m.paseo.paquetes.vendidos], ['Activos', m.paseo.paquetes.activos], ['Terminados', m.paseo.paquetes.terminados]]);
    h += caja('🏊', 'Piscina', [['Sesiones', m.piscina.sesiones], ['Paquetes vendidos', m.piscina.paquetes.vendidos], ['Activos', m.piscina.paquetes.activos], ['Terminados', m.piscina.paquetes.terminados]]);
    h += caja('🏨', 'Hotel', [['Estadías', m.hotel.estadias], ['Noches', m.hotel.noches], ['En hotel ahora', m.hotel.enHotelAhora], ['Hotel 24H', m.hotel.hotel24.length]]);
    h += '</div>';
    h += '<div class="card"><div class="kv"><div class="k">Más pasadías</div><div class="v">'+top+'</div></div>';
    if (m.hotel.hotel24.length) h += '<div class="kv"><div class="k">Hotel 24H</div><div class="v">'+esc(m.hotel.hotel24.join(' · '))+'</div></div>';
    h += '</div>';
    h += '<div class="sect">Por perro · '+m.porPerro.length+'</div>';
    h += m.porPerro.length ? '<div class="card"><table class="tabla"><thead><tr><th>Perro</th><th>Pasadía</th><th>Campo</th><th>Piscina</th><th>Hotel</th><th>Total</th></tr></thead><tbody>'+
      m.porPerro.map(function(p){
        var ab = cliente(p.clienteId);
        return '<tr'+(ab?' data-abrir="'+esc(p.clienteId)+'"':'')+'><td>'+esc(p.mascota)+'</td><td>'+(p.pasadia||'')+'</td><td>'+(p.paseo||'')+'</td><td>'+(p.piscina||'')+'</td><td>'+(p.hotel||'')+(p.noches?' <small>('+p.noches+' n)</small>':'')+'</td><td><b>'+p.total+'</b></td></tr>';
      }).join('')+'</tbody></table></div>' : '<div class="card"><div class="empty" style="padding:16px">Sin registros este mes.</div></div>';
    var max = Math.max.apply(null, [1].concat(m.porDia.map(function(d){ return d.total; })));
    h += '<div class="sect">Por día</div><div class="card dias">'+m.porDia.slice().reverse().map(function(d){
      var det = [d.pasadia?d.pasadia+' pas.':'', d.paseo?d.paseo+' campo':'', d.piscina?d.piscina+' pisc.':'', d.hotel?d.hotel+' hotel':''].filter(Boolean).join(' · ');
      return '<div class="dia"><div class="d">'+esc(fechaCorta(d.fecha))+'</div><div class="grow"><div class="bar"><i style="width:'+Math.round(d.total*100/max)+'%"></i></div><div class="m">'+(det||'—')+'</div></div><b>'+d.total+'</b></div>';
    }).join('')+'</div>';
    h += '<div class="nota">Hotel = estadías que empezaron en el mes (n = noches dentro del mes). Actualizado '+esc(h12(m.hora))+'.</div>';
    $('mesBody').innerHTML = h;
  }

  /* ----------- Agregar / editar perro ----------- */
  function abrirForm(c){
    state.form = c ? { modo:'editar', id:c.id, mascota:c.mascota, cliente:c.cliente, contacto:c.contacto, encargado:c.encargado, modalidad:c.modalidad, notas:c.notas, foto:'', mini:'' }
                   : { modo:'nuevo', mascota:'', cliente:'', contacto:'', encargado:'', modalidad:'', notas:'', foto:'', mini:'' };
    renderForm(); show('vForm');
  }
  function renderForm(){
    var f = state.form, d = state.data, nuevo = f.modo === 'nuevo';
    var encs = (d.encargados || ['Jackson','Orlando','Jesus','Jerson','Juan']);
    var h = '<div class="vtit">'+(nuevo ? 'Agregar perro' : 'Editar datos')+'</div><div class="form">';
    if (nuevo) h += '<div class="fphoto"><button id="fFoto" class="av big-av">'+(f.mini?'<img src="'+esc(f.mini)+'" alt="">':'📷')+'</button><div class="nota" style="margin:6px 0 0">'+(f.mini?'<button class="tlink" id="fFotoQuitar">Quitar foto</button>':'Foto (opcional)')+'</div></div>';
    h += '<label>Nombre de la mascota *<input class="campo" id="fMascota" maxlength="60" value="'+esc(f.mascota)+'" placeholder="Ej: Luna"></label>';
    h += '<label>Nombre del dueño / cliente<input class="campo" id="fCliente" maxlength="80" value="'+esc(f.cliente)+'" placeholder="Ej: Laura Gómez"></label>';
    h += '<label>Teléfono (opcional)<input class="campo" id="fContacto" type="tel" inputmode="tel" maxlength="20" value="'+esc(f.contacto)+'" placeholder="Ej: 3001234567"></label>';
    h += '<div class="flab">Encargado</div><div class="mchips">'+encs.map(function(e){ return '<button class="mchip'+(f.encargado===e?' on':'')+'" data-enc="'+esc(e)+'">'+esc(encTxt(e))+'</button>'; }).join('')+'</div>';
    h += '<div class="flab">Modo de recogida</div><div class="mchips">'+modos().map(function(m){ return '<button class="mchip'+(f.modalidad===m?' on':'')+'" data-mod="'+esc(m)+'">'+ICONO[m]+' '+esc(m)+'</button>'; }).join('')+'</div>';
    h += '<label>Nota (opcional)<textarea class="campo" id="fNotas" maxlength="300" rows="2" placeholder="Ej: alérgico al pollo">'+esc(f.notas)+'</textarea></label>';
    h += '</div><button class="big primary" id="fGuardar">'+(nuevo ? 'Guardar perro' : 'Guardar cambios')+'</button>';
    if (nuevo){
      var rs = (d.retirados || []).slice().sort(function(a,b){ return a.mascota.localeCompare(b.mascota,'es'); });
      h += '<div class="sect">Perros retirados · '+rs.length+'</div><div class="card">'+(rs.length ? rs.map(function(r){
        return '<div class="hist"><div class="grow"><b>'+esc(r.mascota)+'</b><div class="m">'+esc(r.cliente||'')+(r.modalidad?' · '+esc(r.modalidad):'')+'</div></div><button class="link" data-restaurar="'+esc(r.id)+'">Restaurar</button></div>';
      }).join('') : '<div class="empty" style="padding:16px">No hay perros retirados.</div>')+'</div>';
    }
    $('formBody').innerHTML = h;
  }
  function leerForm(){
    var f = state.form; if (!f || !$('fMascota')) return;
    f.mascota = $('fMascota').value; f.cliente = $('fCliente').value; f.contacto = $('fContacto').value; f.notas = $('fNotas').value;
  }
  function guardarPerro(forzar){
    leerForm(); var f = state.form;
    if (!String(f.mascota).trim()) { toast('Escribe el nombre de la mascota.'); $('fMascota').focus(); return; }
    if (state.busy) return; state.busy = true; loading(true);
    var datos = { mascota:f.mascota, cliente:f.cliente, contacto:f.contacto, encargado:f.encargado, modalidad:f.modalidad, notas:f.notas, forzar:!!forzar };
    if (f.modo === 'nuevo' && f.foto) { datos.foto = f.foto; datos.mini = f.mini; }
    var p = f.modo === 'nuevo' ? call('agregarPerro', datos) : call('editarPerro', f.id, datos);
    p.then(function(r){
      state.busy = false; loading(false); state.form = null;
      state.sel = r.clienteId; state.tipo = 'Pasadía'; state.volver = 'vList';
      setData(r.data); renderDet(); show('vDet'); toast(r.mensaje);
    }, function(e){
      state.busy = false; loading(false);
      if (e && e.code === 'DUPLICADO') { if (confirm(mensajeError(e)+'\n\n¿Agregar de todos modos?')) guardarPerro(true); return; }
      fallo(e);
    });
  }

  /* ----------- Hotel 24H ----------- */
  function abrirHotel(){ state.h24q = ''; renderHotel(); show('vHotel'); }
  function renderHotel(){
    var lista = state.data.hotel || [], q = norm(state.h24q).trim();
    var h = '<div class="card">'+(lista.length ? lista.map(function(n){
      return '<div class="hist"><div class="grow"><b>'+esc(n)+'</b></div><button class="link danger-t" data-sacar="'+esc(n)+'">Sacar</button></div>';
    }).join('') : '<div class="empty" style="padding:16px">No hay perros en Hotel 24H.</div>')+'</div>';
    h += '<div class="sect">Agregar perro al hotel</div><div class="form" style="padding-top:0"><input class="campo" id="h24q" placeholder="Busca un perro o escribe un nombre" value="'+esc(state.h24q)+'" autocomplete="off"></div>';
    if (q){
      var ya = lista.map(norm);
      var cs = state.data.clientes.filter(function(c){ return norm(c.mascota+' '+c.cliente).indexOf(q) >= 0; }).slice(0, 8);
      h += '<div class="card">'+cs.map(function(c){
        var esta = ya.indexOf(norm(c.mascota)) >= 0;
        return '<div class="hist"><div class="grow"><b>'+esc(c.mascota)+'</b><div class="m">'+esc(c.cliente)+'</div></div>'+(esta?'<span class="pill">Ya está</span>':'<button class="link" data-h24add="'+esc(c.id)+'">Agregar</button>')+'</div>';
      }).join('');
      if (!cs.some(function(c){ return norm(c.mascota) === q; }) && ya.indexOf(q) < 0)
        h += '<div class="hist"><div class="grow">Agregar «'+esc(state.h24q.trim())+'» <div class="m">Nombre escrito (no está en la lista)</div></div><button class="link" data-h24nombre="1">Agregar</button></div>';
      h += '</div>';
    }
    $('h24Body').innerHTML = h;
  }

  /* ----------- Datos ----------- */
  function setData(d){
    var mesAntes = state.data && state.data.mes;
    state.data = d;
    if (mesAntes && mesAntes !== d.mes) state.mesVer = null;
    renderList(); if (!$('vDet').classList.contains('hidden')) renderDet();
    if (!$('vHotel').classList.contains('hidden') && (document.activeElement||{}).id !== 'h24q') renderHotel();
    pedirMinis();
  }
  var enCurso = null;
  function cargar(silencioso){
    if (state.busy && silencioso) return Promise.resolve();
    if (enCurso && silencioso) return enCurso;
    if (!silencioso) loading(true);
    return enCurso = call('getData').then(function(d){
      if (!B.tienePin()) return;
      setData(d);
      if (!$('vHoy').classList.contains('hidden')) cargarDia(true);
      if (!$('vMes').classList.contains('hidden')) cargarMes(true);
    }).catch(function(e){
      if (esPin(e)) { pinPerdido(); return; }
      if (!silencioso) toast('⚠️ '+mensajeError(e));
    }).then(function(){ loading(false); enCurso = null; });
  }
  function accion(fn, args, conUndo, despues){
    if (state.busy) return; state.busy = true; loading(true);
    call.apply(null,[fn].concat(args)).then(function(r){
      if (despues) despues(r);
      state.resumen = {};
      setData(r.data); toast(r.mensaje, conUndo ? r.registroId : null);
    }).catch(fallo).then(function(){ state.busy=false; loading(false); });
  }
  function leerCant(){
    var v = parseInt(($('pkIn')||{}).value, 10);
    return (v >= 1 && v <= 60) ? v : 0;
  }

  /* ----------- Inicio ----------- */
  function pantallaInicio(msg, opciones){
    opciones = opciones || {};
    $('pinBox').classList.add('hidden');
    $('startDots').classList.toggle('hidden', !!msg);
    $('startMsg').textContent = msg || ''; $('startMsg').classList.toggle('hidden', !msg);
    $('startRetry').classList.toggle('hidden', !opciones.retry);
    $('startPin').classList.toggle('hidden', !opciones.pin);
    show('vStart');
  }
  function arrancar(){
    if (!B.tienePin()) { pantallaPin(''); return; }
    pantallaInicio('');
    call('getData').then(function(d){ setData(d); show('vList'); })
      .catch(function(e){
        if (esPin(e)) pantallaPin('El PIN guardado ya no sirve. Escribe el PIN.');
        else pantallaInicio(mensajeError(e), {retry:true, pin:true});
      });
  }
  $('startRetry').addEventListener('click', arrancar);
  $('startPin').addEventListener('click', function(){ B.salir(); pantallaPin(''); });
  $('pinPad').addEventListener('click', function(ev){
    var b = ev.target.closest('button'); if (!b) return;
    teclaPin(b.id === 'pinBorrar' ? 'borrar' : b.getAttribute('data-d'));
  });
  document.addEventListener('keydown', function(ev){
    if (ev.key === 'Escape' && !$('modal').classList.contains('hidden')) { cerrarModal(false); return; }
    if (!pinVisible()) return;
    if (/^[0-9]$/.test(ev.key)) { teclaPin(ev.key); ev.preventDefault(); }
    else if (ev.key === 'Backspace') { teclaPin('borrar'); ev.preventDefault(); }
  });
  document.addEventListener('click', function(ev){
    if (ev.target.id === 'bSalir' && confirm('¿Salir de la app en este teléfono? Para volver a entrar se pedirá el PIN.')) {
      B.salir(); state.data = null; state.sel = null; pantallaPin('');
    }
  });
  $('q').addEventListener('input', function(){ state.q = this.value; renderList(); });
  $('groups').addEventListener('click', function(ev){
    var it = ev.target.closest('.item'); if(!it) return;
    state.sel = it.getAttribute('data-id'); state.tipo = 'Pasadía'; state.mesVer = null;
    state.nuevoPaq = false; state.editPaq = false; state.cant = 5; state.volver = 'vList';
    if (hotelAbierto(state.sel)) state.tipo = 'Hotel';
    renderDet(); show('vDet');
  });
  function abrirPerro(id, desde){
    state.sel = id; state.tipo = hotelAbierto(id) ? 'Hotel' : 'Pasadía'; state.mesVer = null;
    state.nuevoPaq = false; state.editPaq = false; state.cant = 5; state.volver = desde;
    renderDet(); show('vDet');
  }
  $('backBtn').addEventListener('click', function(){
    state.sel=null; var v = state.volver || 'vList'; state.volver = 'vList';
    if (v === 'vHoy') { show('vHoy'); cargarDia(true); } else if (v === 'vMes') { show('vMes'); cargarMes(true); } else { renderList(); show('vList'); }
  });
  $('modos').addEventListener('click', function(ev){ var b = ev.target.closest('[data-modo]'); if (!b) return; state.modo = b.getAttribute('data-modo'); renderList(); });
  $('bHoy').addEventListener('click', abrirHoy);
  $('bMes').addEventListener('click', abrirMes);
  $('bAgregar').addEventListener('click', function(){ abrirForm(null); });
  $('hotelBox').addEventListener('click', function(ev){ if (ev.target.closest('#bHotel24')) abrirHotel(); });
  Array.prototype.forEach.call(document.querySelectorAll('[data-volver]'), function(b){ b.addEventListener('click', function(){ renderList(); show('vList'); }); });
  // Hoy
  $('diaIn').addEventListener('change', function(){ var v = this.value; if (!v) return; if (v > state.data.hoy) v = state.data.hoy; state.dia = v; state.diaData = null; cargarDia(); });
  $('diaPrev').addEventListener('click', function(){ state.dia = sumarDias(state.dia || state.data.hoy, -1); state.diaData = null; cargarDia(); });
  $('diaNext').addEventListener('click', function(){ var n = sumarDias(state.dia || state.data.hoy, 1); if (n > state.data.hoy) return; state.dia = n; state.diaData = null; cargarDia(); });
  $('diaHoy').addEventListener('click', function(){ state.dia = state.data.hoy; state.diaData = null; cargarDia(); });
  $('hoyBody').addEventListener('click', function(ev){ var it = ev.target.closest('[data-abrir]'); if (it) abrirPerro(it.getAttribute('data-abrir'), 'vHoy'); });
  // Mes
  $('rmPrev').addEventListener('click', function(){ state.mesR = mesMas(state.mesR || state.data.mes, -1); state.mesData = null; cargarMes(); });
  $('rmNext').addEventListener('click', function(){ var n = mesMas(state.mesR || state.data.mes, 1); if (n > state.data.mes) return; state.mesR = n; state.mesData = null; cargarMes(); });
  $('mesBody').addEventListener('click', function(ev){ var it = ev.target.closest('[data-abrir]'); if (it) abrirPerro(it.getAttribute('data-abrir'), 'vMes'); });
  // Formulario
  $('formVolver').addEventListener('click', function(){
    var f = state.form; state.form = null;
    if (f && f.modo === 'editar' && cliente(f.id)) { renderDet(); show('vDet'); } else { renderList(); show('vList'); }
  });
  $('formBody').addEventListener('input', leerForm);
  $('formBody').addEventListener('click', function(ev){
    var t = ev.target, el, f = state.form;
    if ((el = t.closest('[data-enc]'))) { leerForm(); var e = el.getAttribute('data-enc'); f.encargado = f.encargado === e ? '' : e; renderForm(); return; }
    if ((el = t.closest('[data-mod]'))) { leerForm(); var m = el.getAttribute('data-mod'); f.modalidad = f.modalidad === m ? '' : m; renderForm(); return; }
    if (t.closest('#fFoto')) { leerForm(); $('fotoNuevo').click(); return; }
    if (t.closest('#fFotoQuitar')) { leerForm(); f.foto = ''; f.mini = ''; renderForm(); return; }
    if (t.closest('#fGuardar')) { guardarPerro(false); return; }
    if ((el = t.closest('[data-restaurar]'))) {
      var id = el.getAttribute('data-restaurar'), r = (state.data.retirados||[]).filter(function(x){ return x.id===id; })[0];
      if (r && confirm('¿Volver a poner a '+r.mascota+' en la lista?')) { leerForm(); accion('restaurarPerro',[id], false, function(){ setTimeout(renderForm, 0); }); }
    }
  });
  $('fotoNuevo').addEventListener('change', function(){
    var file = this.files && this.files[0], inp = this; if (!file || !state.form) return;
    cargarImagen(file).then(function(o){
      state.form.foto = reducir(o.img, 800, false, 0.8); state.form.mini = reducir(o.img, 200, true, 0.75);
      URL.revokeObjectURL(o.url); renderForm();
    }).catch(fallo).then(function(){ inp.value = ''; });
  });
  // Hotel 24H
  $('h24Body').addEventListener('input', function(ev){
    if (ev.target.id !== 'h24q') return;
    state.h24q = ev.target.value; var pos = ev.target.selectionStart; renderHotel();
    var i = $('h24q'); i.focus(); try { i.setSelectionRange(pos, pos); } catch(e){}
  });
  $('h24Body').addEventListener('click', function(ev){
    var el = ev.target.closest('[data-sacar]');
    if (el) {
      var n = el.getAttribute('data-sacar');
      preguntar('¿Sacar a '+n+' de Hotel 24H?', 'Queda anotado en el historial.', 'Sacar').then(function(si){ if (si) accion('hotelSacar',[n], false); });
      return;
    }
    if ((el = ev.target.closest('[data-h24add]'))) { accion('hotelAgregar',[el.getAttribute('data-h24add'), ''], false, function(){ state.h24q = ''; }); return; }
    if (ev.target.closest('[data-h24nombre]')) { var nom = state.h24q.trim(); if (nom) accion('hotelAgregar',['', nom], false, function(){ state.h24q = ''; }); }
  });
  $('det').addEventListener('input', function(ev){
    if (ev.target.id !== 'pkIn') return;
    var n = leerCant(); if (n) state.cant = n;
    Array.prototype.forEach.call(document.querySelectorAll('.chip'), function(ch){ ch.classList.toggle('on', +ch.getAttribute('data-cant')===n); });
    var b = $('bPaqOk'); if (b) { b.disabled = !n; b.textContent = n ? (state.editPaq ? 'Guardar: ' : 'Crear paquete de ')+n+(n===1?' sesión':' sesiones') : 'Escribe una cantidad'; }
  });
  $('det').addEventListener('click', function(ev){
    var t = ev.target, el;
    var sb = t.closest('#seg button'); if (sb){ state.tipo = sb.getAttribute('data-t'); state.nuevoPaq=false; state.editPaq=false; state.cant=5; renderDet(); return; }
    if (t.id==='bIn'){
      accion('registrarEntrada',[state.sel, state.tipo], true);
      return;
    }
    if (t.id==='bEditar'){ var ce = cliente(state.sel); if (ce) abrirForm(ce); return; }
    if (t.id==='bQuitar'){
      var cq = cliente(state.sel); if (!cq) return;
      preguntar('¿Quitar a '+cq.mascota+' de la lista?', 'Su historial y paquetes se guardan. Puedes restaurarlo en «Perros retirados» (botón Agregar perro).', 'Quitar')
        .then(function(si){ if (si) accion('retirarPerro',[cq.id], false, function(){ state.sel = null; state.volver = 'vList'; }); });
      return;
    }
    if (t.id==='bOut'){ var ab = hotelAbierto(state.sel); if(ab) accion('registrarSalida',[ab.id], true); return; }
    if (t.id==='bSuelto'){ if (confirm('¿Registrar '+state.tipo.toLowerCase()+' de hoy sin paquete?')) accion('registrarEntrada',[state.sel, state.tipo], true); return; }
    if ((el = t.closest('[data-cant]'))){ state.cant = +el.getAttribute('data-cant'); renderDet(); return; }
    if (t.id==='bPaqOk'){
      var n = leerCant(); if (!n) { toast('Escribe una cantidad entre 1 y 60.'); return; }
      var c = cliente(state.sel), p = paqueteActual(state.sel, state.tipo);
      if (state.editPaq) { accion('cambiarCantidad',[p.id, n], false, function(){ state.editPaq=false; }); return; }
      if (p && usosDe(p).length < p.cantidad && !confirm('El paquete actual de '+c.mascota+' todavía tiene sesiones sin usar. ¿Cerrarlo y empezar uno nuevo de '+n+'?')) return;
      accion('crearPaquete',[state.sel, state.tipo, n], false, function(){ state.nuevoPaq=false; });
      return;
    }
    if (t.id==='bPaqNuevo'){ state.nuevoPaq = true; state.cant = (paqueteActual(state.sel,state.tipo)||{}).cantidad || 5; renderDet(); return; }
    if (t.id==='bPaqEdit'){ state.editPaq = true; state.cant = (paqueteActual(state.sel,state.tipo)||{}).cantidad || 5; renderDet(); return; }
    if (t.id==='bPaqCancel'){ state.nuevoPaq = false; state.editPaq = false; renderDet(); return; }
    if ((el = t.closest('[data-marcar]'))){ accion('marcarUso',[el.getAttribute('data-marcar')], true); return; }
    if ((el = t.closest('[data-desmarcar]'))){
      var rid = el.getAttribute('data-desmarcar'), r = (state.data.registros||[]).filter(function(x){ return x.id===rid; })[0];
      if (r && confirm('¿Desmarcar la sesión del '+fechaLarga(r.fecha)+' a las '+h12(r.entrada)+'?')) accion('deshacer',[rid], false);
      return;
    }
    if (t.id==='mesPrev'){ state.mesVer = mesMas(state.mesVer || state.data.mes, -1); renderDet(); return; }
    if (t.id==='mesNext'){ var nx = mesMas(state.mesVer || state.data.mes, 1); state.mesVer = nx >= state.data.mes ? null : nx; renderDet(); return; }
    if (t.closest('#bFoto')){ $('fotoIn').click(); return; }
    if (t.closest('#bQuitarFoto')){ var cc = cliente(state.sel); if (cc && confirm('¿Quitar la foto de '+cc.mascota+'?')) accion('quitarFoto',[state.sel], false); return; }
    var u = t.closest('[data-undo]');
    if (u && confirm('¿Deshacer este registro?')) accion('deshacer',[u.getAttribute('data-undo')], false);
  });
  $('fotoIn').addEventListener('change', function(){ if (this.files && this.files[0]) subirFoto(this.files[0]); });
  $('toastUndo').addEventListener('click', function(){
    var id = state.lastUndoId; $('toast').classList.add('hidden'); if(id) accion('deshacer',[id], false);
  });

  // Sincronización: refresca cada 45 s y al volver a la app
  setInterval(function(){ if(!document.hidden && state.data) cargar(true); }, REFRESH_MS);
  document.addEventListener('visibilitychange', function(){ if(!document.hidden && state.data) cargar(true); });
  window.addEventListener('focus', function(){ if(state.data && !state.busy) cargar(true); });

  window.JACKNES_UI = { h12:h12, estado:function(id){ return estado(id); }, state:state };
  arrancar();
})();

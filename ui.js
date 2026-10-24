/* ==========================================================================
   JAC-KNES · Interfaz (compartida por la app instalable y la versión Apps Script)
   Necesita window.Backend con: getData, registrarEntrada, registrarSalida, deshacer,
   crearPaquete, marcarUso, cambiarCantidad, getResumenMes, subirFoto, quitarFoto,
   getFotos y, opcionalmente, login / otraCuenta / salir.
   Todas las horas internas van en 'HH:mm' (24 h) y SIEMPRE se muestran en 12 h (AM/PM).
   ========================================================================== */
(function(){
  'use strict';
  var B = window.Backend;
  var REFRESH_MS = 45000, LS_MINI = 'perros_mini_';
  var PAQ_TIPOS = ['Paseo campo','Piscina'];
  var CHIPS = [4,5,6,7];
  var state = { data:null, q:'', sel:null, tipo:'Pasadía', busy:false, lastUndoId:null,
                mesVer:null, resumen:{}, cant:5, nuevoPaq:false, editPaq:false, authFalta:false };
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
  function esAuth(e){ return e && e.code === 'AUTH'; }

  function show(id){ ['vStart','vList','vDet'].forEach(function(v){ $(v).classList.toggle('hidden', v!==id); }); window.scrollTo(0,0); }
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

  /* ----------- Sesión ----------- */
  function bannerHtml(){
    return state.authFalta && B.login ? '<div class="banner">🔒 Tu sesión de Google se cerró.<button data-login="1">Entrar con Google</button></div>' : '';
  }
  function renderBanner(){ $('authBanner').innerHTML = bannerHtml(); $('authBanner2').innerHTML = bannerHtml(); }
  function fallo(e){
    if (esAuth(e)) { state.authFalta = true; renderBanner(); toast('🔒 Vuelve a entrar con Google para continuar.'); return; }
    toast('⚠️ '+mensajeError(e));
  }
  function entrar(otra){
    // Debe llamarse directo desde el toque (Google abre una ventanita).
    var p = otra && B.otraCuenta ? B.otraCuenta() : B.login();
    return p.then(function(){ state.authFalta = false; renderBanner(); });
  }

  /* ----------- Render lista ----------- */
  function visibles(){
    var cs = state.data.clientes, q = norm(state.q);
    if (q) cs = cs.filter(function(c){ return norm(c.mascota+' '+c.cliente+' '+c.direccion+' '+c.encargado+' '+c.id).indexOf(q)>=0; });
    return cs;
  }
  function renderList(){
    if (!state.data) return;
    var cs = visibles(), grupos = {}, orden = ['Paseo','Van 01','Van 02'];
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
    $('hotelBox').innerHTML = h.length ? '<div class="hotel">🏨 <b>Hotel 24H:</b> '+esc(h.join(' · '))+'</div>' : '';
    $('foot').innerHTML = state.data.usuario ? 'Conectado como '+esc(state.data.usuario)+(B.salir?' · <button id="bSalir">Cerrar sesión</button>':'') : '';
    renderBanner();
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
      if (r.horas!=='' && r.horas!=null) meta.push(String(r.horas).replace('.',',')+' h');
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
         '<div class="ph"><span>🐶</span>'+(c.foto && fallidos[c.foto] ? 'Foto guardada con otra cuenta' : 'Sin foto')+'</div>')+
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
         kv('Modalidad', esc(c.modalidad||'—'))+kv('Encargado', esc(c.encargado||'—'))+
         (c.notas?kv('Notas', esc(c.notas)):'')+kv('ID', esc(c.id))+'</div>';
    h += renderHist(c);
    $('det').innerHTML = h;
    renderBanner();
  }
  function kv(k,v){ return '<div class="kv"><div class="k">'+k+'</div><div class="v">'+v+'</div></div>'; }

  /* ----------- Datos ----------- */
  function setData(d){
    var mesAntes = state.data && state.data.mes;
    state.data = d; state.authFalta = false;
    if (mesAntes && mesAntes !== d.mes) state.mesVer = null;
    renderList(); if (!$('vDet').classList.contains('hidden')) renderDet(); pedirMinis();
  }
  var enCurso = null;
  function cargar(silencioso){
    if (state.busy && silencioso) return Promise.resolve();
    if (enCurso && silencioso) return enCurso;
    if (!silencioso) loading(true);
    return enCurso = call('getData').then(function(d){ setData(d); }).catch(function(e){
      if (esAuth(e)) { state.authFalta = true; renderBanner(); return; }
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
    $('startDots').classList.toggle('hidden', !!msg);
    $('startMsg').textContent = msg || ''; $('startMsg').classList.toggle('hidden', !msg);
    $('startLogin').classList.toggle('hidden', !opciones.login);
    $('startRetry').classList.toggle('hidden', !opciones.retry);
    $('startOtra').classList.toggle('hidden', !opciones.otra);
    show('vStart');
  }
  function arrancar(){
    pantallaInicio('');
    call('getData').then(function(d){ setData(d); show('vList'); })
      .catch(function(e){
        if (esAuth(e) && B.login) pantallaInicio(e.mensajeInicio || 'Entra con tu cuenta de Google para ver los perros.', {login:true});
        else pantallaInicio(mensajeError(e), {retry:true, otra: !!B.otraCuenta && /acceso|permiso/i.test(mensajeError(e))});
      });
  }
  $('startRetry').addEventListener('click', arrancar);
  $('startLogin').addEventListener('click', function(){
    entrar(false).then(arrancar, function(e){ pantallaInicio(mensajeError(e), {login:true}); });
  });
  $('startOtra').addEventListener('click', function(){
    entrar(true).then(arrancar, function(e){ pantallaInicio(mensajeError(e), {login:true}); });
  });
  document.addEventListener('click', function(ev){
    var t = ev.target;
    if (t.closest && t.closest('[data-login]')) { entrar(false).then(function(){ cargar(false); }, function(e){ toast('⚠️ '+mensajeError(e)); }); return; }
    if (t.id === 'bSalir' && B.salir && confirm('¿Cerrar la sesión de Google en esta app?')) { B.salir(); state.data = null; pantallaInicio('Sesión cerrada.', {login:true}); }
  });
  $('q').addEventListener('input', function(){ state.q = this.value; renderList(); });
  $('groups').addEventListener('click', function(ev){
    var it = ev.target.closest('.item'); if(!it) return;
    state.sel = it.getAttribute('data-id'); state.tipo = 'Pasadía'; state.mesVer = null;
    state.nuevoPaq = false; state.editPaq = false; state.cant = 5;
    if (hotelAbierto(state.sel)) state.tipo = 'Hotel';
    renderDet(); show('vDet');
  });
  $('backBtn').addEventListener('click', function(){ state.sel=null; renderList(); show('vList'); });
  $('det').addEventListener('input', function(ev){
    if (ev.target.id !== 'pkIn') return;
    var n = leerCant(); if (n) state.cant = n;
    Array.prototype.forEach.call(document.querySelectorAll('.chip'), function(ch){ ch.classList.toggle('on', +ch.getAttribute('data-cant')===n); });
    var b = $('bPaqOk'); if (b) { b.disabled = !n; b.textContent = n ? (state.editPaq ? 'Guardar: ' : 'Crear paquete de ')+n+(n===1?' sesión':' sesiones') : 'Escribe una cantidad'; }
  });
  $('det').addEventListener('click', function(ev){
    var t = ev.target, el;
    var sb = t.closest('#seg button'); if (sb){ state.tipo = sb.getAttribute('data-t'); state.nuevoPaq=false; state.editPaq=false; state.cant=5; renderDet(); return; }
    if (t.id==='bIn'){ accion('registrarEntrada',[state.sel, state.tipo], true); return; }
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
  setInterval(function(){ if(!document.hidden && state.data && !state.authFalta) cargar(true); }, REFRESH_MS);
  document.addEventListener('visibilitychange', function(){ if(!document.hidden && state.data) cargar(true); });
  window.addEventListener('focus', function(){ if(state.data && !state.busy) cargar(true); });

  window.JACKNES_UI = { h12:h12, estado:function(id){ return estado(id); }, state:state };
  arrancar();
})();

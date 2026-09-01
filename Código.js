// ═══════════════════════════════════════════════════════════════
// NUGUDÚ CRM — Apps Script v6
// ═══════════════════════════════════════════════════════════════

var SHEET_ORDENES    = '1yENHn7y1DTrDlk0-yYfP1yVLzcgdhewtONwefvK613E';
var SHEET_VENDEDORES = '1bPZg1JXef2yWGeSMEWj62Zs37jJuCjtm6uxJ8Ca-yB0';
var SHEET_REPARTIDOR = '1jrdJhCOzmeWDyNFlYjJun1bKdg-Tiajy44f0V5UvTb4';
var SHEET_CATALOGO   = '1yENHn7y1DTrDlk0-yYfP1yVLzcgdhewtONwefvK613E';
var HOJA_DATOS       = 'datos';
var HOJA_BORRADOS    = 'borrados_ts';
var HOJA_CATALOGO    = 'Catalogo';
var HOJA_EVENTOS     = 'eventos_usuario';
var HOJA_SOLICITUDES = 'solicitudes';
var NOTIFY_EMAIL     = 'nugudulasersv@gmail.com';
// Token compartido: index.html y pedido.html deben mandarlo en cada llamada.
// Cierra el acceso publico anonimo al endpoint (antes cualquiera con la URL
// podia leer nombres/telefonos/direcciones de clientes sin restriccion).
var API_TOKEN        = '20448e06ce5e6d46b0c829be92dd00bcd8d521cd';
// Clave de LocationIQ (locationiq.com) para geocodificar direcciones con
// precision real -- REEMPLAZA el texto de abajo por tu Access Token (algo
// como 'pk.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx') antes de implementar.
var LOCATIONIQ_KEY   = 'pk.566487b350cf28d6d4744b6bb40266aa';
// Codigos de vendedoras que pueden compartir su propio link publico de
// pedido.html (ej. pedido.html?v=N1) y que una venta por ese canal quede
// atribuida a ellas en vez del generico 'WEB'. Deben coincidir con los
// codigos de VENDEDORAS en index.html (N4 es el codigo de administracion,
// se incluye por si alguna vez comparte su propio link tambien). Agregar
// mas vendedoras aca es un solo cambio, en esta lista nada mas.
var CODIGOS_VENDEDORAS_WEB = ['N1', 'N2', 'N4'];

// WOMPI — credenciales (obtenidas de panel.wompi.sv → tu negocio → App ID / API Secret)
var WOMPPI_APP_ID     = '48f01b4b-1ee8-4f98-8613-2acbd81d8021';
var WOMPPI_API_SECRET = 'f440289f-48aa-4b4d-9d3d-a854b2ec4395';
// URLs fijas de la API — el modo sandbox/producción se controla desde
// panel.wompi.sv (flag "estaProductivo" del negocio), NO con la URL.
var WOMPI_AUTH_URL = 'https://id.wompi.sv/connect/token';
var WOMPI_API_URL  = 'https://api.wompi.sv';

// Cache del spreadsheet abierto durante una misma ejecucion. SHEET_ORDENES y
// SHEET_CATALOGO son en realidad el MISMO spreadsheet, asi que sin esto

// guardarPedidoWeb lo abria hasta 4 veces seguidas (leerCatalogo, leerOrdenes,
// guardarOrdenes, descontarStock), cada apertura con su propia latencia de
// red — esto es lo que hacia sentir lento el boton "Confirmar pedido". Con el
// cache se abre una sola vez por ejecucion. No cambia ningun dato ni logica.
var _ssCache = {};
function abrirSS(id) {
  if (!_ssCache[id]) _ssCache[id] = SpreadsheetApp.openById(id);
  return _ssCache[id];
}

// conLock: serializa cualquier operacion de lectura-modificacion-escritura
// para que dos personas guardando al mismo tiempo (ej. una vendedora en
// index.html y un cliente en pedido.html) nunca se pisen los datos entre si.
function conLock(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    throw new Error('Sistema ocupado procesando otro pedido, intenta de nuevo en unos segundos.');
  }
  try { return fn(); } finally { lock.releaseLock(); }
}

function doGet(e) {
  try {
    var p = (e && e.parameter) || {};
    if (p.token !== API_TOKEN) return respond({ ok: false, error: 'No autorizado' });
    var action = p.action || 'read';
    // "Ping" de calentamiento: pedido.html lo llama en background para que la
    // instancia de Apps Script no se enfrie y la busqueda de telefono/orden
    // (o el boton Continuar de Mi Diseno) responda instantaneo, sin el
    // arranque en frio de 2-3 segundos.
    if (action === 'ping')         return respond({ ok: true });
    if (action === 'warmWompi')    { try { wompiAutenticar(); } catch(e) {} return respond({ ok: true }); }
    if (action === 'read')          return respond(leerOrdenes());
    if (action === 'sync')          return respond(conLock(sincronizar));
    if (action === 'catalogo')      return respond(leerCatalogo());
    if (action === 'buscarCliente') return respond(buscarClienteGAS(p.tel, p.orden));
    if (action === 'buscarClienteSeguro') return respond(buscarClienteSeguro(p.tel, p.codigo));
    if (action === 'buscarClienteOrdenSeguro') return respond(buscarClienteOrdenSeguro(p.orden, p.codigo));
    // Boton del correo de notificacion (ver notificarPedidoNuevo): marca la
    // orden como "datos bancarios enviados" -- para que el tracking en
    // index.html lo sepa sin importar el dispositivo -- y redirige derecho a
    // WhatsApp con el mensaje ya escrito. Devuelve HTML (no JSON) porque el
    // navegador tiene que navegar a wa.me, no leer una respuesta.
    if (action === 'irWhatsAppBancario') {
      var idOrdenWA = p.id;
      var ordenesWA = leerOrdenes();
      var ordWA = null;
      for (var oi = 0; oi < ordenesWA.length; oi++) {
        if (String(ordenesWA[oi].id) === String(idOrdenWA)) { ordWA = ordenesWA[oi]; break; }
      }
      if (!ordWA) return HtmlService.createHtmlOutput('Pedido no encontrado.');
      if (!ordWA.datosBancariosEnviados) {
        conLock(function(){ actualizarOrden(idOrdenWA, { datosBancariosEnviados: true }); });
      }
      var linkWA = linkWhatsAppBancario(ordWA);
      // Nada de auto-redireccion (meta refresh / location.href): los
      // navegadores internos de apps como Gmail bloquean el salto automatico
      // a otra app (WhatsApp) por seguridad, aunque el codigo este bien --
      // queda una pagina en blanco sin ningun aviso. Un boton grande que se
      // toca una sola vez SI funciona siempre, en cualquier navegador.
      return HtmlService.createHtmlOutput(
        '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
        '<body style="font-family:Arial,Helvetica,sans-serif;text-align:center;padding:60px 24px">' +
        '<p style="font-size:22px;line-height:1.5;color:#222;margin-bottom:6px">✅ Datos bancarios marcados como enviados</p>' +
        '<p style="font-size:19px;color:#444;margin-top:0">Pedido <b>' + escHtml(ordWA.orden) + '</b></p>' +
        '<a href="' + linkWA + '" style="display:inline-block;margin-top:26px;background:#25D366;color:#fff;text-decoration:none;padding:20px 36px;border-radius:10px;font-weight:bold;font-size:22px">📲 Abrir WhatsApp</a>' +
        '<p style="font-size:14px;color:#888;margin-top:28px">Si no abre solo, tocá los tres puntos del navegador y elegí "Abrir en Safari" o "Abrir en Chrome".</p>' +
        '</body></html>'
      );
    }
    // Diagnostico rapido: abrir esta URL con ?action=debugGeo&token=... en el
    // navegador muestra directo (sin pasar por el editor de Apps Script) la
    // ultima respuesta real que dio LocationIQ la ultima vez que alguien
    // probo una direccion. Mucho mas simple que navegar Ejecuciones/Registro.
    if (action === 'debugGeo') return respond({ ok: true, debug: PropertiesService.getScriptProperties().getProperty('ULTIMO_DEBUG_GEO') || 'Todavia no hay ninguna prueba registrada.' });
    // Prueba directa: llama a geocodificarDireccion() en el momento mismo de
    // abrir esta URL, con la direccion que se pase en ?dir=... Sirve para
    // aislar el problema de pedido.html por completo: si esto funciona pero
    // pedido.html sigue sin marcar nada, el problema es que la peticion de
    // pedido.html nunca llega al servidor (no es un problema de LocationIQ
    // ni de permisos del script).
    if (action === 'testGeo')       return respond(geocodificarDireccion(p.dir || '', p.zona || ''));
    if (action === 'getConfigOpenWa') return respond(getConfigOpenWa());
    if (action === 'getConfigWompi')  return respond(getConfigWompi());
    if (action === 'enviarComprobante') return respond(enviarComprobante(p));
    if (action === 'validarHashWompi')   return respond(validarHashWompi(p));
    if (action === 'verificarTransaccion') return respond(verificarTransaccionWompi(p.idTransaccion || ''));
    if (action === 'leerEventos') return respond(leerEventos(p));
    if (action === 'leerVisitantes') return respond(leerVisitantes(p));
    // Solicitudes de transferencia: el CRM las lee para la seccion
    // "Pagos pendientes" (ref SOL-..., ver guardarSolicitudWeb).
    if (action === 'solicitudes') return respond(leerSolicitudes());
    return respond({ error: 'Accion desconocida: ' + action });
  } catch (err) {
    return respond({ ok: false, error: err.message });
  }
}

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    if (payload.token !== API_TOKEN) return respond({ ok: false, error: 'No autorizado' });
    var action  = payload.action || 'save';
    if (action === 'save')            { conLock(function(){ var anteriores = leerOrdenes(); guardarOrdenes(payload.data); descontarStockPorNuevasOrdenes(anteriores, payload.data); }); return respond({ ok: true }); }
    if (action === 'update')          { conLock(function(){ actualizarOrden(payload.id, payload.fields); }); return respond({ ok: true }); }
    if (action === 'registrarBorrado'){ conLock(function(){ registrarBorrado(payload.ts); }); return respond({ ok: true }); }
    if (action === 'resolverLink')    { return respond(resolverLink(payload.url)); }
    if (action === 'geocodificar')    { return respond(geocodificarDireccion(payload.direccion, payload.zona)); }
    if (action === 'pedidoWeb')       { return respond(conLock(function(){ return guardarPedidoWeb(payload); })); }
    if (action === 'crearEnlacePago') { return respond(crearEnlacePago(payload)); }
    if (action === 'webhookWompi')    { return respond(webhookWompi(payload)); }
    if (action === 'saveConfigOpenWa'){ return respond(saveConfigOpenWa(payload)); }
    if (action === 'saveConfigWompi') { return respond(saveConfigWompi(payload)); }
    if (action === 'enviarComprobante'){ return respond(enviarComprobante(payload)); }
    if (action === 'validarHashWompi') return respond(validarHashWompi(payload.params || payload));
    if (action === 'notificarPagoConfirmado') return respond(notificarPagoConfirmado(payload));
    if (action === 'trackEvent')  return respond(guardarEventos(payload));
    if (action === 'leerVisitantes') return respond(leerVisitantes(payload));
    if (action === 'guardarFechaNac') return respond(guardarFechaNac(payload));
    if (action === 'buscarOrdenWeb')  return respond(buscarOrdenWeb(payload));
    if (action === 'actualizarDatosWeb'){ conLock(function(){ actualizarDatosWeb(payload); }); return respond({ ok: true }); }
    if (action === 'solicitudWeb')      { return respond(conLock(function(){ return guardarSolicitudWeb(payload); })); }
    if (action === 'confirmarSolicitud'){ return respond(conLock(function(){ return confirmarSolicitudWeb(payload); })); }
    if (action === 'descartarSolicitud'){ return respond(conLock(function(){ return descartarSolicitudWeb(payload); })); }
    if (action === 'obtenerCodigoCliente') return respond(obtenerCodigoParaCRM(payload));
    if (action === 'regenerarCodigoCliente') return respond(regenerarCodigoCliente(payload));
    if (action === 'obtenerCodigosLote') return respond(obtenerCodigosLote(payload));
    if (action === 'buscarClienteSeguro') return respond(buscarClienteSeguro(payload.tel, payload.codigo));
    if (action === 'buscarClienteOrdenSeguro') return respond(buscarClienteOrdenSeguro(payload.orden, payload.codigo));
    return respond({ error: 'Accion desconocida' });
  } catch (err) {
    return respond({ ok: false, error: err.message });
  }
}

// Cada fila de la hoja 'datos' guarda UN pedido en formato JSON (columna A).
// Antes se guardaba un arreglo gigante entero en la celda A1, lo que corria
// el riesgo de superar el limite de 50,000 caracteres de Google Sheets por
// celda y corromper todo el historial de golpe. Con una fila por pedido, ese
// limite deja de aplicar sin importar cuantos pedidos se acumulen.
function leerOrdenes() {
  // Cache 30s en ScriptProperties para que buscarCliente sea rapido (~1s
  // en vez de ~10s). El cache se invalida al escribir (guardarOrdenes) para
  // que la CRM siempre vea datos frescos en actualizaciones.
  var props = PropertiesService.getScriptProperties();
  var cached = props.getProperty('ORDENES_CACHE');
  var cacheExp = parseInt(props.getProperty('ORDENES_CACHE_EXP') || '0');
  if (cached && Date.now() < cacheExp) {
    try { return JSON.parse(cached); } catch(e) {}
  }
  var sheet   = getHojaDatos();
  var lastRow = sheet.getLastRow();
  if (lastRow < 1) return [];
  var values  = sheet.getRange(1, 1, lastRow, 1).getValues();
  var ordenes = [];
  for (var i = 0; i < values.length; i++) {
    var raw = values[i][0];
    if (!raw) continue;
    try {
      var o = JSON.parse(raw);
      if (o && typeof o === 'object' && !Array.isArray(o)) ordenes.push(o);
    } catch(e) { /* fila invalida - se ignora, no rompe el resto */ }
  }
  // Guardar cache
  try {
    props.setProperty('ORDENES_CACHE', JSON.stringify(ordenes));
    props.setProperty('ORDENES_CACHE_EXP', String(Date.now() + 30000));
  } catch(e) {}
  return ordenes;
}

function guardarOrdenes(data) {
  var sheet = getHojaDatos();
  sheet.clearContents();
  if (!data || !data.length) return;
  var filas = data.map(function(o) { return [JSON.stringify(o)]; });
  sheet.getRange(1, 1, filas.length, 1).setValues(filas);
  // Invalidar cache de leerOrdenes para que la proxima lectura sea fresca
  try {
    var props = PropertiesService.getScriptProperties();
    props.deleteProperty('ORDENES_CACHE');
    props.deleteProperty('ORDENES_CACHE_EXP');
  } catch(e) {}
}

// Migracion de una sola vez: convierte el formato viejo (un JSON gigante en
// A1) al formato nuevo (una fila por pedido). Ejecutar manualmente UNA VEZ
// desde el editor (seleccionar esta funcion y Ejecutar) despues de pegar
// esta version del codigo. Si ya esta en formato nuevo, no hace nada.
function migrarFormatoDatosUnaVez() {
  conLock(function() {
    var sheet = getHojaDatos();
    var a1 = String(sheet.getRange('A1').getValue() || '').trim();
    if (a1.charAt(0) !== '[') {
      Logger.log('No hay nada que migrar - ya esta en formato nuevo o vacio.');
      return;
    }
    var arr = JSON.parse(a1);
    if (!Array.isArray(arr)) { Logger.log('A1 no es un arreglo, no se migra.'); return; }
    sheet.clearContents();
    if (arr.length) {
      var filas = arr.map(function(o) { return [JSON.stringify(o)]; });
      sheet.getRange(1, 1, filas.length, 1).setValues(filas);
    }
    Logger.log('Migracion completa: ' + arr.length + ' pedido(s) movido(s) a formato de una fila por pedido.');
  });
}

function actualizarOrden(id, fields) {
  var ordenes = leerOrdenes();
  for (var i = 0; i < ordenes.length; i++) {
    if (String(ordenes[i].id) === String(id)) {
      var keys = Object.keys(fields);
      for (var k = 0; k < keys.length; k++) ordenes[i][keys[k]] = fields[keys[k]];
      break;
    }
  }
  guardarOrdenes(ordenes);
}

function sincronizar() {
  var ordenes      = leerOrdenes();
  var nuevas       = importarVendedores(ordenes);
  var actualizadas = importarRepartidor(ordenes);
  if (nuevas > 0 || actualizadas > 0) guardarOrdenes(ordenes);
  return { ok: true, ordenes: ordenes, nuevasVentas: nuevas, entregasActualizadas: actualizadas };
}

function importarVendedores(ordenes) {
  try {
    var sheet = SpreadsheetApp.openById(SHEET_VENDEDORES).getSheets()[0];
    var data  = sheet.getDataRange().getValues();
    if (data.length < 2) return 0;
    var yaImportados = {};
    for (var i = 0; i < ordenes.length; i++) {
      if (ordenes[i]._ts) yaImportados[ordenes[i]._ts] = true;
    }
    var borrados = leerBorrados();
    for (var b = 0; b < borrados.length; b++) { yaImportados[borrados[b]] = true; }
    var count = 0;
    for (var r = 1; r < data.length; r++) {
      var row = data[r];
      var ts  = String(row[0]);
      if (yaImportados[ts]) continue;
      var nombre   = String(row[2] || '').trim();
      var contacto = String(row[3] || '').trim();
      if (!nombre || !contacto) continue;
      var vendedor  = String(row[1]  || '').trim();
      var direccion = String(row[4]  || '').trim();
      var skuRaw    = String(row[5]  || '').trim();
      var cantidad  = parseInt(row[6]) || 1;
      var precio    = parseFloat(String(row[7]).replace(/[^0-9.]/g, '')) || 0;
      var pago      = String(row[8]  || 'Transferencia').trim();
      var zona      = String(row[9]  || '').trim();
      var canal     = String(row[10] || 'Fuerza de ventas').trim();
      var notas     = String(row[11] || '').trim();
      var skus = skuRaw.split(/[,;]+/).map(function(s) { return s.trim().toUpperCase(); }).filter(Boolean);
      var id    = new Date(row[0]).getTime() + r;
      var d     = new Date();
      var orden = 'ORD-' + String(d.getFullYear()).slice(2) + String(d.getMonth()+1).padStart(2,'0') + String(d.getDate()).padStart(2,'0') + '-' + String(id).slice(-4);
      var fecha = new Date().toISOString();
      var nuevaOrdenForm = {
        id: id, orden: orden, nombre: nombre, contacto: contacto,
        direccion: direccion, zona: zona, vendedor: vendedor || 'FORM',
        precio: precio, cantidad: cantidad, total: cantidad * precio,
        canal: canal, pago: pago, productos: skus, estado: '0',
        notas: notas, fecha: fecha, _ts: ts,
        historial: [{ estado: '0', fecha: fecha, fuente: 'Google Forms' }]
      };
      ordenes.unshift(nuevaOrdenForm);
      notificarPedidoNuevo(nuevaOrdenForm);
      yaImportados[ts] = true;
      count++;
    }
    return count;
  } catch(err) { Logger.log('importarVendedores: ' + err.message); return 0; }
}

function importarRepartidor(ordenes) {
  try {
    var sheet = SpreadsheetApp.openById(SHEET_REPARTIDOR).getSheets()[0];
    var data  = sheet.getDataRange().getValues();
    if (data.length < 2) return 0;
    var count = 0;
    for (var r = 1; r < data.length; r++) {
      var row       = data[r];
      var ts        = String(row[0]);
      var repCodigo = String(row[1] || '').trim();
      var nOrden    = String(row[2] || '').trim().toUpperCase();
      var entregado = String(row[4] || '').toLowerCase().charAt(0) === 's';
      var obs       = String(row[5] || '').trim();
      if (!nOrden) continue;
      for (var i = 0; i < ordenes.length; i++) {
        if ((ordenes[i].orden || '').toUpperCase() !== nOrden) continue;
        var yaProc = (ordenes[i].historial || []).some(function(h) { return h._repTs === ts; });
        if (yaProc) break;
        var nuevoEstado = entregado ? '4' : ordenes[i].estado;
        ordenes[i].estado = nuevoEstado;
        if (!ordenes[i].historial) ordenes[i].historial = [];
        ordenes[i].historial.push({
          estado: nuevoEstado, fecha: new Date().toISOString(),
          rep: repCodigo, obs: obs, fuente: 'Google Forms Repartidor', _repTs: ts
        });
        count++;
        break;
      }
    }
    return count;
  } catch(err) { Logger.log('importarRepartidor: ' + err.message); return 0; }
}

function getHojaDatos() {
  var ss    = abrirSS(SHEET_ORDENES);
  var sheet = ss.getSheetByName(HOJA_DATOS);
  if (!sheet) { sheet = ss.insertSheet(HOJA_DATOS); sheet.getRange('A1').setValue('[]'); }
  return sheet;
}

function getHojaBorrados() {
  var ss    = abrirSS(SHEET_ORDENES);
  var sheet = ss.getSheetByName(HOJA_BORRADOS);
  if (!sheet) { sheet = ss.insertSheet(HOJA_BORRADOS); sheet.getRange('A1').setValue('[]'); }
  return sheet;
}
function leerBorrados() {
  var raw = getHojaBorrados().getRange('A1').getValue();
  try { var d = JSON.parse(raw || '[]'); return Array.isArray(d) ? d : []; } catch(e) { return []; }
}
function guardarBorrados(lista) { getHojaBorrados().getRange('A1').setValue(JSON.stringify(lista)); }
function registrarBorrado(ts) {
  if (!ts) return;
  var lista = leerBorrados();
  if (lista.indexOf(ts) < 0) { lista.push(ts); guardarBorrados(lista); }
}

function leerCatalogo() {
  try {
    // Cache en ScriptProperties (TTL 5 min) para no leer Sheets cada vez.
    var _now = Date.now();
    var _cs = PropertiesService.getScriptProperties().getProperty('CATALOGO_CACHE');
    if (_cs) {
      try {
        var _c = JSON.parse(_cs);
        if (_c.ts && (_now - _c.ts < 300000)) return _c.data;
      } catch(e) {}
    }
    var ss    = abrirSS(SHEET_CATALOGO);
    var sheet = ss.getSheetByName(HOJA_CATALOGO);
    if (!sheet) return { ok: false, error: 'Hoja Catalogo no encontrada' };
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) { var _r = { ok: true, productos: [] }; PropertiesService.getScriptProperties().setProperty('CATALOGO_CACHE', JSON.stringify({ts: _now, data: _r})); return _r; }
    var headers = data[0].map(function(h) { return String(h).toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,'_'); });
    var productos = [];
    for (var r = 1; r < data.length; r++) {
      var row = data[r];
      var obj = {};
      headers.forEach(function(h, i) { obj[h] = row[i]; });
      var activo = String(obj['ACTIVO'] || '').toUpperCase().trim();
      if (activo !== 'SI') continue;
      var sku = String(obj['SKU_BASE'] || obj['SKU'] || '').trim();
      if (!sku) continue;
      productos.push({
        sku:       sku,
        nombre:    String(obj['NOMBRE']    || '').trim(),
        coleccion: String(obj['COLECCION'] || '').trim(),
        color:     String(obj['COLOR']     || '').trim(),
        hex:       String(obj['HEX']       || '#333333').trim(),
        precio:    parseFloat(obj['PRECIO'])  || 0,
        stock:     parseInt(obj['STOCK'])     || 0,
        categoria: String(obj['CATEGORIA'] || '').trim(),
        tecnica:   String(obj['TECNICA']   || '').trim(),
        disponibilidad: String(obj['DISPONIBILIDAD'] || '').trim()
      });
    }
    var _result = { ok: true, productos: productos };
    PropertiesService.getScriptProperties().setProperty('CATALOGO_CACHE', JSON.stringify({ts: _now, data: _result}));
    return _result;
  } catch(err) {
    return { ok: false, error: err.message };
  }
}

// Descuenta stock del Catalogo cuando aparecen ordenes nuevas (no existian
// antes del guardado). Cubre tanto la Nueva Venta de index.html como
// cualquier otro flujo que use la accion 'save'. Nunca bloquea el guardado
// de la orden si algo falla aqui (por eso todo va en try/catch).
function descontarStockPorNuevasOrdenes(anteriores, nuevas) {
  try {
    var idsAntes = {};
    (anteriores || []).forEach(function(o) { idsAntes[String(o.id)] = true; });
    (nuevas || []).forEach(function(o) {
      if (idsAntes[String(o.id)]) return; // ya existia, no es una venta nueva
      var lista    = o.productos || [];
      var cantidad = parseInt(o.cantidad) || 1;
      lista.forEach(function(sku) { descontarStock(sku, cantidad); });
    });
  } catch(err) { Logger.log('descontarStockPorNuevasOrdenes: ' + err.message); }
}

// Resta 'cantidad' del STOCK de un SKU en la hoja Catalogo. Nunca deja el
// stock en negativo. Si el SKU no existe en el catalogo, no hace nada.
function descontarStock(sku, cantidad) {
  try {
    var ss    = abrirSS(SHEET_CATALOGO);
    var sheet = ss.getSheetByName(HOJA_CATALOGO);
    if (!sheet) return;
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return;
    var headers  = data[0].map(function(h) { return String(h).toUpperCase().trim().replace(/\s+/g,'_'); });
    var colSku   = headers.indexOf('SKU_BASE'); if (colSku < 0) colSku = headers.indexOf('SKU');
    var colStock = headers.indexOf('STOCK');
    if (colSku < 0 || colStock < 0) return;
    var skuNorm = String(sku).trim().toUpperCase();
    if (!skuNorm) return;
    for (var r = 1; r < data.length; r++) {
      if (String(data[r][colSku]).trim().toUpperCase() !== skuNorm) continue;
      var actual = parseInt(data[r][colStock]) || 0;
      var nuevo  = Math.max(0, actual - (parseInt(cantidad) || 1));
      sheet.getRange(r + 1, colStock + 1).setValue(nuevo);
      // Invalidar cache del catálogo para que la próxima llamada lea stock actualizado
      try { PropertiesService.getScriptProperties().deleteProperty('CATALOGO_CACHE'); } catch(e) {}
      return;
    }
  } catch(err) { Logger.log('descontarStock: ' + err.message); }
}

function buscarClienteGAS(tel, orden) {
  try {
    var ordenes = leerOrdenes();
    var solicitudes = leerSolicitudes();
    var match = [];

    // Normaliza una solicitud (transferencia) al formato de orden para reusar el render.
    function _normSol(s) {
      var est = s.estadoSolicitud === 'confirmada' ? '2'
              : s.estadoSolicitud === 'descartada' ? '9'
              : '0';
      return {
        orden:         s.ref || '',
        estado:        est,
        productos:     s.productos || [],
        fecha:         s.fecha || '',
        fechaEntrega:  '',
        cantidad:      s.cantidad || 1,
        precio:        s.precio || 0,
        total:         s.total || 0,
        pendientePago: s.estadoSolicitud === 'pendiente',
        nombre:        s.nombre || '',
        contacto:      s.contacto || '',
        fechaNac:      s.fechaNac || '',
        direccion:     s.direccion || '',
        zona:          s.zona || '',
        mapaLink:      s.mapaLink || '',
        esSolicitud:   true
      };
    }

    if (orden) {
      var ordenNorm = String(orden).trim().toUpperCase();
      var oMatch = ordenes.find(function(o) { return (o.orden || '').toUpperCase() === ordenNorm; });
      if (oMatch) {
        var telRef = String(oMatch.contacto || '').replace(/\D/g, '');
        match = ordenes.filter(function(o) { return String(o.contacto || '').replace(/\D/g, '') === telRef; });
      } else {
        var sMatch = solicitudes.find(function(s) { return (s.ref || '').toUpperCase() === ordenNorm; });
        if (sMatch) {
          var telRefS = String(sMatch.contacto || '').replace(/\D/g, '');
          match = solicitudes.filter(function(s) { return String(s.contacto || '').replace(/\D/g, '') === telRefS; }).map(_normSol);
        }
      }
    }
    if (!match.length && tel) {
      var telNorm = String(tel).replace(/\D/g, '');
      if (telNorm.length < 4) return { ok: true, encontrado: false };
      var mOrd = ordenes.filter(function(o) {
        return String(o.contacto || '').replace(/\D/g, '').indexOf(telNorm) >= 0;
      });
      var mSol = solicitudes.filter(function(s) {
        return String(s.contacto || '').replace(/\D/g, '').indexOf(telNorm) >= 0;
      }).map(_normSol);
      match = mOrd.concat(mSol);
    }
    if (!match.length) return { ok: true, encontrado: false };
    match.sort(function(a, b) { return new Date(b.fecha) - new Date(a.fecha); });
    var reciente = match[0];
    var dirsVistas = {}, dirs = [];
    match.forEach(function(o) {
      var key = (o.direccion || '').trim().toLowerCase();
      if (key && !dirsVistas[key]) {
        dirsVistas[key] = true;
        dirs.push({ direccion: o.direccion || '', zona: o.zona || '', mapaLink: o.mapaLink || '' });
      }
    });
    var ordenesRecientes = match.slice(0, 5).map(function(o) {
      return {
        orden:         o.orden        || '',
        estado:        o.estado       || '0',
        productos:     o.productos    || [],
        fecha:         (o.fecha || '').slice(0, 10),
        fechaEntrega:  o.fechaEntrega || '',
        cantidad:      o.cantidad     || 1,
        precio:        o.precio       || 0,
        total:         o.total        || 0,
        pendientePago: o.pendientePago || false,
        esSolicitud:   o.esSolicitud || false
      };
    });
    return {
      ok: true, encontrado: true,
      nombre:           reciente.nombre,
      contacto:         reciente.contacto,
      fechaNac:         reciente.fechaNac || '',
      direcciones:      dirs,
      totalPedidos:     match.length,
      ordenesRecientes: ordenesRecientes
    };
  } catch(err) { return { ok: false, error: err.message }; }
}

// ── CÓDIGO PERSONAL DE CLIENTE (4 dígitos) ──
// Almacena en PropertiesService con clave "CLI_<tel>". Se genera una sola
// vez por cliente (primer pedido) y se asocia al teléfono. El cliente lo
// necesita para consultar sus pedidos desde pedido.html.
function _telKey(tel) {
  return 'CLI_' + String(tel).replace(/\D/g, '');
}

function generarCodigoCliente(tel) {
  var telNorm = String(tel).replace(/\D/g, '');
  if (!telNorm || telNorm.length < 4) return null;
  var props = PropertiesService.getScriptProperties();
  var key = _telKey(telNorm);
  var existente = props.getProperty(key);
  if (existente) return existente; // ya tiene código, no generar otro
  // Generar código de 4 dígitos (1000-9999)
  var codigo = String(Math.floor(1000 + Math.random() * 9000));
  props.setProperty(key, codigo);
  return codigo;
}

function obtenerCodigoCliente(tel) {
  var telNorm = String(tel).replace(/\D/g, '');
  if (!telNorm) return null;
  return PropertiesService.getScriptProperties().getProperty(_telKey(telNorm)) || null;
}

// Valida código. Retorna true/false.
function validarCodigoCliente(tel, codigo) {
  var telNorm = String(tel).replace(/\D/g, '');
  var cod = String(codigo || '').trim();
  if (!telNorm || !cod || cod.length !== 4) return false;
  var guardado = PropertiesService.getScriptProperties().getProperty(_telKey(telNorm));
  return guardado === cod;
}

// Acción desde pedido.html: validar código + retornar historial
function buscarClienteSeguro(tel, codigo) {
  if (!validarCodigoCliente(tel, codigo)) {
    return { ok: true, encontrado: false, error: 'codigo_incorrecto' };
  }
  return buscarClienteGAS(tel);
}

// Acción desde pedido.html (modal "consultar mi pedido" y pantalla de teléfono):
// busca por NÚMERO DE ORDEN/SOLICITUD, exige código de acceso, y si es válido
// devuelve el historial completo del cliente (igual que buscarClienteGAS).
function buscarClienteOrdenSeguro(orden, codigo) {
  try {
    var ordenNorm = String(orden || '').trim().toUpperCase();
    if (!ordenNorm) return { ok: true, encontrado: false, error: 'sin_orden' };
    // El número de orden (ORD-/SOL-) es identificador suficiente: el código es
    // opcional. Solo se valida si se envió uno.
    if (codigo && !validarCodigoOrden(ordenNorm, codigo)) {
      return { ok: true, encontrado: false, error: 'codigo_incorrecto' };
    }
    var ordenes = leerOrdenes();
    var oMatch = ordenes.find(function(o) { return (o.orden || '').toUpperCase() === ordenNorm; });
    var contacto = null;
    if (oMatch) contacto = oMatch.contacto;
    else {
      var solicitudes = leerSolicitudes();
      var sMatch = solicitudes.find(function(s) { return (s.ref || '').toUpperCase() === ordenNorm; });
      if (sMatch) contacto = sMatch.contacto;
    }
    if (!contacto) return { ok: true, encontrado: false };
    return buscarClienteGAS(contacto, ordenNorm);
  } catch(err) { return { ok: false, error: err.message }; }
}

// Valida código contra el pedido/solicitud encontrado por orden.
function validarCodigoOrden(ordenNorm, codigo) {
  var cod = String(codigo || '').trim();
  if (!cod || cod.length !== 4) return false;
  var ordenes = leerOrdenes();
  var oMatch = ordenes.find(function(o) { return (o.orden || '').toUpperCase() === ordenNorm; });
  if (oMatch) return validarCodigoCliente(oMatch.contacto, cod);
  var solicitudes = leerSolicitudes();
  var sMatch = solicitudes.find(function(s) { return (s.ref || '').toUpperCase() === ordenNorm; });
  if (sMatch) return validarCodigoCliente(sMatch.contacto, cod);
  return false;
}

// Acción desde CRM: obtener código de un cliente por teléfono
function obtenerCodigoParaCRM(payload) {
  try {
    var tel = String(payload.tel || '').replace(/\D/g, '');
    if (!tel || tel.length < 4) return { ok: false, error: 'Teléfono inválido' };
    var codigo = obtenerCodigoCliente(tel);
    return { ok: true, codigo: codigo || null, telefono: tel };
  } catch(err) { return { ok: false, error: err.message }; }
}

// Regenerar código de un cliente (desde CRM, para soporte)
function regenerarCodigoCliente(payload) {
  try {
    var tel = String(payload.tel || '').replace(/\D/g, '');
    if (!tel || tel.length < 4) return { ok: false, error: 'Teléfono inválido' };
    var props = PropertiesService.getScriptProperties();
    var key = _telKey(tel);
    var codigo = String(Math.floor(1000 + Math.random() * 9000));
    props.setProperty(key, codigo);
    return { ok: true, codigo: codigo, telefono: tel };
  } catch(err) { return { ok: false, error: err.message }; }
}

// Obtener códigos de varios clientes en lote (para CRM Customer 360)
// Recibe un array de teléfonos y retorna {tel: codigo, ...}
function obtenerCodigosLote(payload) {
  try {
    var tels = payload.tels || [];
    var props = PropertiesService.getScriptProperties();
    var resultado = {};
    for (var i = 0; i < tels.length; i++) {
      var tel = String(tels[i]).replace(/\D/g, '');
      if (tel && tel.length >= 4) {
        var cod = props.getProperty(_telKey(tel));
        if (cod) resultado[tel] = cod;
      }
    }
    return { ok: true, codigos: resultado };
  } catch(err) { return { ok: false, error: err.message }; }
}

// Migración: genera códigos para todos los clientes existentes que no tengan uno.
// Ejecutar UNA VEZ desde el editor de Apps Script.
function migrarCodigosExistentes() {
  var props = PropertiesService.getScriptProperties();
  var ordenes = leerOrdenes();
  var telefonosVistos = {};
  var migrados = 0;
  for (var i = 0; i < ordenes.length; i++) {
    var tel = String(ordenes[i].contacto || '').replace(/\D/g, '');
    if (!tel || tel.length < 4 || telefonosVistos[tel]) continue;
    telefonosVistos[tel] = true;
    var key = _telKey(tel);
    if (!props.getProperty(key)) {
      var codigo = String(Math.floor(1000 + Math.random() * 9000));
      props.setProperty(key, codigo);
      migrados++;
    }
  }
  Logger.log('Migración completa: ' + migrados + ' códigos generados. Total teléfonos únicos: ' + Object.keys(telefonosVistos).length);
  return { ok: true, migrados: migrados, total: Object.keys(telefonosVistos).length };
}

function guardarFechaNac(payload){
  try {
    var contacto = String(payload.contacto || '').trim().replace(/\D/g, '');
    var fechaNac = String(payload.fechaNac || '').trim();
    if (!contacto || !fechaNac) return { ok: false, error: 'Faltan datos' };
    var ordenes = leerOrdenes();
    var match = ordenes.filter(function(o) {
      return String(o.contacto || '').replace(/\D/g, '') === contacto;
    });
    if (!match.length) return { ok: false, error: 'No se encontraron pedidos para este contacto' };
    match.sort(function(a, b) { return new Date(b.fecha) - new Date(a.fecha); });
    var masReciente = match[0];
    var ordenesActualizadas = ordenes.map(function(o) {
      if (String(o.id) === String(masReciente.id)) o.fechaNac = fechaNac;
      return o;
    });
    guardarOrdenes(ordenesActualizadas);
    return { ok: true };
  } catch(err) { return { ok: false, error: err.message }; }
}

function guardarPedidoWeb(payload) {
  try {
    // Valida CADA sku contra el catalogo real y usa SIEMPRE el precio del
    // catalogo (nunca el que manda el cliente) -- evita pedidos con SKU
    // inventado o precio manipulado desde el navegador. Acepta varios
    // productos en un mismo pedido (payload.items = [{sku,cantidad}, ...],
    // pensado para que un cliente B2C pueda pedir, por ejemplo, un gorro
    // para su pareja y otro para un hijo en un solo pedido). Si llega el
    // formato viejo de un solo producto (payload.sku suelto), se trata
    // igual como un pedido de un solo item -- no rompe nada existente.
    var catalogo = leerCatalogo();
    if (!catalogo.ok) return { ok: false, error: 'No se pudo validar el catalogo, intenta de nuevo.' };

    var itemsSolicitados = Array.isArray(payload.items) && payload.items.length
      ? payload.items
      : (payload.sku ? [{ sku: payload.sku, cantidad: payload.cantidad }] : []);
    if (!itemsSolicitados.length) return { ok: false, error: 'El pedido no tiene ningun producto.' };

    var itemsValidados = [];
    for (var i = 0; i < itemsSolicitados.length; i++) {
      var skuSolicitado = String(itemsSolicitados[i].sku || '').trim().toUpperCase();
      var producto = null;
      for (var j = 0; j < catalogo.productos.length; j++) {
        if (String(catalogo.productos[j].sku).trim().toUpperCase() === skuSolicitado) { producto = catalogo.productos[j]; break; }
      }
      if (!producto) return { ok: false, error: 'Producto no disponible: ' + skuSolicitado };
      var cant = parseInt(itemsSolicitados[i].cantidad) || 1;
      if (cant < 1) cant = 1;
      itemsValidados.push({ sku: producto.sku, precio: producto.precio, cantidad: cant });
    }

    // productos: un elemento del arreglo por CADA unidad (repetido segun la
    // cantidad de cada item) -- asi el conteo de stock/reportes que ya
    // existe en el resto del sistema (que cuenta ocurrencias en este mismo
    // arreglo) sigue funcionando exactamente igual, sin tocar nada mas.
    var productosArr = [];
    var cantidadTotal = 0;
    var totalPedido = 0;
    itemsValidados.forEach(function(it) {
      for (var k = 0; k < it.cantidad; k++) productosArr.push(it.sku);
      cantidadTotal += it.cantidad;
      totalPedido += it.precio * it.cantidad;
    });
    var recargoEnvio = parseFloat(payload.recargoEnvio) || 0;
    totalPedido += recargoEnvio;
    var precioPromedio = cantidadTotal > 0 ? (totalPedido - recargoEnvio) / cantidadTotal : 0;

    var d   = new Date();
    var id  = d.getTime();
    var orden = 'ORD-' + String(d.getFullYear()).slice(2) + String(d.getMonth()+1).padStart(2,'0') + String(d.getDate()).padStart(2,'0') + '-' + String(id).slice(-4);
    var fecha = d.toISOString();
    var fe = new Date(d), dias = 0;
    while (dias < 3) { fe.setDate(fe.getDate() + 1); if (fe.getDay() !== 0) dias++; }
    // Generar código personal de 4 dígitos para el cliente (si es nuevo, crea uno;
    // si ya existe, conserva el actual). Se guarda en PropertiesService y en la orden.
    var _codigoCliente = generarCodigoCliente(payload.contacto);
    var nuevaOrden = {
      id: id, orden: orden,
      nombre:        String(payload.nombre    || '').trim(),
      contacto:      String(payload.contacto  || '').trim(),
      direccion:     String(payload.direccion || '').trim(),
      zona:          String(payload.zona      || 'Canal Digital').trim(),
      recargoEnvio:  recargoEnvio,
      vendedor:      (function(){
        var vRef = String(payload.vendedorRef || '').trim().toUpperCase();
        return CODIGOS_VENDEDORAS_WEB.indexOf(vRef) >= 0 ? vRef : 'WEB';
      })(),
      precio:        precioPromedio,
      cantidad:      cantidadTotal,
      total:         totalPedido,
      canal:         'Canal Digital',
      pago:          payload.metodoPago === 'tarjeta' ? 'Tarjeta' : 'Transferencia',
      productos:     productosArr,
      estado:        '0',
      notas:         String(payload.notas || '').trim(),
      fecha:         fecha,
      fechaEntrega:  fe.toISOString().slice(0, 10),
      mapaLink:      String(payload.mapaLink || ''),
      email:         String(payload.email || '').trim(),
      fechaNac:      String(payload.fechaNac || '').trim(),
      metodoPago:    payload.metodoPago || 'transferencia',
      pendientePago: true,
      pendienteDesde: fecha,
      consumoInterno: false,
      codigo_cliente: _codigoCliente || '',
      historial: [{ estado: '0', fecha: fecha, fuente: 'Canal Digital Web' }]
    };
    // Append directo a la hoja (lee+reescribe). Para pedidos nuevos solo
    // necesitamos agregar una fila, NO leer todo el Sheet y reescribirlo
    // (leerOrdenes+guardarOrdenes ~2s).  CRM sigue usando
    // leerOrdenes/guardarOrdenes para lecturas/actualizaciones completas.
    var _hoja = getHojaDatos();
    _hoja.appendRow([JSON.stringify(nuevaOrden)]);
    itemsValidados.forEach(function(it){ descontarStock(it.sku, it.cantidad); });
    // Para TARJETA se salta el correo "Nuevo pedido": el pago se confirma en
    // segundos via webhook Wompi, que ya manda el correo "Pago confirmado".
    // Asi el boton no espera el envio de correo (MailApp ~1-4s) y va mas
    // rapido a Wompi. Transferencia (solicitud) sigue avisando con
    // notificarSolicitudNueva.
    if (payload.metodoPago !== 'tarjeta') notificarPedidoNuevo(nuevaOrden);
    // Para TARJETA: crear enlace Wompi EN LA MISMA LLAMADA para que el
    // frontend redirija directo sin 2da llamada (ahorra ~2.5s).
    var _result = { ok: true, orden: orden, fechaEntrega: fe.toISOString().slice(0, 10), codigo_cliente: _codigoCliente || '' };
    if (payload.metodoPago === 'tarjeta') {
      try {
        var _token = wompiAutenticar();
        if (_token) {
          var _body = {
            amount_in_cents: Math.round(totalPedido * 100),
            currency: 'USD',
            payment_method: { type: 'PSE' },
            reference: orden,
            customer_data: {
              email: payload.email || payload.correo || '',
              phone_number: payload.contacto || payload.telefono || '',
              full_name: payload.nombre || ''
            },
            billing_data: {
              address: {
                address_line_1: payload.direccion || '',
                address_line_2: payload.colonia || '',
                city: payload.zona || '',
                country: 'SV'
              }
            },
            redirect_url: 'https://www.nugudustore.com/'
          };
          var _res = UrlFetchApp.fetch('https://api.wompi.sv/v1/checkout/sessions', {
            method: 'post',
            contentType: 'application/json',
            headers: { 'Authorization': 'Bearer ' + _token },
            muteHttpExceptions: true,
            payload: JSON.stringify(_body)
          });
          var _data = JSON.parse(_res.getContentText());
          if (_data && _data.data && _data.data.payment_method && _data.data.payment_method.redirect_url) {
            _result.urlEnlace = _data.data.payment_method.redirect_url;
          }
        }
      } catch(e) { Logger.log('guardarPedidoWeb Wompi link error: ' + e.message); /* fallback: frontend llamará crearEnlacePago */ }
    }
    return _result;
  } catch(err) { return { ok: false, error: err.message }; }
}

// ── SOLICITUDES DE TRANSFERENCIA (pago pendiente de verificación) ──
// Flujo nuevo: el cliente elige transferencia, se registra una SOLICITUD
// (ref SOL-…) SIN crear orden ni descontar stock (antes se creaba la ORD-…
// al instante = "orden fantasma"). La encargada la ve en el CRM ("Pagos
// pendientes"), verifica el pago y al confirmar SÍ se crea la ORD-… real
// (con pagoConfirmado) y se descuenta stock. La hoja 'solicitudes' guarda
// una solicitud por fila en JSON (columna A), igual que la hoja 'datos'.
function getHojaSolicitudes() {
  var ss    = abrirSS(SHEET_ORDENES);
  var sheet = ss.getSheetByName(HOJA_SOLICITUDES);
  if (!sheet) { sheet = ss.insertSheet(HOJA_SOLICITUDES); sheet.getRange('A1').setValue('[]'); }
  return sheet;
}

function leerSolicitudes() {
  // Cache 30s (igual que leerOrdenes) para que la consulta de tracking sea rapida.
  var props = PropertiesService.getScriptProperties();
  var cached = props.getProperty('SOLICITUDES_CACHE');
  var cacheExp = parseInt(props.getProperty('SOLICITUDES_CACHE_EXP') || '0');
  if (cached && Date.now() < cacheExp) {
    try { return JSON.parse(cached); } catch(e) {}
  }
  var sheet   = getHojaSolicitudes();
  var lastRow = sheet.getLastRow();
  if (lastRow < 1) {
    try { props.setProperty('SOLICITUDES_CACHE', '[]'); props.setProperty('SOLICITUDES_CACHE_EXP', String(Date.now() + 30000)); } catch(e) {}
    return [];
  }
  var values  = sheet.getRange(1, 1, lastRow, 1).getValues();
  var lista   = [];
  for (var i = 0; i < values.length; i++) {
    var raw = values[i][0];
    if (!raw) continue;
    try {
      var s = JSON.parse(raw);
      if (s && typeof s === 'object' && !Array.isArray(s)) lista.push(s);
    } catch(e) { /* fila invalida - se ignora, no rompe el restro */ }
  }
  try { props.setProperty('SOLICITUDES_CACHE', JSON.stringify(lista)); props.setProperty('SOLICITUDES_CACHE_EXP', String(Date.now() + 30000)); } catch(e) {}
  return lista;
}

function guardarSolicitudes(lista) {
  var sheet = getHojaSolicitudes();
  sheet.clearContents();
  if (!lista || !lista.length) return;
  var filas = lista.map(function(s) { return [JSON.stringify(s)]; });
  sheet.getRange(1, 1, filas.length, 1).setValues(filas);
  // Invalidar cache de leerOrdenes y leerSolicitudes por si cambió el historial
  try {
    var props = PropertiesService.getScriptProperties();
    props.deleteProperty('ORDENES_CACHE');
    props.deleteProperty('ORDENES_CACHE_EXP');
    props.deleteProperty('SOLICITUDES_CACHE');
    props.deleteProperty('SOLICITUDES_CACHE_EXP');
  } catch(e) {}
}

// Registra una solicitud de transferencia desde pedido.html. Valida los
// SKUs contra el catalogo (mismo criterio que guardarPedidoWeb), pero NO
// crea orden, NO descuenta stock y NO genera numero ORD-. El cliente recibe
// la ref SOL-... como confirmacion de que su solicitud quedo registrada.
function guardarSolicitudWeb(payload) {
  try {
    var catalogo = leerCatalogo();
    if (!catalogo.ok) return { ok: false, error: 'No se pudo validar el catalogo, intenta de nuevo.' };

    var itemsSolicitados = Array.isArray(payload.items) && payload.items.length
      ? payload.items
      : (payload.sku ? [{ sku: payload.sku, cantidad: payload.cantidad }] : []);
    if (!itemsSolicitados.length) return { ok: false, error: 'La solicitud no tiene ningun producto.' };

    var itemsValidados = [];
    for (var i = 0; i < itemsSolicitados.length; i++) {
      var skuSolicitado = String(itemsSolicitados[i].sku || '').trim().toUpperCase();
      var producto = null;
      for (var j = 0; j < catalogo.productos.length; j++) {
        if (String(catalogo.productos[j].sku).trim().toUpperCase() === skuSolicitado) { producto = catalogo.productos[j]; break; }
      }
      if (!producto) return { ok: false, error: 'Producto no disponible: ' + skuSolicitado };
      var cant = parseInt(itemsSolicitados[i].cantidad) || 1;
      if (cant < 1) cant = 1;
      itemsValidados.push({ sku: producto.sku, precio: producto.precio, cantidad: cant });
    }

    var productosArr = [];
    var cantidadTotal = 0;
    var totalSolicitud = 0;
    itemsValidados.forEach(function(it) {
      for (var k = 0; k < it.cantidad; k++) productosArr.push(it.sku);
      cantidadTotal += it.cantidad;
      totalSolicitud += it.precio * it.cantidad;
    });
    var recargoEnvio = parseFloat(payload.recargoEnvio) || 0;
    totalSolicitud += recargoEnvio;

    // Generar código personal de 4 dígitos del cliente (si es nuevo lo crea,
    // si ya existe conserva el actual). Se guarda en PropertiesService y en la solicitud.
    var _codigoCliente = generarCodigoCliente(payload.contacto);

    var d   = new Date();
    var id  = d.getTime();
    var ref = 'SOL-' + String(d.getFullYear()).slice(2) + String(d.getMonth()+1).padStart(2,'0') + String(d.getDate()).padStart(2,'0') + '-' + String(id).slice(-4);
    var fecha = d.toISOString();

    var solicitud = {
      id: id, ref: ref,
      nombre:        String(payload.nombre    || '').trim(),
      contacto:      String(payload.contacto  || '').trim(),
      direccion:     String(payload.direccion || '').trim(),
      zona:          String(payload.zona      || 'Canal Digital').trim(),
      recargoEnvio:  recargoEnvio,
      vendedor:      (function(){
        var vRef = String(payload.vendedorRef || '').trim().toUpperCase();
        return CODIGOS_VENDEDORAS_WEB.indexOf(vRef) >= 0 ? vRef : 'WEB';
      })(),
      cantidad:      cantidadTotal,
      total:         totalSolicitud,
      productos:     productosArr,
      items:         itemsValidados,
      canal:         'Canal Digital',
      notas:         String(payload.notas || '').trim(),
      fecha:         fecha,
      mapaLink:      String(payload.mapaLink || ''),
      email:         String(payload.email || '').trim(),
      fechaNac:      String(payload.fechaNac || '').trim(),
      metodoPago:    'transferencia',
      estadoSolicitud: 'pendiente',
      codigo_cliente: _codigoCliente || '',
      creadoDesde:   'pedidoWeb'
    };
    // Append directo a la hoja (misma optimización que guardarPedidoWeb).
    var _hojaS = getHojaSolicitudes();
    _hojaS.appendRow([JSON.stringify(solicitud)]);
    // Correo en segundo plano (cola + trigger) para que el registro responda
    // al instante y no se bloquee esperando a GmailApp. Nunca se pierde: si la
    // cola falla, se manda sincrono como respaldo.
    encolarCorreoSolicitud(solicitud);
    return { ok: true, ref: ref, solicitud: ref, codigo_cliente: _codigoCliente || '' };
  } catch(err) { return { ok: false, error: err.message }; }
}

// Envia un correo a NOTIFY_EMAIL cuando se registra una solicitud de
// transferencia (ref SOL-...). Es distinto de notificarPedidoNuevo porque
// aqui todavia no existe una ORD-: la encargada va a CRM > Pagos pendientes
// a verificar el pago y confirmar (ahi si se genera la orden).
function notificarSolicitudNueva(sol) {
  try {
    var productos = (sol.productos || []).join(', ');
    var total     = sol.total != null ? sol.total : 0;
    var codCli    = obtenerCodigoCliente(sol.contacto) || sol.codigo_cliente || '-';
    var asunto = 'Nueva solicitud para verificación de pago (transferencia) - ' + sol.ref;
    var cuerpo =
      'Se registro una solicitud de transferencia en Nugudu Store (pago pendiente de verificar).\n\n' +
      'Referencia: ' + sol.ref + '\n' +
      'Cliente: '    + (sol.nombre    || '-') + '\n' +
      'Contacto: '   + (sol.contacto  || '-') + '\n' +
      'Código cliente: ' + codCli + '\n' +
      'Direccion: '  + (sol.direccion || '-') + '\n' +
      'Zona: '       + (sol.zona      || '-') + '\n' +
      'Producto(s): '+ (productos     || '-') + '\n' +
      'Cantidad: '   + (sol.cantidad  || 1) + '\n' +
      'Total: $'     + Number(total).toFixed(2) + '\n' +
      (sol.notas ? ('Notas: ' + sol.notas + '\n') : '') +
      '\nVe a CRM > Pagos pendientes para confirmar o descartar la solicitud.';
    MailApp.sendEmail(NOTIFY_EMAIL, asunto, cuerpo);
  } catch (err) {
    Logger.log('notificarSolicitudNueva: ' + err.message);
  }
}

// ── COLA DE CORREO DE SOLICITUDES (segundo plano, trigger cada 1 min) ──
// El registro de solicitud devuelve al instante; el correo se encola y se
// manda en background por un trigger timeBased. Si la cola falla, se manda
// sincrono como respaldo para no perder la notificacion.
function encolarCorreoSolicitud(sol) {
  try {
    var props = PropertiesService.getScriptProperties();
    var q = [];
    try { q = JSON.parse(props.getProperty('SOLICITUD_EMAIL_QUEUE') || '[]'); } catch (e) { q = []; }
    q.push(sol);
    props.setProperty('SOLICITUD_EMAIL_QUEUE', JSON.stringify(q));
    asegurarTriggerCorreoSolicitud();
  } catch (e) {
    notificarSolicitudNueva(sol); // respaldo sincrono si la cola falla
  }
}
function asegurarTriggerCorreoSolicitud() {
  try {
    var triggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === 'procesarColaCorreoSolicitud') return;
    }
    ScriptApp.newTrigger('procesarColaCorreoSolicitud').timeBased().everyMinutes(1).create();
  } catch (e) {}
}
function procesarColaCorreoSolicitud() {
  try {
    var props = PropertiesService.getScriptProperties();
    var q = [];
    try { q = JSON.parse(props.getProperty('SOLICITUD_EMAIL_QUEUE') || '[]'); } catch (e) { q = []; }
    if (!q.length) return;
    var pendientes = [];
    for (var i = 0; i < q.length; i++) {
      try { notificarSolicitudNueva(q[i]); }
      catch (e) { pendientes.push(q[i]); }
    }
    props.setProperty('SOLICITUD_EMAIL_QUEUE', JSON.stringify(pendientes));
  } catch (e) {}
}

// Convierte una solicitud aprobada en una ORDEN real con pago confirmado.
// Re-verifica el stock AL MOMENTO de confirmar (pudo cambiar entre que el
// cliente pidio y que la encargada confirmo). Crea la orden con la misma
// estructura que guardarPedidoWeb, descuenta stock, notifica y liga la
// solicitud a la orden.
function confirmarSolicitudWeb(payload) {
  var ref = String(payload.ref || '').trim().toUpperCase();
  if (!ref) throw new Error('Falta la referencia de la solicitud.');
  var solicitudes = leerSolicitudes();
  var sol = null, idx = -1;
  for (var i = 0; i < solicitudes.length; i++) {
    if (String(solicitudes[i].ref).trim().toUpperCase() === ref) { sol = solicitudes[i]; idx = i; break; }
  }
  if (!sol) throw new Error('Solicitud no encontrada: ' + ref);
  if (sol.estadoSolicitud !== 'pendiente') throw new Error('La solicitud ya fue ' + sol.estadoSolicitud + '.');

  var catalogo = leerCatalogo();
  if (!catalogo.ok) throw new Error('No se pudo validar el catalogo, intenta de nuevo.');
  var sinStock = [];
  (sol.items || []).forEach(function(it) {
    var producto = null;
    for (var j = 0; j < catalogo.productos.length; j++) {
      if (String(catalogo.productos[j].sku).trim().toUpperCase() === String(it.sku).toUpperCase()) { producto = catalogo.productos[j]; break; }
    }
    if (!producto) sinStock.push(it.sku);
    else if ((producto.stock || 0) < it.cantidad) sinStock.push(it.sku + ' (stock: ' + producto.stock + ')');
  });
  if (sinStock.length) throw new Error('Stock insuficiente para: ' + sinStock.join(', '));

  var ordenes = leerOrdenes();
  var d   = new Date();
  var id  = d.getTime();
  var orden = 'ORD-' + String(d.getFullYear()).slice(2) + String(d.getMonth()+1).padStart(2,'0') + String(d.getDate()).padStart(2,'0') + '-' + String(id).slice(-4);
  var fecha = d.toISOString();
  var fe = new Date(d), dias = 0;
  while (dias < 3) { fe.setDate(fe.getDate() + 1); if (fe.getDay() !== 0) dias++; }
  var total   = sol.total || 0;
  var recargo = sol.recargoEnvio || 0;
  var cantidadTotal = sol.cantidad || 0;
  var precioPromedio = cantidadTotal > 0 ? (total - recargo) / cantidadTotal : 0;
  // Generar/obtener código personal del cliente para esta orden
  var _codigoCliente = generarCodigoCliente(sol.contacto);
  var nuevaOrden = {
    id: id, orden: orden,
    nombre:        sol.nombre,
    contacto:      sol.contacto,
    direccion:     sol.direccion,
    zona:          sol.zona,
    recargoEnvio:  recargo,
    vendedor:      sol.vendedor || 'WEB',
    precio:        precioPromedio,
    cantidad:      cantidadTotal,
    total:         total,
    canal:         'Canal Digital',
    pago:          'Transferencia',
    productos:     sol.productos || [],
    estado:        '0',
    notas:         sol.notas || '',
    fecha:         fecha,
    fechaEntrega:  fe.toISOString().slice(0, 10),
    mapaLink:      sol.mapaLink || '',
    email:         sol.email || '',
    fechaNac:      sol.fechaNac || '',
    metodoPago:    'transferencia',
    pagoConfirmado: true,
    pendientePago:  false,
    pagoFecha:      fecha,
    consumoInterno: false,
    codigo_cliente: _codigoCliente || '',
    historial: [{ estado: '0', fecha: fecha, fuente: 'Canal Digital Web · pago verificado' }]
  };
  ordenes.unshift(nuevaOrden);
  guardarOrdenes(ordenes);
  (sol.items || []).forEach(function(it){ descontarStock(it.sku, it.cantidad); });
  notificarPedidoNuevo(nuevaOrden);

  solicitudes[idx].estadoSolicitud = 'confirmada';
  solicitudes[idx].orden = orden;
  solicitudes[idx].confirmadaEn = fecha;
  guardarSolicitudes(solicitudes);
  return { ok: true, orden: orden };
}

function descartarSolicitudWeb(payload) {
  var ref = String(payload.ref || '').trim().toUpperCase();
  if (!ref) throw new Error('Falta la referencia de la solicitud.');
  var solicitudes = leerSolicitudes();
  var idx = -1;
  for (var i = 0; i < solicitudes.length; i++) {
    if (String(solicitudes[i].ref).trim().toUpperCase() === ref) { idx = i; break; }
  }
  if (idx < 0) throw new Error('Solicitud no encontrada: ' + ref);
  solicitudes.splice(idx, 1);
  guardarSolicitudes(solicitudes);
  return { ok: true };
}

// Busca una orden por su numero ORD-XXXXX y devuelve el objeto completo.
// Se usa desde "Mi Diseño" en pedido.html para que un cliente pueda ver el
// detalle de su pedido y pagar sin tener que empezar desde cero.
function buscarOrdenWeb(payload) {
  try {
    var ordBuscar = String(payload.orden || '').trim().toUpperCase();
    if (!ordBuscar) return { ok: false, error: 'Falta el numero de orden.' };
    var ordenes = leerOrdenes();
    for (var i = 0; i < ordenes.length; i++) {
      if (String(ordenes[i].orden).trim().toUpperCase() === ordBuscar) {
        var o = ordenes[i];
        // Devolver solo los campos que necesita el frontend (nada sensible)
        return { ok: true, orden: {
          id: o.id, orden: o.orden,
          nombre: o.nombre, contacto: o.contacto,
          direccion: o.direccion, zona: o.zona,
          items: o.items || [],
          total: o.total || 0,
          notas: o.notas,
          fecha: o.fecha,
          email: o.email,
          metodoPago: o.metodoPago,
          estado: o.estado,
          productos: o.productos,
          cantidad: o.cantidad,
          precio: o.precio,
          codigo_cliente: o.codigo_cliente || ''
        }};
      }
    }
    return { ok: false, error: 'No se encontró ninguna orden con ese número.' };
  } catch(err) { return { ok: false, error: err.message }; }
}

// Actualiza datos de entrega de una orden existente (Mi Diseño).
function actualizarDatosWeb(payload) {
  var ordBuscar = String(payload.orden || '').trim().toUpperCase();
  if (!ordBuscar) throw new Error('Falta el numero de orden.');
  var ordenes = leerOrdenes();
  for (var i = 0; i < ordenes.length; i++) {
    if (String(ordenes[i].orden).trim().toUpperCase() === ordBuscar) {
      if (payload.nombre    != null) ordenes[i].nombre    = String(payload.nombre).trim();
      if (payload.contacto  != null) ordenes[i].contacto  = String(payload.contacto).trim();
      if (payload.direccion != null) ordenes[i].direccion = String(payload.direccion).trim();
      if (payload.zona      != null) ordenes[i].zona      = String(payload.zona).trim();
      if (payload.notas     != null) ordenes[i].notas     = String(payload.notas).trim();
      guardarOrdenes(ordenes);
      return { ok: true };
    }
  }
  throw new Error('No se encontró ninguna orden con ese número.');
}

// Arma el mismo mensaje de datos bancarios que ya usa el boton "Enviar
// datos bancarios" del tracking en index.html -- centralizado aca para que
// el correo de notificacion y el tracking manden exactamente el mismo texto.
function mensajeDatosBancarios(orden) {
  var total = orden.total != null ? orden.total : (orden.precio || 0) * (orden.cantidad || 1);
  return 'Hola ' + (orden.nombre || '') + ', aqui estan los datos para confirmar tu pedido ' + orden.orden + ':\n\n' +
    'Banco Agricola\n' +
    'Cuenta de ahorro: 3008410011\n' +
    'Nombre: Nuria Guadalupe Duran Rodriguez\n' +
    'Monto a transferir: $' + Number(total).toFixed(2) + '\n\n' +
    'Cuando realices la transferencia, envianos el comprobante por este mismo chat y confirmamos tu pedido. Gracias.';
}
function linkWhatsAppBancario(orden) {
  var num = String(orden.contacto || '').replace(/\D/g, '');
  return 'https://wa.me/' + num + '?text=' + encodeURIComponent(mensajeDatosBancarios(orden));
}

// Envia un correo a NOTIFY_EMAIL cuando llega un pedido nuevo, ya sea desde
// pedido.html o importado de Google Forms. Ademas del texto de siempre,
// ahora incluye un boton que abre WhatsApp con los datos bancarios ya
// escritos -- pasa primero por irWhatsAppBancario (accion de doGet) para
// marcar la orden como "datos bancarios enviados" ANTES de redirigir, asi
// el tracking en index.html sabe (desde cualquier dispositivo) que ya se
// mando, sin importar si se hizo desde el correo o desde el CRM. Es un
// canal adicional al badge del panel — si falla, no interrumpe el guardado
// de la orden (por eso va en su propio try/catch).
function notificarPedidoNuevo(orden) {
  try {
    var productos = (orden.productos || []).join(', ');
    var total     = orden.total != null ? orden.total : (orden.precio || 0) * (orden.cantidad || 1);
    var codCli    = obtenerCodigoCliente(orden.contacto) || orden.codigo_cliente || '-';
    var asunto = 'Nuevo pedido - ' + orden.orden;
    var cuerpo =
      'Ha llegado un nuevo pedido a Nugudu Store.\n\n' +
      'Orden: '      + orden.orden + '\n' +
      'Cliente: '    + (orden.nombre   || '-') + '\n' +
      'Contacto: '   + (orden.contacto || '-') + '\n' +
      'Código cliente: ' + codCli + '\n' +
      'Direccion: '  + (orden.direccion|| '-') + '\n' +
      'Zona: '       + (orden.zona     || '-') + '\n' +
      'Producto(s): '+ (productos      || '-') + '\n' +
      'Cantidad: '   + (orden.cantidad || 1) + '\n' +
      'Total: $'     + Number(total).toFixed(2) + '\n' +
      'Canal: '      + (orden.canal    || '-') + '\n' +
      (orden.notas ? ('Notas: ' + orden.notas + '\n') : '') +
      '\nRevisa el CRM para mas detalles.';
    var cuerpoHtml =
      '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222;line-height:1.6;max-width:480px">' +
      '<p>Ha llegado un nuevo pedido a <b>Nugudu Store</b>.</p>' +
      '<p>' +
        '<b>Orden:</b> ' + escHtml(orden.orden) + '<br>' +
        '<b>Cliente:</b> ' + escHtml(orden.nombre || '-') + '<br>' +
        '<b>Contacto:</b> ' + escHtml(orden.contacto || '-') + '<br>' +
        '<b>Código cliente:</b> ' + escHtml(codCli) + '<br>' +
        '<b>Direccion:</b> ' + escHtml(orden.direccion || '-') + '<br>' +
        '<b>Zona:</b> ' + escHtml(orden.zona || '-') + '<br>' +
        '<b>Producto(s):</b> ' + escHtml(productos || '-') + '<br>' +
        '<b>Cantidad:</b> ' + (orden.cantidad || 1) + '<br>' +
        '<b>Total:</b> $' + Number(total).toFixed(2) + '<br>' +
        '<b>Canal:</b> ' + escHtml(orden.canal || '-') +
        (orden.notas ? ('<br><b>Notas:</b> ' + escHtml(orden.notas)) : '') +
      '</p>' +
      '<p style="color:#666;font-size:12px">Revisa el CRM para mas detalles.</p>' +
      '</div>';
    MailApp.sendEmail(NOTIFY_EMAIL, asunto, cuerpo, { htmlBody: cuerpoHtml });
  } catch (err) {
    Logger.log('notificarPedidoNuevo: ' + err.message);
  }
}
function escHtml(s) {
  return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// Geocodifica una direccion escrita a mano (SIN importar el orden de las
// palabras: "avenida x casa 9" o "residencial x villa y poligono z casa n"
// funcionan igual). Se probaron dos caminos gratis antes de esto y ninguno
// resulto confiable: Nominatim (bloqueaba las peticiones automaticas, tanto
// desde el navegador como desde el servidor) y Google Maps sin API (no
// entrega nada a un servidor que no ejecute JavaScript). LocationIQ es un
// servicio pensado justamente para uso automatico/programatico como este,
// con cuenta gratuita (locationiq.com) -- por eso ahora se usa esta.
// ORDEN (general para TODAS las direcciones): la direccion es el termino de
// busqueda (lo que se ubica) y la ZONA de envio es la guia que la lleva al
// punto correcto:
//   1) Se busca la direccion PEGADA a la zona (query "direccion, zona, El
//      Salvador") con viewbox bounded=1 alrededor de la zona: el resultado
//      queda forzosamente dentro del radio (~15 km) de la zona. Asi la zona
//      lleva cualquier direccion al punto correcto de su area.
//   2) Si eso no encuentra nada, se busca la direccion sola (segunda chance).
//      Si cae lejos de la zona, dentro_zona=false y el frontend mueve el pin
//      a la zona con el aviso de arrastrar al punto exacto.
//   3) Si tampoco, se devuelve la zona como punto seguro.
// Todo con countrycodes=sv (El Salvador) en TODAS las consultas, con
// reintentos ante el rate limit (429) de LocationIQ: el pin nunca sale del
// pais. La respuesta devuelve zona_lat/zona_lng/dentro_zona para el frontend.
// Limpia la direccion quitando ruido que confunde al geocoder (etapa, casa,
// lote, piso, etc.) pero mantiene lo que importa: urbanizacion, residencial,
// colonia, avenida, calle, kilometro, barrio.
function limpiarDireccion(dir) {
  var t = String(dir || '').trim();
  if (!t) return t;
  t = t.replace(/\betapa\s*[A-Za-z0-9]+\b/gi, '');
  t = t.replace(/\bcasa\s*[A-Za-z0-9]+\b/gi, '');
  t = t.replace(/\blote\s*[A-Za-z0-9]+\b/gi, '');
  t = t.replace(/\bpiso\s*[A-Za-z0-9]+\b/gi, '');
  t = t.replace(/\blocal\s*[A-Za-z0-9]+\b/gi, '');
  t = t.replace(/\bdepartamento\s*[A-Za-z0-9]+\b/gi, '');
  t = t.replace(/\bapto\s*[A-Za-z0-9]+\b/gi, '');
  t = t.replace(/\bbloque\s*[A-Za-z0-9]+\b/gi, '');
  t = t.replace(/\bno\.\s*[A-Za-z0-9]+\b/gi, '');
  t = t.replace(/#\s*[A-Za-z0-9]+\b/g, '');
  t = t.replace(/\bpoligono\s*[A-Za-z0-9]+\b/gi, '');
  t = t.replace(/\s{2,}/g, ' ').trim();
  return t;
}

function geocodificarDireccion(direccion, zona) {
  var resultado;
  try {
    var dir = String(direccion || '').trim();
    if (!dir) { resultado = { ok: false, error: 'Direccion vacia' }; return guardarDebugGeo(dir, zona, resultado); }
    if (!LOCATIONIQ_KEY || LOCATIONIQ_KEY.indexOf('PEGA_AQUI') === 0) {
      resultado = { ok: false, error: 'Falta configurar LOCATIONIQ_KEY en Code_1.gs' };
      return guardarDebugGeo(dir, zona, resultado);
    }
    var zonaTxt = String(zona || '').trim();
    dir = limpiarDireccion(dir);
    var zonaGeo = zonaTxt ? geocodificarSimple(zonaTxt) : null;
    var addrGeo = null;
    var dentro  = false;
    if (zonaGeo) {
      // 1) La zona lleva la direccion al punto: direccion + zona con viewbox
      //    bounded alrededor de la zona (el resultado queda dentro de ella).
      addrGeo = geoBuscar(dir + ', ' + zonaTxt, zonaGeo, true);
      if (addrGeo) dentro = true;
      // 2) Segunda chance: la direccion sola. Si cae lejos de la zona, el
      //    frontend igual mueve el pin a la zona (dentro_zona=false).
      if (!addrGeo) {
        addrGeo = geocodificarSimple(dir);
        if (addrGeo) dentro = distanciaKm(addrGeo.lat, addrGeo.lng, zonaGeo.lat, zonaGeo.lng) <= 5;
      }
      if (addrGeo) {
        var res = { ok: true, lat: String(addrGeo.lat), lng: String(addrGeo.lng),
                    zona_lat: zonaGeo.lat, zona_lng: zonaGeo.lng, dentro_zona: dentro };
        return guardarDebugGeo(dir, zonaTxt, res);
      }
      // 3) Fallback: la zona como punto seguro.
      resultado = { ok: false, error: 'No se encontraron coordenadas para la direccion', zona_lat: zonaGeo.lat, zona_lng: zonaGeo.lng };
      return guardarDebugGeo(dir, zonaTxt, resultado);
    }
    // Sin zona: se ubica la direccion sola.
    addrGeo = geocodificarSimple(dir);
    if (addrGeo) {
      resultado = { ok: true, lat: String(addrGeo.lat), lng: String(addrGeo.lng) };
      return guardarDebugGeo(dir, zonaTxt, resultado);
    }
    resultado = { ok: false, error: 'No se encontraron coordenadas para la direccion' };
    return guardarDebugGeo(dir, zonaTxt, resultado);
  } catch (e) {
    resultado = { ok: false, error: e.message };
    return guardarDebugGeo(String(direccion || '').trim(), String(zona || '').trim(), resultado);
  }
}

// Guarda el ultimo intento de geocodificacion en las Propiedades del script
// para que verUltimoDebugGeo() / action debugGeo puedan mostrarlo.
function guardarDebugGeo(dir, zonaTxt, resultado) {
  try {
    PropertiesService.getScriptProperties().setProperty(
      'ULTIMO_DEBUG_GEO',
      new Date().toLocaleString() + ' | dir="' + dir + '" | zona="' + zonaTxt + '" | resultado=' + JSON.stringify(resultado)
    );
  } catch (pe) {}
  return resultado;
}

// Busca en LocationIQ un texto y devuelve {lat,lng} o null. Si zonaGeo viene,
// agrega viewbox alrededor de la zona; si bounded es true, ademas fuerza el
// resultado dentro del viewbox (la zona lleva la direccion al punto).
// Reintenta 2 veces mas cuando LocationIQ contesta 429 (rate limit de la
// cuenta gratis) o falla, para no degradar a fallback por un error pasajero.
function geoBuscar(query, zonaGeo, bounded) {
  if (!query) return null;
  var d = 0.05; // ~5 km alrededor del centro de la zona
  // Siempre se agrega ", El Salvador" + countrycodes=sv: sin el sufijo,
  // LocationIQ a veces contesta 404 y no ubica ni la direccion ni la zona.
  var url = 'https://us1.locationiq.com/v1/search?key=' + encodeURIComponent(LOCATIONIQ_KEY) +
    '&q=' + encodeURIComponent(query + ', El Salvador') + '&format=json&countrycodes=sv&limit=1';
  if (zonaGeo) {
    url += '&viewbox=' + (zonaGeo.lng - d) + ',' + (zonaGeo.lat - d) + ',' + (zonaGeo.lng + d) + ',' + (zonaGeo.lat + d);
    if (bounded) url += '&bounded=1';
  }
  var intentos = 0;
  while (intentos < 3) {
    var resp  = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    var codigo = resp.getResponseCode();
    var texto  = resp.getContentText() || '';
    if (codigo === 429) { intentos++; Utilities.sleep(1200); continue; }
    if (codigo !== 200) { intentos++; Utilities.sleep(1000); continue; }
    try {
      var data = JSON.parse(texto);
      if (Array.isArray(data) && data.length && data[0].lat && data[0].lon) {
        return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
      }
    } catch (e) { intentos++; Utilities.sleep(1000); continue; }
    return null; // HTTP 200 pero sin resultados = no se encontro
  }
  return null;
}

// Geocodifica un texto simple (zona de envio, direccion sola) y devuelve
// {lat,lng} o null. geoBuscar agrega ", El Salvador" + countrycodes=sv.
function geocodificarSimple(texto) {
  var t = String(texto || '').trim();
  if (!t) return null;
  return geoBuscar(t, null, false);
}

// Distancia en kilometros entre dos coordenadas (formula del haversine).
function distanciaKm(lat1, lng1, lat2, lng2) {
  var R = 6371;
  var dLat = (lat2 - lat1) * Math.PI / 180;
  var dLng = (lng2 - lng1) * Math.PI / 180;
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
          Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Funcion de diagnostico: correr esto MANUALMENTE con el boton "Ejecutar"
// (elegila en el desplegable de funciones) y despues abrir "Registro de
// ejecucion" arriba. Muestra la ultima respuesta real que dio LocationIQ,
// la ultima vez que alguien probo una direccion desde pedido.html o index.html.
// Correr esto MANUALMENTE con el boton "Ejecutar" (elegila en el
// desplegable) UNA SOLA VEZ. A diferencia de geocodificarDireccion() sola,
// esta SI manda una direccion real, asi que SI llega a intentar conectarse
// a LocationIQ -- y por eso es la que dispara el cartel real de "Autorizacion
// necesaria" pidiendo el permiso "Conectarse a un servicio externo". Sin
// este permiso aprobado, la app web (pedido.html) nunca puede geocodificar
// nada, sin importar cuantas veces se redespliegue.
function probarGeocodificacionManual() {
  var r = geocodificarDireccion('San Salvador, El Salvador');
  Logger.log(JSON.stringify(r));
}

function verUltimoDebugGeo() {
  var v = PropertiesService.getScriptProperties().getProperty('ULTIMO_DEBUG_GEO');
  Logger.log(v || 'Todavia no hay ninguna prueba registrada. Anda a pedido.html, escribi una direccion, y volve a correr esta funcion.');
}

function resolverLink(url) {
  try {
    var r1  = UrlFetchApp.fetch(url, { followRedirects: false, muteHttpExceptions: true });
    var loc = String(r1.getHeaders()['Location'] || r1.getHeaders()['location'] || '');
    if (loc) { var c1 = extraerCoordenadasGAS(loc); if (c1) return { ok: true, lat: c1.lat, lng: c1.lng }; }
    var r2 = UrlFetchApp.fetch(url, {
      followRedirects: true, muteHttpExceptions: true,
      headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15' }
    });
    var body = r2.getContentText().substring(0, 30000);
    var c2   = extraerCoordenadasGAS(body);
    if (c2) return { ok: true, lat: c2.lat, lng: c2.lng };
    return { ok: false, error: 'No se encontraron coordenadas' };
  } catch(e) { return { ok: false, error: e.message }; }
}

function extraerCoordenadasGAS(texto) {
  var m;
  m = texto.match(/@(-?\d{1,3}\.\d{4,}),(-?\d{1,3}\.\d{4,})/);                            if (m) return { lat: m[1], lng: m[2] };
  m = texto.match(/[?&]q=(-?\d{1,3}\.\d{3,}),(-?\d{1,3}\.\d{3,})/);                       if (m) return { lat: m[1], lng: m[2] };
  m = texto.match(/"lat"\s*:\s*(-?\d{1,3}\.\d{4,})[^}]*"lng"\s*:\s*(-?\d{1,3}\.\d{4,})/); if (m) return { lat: m[1], lng: m[2] };
  m = texto.match(/\[(-?\d{1,2}\.\d{5,}),(-?\d{2,3}\.\d{5,})\]/);                          if (m) return { lat: m[1], lng: m[2] };
  m = texto.match(/ll=(-?\d{1,3}\.\d{3,}),(-?\d{1,3}\.\d{3,})/);                           if (m) return { lat: m[1], lng: m[2] };
  m = texto.match(/!3d(-?\d{1,3}\.\d{4,})!4d(-?\d{1,3}\.\d{4,})/);                         if (m) return { lat: m[1], lng: m[2] };
  return null;
}

// ── BACKUP AUTOMATICO SEMANAL ──────────────────────────────────
// Corre una vez por semana (via trigger) y copia el estado completo de
// 'datos' a una hoja nueva llamada backup_AAAA-MM-DD, dentro del mismo
// spreadsheet de ordenes. Guarda solo las ultimas 8 semanas (~2 meses) y
// borra las mas viejas automaticamente para no acumular basura.
// Para activarlo: ejecutar UNA VEZ, manualmente desde el editor, la funcion
// crearTriggerBackupSemanal (seleccionarla en el desplegable y Ejecutar).
function backupSemanal() {
  try {
    var ss      = abrirSS(SHEET_ORDENES);
    var ordenes = leerOrdenes();
    var nombreHoja = 'backup_' + Utilities.formatDate(new Date(), 'America/El_Salvador', 'yyyy-MM-dd');
    var existente = ss.getSheetByName(nombreHoja);
    if (existente) ss.deleteSheet(existente); // si ya corrio hoy, no duplicar
    var hoja = ss.insertSheet(nombreHoja);
    if (ordenes.length) {
      var filas = ordenes.map(function(o) { return [JSON.stringify(o)]; });
      hoja.getRange(1, 1, filas.length, 1).setValues(filas);
    }
    limpiarBackupsViejos(ss);
    Logger.log('Backup completado: ' + ordenes.length + ' pedido(s) en ' + nombreHoja);
  } catch(err) {
    Logger.log('backupSemanal: ' + err.message);
  }
}

function limpiarBackupsViejos(ss) {
  var MAX_BACKUPS = 8; // ~2 meses de respaldo semanal
  var hojas = ss.getSheets().filter(function(h) { return /^backup_\d{4}-\d{2}-\d{2}$/.test(h.getName()); });
  hojas.sort(function(a, b) { return a.getName() < b.getName() ? -1 : 1; });
  while (hojas.length > MAX_BACKUPS) {
    ss.deleteSheet(hojas.shift());
  }
}

// Ejecutar UNA SOLA VEZ manualmente para activar el backup automatico.
// Crea (o reemplaza) el disparador que corre backupSemanal cada domingo
// a las 3am hora de El Salvador. La primera vez que se ejecuta pedira
// autorizacion nueva (permiso para crear disparadores) — es normal.
function crearTriggerBackupSemanal() {
  var triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function(t) {
    if (t.getHandlerFunction() === 'backupSemanal') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('backupSemanal')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.SUNDAY)
    .atHour(3)
    .create();
  Logger.log('Listo: backupSemanal correra automaticamente cada domingo a las 3am.');
}

function respond(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

// ── WOMPI ──────────────────────────────────────────────────────

// FUNCIÓN DE PRUEBA — ejecutar desde GAS para verificar auth
function testWompiAuth() {
  Logger.log('=== TEST WOMPI AUTH ===');
  Logger.log('App ID: [' + WOMPPI_APP_ID + ']');
  Logger.log('Secret: [' + WOMPPI_API_SECRET + ']');
  Logger.log('Auth URL: ' + WOMPI_AUTH_URL);

  // Limpiar token cacheado
  PropertiesService.getScriptProperties().deleteProperty('WOMPI_TOKEN');
  PropertiesService.getScriptProperties().deleteProperty('WOMPI_TOKEN_EXP');

  var resp = UrlFetchApp.fetch(WOMPI_AUTH_URL, {
    method: 'post',
    contentType: 'application/x-www-form-urlencoded',
    payload: {
      grant_type: 'client_credentials',
      client_id: WOMPPI_APP_ID,
      client_secret: WOMPPI_API_SECRET,
      audience: 'wompi_api'
    },
    muteHttpExceptions: true
  });
  Logger.log('Status: ' + resp.getResponseCode());
  Logger.log('Response Headers: ' + JSON.stringify(resp.getHeaders()));
  Logger.log('Response Body: ' + resp.getContentText());
  Logger.log('=== FIN TEST ===');
}

function wompiAutenticar() {
  var props = PropertiesService.getScriptProperties();
  var cached = props.getProperty('WOMPI_TOKEN');
  var cacheExp = parseInt(props.getProperty('WOMPI_TOKEN_EXP') || '0');
  if (cached && Date.now() < cacheExp) return cached;

  // Usar ScriptProperties si existen, fallback a variables globales
  var appId = props.getProperty('WOMPI_APP_ID') || WOMPPI_APP_ID;
  var apiSecret = props.getProperty('WOMPI_API_SECRET') || WOMPPI_API_SECRET;

  var resp = UrlFetchApp.fetch(WOMPI_AUTH_URL, {
    method: 'post',
    contentType: 'application/x-www-form-urlencoded',
    payload: {
      grant_type: 'client_credentials',
      client_id: appId,
      client_secret: apiSecret,
      audience: 'wompi_api'
    },
    muteHttpExceptions: true
  });
  var raw = resp.getContentText();
  Logger.log('[WOMPI AUTH] Status: ' + resp.getResponseCode() + ' | Body: ' + raw);
  var data = JSON.parse(raw);
  if (!data.access_token) throw new Error('Wompi auth falló: ' + raw);
  var expiresIn = parseInt(data.expires_in) || 3600;
  props.setProperty('WOMPI_TOKEN', data.access_token);
  props.setProperty('WOMPI_TOKEN_EXP', String(Date.now() + (expiresIn - 60) * 1000));
  return data.access_token;
}

function crearEnlacePago(payload) {
  try {
    var token = wompiAutenticar();
    var monto = parseFloat(payload.monto);
    if (!monto || monto < 0.01) return { ok: false, error: 'Monto invalido' };
    var ref = payload.orden || 'ORD-' + Date.now();
    var urlWebhook = ScriptApp.getService().getUrl() + '?action=webhookWompi&token=' + encodeURIComponent(API_TOKEN);
    var resp = UrlFetchApp.fetch(WOMPI_API_URL + '/EnlacePago', {
      method: 'post',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      payload: JSON.stringify({
        identificadorEnlaceComercio: ref,
        monto: monto,
        nombreProducto: 'Nugudú - ' + ref,
        formaPago: {
          permitirTarjetaCreditoDebido: true,
          permitirPagoConPuntoAgricola: false,
          permitirPagoEnCuotasAgricola: false,
          permitirPagoEnBitcoin: false,
          permitePagoQuickPay: false
        },
        infoProducto: {
          descripcionProducto: 'Pago pedido ' + ref
        },
        configuracion: {
          urlRedirect: payload.urlRetorno || '',
          esMontoEditable: false,
          esCantidadEditable: false,
          notificarTransaccionCliente: true,
          emailsNotificacion: payload.email || '',
          urlWebhook: urlWebhook
        }
      }),
      muteHttpExceptions: true
    });
    var texto = resp.getContentText();
    var data;
    try { data = JSON.parse(texto); } catch(pe) {
      return { ok: false, error: 'Respuesta invalida de Wompi (HTTP ' + resp.getResponseCode() + ')' };
    }
    if (data.urlEnlace) {
      return { ok: true, urlEnlace: data.urlEnlace, idEnlace: data.idEnlace };
    }
    return { ok: false, error: 'Wompi: ' + JSON.stringify(data).substring(0, 500) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function webhookWompi(payload) {
  try {
    var resultado = payload.ResultadoTransaccion || '';
    var idEnlace = (payload.EnlacePago && payload.EnlacePago.IdentificadorEnlaceComercio) || '';
    var montoWompi = parseFloat(payload.Monto) || 0;
    var idTransaccion = payload.IdTransaccion || '';

    if (resultado === 'ExitosaAprobada' && idEnlace) {
      var ordenes = leerOrdenes();
      for (var i = 0; i < ordenes.length; i++) {
        if (ordenes[i].orden === idEnlace) {
          ordenes[i].pendientePago = false;
          ordenes[i].pagoConfirmado = true;
          ordenes[i].pagoMetodo = 'Tarjeta Wompi';
          ordenes[i].pagoFecha = new Date().toISOString();
          ordenes[i].wompiIdTransaccion = idTransaccion;
          if (!ordenes[i].historial) ordenes[i].historial = [];
          ordenes[i].historial.push({
            estado: 'pagado',
            fecha: new Date().toISOString(),
            fuente: 'Wompi Webhook',
            wompiId: idTransaccion,
            monto: montoWompi
          });
          break;
        }
      }
      guardarOrdenes(ordenes);
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// Valida el hash HMAC-SHA256 que Wompi agrega a la URL de redirect.
// El frontend llama a esta funcion antes de mostrar "Pago exitoso".
function validarHashWompi(params) {
  try {
    var identificador = params.identificadorEnlaceComercio || '';
    var idTransaccion = params.idTransaccion || '';
    var idEnlace      = params.idEnlace || '';
    var monto         = params.monto || '';
    var esAprobada    = params.esAprobada || '';
    var hashRecibido  = params.hash || '';

    if (!hashRecibido) return { ok: false, error: 'Falta hash' };

    var textoConcat = identificador + idTransaccion + idEnlace + monto;
    var hashCalculado = Utilities.computeHmacSha256Signature(textoConcat, WOMPPI_API_SECRET)
      .map(function(b){return ('0' + (b & 0xFF).toString(16)).slice(-2);}).join('');

    if (hashCalculado !== hashRecibido) {
      return { ok: false, error: 'Hash invalido - posible manipulacion' };
    }

    return { ok: true, esAprobada: esAprobada === 'true', esReal: params.esReal === 'true' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// Notifica al admin (nugudulasersv@gmail.com) cuando un pago llega al paso final
function notificarPagoConfirmado(payload) {
  try {
    var ordenId = payload.ordenId || '';
    if (!ordenId) return { ok: false, error: 'Falta ordenId' };
    var ordenes = leerOrdenes();
    var orden = null;
    for (var i = 0; i < ordenes.length; i++) {
      if (ordenes[i].orden === ordenId) { orden = ordenes[i]; break; }
    }
    if (!orden) return { ok: false, error: 'Orden no encontrada: ' + ordenId };
    var asunto = 'Pago confirmado - ' + orden.orden;
    var cuerpo =
      'Pago confirmado para el pedido ' + orden.orden + '\n\n' +
      'Cliente: ' + (orden.nombre   || '-') + '\n' +
      'Contacto: ' + (orden.contacto || '-') + '\n' +
      'Método de pago: ' + (orden.metodoPago || orden.canal || '-') + '\n' +
      'Total: $' + Number(orden.total || 0).toFixed(2) + '\n' +
      (orden.email ? ('Correo: ' + orden.email + '\n') : '') +
      '\nRevisa el CRM para mas detalles.';
    MailApp.sendEmail(NOTIFY_EMAIL, asunto, cuerpo);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// Verifica el estado real de una transaccion consultando la API de Wompi.
function verificarTransaccionWompi(idTransaccion) {
  try {
    var token = wompiAutenticar();
    var resp = UrlFetchApp.fetch(WOMPI_API_URL + '/TransaccionCompra/' + idTransaccion, {
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      muteHttpExceptions: true
    });
    var data = JSON.parse(resp.getContentText());
    return {
      ok: true,
      esAprobada: data.esAprobada === true || data.esAprobada === 'true',
      esReal: data.esReal === true || data.esReal === 'true',
      monto: data.monto,
      estado: data.estado || data.ResultadoTransaccion || ''
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ── OPENWA ─────────────────────────────────────────────────────

function getConfigOpenWa() {
  try {
    var props = PropertiesService.getScriptProperties();
    return {
      ok: true,
      activo: props.getProperty('OPENWA_ACTIVO') === 'true',
      apiUrl: props.getProperty('OPENWA_API_URL') || '',
      apiKey: props.getProperty('OPENWA_API_KEY') || '',
      numeroTienda: props.getProperty('OPENWA_NUMERO') || WA
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function saveConfigOpenWa(payload) {
  try {
    var props = PropertiesService.getScriptProperties();
    props.setProperty('OPENWA_ACTIVO', payload.activo ? 'true' : 'false');
    if (payload.apiUrl) props.setProperty('OPENWA_API_URL', payload.apiUrl);
    if (payload.apiKey) props.setProperty('OPENWA_API_KEY', payload.apiKey);
    if (payload.numeroTienda) props.setProperty('OPENWA_NUMERO', payload.numeroTienda);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ── WOMPI CONFIG ────────────────────────────────────────────────

function getConfigWompi() {
  try {
    var props = PropertiesService.getScriptProperties();
    return {
      ok: true,
      appId: props.getProperty('WOMPI_APP_ID') || '',
      apiSecret: props.getProperty('WOMPI_API_SECRET') || ''
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function saveConfigWompi(payload) {
  try {
    var props = PropertiesService.getScriptProperties();
    if (payload.appId) props.setProperty('WOMPI_APP_ID', payload.appId);
    if (payload.apiSecret) props.setProperty('WOMPI_API_SECRET', payload.apiSecret);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function enviarComprobante(payload) {
  try {
    var imagenB64 = payload.imagen || '';
    var ordenId   = payload.ordenId || '';
    var via       = payload.via || 'wa';
    var ordenes = leerOrdenes();
    var orden = null;
    for (var i = 0; i < ordenes.length; i++) {
      if (String(ordenes[i].id) === String(ordenId) || ordenes[i].orden === ordenId) {
        orden = ordenes[i]; break;
      }
    }
    if (!orden) return { ok: false, error: 'Orden no encontrada' };

    var texto = 'Comprobante de pago recibido - Pedido ' + (orden.orden || '') +
      ' | Cliente: ' + (orden.nombre || '') +
      ' | Total: $' + Number(orden.total || orden.precio || 0).toFixed(2);

    if (via === 'email') {
      var destinatario = payload.email || orden.email || '';
      if (!destinatario) return { ok: false, error: 'No hay correo destino' };
      var adjuntos = [];
      if (imagenB64) {
        var blob = Utilities.newBlob(
          Utilities.base64Decode(imagenB64.split(',')[1] || imagenB64),
          'image/png', 'comprobante.png'
        );
        adjuntos.push(blob);
      }
      MailApp.sendEmail(destinatario, texto, 'Adjunto comprobante de pago.', { attachments: adjuntos });
      return { ok: true, via: 'email' };
    }

    if (via === 'wa') {
      var config = getConfigOpenWa();
      if (config.ok && config.activo && config.apiUrl && config.apiKey && imagenB64) {
        var imgData = imagenB64.split(',')[1] || imagenB64;
        var apiResp = UrlFetchApp.fetch(config.apiUrl + '/send-media', {
          method: 'post',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + config.apiKey
          },
          payload: JSON.stringify({
            to: config.numeroTienda,
            body: texto,
            media: 'data:image/png;base64,' + imgData
          }),
          muteHttpExceptions: true
        });
        var apiData = JSON.parse(apiResp.getContentText());
        if (apiResp.getResponseCode() < 400) return { ok: true, via: 'wa', openwa: true };
        Logger.log('OpenWa error: ' + apiResp.getContentText());
      }
      // Fallback: link manual wa.me
      var num = String(orden.contacto || WA).replace(/\D/g, '');
      var waLink = 'https://wa.me/' + num + '?text=' + encodeURIComponent(texto);
      return { ok: true, via: 'wa', openwa: false, waLink: waLink };
    }

    return { ok: false, error: 'Medio no soportado' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ══════════════════════════════════════════════════════════════════
// CDP — EVENTOS DE COMPORTAMIENTO (tracking desde pedido.html)
// ══════════════════════════════════════════════════════════════════
// Cada fila en eventos_usuario = un evento atomic (page_view,
// product_click, add_to_cart, etc.). Sin lock porque es append-
// only y nunca interfiere con la escritura de ordenes.
// ══════════════════════════════════════════════════════════════════
var HOJA_EVENTOS_HEADER = ['ts','session_id','contacto','evento','data','url_ref'];

function getHojaEventos() {
  var ss = abrirSS(SHEET_ORDENES);
  var sheet = ss.getSheetByName(HOJA_EVENTOS);
  if (sheet) return sheet;
  sheet = ss.insertSheet(HOJA_EVENTOS);
  sheet.getRange(1, 1, 1, HOJA_EVENTOS_HEADER.length).setValues([HOJA_EVENTOS_HEADER]);
  sheet.setFrozenRows(1);
  return sheet;
}

function guardarEventos(payload) {
  try {
    var eventos = payload.eventos;
    if (!Array.isArray(eventos) || !eventos.length)
      return { ok: false, error: 'No hay eventos' };
    var sheet = getHojaEventos();
    var filas = eventos.map(function(e) {
      return [
        e.ts || new Date().toISOString(),
        String(e.session_id || ''),
        String(e.contacto || ''),
        String(e.evento || ''),
        typeof e.data === 'string' ? e.data : JSON.stringify(e.data || {}),
        String(e.url_ref || '')
      ];
    });
    // Append en lotes de 50 para respetar limites de Google Sheets
    while (filas.length) {
      var lote = filas.splice(0, 50);
      sheet.getRange(sheet.getLastRow() + 1, 1, lote.length, HOJA_EVENTOS_HEADER.length).setValues(lote);
    }
    CacheService.getScriptCache().remove('ev_rawDatos');
    return { ok: true, escritos: eventos.length };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function leerEventos(p) {
  try {
    var cacheKey = 'ev_rawDatos';
    var cache = CacheService.getScriptCache();
    var datos = null;
    var cached = cache.get(cacheKey);
    if (cached) {
      try { datos = JSON.parse(cached); } catch(e) { datos = null; }
    }
    if (!datos) {
      var sheet = getHojaEventos();
      var lastRow = sheet.getLastRow();
      if (lastRow < 2) return { ok: true, eventos: [] };
      datos = sheet.getRange(2, 1, lastRow - 1, HOJA_EVENTOS_HEADER.length).getValues();
      cache.put(cacheKey, JSON.stringify(datos), 30);
    }
    var eventos = [];
    var filtroContacto = (p.contacto || '').replace(/\D/g, '');
    var limite = parseInt(p.limite) || 5000;
    for (var i = 0; i < datos.length && eventos.length < limite; i++) {
      var row = datos[i];
      var ev = {
        ts:         String(row[0] || ''),
        session_id: String(row[1] || ''),
        contacto:   String(row[2] || ''),
        evento:     String(row[3] || ''),
        data:       row[4] || '{}',
        url_ref:    String(row[5] || '')
      };
      try { ev.data = JSON.parse(ev.data); } catch(e) { ev.data = {}; }
      if (filtroContacto) {
        var evTel = ev.contacto.replace(/\D/g, '');
        if (evTel.indexOf(filtroContacto) < 0) continue;
      }
      eventos.push(ev);
    }
    return { ok: true, eventos: eventos };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ══════════════════════════════════════════════════════════════════
// CDP — LEER VISITANTES (agrupados por session_id)
// ══════════════════════════════════════════════════════════════════
function leerVisitantes(p) {
  try {
    var cacheKey = 'ev_rawDatos';
    var cache = CacheService.getScriptCache();
    var datos = null;
    var cached = cache.get(cacheKey);
    if (cached) {
      try { datos = JSON.parse(cached); } catch(e) { datos = null; }
    }
    if (!datos) {
      var sheet = getHojaEventos();
      var lastRow = sheet.getLastRow();
      if (lastRow < 2) return { ok: true, visitantes: [], stats: { activos: 0, hoy: 0, semana: 0, mes: 0 }, analytics: { fuentes: [], horas: [], paginas: [], embudo: {}, rebote: 0, duracionProm: 0 } };
      datos = sheet.getRange(2, 1, lastRow - 1, HOJA_EVENTOS_HEADER.length).getValues();
      cache.put(cacheKey, JSON.stringify(datos), 30);
    }
    
    var periodo = p.periodo || 'hoy';
    var ahora = new Date();
    var filtroDesde = null;
    if (periodo === 'hoy') {
      filtroDesde = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
    } else if (periodo === 'semana') {
      filtroDesde = new Date(ahora);
      filtroDesde.setDate(filtroDesde.getDate() - 7);
    } else if (periodo === 'mes') {
      filtroDesde = new Date(ahora);
      filtroDesde.setMonth(filtroDesde.getMonth() - 1);
    }
    
    var sesiones = {};
    var todosSinFiltro = {};
    var fuentesConteo = {};
    var horasConteo = {};
    var paginasConteo = {};
    var embudo = { page_view: 0, product_click: 0, color_select: 0, add_to_cart: 0, checkout_start: 0, purchase: 0 };
    var totalSesiones = 0;
    var sesionesRebote = 0;
    var duraciones = [];
    
    for (var i = 0; i < datos.length; i++) {
      var row = datos[i];
      var ts = String(row[0] || '');
      var sessionId = String(row[1] || '');
      var contacto = String(row[2] || '');
      var evento = String(row[3] || '');
      var dataRaw = row[4] || '{}';
      var urlRef = String(row[5] || '');
      
      if (!sessionId) continue;
      
      var dataObj = {};
      try { dataObj = JSON.parse(dataRaw); } catch(e) { dataObj = {}; }
      
      var tsDate = null;
      try { tsDate = new Date(ts); } catch(e) {}
      
      // Acumular para stats sin filtro
      if (!todosSinFiltro[sessionId]) {
        todosSinFiltro[sessionId] = { session: sessionId, lastSeen: ts, events: 0, firstSeen: ts };
      }
      todosSinFiltro[sessionId].events++;
      if (ts > todosSinFiltro[sessionId].lastSeen) todosSinFiltro[sessionId].lastSeen = ts;
      if (ts < todosSinFiltro[sessionId].firstSeen) todosSinFiltro[sessionId].firstSeen = ts;
      
      // Analytics: fuentes, horas, páginas (sin filtro de período)
      var source = dataObj.source || urlRef || 'Directo';
      fuentesConteo[source] = (fuentesConteo[source] || 0) + 1;
      
      if (tsDate) {
        var hora = tsDate.getHours();
        horasConteo[hora] = (horasConteo[hora] || 0) + 1;
      }
      
      var page = dataObj.screen || '';
      if (page) paginasConteo[page] = (paginasConteo[page] || 0) + 1;
      
      // Embudo
      if (embudo.hasOwnProperty(evento)) embudo[evento]++;
      
      // Aplicar filtro de período
      if (filtroDesde && tsDate && tsDate < filtroDesde) continue;
      
      if (!sesiones[sessionId]) {
        sesiones[sessionId] = {
          session: sessionId,
          contacto: contacto,
          city: '',
          lastPage: '',
          collection: '',
          device: '',
          source: urlRef || 'Directo',
          lastSeen: ts,
          firstSeen: ts,
          events: 0,
          hasPurchase: false,
          hasCart: false
        };
      }
      
      var s = sesiones[sessionId];
      s.events++;
      if (ts > s.lastSeen) s.lastSeen = ts;
      if (ts < s.firstSeen) s.firstSeen = ts;
      if (contacto && !s.contacto) s.contacto = contacto;
      if (dataObj.city && !s.city) s.city = dataObj.city;
      if (dataObj.device && !s.device) s.device = dataObj.device;
      if (dataObj.source && s.source === 'Directo') s.source = dataObj.source;
      if (dataObj.screen) s.lastPage = dataObj.screen;
      if (dataObj.nombre) s.collection = dataObj.nombre;
      if (evento === 'purchase') s.hasPurchase = true;
      if (evento === 'add_to_cart') s.hasCart = true;
    }
    
    // Calcular rebote y duración
    Object.keys(todosSinFiltro).forEach(function(k) {
      var sesion = todosSinFiltro[k];
      totalSesiones++;
      if (sesion.events <= 1) sesionesRebote++;
      var inicio = new Date(sesion.firstSeen).getTime();
      var fin = new Date(sesion.lastSeen).getTime();
      if (fin > inicio) duraciones.push(fin - inicio);
    });
    
    var bounceRate = totalSesiones > 0 ? Math.round((sesionesRebote / totalSesiones) * 100) : 0;
    var duracionProm = 0;
    if (duraciones.length) {
      var sumaDuraciones = duraciones.reduce(function(a, b) { return a + b; }, 0);
      duracionProm = Math.round((sumaDuraciones / duraciones.length) / 60000); // minutos
    }
    
    // Convertir fuentes a array ordenado
    var fuentesArr = [];
    Object.keys(fuentesConteo).forEach(function(k) {
      fuentesArr.push({ name: k, count: fuentesConteo[k] });
    });
    fuentesArr.sort(function(a, b) { return b.count - a.count; });
    
    // Convertir horas a array (0-23)
    var horasArr = [];
    for (var h = 0; h < 24; h++) {
      horasArr.push({ hour: h, count: horasConteo[h] || 0 });
    }
    
    // Convertir páginas a array ordenado
    var paginasArr = [];
    var paginasNombres = { s_catalogo: 'Catálogo', s_cliente: 'Datos', s_envio: 'Envío', s_pago: 'Pago', s_exito: '¡Listo!', s_consulta: 'Consulta', s_midsenio: 'Mi diseño' };
    Object.keys(paginasConteo).forEach(function(k) {
      paginasArr.push({ name: paginasNombres[k] || k, count: paginasConteo[k] });
    });
    paginasArr.sort(function(a, b) { return b.count - a.count; });
    
    // Calcular isActive (últimos 10 min)
    var diezMin = 10 * 60 * 1000;
    var ahoraMs = ahora.getTime();
    var visitantes = [];
    var activos = 0;
    
    Object.keys(sesiones).forEach(function(k) {
      var s = sesiones[k];
      var lastMs = new Date(s.lastSeen).getTime();
      s.isActive = (ahoraMs - lastMs) < diezMin;
      if (s.isActive) activos++;
      s.minutesAgo = Math.round((ahoraMs - lastMs) / 60000);
      visitantes.push(s);
    });
    
    // Ordenar por último visto (más reciente primero)
    visitantes.sort(function(a, b) { return b.lastSeen > a.lastSeen ? 1 : -1; });
    
    // Stats: contar sesiones únicas sin filtro de período
    var totalHoy = 0, totalSemana = 0, totalMes = 0;
    var hoyInicio = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()).getTime();
    var semanaInicio = new Date(ahora);
    semanaInicio.setDate(semanaInicio.getDate() - 7);
    var mesInicio = new Date(ahora);
    mesInicio.setMonth(mesInicio.getMonth() - 1);
    
    Object.keys(todosSinFiltro).forEach(function(k) {
      var ls = new Date(todosSinFiltro[k].lastSeen).getTime();
      if (ls >= hoyInicio) totalHoy++;
      if (ls >= semanaInicio.getTime()) totalSemana++;
      if (ls >= mesInicio.getTime()) totalMes++;
    });
    
    return {
      ok: true,
      visitantes: visitantes,
      stats: {
        activos: activos,
        hoy: totalHoy,
        semana: totalSemana,
        mes: totalMes
      },
      analytics: {
        fuentes: fuentesArr,
        horas: horasArr,
        paginas: paginasArr,
        embudo: embudo,
        rebote: bounceRate,
        duracionProm: duracionProm
      }
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

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
    if (action === 'read')          return respond(leerOrdenes());
    if (action === 'sync')          return respond(conLock(sincronizar));
    if (action === 'catalogo')      return respond(leerCatalogo());
    if (action === 'buscarCliente') return respond(buscarClienteGAS(p.tel, p.orden));
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
    if (action === 'testGeo')       return respond(geocodificarDireccion(p.dir || ''));
    if (action === 'getConfigOpenWa') return respond(getConfigOpenWa());
    if (action === 'getConfigWompi')  return respond(getConfigWompi());
    if (action === 'enviarComprobante') return respond(enviarComprobante(p));
    if (action === 'validarHashWompi')   return respond(validarHashWompi(p));
    if (action === 'verificarTransaccion') return respond(verificarTransaccionWompi(p.idTransaccion || ''));
    if (action === 'leerEventos') return respond(leerEventos(p));
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
    if (action === 'geocodificar')    { return respond(geocodificarDireccion(payload.direccion)); }
    if (action === 'pedidoWeb')       { return respond(conLock(function(){ return guardarPedidoWeb(payload); })); }
    if (action === 'crearEnlacePago') { return respond(crearEnlacePago(payload)); }
    if (action === 'webhookWompi')    { return respond(webhookWompi(payload)); }
    if (action === 'saveConfigOpenWa'){ return respond(saveConfigOpenWa(payload)); }
    if (action === 'saveConfigWompi') { return respond(saveConfigWompi(payload)); }
    if (action === 'enviarComprobante'){ return respond(enviarComprobante(payload)); }
    if (action === 'validarHashWompi') return respond(validarHashWompi(payload.params || payload));
    if (action === 'notificarPagoConfirmado') return respond(notificarPagoConfirmado(payload));
    if (action === 'trackEvent')  return respond(guardarEventos(payload));
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
  return ordenes;
}

function guardarOrdenes(data) {
  var sheet = getHojaDatos();
  sheet.clearContents();
  if (!data || !data.length) return;
  var filas = data.map(function(o) { return [JSON.stringify(o)]; });
  sheet.getRange(1, 1, filas.length, 1).setValues(filas);
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
    var ss    = abrirSS(SHEET_CATALOGO);
    var sheet = ss.getSheetByName(HOJA_CATALOGO);
    if (!sheet) return { ok: false, error: 'Hoja Catalogo no encontrada' };
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return { ok: true, productos: [] };
    var headers = data[0].map(function(h) { return String(h).toUpperCase().trim().replace(/\s+/g,'_'); });
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
        stock:     parseInt(obj['STOCK'])     || 0
      });
    }
    return { ok: true, productos: productos };
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
      return;
    }
  } catch(err) { Logger.log('descontarStock: ' + err.message); }
}

function buscarClienteGAS(tel, orden) {
  try {
    var ordenes = leerOrdenes();
    var match   = [];
    if (orden) {
      var ordenNorm = String(orden).trim().toUpperCase();
      var oMatch = ordenes.find(function(o) { return (o.orden || '').toUpperCase() === ordenNorm; });
      if (oMatch) {
        var telRef = String(oMatch.contacto || '').replace(/\D/g, '');
        match = ordenes.filter(function(o) { return String(o.contacto || '').replace(/\D/g, '') === telRef; });
      }
    }
    if (!match.length && tel) {
      var telNorm = String(tel).replace(/\D/g, '');
      if (telNorm.length < 4) return { ok: true, encontrado: false };
      match = ordenes.filter(function(o) {
        return String(o.contacto || '').replace(/\D/g, '').indexOf(telNorm) >= 0;
      });
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
        pendientePago: o.pendientePago || false
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
    var precioPromedio = cantidadTotal > 0 ? totalPedido / cantidadTotal : 0;

    var ordenes = leerOrdenes();
    var d   = new Date();
    var id  = d.getTime();
    var orden = 'ORD-' + String(d.getFullYear()).slice(2) + String(d.getMonth()+1).padStart(2,'0') + String(d.getDate()).padStart(2,'0') + '-' + String(id).slice(-4);
    var fecha = d.toISOString();
    var fe = new Date(d), dias = 0;
    while (dias < 3) { fe.setDate(fe.getDate() + 1); if (fe.getDay() !== 0) dias++; }
    var nuevaOrden = {
      id: id, orden: orden,
      nombre:        String(payload.nombre    || '').trim(),
      contacto:      String(payload.contacto  || '').trim(),
      direccion:     String(payload.direccion || '').trim(),
      zona:          String(payload.zona      || 'Canal Digital').trim(),
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
      historial: [{ estado: '0', fecha: fecha, fuente: 'Canal Digital Web' }]
    };
    ordenes.unshift(nuevaOrden);
    guardarOrdenes(ordenes);
    itemsValidados.forEach(function(it){ descontarStock(it.sku, it.cantidad); });
    notificarPedidoNuevo(nuevaOrden);
    return { ok: true, orden: orden, fechaEntrega: fe.toISOString().slice(0, 10) };
  } catch(err) { return { ok: false, error: err.message }; }
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
    var asunto = 'Nuevo pedido - ' + orden.orden;
    var cuerpo =
      'Ha llegado un nuevo pedido a Nugudu Laser Store.\n\n' +
      'Orden: '      + orden.orden + '\n' +
      'Cliente: '    + (orden.nombre   || '-') + '\n' +
      'Contacto: '   + (orden.contacto || '-') + '\n' +
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
      '<p>Ha llegado un nuevo pedido a <b>Nugudu Laser Store</b>.</p>' +
      '<p>' +
        '<b>Orden:</b> ' + escHtml(orden.orden) + '<br>' +
        '<b>Cliente:</b> ' + escHtml(orden.nombre || '-') + '<br>' +
        '<b>Contacto:</b> ' + escHtml(orden.contacto || '-') + '<br>' +
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
function geocodificarDireccion(direccion) {
  try {
    var dir = String(direccion || '').trim();
    if (!dir) return { ok: false, error: 'Direccion vacia' };
    if (!LOCATIONIQ_KEY || LOCATIONIQ_KEY.indexOf('PEGA_AQUI') === 0) {
      return { ok: false, error: 'Falta configurar LOCATIONIQ_KEY en Code_1.gs' };
    }
    var url = 'https://us1.locationiq.com/v1/search?key=' + encodeURIComponent(LOCATIONIQ_KEY) +
      '&q=' + encodeURIComponent(dir + ', El Salvador') + '&format=json&countrycodes=sv&limit=1';
    var resp    = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    var codigo  = resp.getResponseCode();
    var texto   = resp.getContentText() || '';
    // Diagnostico guardado en Propiedades del script (no solo en Logger.log)
    // para poder verlo facil: correr verUltimoDebugGeo() manualmente con el
    // boton "Ejecutar" y despues abrir "Registro de ejecucion".
    try {
      PropertiesService.getScriptProperties().setProperty(
        'ULTIMO_DEBUG_GEO',
        new Date().toLocaleString() + ' | dir="' + dir + '" | HTTP ' + codigo + ' | ' + texto.substring(0, 500)
      );
    } catch (pe2) {}
    Logger.log('geocodificarDireccion ["' + dir + '"] -> HTTP ' + codigo + ': ' + texto.substring(0, 400));
    var data;
    try { data = JSON.parse(texto); } catch (pe) {
      return { ok: false, error: 'Respuesta invalida de LocationIQ (HTTP ' + codigo + ')' };
    }
    if (Array.isArray(data) && data.length && data[0].lat && data[0].lon) {
      return { ok: true, lat: data[0].lat, lng: data[0].lon };
    }
    if (data && data.error) return { ok: false, error: 'LocationIQ: ' + data.error };
    return { ok: false, error: 'No se encontraron coordenadas (HTTP ' + codigo + ')' };
  } catch (e) { return { ok: false, error: e.message }; }
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
    var asunto = '💳 Pago confirmado - ' + orden.orden;
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
    return { ok: true, escritos: eventos.length };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function leerEventos(p) {
  try {
    var sheet = getHojaEventos();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { ok: true, eventos: [] };
    var datos = sheet.getRange(2, 1, lastRow - 1, HOJA_EVENTOS_HEADER.length).getValues();
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

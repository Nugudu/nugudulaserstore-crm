# CONTEXTO COMPLETO — Nugudú Láser Store CRM
## Documento maestro para cualquier IA que continúe este proyecto

*Última actualización: **18 de noviembre de 2026**. Este archivo reemplaza cualquier versión anterior — está escrito para que otra IA (o vos misma en un chat nuevo) entienda el sistema completo sin tener que redescubrir nada por prueba y error. Refleja el sistema actual: **`crm.html`** (CRM) + **`tienda.html`** (tienda B2C) + **`Código.js`** (backend).*<br>*Versión anterior: 17 de julio de 2026 (describía `index.html` + `pedido.html` + `Code_1.gs` — ya no son los archivos vigentes).* 

---

## ¿QUIÉN SOY?
Soy Nuria Durán, dueña de **Nugudú Productions & Design** en El Salvador.
Manejo **Nugudú Láser Store** — gorras con parche de cuero grabado a láser.
Catálogo activo: **varias colecciones** — El Clásico, Snoopy, Moto, Raíces SV y Gorra — con precios de **$9.99 a $19.99** según la hoja `Catalogo` (la fuente de verdad). `tienda.html` lleva además un catálogo embebido de respaldo (`_CAT_EMBED`).

---

## REGLA MÁS IMPORTANTE PARA CUALQUIER IA QUE TRABAJE AQUÍ

**Nunca tocar nada de lo que ya funciona correctamente. Editar el archivo existente en lugar de crear uno nuevo.** Esta instrucción se repite en casi todos los pedidos y es la regla de oro del proyecto. Antes de cualquier cambio:
1. Leer el archivo real (no asumir contenido de este documento — este documento puede quedar desactualizado, el código fuente siempre manda).
2. Hacer cambios **aditivos y aislados** — si hay que tocar una función que ya funciona, preferir envolverla o extenderla en vez de reescribirla entera.
3. Verificar sintaxis antes de entregar (extraer el `<script>` y correrlo con `new Function()` en Node, o el equivalente para `Código.js`).
4. `nugudú_crm_v10.html` es un archivo **histórico** (copia del CRM viejo) — **no se tocar**. El CRM vigente es `crm.html`: todo cambio de dashboard va ahí.
5. El backend vive en **`Código.js`** y se despliega desde esta carpeta con **`clasp push`** (el `.claspignore` confirma que solo sube `Código.js` + `appsscript.json`). Después de subir, verificar en producción que el cambio llegó. `Code_1.gs` es el backend **legado** — ya no se usa, no tocar.

---

## ARCHIVOS DEL PROYECTO (componentes)

| Archivo | Rol | Notas |
|---|---|---|
| **`crm.html`** | **CRM / dashboard administrativo — EL ACTIVO** | Publicado en GitHub Pages. Un solo archivo HTML+CSS+JS (5,014 líneas), sin build step. |
| **`tienda.html`** | **Portal de pedidos / tienda para clientes (B2C) — EL ACTIVO** | Público, sin login. Mismo repo, mismo endpoint GAS. |
| **`Código.js`** | **Backend en Google Apps Script — EL ACTIVO** | Se despliega con `clasp push` desde esta carpeta (116KB). No confundir con `Code_1.gs`. |
| `index.html` | Solo redirección | 23 líneas que redirigen a `tienda.html`. **No es el CRM** (lo fue hasta septiembre 2026). |
| `Code_1.gs` | Backend **LEGADO** | Versión vieja del backend (último cambio sept 2026, 50KB). Ya no se usa — no tocar. |
| `nugudú_crm_v10.html` | Copia **histórica** del CRM viejo | **No tocar** (ver regla 4 de "Regla más importante"). |
| `sw.js` | Service Worker | Mantiene `tienda.html` y `crm.html` siempre frescos (caché `ngd-v*`, `ALWAYS_FRESH`). |
| `appsscript.json` | Manifiesto de permisos de Apps Script | Se sube junto con `Código.js` en el `clasp push`. Declara `oauthScopes` explícitos (ver sección de permisos más abajo) y la config de `webapp` (`executeAs: USER_DEPLOYING`, `access: ANYONE_ANONYMOUS`). |
| `CNAME` | Dominio de GitHub Pages | `www.nugudustore.com` |
| `imagenes/` | Fotos de producto + logo | Una foto por SKU (`.jpg`, ej. `RSV-KA-NG.jpg`, `CL-BAR-NG.jpg`; algunas en `.png`), genéricas por diseño (`kaan.png`, `muuk.png`…), banners, `banco-agricola.png` y **`logo-nugudu.png`**. |
| `backups/AAAA-MM-DD/` | Backups manuales con sufijo `.bak` | Se crean solo cuando Nuria los pide explícitamente. Última carpeta: `backups/2026-09-29/`. |
| `CONTEXTO_NUGUDU_CRM.md` | Este documento | Contexto maestro del proyecto. |
| `CHECKLIST_MEJORAS_CRM.md` | Checklist de mejoras técnicas | Actualizado el 18 nov 2026: los puntos 1–7 están **resueltos y verificados**; quedan 8 y 9. |

### URLs públicas
- **CRM:** `https://www.nugudustore.com/crm.html`
- **Tienda (pedidos clientes):** `https://www.nugudustore.com/` — la raíz redirige a `tienda.html`
- **GAS endpoint (deployment activo):** `https://script.google.com/macros/s/AKfycbxN1-rjGI6o1ies0oHvNCE2lw-EhOrMTO_UFUwrnQQE5PH-U72LeeDpwXSEQkxaeFy5/exec`

---

## GOOGLE SHEETS (fuente de datos)

| Hoja | ID | Contenido |
|---|---|---|
| Órdenes + Catálogo (mismo spreadsheet) | `1yENHn7y1DTrDlk0-yYfP1yVLzcgdhewtONwefvK613E` | Pestañas: `datos` (una fila = una orden en JSON), `borrados_ts` (tumbas de borrado permanente), `Catalogo` |
| Vendedores (Google Form) | `1bPZg1JXef2yWGeSMEWj62Zs37jJuCjtm6uxJ8Ca-yB0` | Respuestas del formulario que usan las vendedoras para ventas manuales |
| Repartidor (Google Form) | `1jrdJhCOzmeWDyNFlYjJun1bKdg-Tiajy44f0V5UvTb4` | Respuestas del formulario de actualización de entregas |

### Hoja `Catalogo` — estructura de columnas
```
SKU_BASE | NOMBRE | COLECCION | COLOR | HEX | PRECIO | ACTIVO | STOCK
```
- `ACTIVO` debe ser exactamente el texto `SI`.
- La hoja se llama exactamente `Catalogo` (sin acento).

### Hoja `datos` — formato de almacenamiento
**Una fila = una orden**, guardada como JSON en la columna A (migrado desde el formato viejo de un solo JSON gigante en A1, que arriesgaba el límite de 50,000 caracteres por celda y podía perder todo el historial de golpe). Ver estructura completa del objeto orden más abajo.

---

## ARQUITECTURA TÉCNICA

- HTML + JS puro (sin frameworks, sin build step) + Google Apps Script como backend + Google Sheets como base de datos.
- Sin Firebase, sin base de datos externa, sin pasarela de pago, sin servicios pagos — **excepto LocationIQ**, que es un servicio externo de geocodificación con cuenta gratuita (ver sección de geocodificación).
- `crm.html`: `localStorage` como caché local (`KEY='ngd_crm_v10'`, tumbas en `TOMB_KEY='ngd_tumbas_v10'`, sesión del gate en `ngd_gate_sesion`, página activa en `ngd_crm_page`), sincronización automática con `Código.js` cada 30 segundos (`setInterval(syncFromGAS, 30000)`), más sync inmediato al cargar.
- `tienda.html`: `sessionStorage` (`ngd_session`) para persistir la sesión del cliente si refresca la página.
- Protección de escritura concurrente: `LockService.getScriptLock()` en el backend (`conLock()`), evita que dos guardados simultáneos se pisen entre sí.
- Endpoint protegido por token compartido (`API_TOKEN`) — `crm.html` y `tienda.html` deben mandarlo en cada llamada o el backend responde `{ok:false, error:'No autorizado'}`.
- Caché de `SpreadsheetApp.openById()` dentro de una misma ejecución (`abrirSS()`) — evita abrir el mismo spreadsheet varias veces en una sola petición.

---

## ROLES DE ACCESO (códigos actuales, definidos en `crm.html`)

| Rol | Código | Acceso |
|---|---|---|
| Administradora | `AV@#1` | Todo el dashboard |
| Vendedora 1 | `V@#1` | Solo Nueva Venta (+ puede compartir su propio link de `tienda.html?v=V1`, ver más abajo) |
| Vendedora 2 | `V@#2` | Solo Nueva Venta (+ `tienda.html?v=V2`) |
| Vendedora 3 | `V@#3` | Solo Nueva Venta (+ `tienda.html?v=V3`) |
| Producción | `P@#1` | Solo Órdenes (con switches de producción/listo) |
| Repartidor | `R@#1` | Solo panel Repartidor |

> **Nota:** el código de login en el CRM (`V@#1`) y el código de link de referido en la tienda (`V1`) son cadenas distintas a propósito — el backend valida los referidos contra `CODIGOS_VENDEDORAS_WEB = ['V1','V2','V3','AV@#1']`.

**Punto de mejora pendiente:** estos códigos son visibles en el código fuente público de `crm.html` (`ADMIN_CODE`, `VENDEDORAS`, `PRODUCCION_CODE`, `REPARTIDOR_CODE`). Riesgo bajo dado el tamaño del equipo actual, pero convendría moverlos a validación del lado servidor si el negocio crece.

---

## GEOCODIFICACIÓN (LocationIQ) — historia y estado actual

Se probaron 3 caminos antes de llegar al actual, documentados en el código con comentarios extensos porque el proceso fue largo:
1. **Nominatim (OpenStreetMap), cliente y servidor** — descartado, bloqueaba las peticiones automáticas de forma consistente (siempre devolvía el mismo punto por defecto, San Salvador centro).
2. **Google Maps sin API (embed gratuito)** — funciona como mapa *visual* pero no expone coordenadas de vuelta a la página sin la API paga de Google (`Maps JavaScript API`), que requiere cuenta de facturación.
3. **LocationIQ** (actual) — servicio pensado para uso automático/programático, cuenta gratuita, funciona bien. Clave guardada en `Código.js` como `LOCATIONIQ_KEY`.

**Flujo actual:** tanto `tienda.html` (campo de dirección) como `crm.html` (Nueva Venta y Editar orden) llaman a la acción `geocodificar` del backend (`geocodificarDireccion(direccion)` en `Código.js`), que pega contra `https://us1.locationiq.com/v1/search`. Si LocationIQ encuentra resultado, el mapa se centra con precisión y la caja de coordenadas se autocompleta sola (solo si estaba vacía — nunca pisa una coordenada pegada a mano). Si no encuentra nada, cae de vuelta a una búsqueda de texto simple en el embed gratuito de Google Maps, para que el mapa nunca quede vacío.

**⚠️ Trampa de permisos ya resuelta, pero documentada por si vuelve a pasar:** la primera vez que se agregó `UrlFetchApp.fetch()` al proyecto (necesario para hablar con LocationIQ), Apps Script NO mostró el cartel de autorización al ejecutar manualmente funciones que no llegaban a esa línea de código, y la app web fallaba en silencio con `"No tienes permiso para llamar a UrlFetchApp.fetch"` — atrapado dentro del propio `try/catch` de `geocodificarDireccion`, por lo que nunca se veía como un error de autorización obvio. **La solución fue:** revocar el acceso del proyecto desde `myaccount.google.com/permissions` (buscar "nugudú láser store-crm"), y volver a autorizar desde cero corriendo manualmente una función que sí llega a `UrlFetchApp.fetch()` (ej. `probarGeocodificacionManual`), aceptando **todos** los permisos listados (clic en "Seleccionar todo"), y recién ahí redesplegar. Si en el futuro se agrega otro servicio nuevo (ej. `GmailApp`, `DriveApp`) y algo similar vuelve a pasar, este es el mismo arreglo.

**Funciones de diagnóstico que quedaron en `Código.js`** (útiles si la geocodificación falla de nuevo):
- `verUltimoDebugGeo()` — correr manualmente desde el editor, muestra en el log la última respuesta real de LocationIQ.
- `probarGeocodificacionManual()` — fuerza una llamada real a LocationIQ (usado para disparar el cartel de autorización).
- Acción `debugGeo` (GET): `...exec?action=debugGeo&token=...` — muestra el último diagnóstico directo desde el navegador, sin pasar por el editor.
- Acción `testGeo` (GET): `...exec?action=testGeo&token=...&dir=DIRECCION` — geocodifica una dirección directo desde una URL, aislando el problema de cualquier archivo cliente.

**Para diagnosticar ejecuciones reales de la app web:** el botón "Registro de ejecución" del editor **solo sirve para ejecuciones manuales** (clic en "Ejecutar"). Para ver peticiones reales de `tienda.html`/`crm.html`, hay que ir al ícono de **"Ejecuciones"** en la barra lateral izquierda del editor (no el botón de arriba) — ahí sí aparece cada `doPost`/`doGet` real con su log completo.

---

## ESTRUCTURA DE UNA ORDEN (objeto guardado en la hoja `datos`)

```js
{
  id: 1752607... ,              // timestamp en ms, también sirve de id único
  orden: "ORD-260716-1072",     // formato ORD-AAMMDD-NNNN
  nombre, contacto, direccion, zona,
  vendedor: "V@#1" | "V@#2" | "V@#3" | "AV@#1" | "VND-01" | "WEB" | "FORM",  // texto libre en Nueva Venta; WEB = tienda.html sin link de vendedora; FORM = importado de Google Forms
  precio,                        // PROMEDIO ponderado por unidad si la orden tiene varios productos distintos — el TOTAL siempre es el correcto
  cantidad,                      // suma total de unidades de todos los productos
  total,                         // suma real: Σ (precio_catalogo_del_sku × cantidad_de_ese_sku)
  canal: "Canal Digital" | "Fuerza de ventas" | ...,
  pago: "Transferencia",
  productos: ["SKU-A","SKU-A","SKU-B"],  // OJO: un elemento del arreglo POR CADA UNIDAD (no un elemento por SKU único) — así el conteo de stock/reportes que ya existía (que cuenta ocurrencias en este arreglo) sigue funcionando sin tocar nada
  estado: "0".."4",              // 0=Nueva orden, ver ESTADOS en crm.html para el resto
  notas,
  fecha, fechaEntrega,           // fechaEntrega = 3 días hábiles después (excluye domingos)
  mapaLink,                      // link de Google Maps con coordenadas si se logró geocodificar, o link de búsqueda de texto si no
  pendientePago: true/false,
  pendienteDesde,
  datosBancariosEnviados: true/false,  // persiste entre dispositivos -- ver sección de WhatsApp más abajo
  consumoInterno: false,
  prodEstado,                    // switch de producción (null | "produccion" | "listo")
  historial: [{estado, fecha, fuente}]
}
```

**Multi-producto (agregado el 17 de julio de 2026):** `tienda.html` permite agregar más de un producto/diseño a un mismo pedido (pensado para B2C: alguien que quiere comprar, por ejemplo, un gorro para su pareja y otro para un hijo en el mismo pedido). El payload que manda al backend es `items: [{sku, cantidad}, ...]` en vez de un solo `sku`/`precio`/`cantidad` suelto. `guardarPedidoWeb()` en `Código.js` valida cada SKU contra el catálogo real (nunca confía en precio mandado por el cliente), descuenta stock de cada producto por separado, y arma el arreglo `productos` repitiendo cada SKU una vez por unidad — truco que hace que TODO el código existente que ya leía `productos` (PDFs, mensajes de WhatsApp, reportes por SKU) siga funcionando exactamente igual sin ningún cambio adicional. Sigue existiendo compatibilidad hacia atrás: si algún día llega un payload viejo con `sku` suelto (sin `items`), se trata igual como un pedido de un solo producto.

---

## REFERIDOS DE VENDEDORAS EN tienda.html (link con código)

Cada vendedora puede compartir su propio link público agregando su código al final: `tienda.html?v=V1`. El archivo lee ese parámetro en silencio al cargar (`_refV`, cliente no ve ni toca nada) y lo manda en el payload como `vendedorRef`. En `Código.js`, la lista `CODIGOS_VENDEDORAS_WEB = ['V1', 'V2', 'V3', 'AV@#1']` valida ese código contra los códigos reales — si coincide, la orden queda con `vendedor` = ese código en vez de `'WEB'` genérico. Agregar una vendedora nueva a este sistema es: (1) agregarla a `VENDEDORAS` en `crm.html`, (2) agregar su código de referido a `CODIGOS_VENDEDORAS_WEB` en `Código.js`. **Punto de mejora sin implementar aún:** un reporte en `crm.html` que muestre, por vendedora, el total combinado de ventas manuales (Nueva Venta) + ventas por su link digital — la idea fue discutida y aprobada pero el reporte visual todavía no se construyó.

---

## FLUJO DE DATOS BANCARIOS / WHATSAPP (estado: en evaluación, canal de correo en pausa)

- El botón manual "💳 Enviar datos bancarios" en el tracking de `crm.html` (`enviarDatosBancarios(id)`) abre WhatsApp con el mensaje pre-armado (banco, cuenta, monto) y marca `datosBancariosEnviados: true` en la orden, sincronizado al backend — para que si se abre la misma orden desde otro dispositivo, el sistema avise "ya se enviaron antes" en vez de reenviar sin darse cuenta.
- Al abrir el detalle de tracking de una orden en estado "Nueva orden" con pago pendiente, esto se dispara **solo** (una vez por sesión de navegador): si nunca se envió, se abre directo; si ya se había enviado (de cualquier dispositivo), pregunta con `confirm()` antes de reenviar.
- **Canal de correo (agregado y luego pausado):** se agregó un botón dentro del correo de notificación de pedido nuevo (`notificarPedidoNuevo` en `Código.js`, ahora manda `htmlBody` además del texto plano) que lleva a una página intermedia (`acción irWhatsAppBancario` en `doGet`) que marca el flag y muestra un botón grande "Abrir WhatsApp". **Nuria reportó que el salto a WhatsApp es inconsistente desde el navegador interno de Gmail** (a veces funciona, a veces la pantalla queda en blanco) — es una limitación conocida de los navegadores internos de apps (bloquean saltos a otras apps por seguridad), no un bug del código. **Decisión al 17 de julio: este canal queda en pausa** ("no toquemos nada de eso todavía") mientras Nuria evalúa un flujo distinto. No tocar `irWhatsAppBancario`, `mensajeDatosBancarios`, ni `linkWhatsAppBancario` en `Código.js` sin que ella lo pida explícitamente.
- **Pendiente de decidir:** cómo recibir el comprobante de pago del cliente con el mínimo de pasos posible. Se descartó un formulario de subida de archivos (más fricción, menos confianza que WhatsApp para esta base de clientes). La recomendación dada fue: correo automático con los datos bancarios + un link de WhatsApp con mensaje pre-escrito para que el cliente solo tenga que adjuntar la foto y enviar — pero **no se implementó**, Nuria lo está pensando.
- **Automatización de WhatsApp verdadera (mandar mensajes sin que un humano toque "enviar") no es posible** sin la API oficial de WhatsApp Business de Meta, que requiere verificación de negocio, plantillas aprobadas, y es un servicio pago más allá de una cuota gratuita chica — **decisión: no se persigue por ahora**, es un cambio de infraestructura de negocio, no un ajuste de código.
- **Alternativas gratuitas / freemium evaluadas (julio 2026):**

  | Plataforma | Plan gratis | WhatsApp API | Ideal para |
  |---|---|---|---|
  | **WhatsApp Business App** | ∞ gratis | No (app nativa) | Respuestas rápidas + bienvenida/ausencia manual. Sin lógica condicional, sin CRM. |
  | **n8n.io** (open source) | ∞ gratis (self-hosted) | Meta Cloud API gratuita | Conectar Google Sheets + WhatsApp con workflows no-code. Sin costos de plataforma, solo paga Meta si son mensajes fuera de ventana 24h. |
  | **BotPenguin** | Free forever | Sí (Meta BSP partner) | Chatbot IA multi-canal sin código. Ideal para validar concepto. |
  | **SendPulse** | Freemium | Sí (BSP propio incluido) | Chatbot + CRM + Google Sheets. Plan gratuito con límites. |
  | **ManyChat** | 1,000 contactos | Requiere BSP externo | Marketing y flujos visuales. Limitado sin plan pago. |
  | **Tidio** | 100 conversaciones/mes | Solo WhatsApp Business app | Live chat + chatbot básico. |
  | **Wassenger** | 7 días trial | Sí | Automatización sin código, prueba rápida. |

  **Recomendación:** para el stack actual del proyecto (Google Sheets + Apps Script + HTML), **n8n.io** es la opción más natural: auto-hosteado, sin costo de plataforma, conecta directo a Google Sheets y a la Meta Cloud API gratuita. Alternativa más plug-and-play: **SendPulse** (freemium, BSP incluido, sin configuración técnica).

---

## MAPA EN tienda.html — oculto temporalmente

A pedido explícito de Nuria (17 de julio), el mapa y el botón "📍 Fijar" en `tienda.html` están **ocultos visualmente** (`display:none!important` en CSS + `display:none` inline en el botón), **"hasta nuevo aviso"**. La lógica de geocodificación sigue corriendo por dentro sin que el cliente la vea, así que las órdenes siguen llegando con `mapaLink` aprovechable desde `crm.html`. Si se pide reactivarlo, es tan simple como quitar esos dos `display:none`.

---

## FUNCIONALIDADES IMPLEMENTADAS

### CRM Dashboard (`crm.html`)
- Paneles (17): Dashboard, Órdenes, Pagos pendientes, Nueva Venta, Tracking, Repartidor, Form. Vendedores, Form. Repartidor, Clientes (ranking de recurrentes), Inventario, Analytics, Reportes, CDP (base de datos filtrada), Marketing, Registro de venta, OpenWa / WhatsApp, Wompi / Pagos.
- Tabla de Órdenes con búsqueda (incluye búsqueda por SKU), filtro por estado/zona, color del SKU mostrado con punto de color, hora en zona `America/El_Salvador` formato 12h.
- Badge rojo en "Órdenes" cuando llegan pedidos nuevos.
- Switch de producción por orden (🟠 en producción / 🟢 listo).
- Badge "⏳ Pendiente de pago" con escalación visual a partir de +12h.
- Botón "💳 Enviar datos bancarios" (persistente entre dispositivos, ver sección de WhatsApp arriba) y "✓ Confirmar pago".
- **Editar orden**: modal con nombre/contacto/dirección/zona/cantidad/notas + caja de coordenadas GPS aislada (`ed-gps`), auto-geocodifica si la orden vino de `tienda.html` sin coordenadas guardadas.
- Tracking con timeline visual, fecha de entrega editable (3 días hábiles, excluye domingos), ficha QR imprimible por orden.
- Panel Repartidor con buscador y "Lista del día" imprimible.
- GPS: caja de dirección (con geocodificación automática vía LocationIQ) + caja separada de "pega coordenadas/enlace" que acepta Google Maps, Waze, WhatsApp o coordenadas sueltas; resuelve links acortados (`maps.app.goo.gl`) vía el backend.
- Clientes recurrentes con autosugerencia al escribir nombre/teléfono en Nueva Venta.
- PDFs: "Registro de venta" individual (con foto del SKU embebida), "Reporte" general en bulk (con foto miniatura por fila), y "Reporte por SKU" agrupado — este último **solo incluye órdenes en estado "Nueva orden"**, para no reimprimir pedidos que ya entraron en producción.
- Sistema de tumbas (tombstones) para borrado permanente sincronizado entre dispositivos.
- Guardas contra parpadeo (flicker): tanto la tabla de Órdenes como el catálogo de `tienda.html` comparan una "firma" del contenido visual antes de re-renderizar, así refrescos silenciosos (stock, sync cada 30s) no repintan la tabla entera si nada relevante cambió.

### Tienda / portal de pedidos (`tienda.html`)
- Pantalla inicial: buscar por teléfono o número de orden; cliente recurrente autocompleta nombre/teléfono y muestra direcciones anteriores.
- **Carrito de varios productos** (ver sección arriba) — puede agregar más de un diseño/color al mismo pedido.
- Flujo por pantallas: catálogo (con carrito) → contacto y entrega → revisión + **método de pago: Transferencia o Tarjeta vía Wompi** → confirmación (`s-exito`). *No existe "contra entrega".*
- Catálogo cargado desde Google Sheets (con catálogo embebido `_CAT_EMBED` como fallback si el backend falla).
- Geocodificación automática de la dirección (mapa oculto temporalmente, ver sección arriba).
- Sesión persiste en refresco de página (`sessionStorage`, clave `ngd_session`).
- Botón "Salir" agregado en la pantalla de confirmación (además de "+ Hacer otro pedido").
- Botón "Solicitar datos para transferencia" **oculto temporalmente** (sigue en el código con `display:none`, fácil de reactivar) — a cambio, el texto del paso 3 avisa que los datos bancarios se envían a WhatsApp automáticamente, con nota de que puede tardar hasta 3 minutos.
- Soporte de link de referido de vendedora (`?v=V1`, ver sección arriba).
- Logo de Nugudú embebido en base64.

---

## SKUs — Colección Raíces SV *(histórica — ver nota)*

> **Nota (18 nov 2026):** esta tabla corresponde a la colección de julio 2026. El catálogo **vigente** vive en la hoja `Catalogo` y hoy incluye **5 colecciones** (El Clásico, Snoopy, Moto, Raíces SV y Gorra) con precios de **$9.99 a $19.99**. `tienda.html` lleva una copia embebida (`_CAT_EMBED`) solo como respaldo. La tabla se conserva abajo como referencia histórica.

| SKU_BASE | Diseño | Color | HEX |
|---|---|---|---|
| RSV-KA-NG | KAAN | Negro | #1a1a1a |
| RSV-KA-GR | KAAN | Gris | #6b7280 |
| RSV-MU-NG | MUUK | Negro | #1a1a1a |
| RSV-MU-GR | MUUK | Gris | #6b7280 |
| RSV-IKA-NG | IKAL | Negro | #1a1a1a |
| RSV-IKA-GR | IKAL | Gris | #6b7280 |
| RSV-SA-NG | SAAN | Negro | #1a1a1a |
| RSV-SA-GR | SAAN | Gris | #6b7280 |
| RSV-KI-NG | KIN | Negro | #1a1a1a |
| RSV-KI-GR | KIN | Gris | #6b7280 |
| RSV-OX-NG | OXAN | Negro | #1a1a1a |
| RSV-OX-GR | OXAN | Gris | #6b7280 |

Precio: $25 · Gorras trucker con parche de cuero grabado a láser.

---

## DATOS DE NEGOCIO

- Precios: según la hoja `Catalogo` — hoy de **$9.99 a $19.99** por SKU (el embebido de `tienda.html` usa esos valores como respaldo).
- Pago: transferencia bancaria — Banco Agrícola, cuenta de ahorro 3008410011, Nuria Guadalupe Durán Rodríguez. *(ver abajo: también tarjeta vía Wompi)*
- WhatsApp del negocio: 50376837604.
- Usuario WhatsApp: @nugudulaserstore (vinculado a Instagram).
- Canal digital: `tienda.html` (directo o vía link de vendedora).
- Canal fuerza de ventas: Formulario Google (vendedoras `V@#1`, `V@#2`, `V@#3`) + Nueva Venta directo en `crm.html`.

---

## PASARELA DE PAGO WOMPI + OPENWA — ✅ IMPLEMENTADO

**Estado (18 nov 2026): IMPLEMENTADO.** `crearEnlacePago` y `webhookWompi` están activos en `Código.js`; la tienda ofrece **Transferencia** y **Tarjeta (Wompi)** como métodos de pago (no hay "contra entrega"); el CRM tiene panel **Wompi / Pagos** y panel **OpenWa / WhatsApp** para configuración. La referencia técnica de abajo (OAuth, `/EnlacePago`, webhook) **sigue siendo la vigente**.

**Credenciales de sandbox (proporcionadas por Nuria):**
- APP ID (client_id): `1548f01b4b-1ee8-4f98-8613-2acbd81d8021`
- API SECRET (client_secret): `48f01b4b-1ee8-4f98-8613-2acbd81d8021`

### Nuevo flujo del formulario de pedidos (`tienda.html`)

> **Nota (18 nov 2026):** el flujo implementado usa **2 métodos de pago: Transferencia y Tarjeta (Wompi)** — la rama "Contra entrega" del diagrama **no está implementada**. El resto (pasos, webhook, comprobante) es el vigente.

Se expande de 3 a 5 pasos:

```
Paso 1: Producto   ─→   Paso 2: Datos de envío   ─→   Paso 3: Revisión + método de pago
                                                          │
                                    ┌─────────────────────┼─────────────────────┐
                                    ▼                     ▼                     ▼
                              Tarjeta              Transferencia         Contra entrega
                                    │                     │                     │
                              Paso 4: Pago         Paso 4: Pago          Paso 5: Confirmación
                              (Wompi)              (mostrar datos         (orden generada)
                                                    bancarios en
                                                    pantalla)
                                    │                     │
                                    ▼                     ▼
                              Paso 5: Confirmación   Paso 5: Confirmación
                              + envío comprobante    + selección medio
                                                    (WhatsApp o correo)
```

### Paso 3 — Revisión + selección de método de pago

```
┌─────────────────────────────────┐
│ Resumen de tu pedido            │
│ • KAAN Negro x1     $25.00      │
│ Total:               $25.00      │
│                                 │
│ ¿Cómo deseas pagar?             │
│                                 │
│ ┌─────────────────────────────┐ │
│ │ 💳 Tarjeta débito/crédito   │ │
│ │    Pago seguro vía Wompi    │ │
│ └─────────────────────────────┘ │
│                                 │
│ ┌─────────────────────────────┐ │
│ │ 🏦 Transferencia bancaria   │ │
│ └─────────────────────────────┘ │
│                                 │
│ Correo electrónico (opcional):  │
│ [___________________________]   │
│                                 │
│ [Confirmar y pagar]             │
└─────────────────────────────────┘
```

### Paso 4 — Pago

**Caso tarjeta:** Se redirige al cliente a la interfaz de Wompi (urlEnlace). Al regresar vía urlRedirect, se muestra la confirmación.

**Caso transferencia:** Se muestran los datos bancarios en pantalla + selector de medio de notificación:

```
┌─────────────────────────────────┐
│ ✅ Pedido #ORD-260718-1058       │
│                                 │
│ Realiza la transferencia a:     │
│                                 │
│ Banco Agrícola                  │
│ Cuenta de ahorro: 3008410011    │
│ Titular: Nuria Gpe. Durán R.    │
│ Monto: $25.00                   │
│                                 │
│ ¿Dónde prefieres recibir el     │
│ comprobante de pago?            │
│                                 │
│ ┌─────────────────────────────┐ │
│ │ 📱 WhatsApp                 │ │
│ └─────────────────────────────┘ │
│                                 │
│ ┌─────────────────────────────┐ │
│ │ 📧 Correo electrónico       │ │
│ │   a: cliente@ejemplo.com    │ │
│ └─────────────────────────────┘ │
│                                 │
│ [Enviar]                        │
└─────────────────────────────────┘
```

**Nota:** Los datos bancarios se muestran en pantalla, NO se envían por ningún medio. El usuario SOLO recibe el comprobante de pago después de pagar y enviar la evidencia.

### Paso 5 — Confirmación

Según el medio elegido:

**WhatsApp:**
- Si OpenWa está **activo y configurado** → `Código.js` envía el mensaje automáticamente vía API a `https://openwa.artywebsv.com`. Botón "Enviar comprobante" también disponible como link `wa.me` manual.
- Si OpenWa está **inactivo** → solo se muestra el botón `wa.me` manual (flujo actual, sin cambios).

**Correo electrónico:**
- `GmailApp` en `Código.js` envía un correo con los datos del pedido + botón de WhatsApp para enviar comprobante.

En ambos casos, el botón "Enviar comprobante por WhatsApp" (link `wa.me`) está SIEMPRE presente como respaldo manual, independientemente del estado de OpenWa.

```
┌─────────────────────────────────┐
│ ✅ ¡Pedido registrado!           │
│ Pedido #ORD-260718-1058         │
│                                 │
│ Recibirás el comprobante        │
│ en tu [WhatsApp/Correo].        │
│                                 │
│ ┌────────────────────────────┐  │
│ │ 📎 Enviar comprobante      │  │
│ │    por WhatsApp             │  │
│ └────────────────────────────┘  │
│                                 │
│ [+ Hacer otro pedido]          │
│ [Salir]                        │
└─────────────────────────────────┘
```

### Módulo OpenWa en el CRM (`crm.html`)

Nuevo panel en la sección de administración del CRM. Guardado en Google Sheets (pestaña `config`) o `PropertiesService`:

```
┌─────────────────────────────────┐
│ ⚙️ Configuración de WhatsApp    │
│                                 │
│ Activar envío por WhatsApp      │
│ [🟢 Activado]                   │
│                                 │
│ URL API:                        │
│ [https://openwa.artywebsv.com]  │
│                                 │
│ API Key:                        │
│ [••••••••••••••••••]           │
│                                 │
│ Número remitente:               │
│ [+50376837604]                  │
│                                 │
│ [Probar conexión]               │
│ [Guardar configuración]         │
└─────────────────────────────────┘
```

- **Desactivado / campos vacíos** → el sistema opera 100% con el flujo manual (botón `wa.me`), no se llama a ninguna API externa.
- **Activado** → al enviar comprobante por WhatsApp, se llama a OpenWa API ADEMÁS del botón `wa.me` de respaldo.
- El estado se consulta desde `tienda.html` vía GAS en cada carga. Si está desactivado, la UI muestra el botón `wa.me` normal (sin cambios respecto al flujo actual).

### Acciones en el backend (`Código.js`)

| Acción | Método | Descripción |
|--------|--------|-------------|
| `crearEnlacePago` | POST | Autentica contra Wompi OAuth, crea el enlace de pago, devuelve `urlEnlace` |
| `webhookWompi` | POST | Endpoint público que recibe POST de Wompi, valida hash HMAC-SHA256, actualiza la orden (`pendientePago: false`, guarda `pagoWompiId`) |
| `enviarComprobante` | POST | Envía comprobante de pago: si OpenWa activo → API OpenWa; si no → solo registra. En ambos casos actualiza `comprobanteEnviado: true` en la orden |
| `getConfigOpenWa` | GET | Devuelve si OpenWa está activo (bool) para que `tienda.html` adapte la UI |
| `saveConfigOpenWa` | POST | Guarda URL, API Key y número remitente + activo/inactivo |

### Autenticación OAuth 2.0 (Client Credentials) — Wompi
```
POST https://id.wompi.sv/connect/token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials&client_id=APP_ID&client_secret=API_SECRET&audience=wompi_api
```
- `client_id` = APP_ID
- `client_secret` = API_SECRET
- Token expira en 3600s. Se usa en header `Authorization: Bearer ACCESS_TOKEN`.

### Creación de Enlace de Pago (Wompi)
```
POST https://api.wompi.sv/EnlacePago
Content-Type: application/json
Authorization: Bearer ACCESS_TOKEN
```

Body completo:
```json
{
  "identificadorEnlaceComercio": "ORD-260718-1058",
  "monto": 25.00,
  "nombreProducto": "Gorra Raíces SV - KAAN Negro",
  "formaPago": {
    "permitirTarjetaCreditoDebido": true,
    "permitirPagoConPuntoAgricola": false,
    "permitirPagoEnCuotasAgricola": false,
    "permitirPagoEnBitcoin": false,
    "permitePagoQuickPay": true
  },
  "cantidadMaximaCuotas": "Tres",
  "configuracion": {
    "urlRedirect": "«misma URL de origen»?pago=ok",
    "esMontoEditable": false,
    "esCantidadEditable": false,
    "duracionInterfazIntentoMinutos": 30,
    "emailsNotificacion": "nugudulaserstore@gmail.com",
    "urlWebhook": "https://script.google.com/macros/s/AKfycbx.../exec?action=webhookWompi",
    "notificarTransaccionCliente": true
  }
}
```

Respuesta:
```json
{
  "idEnlace": 15,
  "urlEnlace": "https://lk.wompi.sv/yhDt",
  "estaProductivo": false
}
```

### urlRedirect — Parámetros de retorno y validación

Wompi redirige a `urlRedirect` con:
- `identificadorEnlaceComercio`, `idTransaccion`, `idEnlace`, `monto`, `hash`

**Validación del hash:**
1. Concatenar en orden: `identificadorEnlaceComercio + idTransaccion + idEnlace + monto`
2. HMAC-SHA256 con `API_SECRET` como llave
3. Comparar con parámetro `hash`

### Webhook Wompi

`POST` a `urlWebhook` con el payload de la transacción. Validar:
1. Header `wompi_hash` = HMAC-SHA256 del body completo con `API_SECRET`
2. `ResultadoTransaccion === "ExitosaAprobada"`
3. `EsProductiva === true` (saltar si es prueba)
4. Actualizar orden: `pendientePago = false`, guardar `pagoWompiId`

### Integración OpenWa

API REST en `https://openwa.artywebsv.com`:

```
POST /send-message
Content-Type: application/json

{
  "apiKey": "KEY_DEL_CRM",
  "number": "+503XXXXXXXX",
  "message": "Texto del comprobante..."
}
```

`Código.js` llama con `UrlFetchApp.fetch()`. Si falla (timeout, error HTTP), se ignora silenciosamente — el botón `wa.me` manual sigue siendo el respaldo principal.

### Nuevos campos en el objeto de orden

```js
{
  // ... campos existentes ...
  metodoPago: "tarjeta" | "transferencia" | "contraentrega",
  canalNotificacion: "whatsapp" | "correo",
  email: "cliente@ejemplo.com",
  pagoWompiId: "2bedafea-0924-49f0-927d-8c638e193990",
  comprobanteEnviado: true/false,
  datosBancariosEnviados: true/false  // ya existe
}
```

---

**Ya resueltos (no son un riesgo activo — el `CHECKLIST_MEJORAS_CRM.md` fue actualizado el 18 nov 2026 y ahora los marca como resueltos):**
- ✅ Bloqueo de escritura concurrente (`LockService` / `conLock()`).
- ✅ Formato de una fila por orden en vez de un JSON gigante en una celda (elimina el riesgo del límite de 50,000 caracteres).
- ✅ Backup automático semanal (`backupSemanal`, trigger creado con `crearTriggerBackupSemanal`).
- ✅ Token compartido (`API_TOKEN`) protegiendo el endpoint — ya no es de acceso público anónimo.
- ✅ Validación de precio y SKU contra el catálogo real al recibir pedidos desde `tienda.html` (nunca confía en lo que manda el navegador).
- ✅ Descuento automático de stock al vender, por cada producto de la orden.
- ✅ Notificación por correo al llegar pedido nuevo (`notificarPedidoNuevo`, incluye HTML con botón).
- ✅ **Pasarela de pago Wompi + OpenWa** — implementada: `crearEnlacePago` + `webhookWompi` en `Código.js`, métodos Transferencia/Tarjeta en `tienda.html`, y paneles de configuración Wompi y OpenWa en `crm.html`. Ver sección "PASARELA DE PAGO WOMPI + OPENWA" arriba.

**Genuinamente pendientes:**
- 🔲 Mover los códigos de rol (`ADMIN_CODE='AV@#1'`, `VENDEDORAS` (`V@#1-3`), `PRODUCCION_CODE='P@#1'`, `REPARTIDOR_CODE='R@#1'`) fuera del HTML público de `crm.html` hacia validación del lado servidor. Riesgo bajo hoy, crece si el equipo crece.
- 🔲 Reporte visual en `crm.html` de ventas por vendedora combinando Nueva Venta manual + link digital propio (`?v=V1`).
- 🔲 Formato/flujo separado para clientes B2B (por volumen/mayoreo) — idea puesta sobre la mesa, explícitamente para "más adelante", no cerrar la puerta al B2C actual mientras tanto.
- 🔲 Categorías en catálogo para múltiples tipos de producto (más allá de gorras).

**Evaluadas y descartadas explícitamente (no reabrir sin que Nuria lo pida):**
- ❌ Campo de número de DUI en el checkout de `tienda.html` — descartado por fricción desproporcionada para el ticket promedio y riesgo de manejo de datos sensibles; el paso de confirmar transferencia bancaria ya cumple mejor ese rol de "filtro de compradores serios".
- ❌ Integración con la API oficial de WhatsApp Business (Meta) para automatizar mensajes salientes sin intervención humana — requiere verificación de negocio y es un servicio pago; evaluado como decisión de negocio a futuro, no una tarea de código.
- ❌ Google Maps JavaScript API (pin arrastrable con precisión absoluta en `tienda.html`) — requiere cuenta de facturación de Google Cloud (aunque con crédito mensual gratuito que probablemente cubra el volumen actual); se optó por LocationIQ (gratuito, sin tarjeta) en su lugar.
- ❌ OpenStreetMap/Leaflet como mapa interactivo — rechazado explícitamente por Nuria, quiere Google Maps específicamente por reconocimiento de marca/confianza del cliente.

---

## TRAMPAS TÉCNICAS PARA LA PRÓXIMA IA (aprendidas por las malas)

1. **El `Edit` tool puede estar bloqueado** si la ruta de la carpeta conectada tiene tildes/acentos (como "nugudú"). Si pasa, usar `bash` con Python (`content.replace(old, new)` + `assert content.count(old) == 1` antes de escribir) como alternativa segura, y validar sintaxis con Node después (`new Function(codigo)` sobre el `<script>` extraído para HTML, o sobre el archivo completo para `Código.js`).
2. **El backend (`Código.js`) se despliega con `clasp push`** desde esta carpeta (`.claspignore` sube solo `Código.js` + `appsscript.json`). Después de subir, verificar en producción que el cambio llegó — un push sin verificar no garantiza que la app web esté sirviendo el código nuevo.
3. **El panel "Registro de ejecución" del editor de Apps Script solo muestra ejecuciones manuales** (botón "Ejecutar" de la barra de herramientas). Para ver peticiones reales de la app web, hay que usar el ícono de **"Ejecuciones"** en la barra lateral izquierda.
4. **Los permisos de scope pueden quedar "atascados"** si se agrega un servicio nuevo (`UrlFetchApp`, `GmailApp`, etc.) sin que el flujo de autorización se dispare — la app web falla en silencio con un error de permisos capturado dentro del propio `try/catch`, sin mostrar ningún cartel. Solución: revocar el acceso del proyecto desde `myaccount.google.com/permissions` y volver a autorizar desde cero corriendo manualmente una función que sí use el servicio nuevo.
5. **Los links `wa.me` no se pueden abrir automáticamente por código** (ni con `location.href`, ni con `<meta refresh>`) de forma confiable — los navegadores internos de apps como Gmail bloquean el salto a otra app por seguridad. Siempre usar un botón/link real que el usuario toque directamente.
6. **Herramientas de sandbox con red restringida:** `curl`/`web_fetch` hacia `nominatim.openstreetmap.org`, `us1.locationiq.com`, y `script.google.com` suelen fallar desde el entorno de la IA — no es indicativo de que el servicio real esté caído. Para diagnosticar, usar los logs propios de Apps Script (`Logger.log` + panel de Ejecuciones) en vez de intentar reproducir la llamada desde la sandbox.
7. **El campo `productos` de una orden es un arreglo con un elemento POR UNIDAD**, no un elemento por SKU único. Cualquier código nuevo que lo lea debe tenerlo en cuenta (usar `.length` para contar unidades totales de un SKU, no asumir que cada SKU aparece una sola vez).
8. **`tienda.html`, `crm.html` y `Código.js` no comparten deploy automático.** Cada uno se publica/actualiza por separado: los dos HTML se suben por push a GitHub Pages (rama `main`), `Código.js` se sube con `clasp push`. Un cambio en uno no implica que los otros estén actualizados en producción.

---

## CÓMO CONTINUAR EN UN CHAT NUEVO

**Mensaje de inicio sugerido:**
> Hola, continúo trabajando en el CRM de Nugudú Láser Store. Te adjunto el documento de contexto (`CONTEXTO_NUGUDU_CRM.md`) y los archivos actuales. Por favor leelo completo antes de cualquier cambio. La regla más importante: nunca tocar nada de lo que ya funciona, solo cambios aditivos, y editar el archivo existente en vez de crear uno nuevo.

**Adjuntar:**
1. Este archivo `CONTEXTO_NUGUDU_CRM.md`
2. `crm.html` (CRM — el archivo activo)
3. `tienda.html` (tienda / portal de clientes)
4. `Código.js` (backend — es la fuente de verdad de lo que está en producción; se despliega con `clasp push`)
5. `Code_1.gs` (backend **legado** — solo si se necesita comparar con el pasado; NO es el vigente)

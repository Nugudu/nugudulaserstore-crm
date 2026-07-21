# CONTEXTO COMPLETO — Nugudú Láser Store CRM
## Documento maestro para cualquier IA que continúe este proyecto

*Última actualización: 17 de julio de 2026. Este archivo reemplaza cualquier versión anterior — está escrito para que otra IA (o vos misma en un chat nuevo) entienda el sistema completo sin tener que redescubrir nada por prueba y error.*

---

## ¿QUIÉN SOY?
Soy Nuria Durán, dueña de **Nugudú Productions & Design** en El Salvador.
Manejo **Nugudú Láser Store** — gorras con parche de cuero grabado a láser.
Colección activa: **Raíces SV** (6 diseños × 2 colores = 12 SKUs, $25 c/u).

---

## REGLA MÁS IMPORTANTE PARA CUALQUIER IA QUE TRABAJE AQUÍ

**Nunca tocar nada de lo que ya funciona correctamente. Editar el archivo existente en lugar de crear uno nuevo.** Esta instrucción se repite en casi todos los pedidos y es la regla de oro del proyecto. Antes de cualquier cambio:
1. Leer el archivo real (no asumir contenido de este documento — este documento puede quedar desactualizado, el código fuente siempre manda).
2. Hacer cambios **aditivos y aislados** — si hay que tocar una función que ya funciona, preferir envolverla o extenderla en vez de reescribirla entera.
3. Verificar sintaxis antes de entregar (extraer el `<script>` y correrlo con `new Function()` en Node, o el equivalente para `Code_1.gs`).
4. Mantener `nugudú_crm_v10.html` como espejo exacto de `index.html` después de cada cambio (copiar y `diff` para confirmar).
5. `Code_1.gs` vive en el editor de Apps Script de Nuria, **no se autodespliega**. Cualquier cambio ahí requiere que ella lo pegue manualmente y despliegue una **Nueva versión** (Implementar → Administrar implementaciones → ✏️ → Nueva versión → Implementar). Solo guardar (💾) NO actualiza la app web en producción.

---

## ARCHIVOS DEL PROYECTO (componentes)

| Archivo | Rol | Notas |
|---|---|---|
| `index.html` | CRM / dashboard administrativo | Publicado en GitHub Pages. Un solo archivo HTML+CSS+JS, sin build step. |
| `nugudú_crm_v10.html` | Copia espejo de `index.html` | Debe quedar **byte-idéntica** a `index.html` después de cada cambio. |
| `pedido.html` | Portal de pedidos para clientes (B2C) | Público, sin login. Mismo repo, mismo GAS endpoint. |
| `Code_1.gs` | Backend en Google Apps Script | Único archivo de código del proyecto de Apps Script (además de `appsscript.json`, el manifiesto de permisos). No confundir con "Code.gs" — el nombre real y correcto es **Code_1.gs**. |
| `appsscript.json` | Manifiesto de permisos de Apps Script | Vive dentro del proyecto de Apps Script, no en esta carpeta. Declara `oauthScopes` explícitos (ver sección de permisos más abajo) y la config de `webapp` (`executeAs: USER_DEPLOYING`, `access: ANYONE_ANONYMOUS`). |
| `imagenes/` | Fotos de producto | Una imagen genérica por diseño (`kaan.png`, `muuk.png`, `ikal.png`, `saan.png`, `kin.png`, `oxan.png`) más, cuando existen, fotos exactas por SKU/color (ej. `RSV-KA-NG.png`) que tienen prioridad sobre la genérica. |
| `backups/AAAA-MM-DD/` | Backups manuales con sufijo `.bak` | Se crean solo cuando Nuria los pide explícitamente. Última carpeta: `backups/2026-07-15/`. |
| `CONTEXTO_NUGUDU_CRM.md` | Este documento | Contexto maestro del proyecto. |
| `CHECKLIST_MEJORAS_CRM.md` | Checklist de mejoras técnicas (histórico) | **Mayoría de los puntos ya están resueltos** (ver sección "Puntos de mejora" más abajo) — ese archivo quedó desactualizado, no confiar en su contenido sin verificar contra el código real. |

### URLs públicas
- **CRM:** `https://nugudu.github.io/nugudulaserstore-crm/`
- **Pedidos clientes:** `https://nugudu.github.io/nugudulaserstore-crm/pedido.html`
- **GAS endpoint (deployment activo):** `https://script.google.com/macros/s/AKfycbxXSFbECrtrRPohWOfmU3ZShV5DUEhC2xIlFGWEPL4ur60qpvzYRi7FT1neL1qoFT_m/exec`

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
- `index.html`: `localStorage` como caché local (`KEY='ngd_crm_v10'`), sincronización automática con `Code_1.gs` cada 30 segundos (`syncFromGAS`), más sync inmediato al cargar.
- `pedido.html`: `sessionStorage` para persistir la sesión del cliente si refresca la página.
- Protección de escritura concurrente: `LockService.getScriptLock()` en el backend (`conLock()`), evita que dos guardados simultáneos se pisen entre sí.
- Endpoint protegido por token compartido (`API_TOKEN`) — `index.html` y `pedido.html` deben mandarlo en cada llamada o el backend responde `{ok:false, error:'No autorizado'}`.
- Caché de `SpreadsheetApp.openById()` dentro de una misma ejecución (`abrirSS()`) — evita abrir el mismo spreadsheet varias veces en una sola petición.

---

## ROLES DE ACCESO (códigos actuales, definidos en `index.html`)

| Rol | Código | Acceso |
|---|---|---|
| Administradora | `N4` | Todo el dashboard |
| Vendedora 1 | `N1` | Solo Nueva Venta (+ puede compartir su propio link de `pedido.html?v=N1`, ver más abajo) |
| Vendedora 2 | `N2` | Solo Nueva Venta (+ `pedido.html?v=N2`) |
| Producción | `P1` | Solo Órdenes (con switches de producción/listo) |
| Repartidor | código propio | Solo panel Repartidor |

**Punto de mejora pendiente:** estos códigos son visibles en el código fuente público de `index.html` (`ADMIN_CODE`, `VENDEDORAS`, `PRODUCCION_CODE`). Riesgo bajo dado el tamaño del equipo actual, pero convendría moverlos a validación del lado servidor si el negocio crece.

---

## GEOCODIFICACIÓN (LocationIQ) — historia y estado actual

Se probaron 3 caminos antes de llegar al actual, documentados en el código con comentarios extensos porque el proceso fue largo:
1. **Nominatim (OpenStreetMap), cliente y servidor** — descartado, bloqueaba las peticiones automáticas de forma consistente (siempre devolvía el mismo punto por defecto, San Salvador centro).
2. **Google Maps sin API (embed gratuito)** — funciona como mapa *visual* pero no expone coordenadas de vuelta a la página sin la API paga de Google (`Maps JavaScript API`), que requiere cuenta de facturación.
3. **LocationIQ** (actual) — servicio pensado para uso automático/programático, cuenta gratuita, funciona bien. Clave guardada en `Code_1.gs` como `LOCATIONIQ_KEY`.

**Flujo actual:** tanto `pedido.html` (campo de dirección) como `index.html` (Nueva Venta y Editar orden) llaman a la acción `geocodificar` del backend (`geocodificarDireccion(direccion)` en `Code_1.gs`), que pega contra `https://us1.locationiq.com/v1/search`. Si LocationIQ encuentra resultado, el mapa se centra con precisión y la caja de coordenadas se autocompleta sola (solo si estaba vacía — nunca pisa una coordenada pegada a mano). Si no encuentra nada, cae de vuelta a una búsqueda de texto simple en el embed gratuito de Google Maps, para que el mapa nunca quede vacío.

**⚠️ Trampa de permisos ya resuelta, pero documentada por si vuelve a pasar:** la primera vez que se agregó `UrlFetchApp.fetch()` al proyecto (necesario para hablar con LocationIQ), Apps Script NO mostró el cartel de autorización al ejecutar manualmente funciones que no llegaban a esa línea de código, y la app web fallaba en silencio con `"No tienes permiso para llamar a UrlFetchApp.fetch"` — atrapado dentro del propio `try/catch` de `geocodificarDireccion`, por lo que nunca se veía como un error de autorización obvio. **La solución fue:** revocar el acceso del proyecto desde `myaccount.google.com/permissions` (buscar "nugudú láser store-crm"), y volver a autorizar desde cero corriendo manualmente una función que sí llega a `UrlFetchApp.fetch()` (ej. `probarGeocodificacionManual`), aceptando **todos** los permisos listados (clic en "Seleccionar todo"), y recién ahí redesplegar. Si en el futuro se agrega otro servicio nuevo (ej. `GmailApp`, `DriveApp`) y algo similar vuelve a pasar, este es el mismo arreglo.

**Funciones de diagnóstico que quedaron en `Code_1.gs`** (útiles si la geocodificación falla de nuevo):
- `verUltimoDebugGeo()` — correr manualmente desde el editor, muestra en el log la última respuesta real de LocationIQ.
- `probarGeocodificacionManual()` — fuerza una llamada real a LocationIQ (usado para disparar el cartel de autorización).
- Acción `debugGeo` (GET): `...exec?action=debugGeo&token=...` — muestra el último diagnóstico directo desde el navegador, sin pasar por el editor.
- Acción `testGeo` (GET): `...exec?action=testGeo&token=...&dir=DIRECCION` — geocodifica una dirección directo desde una URL, aislando el problema de cualquier archivo cliente.

**Para diagnosticar ejecuciones reales de la app web:** el botón "Registro de ejecución" del editor **solo sirve para ejecuciones manuales** (clic en "Ejecutar"). Para ver peticiones reales de `pedido.html`/`index.html`, hay que ir al ícono de **"Ejecuciones"** en la barra lateral izquierda del editor (no el botón de arriba) — ahí sí aparece cada `doPost`/`doGet` real con su log completo.

---

## ESTRUCTURA DE UNA ORDEN (objeto guardado en la hoja `datos`)

```js
{
  id: 1752607... ,              // timestamp en ms, también sirve de id único
  orden: "ORD-260716-1072",     // formato ORD-AAMMDD-NNNN
  nombre, contacto, direccion, zona,
  vendedor: "N1" | "N2" | "N4" | "WEB" | "FORM",  // WEB = pedido.html sin link de vendedora; FORM = importado de Google Forms
  precio,                        // PROMEDIO ponderado por unidad si la orden tiene varios productos distintos — el TOTAL siempre es el correcto
  cantidad,                      // suma total de unidades de todos los productos
  total,                         // suma real: Σ (precio_catalogo_del_sku × cantidad_de_ese_sku)
  canal: "Canal Digital" | "Fuerza de ventas" | ...,
  pago: "Transferencia",
  productos: ["SKU-A","SKU-A","SKU-B"],  // OJO: un elemento del arreglo POR CADA UNIDAD (no un elemento por SKU único) — así el conteo de stock/reportes que ya existía (que cuenta ocurrencias en este arreglo) sigue funcionando sin tocar nada
  estado: "0".."4",              // 0=Nueva orden, ver ESTADOS en index.html para el resto
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

**Multi-producto (agregado el 17 de julio de 2026):** `pedido.html` ahora permite agregar más de un producto/diseño a un mismo pedido (pensado para B2C: alguien que quiere comprar, por ejemplo, un gorro para su pareja y otro para un hijo en el mismo pedido). El payload que manda al backend es `items: [{sku, cantidad}, ...]` en vez de un solo `sku`/`precio`/`cantidad` suelto. `guardarPedidoWeb()` en `Code_1.gs` valida cada SKU contra el catálogo real (nunca confía en precio mandado por el cliente), descuenta stock de cada producto por separado, y arma el arreglo `productos` repitiendo cada SKU una vez por unidad — truco que hace que TODO el código existente que ya leía `productos` (PDFs, mensajes de WhatsApp, reportes por SKU) siga funcionando exactamente igual sin ningún cambio adicional. Sigue existiendo compatibilidad hacia atrás: si algún día llega un payload viejo con `sku` suelto (sin `items`), se trata igual como un pedido de un solo producto.

---

## REFERIDOS DE VENDEDORAS EN pedido.html (link con código)

Cada vendedora puede compartir su propio link público agregando su código al final: `pedido.html?v=N1`. El archivo lee ese parámetro en silencio al cargar (`_refV`, cliente no ve ni toca nada) y lo manda en el payload como `vendedorRef`. En `Code_1.gs`, la lista `CODIGOS_VENDEDORAS_WEB = ['N1', 'N2', 'N4']` valida ese código contra los códigos reales de `VENDEDORAS`/`ADMIN_CODE` en `index.html` — si coincide, la orden queda con `vendedor` = ese código en vez de `'WEB'` genérico. Agregar una vendedora nueva a este sistema es: (1) agregarla a `VENDEDORAS` en `index.html`, (2) agregar su código a `CODIGOS_VENDEDORAS_WEB` en `Code_1.gs`. **Punto de mejora sin implementar aún:** un reporte en `index.html` que muestre, por vendedora, el total combinado de ventas manuales (Nueva Venta) + ventas por su link digital — la idea fue discutida y aprobada pero el reporte visual todavía no se construyó.

---

## FLUJO DE DATOS BANCARIOS / WHATSAPP (estado: en evaluación, canal de correo en pausa)

- El botón manual "💳 Enviar datos bancarios" en el tracking de `index.html` (`enviarDatosBancarios(id)`) abre WhatsApp con el mensaje pre-armado (banco, cuenta, monto) y marca `datosBancariosEnviados: true` en la orden, sincronizado al backend — para que si se abre la misma orden desde otro dispositivo, el sistema avise "ya se enviaron antes" en vez de reenviar sin darse cuenta.
- Al abrir el detalle de tracking de una orden en estado "Nueva orden" con pago pendiente, esto se dispara **solo** (una vez por sesión de navegador): si nunca se envió, se abre directo; si ya se había enviado (de cualquier dispositivo), pregunta con `confirm()` antes de reenviar.
- **Canal de correo (agregado y luego pausado):** se agregó un botón dentro del correo de notificación de pedido nuevo (`notificarPedidoNuevo` en `Code_1.gs`, ahora manda `htmlBody` además del texto plano) que lleva a una página intermedia (`acción irWhatsAppBancario` en `doGet`) que marca el flag y muestra un botón grande "Abrir WhatsApp". **Nuria reportó que el salto a WhatsApp es inconsistente desde el navegador interno de Gmail** (a veces funciona, a veces la pantalla queda en blanco) — es una limitación conocida de los navegadores internos de apps (bloquean saltos a otras apps por seguridad), no un bug del código. **Decisión al 17 de julio: este canal queda en pausa** ("no toquemos nada de eso todavía") mientras Nuria evalúa un flujo distinto. No tocar `irWhatsAppBancario`, `mensajeDatosBancarios`, ni `linkWhatsAppBancario` en `Code_1.gs` sin que ella lo pida explícitamente.
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

## MAPA EN pedido.html — oculto temporalmente

A pedido explícito de Nuria (17 de julio), el mapa y el botón "📍 Fijar" en `pedido.html` están **ocultos visualmente** (`display:none!important` en CSS + `display:none` inline en el botón), **"hasta nuevo aviso"**. La lógica de geocodificación sigue corriendo por dentro sin que el cliente la vea, así que las órdenes siguen llegando con `mapaLink` aprovechable desde `index.html`. Si se pide reactivarlo, es tan simple como quitar esos dos `display:none`.

---

## FUNCIONALIDADES IMPLEMENTADAS

### CRM Dashboard (`index.html`)
- Paneles: Overview, Órdenes, Nueva Venta, Inventario, Analytics, Reportes, Tracking, Repartidor, Base de datos filtrada, Clientes (ranking de recurrentes).
- Tabla de Órdenes con búsqueda (incluye búsqueda por SKU), filtro por estado/zona, color del SKU mostrado con punto de color, hora en zona `America/El_Salvador` formato 12h.
- Badge rojo en "Órdenes" cuando llegan pedidos nuevos.
- Switch de producción por orden (🟠 en producción / 🟢 listo).
- Badge "⏳ Pendiente de pago" con escalación visual a partir de +12h.
- Botón "💳 Enviar datos bancarios" (persistente entre dispositivos, ver sección de WhatsApp arriba) y "✓ Confirmar pago".
- **Editar orden**: modal con nombre/contacto/dirección/zona/cantidad/notas + caja de coordenadas GPS aislada (`ed-gps`), auto-geocodifica si la orden vino de `pedido.html` sin coordenadas guardadas.
- Tracking con timeline visual, fecha de entrega editable (3 días hábiles, excluye domingos), ficha QR imprimible por orden.
- Panel Repartidor con buscador y "Lista del día" imprimible.
- GPS: caja de dirección (con geocodificación automática vía LocationIQ) + caja separada de "pega coordenadas/enlace" que acepta Google Maps, Waze, WhatsApp o coordenadas sueltas; resuelve links acortados (`maps.app.goo.gl`) vía el backend.
- Clientes recurrentes con autosugerencia al escribir nombre/teléfono en Nueva Venta.
- PDFs: "Registro de venta" individual (con foto del SKU embebida), "Reporte" general en bulk (con foto miniatura por fila), y "Reporte por SKU" agrupado — este último **solo incluye órdenes en estado "Nueva orden"**, para no reimprimir pedidos que ya entraron en producción.
- Sistema de tumbas (tombstones) para borrado permanente sincronizado entre dispositivos.
- Guardas contra parpadeo (flicker): tanto la tabla de Órdenes como el catálogo de `pedido.html` comparan una "firma" del contenido visual antes de re-renderizar, así refrescos silenciosos (stock, sync cada 30s) no repintan la tabla entera si nada relevante cambió.

### Portal de pedidos (`pedido.html`)
- Pantalla inicial: buscar por teléfono o número de orden; cliente recurrente autocompleta nombre/teléfono y muestra direcciones anteriores.
- **Carrito de varios productos** (ver sección arriba) — puede agregar más de un diseño/color al mismo pedido.
- 3 pasos: producto(s) → datos de contacto y entrega → confirmar.
- Catálogo cargado desde Google Sheets (con fallback hardcodeado si el backend falla).
- Geocodificación automática de la dirección (mapa oculto temporalmente, ver sección arriba).
- Sesión persiste en refresco de página (`sessionStorage`).
- Botón "Salir" agregado en la pantalla de confirmación (además de "+ Hacer otro pedido").
- Botón "Solicitar datos para transferencia" **oculto temporalmente** (sigue en el código con `display:none`, fácil de reactivar) — a cambio, el texto del paso 3 avisa que los datos bancarios se envían a WhatsApp automáticamente, con nota de que puede tardar hasta 3 minutos.
- Soporte de link de referido de vendedora (`?v=N1`, ver sección arriba).
- Logo de Nugudú embebido en base64.

---

## SKUs — Colección Raíces SV

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

- Precio unitario base: $25 (varía por producto según catálogo real en Sheets).
- Pago: transferencia bancaria — Banco Agrícola, cuenta de ahorro 3008410011, Nuria Guadalupe Durán Rodríguez.
- WhatsApp del negocio: 50376837604.
- Usuario WhatsApp: @nugudulaserstore (vinculado a Instagram).
- Canal digital: `pedido.html` (directo o vía link de vendedora).
- Canal fuerza de ventas: Formulario Google (vendedoras N1, N2) + Nueva Venta directo en `index.html`.

---

## PASARELA DE PAGO WOMPI + OPENWA — integración en desarrollo

**Estado:** En implementación.

**Credenciales de sandbox (proporcionadas por Nuria):**
- APP ID (client_id): `1548f01b4b-1ee8-4f98-8613-2acbd81d8021`
- API SECRET (client_secret): `48f01b4b-1ee8-4f98-8613-2acbd81d8021`

### Nuevo flujo del formulario de pedidos (`pedido.html`)

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
- Si OpenWa está **activo y configurado** → `Code_1.gs` envía el mensaje automáticamente vía API a `https://openwa.artywebsv.com`. Botón "Enviar comprobante" también disponible como link `wa.me` manual.
- Si OpenWa está **inactivo** → solo se muestra el botón `wa.me` manual (flujo actual, sin cambios).

**Correo electrónico:**
- `GmailApp` en `Code_1.gs` envía un correo con los datos del pedido + botón de WhatsApp para enviar comprobante.

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

### Módulo OpenWa en el CRM (`index.html`)

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
- El estado se consulta desde `pedido.html` vía GAS en cada carga. Si está desactivado, la UI muestra el botón `wa.me` normal (sin cambios respecto al flujo actual).

### Nuevas acciones en `Code_1.gs`

| Acción | Método | Descripción |
|--------|--------|-------------|
| `crearEnlacePago` | POST | Autentica contra Wompi OAuth, crea el enlace de pago, devuelve `urlEnlace` |
| `webhookWompi` | POST | Endpoint público que recibe POST de Wompi, valida hash HMAC-SHA256, actualiza la orden (`pendientePago: false`, guarda `pagoWompiId`) |
| `enviarComprobante` | POST | Envía comprobante de pago: si OpenWa activo → API OpenWa; si no → solo registra. En ambos casos actualiza `comprobanteEnviado: true` en la orden |
| `getConfigOpenWa` | GET | Devuelve si OpenWa está activo (bool) para que `pedido.html` adapte la UI |
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

`Code_1.gs` llama con `UrlFetchApp.fetch()`. Si falla (timeout, error HTTP), se ignora silenciosamente — el botón `wa.me` manual sigue siendo el respaldo principal.

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

**Ya resueltos (no son un riesgo activo, a diferencia de lo que dice `CHECKLIST_MEJORAS_CRM.md`, que quedó desactualizado):**
- ✅ Bloqueo de escritura concurrente (`LockService` / `conLock()`).
- ✅ Formato de una fila por orden en vez de un JSON gigante en una celda (elimina el riesgo del límite de 50,000 caracteres).
- ✅ Backup automático semanal (`backupSemanal`, trigger creado con `crearTriggerBackupSemanal`).
- ✅ Token compartido (`API_TOKEN`) protegiendo el endpoint — ya no es de acceso público anónimo.
- ✅ Validación de precio y SKU contra el catálogo real al recibir pedidos desde `pedido.html` (nunca confía en lo que manda el navegador).
- ✅ Descuento automático de stock al vender, por cada producto de la orden.
- ✅ Notificación por correo al llegar pedido nuevo (`notificarPedidoNuevo`, incluye HTML con botón).

**Genuinamente pendientes:**
- 🔲 Mover los códigos de rol (`ADMIN_CODE`, `VENDEDORAS`, `PRODUCCION_CODE`) fuera del HTML público de `index.html` hacia validación del lado servidor. Riesgo bajo hoy, crece si el equipo crece.
- 🔲 Reporte visual en `index.html` de ventas por vendedora combinando Nueva Venta manual + link digital propio (`?v=N1`).
- 🔲 **Pasarela de pago Wompi + OpenWa** — integración completa del nuevo flujo de 5 pasos en `pedido.html` con selección de método de pago (tarjeta/transferencia), Wompi para pagos con tarjeta, OpenWa para envío automático de comprobante por WhatsApp (con respaldo manual `wa.me`), y correo electrónico vía GmailApp. Incluye módulo de configuración OpenWa en `index.html` con toggle activar/desactivar. Ver sección "PASARELA DE PAGO WOMPI + OPENWA" arriba.
- 🔲 Formato/flujo separado para clientes B2B (por volumen/mayoreo) — idea puesta sobre la mesa, explícitamente para "más adelante", no cerrar la puerta al B2C actual mientras tanto.
- 🔲 Categorías en catálogo para múltiples tipos de producto (más allá de gorras).

**Evaluadas y descartadas explícitamente (no reabrir sin que Nuria lo pida):**
- ❌ Campo de número de DUI en el checkout de `pedido.html` — descartado por fricción desproporcionada para el ticket promedio y riesgo de manejo de datos sensibles; el paso de confirmar transferencia bancaria ya cumple mejor ese rol de "filtro de compradores serios".
- ❌ Integración con la API oficial de WhatsApp Business (Meta) para automatizar mensajes salientes sin intervención humana — requiere verificación de negocio y es un servicio pago; evaluado como decisión de negocio a futuro, no una tarea de código.
- ❌ Google Maps JavaScript API (pin arrastrable con precisión absoluta en `pedido.html`) — requiere cuenta de facturación de Google Cloud (aunque con crédito mensual gratuito que probablemente cubra el volumen actual); se optó por LocationIQ (gratuito, sin tarjeta) en su lugar.
- ❌ OpenStreetMap/Leaflet como mapa interactivo — rechazado explícitamente por Nuria, quiere Google Maps específicamente por reconocimiento de marca/confianza del cliente.

---

## TRAMPAS TÉCNICAS PARA LA PRÓXIMA IA (aprendidas por las malas)

1. **El `Edit` tool puede estar bloqueado** si la ruta de la carpeta conectada tiene tildes/acentos (como "nugudú"). Si pasa, usar `bash` con Python (`content.replace(old, new)` + `assert content.count(old) == 1` antes de escribir) como alternativa segura, y validar sintaxis con Node después (`new Function(codigo)` sobre el `<script>` extraído para HTML, o sobre el archivo completo para `Code_1.gs`).
2. **`Code_1.gs` no se autodespliega.** Todo cambio ahí requiere que Nuria lo pegue en el editor Y cree una "Nueva versión" del deployment — guardar solo no alcanza.
3. **El panel "Registro de ejecución" del editor de Apps Script solo muestra ejecuciones manuales** (botón "Ejecutar" de la barra de herramientas). Para ver peticiones reales de la app web, hay que usar el ícono de **"Ejecuciones"** en la barra lateral izquierda.
4. **Los permisos de scope pueden quedar "atascados"** si se agrega un servicio nuevo (`UrlFetchApp`, `GmailApp`, etc.) sin que el flujo de autorización se dispare — la app web falla en silencio con un error de permisos capturado dentro del propio `try/catch`, sin mostrar ningún cartel. Solución: revocar el acceso del proyecto desde `myaccount.google.com/permissions` y volver a autorizar desde cero corriendo manualmente una función que sí use el servicio nuevo.
5. **Los links `wa.me` no se pueden abrir automáticamente por código** (ni con `location.href`, ni con `<meta refresh>`) de forma confiable — los navegadores internos de apps como Gmail bloquean el salto a otra app por seguridad. Siempre usar un botón/link real que el usuario toque directamente.
6. **Herramientas de sandbox con red restringida:** `curl`/`web_fetch` hacia `nominatim.openstreetmap.org`, `us1.locationiq.com`, y `script.google.com` suelen fallar desde el entorno de la IA — no es indicativo de que el servicio real esté caído. Para diagnosticar, usar los logs propios de Apps Script (`Logger.log` + panel de Ejecuciones) en vez de intentar reproducir la llamada desde la sandbox.
7. **El campo `productos` de una orden es un arreglo con un elemento POR UNIDAD**, no un elemento por SKU único. Cualquier código nuevo que lo lea debe tenerlo en cuenta (usar `.length` para contar unidades totales de un SKU, no asumir que cada SKU aparece una sola vez).
8. **`pedido.html`, `index.html` y `Code_1.gs` no comparten deploy automático.** Cada uno se publica/actualiza por separado: los dos HTML se suben a donde Nuria los publica (GitHub Pages), `Code_1.gs` se pega y redespliega manualmente. Un cambio en uno no implica que los otros estén actualizados en producción.

---

## CÓMO CONTINUAR EN UN CHAT NUEVO

**Mensaje de inicio sugerido:**
> Hola, continúo trabajando en el CRM de Nugudú Láser Store. Te adjunto el documento de contexto (`CONTEXTO_NUGUDU_CRM.md`) y los archivos actuales. Por favor leelo completo antes de cualquier cambio. La regla más importante: nunca tocar nada de lo que ya funciona, solo cambios aditivos, y editar el archivo existente en vez de crear uno nuevo.

**Adjuntar:**
1. Este archivo `CONTEXTO_NUGUDU_CRM.md`
2. `index.html` (CRM)
3. `pedido.html` (portal clientes)
4. `Code_1.gs` (backend — copiar tal cual está en el editor de Apps Script de Nuria, es la fuente de verdad de lo que está en producción)
5. `nugudú_crm_v10.html` (copia espejo del CRM, opcional si ya se adjuntó `index.html`)

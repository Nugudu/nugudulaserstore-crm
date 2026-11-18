# Checklist de Mejoras — Nugudú CRM
## Calificación, impactos y proyección al completar

---

> **✅ ACTUALIZADO: 18 de noviembre de 2026.** Los puntos **1 a 7 están RESUELTOS** y verificados contra el código real (`crm.html`, `tienda.html`, `Código.js`); el **9** quedó resuelto con esta misma actualización. Queda **abierto solo el punto 8**. La calificación de abajo es la **histórica** del estado previo (octubre 2026, antes de resolverlos).

---

## CALIFICACIÓN HISTÓRICA DEL DESARROLLO: 5.4 / 10 *(estado previo — ya no refleja el riesgo real)*

> **Con los puntos 1–7 resueltos, la nota real estimada es ≈ 8.5 / 10** (la proyección original decía 8.7 al completar todo; solo falta el punto 8, que aportaba +0.3). Los riesgos de pérdida total de datos de la fila "Integridad" **ya no existen**.

*(A octubre 2026 el CRM era **funcionalmente muy completo** — cobertura de features 8.5/10 — pero tenía **riesgos estructurales serios** en la capa de datos que podían causar pérdida total de información sin previo aviso. Esos riesgos son los que quedaron resueltos en los puntos 1–3.)*

| Categoría | Peso | Nota previa (oct 2026) | Aporte |
|---|---|---|---|
| Integridad de datos | 25% | 3.0 / 10 | 0.75 |
| Seguridad | 20% | 4.0 / 10 | 0.80 |
| Escalabilidad | 15% | 4.0 / 10 | 0.60 |
| Funcionalidad / UX | 25% | 8.5 / 10 | 2.13 |
| Mantenibilidad del código | 15% | 7.5 / 10 | 1.13 |
| **TOTAL** | 100% | | **5.4 / 10** |

---

## CHECKLIST — estado al 18 nov 2026 (1–7 y 9 ✅ resueltos · 8 pendiente)

### 🔴 CRÍTICO — ✅ RESUELTOS (18 nov 2026)

- [x] **1. Bloqueo de escritura concurrente (`LockService`)** ✅ **RESUELTO**
  Sin esto, dos personas guardando al mismo tiempo (ej. vos + una vendedora) hacen que una sobrescriba el trabajo de la otra sin aviso.
  **Resuelto con:** `LockService.getScriptLock()` / `conLock()` en `Código.js`.
  ~~**Impacto si no se resuelve:** pérdida silenciosa de órdenes o cambios de estado.~~ *(riesgo eliminado)*

- [x] **2. Eliminar el límite de 50,000 caracteres por celda** ✅ **RESUELTO**
  Todas las órdenes vivían en un solo JSON dentro de una celda. Al superar el límite, la lectura fallaba en silencio y el siguiente guardado podía escribir un archivo vacío sobre todo el historial.
  **Resuelto con:** formato de **una fila por orden** en la hoja `datos` (JSON por fila) — el riesgo de pérdida total dejó de ser posible.
  ~~**Impacto si no se resuelve:** riesgo de pérdida total del historial de órdenes.~~ *(riesgo eliminado)*

- [x] **3. Backup automático semanal de la hoja `datos`** ✅ **RESUELTO**
  Red de seguridad mientras se implementaban los puntos 1 y 2.
  **Resuelto con:** `backupSemanal` + trigger `crearTriggerBackupSemanal` en `Código.js`.

### 🟠 ALTO — ✅ RESUELTOS (18 nov 2026)

- [x] **4. Restringir acceso al endpoint de datos** ✅ **RESUELTO**
  Cualquier persona con la URL de Apps Script podía descargar nombres, teléfonos y direcciones de todos los clientes sin iniciar sesión.
  **Resuelto con:** token compartido `API_TOKEN` — el endpoint responde `{ok:false, error:'No autorizado'}` sin él.
  ~~**Impacto si no se resuelve:** exposición de datos personales de clientes.~~ *(riesgo eliminado)*

- [x] **5. Validar precio y SKU en el servidor al recibir pedidos del portal** ✅ **RESUELTO**
  El portal enviaba el precio directo y el backend lo aceptaba sin comparar contra el catálogo real.
  **Resuelto con:** validación de cada SKU y precio contra la hoja `Catalogo` en `guardarPedidoWeb()` (`Código.js`) — nunca se confía en lo que manda el navegador.
  ~~**Impacto si no se resuelve:** posibilidad de pedidos con precios manipulados.~~ *(riesgo eliminado)*

### 🟡 MEDIO — ✅ RESUELTOS (18 nov 2026)

- [x] **6. Descuento automático de stock al vender** ✅ **RESUELTO**
  El campo STOCK se mostraba en el portal pero nunca se actualizaba solo.
  **Resuelto con:** descuento automático por cada producto de la orden en `Código.js` (por SKU y por unidad).

- [x] **7. Notificación por correo al llegar pedido nuevo** ✅ **RESUELTO**
  **Resuelto con:** `notificarPedidoNuevo` en `Código.js` (correo con `htmlBody` + botón).

### 🟢 BAJO — pulido, sin urgencia (queda solo el punto 8)

- [ ] **8. Mover códigos de rol fuera del HTML público**
  Los códigos actuales **`AV@#1`** (admin), **`V@#1` / `V@#2` / `V@#3`** (vendedoras), **`P@#1`** (producción) y **`R@#1`** (repartidor) son visibles en el código fuente público de **`crm.html`**. Bajo riesgo dado el tamaño del equipo, pero conviene si el negocio crece.
  **Impacto al resolver:** Seguridad +0.3. Esfuerzo: medio (requiere lógica de sesión del lado servidor).

- [x] **9. Mantener la documentación al día con los nombres reales de los archivos** ✅ **RESUELTO (18 nov 2026)**
  Actualizado el 18 nov 2026: `CONTEXTO_NUGUDU_CRM.md` ya no confunde `index.html`/`pedido.html`/`Code_1.gs` con los archivos vigentes (`crm.html`/`tienda.html`/`Código.js`). El punto original era solo corregir la referencia `Code.gs` → `Code_1.gs`; hoy el riesgo de confusión es al revés: no confundir el backend activo `Código.js` con el legado `Code_1.gs`.
  **Impacto:** Mantenibilidad. Esfuerzo: trivial (hecho).

---

## PROYECCIÓN AL COMPLETAR EL CHECKLIST *(tabla histórica)*

| Categoría | Peso | Nota previa (oct 2026) | Nota proyectada | Aporte proyectado |
|---|---|---|---|---|
| Integridad de datos | 25% | 3.0 | **9.0** | 2.25 |
| Seguridad | 20% | 4.0 | **8.3** | 1.66 |
| Escalabilidad | 15% | 4.0 | **8.5** | 1.28 |
| Funcionalidad / UX | 25% | 8.5 | **9.3** | 2.33 |
| Mantenibilidad | 15% | 7.5 | **8.0** | 1.20 |
| **TOTAL** | 100% | **5.4** | **8.7** | |

### Resultado esperado
**5.4 → 8.7 sobre 10** — una mejora de **+3.3 puntos (≈ 61% de mejora)** sobre la calificación original.

### ✅ Estado real al 18 de noviembre de 2026
Los puntos **1–7 están resueltos** (y el 9, documentación). Prácticamente se alcanzó la proyección: **nota estimada ≈ 8.5 / 10**. El único pendiente con impacto es el **punto 8** (sacar los códigos de rol del HTML público, +0.3 de Seguridad). El riesgo activo de pérdida total de información (Integridad 3.0) **ya no existe**.

---

*Revisado originalmente a partir de: `CONTEXTO_NUGUDU_CRM.md`, `Code_1.gs`, `index.html` / `nugudú_crm_v10.html`, `pedido.html`.*
*Actualizado y verificado el 18 nov 2026 contra: `CONTEXTO_NUGUDU_CRM.md`, **`crm.html`**, **`tienda.html`**, **`Código.js`**.*

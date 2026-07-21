# Checklist de Mejoras — Nugudú CRM
## Calificación actual, impactos y proyección al completar

---

## CALIFICACIÓN ACTUAL DEL DESARROLLO: 5.4 / 10

El CRM es **funcionalmente muy completo** (cobertura de features 8.5/10) pero tiene **riesgos estructurales serios** en la capa de datos que pueden causar pérdida total de información sin previo aviso. Es un desarrollo sólido a nivel de producto, frágil a nivel de infraestructura.

| Categoría | Peso | Nota actual | Aporte |
|---|---|---|---|
| Integridad de datos | 25% | 3.0 / 10 | 0.75 |
| Seguridad | 20% | 4.0 / 10 | 0.80 |
| Escalabilidad | 15% | 4.0 / 10 | 0.60 |
| Funcionalidad / UX | 25% | 8.5 / 10 | 2.13 |
| Mantenibilidad del código | 15% | 7.5 / 10 | 1.13 |
| **TOTAL** | 100% | | **5.4 / 10** |

---

## CHECKLIST — revisar y resolver en este orden

### 🔴 CRÍTICO — resolver antes de seguir creciendo el volumen de pedidos

- [ ] **1. Bloqueo de escritura concurrente (`LockService`)**
  Sin esto, dos personas guardando al mismo tiempo (ej. vos + una vendedora) hacen que una sobrescriba el trabajo de la otra sin aviso.
  **Impacto si no se resuelve:** pérdida silenciosa de órdenes o cambios de estado, cada vez más frecuente a medida que más personas usan el sistema a diario.
  **Impacto al resolver:** Integridad de datos 3 → 7. Esfuerzo: bajo (unas líneas en `Code_1.gs`).

- [ ] **2. Eliminar el límite de 50,000 caracteres por celda**
  Todas las órdenes viven en un solo JSON dentro de una celda. Al superar el límite, la lectura falla en silencio y el siguiente guardado puede escribir un archivo vacío sobre todo tu historial.
  **Impacto si no se resuelve:** riesgo de **pérdida total del historial de órdenes** — el más grave de todo el sistema. El límite se acerca conforme crece tu base de clientes.
  **Impacto al resolver:** Integridad de datos 7 → 9, Escalabilidad 4 → 8. Esfuerzo: medio (cambiar el formato de guardado: una fila por orden en vez de una celda gigante).

- [ ] **3. Backup automático semanal de la hoja `datos`**
  Red de seguridad mientras se implementan los puntos 1 y 2.
  **Impacto al resolver:** Integridad de datos +1 adicional (capa de recuperación ante cualquier falla no prevista). Esfuerzo: bajo (una función con trigger semanal en Apps Script).

### 🟠 ALTO — protege datos de clientes y dinero

- [ ] **4. Restringir acceso al endpoint de datos**
  Hoy cualquier persona con la URL de Apps Script puede descargar nombres, teléfonos y direcciones de todos tus clientes sin iniciar sesión.
  **Impacto si no se resuelve:** exposición de datos personales de clientes — riesgo reputacional y de privacidad.
  **Impacto al resolver:** Seguridad 4 → 7. Esfuerzo: bajo-medio (agregar validación de token simple en `doGet`/`doPost`).

- [ ] **5. Validar precio y SKU en el servidor al recibir pedidos del portal**
  Hoy `pedido.html` envía el precio directo y el backend lo acepta sin comparar contra el catálogo real.
  **Impacto si no se resuelve:** posibilidad de pedidos con precios manipulados; ensucia reportes y analytics.
  **Impacto al resolver:** Seguridad 7 → 8. Esfuerzo: bajo (comparar contra `Catalogo` antes de guardar).

### 🟡 MEDIO — mejora operativa, no es un riesgo de pérdida de datos

- [ ] **6. Descuento automático de stock al vender**
  El campo STOCK se muestra en el portal pero nunca se actualiza solo; hoy depende de que lo edites a mano en la hoja.
  **Impacto al resolver:** Funcionalidad 8.5 → 9. Esfuerzo: bajo.

- [ ] **7. Notificación por correo al llegar pedido nuevo**
  Ya está identificado en tus pendientes (`MailApp`).
  **Impacto al resolver:** Funcionalidad 9 → 9.3. Esfuerzo: bajo.

### 🟢 BAJO — pulido, sin urgencia

- [ ] **8. Mover códigos de rol fuera del HTML público**
  Los códigos N1/N2/N4/P1 son visibles en el código fuente. Bajo riesgo dado el tamaño del equipo, pero conviene si el negocio crece.
  **Impacto al resolver:** Seguridad 8 → 8.3. Esfuerzo: medio (requiere lógica de sesión del lado servidor).

- [ ] **9. Corregir referencia `Code.gs` → `Code_1.gs` en el documento de contexto**
  Solo para evitar confusión al iniciar futuras conversaciones.
  **Impacto:** Mantenibilidad +0.2. Esfuerzo: trivial.

---

## PROYECCIÓN AL COMPLETAR EL CHECKLIST

| Categoría | Peso | Nota actual | Nota proyectada | Aporte proyectado |
|---|---|---|---|---|
| Integridad de datos | 25% | 3.0 | **9.0** | 2.25 |
| Seguridad | 20% | 4.0 | **8.3** | 1.66 |
| Escalabilidad | 15% | 4.0 | **8.5** | 1.28 |
| Funcionalidad / UX | 25% | 8.5 | **9.3** | 2.33 |
| Mantenibilidad | 15% | 7.5 | **8.0** | 1.20 |
| **TOTAL** | 100% | **5.4** | **8.7** | |

### Resultado esperado
**5.4 → 8.7 sobre 10** — una mejora de **+3.3 puntos (≈ 61% de mejora)** sobre la calificación actual.

El salto más importante ocurre en **Integridad de datos (3.0 → 9.0)**: pasás de tener un riesgo activo de pérdida total de información a una arquitectura donde ese escenario deja de ser posible. Es la categoría que más pesa en el resultado final porque, sin datos confiables, ninguna otra mejora importa.

Los puntos 1, 2 y 3 (🔴 Crítico) concentran el 80% de la mejora proyectada — priorizarlos primero es lo que más impacto tiene por el menor esfuerzo.

---

*Generado a partir de la revisión de: `CONTEXTO_NUGUDU_CRM.md`, `Code_1.gs`, `index.html` / `nugudú_crm_v10.html`, `pedido.html`.*

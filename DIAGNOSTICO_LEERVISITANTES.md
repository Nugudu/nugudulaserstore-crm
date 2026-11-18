# Diagnóstico — esperas en `leerVisitantes` / CDP Visitantes

**Fecha:** 22 sep 2026  
**Estado prod al cierre:** deployment **@208** (misma URL), sin instrumentación  
**Commit de referencia limpio:** **`aec0154`** (fix Visitantes conservado)  
**302 de Apps Script:** intacto (no se eliminó, evitó ni modificó)

---

## 1. Qué se investigó en `leerVisitantes()`

- Origen de esperas percibidas de ~20–40 s en el frontend CDP (Visitantes).
- Si el cuello de botella estaba en lectura de Sheet (`getValues`), procesamiento de filas, caché GAS (60 s) o en la función misma.
- Comparación de corridas en caliente (cache hit) vs forzadas (`refresh=1` / miss).

## 2. Tiempos internos observados

Instrumentación temporal **`_lat`** dentro de `leerVisitantes()` (retirada al cierre):

| Escenario | `getValuesMs` | `procMs` | `totalMs` (interno) | Filas |
|---|---:|---:|---:|---:|
| Cache **hit** | 0 | 0 | ~6–100 ms | — |
| Cache **miss** / Sheet | ~0.3–1.7 s | ~30–180 ms | ~0.4–1.7 s | ~198–201 |
| `refresh=1` (skip caché) | ~0.4–1.6 s | decenas–centenas ms | ~0.4–1.7 s | ~201 |

**Conclusión interna:** en ejecuciones normales, el procesamiento del CRM está en el orden de **milisegundos a &lt; ~1 s**. No explica ventanas de 15–40 s.

## 3. Qué se comprobó sobre `doGet()`

Instrumentación temporal **`_path`** solo en la rama GET `action=leerVisitantes` (retirada al cierre):

- `doGet0ToLvMs` (antes de entrar a `leerVisitantes`): **~0 ms**
- `lvToEndMs` (después de `leerVisitantes` dentro de `doGet`): **~0 ms**
- `doGetTotalMs` ≈ tiempo de `lvCall` (dominado por la función, no por el despachante)

**Conclusión:** `doGet()` no añade espera material alrededor de `leerVisitantes()`.

## 4. Recorrido HTTP (`script.google.com → 302 → script.googleusercontent.com → 200`)

Prueba con `curl` **con y sin `-L`**, luego cadena atómica con `&_probe` único y **Location no reutilizada**:

| Hop | URL | Rol | Típico | Rango observado |
|---|---|---|---:|---|
| **1** | `…/macros/s/…/exec` | Emite **302** → Location | **~0.7–1.5 s** | **~0.7 s – 12.1 s** (outlier) |
| **2** | `script.googleusercontent.com/macros/echo?…` | Ejecuta y devuelve **200** JSON | **~0.25–0.35 s** | ~0.24–0.34 s (hit); miss red ~0.27–0.29 s* |

\*En `refresh=1`, el hop2 aislado a veces devolvía red &lt; `_lat.totalMs` (no confiable para validar `getValues` en miss; ver §8). En **hit**, red hop2 ≥ `_lat` → `_lat` de **esa** ejecución.

**Siempre 1 redirect.** Hop1 concentró la mayor parte del tiempo en el patrón normal (**~3×** hop2 en medianas: ~915 ms vs ~276 ms).

## 5. Esperas largas no atribuidas a `leerVisitantes()`

- Internos de la función: **≤ ~1.7 s** en miss; **~10–100 ms** en hit.
- `doGet` alrededor de la función: **~0 ms**.
- Los tiempos de **15–40 s** (y el outlier de red) **no** se explicaron con el procesamiento de `leerVisitantes()` ni del CRM.

## 6. Variabilidad del hop 1 / outlier ~12 s

- Hop1 fue el de **mayor variabilidad** en el recorrido HTTP.
- **Outlier FAST1:** hop1 ≈ **12.1 s** solo para el **302**; hop2 devolvió **otro 302** a ~12.7 s; `-L` terminó en **404** a ~27 s.
- Registrado como **anomalía del recorrido HTTP**, no como problema demostrado de `leerVisitantes()`.

## 7. El 302 se mantiene intacto

- Arquitectura actual del CRM conservada.
- **No** se eliminó, evitó ni modificó el redirect `script.google.com` → `script.googleusercontent.com`.

## 8. Instrumentación temporal (ya retirada)

| Marca | Ubicación | Estado al cierre |
|---|---|---|
| `_lat`, `t0–t3`, `Logger` `CDP_LAT` | `leerVisitantes()` | **Retirada** |
| `_path`, `_tDoGet0`, marcas rama GET, `Logger` `CDP_PATH` | `doGet()` solo `leerVisitantes` | **Retirada** |
| `&_probe` | Solo en tests curl (query, no en código) | No desplegado |

Verificación local: sin marcadores de diagnóstico; `Código.js` ≡ `backups/2026-07-29/Código.js`; diff vs `aec0154` vacío.

## 9. Estado limpio de referencia

- **Commit:** **`aec0154`** — fix Visitantes (`_cdpVisitantesReq`, `_cdpVisitantesTieneDatos`, guard en `cdpCargarVisitantes`).
- Rollback de regresión previo (solo si se necesita el punto anterior al fix): tag **`backup-620a9a8`** @ `d234e79` — **no** es el punto limpio de esta etapa.

## 10. Producción al cierre

- **`clasp push --force`** + **`clasp deploy -i`** mismo `deploymentId` → **@208**.
- Misma URL de producción; **sin** `_lat` / `_path` en respuestas (hit y `refresh=1`).
- **Fix Visitantes** conservado y operativo (`ok: true`, visitantes presentes).
- Sin optimización adicional; sin cambios de URL, caché, timer, frontend ni otras lógicas.

---

## Veredicto (etapa cerrada)

1. **`leerVisitantes()` no explica las esperas largas.**  
2. Procesamiento CRM normal: **ms a &lt; ~1 s**.  
3. Patrón normal: mayor tiempo en **hop 1 (302)**.  
4. **302 se mantiene.**  
5. Outlier **~12 s en el 302** = anomalía HTTP, no atribuida a `leerVisitantes()`.  
6. Instrumentación **retirada**; limpio en **`aec0154`** + deploy **@208**.

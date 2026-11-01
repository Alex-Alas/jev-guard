# jev-guard · Documento técnico de integración

> **Para quién es esto.** Para la persona que integra el guard en el motor de C2 Live, y para un agente de código que la asista. Está escrito para leerse de corrido una vez y después consultarse por sección. Las afirmaciones sobre C2 Live vienen de inspeccionar el sitio público (`/overlay`, `caption-feed.js`, `/health`) el 31-oct-2026; lo que no se pudo verificar está marcado como **[SUPUESTO]**.

---

## 0. Resumen ejecutivo

- **Problema:** el reconocedor de voz y el traductor a veces producen una grosería que el ponente nunca dijo. La cola del subtítulo se reescribe mientras la persona habla, así que una grosería falsa puede aparecer en pantalla aunque luego se corrija sola.
- **Solución:** una función `guard.push(msg)` que se intercala antes de difundir cada subtítulo. Un léxico local tapa al instante cualquier palabra sospechosa. Después Jev decide, con el contexto, si era una grosería real, un error de reconocimiento (y cuál era la palabra correcta) o una palabra inocente.
- **Latencia añadida al texto limpio:** prácticamente 0, porque el filtrado es síncrono y menor a 1 ms. Las palabras marcadas se ven como «…» durante el tiempo que tarde Jev (~0,4–1,5 s). El sellado de una línea con palabras pendientes se retiene hasta 900 ms.
- **Garantía central:** ningún término del léxico llega crudo a ninguna salida. Ante cualquier falla, el resultado es «…», nunca la palabra.

---

## 1. Lo que se sabe de C2 Live

### 1.1 Superficies

| Ruta | Rol |
| --- | --- |
| `/capture` | Operador de audio: un canal USB por micrófono (hasta 6), con nombre del ponente. |
| `/overlay` | Consola LED: región, posición, tema, tamaño, QR. |
| `/overlay?live=1` | Salida limpia para vMix (Web Browser Input). |
| `/listen` | Escucha móvil del público vía QR. Lee en voz alta los subtítulos sellados. |
| `/health` | Estado: `mode` (`mono`), `channels`, `maxChannels: 6`, `labels`, config del overlay, `outputs`. |
| WebSocket `/display` | Flujo de mensajes hacia las salidas. |

### 1.2 Mensajes del WebSocket `/display`

Observados en el código del overlay:

- `{type:"state", live, source, target, …}`: estado y par de idiomas (por defecto `en` → `es`, con código completo tipo `es-US`).
- `{type:"caption", captionId, revision, committed, mutable, sealed, speaker?, channel?}`: el subtítulo.
- `{type:"clear"}`: limpia la pantalla.
- Latido cada 20 s. El overlay reconecta si pasan 60 s sin latido.

### 1.3 Reglas de `caption-feed.js` (las respeta el guard)

1. **Una línea por `captionId`.** `committed + ' ' + mutable` se pinta palabra a palabra, y solo se reescribe la cola que cambia.
2. **`revision` es monótona dentro de cada caption.** Una revisión igual o menor se descarta.
3. **`sealed` es terminal.** Al sellar, la línea muestra solo `committed`, se quita el cursor y el `captionId` entra en un anillo de «hechos» (64). Un mensaje posterior para ese id se ignora.
4. **Vías (lanes).** Una vía es `channel` o `'g'`. Cuando llega un `captionId` nuevo en una vía, la línea anterior de esa vía se cierra con el texto que tenía.
5. Una línea abierta sin palabras durante 12 s se sella sola (`staleMs`).
6. En `/listen`, un subtítulo **sellado** se lee en voz alta, y solo una vez.

### 1.4 Consecuencias para el diseño

- **No basta con corregir después.** Si la grosería se pinta en una revisión, el público ya la vio. El tapado tiene que ocurrir antes de la primera emisión.
- **El sello hay que retenerlo.** `/listen` lee en voz alta lo sellado, y no se puede «des-leer».
- **Nunca se emite para un caption reemplazado.** Si llega un mensaje del caption A después de que B abrió línea en la misma vía, el feed cierra la línea de B (regla 4) y abre otra para A. Eso rompe la pantalla.

---

## 2. Arquitectura

```
                 ┌────────────────────────── guard.push(msg) ──────────────────────────┐
 motor ─ msg ──► │ 1. ¿type ≠ caption? → pasa intacto (clear además reinicia estado)    │
                 │ 2. Vía / revisión: descarta viejas, sella retenidos reemplazados      │
                 │ 3. render():                                                          │
                 │      detect(committed + ' ' + mutable)   ← léxico, síncrono           │
                 │      por cada hit:                                                    │
                 │        veredicto en caché → aplica (corrige / muestra / tapa)         │
                 │        sin veredicto     → tapa «…» y encola consulta a Jev           │
                 │ 4. ¿sealed y hay pendientes? → emite sin sellar + timer holdSealMs    │
                 │ 5. emit(msg filtrado, revision propia monótona)                       │
                 └───────────────────────────────────────────────────────────────────────┘
                                   │ (asíncrono)
                                   ▼
                 Jev responde → guarda veredicto → re-render de los captions que esperaban
                               → emite revisión nueva (y sella si estaba retenido)
```

### 2.1 Línea de tiempo típica (simulación incluida, Jev a 350 ms)

```
  738 ms  [s1 r9]  Abran la sheet de cálculo ⟨y revisen la⟩              ← «shit» ya corregido a «sheet»
 1797 ms  [s2 r7]  Honestamente, el primer prototipo ⟨fue una …⟩        ← tapado al instante
 1978 ms    sello retenido esperando a Jev
 2129 ms  [s2 r10 SELLADO] … fue una … total.                            ← llegó s3: sello forzado, tapado
 2147 ms    jev: «mierda» → mask
```

La consulta a Jev arranca cuando la palabra aparece en la cola mutable (*prefetch*), no cuando se sella. Por eso casi siempre llega antes del sello.

---

## 3. Contrato e invariantes

**Entrada:** mensajes de `/display` tal cual. **Salida (`emit`)**: mensajes con la misma forma. Solo cambian `committed`, `mutable`, `sealed` y `revision`; el resto de los campos se copia.

| # | Invariante | Dónde se prueba |
| --- | --- | --- |
| I1 | Ninguna coincidencia del léxico aparece cruda en `committed` ni en `mutable` de ninguna emisión, salvo que Jev la haya destapado (solo `amb`) o corregido. | `guard.test.js` › propiedad |
| I2 | El tapado es síncrono: `push` emite antes de retornar. | › cola mutable síncrona |
| I3 | `revision` de salida es estrictamente creciente por `captionId` y empieza en 1. | › revisiones |
| I4 | `sealed:true` se emite como mucho una vez por `captionId`, y nada se emite después. | › veredicto tardío |
| I5 | No se emite para un caption reemplazado en su vía, salvo el sello forzado, que va **antes** del caption nuevo. | › orden / reemplazado |
| I6 | Mensajes no `caption` pasan intactos y en orden. | › passthrough |
| I7 | `push` nunca lanza. Ante un error interno, el mensaje se descarta (fail-closed). | try/catch en `push` |

---

## 4. Algoritmo en detalle (`src/caption-guard.js`)

### 4.1 Render

1. `joined = committed + (ambos ? ' ' : '') + mutable`.
2. `hits = detect(joined)`: sin solapes, cada uno con offsets sobre el texto original.
3. Se reconstruyen `committed` y `mutable` por separado. Un hit que cruza la frontera se escribe completo en `committed` y su parte mutable se descarta.
4. Para cada hit, `resolve()` devuelve el texto a mostrar y si quedó **pendiente**.

### 4.2 Clave de caché

`id_de_entrada | normalize(texto desde 60 caracteres antes del hit hasta su fin)`

Solo se usa contexto **izquierdo** porque es estable: cuando el STT agrega palabras a la derecha, la clave no cambia y no se vuelve a consultar. Si el STT reescribe algo a la izquierda, la clave cambia y se pregunta de nuevo, lo cual es correcto porque el contexto cambió.

- Caché LRU de 500 entradas. Las pendientes nunca se expulsan.
- Los veredictos por error o con el breaker abierto expiran a los 10 s (`failureTtlMs`). Los demás no expiran.

### 4.3 Consultas a Jev

- Cola con concurrencia máxima `maxConcurrent` (4).
- **Prefetch de la cola mutable:** un hit en `mutable` se consulta solo si hay hueco de concurrencia, para no gastar cupo en palabras que el STT probablemente va a cambiar. Un hit en `committed` siempre se encola.
- Todos los captions que muestran el mismo hit (misma clave) quedan como *waiters* y se repintan cuando llega el veredicto.
- **Circuit breaker:** después de 3 fallos seguidos no se llama a Jev durante 30 s. Mientras tanto todo hit se tapa sin consultar (modo solo-léxico).

### 4.4 Sello retenido

- Si llega `sealed:true` con hits pendientes, se emite **sin sellar** y arranca un timer de `holdSealMs`.
- Si el veredicto llega antes, se emite sellado con el resultado.
- Si vence el timer, se emite sellado con la palabra tapada (`seal_forced`).
- Si antes llega un caption nuevo en la misma vía, el retenido se sella **en ese momento**, tapado si sigue pendiente, y recién después se procesa el nuevo. **En la práctica, la retención dura lo mínimo entre `holdSealMs` y la pausa hasta la siguiente frase.** Por eso importa el prefetch.

### 4.5 Reemplazo y reset

- Caption reemplazado sin sello retenido: se marca `superseded` y sus veredictos tardíos ya no emiten nada. Queda en pantalla con «…», que es seguro.
- `{type:'clear'}` o `guard.reset()`: se descartan captions, vías y consultas pendientes. Las respuestas en vuelo se ignoran (época).

---

## 5. Léxico (`src/lexicon.js`)

```js
{ id: 'en_shit', lang: 'en', cat: 'escatologico', sev: 3,
  v: ['shit', 'shits', 'shitty', 'bullshit'],
  alts: ['sheet', 'sit', 'ship', 'shift', 'shot', 'chip'] }
```

| Campo | Efecto |
| --- | --- |
| `v` | Variantes. Se normalizan (minúsculas, sin acentos, leetspeak básico). Tolera letras estiradas («fuuuck»). Las multipalabra admiten puntuación entre palabras. |
| `sev` | 1–4. Se filtra lo que tenga `sev >= minSeverity` (2 por defecto). |
| `amb` | Tiene un significado inocente común. Solo estas palabras se **destapan** cuando Jev dice que no son grosería. |
| `alts` | Palabras inocentes que el STT o el traductor pudieron confundir. Se ofrecen a Jev como opciones de corrección (máx. 6, en orden). **Para el evento, este es el campo con más impacto.** |
| `safe` / `unsafe` | Regex de contexto sobre la oración normalizada. Con `safe` y sin `unsafe`, no se marca. |
| `bad` | Regex obligatoria. Solo se marca si el contexto la cumple (p. ej. `coger` solo con contexto sexual). |

Además se tapa siempre, sin consultar, cualquier palabra ya censurada por el STT (`f***`, `s**t`).

**Cómo agregar un término:** se agrega una entrada o una variante, se le ponen `alts` si hay confusiones plausibles con vocabulario técnico de la charla, y se agrega un caso en `test/detector.test.js`. Si la palabra es común en charlas técnicas, se agrega también una frase limpia al test «no marca frases normales».

**Por qué el léxico es amplio a propósito:** todo lo que marca pasa por Jev. Un falso positivo cuesta ~0,5 s de «…», no un error en pantalla.

---

## 6. Jev (`src/jev-client.js`)

### 6.1 Llamada

`POST https://api.commandcode.ai/provider/v1/systemone` con `Authorization: Bearer <key>` y este cuerpo:

```json
{
  "model": "typesafe/jev",
  "state": "Live subtitles of a conference talk… Previous subtitle: \"…\"\nCurrent subtitle: \"Abran la shit de cálculo\"\nFlagged word: \"shit\"",
  "questions": {
    "real": { "type": "noul", "instructions": "…is it likely the speaker really meant the vulgar word…", "criteria": { "true": "…", "false": "…" } },
    "fix":  { "type": "choice", "instructions": "…which word fits best?", "criteria": { "w0": "The intended word was \"sheet\".", "w1": "…", "keep": "None of these fit…" } }
  }
}
```

Respuesta usada: `answers.real.noul` (probabilidad 0–1) y `answers.fix.choice` (clave).

### 6.2 Regla de decisión (`decide`)

```
p = answers.real.noul
p inválido                                → TAPAR
p ≥ allowBelow (0.35)                     → TAPAR   (probable grosería real)
fix.choice ∈ alts (y confianza ≥ 0.5)     → CORREGIR con esa palabra (respeta mayúsculas)
entrada amb                               → MOSTRAR la original
si no                                     → TAPAR   (fue error, pero no hay corrección segura)
```

Para ser más estrictos se baja `allowBelow`. Con `0` nunca se destapa ni se corrige: queda como un filtro puro con Jev de adorno.

### 6.3 Presupuesto de tiempo

`timeoutMs` por llamada: 1500. Referencia medida en el prototipo `boca-limpia`: ~400 ms para una pregunta simple y hasta ~1,6 s para un paquete de cinco preguntas. Con dos preguntas se espera algo cercano al primer número. **[SUPUESTO]** Hay que medirlo en la red del evento (§9).

---

## 7. Integración paso a paso (servidor, recomendada)

> Checklist para un agente: cada paso es verificable.

1. **Ubicar el punto de difusión.** En el servidor del motor, buscar dónde se serializan mensajes hacia los sockets de `/display` (búsqueda sugerida: `"/display"`, `type: "caption"`, `committed`, `sealed`). Debe haber una sola función o un solo lugar. Si hay varios (p. ej. uno por salida), centralizarlos primero.
2. **Agregar la dependencia.** Copiar `src/` como módulo o instalar desde el repo. ESM, sin dependencias, Node ≥ 20 (usa `fetch` y `AbortController` nativos).
3. **Crear el guard una sola vez por proceso** con `emit = la función de difusión original`. Si hay varias salas o sesiones con streams independientes, crear un guard por stream.
4. **Reemplazar** `difundir(msg)` por `guard.push(msg)` para **todos** los mensajes que van a `/display`, no solo los captions, para conservar el orden relativo.
5. **Key:** variable de entorno `COMMAND_CODE_API_KEY` en Cloud Run (Secret Manager). Nunca en el cliente.
6. **`getSource`:** si el motor conoce el texto en inglés del segmento, devolverlo aquí. Mejora mucho la corrección. Si los captions llevan otro campo (`sourceText`, `src`…), ajustar.
7. **`/listen`:** confirmar que recibe el mismo flujo. **[SUPUESTO]** Si tiene un canal propio (p. ej. TTS generado en el servidor), el texto que se sintetiza debe salir **del guard** (lo emitido con `sealed:true`), nunca del motor directo.
8. **Logs:** conectar `onEvent` al logger. Como mínimo `jev_error`, `breaker_open`, `seal_forced`, `guard_error`.
9. **Probar** con `npm test` y con un ensayo real (§9).

### 7.1 Variante en navegador (si no se puede tocar el servidor)

`examples/browser-shim.html`: envuelve `window.C2Caption.onMessage` en cada salida. Requiere `server/jev-proxy.mjs`, que guarda la key y solo acepta orígenes listados en `ALLOWED_ORIGINS`. Desventajas: hay que cargarlo en cada salida, cada pantalla consulta a Jev por separado, y `/listen` necesita su propio parche.

---

## 8. Supuestos sin verificar y cómo verificarlos

| # | Supuesto | Cómo verificar | Si es falso |
| --- | --- | --- | --- |
| S1 | `answers.fix.choice` devuelve la **clave** de la opción (`w0`, `keep`). | Una llamada real con `fix` y revisar el JSON. | Ajustar `decide()`. Si devuelve el texto del criterio, mapear por texto. |
| S2 | `noul` es una probabilidad 0–1 de «true». | Igual que S1 (en `boca-limpia` se usaba así). | Ajustar umbrales. |
| S3 | `/listen` lee del mismo flujo `/display`. | Revisar el servidor. | Pasar ese flujo por el guard también. |
| S4 | `committed` solo crece (prefijo estable). | Logs de revisiones reales. | Nada se rompe: la clave cambia y se vuelve a consultar. Solo aumenta el costo. |
| S5 | Latencia de Jev < 900 ms en la red del evento. | `npm run simulate` con key real desde el sitio. | Subir `holdSealMs` o aceptar más sellos forzados (que siguen siendo seguros). |
| S6 | El texto del caption es español (traducción). | `state.target`. | El léxico ya cubre EN y ES. Solo cambian los `alts` útiles. |

---

## 9. Ensayo antes del evento

1. `npm test`: 24/24.
2. `COMMAND_CODE_API_KEY=… npm run simulate` desde la misma red o región que el motor. Anotar las latencias de `jev_result`.
3. Con el motor real: leer en voz alta un guion con trampas fonéticas («spreadsheet», «fork», «beach», «focus», «shift», «count») y con alguna grosería real. Verificar en el LED y en `/listen`:
   - Nunca aparece la grosería ni se lee en voz alta.
   - Las trampas se ven bien o, a lo sumo, un «…» breve.
4. Desconectar la red de Jev (o usar una key inválida) a mitad del ensayo. Los subtítulos tienen que seguir fluyendo, con groserías tapadas y `breaker_open` en logs.
5. Revisar `guard.stats()`: `sealForced` alto indica que Jev llega tarde; `jevErrors` debería ser 0.

---

## 10. Configuración completa

| Opción | Tipo | Defecto | Descripción |
| --- | --- | --- | --- |
| `emit` | `(msg)=>void` | **requerido** | Salida. |
| `jev` | cliente | — | `createJevClient(...)`. Sin él, modo solo-léxico. |
| `mask` | `string \| (hit)=>string` | `'…'` | Reemplazo visible. |
| `holdSealMs` | ms | 900 | Retención máxima del sello. |
| `maxConcurrent` | n | 4 | Consultas simultáneas a Jev. |
| `prefetchMutable` | bool | true | Consultar hits de la cola mutable si hay hueco. |
| `contextChars` | n | 60 | Contexto izquierdo en la clave de caché. |
| `cacheSize` | n | 500 | Veredictos recordados. |
| `doneMax` | n | 256 | Captions sellados recordados (repetidos se ignoran). |
| `failureTtlMs` | ms | 10000 | Vida de un veredicto «tapar por error». |
| `breakerFailures` / `breakerCooldownMs` | n / ms | 3 / 30000 | Circuit breaker. |
| `minSeverity` | 1–4 | 2 | Severidad mínima del léxico. |
| `thresholds.allowBelow` | 0–1 | 0.35 | Ver §6.2. |
| `thresholds.choiceMin` | 0–1 | 0.5 | Confianza mínima en la corrección, si Jev da distribución. |
| `getSource` | `(msg)=>string` | `msg.source` | Texto original en inglés. |
| `onEvent` | `(e)=>void` | — | Telemetría. |
| `now`, `setTimeout`, `clearTimeout` | — | globales | Inyectables para pruebas. |

`createJevClient({ apiKey | proxyUrl, endpoint?, model?, timeoutMs? = 1500, fetch? })`

---

## 11. Telemetría

`onEvent(e)`, con `e.type` igual a: `jev_request`, `jev_result` (`latency`, `decision`), `jev_error`, `breaker_open`, `seal_hold`, `seal_forced`, `emit_error`, `guard_error`, `dropped_no_id`.

`guard.stats()` devuelve `{ in, out, hits, jevCalls, jevErrors, replaced, shown, masked, sealHolds, sealForced, superseded, open, cache, inflight, queued, breakerOpen }`. `hits` cuenta detecciones por render (incluye repeticiones de la misma palabra en revisiones sucesivas).

---

## 12. Rendimiento y costo

- `detect()`: < 1 ms por subtítulo típico. Hay un test que lo verifica. Sin asignaciones grandes.
- Llamadas a Jev: **una por palabra marcada distinta en su contexto**, no por revisión. Una charla limpia hace 0 llamadas.
- Memoria acotada: caché LRU, anillo de sellados y captions que se liberan al sellar o al ser reemplazados.

---

## 13. Modos de falla

| Falla | Comportamiento |
| --- | --- |
| Jev lento | «…» visible más tiempo. Sello forzado tapado a los 900 ms. |
| Jev caído / 401 / 429 | Tapado. Breaker tras 3 fallos, reintento tras 30 s. |
| Respuesta rara de Jev | `decide()` → tapar. |
| Excepción interna del guard | El mensaje no sale. El feed sella la línea a los 12 s. Se registra `guard_error`. |
| Mensaje sin `captionId` | Se descarta (el feed también lo ignoraría). |
| Revisión vieja o repetida | Se ignora, igual que el feed. |

---

## 14. Limitaciones y trabajo futuro

1. **Groserías fuera del léxico.** El guard solo consulta a Jev por palabras que el léxico marca. Una grosería nueva o una variante regional no listada pasa. Hay dos mitigaciones posibles: ampliar el léxico con lo que salga en los ensayos, o una auditoría de oración completa con Jev al sellar. La segunda no se implementó porque Jev clasifica pero no localiza la palabra, y tapar la oración entera es peor que el problema.
2. **Correcciones limitadas a `alts`.** Jev elige entre candidatos; no genera palabras. Si la palabra real no está en `alts`, queda tapada (es seguro). Un modelo generativo podría proponer la corrección, pero agrega latencia y un riesgo nuevo: que invente texto.
3. **Contexto en inglés.** Sin `getSource`, Jev decide solo con el español traducido. Funciona, pero peor.
4. **Retención del sello acotada por la siguiente frase** (§4.4).

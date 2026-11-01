# jev-guard

Capa anti-groserías para los subtítulos en vivo de C2 Live. Se coloca **entre el motor (voz → texto → traducción) y las pantallas públicas**, y evita que una palabra soez aparezca en el LED, en vMix o en los teléfonos, incluso cuando la grosería es un error del reconocedor (por ejemplo, «sheet» transcrito como «shit»).

## Cómo funciona, en una imagen

```
motor STT + traducción ──► guard.push(caption) ──► /display (LED, vMix, /listen)
                                │
                                ├─ 1. Léxico local (EN + ES, < 1 ms): tapa al instante con «…»
                                └─ 2. Jev revisa la palabra tapada en contexto (medido: p50 132 ms, p90 172 ms):
                                        · era un error  → se repinta con la palabra correcta
                                        · era inocente  → se muestra la original (solo palabras ambiguas)
                                        · era real / no responde → se queda tapada
```

Tres reglas que no se negocian:

1. **Nada marcado sale crudo.** El tapado ocurre en la misma llamada en la que entra el subtítulo; no espera a la red.
2. **Ante la duda, tapado.** Si Jev falla, tarda o duda, la palabra queda como «…».
3. **El sellado se retiene** hasta que Jev decide (máx. 900 ms; en la práctica ~150 ms), porque lo sellado se lee en voz alta en `/listen`.

## Integración (5 líneas)

En el servidor del motor, donde hoy se difunde cada mensaje a los clientes de `/display`:

```js
import { createCaptionGuard, createJevClient } from 'jev-guard';

const guard = createCaptionGuard({
  jev: createJevClient({ apiKey: process.env.COMMAND_CODE_API_KEY }),
  // o TypeSafe directo: createJevClient({ apiKey: process.env.TYPESAFE_JEV_API_KEY,
  //   endpoint: TYPESAFE_ENDPOINT, model: TYPESAFE_MODEL })
  emit: (msg) => broadcastToDisplays(msg)   // la función que ya existe
});

// antes: broadcastToDisplays(msg)
guard.push(msg);
```

Habla el mismo contrato que `caption-feed.js` (`captionId`, `revision`, `committed`, `mutable`, `sealed`, `channel`). Los mensajes que no son `caption` pasan intactos. No hay que tocar el overlay.

Si no se puede tocar el servidor, hay una alternativa en el navegador: `examples/browser-shim.html` + `server/jev-proxy.mjs`.

## Probarlo

```bash
npm test            # 26 pruebas, sin red
npm run simulate    # simulación en consola de un ponente hablando (Jev simulado)

# Con Jev real (TYPESAFE_JEV_API_KEY o COMMAND_CODE_API_KEY en el entorno):
npm run simulate              # la misma simulación
node examples/probe-jev.mjs   # 15 frases de calibración: errores, groserías reales, ambiguas
```

Requisitos: Node 20 o superior. Sin dependencias.

## Archivos

| Archivo | Qué es |
| --- | --- |
| `src/caption-guard.js` | El guard: recibe captions, tapa, consulta a Jev, repinta, retiene el sello. |
| `src/detector.js` | Detector léxico local. |
| `src/lexicon.js` | Lista EN + ES de groserías y de posibles palabras correctas («alts»). **Aquí se agregan términos.** |
| `src/jev-client.js` | Llamada a Jev y regla de decisión. |
| `server/jev-proxy.mjs` | Proxy opcional para la variante de navegador. |
| `examples/` | Integración en servidor, integración en navegador y simulación. |
| `docs/INTEGRACION.md` | Documento técnico completo (pensado también para un agente de código). |
| `docs/DECISIONES.md` | Decisiones de diseño numeradas. |
| `docs/CALIBRACION.md` | Resultados con Jev real y por qué los umbrales tienen esos valores. |

## Ajustes principales

| Opción | Por defecto | Para qué |
| --- | --- | --- |
| `mask` | `'…'` | Lo que se ve en lugar de la palabra. Puede ser una función. |
| `holdSealMs` | `900` | Cuánto se retiene el sello esperando a Jev. |
| `thresholds.allowBelow` | `0.2` | Probabilidad máxima de «grosería real» para destapar o corregir. |
| `thresholds.choiceMin` / `keepMax` | `0.8` / `0.15` | Confianza mínima en la corrección y máxima en «era la palabra original». **Es el filtro que más protege** (ver `docs/CALIBRACION.md`). |
| `minRightWords` | `3` | Palabras a la derecha que se esperan antes de consultar a Jev (o el sello). |
| `minSeverity` | `2` | Severidad mínima del léxico (1 leve … 4 grave). |
| `getSource` | — | Devuelve el texto original en inglés del segmento; mejora mucho las correcciones. |

## Pendiente de confirmar con el motor

- Si el motor tiene el texto **en inglés** de cada segmento (para `getSource`).
- Si `/listen` recibe el mismo flujo de `/display` (si no, hay que pasar el otro flujo por el guard también).

Ya verificado con Jev real: formato de respuesta, latencia y umbrales (`docs/CALIBRACION.md`).

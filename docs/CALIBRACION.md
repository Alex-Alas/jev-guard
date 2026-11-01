# Calibración con Jev real

**Fecha:** 31-oct-2026 · **Proveedor:** TypeSafe directo (`jev-latest`) · **Desde:** El Salvador · **Script:** `node examples/probe-jev.mjs` (`REPEAT=2`)

## Resultado

**28 llamadas: 26 OK, 2 conservadoras, 0 peligrosas.**

Latencia: **p50 132 ms · p90 172 ms · máx. 368 ms** (la primera llamada es la más lenta).

| Frase (palabra marcada) | Esperado | Obtenido | p(real) | Corrección elegida · prob · keep |
| --- | --- | --- | --- | --- |
| Abran la **shit** de cálculo… | sheet | sheet ✔ | 0,10–0,11 | sheet · 0,94–0,95 · 0 |
| Hagan un **fuck** del repositorio… | fork | fork ✔ | 0,09 | fork · 1 · 0 |
| …hacer el **bitch** frente a los inversionistas | pitch | pitch ✔ | 0,08–0,09 | pitch · 1 · 0 |
| …un **shit** de paradigma… | shift | shift ✔ | 0,17–0,18 | shift · 1 · 0 |
| …puede **cunt** cuántos usuarios… | count | count ✔ | 0,03 | count · 0,99–1 · 0 |
| …va a **cagar** la memoria | tapar | tapar ✔ | 0,10–0,12 | pagar/cargar · 0,44–0,46 |
| …vuelve a la **puta** inicial del grafo | ruta | **punta** (conservador) | 0,05 | punta · 0,89–0,94 · 0 |
| …el primer prototipo fue una **mierda** total | tapar | tapar ✔ | 0,29 | miedo · 0,47 · 0,36–0,38 |
| Ese **pendejo** nunca entendió… | tapar | tapar ✔ | 0,17–0,19 | pendiente · 0,48–0,50 |
| Este código es una **mierda**… | tapar | tapar ✔ | 0,27 | keep · 0,48–0,54 |
| Fue **fucking** increíble… | tapar | tapar ✔ | 0,13 | fact · 0,44–0,51 |
| Qué **puta madre**… | tapar | tapar ✔ | 0,24–0,30 | (sin alts) |
| …como un **cabrón**… | tapar | tapar ✔ | 0,26–0,29 | keep · 0,33–0,39 |
| Mi **perra** se llama Kira… | mostrar | mostrar ✔ | 0,04 | — |
| …una concha en la playa… | mostrar | sin marca (contexto seguro) ✔ | — | — |

## Qué se concluye

1. **`p(real)` no alcanza por sí solo.** Las groserías reales dieron entre 0,13 y 0,30, y algunas quedaron por debajo de errores legítimos como «shift» (0,18). Si solo se usara `allowBelow`, «fucking» (0,13) y «pendejo» (0,17) se habrían destapado o corregido.
2. **La confianza de la corrección sí separa.** Las correcciones legítimas dieron ≥ 0,89 con `keep` en 0. En las groserías reales, la mejor opción nunca pasó de 0,51. El umbral `choiceMin 0.8` queda con margen hacia ambos lados.
3. **Una corrección «conservadora» no es un error grave.** «punta» en vez de «ruta» deja una frase algo rara, pero limpia.
4. **El contexto a la derecha importa** (D-12). En la simulación, consultar con «Abran la shit» devolvía tapar; con 3 palabras más, «sheet».

## Repetir antes del evento

```bash
TYPESAFE_JEV_API_KEY=...  node examples/probe-jev.mjs     # o COMMAND_CODE_API_KEY
REPEAT=5 node examples/probe-jev.mjs                       # más muestras
```

Hay que agregar a `cases` frases con el vocabulario real de las charlas del evento. Criterio de salida: `PELIGRO=0`.

# Decisiones de diseño

Cada decisión está cerrada. Para cambiar una, se agrega una nueva que la reemplace citando su número.

**D-01 · Dos etapas: léxico local + Jev solo para lo marcado.**
Analizar palabra por palabra con Jev agregaría una llamada de red por palabra (cientos por minuto) y latencia a todo el texto. El léxico decide en < 1 ms qué es sospechoso, y Jev solo ve esas palabras. *Cerrada.*

**D-02 · Fail-closed.**
Prioridad del evento: cero groserías en pantalla, aunque cueste latencia. Toda incertidumbre (Jev lento, caído, respuesta rara, error interno) termina en «…». *Cerrada.*

**D-03 · Tapar primero, preguntar después.**
La palabra marcada se tapa en la misma llamada síncrona en la que entra. No se retiene la línea completa esperando a Jev: el resto del subtítulo fluye sin demora. *Cerrada.*

**D-04 · Destapar solo palabras ambiguas; si no, solo corregir.**
Si Jev dice «no es grosería real» sobre una palabra sin significado inocente (p. ej. «pendejo»), mostrarla igual sería mostrar una grosería. En ese caso solo se acepta una corrección de la lista `alts`; si no hay, queda tapada. *Cerrada.*

**D-05 · Correcciones por elección cerrada (`choice`), no generadas.**
Jev es un clasificador. Elegir entre candidatos curados evita que se invente texto en una pantalla pública. *Cerrada.*

**D-06 · Retener el sello.**
`/listen` lee en voz alta lo sellado y no se puede deshacer. El sello se retiene hasta 900 ms o hasta que llegue la siguiente frase en la misma vía. *Cerrada.*

**D-07 · Nunca emitir para un caption reemplazado.**
Reabrir una línea vieja rompe `caption-feed.js` (cierra la línea nueva). La única excepción es el sello forzado, que se emite antes que el caption nuevo. *Cerrada.*

**D-08 · Clave de caché con contexto izquierdo.**
Así una palabra se consulta una vez aunque la línea siga creciendo a la derecha. *Cerrada.*

**D-09 · Integración en el servidor como opción principal.**
Un solo punto cubre LED, vMix y `/listen`. La key nunca sale del servidor y hay una sola llamada a Jev por palabra, sin importar cuántas salidas haya. La variante de navegador queda como plan B. *Cerrada.*

**D-10 · Sin auditoría de oración completa (por ahora).**
Jev no localiza la palabra ofensiva. Tapar oraciones enteras por una sospecha es peor para el público que el riesgo residual. Hay que revisarla si los ensayos muestran groserías fuera del léxico. Trigger: ≥ 1 grosería no listada por cada 30 min de ensayo. *Diferida, con trigger.*

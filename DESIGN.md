# Notch — derivacion del diseno

## Origen

`reference-notch.png` (233x296, copiada del portapapeles el 2026-08-31). Es un
mockup de presentacion con dos paneles del mismo widget, rotados 15 grados.

## Metodo

No se midio a ojo. El procedimiento fue:

1. PCA sobre los pixeles oscuros de cada panel → inclinacion **-15.00 grados**
   exactos en ambos.
2. Reescalado x6 con Lanczos y rotacion inversa.
3. Segmentacion por componentes conexas para aislar silueta, interiores de
   anillo y disco del engranaje.
4. Ajuste de circunferencias por minimos cuadrados a los arcos de color, y
   perfil de luminancia radial para grosor de trazo y color del track.
5. Ajuste de arcos al borde izquierdo de la silueta (rms < 0.6 px sobre la
   imagen x6).

Factor de escala aplicado: **60 / 39.67 = 1.5125** (se llevo el ancho de barra a
60 px logicos, que caben en la mascara de input de 80 px que expone el backend).

## Silueta

El hallazgo principal: la barra **no es un rectangulo redondeado flotante**. Se
ancla al borde derecho de la pantalla y entra en el cuerpo por un filete en S
formado por dos arcos de circunferencia tangentes — uno concavo contra el borde
y otro convexo hacia el cuerpo — arriba y abajo, simetricos.

Con radio `R = 0.45 * ancho` el barrido de cada arco queda fijo en 96.38 grados
independientemente del ancho, asi que la silueta es autosemejante y se puede
morphear ancho y alto sin que las esquinas cambien de caracter. Eso es lo que
hace `src/lib/notchGeometry.ts`, y por eso el fondo es un `<path>` que se
regenera cada frame desde el alto animado en vez de un escalado.

Verificacion contra la referencia: ancho maximo identico (60), perfil dentro de
1-2 px salvo en la inflexion casi vertical de la S, donde 1 px de desalineacion
vertical se traduce en decenas de px horizontales.

## Contraste medido vs. implementado

| magnitud | referencia (escala diseno) | implementado |
|---|---|---|
| ancho de barra | 39.67 x 1.5125 = 60.0 | 60 |
| tramo de la S | 53.7 | 53.67 |
| radio del arco | 26.9 | 27.0 |
| diametro exterior del anillo | 37.8 | 38 |
| grosor de trazo del anillo | 4.2 - 4.8 | 4.5 |
| paso entre anillos | 88.9 | 89 |
| anillo a etiqueta (centro a centro) | 34.6 | 35 |
| caja de "73%" | 25.0 x 11.0 | 26 x 11 |
| diametro del engranaje | 42.0 | 42 |

Colores tomados del pixel de mayor croma de cada arco: `#FF4A14` (73%),
`#F5FF2E` (52%), `#1DFC9C` (21%). El color codifica el porcentaje, no el
agente. Track `#323232` (meseta de luminancia 50). Fondo negro puro.

## Estado recogido

El notch arranca **recogido** y se despliega al pasar el raton. No es una forma
nueva: como la silueta es autosemejante (mismo barrido de arco a cualquier
ancho), recoger es animar `depth` de 60 a 26 y `height` de ~345 a 68. Esas dos
medidas salen de la mascara `peek` que ya expone el backend, 40 x 72 px logicos
pegados a la esquina superior derecha; el render mide 26 x 64, asi que cabe.

Recogido se pintan un punto por agente activo, con el color de severidad de su
anillo. Es lo unico que hace falta para saber, de un vistazo y sin desplegar,
cuantos agentes hay y como van de cuota.

El modo de la mascara de input sigue al estado: `peek` recogido, `bar`
desplegado, `expanded` con cualquier panel abierto.

Al desplegar aparecia el mismo defecto que tenia el panel de detalle - los
anillos estan maquetados en su sitio final desde el primer frame, asi que se
veian fuera de la carta mientras la silueta crecia por detras. Se arregla igual:
`NotchSurface` recorta a sus hijos con `clip-path` generado del mismo path que
pinta el fondo.

### Auto-ocultado

`src/lib/prefs.ts`, con el mismo patron de store que `i18n.ts`
(localStorage + `useSyncExternalStore`). Presets de 2s / 5s / 10s mas **Fijo**,
que desactiva el recogido; por defecto 5s. Cualquier actividad - raton sobre la
silueta, panel de detalle o de ajustes abierto - cuenta como ocupado y reinicia
la cuenta.

## Boton de ajustes

Segunda referencia (zoom del pie del panel izquierdo): en reposo **no se ve el
disco, solo un arco fino sobre su borde**. Esa "linea" y el disco del panel
derecho son el mismo circulo en dos momentos, no dos elementos.

Medido con ajuste de circunferencia sobre el trazo y con la caja del pintado
(que no tiene el sesgo del ajuste sobre un arco corto y grueso):

| | referencia | implementado |
|---|---|---|
| caja en x (izq. del borde) | 9.3 a 37.6 | 9.0 a 36.0 |
| caja en y (desde la punta) | -23.9 a +1.8 | -21.3 a +2.7 |
| radio de linea de centro | 19.7 | 18.75 = 21 - trazo/2 |
| grosor | ~4.5 | 4.5 |
| barrido | -14 a +93 grados horarios desde las 12 | igual |

La referencia trae ~1 px de desenfoque de mas por lado, asi que la diferencia
real es de ~1.5 px.

El morph (`SettingsMorph`) anima **un solo escalar**; de el salen radio, grosor
y guion de un unico `<circle>`:

- reposo: r = 20.75 - 2.25, grosor 4.5, guion 107/360 del perimetro.
- abierto: r = 10.5, grosor 21. El borde interior llega a cero y el exterior
  queda en 21, o sea el aro se cierra sobre si mismo y **se vuelve** el disco.

El disparador es la linea, no la barra: en la referencia el arco esta siempre
visible y pasar el raton por la barra no abre nada. El area de agarre es un
circulo transparente del tamano del disco, porque 4.5 px de trazo no se pueden
apuntar.

## Panel de detalle

Tercera referencia: al pasar por un anillo sale un panel a su izquierda con una
cola que apunta al anillo. Mismo tratamiento que el resto - se des-roto (-15
grados otra vez) y se midio. La escala de ESE mockup se fijo con dos anclas
independientes del propio notch, que ya conociamos: el paso entre anillos
(379.25 px(6x) = 89) y el radio de linea de centro del track (70.75 = 16.75).
Dan 0.2347 y 0.2367; se uso 0.2357.

El panel es el detalle de UN agente, no de varios: la barra naranja repite el
porcentaje del anillo (diario) y la verde es el semanal. Se comprobo que el
lavado de color de esa captura afecta por igual al anillo y a la barra, asi que
el relleno usa el mismo `accentFor` que los anillos.

| magnitud | referencia | base implementada |
|---|---|---|
| cuerpo | 899 x 535 px(6x) = 212 x 126.1 | 212 x 126.7 |
| radio de esquina | 77 px(6x) = 18.2 | 18 |
| cola: base / largo | 98 / 105 px(6x) = 23 / 24.7 | 23 / 25 |
| alto de barra | 21 px(6x) = 5.0 | 5 |
| paso entre secciones | 43.0 | 43 |
| fila -> barra -> pie | 12.9 y 12.9 | 13 y 13 |
| hueco cola-notch | 55 px(6x) = 13.0 | 13 |

### Dos desviaciones deliberadas

1. **Tamano.** A tamano real el panel se lee apretado, asi que sobre la base
   medida van `POPOVER_SCALE = 1.25` y, solo en el ritmo vertical,
   `POPOVER_AIR = 1.15`. Poniendo los dos a 1 vuelve el panel exacto de la
   referencia.
2. **Ancho de ventana.** El techo del tamano lo pone la ventana: hueco + cola +
   panel tienen que caber en `STAGE.width - NOTCH.depth`. Con los 340 px
   originales el maximo era 1.13, que no se notaba, asi que la ventana paso a
   **420**. Es una constante unica, `WINDOW_WIDTH` en `src-tauri/src/lib.rs`,
   que alimenta la geometria y la mascara de input; hay que mantenerla igual a
   `STAGE.width` y a `app.windows[0].width` de tauri.conf.json. La ventana sigue
   anclada a la derecha, asi que los 80 px extra son area transparente a la
   izquierda del notch.

### Morph y recortes

Cuerpo y cola son un solo path que se regenera desde el progreso animado, igual
que la silueta del notch: a progreso 0 **todo** vale cero y no se pinta nada. La
primera version dejaba la cola a tamano fijo y al cerrarse se quedaba una flecha
negra flotando sobre el escritorio.

El contenido va maquetado en su posicion final desde el primer frame, asi que
crecer solo la concha dejaba ver textos y barras **fuera de la carta** mientras
esta venia llegando por detras. Se arregla recortando el contenido con el mismo
path (`clip-path: path(...)`, WebKitGTK lo soporta desde 2.28 y aqui hay 2.52):
un solo string alimenta el `d` del SVG y el recorte del HTML. Por eso el
desplazamiento se calcula dentro de `popoverPath` (`ox`/`oy`) en lugar de en un
`<g transform>`: `clip-path` no admite transformadas.

La punta se queda quieta en su ancla y el resto crece hacia la izquierda. Si el
panel no cabe en la ventana se pega al borde y entonces es la cola la que se
desplaza dentro del cuerpo para seguir apuntando al anillo (el anillo 1 esta a
71.7 px del techo y el panel mide 181, asi que sin esto se saldria 19 px).

El panel de ajustes reusa la misma concha (`Popover`), apuntando al boton de
ajustes en vez de a un anillo.

## Logos

`public/Icons/` trae las marcas reales. Los paths de Claude y OpenAI se
extrajeron literalmente del SVG; OpenCode venia en 240x300 con mask + clip y se
reexpreso como marco con `fill-rule=evenodd` mas el bloque interior al 30 % de
opacidad (sobre negro eso da justo el #4B4646 del original); Antigravity solo
existe como PNG blanco y se incrusta como `<image>`, agrandado segun la
fraccion del lienzo que ocupa de verdad (404 de 540, medido sobre el alfa).

Todas se pintan en blanco: en la referencia el color lo lleva el anillo. Cambiar
a las marcas de color es pasar otro `color` a `AgentIcon`.

`aider` y `copilot` no tienen asset y llevan marcas propias. El enum del backend
no tiene un tipo para OpenAI, asi que `OpenAIMark` queda exportado sin uso.

## Pendiente

- **Tipografia.** La caja de "73%" tiene aspecto 2.27, o sea una grotesca
  comprimida. Ninguna familia instalada llega: Noto Sans necesitaria -0.21 em
  de tracking. Se usa Fira Sans Compressed 600 a 16.2 px (24.9 x 11.0, tracking
  cero), que si esta instalada. Empaquetar Inter Tight o SF Compact seria lo
  correcto para que no dependa de la maquina.
- **Iconos de agente.** A 19 px el mockup no resuelve detalle. Claude y el nudo
  se reprodujeron a ojo; el resto son marcas propias en el mismo lenguaje.
- El engranaje aparece al pasar el puntero. En la referencia los dos paneles son
  justamente ese par de estados.

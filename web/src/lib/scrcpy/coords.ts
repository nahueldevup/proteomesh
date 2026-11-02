/**
 * Conversión de coordenadas de puntero (viewport CSS) a coordenadas del video
 * negociado por scrcpy-server, teniendo en cuenta el recorte que puede producir
 * `object-fit: cover` cuando el canvas y el video tienen distinta relación de
 * aspecto.
 */

export interface ClientToVideoResult {
  /** Coordenada X en píxeles del video (0 .. width-1). */
  x: number;
  /** Coordenada Y en píxeles del video (0 .. height-1). */
  y: number;
  /** El puntero cae dentro de la caja de contenido del elemento. */
  inside: boolean;
  /** El puntero cae dentro del área realmente visible del video tras `cover`. */
  insideVideo: boolean;
}

/**
 * Proyecta un punto del viewport sobre el video renderizado dentro de un
 * elemento con `object-fit: cover`.
 *
 * - Usa `clientLeft/Top` y `clientWidth/Height` para medir la caja de contenido,
 *   excluyendo los bordes del elemento.
 * - Calcula el rectángulo de video realmente visible considerando la relación de
 *   aspecto del contenido y la del video.
 * - Limita las coordenadas a `width - 1` / `height - 1` para evitar enviar
 *   `x === width` o `y === height`.
 */
export function clientToVideo(
  element: HTMLElement,
  clientX: number,
  clientY: number,
  videoWidth: number,
  videoHeight: number
): ClientToVideoResult {
  const rect = element.getBoundingClientRect();
  const contentLeft = rect.left + element.clientLeft;
  const contentTop = rect.top + element.clientTop;
  const contentWidth = element.clientWidth;
  const contentHeight = element.clientHeight;

  const localX = clientX - contentLeft;
  const localY = clientY - contentTop;

  const inside =
    localX >= 0 && localX <= contentWidth && localY >= 0 && localY <= contentHeight;

  if (
    !inside ||
    videoWidth <= 0 ||
    videoHeight <= 0 ||
    contentWidth <= 0 ||
    contentHeight <= 0
  ) {
    return { x: 0, y: 0, inside: false, insideVideo: false };
  }

  const contentAspect = contentWidth / contentHeight;
  const videoAspect = videoWidth / videoHeight;

  let scale: number;
  let offsetX = 0;
  let offsetY = 0;

  if (contentAspect > videoAspect) {
    // El contenedor es más ancho: el video llena toda la altura y se recorta
    // por los costados.
    scale = contentHeight / videoHeight;
    offsetX = (contentWidth - videoWidth * scale) / 2;
  } else {
    // El contenedor es más alto: el video llena todo el ancho y se recorta
    // arriba/abajo.
    scale = contentWidth / videoWidth;
    offsetY = (contentHeight - videoHeight * scale) / 2;
  }

  const videoX = (localX - offsetX) / scale;
  const videoY = (localY - offsetY) / scale;

  const insideVideo =
    videoX >= 0 && videoX <= videoWidth && videoY >= 0 && videoY <= videoHeight;

  return {
    x: Math.max(0, Math.min(videoWidth - 1, Math.round(videoX))),
    y: Math.max(0, Math.min(videoHeight - 1, Math.round(videoY))),
    inside,
    insideVideo,
  };
}

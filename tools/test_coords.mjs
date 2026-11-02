import assert from 'node:assert';

function clientToVideo(element, clientX, clientY, videoWidth, videoHeight) {
  const contentLeft = element.left + element.clientLeft;
  const contentTop = element.top + element.clientTop;
  const contentWidth = element.clientWidth;
  const contentHeight = element.clientHeight;

  const localX = clientX - contentLeft;
  const localY = clientY - contentTop;

  const inside =
    localX >= 0 && localX <= contentWidth && localY >= 0 && localY <= contentHeight;

  if (!inside || videoWidth <= 0 || videoHeight <= 0 || contentWidth <= 0 || contentHeight <= 0) {
    return { x: 0, y: 0, inside: false, insideVideo: false };
  }

  const contentAspect = contentWidth / contentHeight;
  const videoAspect = videoWidth / videoHeight;

  let scale;
  let offsetX = 0;
  let offsetY = 0;

  if (contentAspect > videoAspect) {
    scale = contentHeight / videoHeight;
    offsetX = (contentWidth - videoWidth * scale) / 2;
  } else {
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

function box(cssWidth, cssHeight, border = 1) {
  return {
    left: 0,
    top: 0,
    clientLeft: border,
    clientTop: border,
    clientWidth: cssWidth - border * 2,
    clientHeight: cssHeight - border * 2,
  };
}

// Usamos dimensiones exactamente proporcionales para evitar falsos negativos
// por redondeo de píxeles en los tests.

// --- Caso 1: relación idéntica ------------------------------------------------
{
  const video = { w: 400, h: 800 };
  const el = box(202, 402); // contenido 200x400, misma relación 1:2
  const tl = clientToVideo(el, el.clientLeft, el.clientTop, video.w, video.h);
  assert.strictEqual(tl.x, 0, 'esquina superior izquierda x=0');
  assert.strictEqual(tl.y, 0, 'esquina superior izquierda y=0');
  assert.strictEqual(tl.insideVideo, true);

  const br = clientToVideo(
    el,
    el.clientLeft + el.clientWidth,
    el.clientTop + el.clientHeight,
    video.w,
    video.h
  );
  assert.strictEqual(br.x, video.w - 1, 'esquina inferior derecha x=width-1');
  assert.strictEqual(br.y, video.h - 1, 'esquina inferior derecha y=height-1');
  assert.strictEqual(br.insideVideo, true);

  const c = clientToVideo(
    el,
    el.clientLeft + el.clientWidth / 2,
    el.clientTop + el.clientHeight / 2,
    video.w,
    video.h
  );
  assert.strictEqual(c.x, video.w / 2, 'centro x');
  assert.strictEqual(c.y, video.h / 2, 'centro y');
}

// --- Caso 2: escalado a monitor más pequeño, misma relación ------------------
{
  const video = { w: 400, h: 800 };
  const el = box(102, 202); // contenido 100x200
  const r = clientToVideo(el, el.clientLeft, el.clientTop, video.w, video.h);
  assert.strictEqual(r.x, 0);
  assert.strictEqual(r.y, 0);

  const br = clientToVideo(
    el,
    el.clientLeft + el.clientWidth,
    el.clientTop + el.clientHeight,
    video.w,
    video.h
  );
  assert.strictEqual(br.x, video.w - 1);
  assert.strictEqual(br.y, video.h - 1);
}

// --- Caso 3: rotación (video landscape 800x400 dentro de chasis portrait) -----
{
  const video = { w: 800, h: 400 };
  const el = box(202, 402); // contenido 200x400
  const tl = clientToVideo(el, el.clientLeft, el.clientTop, video.w, video.h);
  // En cover, el video landscape llena el ancho y sobra altura recortada.
  assert.strictEqual(tl.x, 0);
  assert.strictEqual(tl.y, 0);

  const center = clientToVideo(
    el,
    el.clientLeft + el.clientWidth / 2,
    el.clientTop + el.clientHeight / 2,
    video.w,
    video.h
  );
  assert.ok(center.insideVideo, 'el centro del chasis debe caer en video visible');
  assert.ok(center.x > 0 && center.x < video.w - 1, 'centro x dentro del video rotado');
  assert.ok(center.y > 0 && center.y < video.h - 1, 'centro y dentro del video rotado');

  // Punto en la zona recortada superior debe quedar fuera del video visible.
  const topCropped = clientToVideo(
    el,
    el.clientLeft + el.clientWidth / 2,
    el.clientTop + 2,
    video.w,
    video.h
  );
  assert.strictEqual(
    topCropped.insideVideo,
    false,
    'zona recortada superior fuera del video'
  );
}

// --- Caso 4: clic fuera del chasis ------------------------------------------
{
  const video = { w: 400, h: 800 };
  const el = box(202, 402);
  const out = clientToVideo(el, -10, -10, video.w, video.h);
  assert.strictEqual(out.inside, false);
  assert.strictEqual(out.insideVideo, false);
}

// --- Caso 5: relación distinta, cover recorta costados ----------------------
{
  const video = { w: 400, h: 900 }; // más "portrait" que 1:2
  const el = box(202, 402); // contenido 200x400
  // El video llena la altura, recorta costados. El centro sigue mapeando.
  const center = clientToVideo(
    el,
    el.clientLeft + el.clientWidth / 2,
    el.clientTop + el.clientHeight / 2,
    video.w,
    video.h
  );
  assert.ok(center.insideVideo);
  assert.ok(center.x > 0 && center.x < video.w - 1);
  assert.ok(center.y > 0 && center.y < video.h - 1);

  // Punto en la zona recortada izquierda.
  const leftCropped = clientToVideo(
    el,
    el.clientLeft + 2,
    el.clientTop + el.clientHeight / 2,
    video.w,
    video.h
  );
  assert.strictEqual(
    leftCropped.insideVideo,
    false,
    'zona recortada izquierda fuera del video'
  );
}

console.log('✅ test_coords.mjs: todas las aserciones pasaron');

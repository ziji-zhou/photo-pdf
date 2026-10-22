/**
 * 页面切分的纯几何计算，与浏览器无关，方便在 Node 里单独测试。
 * 坐标都相对于“旋转之后”的图片，左上角为原点。
 */

/** 把旋转角度规整到 0 / 90 / 180 / 270。 */
export function normalizeRotation(rotation) {
  return ((rotation % 360) + 360) % 360;
}

/** 旋转之后图片的宽高；转 90°/270° 时宽高互换。 */
export function rotatedSize(width, height, rotation) {
  const angle = normalizeRotation(rotation);
  return angle % 180 === 0
    ? { width, height }
    : { width: height, height: width };
}

/**
 * 计算一页要裁哪几块。
 * 不拆分时整张一块；拆分时沿“较长的一边”对半切，
 * 这样横拍的双页书（左右两页）会被切成左右两页，
 * 竖拍的双页书则被切成上下两页。
 */
export function computeCrops(width, height, rotation, split) {
  const { width: rw, height: rh } = rotatedSize(width, height, rotation);

  if (!split) {
    return [{ x: 0, y: 0, width: rw, height: rh }];
  }

  if (rw >= rh) {
    const half = Math.floor(rw / 2);
    return [
      { x: 0, y: 0, width: half, height: rh },
      { x: half, y: 0, width: rw - half, height: rh },
    ];
  }

  const half = Math.floor(rh / 2);
  return [
    { x: 0, y: 0, width: rw, height: half },
    { x: 0, y: half, width: rw, height: rh - half },
  ];
}

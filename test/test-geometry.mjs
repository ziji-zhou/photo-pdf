/**
 * 页面切分的几何测试：node test/test-geometry.mjs
 */
import assert from "node:assert/strict";
import { computeCrops, rotatedSize, normalizeRotation } from "../js/geometry.js";

// 角度规整
assert.equal(normalizeRotation(0), 0);
assert.equal(normalizeRotation(90), 90);
assert.equal(normalizeRotation(360), 0);
assert.equal(normalizeRotation(-90), 270);

// 旋转后的尺寸
assert.deepEqual(rotatedSize(4000, 3000, 0), { width: 4000, height: 3000 });
assert.deepEqual(rotatedSize(4000, 3000, 90), { width: 3000, height: 4000 });
assert.deepEqual(rotatedSize(4000, 3000, 180), { width: 4000, height: 3000 });

// 不拆分：一整张
assert.deepEqual(computeCrops(4000, 3000, 0, false), [
  { x: 0, y: 0, width: 4000, height: 3000 },
]);

// 横图拆分：左右两半，且面积不丢
{
  const [left, right] = computeCrops(4000, 3000, 0, true);
  assert.deepEqual(left, { x: 0, y: 0, width: 2000, height: 3000 });
  assert.deepEqual(right, { x: 2000, y: 0, width: 2000, height: 3000 });
}

// 奇数宽度：右半块多拿 1 像素，不能丢
{
  const [left, right] = computeCrops(4001, 3000, 0, true);
  assert.equal(left.width + right.width, 4001);
  assert.equal(right.x, left.width);
}

// 竖图拆分：上下两半
{
  const [top, bottom] = computeCrops(3000, 4000, 0, true);
  assert.deepEqual(top, { x: 0, y: 0, width: 3000, height: 2000 });
  assert.deepEqual(bottom, { x: 0, y: 2000, width: 3000, height: 2000 });
}

// 旋转 90° 后变竖图：拆分应该改为上下切
{
  const crops = computeCrops(4000, 3000, 90, true);
  assert.equal(crops.length, 2);
  assert.deepEqual(crops[0], { x: 0, y: 0, width: 3000, height: 2000 });
}

console.log("geometry ok");

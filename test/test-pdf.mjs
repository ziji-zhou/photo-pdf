/**
 * Node 环境下校验 PDF 拼装器：
 *   node test/test-pdf.mjs 图片1.jpg 图片2.jpg
 * 生成的 /tmp/photo-pdf-test.pdf 应该能被系统正常打开。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPdf } from "../js/pdf.js";

const here = dirname(fileURLToPath(import.meta.url));

function jpegSize(buffer) {
  let i = 2;
  while (i < buffer.length - 9) {
    if (buffer[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = buffer[i + 1];
    if (
      [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(
        marker
      )
    ) {
      return { height: buffer.readUInt16BE(i + 5), width: buffer.readUInt16BE(i + 7) };
    }
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      i += 2;
      continue;
    }
    i += 2 + buffer.readUInt16BE(i + 2);
  }
  throw new Error("不是有效的 JPEG");
}

const files = process.argv.slice(2);
if (files.length === 0) {
  // 不带参数时使用仓库里的测试图片
  files.push(join(here, "fixtures/portrait.jpg"), join(here, "fixtures/landscape.jpg"));
}

const pages = files.map((file) => {
  const bytes = readFileSync(file);
  const { width, height } = jpegSize(bytes);
  return { bytes: new Uint8Array(bytes), width, height };
});

const blob = buildPdf(pages, {
  title: "测试 作业",
  autoOrientation: true,
  margin: 12,
});

const output = Buffer.from(await blob.arrayBuffer());
writeFileSync("/tmp/photo-pdf-test.pdf", output);

console.log(`已生成 /tmp/photo-pdf-test.pdf：${pages.length} 页，${(output.length / 1024).toFixed(0)} KB`);
console.log(pages.map((page, index) => `  第 ${index + 1} 页 ${page.width}×${page.height}`).join("\n"));

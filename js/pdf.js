/**
 * 极简 PDF 拼装器：每个输入是一张已经压好的 JPEG，输出一份 A4 PDF。
 * 不依赖任何库，浏览器和 Node 都能运行。
 */

const A4_PORTRAIT = [595.276, 841.89];
const A4_LANDSCAPE = [841.89, 595.276];

/**
 * @param {Array<{bytes: Uint8Array, width: number, height: number}>} pages
 * @param {{title?: string, autoOrientation?: boolean, margin?: number}} options
 * @returns {Blob}
 */
export function buildPdf(pages, options = {}) {
  const autoOrientation = options.autoOrientation !== false;
  const margin = options.margin ?? 12;

  const chunks = [];
  let length = 0;

  const encoder = new TextEncoder();
  const push = (data) => {
    const bytes = typeof data === "string" ? encoder.encode(data) : data;
    chunks.push(bytes);
    length += bytes.length;
  };

  const offsets = {};
  const startObject = (num) => {
    offsets[num] = length;
    push(`${num} 0 obj\n`);
  };
  const endObject = () => push("\nendobj\n");

  // 文件头。第二行是 PDF 规范建议的二进制标记，确保传输时按二进制处理。
  push("%PDF-1.4\n");
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

  const pageCount = pages.length;
  const firstPageObject = 3;
  const infoObject = firstPageObject + pageCount * 3;

  // 1: Catalog
  startObject(1);
  push("<< /Type /Catalog /Pages 2 0 R >>");
  endObject();

  // 2: Pages
  const kids = [];
  for (let i = 0; i < pageCount; i++) {
    kids.push(`${firstPageObject + i * 3} 0 R`);
  }
  startObject(2);
  push(`<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${pageCount} >>`);
  endObject();

  for (let i = 0; i < pageCount; i++) {
    const page = pages[i];
    const pageNo = firstPageObject + i * 3;
    const imageNo = pageNo + 1;
    const contentNo = pageNo + 2;

    const landscape = autoOrientation && page.width > page.height;
    const [pageW, pageH] = landscape ? A4_LANDSCAPE : A4_PORTRAIT;

    // 等比缩放后居中
    const scale = Math.min(
      (pageW - margin * 2) / page.width,
      (pageH - margin * 2) / page.height
    );
    const drawW = page.width * scale;
    const drawH = page.height * scale;
    const x = (pageW - drawW) / 2;
    const y = (pageH - drawH) / 2;

    const content =
      `q ${drawW.toFixed(3)} 0 0 ${drawH.toFixed(3)} ` +
      `${x.toFixed(3)} ${y.toFixed(3)} cm /Im0 Do Q`;

    // 页面对象
    startObject(pageNo);
    push(
      `<< /Type /Page /Parent 2 0 R ` +
        `/MediaBox [0 0 ${pageW} ${pageH}] ` +
        `/Resources << /XObject << /Im0 ${imageNo} 0 R >> >> ` +
        `/Contents ${contentNo} 0 R >>`
    );
    endObject();

    // 图片对象（JPEG 直接嵌入，不解码重编码）
    startObject(imageNo);
    push(
      `<< /Type /XObject /Subtype /Image /Width ${page.width} ` +
        `/Height ${page.height} /ColorSpace /DeviceRGB ` +
        `/BitsPerComponent 8 /Filter /DCTDecode ` +
        `/Length ${page.bytes.length} >>\nstream\n`
    );
    push(page.bytes);
    push("\nendstream");
    endObject();

    // 内容流
    startObject(contentNo);
    push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    endObject();
  }

  // 文档信息
  startObject(infoObject);
  const title = options.title ? toPdfUnicode(options.title) : "";
  push(
    `<< ${title ? `/Title ${title} ` : ""}/Producer (Photo to PDF) >>`
  );
  endObject();

  // 交叉引用表
  const xrefPos = length;
  const totalObjects = infoObject + 1;
  push(`xref\n0 ${totalObjects}\n`);
  push("0000000000 65535 f \n");
  for (let num = 1; num < totalObjects; num++) {
    push(`${String(offsets[num]).padStart(10, "0")} 00000 n \n`);
  }
  push(
    `trailer\n<< /Size ${totalObjects} /Root 1 0 R ` +
      `/Info ${infoObject} 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`
  );

  return new Blob(chunks, { type: "application/pdf" });
}

/** 把任意字符串编码成 PDF 的 UTF-16BE 十六进制字符串，支持中文。 */
function toPdfUnicode(text) {
  let hex = "FEFF"; // BOM，表示 UTF-16BE
  for (const char of text) {
    let code = char.codePointAt(0);
    if (code > 0xffff) {
      code -= 0x10000;
      const high = 0xd800 + (code >> 10);
      const low = 0xdc00 + (code & 0x3ff);
      hex += high.toString(16).padStart(4, "0").toUpperCase();
      hex += low.toString(16).padStart(4, "0").toUpperCase();
    } else {
      hex += code.toString(16).padStart(4, "0").toUpperCase();
    }
  }
  return `<${hex}>`;
}

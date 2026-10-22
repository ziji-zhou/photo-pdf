import { buildPdf } from "./pdf.js";
import { computeCrops, rotatedSize, normalizeRotation } from "./geometry.js";

const $ = (selector) => document.querySelector(selector);

const QUALITY_PRESETS = {
  compact: { maxDim: 1600, jpegQuality: 0.78 },
  standard: { maxDim: 2400, jpegQuality: 0.85 },
  high: { maxDim: 3200, jpegQuality: 0.92 },
};

const state = {
  items: [],
  lastPdf: null,
  resultUrl: null,
};

const els = {
  empty: $("#empty"),
  content: $("#content"),
  list: $("#list"),
  listTitle: $("#listTitle"),
  pageCount: $("#pageCount"),
  bottomBar: $("#bottomBar"),
  clearBtn: $("#clearBtn"),
  pickBtn: $("#pickBtn"),
  addBtn: $("#addBtn"),
  fileInput: $("#fileInput"),
  generateBtn: $("#generateBtn"),
  quality: $("#quality"),
  orientation: $("#orientation"),
  filename: $("#filename"),
  processing: $("#processing"),
  progressText: $("#progressText"),
  progressBar: $("#progressBar"),
  resultOverlay: $("#resultOverlay"),
  resultMeta: $("#resultMeta"),
  downloadBtn: $("#downloadBtn"),
  shareBtn: $("#shareBtn"),
  closeResultBtn: $("#closeResultBtn"),
  toast: $("#toast"),
  iosTip: $("#iosTip"),
  dismissTip: $("#dismissTip"),
  installBtn: $("#installBtn"),
};

const ICONS = {
  up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 15l-6-6-6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
  rotate:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>',
  trash:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>',
  image:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="M4 18l5-5 4 4 3-3 4 4"/></svg>',
  check:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>',
};

init();

function init() {
  bindEvents();
  restoreSettings();
  els.filename.value = defaultFilename();
  updateView();
  setupPwa();
  showEnvironmentTip();
}

function bindEvents() {
  els.pickBtn.addEventListener("click", () => els.fileInput.click());
  els.addBtn.addEventListener("click", () => els.fileInput.click());

  els.fileInput.addEventListener("change", async () => {
    const files = Array.from(els.fileInput.files || []);
    els.fileInput.value = "";
    await addFiles(files);
  });

  els.clearBtn.addEventListener("click", () => {
    if (!state.items.length) return;
    if (!confirm("清空全部照片？")) return;
    state.items = [];
    updateView();
  });

  els.generateBtn.addEventListener("click", generatePdf);
  els.closeResultBtn.addEventListener("click", closeResult);
  els.shareBtn.addEventListener("click", sharePdf);

  els.quality.addEventListener("change", saveSettings);
  els.orientation.addEventListener("change", saveSettings);

  els.list.addEventListener("click", onListClick);

  els.dismissTip.addEventListener("click", () => {
    localStorage.setItem("photoPdfTipDismissed", "1");
    els.iosTip.hidden = true;
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.installEvent = event;
    els.installBtn.hidden = false;
  });

  els.installBtn.addEventListener("click", async () => {
    if (!state.installEvent) return;
    state.installEvent.prompt();
    await state.installEvent.userChoice;
    state.installEvent = null;
    els.installBtn.hidden = true;
  });
}

/* ---------------- 选择与列表 ---------------- */

async function addFiles(files) {
  if (!files.length) return;

  showProcessing(`正在读取照片 0/${files.length}`, 0);
  let failed = 0;

  for (let i = 0; i < files.length; i++) {
    updateProcessing(`正在读取照片 ${i + 1}/${files.length}`, i / files.length);
    await nextFrame();

    const file = files[i];
    try {
      if (!isImageFile(file)) throw new Error("不是图片");
      const thumb = await makeThumbnail(file);
      state.items.push({
        id: uid(),
        file,
        thumb,
        rotation: 0,
        split: false,
      });
    } catch (error) {
      failed += 1;
      console.warn("读取失败:", file.name, error);
    }
  }

  hideProcessing();
  updateView();

  if (failed > 0) {
    toast(`${failed} 张照片无法读取${failed === files.length ? "，可能是浏览器不支持 HEIC 格式" : ""}`);
  }
}

function isImageFile(file) {
  if (file.type && file.type.startsWith("image/")) return true;
  return /\.(jpe?g|png|webp|gif|bmp|heic|heif|avif)$/i.test(file.name || "");
}

async function makeThumbnail(file) {
  const source = await decodeImage(file);
  const sw = source.width;
  const sh = source.height;
  const scale = Math.min(1, 240 / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, w, h);

  const url = canvas.toDataURL("image/jpeg", 0.72);
  releaseSource(source);
  canvas.width = canvas.height = 0;
  return url;
}

function updateView() {
  const hasItems = state.items.length > 0;
  els.empty.hidden = hasItems;
  els.content.hidden = !hasItems;
  els.bottomBar.hidden = !hasItems;
  els.clearBtn.hidden = !hasItems;
  els.listTitle.textContent = hasItems ? `照片 · ${state.items.length} 张` : "照片";
  els.pageCount.textContent = String(totalPages());
  renderList();
}

function totalPages() {
  return state.items.reduce((sum, item) => sum + (item.split ? 2 : 1), 0);
}

function renderList() {
  const fragment = document.createDocumentFragment();
  let page = 1;

  state.items.forEach((item, index) => {
    const pages = item.split ? 2 : 1;
    const card = document.createElement("article");
    card.className = "card";
    card.dataset.id = item.id;

    const main = document.createElement("div");
    main.className = "card-main";

    const thumb = document.createElement("img");
    thumb.className = "thumb";
    thumb.src = item.thumb;
    thumb.alt = "";
    thumb.loading = "lazy";

    const info = document.createElement("div");
    info.className = "info";

    const title = document.createElement("div");
    title.className = "card-title";
    title.textContent = `照片 ${index + 1}`;

    const sub = document.createElement("div");
    sub.className = "card-sub";
    sub.textContent =
      pages === 2 ? `第 ${page}–${page + 1} 页 · 已拆成两页` : `第 ${page} 页`;

    info.append(title, sub);

    if (item.rotation % 360 !== 0) {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = `已旋转 ${item.rotation % 360}°`;
      info.append(badge);
    }

    if (item.split) {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = "双页";
      info.append(badge);
    }

    const del = document.createElement("button");
    del.className = "icon-btn danger";
    del.type = "button";
    del.dataset.action = "delete";
    del.setAttribute("aria-label", `删除照片 ${index + 1}`);
    del.innerHTML = ICONS.trash;

    main.append(thumb, info, del);

    const actions = document.createElement("div");
    actions.className = "card-actions";

    actions.append(
      iconButton("up", "上移", index === 0),
      iconButton("down", "下移", index === state.items.length - 1),
      iconButton("rotate", "顺时针旋转 90°", false)
    );

    const splitBtn = document.createElement("button");
    splitBtn.type = "button";
    splitBtn.className = "toggle" + (item.split ? " active" : "");
    splitBtn.dataset.action = "split";
    splitBtn.setAttribute("aria-pressed", item.split ? "true" : "false");
    splitBtn.textContent = item.split ? "已拆成两页" : "拆成两页";
    actions.append(splitBtn);

    card.append(main, actions);
    fragment.append(card);
    page += pages;
  });

  els.list.replaceChildren(fragment);
}

function iconButton(action, label, disabled) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "icon-btn";
  button.dataset.action = action;
  button.setAttribute("aria-label", label);
  button.disabled = Boolean(disabled);
  button.innerHTML = ICONS[action] || "";
  return button;
}

function onListClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const card = button.closest(".card");
  if (!card) return;

  const index = state.items.findIndex((item) => item.id === card.dataset.id);
  if (index < 0) return;

  const action = button.dataset.action;
  const item = state.items[index];

  if (action === "up" && index > 0) {
    [state.items[index - 1], state.items[index]] = [item, state.items[index - 1]];
  } else if (action === "down" && index < state.items.length - 1) {
    [state.items[index], state.items[index + 1]] = [state.items[index + 1], item];
  } else if (action === "rotate") {
    item.rotation = (item.rotation + 90) % 360;
  } else if (action === "split") {
    item.split = !item.split;
  } else if (action === "delete") {
    state.items.splice(index, 1);
  }

  updateView();
}

/* ---------------- 生成 PDF ---------------- */

async function generatePdf() {
  if (!state.items.length) return;

  const preset = QUALITY_PRESETS[els.quality.value] || QUALITY_PRESETS.standard;
  els.generateBtn.disabled = true;
  showProcessing(`正在处理 0/${state.items.length} 张`, 0);

  try {
    const pages = [];

    for (let i = 0; i < state.items.length; i++) {
      updateProcessing(`正在处理 ${i + 1}/${state.items.length} 张`, i / state.items.length);
      await nextFrame();

      const outputs = await renderItemPages(state.items[i], preset);
      for (const output of outputs) {
        const bytes = new Uint8Array(await output.blob.arrayBuffer());
        pages.push({ bytes, width: output.width, height: output.height });
      }
    }

    updateProcessing("正在合成 PDF…", 0.98);
    await nextFrame();

    const name = sanitizeFilename(els.filename.value) || defaultFilename();
    const blob = buildPdf(pages, {
      title: name,
      autoOrientation: els.orientation.value !== "portrait",
      margin: 12,
    });

    showResult(blob, name + ".pdf", pages.length);
  } catch (error) {
    console.error(error);
    toast(`生成失败：${error.message || "未知错误"}`);
  } finally {
    els.generateBtn.disabled = false;
    hideProcessing();
  }
}

async function renderItemPages(item, preset) {
  const source = await decodeImage(item.file);

  try {
    const sw = source.width;
    const sh = source.height;
    const rotation = normalizeRotation(item.rotation);
    const theta = (rotation * Math.PI) / 180;
    const { width: rw, height: rh } = rotatedSize(sw, sh, rotation);

    const crops = computeCrops(sw, sh, rotation, item.split);
    const outputs = [];

    for (const { x: cx, y: cy, width: cw, height: ch } of crops) {
      const scale = Math.min(1, preset.maxDim / Math.max(cw, ch));
      const ow = Math.max(1, Math.round(cw * scale));
      const oh = Math.max(1, Math.round(ch * scale));

      const canvas = document.createElement("canvas");
      canvas.width = ow;
      canvas.height = oh;
      const ctx = canvas.getContext("2d", { alpha: false });
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, ow, oh);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      if (rotation === 0) {
        ctx.drawImage(source, cx, cy, cw, ch, 0, 0, ow, oh);
      } else {
        // 先在“旋转后的坐标系”里定位裁剪区域，再把原图按旋转矩阵画进去，
        // 这样不需要创建一张原尺寸的中间图，手机上更省内存。
        ctx.setTransform(scale, 0, 0, scale, -cx * scale, -cy * scale);
        ctx.translate(rw / 2, rh / 2);
        ctx.rotate(theta);
        ctx.drawImage(source, -sw / 2, -sh / 2, sw, sh);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }

      const blob = await canvasToBlob(canvas, "image/jpeg", preset.jpegQuality);
      outputs.push({ blob, width: ow, height: oh });
      canvas.width = canvas.height = 0;
    }

    return outputs;
  } finally {
    releaseSource(source);
  }
}

/* ---------------- 结果、分享、下载 ---------------- */

function showResult(blob, filename, pageCount) {
  state.lastPdf = { blob, name: filename };

  if (state.resultUrl) URL.revokeObjectURL(state.resultUrl);
  state.resultUrl = URL.createObjectURL(blob);

  els.downloadBtn.href = state.resultUrl;
  els.downloadBtn.download = filename;
  els.resultMeta.textContent = `共 ${pageCount} 页 · ${formatSize(blob.size)}`;

  const file = new File([blob], filename, { type: "application/pdf" });
  els.shareBtn.hidden = !(
    navigator.canShare && navigator.canShare({ files: [file] })
  );

  els.resultOverlay.hidden = false;
  document.body.classList.add("locked");
}

function closeResult() {
  els.resultOverlay.hidden = true;
  document.body.classList.remove("locked");
}

async function sharePdf() {
  if (!state.lastPdf) return;
  const file = new File([state.lastPdf.blob], state.lastPdf.name, {
    type: "application/pdf",
  });

  try {
    await navigator.share({ files: [file], title: state.lastPdf.name });
  } catch (error) {
    if (error && error.name !== "AbortError") {
      toast("分享失败，请用“保存 / 下载”");
    }
  }
}

/* ---------------- 图片解码与工具 ---------------- */

async function decodeImage(file) {
  // 优先用 <img>：iOS 拍的照片带 EXIF 方向标记，<img> 在各种浏览器里
  // 都会自动摆正，drawImage 画出来也是正的。部分浏览器的
  // createImageBitmap 对 EXIF 方向处理不一致，所以只作为兜底。
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("无法解码图片"));
    });
    if (typeof image.decode === "function") {
      try {
        await image.decode();
      } catch (_) {
        // 已经 onload，解码失败时继续尝试直接绘制
      }
    }
    // 注意：地址不能在这里回收，等画完再回收，否则 Safari 可能画到空白图。
    image.photoPdfUrl = url;
    return image;
  } catch (error) {
    URL.revokeObjectURL(url);
    if (typeof createImageBitmap === "function") {
      try {
        return await createImageBitmap(file, { imageOrientation: "from-image" });
      } catch (_) {
        // 继续抛出原始错误
      }
    }
    throw error;
  }
}

function releaseSource(source) {
  if (typeof source.close === "function") source.close();
  if (source.photoPdfUrl) {
    URL.revokeObjectURL(source.photoPdfUrl);
    source.photoPdfUrl = null;
  }
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    if (typeof canvas.toBlob === "function") {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("图片编码失败"))),
        type,
        quality
      );
      return;
    }

    try {
      const dataUrl = canvas.toDataURL(type, quality);
      const base64 = dataUrl.split(",")[1];
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      resolve(new Blob([bytes], { type }));
    } catch (error) {
      reject(error);
    }
  });
}

function defaultFilename() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `作业-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
}

function sanitizeFilename(value) {
  return String(value || "")
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

function formatSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function uid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function nextFrame() {
  return new Promise((resolve) =>
    requestAnimationFrame(() => setTimeout(resolve, 0))
  );
}

/* ---------------- 界面状态 ---------------- */

function showProcessing(text, progress) {
  els.progressText.textContent = text;
  els.progressBar.style.width = `${Math.round(progress * 100)}%`;
  els.processing.hidden = false;
  document.body.classList.add("locked");
}

function updateProcessing(text, progress) {
  els.progressText.textContent = text;
  els.progressBar.style.width = `${Math.round(progress * 100)}%`;
}

function hideProcessing() {
  els.processing.hidden = true;
  if (els.resultOverlay.hidden) document.body.classList.remove("locked");
}

let toastTimer = null;
function toast(message, duration = 3200) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove("show"), duration);
}

function restoreSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem("photoPdfSettings") || "null");
    if (saved) {
      if (QUALITY_PRESETS[saved.quality]) els.quality.value = saved.quality;
      if (saved.orientation === "auto" || saved.orientation === "portrait") {
        els.orientation.value = saved.orientation;
      }
    }
  } catch (_) {
    // 忽略损坏的本地设置
  }
}

function saveSettings() {
  localStorage.setItem(
    "photoPdfSettings",
    JSON.stringify({
      quality: els.quality.value,
      orientation: els.orientation.value,
    })
  );
}

function showEnvironmentTip() {
  const ua = navigator.userAgent || "";
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone =
    window.navigator.standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches;

  if (isIOS && !standalone && !localStorage.getItem("photoPdfTipDismissed")) {
    els.iosTip.hidden = false;
  }

  if (/MicroMessenger|QQ\//.test(ua)) {
    toast("建议点右上角“…” → 在浏览器中打开，功能更完整", 6000);
  }
}

/* ---------------- PWA ---------------- */

function setupPwa() {
  if (!("serviceWorker" in navigator)) return;
  const local =
    location.hostname === "localhost" || location.hostname === "127.0.0.1";
  if (location.protocol !== "https:" && !local) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.warn("Service Worker 注册失败", error);
    });
  });
}

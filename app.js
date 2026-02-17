const { PDFDocument, rgb, StandardFonts, degrees } = PDFLib;

if (window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

const els = {
  pdfInput: document.getElementById("pdfInput"),
  imageInput: document.getElementById("imageInput"),
  mode: document.getElementById("mode"),
  toggleAll: document.getElementById("toggleAll"),
  toggleText: document.getElementById("toggleText"),
  toggleImage: document.getElementById("toggleImage"),
  toggleDynamic: document.getElementById("toggleDynamic"),
  toggleStamp: document.getElementById("toggleStamp"),
  toggleState: document.getElementById("toggleState"),
  text: document.getElementById("text"),
  dynamicTemplate: document.getElementById("dynamicTemplate"),
  dynamicName: document.getElementById("dynamicName"),
  dynamicEmail: document.getElementById("dynamicEmail"),
  stampPreset: document.getElementById("stampPreset"),
  style: document.getElementById("style"),
  opacity: document.getElementById("opacity"),
  opacityValue: document.getElementById("opacityValue"),
  size: document.getElementById("size"),
  rotation: document.getElementById("rotation"),
  position: document.getElementById("position"),
  offsetX: document.getElementById("offsetX"),
  offsetY: document.getElementById("offsetY"),
  repeat: document.getElementById("repeat"),
  repeatGapX: document.getElementById("repeatGapX"),
  repeatGapY: document.getElementById("repeatGapY"),
  layer: document.getElementById("layer"),
  pageTarget: document.getElementById("pageTarget"),
  pageRangeWrap: document.getElementById("pageRangeWrap"),
  pageRange: document.getElementById("pageRange"),
  previewCanvas: document.getElementById("previewCanvas"),
  previewMeta: document.getElementById("previewMeta"),
  previewPrev: document.getElementById("previewPrev"),
  previewNext: document.getElementById("previewNext"),
  applyBtn: document.getElementById("applyBtn"),
  downloadLink: document.getElementById("downloadLink"),
  status: document.getElementById("status"),
  fileMeta: document.getElementById("fileMeta"),
  textControls: document.getElementById("textControls"),
  imageControls: document.getElementById("imageControls"),
  dynamicControls: document.getElementById("dynamicControls")
};

let sourcePdfBytes = null;
let sourceImageBytes = null;
let sourceImageMime = "";
let sourceImagePreview = null;
let previewDoc = null;
let previewPageIndex = 1;

const liveInputs = [
  "mode", "text", "dynamicTemplate", "dynamicName", "dynamicEmail", "stampPreset", "style", "opacity", "size",
  "rotation", "position", "offsetX", "offsetY", "repeat", "repeatGapX", "repeatGapY", "layer", "pageTarget", "pageRange"
];

els.pdfInput.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  sourcePdfBytes = new Uint8Array(await file.arrayBuffer());
  els.fileMeta.textContent = `${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
  setStatus("PDF loaded.");
  await loadPreviewDocument();
  await renderPreview();
});

els.imageInput.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  sourceImageBytes = file ? await file.arrayBuffer() : null;
  sourceImageMime = file?.type || "";
  sourceImagePreview = sourceImageBytes ? await bytesToImage(sourceImageBytes, sourceImageMime) : null;
  renderPreview();
});

els.mode.addEventListener("change", () => {
  syncModeUI();
  renderPreview();
});

els.toggleAll.addEventListener("change", () => {
  const checked = els.toggleAll.checked;
  els.toggleText.checked = checked;
  els.toggleImage.checked = checked;
  els.toggleDynamic.checked = checked;
  els.toggleStamp.checked = checked;
  updateToggleState();
  renderPreview();
});

for (const toggle of [els.toggleText, els.toggleImage, els.toggleDynamic, els.toggleStamp]) {
  toggle.addEventListener("change", () => {
    updateToggleState();
    renderPreview();
  });
}

els.pageTarget.addEventListener("change", () => {
  els.pageRangeWrap.classList.toggle("hidden", els.pageTarget.value !== "custom");
  renderPreview();
});

els.opacity.addEventListener("input", () => {
  els.opacityValue.textContent = `${els.opacity.value}%`;
  renderPreview();
});

els.stampPreset.addEventListener("change", () => {
  if (els.mode.value === "stamp") els.text.value = els.stampPreset.value;
  renderPreview();
});

for (const key of liveInputs) {
  els[key].addEventListener("input", () => renderPreview());
}

els.previewPrev.addEventListener("click", async () => {
  if (!previewDoc) return;
  previewPageIndex = Math.max(1, previewPageIndex - 1);
  await renderPreview();
});

els.previewNext.addEventListener("click", async () => {
  if (!previewDoc) return;
  previewPageIndex = Math.min(previewDoc.numPages, previewPageIndex + 1);
  await renderPreview();
});

els.applyBtn.addEventListener("click", applyWatermark);

syncModeUI();
updateToggleState();
renderPreviewPlaceholder();

function setStatus(msg) {
  els.status.textContent = msg;
}

function updateToggleState() {
  els.toggleState.textContent = `Stamp presets are ${els.toggleStamp.checked ? "ON" : "OFF"}.`;
}

function syncModeUI() {
  const mode = els.mode.value;
  els.textControls.classList.toggle("hidden", mode !== "text" && mode !== "stamp");
  els.imageControls.classList.toggle("hidden", mode !== "image");
  els.dynamicControls.classList.toggle("hidden", mode !== "dynamic");
  if (mode === "stamp") {
    els.text.value = els.stampPreset.value;
    els.style.value = "stylized";
  }
}

function isModeEnabled(mode) {
  if (!els.toggleAll.checked) return false;
  if (mode === "text") return els.toggleText.checked;
  if (mode === "image") return els.toggleImage.checked;
  if (mode === "dynamic") return els.toggleDynamic.checked;
  if (mode === "stamp") return els.toggleStamp.checked;
  return true;
}

function parsePageRange(input, total) {
  const text = (input || "").trim().toLowerCase();
  if (!text || text === "all") return Array.from({ length: total }, (_, i) => i);
  if (text === "even") return Array.from({ length: total }, (_, i) => i).filter(i => (i + 1) % 2 === 0);
  if (text === "odd") return Array.from({ length: total }, (_, i) => i).filter(i => (i + 1) % 2 === 1);

  const out = new Set();
  for (const part of text.split(",").map(p => p.trim()).filter(Boolean)) {
    if (part.includes("-")) {
      const [a, b] = part.split("-").map(n => parseInt(n, 10));
      if (Number.isInteger(a) && Number.isInteger(b)) {
        const start = Math.max(1, Math.min(a, b));
        const end = Math.min(total, Math.max(a, b));
        for (let i = start; i <= end; i++) out.add(i - 1);
      }
    } else {
      const n = parseInt(part, 10);
      if (Number.isInteger(n) && n >= 1 && n <= total) out.add(n - 1);
    }
  }
  return [...out].sort((a, b) => a - b);
}

function getTargetPageIndices(total) {
  const target = els.pageTarget.value;
  if (target === "all") return Array.from({ length: total }, (_, i) => i);
  if (target === "front") return [0];
  if (target === "back") return total > 0 ? [total - 1] : [];
  if (target === "front-back") return total > 1 ? [0, total - 1] : [0];
  return parsePageRange(els.pageRange.value, total);
}

function resolvePositionPdf(position, pageWidth, pageHeight, markWidth, markHeight, offsetX, offsetY) {
  const margin = 36;
  const map = {
    "top-left": [margin, pageHeight - markHeight - margin],
    "top-center": [(pageWidth - markWidth) / 2, pageHeight - markHeight - margin],
    "top-right": [pageWidth - markWidth - margin, pageHeight - markHeight - margin],
    "middle-left": [margin, (pageHeight - markHeight) / 2],
    "center": [(pageWidth - markWidth) / 2, (pageHeight - markHeight) / 2],
    "middle-right": [pageWidth - markWidth - margin, (pageHeight - markHeight) / 2],
    "bottom-left": [margin, margin],
    "bottom-center": [(pageWidth - markWidth) / 2, margin],
    "bottom-right": [pageWidth - markWidth - margin, margin]
  };

  if (position === "custom") return [Number(offsetX) || 0, Number(offsetY) || 0];
  const [x, y] = map[position] ?? map.center;
  return [x + (Number(offsetX) || 0), y + (Number(offsetY) || 0)];
}

function resolvePositionCanvas(position, width, height, markWidth, markHeight, offsetX, offsetY) {
  const margin = 30;
  const map = {
    "top-left": [margin, margin],
    "top-center": [(width - markWidth) / 2, margin],
    "top-right": [width - markWidth - margin, margin],
    "middle-left": [margin, (height - markHeight) / 2],
    "center": [(width - markWidth) / 2, (height - markHeight) / 2],
    "middle-right": [width - markWidth - margin, (height - markHeight) / 2],
    "bottom-left": [margin, height - markHeight - margin],
    "bottom-center": [(width - markWidth) / 2, height - markHeight - margin],
    "bottom-right": [width - markWidth - margin, height - markHeight - margin]
  };

  if (position === "custom") return [Number(offsetX) || 0, Number(offsetY) || 0];
  const [x, y] = map[position] ?? map.center;
  return [x + (Number(offsetX) || 0), y + (Number(offsetY) || 0)];
}

function buildDynamicText() {
  const now = new Date();
  const datetime = now.toLocaleString();
  return (els.dynamicTemplate.value || "{name} {email} {datetime}")
    .replaceAll("{name}", els.dynamicName.value || "Unknown User")
    .replaceAll("{email}", els.dynamicEmail.value || "unknown@example.com")
    .replaceAll("{date}", now.toLocaleDateString())
    .replaceAll("{time}", now.toLocaleTimeString())
    .replaceAll("{datetime}", datetime);
}

function getRepeatPositions(singleX, singleY, width, height, markW, markH, pdfCoords) {
  if (!els.repeat.checked) return [[singleX, singleY]];
  const gapX = Math.max(0, Number(els.repeatGapX.value) || 0);
  const gapY = Math.max(0, Number(els.repeatGapY.value) || 0);
  const stepX = Math.max(20, markW + gapX);
  const stepY = Math.max(20, markH + gapY);

  const coords = [];
  const startX = (Number(els.offsetX.value) || 0) - markW;
  const startY = (Number(els.offsetY.value) || 0) - markH;
  const maxX = width + markW;
  const maxY = height + markH;

  for (let x = startX; x <= maxX; x += stepX) {
    for (let y = startY; y <= maxY; y += stepY) {
      coords.push([x, y]);
    }
  }

  if (!coords.length) return [[singleX, singleY]];
  if (pdfCoords) return coords;

  return coords.map(([x, y]) => [x, height - y - markH]);
}

function getActiveText(mode) {
  if (mode === "dynamic") return buildDynamicText();
  if (mode === "stamp") return els.stampPreset.value;
  return els.text.value || "WATERMARK";
}

async function applyWatermark() {
  try {
    if (!sourcePdfBytes) {
      setStatus("Upload a PDF first.");
      return;
    }

    const mode = els.mode.value;
    if (!isModeEnabled(mode)) {
      setStatus(`${mode.toUpperCase()} mode is off. Turn it on in the toggle list.`);
      return;
    }

    const pdfDoc = await PDFDocument.load(sourcePdfBytes.slice());
    const pages = pdfDoc.getPages();
    const pageIndices = getTargetPageIndices(pages.length);

    if (!pageIndices.length) {
      setStatus("No valid pages selected.");
      return;
    }

    const style = els.style.value;
    const size = Math.max(8, Number(els.size.value) || 56);
    const opacity = Math.max(0.1, Math.min(0.3, Number(els.opacity.value) / 100));
    const rotation = Number(els.rotation.value) || 0;
    const font = await pdfDoc.embedFont(style === "stylized" ? StandardFonts.HelveticaBoldOblique : StandardFonts.Helvetica);

    let embeddedImage = null;
    if (mode === "image") {
      if (!sourceImageBytes) {
        setStatus("Upload an image for Image mode.");
        return;
      }
      const bytes = new Uint8Array(sourceImageBytes);
      const isPng = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71;
      embeddedImage = isPng ? await pdfDoc.embedPng(sourceImageBytes) : await pdfDoc.embedJpg(sourceImageBytes);
    }

    const text = getActiveText(mode);

    for (const idx of pageIndices) {
      const page = pages[idx];
      const { width, height } = page.getSize();

      if (mode === "image") {
        const baseW = embeddedImage.width;
        const baseH = embeddedImage.height;
        const maxW = width * 0.35;
        const scale = Math.min(maxW / baseW, 1.2);
        const markW = baseW * scale;
        const markH = baseH * scale;
        const [x0, y0] = resolvePositionPdf(els.position.value, width, height, markW, markH, els.offsetX.value, els.offsetY.value);
        const points = getRepeatPositions(x0, y0, width, height, markW, markH, true);

        for (const [x, y] of points) {
          page.drawImage(embeddedImage, {
            x,
            y,
            width: markW,
            height: markH,
            opacity,
            rotate: degrees(rotation)
          });
        }
      } else {
        const isStamp = mode === "stamp";
        const chosenSize = isStamp ? Math.max(size, 36) : size;
        const textWidth = font.widthOfTextAtSize(text, chosenSize);
        const textHeight = chosenSize;
        const [x0, y0] = resolvePositionPdf(els.position.value, width, height, textWidth, textHeight, els.offsetX.value, els.offsetY.value);
        const points = getRepeatPositions(x0, y0, width, height, textWidth, textHeight, true);

        for (const [x, y] of points) {
          if (isStamp) {
            page.drawRectangle({
              x: x - 8,
              y: y - 6,
              width: textWidth + 16,
              height: textHeight + 14,
              borderColor: rgb(0.73, 0.11, 0.11),
              borderWidth: 2,
              opacity: Math.min(opacity + 0.2, 0.6),
              rotate: degrees(rotation)
            });
          }

          page.drawText(text, {
            x,
            y,
            size: chosenSize,
            font,
            color: isStamp ? rgb(0.73, 0.11, 0.11) : rgb(0.1, 0.1, 0.1),
            opacity,
            rotate: degrees(rotation)
          });
        }
      }
    }

    const outBytes = await pdfDoc.save();
    const blob = new Blob([outBytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    els.downloadLink.href = url;
    els.downloadLink.classList.remove("hidden");
    setStatus(`Done. Applied to ${pageIndices.length} page(s). Repeat: ${els.repeat.checked ? "ON" : "OFF"}.`);
  } catch (err) {
    console.error(err);
    setStatus(`Error: ${err.message}`);
  }
}

async function loadPreviewDocument() {
  if (!sourcePdfBytes || !window.pdfjsLib) {
    previewDoc = null;
    return;
  }
  const data = sourcePdfBytes.slice();
  previewDoc = await window.pdfjsLib.getDocument({ data }).promise;
  previewPageIndex = 1;
}

function renderPreviewPlaceholder() {
  const canvas = els.previewCanvas;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#94a3b8";
  ctx.font = "600 20px Space Grotesk";
  ctx.textAlign = "center";
  ctx.fillText("Upload a PDF to preview watermark placement", canvas.width / 2, canvas.height / 2);
  els.previewMeta.textContent = "No preview yet";
}

async function renderPreview() {
  if (!sourcePdfBytes || !previewDoc) {
    renderPreviewPlaceholder();
    return;
  }

  const canvas = els.previewCanvas;
  const ctx = canvas.getContext("2d");
  const page = await previewDoc.getPage(previewPageIndex);
  const initialViewport = page.getViewport({ scale: 1 });
  const fitScale = Math.min(1.3, 760 / initialViewport.width);
  const viewport = page.getViewport({ scale: fitScale });

  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);

  await page.render({ canvasContext: ctx, viewport }).promise;
  const targeted = getTargetPageIndices(previewDoc.numPages).includes(previewPageIndex - 1);
  if (targeted) drawPreviewOverlay(ctx, canvas.width, canvas.height);
  els.previewMeta.textContent = `Page ${previewPageIndex} of ${previewDoc.numPages}${targeted ? " (targeted)" : ""}`;
}

function drawPreviewOverlay(ctx, width, height) {
  const mode = els.mode.value;
  if (!isModeEnabled(mode)) return;

  const opacity = Math.max(0.1, Math.min(0.3, Number(els.opacity.value) / 100));
  const rotationRad = (Number(els.rotation.value) || 0) * Math.PI / 180;
  const size = Math.max(8, Number(els.size.value) || 56);

  if (mode === "image") {
    if (!sourceImagePreview) return;
    const baseW = sourceImagePreview.naturalWidth || sourceImagePreview.width;
    const baseH = sourceImagePreview.naturalHeight || sourceImagePreview.height;
    const maxW = width * 0.35;
    const scale = Math.min(maxW / baseW, 1.2);
    const markW = baseW * scale;
    const markH = baseH * scale;
    const [x0, y0] = resolvePositionCanvas(els.position.value, width, height, markW, markH, els.offsetX.value, els.offsetY.value);
    const points = els.repeat.checked
      ? tileCanvasPositions(width, height, markW, markH)
      : [[x0, y0]];

    for (const [x, y] of points) {
      drawRotatedImage(ctx, sourceImagePreview, x, y, markW, markH, rotationRad, opacity);
    }
    return;
  }

  const text = getActiveText(mode);
  const isStamp = mode === "stamp";
  const fontSize = isStamp ? Math.max(size, 36) : size;
  const fontStyle = els.style.value === "stylized" ? "italic 700" : "600";
  ctx.font = `${fontStyle} ${fontSize}px Space Grotesk`;
  const textWidth = ctx.measureText(text).width;
  const textHeight = fontSize;
  const [x0, y0] = resolvePositionCanvas(els.position.value, width, height, textWidth, textHeight, els.offsetX.value, els.offsetY.value);
  const points = els.repeat.checked
    ? tileCanvasPositions(width, height, textWidth, textHeight)
    : [[x0, y0]];

  for (const [x, y] of points) {
    drawRotatedText(ctx, text, x, y, textWidth, textHeight, rotationRad, opacity, isStamp);
  }
}

function tileCanvasPositions(width, height, markW, markH) {
  const gapX = Math.max(0, Number(els.repeatGapX.value) || 0);
  const gapY = Math.max(0, Number(els.repeatGapY.value) || 0);
  const stepX = Math.max(20, markW + gapX);
  const stepY = Math.max(20, markH + gapY);
  const startX = (Number(els.offsetX.value) || 0) - markW;
  const startY = (Number(els.offsetY.value) || 0) - markH;

  const points = [];
  for (let x = startX; x <= width + markW; x += stepX) {
    for (let y = startY; y <= height + markH; y += stepY) {
      points.push([x, y]);
    }
  }
  return points;
}

function drawRotatedImage(ctx, img, x, y, w, h, rad, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(rad);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
}

function drawRotatedText(ctx, text, x, y, w, h, rad, alpha, isStamp) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(rad);

  if (isStamp) {
    ctx.strokeStyle = "#ba1b1b";
    ctx.lineWidth = 2;
    ctx.strokeRect(-w / 2 - 8, -h / 2 - 6, w + 16, h + 14);
    ctx.fillStyle = "#ba1b1b";
  } else {
    ctx.fillStyle = "#111827";
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

function bytesToImage(arrayBuffer, mimeType) {
  return new Promise((resolve, reject) => {
    const blob = new Blob([arrayBuffer], { type: mimeType || "image/png" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

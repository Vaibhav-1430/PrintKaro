// Print Karo frontend — PDF preview (pdf.js, lazy-loaded from CDN).
// Renders a single File (the just-uploaded document) to a canvas with zoom/rotate
// and page navigation. Non-PDF files (docx/images that the backend converts) fall
// back to a friendly "no preview" state — the metadata summary still applies.
import { loadScript } from './observers.js';

const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
const PDFJS_WORKER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

let libReady;
async function ensureLib() {
  if (!libReady) {
    libReady = loadScript(PDFJS).then(() => {
      const lib = window.pdfjsLib;
      if (lib?.GlobalWorkerOptions) lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
      return lib;
    });
  }
  return libReady;
}

export function isPreviewable(file) {
  return file && (file.type === 'application/pdf' || /\.pdf$/i.test(file.name || ''));
}

/**
 * Mount an interactive preview of `file` into `container`. Returns a controller
 * with { pageCount, destroy() }. Throws if the file can't be rendered.
 */
export async function mountPreview(container, file) {
  const lib = await ensureLib();
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await lib.getDocument({ data }).promise;

  const state = { page: 1, scale: 1.1, rotation: 0 };
  container.innerHTML = `
    <div class="pdfp">
      <div class="pdfp-toolbar">
        <div class="pdfp-nav">
          <button class="btn btn-icon" data-act="prev" aria-label="Previous page">‹</button>
          <span class="pdfp-page" aria-live="polite"></span>
          <button class="btn btn-icon" data-act="next" aria-label="Next page">›</button>
        </div>
        <div class="pdfp-tools">
          <button class="btn btn-icon" data-act="zoomout" aria-label="Zoom out">−</button>
          <button class="btn btn-icon" data-act="zoomin" aria-label="Zoom in">+</button>
          <button class="btn btn-icon" data-act="rotate" aria-label="Rotate">⟳</button>
        </div>
      </div>
      <div class="pdfp-canvas-wrap"><canvas class="pdfp-canvas"></canvas></div>
    </div>`;

  const canvas = container.querySelector('.pdfp-canvas');
  const ctx = canvas.getContext('2d');
  const pageLabel = container.querySelector('.pdfp-page');

  let renderTask = null;
  async function render() {
    const page = await pdf.getPage(state.page);
    const viewport = page.getViewport({ scale: state.scale, rotation: state.rotation });
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    pageLabel.textContent = `Page ${state.page} / ${pdf.numPages}`;
    if (renderTask) renderTask.cancel();
    renderTask = page.render({ canvasContext: ctx, viewport });
    try {
      await renderTask.promise;
    } catch {
      /* cancelled */
    }
  }

  container.querySelector('[data-act="prev"]').onclick = () => {
    if (state.page > 1) {
      state.page--;
      render();
    }
  };
  container.querySelector('[data-act="next"]').onclick = () => {
    if (state.page < pdf.numPages) {
      state.page++;
      render();
    }
  };
  container.querySelector('[data-act="zoomin"]').onclick = () => {
    state.scale = Math.min(3, state.scale + 0.2);
    render();
  };
  container.querySelector('[data-act="zoomout"]').onclick = () => {
    state.scale = Math.max(0.5, state.scale - 0.2);
    render();
  };
  container.querySelector('[data-act="rotate"]').onclick = () => {
    state.rotation = (state.rotation + 90) % 360;
    render();
  };

  await render();
  return {
    pageCount: pdf.numPages,
    destroy() {
      if (renderTask) renderTask.cancel();
      pdf.destroy?.();
      container.innerHTML = '';
    },
  };
}

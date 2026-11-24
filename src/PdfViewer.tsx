import { useEffect, useRef, useState } from "react";
import {
  X,
  ZoomIn,
  ZoomOut,
  ExternalLink,
  Download,
  FileText,
} from "lucide-react";
import type { Book, Entry } from "./model";
import { downloadPdf } from "./pdfSource";
import { siteUrl } from "./urls";
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentProxy,
  type RenderTask,
} from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
GlobalWorkerOptions.workerSrc = workerUrl;
export default function PdfViewer({
  entry,
  book,
  onClose,
}: {
  entry: Entry;
  book: Book;
  onClose: () => void;
}) {
  const pdfUrl = siteUrl(book.pdf);
  const canvas = useRef<HTMLCanvasElement>(null),
    dialog = useRef<HTMLDialogElement>(null),
    [pdf, setPdf] = useState<PDFDocumentProxy | null>(null),
    [zoom, setZoom] = useState(2),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    const d = dialog.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  useEffect(() => {
    setError("");
    setLoading(true);
    let alive = true;
    let task: ReturnType<typeof getDocument> | undefined;
    downloadPdf(pdfUrl)
      .then((blob) => blob.arrayBuffer())
      .then((data) => {
        if (!alive) return;
        task = getDocument({ data });
        return task.promise;
      })
      .then((doc) => {
        if (alive && doc) setPdf(doc);
      })
      .catch(() => {
        if (alive) {
          setError(
            "This page could not be loaded. You can try opening or downloading the original PDF.",
          );
          setLoading(false);
        }
      });
    return () => {
      alive = false;
      void task?.destroy();
    };
  }, [pdfUrl]);
  useEffect(() => {
    if (!pdf || !canvas.current) return;
    let alive = true,
      render: RenderTask | undefined;
    setLoading(true);
    setError("");
    pdf
      .getPage(entry.pdfPage)
      .then((page) => {
        if (!alive || !canvas.current) return;
        const viewport = page.getViewport({ scale: zoom * 1.25 });
        const c = canvas.current;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        c.width = viewport.width * dpr;
        c.height = viewport.height * dpr;
        c.style.width = `${viewport.width}px`;
        c.style.height = `${viewport.height}px`;
        render = page.render({
          canvas: c,
          canvasContext: c.getContext("2d")!,
          viewport,
          transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
        });
        return render.promise;
      })
      .then(() => {
        if (alive) setLoading(false);
      })
      .catch((e) => {
        if (alive && e.name !== "RenderingCancelledException") {
          setError(
            "The requested page could not be rendered. Open the original PDF below.",
          );
          setLoading(false);
        }
      });
    return () => {
      alive = false;
      render?.cancel();
    };
  }, [pdf, entry.pdfPage, zoom]);
  return (
    <dialog
      ref={dialog}
      className="pdf-dialog"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-labelledby="pdf-title"
    >
      <div className="pdf-header">
        <div>
          <span className="eyebrow">ORIGINAL RECORD</span>
          <h2 id="pdf-title">{book.title}</h2>
          <p>
            PDF page {entry.pdfPage}
            {entry.printedPage ? ` · Printed page ${entry.printedPage}` : ""}
            {entry.sourceRow ? ` · Row ${entry.sourceRow}` : ""}
          </p>
        </div>
        <button
          autoFocus
          className="icon-button"
          onClick={onClose}
          aria-label="Close original record"
        >
          <X />
        </button>
      </div>
      <div className="pdf-toolbar">
        <FileText size={17} />
        <span>{entry.route.join(" → ")}</span>
        <div className="spacer" />
        <button
          className="icon-button"
          aria-label="Zoom out"
          disabled={zoom <= 0.5}
          onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
        >
          <ZoomOut size={18} />
        </button>
        <span>{Math.round(zoom * 100)}%</span>
        <button
          className="icon-button"
          aria-label="Zoom in"
          disabled={zoom >= 3}
          onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
        >
          <ZoomIn size={18} />
        </button>
        <a
          className="icon-button"
          href={`${pdfUrl}#page=${entry.pdfPage}`}
          target="_blank"
          rel="noreferrer"
          aria-label="Open PDF in a new tab"
        >
          <ExternalLink size={18} />
        </a>
        <a
          className="icon-button"
          href={pdfUrl}
          download
          aria-label="Download original PDF"
        >
          <Download size={18} />
        </a>
      </div>
      <div className="pdf-scroll">
        {loading && (
          <p role="status" className="pdf-status">
            Loading original page…
          </p>
        )}
        {error && (
          <p role="alert" className="pdf-status">
            {error}
          </p>
        )}
        <canvas
          ref={canvas}
          aria-label={`Scanned logbook page ${entry.pdfPage}`}
          style={{ display: error ? "none" : "block" }}
        />
      </div>
      <p className="pdf-foot">
        The handwritten record is the source of truth. Transcription notes
        appear in entry details.
      </p>
    </dialog>
  );
}

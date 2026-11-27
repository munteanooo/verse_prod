import { parentPort, workerData } from "node:worker_threads";
import { inspectPdf, renderPdf } from "../../modules/documents/pdf.mjs";

try {
  if (workerData.operation === "inspect") {
    const result = await inspectPdf(
      workerData.bytes,
      workerData.mode,
      workerData.limits,
    );
    parentPort.postMessage({
      geometry: result.geometry,
      pages: result.pages.length,
    });
  } else {
    const result = await renderPdf(
      workerData.sources,
      workerData.options,
      workerData.labels,
      workerData.limits,
    );
    parentPort.postMessage(result);
  }
} catch (error) {
  const known = new Set([
    "active",
    "complexity",
    "format",
    "geometry",
    "not-a4",
    "output",
    "pages",
  ]);
  parentPort.postMessage({
    error: known.has(error.message) ? error.message : "format",
  });
}

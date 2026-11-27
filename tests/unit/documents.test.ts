import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
  decodePDFRawStream,
  degrees,
} from "pdf-lib";
import { demoPdf } from "../../scripts/documents/fixtures.mjs";
import {
  axisTiles,
  mmToPoints as pt,
  pointsToMm,
  paper,
} from "@/modules/documents/geometry.mjs";
import { inspectPdf, renderPdf } from "@/modules/documents/pdf.mjs";
import { freeDownload, safeFilename } from "@/modules/documents/types";
import { completeSources, verifyUpload } from "@/modules/documents/service";
import {
  localStorage,
  validUploadToken,
} from "@/infrastructure/documents/storage";

const limits = {
  sourcePages: 8,
  sourceMm: 1800,
  outputPages: 70,
  outputBytes: 12000000,
};
const options = { landscape: false, margin: 12, overlapX: 8, overlapY: 8 };
const labels = { name: "Fixture", size: "01", version: 1 };

const streamText = (stream: PDFRawStream) =>
  Buffer.from(decodePDFRawStream(stream).decode()).toString("ascii");
const content = (doc: PDFDocument, index: number) => {
  const value = doc.getPage(index).node.Contents();
  if (value instanceof PDFRawStream) return streamText(value);
  if (value instanceof PDFArray)
    return Array.from({ length: value.size() }, (_, i) =>
      streamText(value.lookup(i, PDFRawStream)),
    ).join("\n");
  throw new Error("Unexpected PDF content");
};

describe("physical PDF geometry", () => {
  it("keeps exact A4 orientation and avoids an extra blank tile at an exact boundary", () => {
    expect(pointsToMm(pt(50))).toBeCloseTo(50, 12);
    expect(paper(false)).toEqual([pt(210), pt(297)]);
    expect(paper(true)).toEqual([pt(297), pt(210)]);
    expect(axisTiles(190, 100, 10)).toEqual([
      { start: 0, length: 100 },
      { start: 90, length: 100 },
    ]);
    expect(axisTiles(193, 100, 10).at(-1)).toEqual({ start: 180, length: 13 });
    expect(() => axisTiles(190, 100, 100)).toThrow("geometry");
    expect(() => axisTiles(1900, 100, 10, 2)).toThrow("pages");
  });

  it("preserves a 100 mm vector ruler, uses unit drawing scales and produces a 50 mm calibration square", async () => {
    const output = await renderPdf(
      [{ bytes: await demoPdf(), mode: "FULL" }],
      options,
      labels,
      limits,
    );
    const doc = await PDFDocument.load(output.bytes);
    expect(doc.getPages()).toHaveLength(5);
    for (const page of doc.getPages()) {
      expect(pointsToMm(page.getWidth())).toBeCloseTo(210, 9);
      expect(pointsToMm(page.getHeight())).toBeCloseTo(297, 9);
    }
    const calibration = content(doc, 0);
    expect(calibration).toContain(String(pt(50)));
    const tile = content(doc, 1);
    expect(tile).toContain("1 0 0 1 0 0 cm");
    const resources = doc.getPage(1).node.Resources()!;
    const xobjects = resources.lookup(PDFName.of("XObject"), PDFDict);
    const embedded = xobjects.lookup(xobjects.keys()[0]);
    if (!(embedded instanceof PDFRawStream))
      throw new Error("Expected form stream");
    const vector = streamText(embedded);
    const ruler = vector
      .match(/([\d.]+) ([\d.]+) m\s+([\d.]+) ([\d.]+) l/g)
      ?.find((line) => {
        const [x, y, x2, y2] = [...line.matchAll(/[\d.]+/g)].map((number) =>
          Number(number[0]),
        );
        return y === y2 && Math.abs(pointsToMm(x2 - x) - 100) < 1e-8;
      });
    expect(ruler).toBeTruthy();
    const outputLandscape = await renderPdf(
      [{ bytes: await demoPdf(), mode: "FULL" }],
      { ...options, landscape: true },
      labels,
      limits,
    );
    expect(
      (await PDFDocument.load(outputLandscape.bytes)).getPage(0).getSize(),
    ).toEqual({ width: pt(297), height: pt(210) });
  });

  it("handles shifted crop coordinates, rotates clockwise and rejects unsupported PDF features", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([pt(320), pt(430)]);
    page.setMediaBox(10, 20, pt(320), pt(430));
    page.setCropBox(20, 30, pt(280), pt(390));
    page.setRotation(degrees(90));
    page.drawLine({
      start: { x: 25, y: 35 },
      end: { x: 125, y: 35 },
      thickness: 1,
    });
    const bytes = await doc.save();
    const info = await inspectPdf(bytes, "FULL", limits);
    expect(info.geometry[0].width).toBeCloseTo(390);
    expect(info.geometry[0].height).toBeCloseTo(280);
    const rendered = await renderPdf(
      [{ bytes, mode: "FULL" }],
      options,
      labels,
      limits,
    );
    const out = await PDFDocument.load(rendered.bytes);
    const transforms = content(out, 1)
      .split("\n")
      .filter((line) => line.endsWith(" cm"))
      .map((line) => line.slice(0, -3).split(" ").map(Number));
    expect(
      transforms.some(
        ([a, b, c, d, e, f]) =>
          Math.abs(a) < 1e-10 &&
          b === -1 &&
          c === 1 &&
          Math.abs(d) < 1e-10 &&
          e === 0 &&
          f === 0,
      ),
    ).toBe(true);
    const resources = out.getPage(1).node.Resources()!;
    const forms = resources.lookup(PDFName.of("XObject"), PDFDict);
    const form = forms.lookup(forms.keys()[0]);
    if (!(form instanceof PDFRawStream))
      throw new Error("Expected embedded source");
    const matrix = form.dict.lookup(PDFName.of("Matrix"), PDFArray);
    expect(matrix.lookup(4, PDFNumber).asNumber()).toBe(-20);
    expect(matrix.lookup(5, PDFNumber).asNumber()).toBe(-30);
    page.node.set(PDFName.of("UserUnit"), PDFNumber.of(2));
    await expect(inspectPdf(await doc.save(), "FULL", limits)).rejects.toThrow(
      "geometry",
    );
    page.node.delete(PDFName.of("UserUnit"));
    doc.catalog.set(
      PDFName.of("OpenAction"),
      doc.context.obj({ S: "JavaScript" }),
    );
    await expect(inspectPdf(await doc.save(), "FULL", limits)).rejects.toThrow(
      "active",
    );
  });

  it("passes a validated pre-tiled A4 source through without altering its bytes", async () => {
    const input = await PDFDocument.create();
    input
      .addPage([pt(210), pt(297)])
      .drawRectangle({ x: 40, y: 40, width: pt(50), height: pt(50) });
    const original = await input.save();
    expect(
      (
        await renderPdf(
          [{ bytes: original, mode: "A4" }],
          options,
          labels,
          limits,
        )
      ).bytes,
    ).toEqual(original);
    await expect(inspectPdf(await demoPdf(), "A4", limits)).rejects.toThrow(
      "not-a4",
    );
    await expect(
      renderPdf([{ bytes: await demoPdf(), mode: "FULL" }], options, labels, {
        ...limits,
        outputPages: 3,
      }),
    ).rejects.toThrow("pages");
  });
});

it("checks object metadata, scale completeness, premium authorization and filename safety", () => {
  const bytes = Buffer.from("synthetic");
  const checksum = createHash("sha256").update(bytes).digest("hex");
  expect(() =>
    verifyUpload(bytes, { bytes: bytes.length, checksum }),
  ).not.toThrow();
  expect(() =>
    verifyUpload(bytes, { bytes: bytes.length, checksum: "bad" }),
  ).toThrow("checksum");
  expect(safeFilename('../x"\r\n.pdf')).toMatch(/^[a-z0-9.-]+$/);
  expect(
    completeSources([{ pieceId: null, confirmedAt: new Date() }], ["piece"]),
  ).toBe(true);
  expect(
    completeSources([{ pieceId: "piece", confirmedAt: null }], ["piece"]),
  ).toBe(false);
  expect(freeDownload("FREE", "PUBLISHED", true)).toBe(true);
  expect(freeDownload("PREMIUM", "PUBLISHED", true)).toBe(false);
  expect(freeDownload("FREE", "DRAFT", true)).toBe(false);
});

it("enforces one-time object writes, traversal rejection and signed upload bindings in local storage", async () => {
  const root = await mkdtemp(join(tmpdir(), "verse-unit-storage-"));
  try {
    const store = localStorage(root, "http://localhost:3000", "test-secret");
    const key = "q/00000000-0000-0000-0000-000000000001";
    const bytes = Buffer.from("abc");
    const expires = new Date(Date.now() + 5000);
    const grant = new URL(
      (await store.authorizeUpload(key, bytes.length, expires)).url,
    );
    const token = grant.searchParams.get("token")!;
    expect(
      validUploadToken("test-secret", key, 3, expires.getTime(), token),
    ).toBe(true);
    expect(
      validUploadToken("test-secret", key, 4, expires.getTime(), token),
    ).toBe(false);
    await store.put(key, bytes, "application/octet-stream");
    await expect(
      store.put(key, bytes, "application/octet-stream"),
    ).rejects.toThrow();
    await expect(store.get(key, 2)).rejects.toThrow("size");
    await expect(store.get("../secret", 200)).rejects.toThrow("key");
    expect(await store.get(key, 3)).toEqual(bytes);
    await store.delete(key);
    await expect(store.head(key)).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

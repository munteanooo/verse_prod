import { Buffer } from "node:buffer";
import {
  PDFDocument,
  PDFDict,
  PDFRawStream,
  PDFArray,
  PDFName,
  PDFNumber,
  StandardFonts,
  degrees,
  pushGraphicsState,
  popGraphicsState,
  rectangle,
  clip,
  endPath,
  rgb,
} from "pdf-lib";
import {
  axisTiles,
  mmToPoints,
  normalizedRotation,
  paper,
  pointsToMm,
} from "./geometry.mjs";

const bannedKeys = new Set([
  "AA",
  "A",
  "OpenAction",
  "JavaScript",
  "JS",
  "EmbeddedFiles",
  "EF",
  "AF",
  "RichMedia",
  "AcroForm",
  "XFA",
  "Collection",
  "Launch",
  "URI",
  "GoToR",
  "SubmitForm",
  "ImportData",
  "Sound",
  "Movie",
  "3D",
  "Filespec",
  "F",
  "FFilter",
  "FDecodeParms",
]);
const bannedNames = new Set([
  "JavaScript",
  "Launch",
  "FileAttachment",
  "EmbeddedFile",
  "RichMedia",
  "GoToR",
  "GoToE",
  "SubmitForm",
  "ImportData",
  "Rendition",
  "Sound",
  "Movie",
  "Screen",
  "Action",
  "PS",
]);

function inspectObjects(pdf) {
  const entries = pdf.context.enumerateIndirectObjects();
  if (entries.length > 20000) throw new Error("complexity");
  const seen = new Set();
  const pending = [pdf.catalog, ...entries.map(([, object]) => object)];
  while (pending.length) {
    const object = pending.pop();
    if (seen.has(object)) continue;
    seen.add(object);
    if (seen.size > 150000) throw new Error("complexity");
    if (object instanceof PDFRawStream) pending.push(object.dict);
    else if (object instanceof PDFDict) {
      for (const [key, value] of object.entries()) {
        const name = key.decodeText();
        if (
          bannedKeys.has(name) ||
          (value instanceof PDFName && bannedNames.has(value.decodeText()))
        )
          throw new Error("active");
        if (name === "Annots") {
          const annots = pdf.context.lookup(value);
          if (!(annots instanceof PDFArray) || annots.size())
            throw new Error("active");
        }
        pending.push(value);
      }
    } else if (object instanceof PDFArray) {
      for (let i = 0; i < object.size(); i++) pending.push(object.get(i));
    }
  }
}

export async function inspectPdf(bytes, mode, limits) {
  if (Buffer.from(bytes.subarray(0, 5)).toString("ascii") !== "%PDF-")
    throw new Error("format");
  const pdf = await PDFDocument.load(bytes, {
    updateMetadata: false,
    throwOnInvalidObject: true,
  });
  inspectObjects(pdf);
  const pages = pdf.getPages();
  if (!pages.length || pages.length > limits.sourcePages)
    throw new Error("pages");
  const geometry = pages.map((page) => {
    const unit = page.node.lookup(PDFName.of("UserUnit"));
    if (unit && (!(unit instanceof PDFNumber) || unit.asNumber() !== 1))
      throw new Error("geometry");
    const media = page.getMediaBox();
    const crop = page.getCropBox();
    const tolerance = 1e-6;
    if (
      ![media, crop].every(
        ({ x, y, width, height }) =>
          [x, y, width, height].every(Number.isFinite) &&
          width > 0 &&
          height > 0 &&
          width <= mmToPoints(limits.sourceMm) &&
          height <= mmToPoints(limits.sourceMm) &&
          Math.abs(x) < 30000 &&
          Math.abs(y) < 30000,
      ) ||
      crop.x < media.x - tolerance ||
      crop.y < media.y - tolerance ||
      crop.x + crop.width > media.x + media.width + tolerance ||
      crop.y + crop.height > media.y + media.height + tolerance
    )
      throw new Error("geometry");
    const rotation = normalizedRotation(
      page.getRotation().angle,
      crop.width,
      crop.height,
    );
    if (mode === "A4") {
      const [w, h] = paper(rotation.width > rotation.height);
      if (
        Math.abs(w - rotation.width) > mmToPoints(0.5) ||
        Math.abs(h - rotation.height) > mmToPoints(0.5) ||
        Math.abs(crop.width - media.width) > tolerance ||
        Math.abs(crop.height - media.height) > tolerance
      )
        throw new Error("not-a4");
    }
    return {
      crop,
      rotation,
      width: pointsToMm(rotation.width),
      height: pointsToMm(rotation.height),
    };
  });
  return { pdf, pages, geometry };
}

const black = rgb(0, 0, 0);
const text = (label) =>
  label
    .normalize("NFKD")
    .replace(/[^ -~]/g, "")
    .slice(0, 85);
function note(page, font, label, x, y, size = 9) {
  let value = text(label);
  while (
    value &&
    font.widthOfTextAtSize(value, size) > page.getWidth() - x - 18
  )
    value = value.slice(0, -1);
  page.drawText(value, { x, y, size, font, color: black });
}
function marks(page, x, y, w, h) {
  for (const [left, bottom, dx, dy] of [
    [x, y, -1, -1],
    [x + w, y, 1, -1],
    [x, y + h, -1, 1],
    [x + w, y + h, 1, 1],
  ]) {
    page.drawLine({
      start: { x: left + dx, y: bottom + dy },
      end: { x: left + 5 * dx, y: bottom + dy },
      thickness: 0.4,
      color: black,
    });
    page.drawLine({
      start: { x: left + dx, y: bottom + dy },
      end: { x: left + dx, y: bottom + 5 * dy },
      thickness: 0.4,
      color: black,
    });
  }
}

export async function renderPdf(sources, options, labels, limits) {
  const inspected = [];
  for (const source of sources)
    inspected.push(await inspectPdf(source.bytes, source.mode, limits));
  const sourcePages = inspected.reduce(
    (count, item) => count + item.pages.length,
    0,
  );
  if (sourcePages > limits.sourcePages) throw new Error("pages");
  if (sources.length === 1 && sources[0].mode === "A4") {
    if (
      sourcePages > limits.outputPages ||
      sources[0].bytes.byteLength > limits.outputBytes
    )
      throw new Error("output");
    return {
      bytes: sources[0].bytes,
      pages: sourcePages,
      overview: ["A4 original"],
      geometry: inspected[0].geometry,
    };
  }

  const pdf = await PDFDocument.create({ updateMetadata: false });
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const [width, height] = paper(options.landscape);
  const margin = mmToPoints(options.margin);
  const printW = width - 2 * margin;
  const printH = height - 2 * margin;
  const overlapX = mmToPoints(options.overlapX);
  const overlapY = mmToPoints(options.overlapY);
  const plans = [];
  let count = 1;
  for (let file = 0; file < sources.length; file++) {
    const input = inspected[file];
    for (let index = 0; index < input.pages.length; index++) {
      const geometry = input.geometry[index];
      const existing = sources[file].mode === "A4";
      const x = existing
        ? []
        : axisTiles(
            geometry.rotation.width,
            printW,
            overlapX,
            limits.outputPages,
          );
      const y = existing
        ? []
        : axisTiles(
            geometry.rotation.height,
            printH,
            overlapY,
            limits.outputPages,
          );
      count += existing ? 1 : x.length * y.length;
      if (count > limits.outputPages) throw new Error("pages");
      plans.push({ file, index, geometry, existing, x, y });
    }
  }
  pdf.setTitle(text(labels.name + " - " + labels.size));
  const overview = pdf.addPage([width, height]);
  const guideTitle =
    labels.name + " | " + labels.size + " | V" + labels.version;
  note(overview, font, guideTitle, margin, height - margin, 13);
  [
    "Imprimati la dimensiunea reala, 100%.",
    "Nu utilizati optiunea Fit to Page.",
    "Verificati patratul de control de 50 x 50 mm.",
    "Aliniati foile conform numerotarii si marcajelor.",
    "Taiati marginile de imbinare si suprapuneti zonele comune.",
    "Ordine: de sus in jos, de la stanga la dreapta.",
    "Total: " + count + " pagini, inclusiv aceasta pagina.",
  ].forEach((label, index) =>
    note(overview, font, label, margin, height - margin - 24 - index * 14),
  );
  const calibration = mmToPoints(50);
  overview.drawRectangle({
    x: margin,
    y: margin + 8,
    width: calibration,
    height: calibration,
    borderWidth: 0.45,
    borderColor: black,
  });
  note(overview, font, "50 x 50 mm", margin, margin);
  const assembly = [];
  let number = 2;
  for (const plan of plans) {
    const { file, index, x, y, geometry, existing } = plan;
    const sourceLabel = "F" + (file + 1) + " / P" + (index + 1);
    const entry =
      sourceLabel +
      (existing
        ? " - A4 original"
        : " - " + y.length + " randuri x " + x.length + " coloane") +
      " - foi " +
      number +
      (existing ? "" : "-" + (number + x.length * y.length - 1));
    assembly.push(entry);
    note(
      overview,
      font,
      entry,
      margin + calibration + 18,
      height - margin - 135 - (assembly.length - 1) * 13,
      8,
    );
    if (existing) {
      const [page] = await pdf.copyPages(inspected[file].pdf, [index]);
      pdf.addPage(page);
      number++;
      continue;
    }
    const { crop, rotation } = geometry;
    const embedded = await pdf.embedPage(inspected[file].pages[index], {
      left: crop.x,
      bottom: crop.y,
      right: crop.x + crop.width,
      top: crop.y + crop.height,
    });
    for (const [row, v] of y.entries()) {
      for (const [column, h] of x.entries()) {
        const page = pdf.addPage([width, height]);
        const y0 = height - margin - v.length;
        page.pushOperators(
          pushGraphicsState(),
          rectangle(margin, y0, h.length, v.length),
          clip(),
          endPath(),
        );
        page.drawPage(embedded, {
          x: margin - h.start + rotation.x,
          y: height - margin - rotation.height + v.start + rotation.y,
          xScale: 1,
          yScale: 1,
          rotate: degrees(-rotation.angle),
        });
        page.pushOperators(popGraphicsState());
        marks(page, margin, y0, h.length, v.length);
        note(page, font, guideTitle, margin, height - margin + 9);
        note(
          page,
          font,
          sourceLabel +
            " | Rand " +
            (row + 1) +
            " / Coloana " +
            (column + 1) +
            " | " +
            number +
            "/" +
            count +
            " | 100%",
          margin,
          margin - 13,
        );
        number++;
      }
    }
  }
  const bytes = await pdf.save({
    useObjectStreams: false,
    addDefaultPage: false,
    updateFieldAppearances: false,
  });
  if (bytes.byteLength > limits.outputBytes) throw new Error("output");
  const verified = await inspectPdf(bytes, "A4", {
    ...limits,
    sourcePages: limits.outputPages,
  });
  if (verified.pages.length !== count) throw new Error("output");
  return {
    bytes,
    pages: count,
    overview: assembly,
    geometry: inspected.flatMap((item) => item.geometry),
  };
}

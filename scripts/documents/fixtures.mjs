import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import sharp from "sharp";
import { mmToPoints as pt } from "../../src/modules/documents/geometry.mjs";

export async function demoPdf() {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([pt(320), pt(430)]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawRectangle({
    x: pt(30),
    y: pt(45),
    width: pt(200),
    height: pt(300),
    borderWidth: 1,
    borderColor: rgb(0, 0, 0),
  });
  page.drawLine({
    start: { x: pt(30), y: pt(30) },
    end: { x: pt(130), y: pt(30) },
    thickness: 1,
  });
  page.drawText(
    "Control: 100 mm | Geometrie sintetica, nu este tipar de croitorie validat.",
    { x: pt(30), y: pt(15), size: 12, font },
  );
  return pdf.save();
}
export async function demoImage() {
  return sharp({
    create: { width: 540, height: 360, channels: 3, background: "#ccbaa4" },
  })
    .png()
    .toBuffer();
}

export const a4 = { width: 210, height: 297 };
const epsilon = 1e-7;
export const mmToPoints = (mm) => (mm * 72) / 25.4;
export const pointsToMm = (points) => (points * 25.4) / 72;

export function axisTiles(extent, printable, overlap, max = 100) {
  if (
    ![extent, printable, overlap].every(Number.isFinite) ||
    extent <= 0 ||
    printable <= 0 ||
    overlap < 0 ||
    overlap >= printable
  )
    throw new Error("geometry");
  const stride = printable - overlap;
  const count =
    1 + Math.max(0, Math.ceil((extent - printable - epsilon) / stride));
  if (count > max) throw new Error("pages");
  return Array.from({ length: count }, (_, index) => ({
    start: index * stride,
    length: Math.min(printable, extent - index * stride),
  }));
}

export function paper(landscape) {
  return landscape
    ? [mmToPoints(a4.height), mmToPoints(a4.width)]
    : [mmToPoints(a4.width), mmToPoints(a4.height)];
}

export function normalizedRotation(rotation, width, height) {
  if (!Number.isInteger(rotation) || rotation % 90 !== 0)
    throw new Error("geometry");
  const angle = ((rotation % 360) + 360) % 360;
  if (angle === 90)
    return { angle, width: height, height: width, x: 0, y: width };
  if (angle === 180) return { angle, width, height, x: width, y: height };
  if (angle === 270)
    return { angle, width: height, height: width, x: height, y: 0 };
  return { angle, width, height, x: 0, y: 0 };
}

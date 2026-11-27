import process from "node:process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { demoImage, demoPdf } from "./fixtures.mjs";

if (!process.argv[2]) throw new Error("Provide a local output directory.");
const output = resolve(process.argv[2]);
await mkdir(output, { recursive: true });
await writeFile(resolve(output, "verse-control-vector.pdf"), await demoPdf(), {
  flag: "wx",
});
await writeFile(resolve(output, "verse-demo-cover.png"), await demoImage(), {
  flag: "wx",
});

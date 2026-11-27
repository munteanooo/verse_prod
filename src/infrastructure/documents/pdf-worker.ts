import { join } from "node:path";
import { Worker } from "node:worker_threads";
import type { DocumentLimits } from "../../config/storage-environment";

export type PdfMode = "A4" | "FULL";
export type Geometry = { width: number; height: number };
export type TileOptions = {
  landscape: boolean;
  margin: number;
  overlapX: number;
  overlapY: number;
};
type Request =
  | { operation: "inspect"; bytes: Uint8Array; mode: PdfMode }
  | {
      operation: "render";
      sources: { bytes: Uint8Array; mode: PdfMode }[];
      options: TileOptions;
      labels: { name: string; size: string; version: number };
    };
export type WorkerResult = {
  geometry: Geometry[];
  pages: number;
  bytes?: Uint8Array;
  overview?: string[];
  error?: string;
};

let active = 0;

export async function runPdf(
  data: Request,
  limits: DocumentLimits,
): Promise<WorkerResult> {
  if (active >= limits.concurrent) throw new Error("busy");
  active++;
  try {
    const worker = new Worker(
      join(process.cwd(), "src/infrastructure/documents/worker.mjs"),
      {
        workerData: { ...data, limits },
        resourceLimits: {
          maxOldGenerationSizeMb: 128,
          maxYoungGenerationSizeMb: 24,
          stackSizeMb: 4,
        },
        env: {},
        execArgv: [],
        stdout: true,
        stderr: true,
      },
    );
    worker.stdout.resume();
    worker.stderr.resume();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const reply = await new Promise<WorkerResult>((resolve, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), limits.workerMs);
        worker.once("message", resolve);
        worker.once("error", () => reject(new Error("processing")));
        worker.once("exit", () => reject(new Error("processing")));
      });
      if (reply.error) throw new Error(reply.error);
      return reply;
    } finally {
      clearTimeout(timer);
      await worker.terminate();
    }
  } finally {
    active--;
  }
}

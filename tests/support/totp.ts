import { createHmac } from "node:crypto";

// RFC 6238 test client. Production verification is provided by Better Auth.
export function totp(uri: string) {
  const secret = new URL(uri).searchParams.get("secret");
  if (!secret) throw new Error("Missing TOTP secret");
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bits = [...secret.toUpperCase()]
    .filter((symbol) => symbol !== "=")
    .map((symbol) => alphabet.indexOf(symbol).toString(2).padStart(5, "0"))
    .join("");
  const key = Buffer.from(
    (bits.match(/.{8}/g) ?? []).map((byte) => parseInt(byte, 2)),
  );
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = createHmac("sha1", key).update(counter).digest();
  const offset = digest.at(-1)! & 15;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000)
    .toString()
    .padStart(6, "0");
}

import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";
import { shrinkPoster } from "./shrink-poster.ts";

const png = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: "#b4441a" } }).png().toBuffer();
const arrayBuffer = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

test("a large poster shrinks to 800 wide, keeps its shape and becomes WebP", async () => {
  const meta = await sharp(await shrinkPoster(arrayBuffer(await png(2000, 1000)))).metadata();
  assert.deepEqual([meta.format, meta.width, meta.height], ["webp", 800, 400]);
});

test("a small poster isn't enlarged", async () => {
  const meta = await sharp(await shrinkPoster(arrayBuffer(await png(400, 400)))).metadata();
  assert.deepEqual([meta.width, meta.height], [400, 400]);
});

test("something that isn't an image fails instead of saving junk", async () => {
  await assert.rejects(shrinkPoster(new TextEncoder().encode("<html>").buffer as ArrayBuffer));
});

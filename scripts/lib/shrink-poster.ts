import sharp from "sharp";

// The largest a poster shows is a full-width card on a high-density phone.
const MAX_WIDTH = 800;

export function shrinkPoster(image: ArrayBuffer): Promise<Buffer> {
  return sharp(Buffer.from(image)).rotate().resize({ width: MAX_WIDTH, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
}

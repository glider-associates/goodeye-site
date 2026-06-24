import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = new URL("../public/images", import.meta.url).pathname;
const MAX_PHOTO = 2400;
const MAX_LOGO = 1200;
const PHOTO_QUALITY = 82;
const LOGO_QUALITY = 90;

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else files.push(full);
  }
  return files;
}

async function optimize(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (![".jpg", ".jpeg", ".png"].includes(ext)) return null;

  const rel = path.relative(ROOT, filePath);
  const isLogo = rel.startsWith("logo") || rel.startsWith("logos");
  const maxSize = isLogo ? MAX_LOGO : MAX_PHOTO;
  const outPath = filePath.replace(/\.(jpe?g|png)$/i, ".webp");

  const image = sharp(filePath);
  const meta = await image.metadata();
  const needsResize =
    (meta.width ?? 0) > maxSize || (meta.height ?? 0) > maxSize;

  let pipeline = image.rotate();
  if (needsResize) {
    pipeline = pipeline.resize({
      width: (meta.width ?? 0) >= (meta.height ?? 0) ? maxSize : undefined,
      height: (meta.height ?? 0) > (meta.width ?? 0) ? maxSize : undefined,
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  await pipeline
    .webp({ quality: isLogo ? LOGO_QUALITY : PHOTO_QUALITY, effort: 4 })
    .toFile(outPath);

  const before = (await fs.stat(filePath)).size;
  const after = (await fs.stat(outPath)).size;
  await fs.unlink(filePath);

  return { rel, before, after };
}

const files = await walk(ROOT);
const results = [];

for (const file of files) {
  const result = await optimize(file);
  if (result) results.push(result);
}

const beforeTotal = results.reduce((sum, r) => sum + r.before, 0);
const afterTotal = results.reduce((sum, r) => sum + r.after, 0);

console.log(`Optimized ${results.length} files`);
console.log(
  `Size: ${(beforeTotal / 1024 / 1024).toFixed(1)} MB -> ${(afterTotal / 1024 / 1024).toFixed(1)} MB`,
);

results
  .sort((a, b) => b.before - a.before)
  .slice(0, 10)
  .forEach((r) => {
    console.log(
      `  ${(r.before / 1024 / 1024).toFixed(1)} -> ${(r.after / 1024 / 1024).toFixed(1)} MB  ${r.rel}`,
    );
  });

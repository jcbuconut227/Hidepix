// Prepares the COVER picture the moment it is chosen: converts it to PNG and shrinks it if it is too big.
//
// Only use this for the cover picture. Never use it on a picture you want to reveal a message from:
// resizing or re-encoding would destroy the hidden message.

export const MAX_PIXELS = 16_000_000; // phone browsers fail silently on bigger canvases
export const MAX_PNG_MB = 10; // size limit for the PNG; bigger pictures are shrunk until they fit

export type PreparedImage = { file: File; note?: string };

export async function prepareCover(original: File): Promise<PreparedImage> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(original);
  } catch {
    throw new Error("Couldn't read this picture. Try a PNG or JPG.");
  }

  const { width, height } = bitmap;
  const maxBytes = MAX_PNG_MB * 1024 * 1024;
  const isPng = original.type === "image/png";

  // Already a PNG that fits? Leave it exactly as it is.
  if (isPng && width * height <= MAX_PIXELS && original.size <= maxBytes) {
    bitmap.close();
    return { file: original };
  }

  // Shrink to the pixel limit first, then keep shrinking until the PNG is small enough.
  let scale = Math.min(1, Math.sqrt(MAX_PIXELS / (width * height)));
  let w = width;
  let h = height;
  let blob: Blob | null = null;

  for (let attempt = 0; attempt < 6; attempt++) {
    w = Math.max(1, Math.floor(width * scale));
    h = Math.max(1, Math.floor(height * scale));
    blob = await drawToPng(bitmap, w, h);
    if (blob.size <= maxBytes) break;
    scale *= Math.min(0.95, Math.sqrt(maxBytes / blob.size) * 0.92); // PNG size roughly follows pixel count
  }
  bitmap.close();

  if (!blob || blob.size > maxBytes) {
    throw new Error(`This picture is too detailed to shrink under ${MAX_PNG_MB} MB. Try a different picture.`);
  }

  const notes: string[] = [];
  if (!isPng) notes.push(`converted from ${original.type.replace("image/", "").replace("jpeg", "jpg").toUpperCase() || "its format"} to PNG`);
  if (w !== width || h !== height) notes.push(`resized from ${width}×${height} to ${w}×${h} to fit the size limit`);

  const name = original.name.replace(/\.[^.]+$/, "") + ".png";
  return {
    file: new File([blob], name, { type: "image/png" }),
    note: notes.length ? `Your picture was ${notes.join(" and ")}.` : undefined,
  };
}

async function drawToPng(bitmap: ImageBitmap, w: number, h: number): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h); // flatten transparency, which would alter pixel values
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, w, h);
  const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/png"));
  if (!blob) throw new Error("Couldn't convert this picture to PNG.");
  return blob;
}

/** A generated sample picture (purple gradient with soft circles) for the "Try a demo" button. */
export async function makeDemoPicture(): Promise<{ file: File; width: number; height: number }> {
  const width = 960;
  const height = 640;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#1a1033");
  gradient.addColorStop(0.5, "#6b21a8");
  gradient.addColorStop(1, "#c084fc");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  for (let i = 0; i < 14; i++) {
    ctx.beginPath();
    ctx.arc((i * 197) % width, (i * 131) % height, 40 + ((i * 53) % 90), 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 255, 255, ${0.04 + (i % 4) * 0.025})`;
    ctx.fill();
  }
  const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/png"));
  if (!blob) throw new Error("Couldn't create the demo picture.");
  return { file: new File([blob], "demo.png", { type: "image/png" }), width, height };
}
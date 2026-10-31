// Hidepix core: hides bytes in the least significant bit (LSB) of an image's R, G, B values.
//
// Two layers:
//  1. Pure functions (embedInPixels / extractFromPixels) work on raw RGBA pixel data.
//  2. Browser helpers at the bottom (hideMessage / revealMessage) connect them to real images.
//
// A "slot" is one colour value we may change. Each pixel has 3 slots (R, G, B), so slot 0 is
// pixel 0's red, slot 1 is its green, slot 2 is its blue, slot 3 is pixel 1's red, and so on.

type Bytes = Uint8Array<ArrayBuffer>;

export type Method = "lsb" | "lsbm"; // replacement | matching (±1)
export type HideOptions = { method: Method; compress: boolean; scatter: boolean; password: string };

export class StegoError extends Error {}

// ---------- Header ----------
// 12 bytes, always stored first and always in order, so Reveal can read the settings from the image:
// [0-1] "HP" marker | [2] version | [3] flags | [4-7] payload length | [8-11] CRC32 of the payload
const MAGIC = [0x48, 0x50];
const VERSION = 1;
const HEADER_BYTES = 12;
const FLAG_COMPRESSED = 1;
const FLAG_ENCRYPTED = 2;
const FLAG_SCATTERED = 4;
const FLAG_MATCHING = 8;
const CRYPTO_OVERHEAD = 16 + 12 + 16; // salt + iv + AES-GCM tag

const enc = new TextEncoder();

/** How many message bytes fit in a picture of this size. */
export function capacityBytes(width: number, height: number, hasPassword = false): number {
  const fits = Math.floor((width * height * 3 - HEADER_BYTES * 8) / 8);
  return Math.max(0, fits - (hasPassword ? CRYPTO_OVERHEAD : 0));
}

// ---------- Small helpers ----------

// CRC32 is a checksum: if even one bit of the payload is wrong, the number changes.
function crc32(data: Uint8Array): number {
  let crc = ~0;
  for (const byte of data) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function concat(...parts: Bytes[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

async function runStream(data: Bytes, stream: CompressionStream | DecompressionStream): Promise<Bytes> {
  const piped = new Blob([data]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(piped).arrayBuffer());
}

// ---------- Encryption (password -> AES-GCM) ----------
function needSecurePage() {
  if (!globalThis.crypto?.subtle) {
    throw new StegoError("This feature needs a secure (https) page. Open the site over https, or turn off the password and Scatter.");
  }
}

async function deriveKey(password: string, salt: Bytes): Promise<CryptoKey> {
  needSecurePage();
  const base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 200_000, hash: "SHA-256" },
    base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"],
  );
}

async function encrypt(data: Bytes, password: string): Promise<Bytes> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data));
  return concat(salt, iv, cipher); // stored as: salt + iv + encrypted data
}

async function decrypt(data: Bytes, password: string): Promise<Bytes> {
  const key = await deriveKey(password, data.slice(0, 16));
  try {
    return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: data.slice(16, 28) }, key, data.slice(28)));
  } catch {
    throw new StegoError("Wrong password. The message could not be decrypted.");
  }
}

// ---------- Scatter (password-seeded shuffle of where the bits go) ----------

// sfc32: a tiny seeded random number generator. Same seed -> same sequence, which is what lets
// Reveal rebuild the exact same shuffled order that Hide used.
function makeRandom(seed: number[]) {
  let [a, b, c, d] = seed;
  return () => {
    a |= 0; b |= 0; c |= 0; d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

async function seedFrom(password: string): Promise<number[]> {
  needSecurePage();
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode("hidepix-scatter:" + password)));
  const view = new DataView(hash.buffer);
  return [view.getUint32(0), view.getUint32(4), view.getUint32(8), view.getUint32(12)];
}

// Which slots hold the payload? The header owns the first slots; the payload uses the rest,
// either in order, or in a shuffled order (a partial Fisher-Yates shuffle that only remembers
// the spots it actually moved, so huge images don't need huge arrays).
async function payloadSlots(totalSlots: number, count: number, scatter: boolean, password: string): Promise<Uint32Array> {
  const start = HEADER_BYTES * 8;
  const slots = new Uint32Array(count);
  if (!scatter) {
    for (let i = 0; i < count; i++) slots[i] = start + i;
    return slots;
  }
  const random = makeRandom(await seedFrom(password));
  const pool = totalSlots - start;
  const moved = new Map<number, number>();
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(random() * (pool - i));
    const atJ = moved.get(j) ?? j;
    moved.set(j, moved.get(i) ?? i);
    slots[i] = start + atJ;
  }
  return slots;
}

function headerSlots(): Uint32Array {
  return Uint32Array.from({ length: HEADER_BYTES * 8 }, (_, i) => i);
}

// ---------- Reading and writing bits ----------
// Pixel data is RGBA (4 values per pixel), but we only touch R, G, B, so a slot maps to:
const indexOf = (slot: number) => Math.floor(slot / 3) * 4 + (slot % 3);

function writeBit(px: Uint8ClampedArray, slot: number, bit: number, matching: boolean) {
  const i = indexOf(slot);
  if ((px[i] & 1) === bit) return; // last bit already correct: leave the pixel alone
  if (matching) px[i] += px[i] === 0 ? 1 : px[i] === 255 ? -1 : Math.random() < 0.5 ? 1 : -1; // ±1
  else px[i] = bit ? px[i] | 1 : px[i] & 254; // replace the last bit
}

function writeBytes(px: Uint8ClampedArray, slots: ArrayLike<number>, bytes: Bytes, matching: boolean) {
  for (let i = 0; i < bytes.length * 8; i++) {
    writeBit(px, slots[i], (bytes[i >> 3] >> (7 - (i & 7))) & 1, matching); // most significant bit first
  }
}

function readBytes(px: Uint8ClampedArray, slots: ArrayLike<number>, count: number): Bytes {
  const out = new Uint8Array(count);
  for (let i = 0; i < count * 8; i++) out[i >> 3] |= (px[indexOf(slots[i])] & 1) << (7 - (i & 7));
  return out;
}

// ---------- Hide ----------
export async function embedInPixels(px: Uint8ClampedArray, width: number, height: number, message: string, o: HideOptions): Promise<void> {
  let data: Bytes = enc.encode(message); // UTF-8, so emoji and any language work
  let flags = 0;

  if (o.compress) {
    const small = await runStream(data, new CompressionStream("deflate-raw"));
    if (small.length < data.length) { data = small; flags |= FLAG_COMPRESSED; } // keep only if it helps
  }
  if (o.password) { data = await encrypt(data, o.password); flags |= FLAG_ENCRYPTED; }
  if (o.scatter) flags |= FLAG_SCATTERED;
  if (o.method === "lsbm") flags |= FLAG_MATCHING;

  const totalSlots = width * height * 3;
  if (data.length > Math.floor((totalSlots - HEADER_BYTES * 8) / 8)) {
    throw new StegoError("Message is too long for this picture. Shorten it or use a bigger picture.");
  }

  const header = new Uint8Array(HEADER_BYTES);
  header.set([...MAGIC, VERSION, flags]);
  const view = new DataView(header.buffer);
  view.setUint32(4, data.length);
  view.setUint32(8, crc32(data));

  const matching = o.method === "lsbm";
  writeBytes(px, headerSlots(), header, matching);
  writeBytes(px, await payloadSlots(totalSlots, data.length * 8, o.scatter, o.password), data, matching);
}

// ---------- Reveal ----------
export async function extractFromPixels(px: Uint8ClampedArray, width: number, height: number, password: string): Promise<string> {
  const totalSlots = width * height * 3;
  const notFound = () => new StegoError("No message found, or the image was modified.");
  if (totalSlots < HEADER_BYTES * 8) throw notFound();

  const header = readBytes(px, headerSlots(), HEADER_BYTES);
  if (header[0] !== MAGIC[0] || header[1] !== MAGIC[1] || header[2] !== VERSION) throw notFound();

  const view = new DataView(header.buffer);
  const flags = header[3];
  const length = view.getUint32(4);
  if (length > Math.floor((totalSlots - HEADER_BYTES * 8) / 8)) throw notFound(); // impossible length
  if ((flags & FLAG_ENCRYPTED) && !password) throw new StegoError("This message is password protected. Enter the password.");

  const slots = await payloadSlots(totalSlots, length * 8, (flags & FLAG_SCATTERED) !== 0, password);
  let data = readBytes(px, slots, length);
  if (crc32(data) !== view.getUint32(8)) {
    throw new StegoError("Couldn't read the message. The image may have been modified, or the password is wrong.");
  }

  if (flags & FLAG_ENCRYPTED) data = await decrypt(data, password);
  if (flags & FLAG_COMPRESSED) data = await runStream(data, new DecompressionStream("deflate-raw"));
  return new TextDecoder().decode(data);
}

// ---------- Browser helpers: image <-> pixels ----------
async function loadPixels(url: string) {
  const bitmap = await createImageBitmap(await (await fetch(url)).blob());
  const isPhone = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (isPhone && bitmap.width * bitmap.height > 16_000_000) { // phone browsers fail silently on very large canvases
    throw new StegoError("This picture is too large for a phone browser (over 16 megapixels). Use a smaller picture, or open the site on a computer.");
  }
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height); // flatten transparency, which would alter pixel values
  ctx.drawImage(bitmap, 0, 0);
  return { canvas, ctx, image: ctx.getImageData(0, 0, canvas.width, canvas.height) };
}

/** Returns a blob: URL of a new PNG that contains the message. */
export async function hideMessage(imageUrl: string, message: string, options: HideOptions): Promise<string> {
  const { canvas, ctx, image } = await loadPixels(imageUrl);
  await embedInPixels(image.data, image.width, image.height, message, options);
  ctx.putImageData(image, 0, 0);
  const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/png"));
  if (!blob) throw new StegoError("Could not create the PNG.");
  return URL.createObjectURL(blob);
}

export async function revealMessage(imageUrl: string, password: string): Promise<string> {
  const { image } = await loadPixels(imageUrl);
  return extractFromPixels(image.data, image.width, image.height, password);
}
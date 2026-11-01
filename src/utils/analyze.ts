// Tools for looking at pictures: file hash, hidden-data detection, difference map, password helpers.
// The pure functions work on raw RGBA pixel data, so they can be tested without a browser.
// (The import ends in .ts so that Node can run the tests.)
import { inspectHeader, loadPixels } from "./stego.ts";

// ---------- Hash ----------
/** SHA-256 fingerprint of a file. Change one bit of the file and the whole hash changes. */
export async function sha256Hex(data: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await data.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------- Detection ----------

// Chi-square "pairs of values" test (Westfeld & Pfitzmann).
// Plain LSB replacement pushes the counts of the values 2k and 2k+1 towards each other.
// A high p-value means "the pairs look equalised", which is what a picture full of hidden data looks like.
// It only catches pictures filled close to capacity; small messages usually pass unnoticed.
export function chiSquareLsb(px: Uint8ClampedArray) {
  const hist = new Float64Array(256);
  for (let i = 0; i < px.length; i += 4) { hist[px[i]]++; hist[px[i + 1]]++; hist[px[i + 2]]++; }
  let chi2 = 0;
  let pairs = 0;
  for (let k = 0; k < 128; k++) {
    const a = hist[2 * k];
    const expected = (a + hist[2 * k + 1]) / 2;
    if (expected < 5) continue; // too few samples to judge this pair
    chi2 += (a - expected) ** 2 / expected;
    pairs++;
  }
  const df = pairs - 1;
  return { chi2, df, p: df > 0 ? chiSquareSurvival(chi2, df) : 0 };
}

// P(chi-square >= x) using the Wilson-Hilferty approximation (accurate for the sizes used here).
function chiSquareSurvival(x: number, k: number): number {
  const z = (Math.cbrt(x / k) - (1 - 2 / (9 * k))) / Math.sqrt(2 / (9 * k));
  return 1 - normalCdf(z);
}

function normalCdf(z: number): number {
  const t = 1 / (1 + (0.3275911 * Math.abs(z)) / Math.SQRT2); // Abramowitz-Stegun erf approximation
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-(z * z) / 2);
  return 0.5 * (1 + (z >= 0 ? erf : -erf));
}

/** A grey picture of only the last bit of every colour value (4 shades: how many of R, G, B are odd). */
export function lsbPlane(px: Uint8ClampedArray) {
  const out = new Uint8ClampedArray(px.length);
  for (let i = 0; i < px.length; i += 4) {
    const shade = (px[i] & 1) * 85 + (px[i + 1] & 1) * 85 + (px[i + 2] & 1) * 85;
    out[i] = out[i + 1] = out[i + 2] = shade;
    out[i + 3] = 255;
  }
  return out;
}

/** Marks every pixel that differs between two pictures (magenta) on a dark background. */
export function diffPixels(before: Uint8ClampedArray, after: Uint8ClampedArray) {
  const out = new Uint8ClampedArray(before.length);
  let changed = 0;
  let maxChange = 0;
  for (let i = 0; i < before.length; i += 4) {
    const d = Math.max(Math.abs(before[i] - after[i]), Math.abs(before[i + 1] - after[i + 1]), Math.abs(before[i + 2] - after[i + 2]));
    if (d > 0) { changed++; maxChange = Math.max(maxChange, d); out[i] = 217; out[i + 1] = 70; out[i + 2] = 239; }
    else { out[i] = out[i + 1] = out[i + 2] = 13; }
    out[i + 3] = 255;
  }
  return { out, changed, total: before.length / 4, maxChange };
}

// ---------- Browser wrappers ----------
async function toPngUrl(data: Uint8ClampedArray<ArrayBuffer>, width: number, height: number): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.putImageData(new ImageData(data, width, height), 0, 0);
  const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/png"));
  if (!blob) throw new Error("Could not draw the picture.");
  return URL.createObjectURL(blob);
}

export type Analysis = {
  width: number;
  height: number;
  signature: ReturnType<typeof inspectHeader>;
  chi: ReturnType<typeof chiSquareLsb>;
  planeUrl: string;
};

export async function analyzePicture(url: string): Promise<Analysis> {
  const { image } = await loadPixels(url);
  const { data, width, height } = image;
  return { width, height, signature: inspectHeader(data, width, height), chi: chiSquareLsb(data), planeUrl: await toPngUrl(lsbPlane(data), width, height) };
}

export async function buildDiff(beforeUrl: string, afterUrl: string) {
  const a = (await loadPixels(beforeUrl)).image;
  const b = (await loadPixels(afterUrl)).image;
  if (a.width !== b.width || a.height !== b.height) throw new Error("The pictures have different sizes.");
  const { out, changed, total, maxChange } = diffPixels(a.data, b.data);
  return { url: await toPngUrl(out, a.width, a.height), changed, total, maxChange };
}

// ---------- Passwords ----------
const COMMON = ["password", "12345678", "qwerty", "letmein", "admin", "iloveyou", "abc123", "11111111"];

/** A rough estimate only: length and variety, with a penalty for common words and repeats. */
export function passwordStrength(pw: string): { score: 0 | 1 | 2 | 3 | 4; label: string } {
  if (!pw) return { score: 0, label: "" };
  let pool = 0;
  if (/[a-z]/.test(pw)) pool += 26;
  if (/[A-Z]/.test(pw)) pool += 26;
  if (/\d/.test(pw)) pool += 10;
  if (/[^a-zA-Z0-9]/.test(pw)) pool += 32;
  let bits = pw.length * Math.log2(pool);
  if (new Set(pw).size < pw.length / 2) bits *= 0.6;
  if (COMMON.some((word) => pw.toLowerCase().includes(word))) bits = Math.min(bits, 20);
  if (bits < 28) return { score: 1, label: "Weak" };
  if (bits < 45) return { score: 2, label: "Okay" };
  if (bits < 65) return { score: 3, label: "Strong" };
  return { score: 4, label: "Very strong" };
}

/** Random password from the browser's secure random generator (no look-alike characters). */
export function generatePassword(length = 16): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*-_=+?";
  const limit = 256 - (256 % chars.length); // throw away values that would make some characters more likely
  let out = "";
  while (out.length < length) {
    for (const byte of crypto.getRandomValues(new Uint8Array(length * 2))) {
      if (byte < limit && out.length < length) out += chars[byte % chars.length];
    }
  }
  return out;
}
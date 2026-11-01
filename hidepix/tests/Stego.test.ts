// Run with:  npm test   (needs Node 22.12 or newer)
import assert from "node:assert/strict";
import { test } from "node:test";
import { capacityBytes, embedInPixels, extractFromPixels, inspectHeader, StegoError, type HideOptions } from "../src/utils/stego.ts";
import { chiSquareLsb, diffPixels, generatePassword, lsbPlane, passwordStrength } from "../src/utils/analyze.ts";

const W = 120;
const H = 90;
const message = "Hello from Hidepix 😀 héllo こんにちは";

function freshPixels() {
  const px = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < px.length; i++) px[i] = i % 4 === 3 ? 255 : Math.floor(Math.random() * 256);
  return px;
}
const options = (o: Partial<HideOptions> = {}): HideOptions => ({ method: "lsb", compress: false, scatter: false, password: "", ...o });

const settings: Record<string, Partial<HideOptions>> = {
  plain: {},
  compressed: { compress: true },
  scattered: { scatter: true },
  matching: { method: "lsbm" },
  "with password": { password: "s3cret" },
  everything: { method: "lsbm", compress: true, scatter: true, password: "s3cret" },
};

for (const [name, o] of Object.entries(settings)) {
  test(`round trip: ${name}`, async () => {
    const px = freshPixels();
    await embedInPixels(px, W, H, message, options(o));
    assert.equal(await extractFromPixels(px, W, H, o.password ?? ""), message);
  });
}

test("no colour value changes by more than 1, and alpha is untouched", async () => {
  const px = freshPixels();
  const before = px.slice();
  await embedInPixels(px, W, H, message, options({ method: "lsbm" }));
  for (let i = 0; i < px.length; i++) {
    if (i % 4 === 3) assert.equal(px[i], before[i]);
    else assert.ok(Math.abs(px[i] - before[i]) <= 1);
  }
});

test("wrong or missing password is rejected", async () => {
  const px = freshPixels();
  await embedInPixels(px, W, H, "secret", options({ password: "right" }));
  await assert.rejects(extractFromPixels(px, W, H, "wrong"), StegoError);
  await assert.rejects(extractFromPixels(px, W, H, ""), StegoError);
});

test("a picture without a message is rejected", async () => {
  await assert.rejects(extractFromPixels(freshPixels(), W, H, ""), StegoError);
});

test("a message that is too long is rejected, and exactly full works", async () => {
  await assert.rejects(embedInPixels(freshPixels(), W, H, "x".repeat(capacityBytes(W, H) + 1), options()), StegoError);
  const px = freshPixels();
  const full = "y".repeat(capacityBytes(W, H));
  await embedInPixels(px, W, H, full, options());
  assert.equal(await extractFromPixels(px, W, H, ""), full);
});

test("inspectHeader reads the settings without a password", async () => {
  const px = freshPixels();
  assert.equal(inspectHeader(px, W, H), null);
  await embedInPixels(px, W, H, "hello", options({ password: "pw", scatter: true }));
  const info = inspectHeader(px, W, H);
  assert.ok(info && info.encrypted && info.scattered && !info.compressed && !info.matching);
});

test("chi-square returns a valid probability", () => {
  const { p, df } = chiSquareLsb(freshPixels());
  assert.ok(df > 0 && p >= 0 && p <= 1);
});

test("lsbPlane and diffPixels", () => {
  const a = freshPixels();
  const b = a.slice();
  b[0] ^= 1;
  b[5] ^= 1;
  const { changed, maxChange } = diffPixels(a, b);
  assert.equal(changed, 2);
  assert.equal(maxChange, 1);
  assert.ok(lsbPlane(a).every((v, i) => (i % 4 === 3 ? v === 255 : [0, 85, 170, 255].includes(v))));
});

test("password strength and generator", () => {
  assert.equal(passwordStrength("").score, 0);
  assert.ok(passwordStrength("password").score <= 1);
  assert.ok(passwordStrength("abc").score < passwordStrength("Xk9#mQ2$vL7!pR4&").score);
  assert.ok(passwordStrength("Xk9#mQ2$vL7!pR4&").score >= 3);
  const pw = generatePassword(20);
  assert.equal(pw.length, 20);
  assert.notEqual(pw, generatePassword(20));
});
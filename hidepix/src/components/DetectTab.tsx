import { useState } from "react";
import { Analysis, analyzePicture } from "../utils/analyze";
import { Dropzone, LoadedImage } from "./Dropzone";
import { HashLine } from "./Hashline";

function Panel({ title, tone, children }: { title: string; tone?: "purple"; children: React.ReactNode }) {
  const style = tone === "purple" ? "border-purple-500/30 bg-purple-500/5" : "border-white/10 bg-zinc-950/40";
  return (
    <div role="status" className={`rounded-xl border p-4 ${style}`}>
      <div className="mb-1.5 text-sm font-medium text-zinc-100">{title}</div>
      <div className="text-xs leading-relaxed text-zinc-400">{children}</div>
    </div>
  );
}

export function DetectTab() {
  const [img, setImg] = useState<LoadedImage | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Analysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastBits, setLastBits] = useState(false);

  const reset = () => { setResult(null); setError(null); setLastBits(false); };

  const run = async () => {
    setBusy(true); reset();
    await new Promise((r) => setTimeout(r, 30)); // let "Analyzing…" show first
    try {
      setResult(await analyzePicture(img!.url));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't analyze this picture.");
    }
    setBusy(false);
  };

  const sig = result?.signature;
  const chi = result?.chi;
  return (
    <>
      <p className="text-sm text-zinc-400">Check a picture for signs of hidden data. Nothing is changed or uploaded.</p>
      <Dropzone image={img} onImage={(i) => { setImg(i); reset(); }} onClear={() => { setImg(null); reset(); }} label="Drop a picture to inspect" />
      {img && <HashLine url={img.url} label="SHA-256 of this file (handy for looking it up in tools like VirusTotal)" />}
      <button
        type="button"
        onClick={run}
        disabled={!img || busy}
        className="w-full rounded-xl bg-purple-500 py-3.5 text-sm font-semibold text-zinc-950 transition hover:bg-purple-400 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
      >
        {busy ? "Analyzing…" : "Analyze picture"}
      </button>
      {error && <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-3 text-sm text-red-200">{error}</div>}

      {result && sig !== undefined && chi && (
        <div className="space-y-3">
          <Panel title={sig ? "Hidepix signature found" : "No Hidepix signature"} tone={sig ? "purple" : undefined}>
            {sig
              ? `This picture holds a Hidepix message of about ${sig.length.toLocaleString()} bytes (${sig.encrypted ? "password protected" : "no password"}, ${sig.scattered ? "scattered" : "stored in order"}, ${sig.compressed ? "compressed" : "not compressed"}, ${sig.matching ? "LSB matching" : "LSB replacement"}). Open the Reveal tab to read it.`
              : "The first pixels don't contain a Hidepix header. Data hidden by other tools would not show up here."}
          </Panel>

          <Panel title={chi.p > 0.05 ? "Possible LSB embedding across the picture" : "No sign of heavy LSB embedding"}>
            Chi-square test: p = {chi.p.toFixed(3)} (χ² = {chi.chi2.toFixed(0)}, {chi.df} value pairs). It only catches pictures filled close to capacity with plain LSB replacement. Small messages, and LSB matching, usually pass unnoticed.
          </Panel>

          <div>
            <div className="mb-2 flex items-center justify-between text-xs text-zinc-400">
              <span>{lastBits ? "Last-bit view" : "Original"}</span>
              <button type="button" onClick={() => setLastBits((v) => !v)} className="rounded-md border border-purple-500/40 px-2 py-1 text-purple-200 hover:bg-purple-500/10">
                {lastBits ? "Show original" : "Show last-bit view"}
              </button>
            </div>
            <img src={lastBits ? result.planeUrl : img!.url} alt={lastBits ? "Last bit of every colour value" : "Original picture"} className="mx-auto max-h-72 rounded-lg object-contain" />
            <p className="mt-2 text-xs text-zinc-500">The last-bit view shows only the last bit of every colour value. In a flat-coloured picture it looks smooth, and hidden data shows up as a patch of noise. Photos are noisy anyway, so it works best on graphics.</p>
          </div>

          <p className="text-xs text-zinc-500">No tool can prove a picture is clean. These checks are hints, not verdicts.</p>
        </div>
      )}
    </>
  );
}
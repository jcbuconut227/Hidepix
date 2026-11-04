import { useState } from "react";
import { Analysis, analyzePicture } from "../utils/analyze";
import { Dropzone, LoadedImage } from "./Dropzone";
import { HashLine } from "./HashLine";

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
      <Dropzone image={img} onImage={(i) => { setImg(i); reset(); }} onClear={() => { setImg(null); reset(); }} label="Drop a picture to inspect" />
      {img && <HashLine url={img.url} label="SHA-256 fingerprint" />}
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
              ? `A Hidepix message of about ${sig.length.toLocaleString()} bytes (${sig.encrypted ? "password protected" : "no password"}, ${sig.scattered ? "scattered" : "stored in order"}, ${sig.compressed ? "compressed" : "not compressed"}, ${sig.matching ? "LSB matching" : "LSB replacement"}). Read it in the Reveal tab.`
              : "Messages hidden by other tools won't show up here."}
          </Panel>

          <Panel title={chi.p > 0.05 ? "Possible LSB embedding across the picture" : "No sign of heavy LSB embedding"}>
            p = {chi.p.toFixed(3)}. This test only catches pictures filled close to capacity.
          </Panel>

          <div>
            <div className="mb-2 flex items-center justify-between text-xs text-zinc-400">
              <span>{lastBits ? "Last-bit view" : "Original"}</span>
              <button type="button" onClick={() => setLastBits((v) => !v)} className="rounded-md border border-purple-500/40 px-2 py-1 text-purple-200 hover:bg-purple-500/10">
                {lastBits ? "Show original" : "Show last-bit view"}
              </button>
            </div>
            <img src={lastBits ? result.planeUrl : img!.url} alt={lastBits ? "Last bit of every colour value" : "Original picture"} className="mx-auto max-h-72 rounded-lg object-contain" />
            <p className="mt-2 text-xs text-zinc-500">Shows only the last bit of each colour value. Hidden data appears as noise, mostly in flat-coloured pictures.</p>
          </div>

          <p className="text-xs text-zinc-500">Hints, not proof.</p>
        </div>
      )}
    </>
  );
}
import { useEffect, useState } from "react";
import { buildDiff } from "../utils/analyze";

type Diff = { url: string; changed: number; total: number; maxChange: number };

/** Collapsed by default, so the (heavy) comparison is only built when someone opens it. */
export function ChangesPanel({ beforeUrl, afterUrl }: { beforeUrl: string; afterUrl: string }) {
  const [open, setOpen] = useState(false);
  return (
    <details className="mt-3 rounded-lg border border-white/10 p-3" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="cursor-pointer text-xs font-medium text-zinc-300">See what changed (before / after)</summary>
      {open && <CompareSlider beforeUrl={beforeUrl} afterUrl={afterUrl} />}
    </details>
  );
}

function CompareSlider({ beforeUrl, afterUrl }: { beforeUrl: string; afterUrl: string }) {
  const [diff, setDiff] = useState<Diff | null>(null);
  const [failed, setFailed] = useState(false);
  const [pos, setPos] = useState(50);
  const [showDiff, setShowDiff] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setDiff(null); setFailed(false); setShowDiff(false);
    buildDiff(beforeUrl, afterUrl)
      .then((d) => { if (!cancelled) setDiff(d); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [beforeUrl, afterUrl]);

  const right = showDiff && diff ? diff.url : afterUrl;
  return (
    <div className="mt-3">
      <div className="relative select-none overflow-hidden rounded-lg">
        <img src={right} alt={showDiff ? "Changed pixels highlighted" : "After"} className="block w-full" draggable={false} />
        <img src={beforeUrl} alt="Before" className="absolute inset-0 block h-full w-full" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }} draggable={false} />
        <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-white/80" style={{ left: `${pos}%` }} />
        <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">Before</span>
        <span className="absolute right-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">{showDiff ? "Changes" : "After"}</span>
      </div>
      <input type="range" min={0} max={100} value={pos} onChange={(e) => setPos(Number(e.target.value))} aria-label="Compare before and after" className="mt-2 w-full accent-purple-500" />
      <label className="mt-1 flex cursor-pointer items-center gap-2 text-xs text-zinc-300">
        <input type="checkbox" checked={showDiff} disabled={!diff} onChange={(e) => setShowDiff(e.target.checked)} className="h-4 w-4 accent-purple-500" />
        Highlight the changed pixels
      </label>
      <p className="mt-2 text-xs text-zinc-500" aria-live="polite">
        {failed
          ? "Couldn't build the comparison on this device."
          : diff
            ? `${diff.changed.toLocaleString()} of ${diff.total.toLocaleString()} pixels changed (${((diff.changed / diff.total) * 100).toFixed(3)}%), none by more than ${diff.maxChange}.`
            : "Comparing…"}
      </p>
    </div>
  );
}
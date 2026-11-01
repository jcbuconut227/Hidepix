import { useEffect, useState } from "react";
import { sha256Hex } from "../utils/analyze";

/** Shows the SHA-256 fingerprint of a picture, with a Copy button. */
export function HashLine({ url, label }: { url: string; label: string }) {
  const [hash, setHash] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setHash(null);
    fetch(url).then((r) => r.blob()).then(sha256Hex)
      .then((h) => { if (!cancelled) setHash(h); })
      .catch(() => { if (!cancelled) setHash(""); });
    return () => { cancelled = true; };
  }, [url]);

  if (hash === "") return null; // hashing is not possible here (for example, a page that is not https)
  return (
    <div className="mt-3 rounded-lg bg-zinc-950/60 p-3 text-xs">
      <div className="mb-1.5 text-zinc-400">{label}</div>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 break-all font-mono text-zinc-200">{hash ?? "Calculating…"}</code>
        {hash && (
          <button
            type="button"
            onClick={() => { navigator.clipboard?.writeText(hash); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            className="shrink-0 rounded-md border border-purple-500/40 px-2 py-1 text-purple-200 hover:bg-purple-500/10"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        )}
      </div>
    </div>
  );
}
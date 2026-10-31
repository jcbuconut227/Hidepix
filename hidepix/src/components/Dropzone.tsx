import { useRef, useState } from "react";

export type LoadedImage = { name: string; size: number; url: string; width: number; height: number; type: string; note?: string };

export function Dropzone({ image, onImage, onClear, label, prepare }: { image: LoadedImage | null; onImage: (img: LoadedImage) => void; onClear: () => void; label: string; prepare?: (file: File) => Promise<{ file: File; note?: string }> }) {
  const [drag, setDrag] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // If a prepare function is given (cover picture), the file is converted/shrunk first.
  const load = async (original: File) => {
    setError(null);
    let file: File = original;
    let note: string | undefined;
    if (prepare) {
      setWorking(true);
      try {
        ({ file, note } = await prepare(original));
      } catch (e) {
        setWorking(false);
        setError(e instanceof Error ? e.message : "Couldn't read this picture.");
        return;
      }
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { setWorking(false); onImage({ name: file.name, size: file.size, url, width: img.width, height: img.height, type: file.type, note }); };
    img.onerror = () => { setWorking(false); setError("Couldn't read this picture."); };
    img.src = url;
  };

  if (image) {
    return (
      <div className="dropzone-preview relative overflow-hidden rounded-xl border border-white/10 bg-zinc-950">
        <img src={image.url} alt={image.name} className="mx-auto max-h-72 object-contain" />
        <div className="dropzone-meta flex items-center justify-between gap-3 border-t px-4 py-2.5 text-xs">
          <div className="min-w-0">
            <div className="dropzone-name truncate font-medium">{image.name}</div>
            <div className="dropzone-detail font-mono">{image.width}×{image.height} · {(image.size / 1024).toFixed(1)} KB · {image.type.replace("image/", "").toUpperCase()}</div>
          </div>
          <button onClick={onClear} className="dropzone-replace shrink-0 rounded-md px-2.5 py-1 transition">Replace</button>
        </div>
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) load(f); }}
      onClick={() => inputRef.current?.click()}
      className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-14 text-center transition ${drag ? "border-purple-400 bg-purple-500/10" : "border-white/10 bg-zinc-950/40 hover:border-white/20 hover:bg-zinc-950/70"}`}
    >
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && load(e.target.files[0])} />
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-800 text-purple-400">
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" /></svg>
      </div>
      <p className="text-sm font-medium text-zinc-200">{working ? "Preparing your picture…" : label}</p>
      <p className="mt-1 text-xs text-zinc-500">Drag & drop or click to browse{prepare ? " · any picture works, it's converted to PNG automatically" : " · PNG recommended"}</p>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}
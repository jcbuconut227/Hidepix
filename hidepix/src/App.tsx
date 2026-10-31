import { useEffect, useMemo, useState } from "react";
import { Dropzone, LoadedImage } from "./components/Dropzone";
import logo from "./logo/hidepix.png";
import { MAX_PNG_MB, prepareCover } from "./utils/Image";
import { inAppBrowser, saveImage } from "./utils/Save";
import { StegoError, capacityBytes, hideMessage, revealMessage } from "./utils/stego";

type Mode = "hide" | "reveal";
type Theme = "dark" | "light";
const MAX_REVEAL_MB = 40; // a Hidepix PNG can be much bigger than the original photo

export default function App() {
  const [mode, setMode] = useState<Mode>("hide");
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const saved = window.localStorage.getItem("hidepix-theme");
      if (saved === "light" || saved === "dark") return saved;
      return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    } catch {
      return "dark";
    }
  });

  // Hide tab state
  const [cover, setCover] = useState<LoadedImage | null>(null);
  const [message, setMessage] = useState("");
  const [hidePw, setHidePw] = useState("");
  const [hideResult, setHideResult] = useState<string | null>(null);
  const [hideError, setHideError] = useState<string | null>(null);

  // Reveal tab state
  const [stego, setStego] = useState<LoadedImage | null>(null);
  const [revealPw, setRevealPw] = useState("");
  const [revealResult, setRevealResult] = useState<string | null>(null);
  const [revealError, setRevealError] = useState<string | null>(null);

  // Advanced
  const [advanced, setAdvanced] = useState(false);
  const [method, setMethod] = useState("lsb");
  const [compress, setCompress] = useState(true);
  const [scatter, setScatter] = useState(true);
  const [busy, setBusy] = useState(false);
  const [hideFile, setHideFile] = useState<File | null>(null); // the finished PNG, ready for the share sheet

  useEffect(() => {
    document.documentElement.style.colorScheme = theme;
    try {
      window.localStorage.setItem("hidepix-theme", theme);
    } catch {
      // The theme still works when storage is unavailable.
    }
  }, [theme]);

  const msgSize = useMemo(() => new TextEncoder().encode(message).length, [message]);
  const maxChars = useMemo(() => (cover ? capacityBytes(cover.width, cover.height, hidePw.length > 0) : 0), [cover, hidePw]);
  const tooLong = cover !== null && msgSize > maxChars;
  const tooBig = (img: LoadedImage | null, limitMb: number) => !!img && img.size > limitMb * 1024 * 1024;

  const runHide = async () => {
    setBusy(true); setHideError(null); setHideResult(null); setHideFile(null);
    const minTime = new Promise((r) => setTimeout(r, 700)); // keeps the animation visible on small images
    await new Promise((r) => setTimeout(r, 30)); // let the loading state paint before the heavy work starts
    try {
      const url = await hideMessage(cover!.url, message, { method: method === "lsbm" ? "lsbm" : "lsb", compress, scatter, password: hidePw });
      const file = new File([await (await fetch(url)).blob()], "hidden-message.png", { type: "image/png" });
      await minTime;
      setHideResult(url);
      setHideFile(file);
      setCover(null); // empties the picture slot
      setMessage(""); // clears the message box
      setHidePw(""); // clears the password
    } catch (e) {
      setHideError(e instanceof StegoError ? e.message : "Something went wrong while hiding the message.");
    }
    setBusy(false);
  };

  const runReveal = async () => {
    setBusy(true); setRevealError(null); setRevealResult(null);
    const minTime = new Promise((r) => setTimeout(r, 700));
    await new Promise((r) => setTimeout(r, 30));
    try {
      const text = await revealMessage(stego!.url, revealPw);
      await minTime;
      setRevealResult(text);
      setStego(null); // empties the picture slot
      setRevealPw(""); // clears the password
    } catch (e) {
      setRevealError(e instanceof StegoError ? e.message : "Couldn't read this picture.");
    }
    setBusy(false);
  };

  const hideReady = !!cover && !tooBig(cover, MAX_PNG_MB) && message.trim().length > 0 && !tooLong;
  const revealReady = !!stego && !tooBig(stego, MAX_REVEAL_MB);

  return (
    <div className="app-shell min-h-screen" data-theme={theme}>
      <div className="relative z-10 mx-auto max-w-xl px-5 py-7 sm:py-11">
        <header className="mb-9 flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <img src={logo} alt="Hidepix" className="h-10 w-10 shrink-0 rounded-xl object-contain" />
            <div>
              <div className="text-sm font-semibold tracking-tight text-white">Hidepix</div>
              <div className="brand-caption">PRIVATE IMAGE TOOL</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")}
            className="theme-toggle"
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          >
            {theme === "dark" ? (
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" /></svg>
            ) : (
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z" /></svg>
            )}
            <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>
          </button>
        </header>

        <div className="mb-7 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-white">Hide a message in a picture</h1>
          <p className="mt-1.5 text-sm text-zinc-500">Everything runs in your browser. Nothing is uploaded.</p>
        </div>

        <div className="mb-6 grid grid-cols-2 rounded-xl border border-white/10 bg-zinc-900/70 p-1">
          {(["hide", "reveal"] as Mode[]).map((m) => (
            <button key={m} onClick={() => setMode(m)} className={`rounded-lg py-2.5 text-sm font-medium transition ${mode === m ? "bg-purple-500 text-zinc-950 shadow" : "text-zinc-400 hover:text-white"}`}>
              {m === "hide" ? "Hide a message" : "Reveal a message"}
            </button>
          ))}
        </div>

        <div className="flow-panel space-y-4 rounded-2xl border border-white/10 bg-zinc-900/60 p-5 backdrop-blur sm:p-6">
          {mode === "hide" ? (
            <>
              <Step n={1} title="Choose a picture" />
              <Dropzone image={cover} onImage={(i) => { setCover(i); setHideResult(null); }} onClear={() => { setCover(null); setHideResult(null); }} label="Drop a picture here" prepare={prepareCover} />
              <ImageNotices img={cover} />

              <Step n={2} title="Write your secret message" />
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                placeholder="Type something only the right person should read…"
                className={`w-full resize-none rounded-xl border bg-zinc-950/60 p-3.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 ${tooLong ? "border-red-500/50 focus:ring-red-500/20" : "border-white/10 focus:border-purple-500/50 focus:ring-purple-500/20"}`}
              />
              <div className="-mt-2 flex items-center justify-between text-xs">
                <span className={tooLong ? "text-red-400" : "text-zinc-500"}>
                  {tooLong ? "Message is too long for this picture. Shorten it or use a bigger picture." : cover ? "Fits comfortably" : "Add a picture to see how much fits"}
                </span>
                <span className={`font-mono ${tooLong ? "text-red-400" : "text-zinc-500"}`}>
                  {msgSize.toLocaleString()} / {cover ? maxChars.toLocaleString() : "—"} bytes
                </span>
              </div>

              <Step n={3} title="Password" optional />
              <PasswordInput value={hidePw} onChange={setHidePw} placeholder="Optional" />
              <p className="-mt-2 text-xs text-zinc-500">If set, the message is encrypted with this password before it's hidden. Without it, anyone with the right tool can read it.</p>

              <Advanced open={advanced} toggle={() => setAdvanced((a) => !a)} method={method} setMethod={setMethod} compress={compress} setCompress={setCompress} scatter={scatter} setScatter={setScatter} />

              <ActionButton onClick={runHide} disabled={!hideReady || busy} loading={busy}>{busy ? "Hiding…" : "Hide message"}</ActionButton>
              {hideError && <ErrorBox>{hideError}</ErrorBox>}

              {hideResult && (
                <ResultBox title="Done! Your picture is ready.">
                  <img src={hideResult} alt="Picture with the hidden message" className="mx-auto max-h-72 rounded-lg object-contain" />
                  <button type="button" onClick={() => hideFile && saveImage(hideFile, hideResult)} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-purple-500 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-purple-400">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12M6 11l6 6 6-6M4 21h16" /></svg>
                    Save / share picture (PNG)
                  </button>
                  <a href={hideResult} download="hidden-message.png" className="mt-2 block text-center text-xs text-purple-300 underline">Or download directly</a>
                  <p className="mt-2 text-center text-xs text-zinc-400">Send this as a <b className="text-zinc-200">file</b>, not as a photo. Messaging apps compress photos and will destroy the hidden message.</p>
                  <p className="mt-1 text-center text-xs text-zinc-500">On a phone and nothing saves? Press and hold the picture above and choose Save image or Add to Photos.</p>
                  {inAppBrowser() && <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-center text-xs text-amber-200">This looks like an in-app browser (Messenger, Instagram, etc.), which often blocks downloads. Open this page in Chrome or Safari instead.</p>}
                </ResultBox>
              )}
            </>
          ) : (
            <>
              <Step n={1} title="Choose the picture with the hidden message" />
              <Dropzone image={stego} onImage={(i) => { setStego(i); setRevealResult(null); setRevealError(null); }} onClear={() => { setStego(null); setRevealResult(null); setRevealError(null); }} label="Drop the picture here" />
              <ImageNotices img={stego} revealMode />

              <Step n={2} title="Password" optional />
              <PasswordInput value={revealPw} onChange={setRevealPw} placeholder="Leave empty if no password was set" />
              <p className="text-xs text-zinc-500">Method, compression and scatter are read from the picture automatically.</p>

              <ActionButton onClick={runReveal} disabled={!revealReady || busy} loading={busy}>{busy ? "Revealing…" : "Reveal message"}</ActionButton>
              {revealError && <ErrorBox>{revealError}</ErrorBox>}

              {revealResult && (
                <ResultBox title="Message found">
                  <p className="whitespace-pre-wrap break-words rounded-lg bg-zinc-950/60 p-3 text-sm text-zinc-100">{revealResult}</p>
                  <button onClick={() => navigator.clipboard?.writeText(revealResult)} className="mt-3 w-full rounded-lg border border-purple-500/40 py-2.5 text-sm font-medium text-purple-200 hover:bg-purple-500/10">Copy message</button>
                </ResultBox>
              )}
            </>
          )}
        </div>

        <p className="mt-6 text-center text-[11px] text-zinc-600">Any picture works: it's converted to PNG and resized automatically when needed</p>
      </div>
    </div>
  );
}

/* ---------- small pieces ---------- */

function ImageNotices({ img, revealMode }: { img: LoadedImage | null; revealMode?: boolean }) {
  if (!img) return null;
  const jpg = /jpe?g/i.test(img.type);
  const limitMb = revealMode ? MAX_REVEAL_MB : MAX_PNG_MB;
  const big = img.size > limitMb * 1024 * 1024;
  if (big) return <ErrorBox>This picture is {(img.size / 1048576).toFixed(1)} MB. The limit is {limitMb} MB — please pick a smaller one.</ErrorBox>;
  if (img.note) return <div className="rounded-lg border border-purple-500/25 bg-purple-500/10 px-3.5 py-2.5 text-xs text-purple-200">{img.note}</div>;
  if (jpg) return (
    <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-200">
      {revealMode
        ? "This is a JPG. If the original hidden picture was a PNG and got converted, the message is probably gone."
        : "This is a JPG. It will be converted to PNG so the message survives — the download will be a PNG file."}
    </div>
  );
  return null;
}

function PasswordInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const [show, setShow] = useState(false);
  // A real type="password" field makes browsers offer to save the password.
  // Where the browser supports it, we use a normal text field and hide the characters with CSS instead (.pw-mask).
  const canMask = typeof CSS !== "undefined" && CSS.supports("-webkit-text-security", "disc");
  return (
    <div className="relative">
      <input
        type={show || canMask ? "text" : "password"}
        autoComplete={canMask ? "off" : "new-password"}
        name="hidepix-key"
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        data-lpignore="true"
        data-1p-ignore="true"
        data-bwignore="true"
        data-form-type="other"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full rounded-xl border border-white/10 bg-zinc-950/60 py-3 pl-3.5 pr-16 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-purple-500/50 focus:outline-none focus:ring-2 focus:ring-purple-500/20 ${!show && canMask ? "pw-mask" : ""}`}
      />
      <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-xs text-zinc-400 hover:bg-white/5">{show ? "Hide" : "Show"}</button>
    </div>
  );
}

function Advanced(p: { open: boolean; toggle: () => void; method: string; setMethod: (v: string) => void; compress: boolean; setCompress: (v: boolean) => void; scatter: boolean; setScatter: (v: boolean) => void; revealMode?: boolean }) {
  return (
    <div className="rounded-xl border border-white/5 bg-zinc-950/40">
      <button onClick={p.toggle} className="flex w-full items-center justify-between px-4 py-3 text-sm text-zinc-400 hover:text-zinc-200">
        <span>Advanced options</span>
        <svg className={`h-4 w-4 transition ${p.open ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {p.open && (
        <div className="space-y-4 border-t border-white/5 px-4 py-4">
          {p.revealMode && <p className="text-xs text-zinc-500">These must match the settings used when the message was hidden.</p>}
          <div>
            <div className="mb-1.5 text-xs text-zinc-400">Method</div>
            <select value={p.method} onChange={(e) => p.setMethod(e.target.value)} className="w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 focus:outline-none">
              <option value="lsb">LSB replacement (default)</option>
              <option value="lsbm">LSB matching (±1)</option>
              <option value="dct" disabled>DCT (JPEG-safe) — coming soon</option>
            </select>
          </div>
          <Check checked={p.compress} onChange={p.setCompress} label="Compress message first" desc="Fits more text in the same picture." />
          <Check checked={p.scatter} onChange={p.setScatter} label="Scatter data randomly across the picture" desc="Uses the password as a seed. Harder to detect." />
        </div>
      )}
    </div>
  );
}

function ActionButton({ children, loading, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) {
  return (
    <button {...rest} className={`btn-shimmer relative w-full overflow-hidden rounded-xl bg-purple-500 py-3.5 text-sm font-semibold text-zinc-950 shadow-lg shadow-purple-500/20 transition hover:bg-purple-400 disabled:cursor-not-allowed disabled:shadow-none ${loading ? "is-loading disabled:bg-purple-500" : "disabled:bg-zinc-800 disabled:text-zinc-500"}`}>
      <span className="relative z-10 inline-flex items-center justify-center gap-2">
        {loading && (
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
            <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
        )}
        {children}
      </span>
    </button>
  );
}

function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-3 text-sm text-red-200">
      <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
      <span>{children}</span>
    </div>
  );
}

function ResultBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-purple-500/30 bg-purple-500/5 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-purple-300">
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
        {title}
      </div>
      {children}
    </div>
  );
}

function Step({ n, title, optional }: { n: number; title: string; optional?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 pt-1">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-purple-500/15 text-xs font-semibold text-purple-300">{n}</span>
      <span className="text-sm font-medium text-zinc-100">{title}</span>
      {optional && <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] uppercase tracking-wider text-zinc-500">optional</span>}
    </div>
  );
}

function Check({ checked, onChange, label, desc }: { checked: boolean; onChange: (v: boolean) => void; label: string; desc: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 accent-purple-500" />
      <span><span className="block text-sm text-zinc-200">{label}</span><span className="block text-xs text-zinc-500">{desc}</span></span>
    </label>
  );
}
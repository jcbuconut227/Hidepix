// A picture value written in binary, with the last bit (the one we change) marked.
function Bits({ bits, mark }: { bits: string; mark?: boolean }) {
  return (
    <span className="font-mono text-sm tracking-wider text-zinc-200">
      {bits.slice(0, 7)}
      <span className={mark ? "rounded bg-purple-500/25 px-0.5 text-purple-300" : "px-0.5"}>{bits[7]}</span>
    </span>
  );
}

export function HowItWorks() {
  return (
    <details className="mt-6 rounded-2xl border border-white/10 bg-zinc-900/60 p-5 backdrop-blur">
      <summary className="cursor-pointer text-sm font-medium text-zinc-100">How it works</summary>
      <div className="mt-4 space-y-4 text-xs leading-relaxed text-zinc-400">
        <p>A picture is a grid of pixels. Each pixel has a red, green and blue value from 0 to 255, stored as 8 bits. The last bit is worth only 1, so changing it is invisible.</p>
        <div className="space-y-1.5 rounded-lg bg-zinc-950/60 p-3">
          <div>Red value 200 = <Bits bits="11001000" mark /></div>
          <div>Hide the bit 1, so only the last bit changes</div>
          <div>Red value 201 = <Bits bits="11001001" mark /></div>
        </div>
        <p>Hidepix does this for your whole message: text becomes bytes, then is optionally compressed and encrypted with your password, gets a small header (a marker, the settings, the length and a checksum), and is written into the last bits of the picture.</p>
        <ul className="list-disc space-y-1.5 pl-4">
          <li><b className="text-zinc-200">Password:</b> encrypts the message (AES-GCM). This is the real protection.</li>
          <li><b className="text-zinc-200">Scatter:</b> spreads the bits across the picture, which hides where they are. It does not protect the content.</li>
          <li><b className="text-zinc-200">Checksum:</b> lets Reveal tell "wrong password or edited picture" from a picture with no message.</li>
          <li><b className="text-zinc-200">Limits:</b> social media and messaging apps recompress photos and destroy the message. Send the PNG as a file.</li>
          <li><b className="text-zinc-200">Privacy:</b> everything runs in your browser. Nothing is uploaded.</li>
        </ul>
      </div>
    </details>
  );
}
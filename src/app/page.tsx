import TranscriberPanel from "@/components/transcriber-panel";

const FACTS = [
  { label: "Runs on", value: "Your device", tone: "bg-volt" },
  { label: "Audio uploaded", value: "None", tone: "bg-aqua" },
  { label: "API keys", value: "Zero", tone: "bg-punch" },
  { label: "Exports", value: "TXT / SRT / VTT", tone: "bg-mint" },
];

export default function Home() {
  return (
    <div className="mx-auto w-full max-w-7xl px-5 py-10 md:px-8 md:py-14">
      <header className="mx-auto max-w-3xl">
        <span className="nb nb-shadow-sm inline-flex items-center gap-2 bg-mint px-3 py-1.5">
          <span aria-hidden className="h-2.5 w-2.5 border-2 border-ink bg-ink" />
          <span className="text-[10px] font-extrabold uppercase tracking-[0.16em]">
            On-device speech recognition
          </span>
        </span>

        <h1 className="mt-5 text-5xl font-black uppercase leading-[0.92] tracking-[-0.03em] md:text-7xl">
          ASR
          <br />
          <span className="mt-1 inline-block border-[3px] border-ink bg-volt px-3 py-1 shadow-[6px_6px_0_var(--color-ink)]">
            Transcriber
          </span>
        </h1>
      </header>

      <ul className="mx-auto mt-8 grid max-w-3xl grid-cols-2 gap-3 md:grid-cols-4">
        {FACTS.map((fact) => (
          <li key={fact.label} className={`nb nb-shadow-sm ${fact.tone} px-3 py-3`}>
            <span className="block text-[9px] font-extrabold uppercase tracking-[0.14em] opacity-70">
              {fact.label}
            </span>
            <span className="mt-1 block text-sm font-black uppercase leading-tight">
              {fact.value}
            </span>
          </li>
        ))}
      </ul>

      <main id="main" className="mt-10">
        <TranscriberPanel />
      </main>

      <footer className="mx-auto mt-14 max-w-3xl">
        <div className="nb nb-shadow">
          {/* Title bar, not a floating label — keeps every panel consistent. */}
          <h2 className="border-b-[3px] border-ink bg-tangerine px-5 py-2.5 text-[11px] font-extrabold uppercase tracking-[0.16em]">
            How it works
          </h2>
          <p className="px-6 py-5 text-sm font-medium leading-relaxed">
            Audio is decoded and resampled to 16 kHz mono with the Web Audio API,
            then passed to a Whisper ONNX model executed by Transformers.js in a
            dedicated Web Worker — on WebGPU where available, otherwise
            multi-threaded WASM. Weights download once from the Hugging Face CDN
            and are cached by the browser. Transcription itself is fully offline.
          </p>
        </div>
      </footer>
    </div>
  );
}

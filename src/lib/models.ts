export type ModelOption = {
  id: string;
  label: string;
  /** Approximate download size of the quantised weights. */
  size: string;
  /** English-only checkpoints reject `language` / `task` arguments. */
  multilingual: boolean;
  note: string;
};

export const MODELS: ModelOption[] = [
  {
    id: "Xenova/whisper-tiny.en",
    label: "Tiny · English",
    size: "~42 MB",
    multilingual: false,
    note: "Fastest. Best pick for clean English speech.",
  },
  {
    id: "Xenova/whisper-tiny",
    label: "Tiny · Multilingual",
    size: "~42 MB",
    multilingual: true,
    note: "Same speed, 99 languages, slightly lower accuracy.",
  },
  {
    id: "Xenova/whisper-base",
    label: "Base · Multilingual",
    size: "~78 MB",
    multilingual: true,
    note: "Balanced default — noticeably better on accents.",
  },
  {
    id: "Xenova/whisper-small",
    label: "Small · Multilingual",
    size: "~250 MB",
    multilingual: true,
    note: "Most accurate. Recommended only with WebGPU.",
  },
];

export const DEFAULT_MODEL_ID = "Xenova/whisper-base";

export function getModel(id: string): ModelOption {
  return MODELS.find((m) => m.id === id) ?? MODELS[0];
}

/**
 * Quantisation is int8 on both backends.
 *
 * WebGPU defaults to fp32 in Transformers.js, which for `base` means ~280 MB
 * instead of ~78 MB — a download that dwarfs the demo itself. int8 weights keep
 * the transfer honest against the sizes advertised above, and the accuracy
 * difference at these model sizes is not what limits the result.
 */
export const WEIGHT_DTYPE = "q8";

/** Curated subset of Whisper's languages — the long tail is rarely useful in a demo. */
export const LANGUAGES: { code: string; label: string }[] = [
  { code: "en", label: "English" },
  { code: "zh", label: "Chinese" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "pt", label: "Portuguese" },
  { code: "ru", label: "Russian" },
  { code: "it", label: "Italian" },
  { code: "hi", label: "Hindi" },
  { code: "ar", label: "Arabic" },
];

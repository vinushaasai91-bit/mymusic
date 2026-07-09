// ============================================================
// Lyrics Vault — OCR (Tesseract.js, runs entirely client-side)
// ============================================================
const OCR = (() => {
  async function run(fileOrUrl, onProgress) {
    const result = await Tesseract.recognize(fileOrUrl, "eng", {
      logger: (m) => {
        if (m.status && typeof m.progress === "number" && onProgress) {
          onProgress(m.status, Math.round(m.progress * 100));
        }
      }
    });
    return {
      text: result.data.text.trim(),
      confidence: Math.round(result.data.confidence)
    };
  }

  return { run };
})();

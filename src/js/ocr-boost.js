// ============================================================
// xSyna — OCR-Boost (Vorverarbeitung für die Kamera-Erkennung)
// ------------------------------------------------------------
// Läuft VOR extractFromOcr() und repariert typische Tesseract-
// Verwechslungen von Einheiten, damit Etiketten wie
//   „Wasser 1,5 I/1/L/|“   →   „Wasser 1,5 l“
//   „Nutella 450 9/4508“   →   „Nutella 450 g“
//   „750 m1/rnl“           →   „750 ml“
//   „1 k9“                 →   „1 kg“
// korrekt erkannt werden. Reine MHD-/Datum-Zeilen werden entfernt,
// damit sie nicht als Bestand landen.
// ============================================================
import { extractFromOcr as baseExtractFromOcr } from "./synaptic.js";

// Einheit „l“ wird von OCR gern als I, L, 1, | oder i gelesen –
// mit Dezimaltrenner („1,5“) ist Liter eindeutig.
function fixUnits(line) {
  let t = String(line || "");

  // ml als „m1“, „m|“, „mi“ oder „rnl“ („rn“ als „m“ verlesen)
  t = t.replace(/(\d(?:[.,]\d+)?)\s*m\s*[1|iI]\s*$/u, "$1 ml");
  t = t.replace(/(\d(?:[.,]\d+)?)\s*rnl\s*$/u, "$1 ml");

  // kg als „k9“, „k g“, „ko“
  t = t.replace(/(\d(?:[.,]\d+)?)\s*k\s*[9go]\s*$/u, "$1 kg");

  // l als I, L, 1, |, i (mit Dezimaltrenner eindeutig Liter)
  t = t.replace(/(\d[.,]\d+)\s*[I1|iL]\s*$/u, "$1 l");
  // l als I, 1, | (mit Leerzeichen vor der Einheit)
  t = t.replace(/(\d)\s+[I|1]\s*$/u, "$1 l");
  // „1 L“ / „2L“ → „1 l“ (EL/TL bleiben unberührt: „2 EL“ hat ein E davor)
  t = t.replace(/(\d)\s*L\s*$/u, "$1 l");

  // g als „9“/„8“ am Zeilenende: „4509“, „450 9“, „4508“
  t = t.replace(/(^|\s)(\d{2,4})\s*[98]\s*$/u, "$1$2 g");
  // g als „q“ verlesen
  t = t.replace(/(\d(?:[.,]\d+)?)\s*q\s*$/u, "$1 g");

  return t.replace(/\s+/g, " ").trim();
}

// Klare MHD-/Haltbarkeits-Zeilen verwerfen (kein Produkt, kein Bestand).
const NOISE_LINE_RE = /^(?:mhd|mindestens\s+haltbar|haltbar\s+bis|zu\s+verbrauchen\s+bis|abgelaufen\s+am|haltbarkeitsdatum)\b.*$/i;

export function preprocessOcrText(raw) {
  return String(raw || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 2 && !NOISE_LINE_RE.test(line))
    .map(fixUnits)
    .filter(Boolean)
    .join("\n");
}

// Gleiche Signatur wie synaptic.js, aber mit Vorverarbeitung davor.
export function extractFromOcr(raw, vocab) {
  return baseExtractFromOcr(preprocessOcrText(raw), vocab);
}

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
import { extractFromOcr as baseExtractFromOcr, normalize } from "./synaptic.js";

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

// Etikett-Beschriftungen vor der Mengenangabe entfernen:
// "Nettofüllmenge 1,5 l" / "Inhalt: 450 g" / "Abtropfgewicht 400 g"
// werden zu reinen Mengenzeilen, damit die Menge dem Produkt darüber
// zugeordnet wird und kein Pseudo-Artikel "Nettofüllmenge" entsteht.
const LABEL_NOISE_PREFIX = /^(?:netto[\s-]*(?:f\u00fcllmenge|fullmenge|inhalt)?|f\u00fcllmenge|fullmenge|inhalt|abtropfgewicht)\s*:?\s*/i;

function stripLabelNoise(line) {
  return String(line || "").replace(LABEL_NOISE_PREFIX, "").trim();
}

export function preprocessOcrText(raw) {
  return String(raw || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 2 && !NOISE_LINE_RE.test(line))
    .map(stripLabelNoise)
    .map(fixUnits)
    .filter(Boolean)
    .join("\n");
}

// Standardmengen je Einheit + Sonderfaelle (lokale "Mini-LLM"-Heuristik),
// wenn die OCR ein Etikett erkennt, aber kein Mass lesen konnte.
const ESTIMATED_UNIT = {
  l: 1, ml: 500, g: 500, kg: 1, lb: 1,
  "St\u00fcck": 1, Packung: 1, Pck: 1, Dose: 1, Bund: 1, Prise: 1,
  EL: 1, TL: 1, Tasse: 1, Scheibe: 1, Flasche: 1, Glas: 1,
  Zehe: 1, Beutel: 1, Becher: 1, Rolle: 1, Zweig: 1, Blatt: 1,
  Kopf: 1, Spritzer: 1, Schuss: 1, Stange: 1, "D\u00f6schen": 1,
  Portion: 1, Schale: 1, "T\u00fcte": 1, "P\u00e4ckchen": 1, "Fl\u00e4schchen": 1, Tube: 1, "W\u00fcrfel": 1,
};

function estimateQuantity(name, unit) {
  const u = unit || "";
  const n = normalize(name);
  if (n === "eier") return { amount: 6, unit: "St\u00fcck", estimated: true };
  if (n === "butter" && (u === "g" || u === "")) return { amount: 250, unit: "g", estimated: true };
  if (n === "sahne" && (u === "ml" || u === "")) return { amount: 200, unit: "ml", estimated: true };
  if (ESTIMATED_UNIT[u] != null) return { amount: ESTIMATED_UNIT[u], unit: u, estimated: true };
  return { amount: null, unit: u, estimated: false };
}

// Gleiche Signatur wie synaptic.js, aber mit Vorverarbeitung davor
// und anschliessender Mengen-Schaetzung ("estimated" = in der UI als ca.).
export function extractFromOcr(raw, vocab) {
  const items = baseExtractFromOcr(preprocessOcrText(raw), vocab);
  return items.map((it) => {
    if (!it.sure || it.amount != null) return it;
    const est = estimateQuantity(it.name, it.unit);
    if (est.amount == null) return it;
    return { ...it, amount: est.amount, unit: est.unit || it.unit, estimated: true };
  });
}

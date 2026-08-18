import { extractFromOcr } from "./src/js/ocr-boost.js";
// MARKER
import { extractFromOcr as baseExtract } from "./src/js/synaptic.js";

const cases = [
  ["Wasser 1,5 I", "Wasser 1,5 l"],
  ["Nutella 450 9", "Nutella 450 g"],
  ["Tomaten 500 g Zwiebeln 2 Stück", "mehrere Produkte in einer Zeile"],
  ["2x Tomaten 3x Zwiebeln", "x-Multiplikator"],
  ["Wasser", "Wasser ohne Menge (Schätzung)"],
  ["Nutella", "Nutella ohne Menge (Schätzung)"],
  ["2 Tomaten, 1 Gurke, 500 g Mehl", "Mischzeile"],
  ["Milch 1 L", "Milch 1 L"],
  ["750 m1", "750 ml OCR-Fehler"],
  ["1 k9", "1 kg OCR-Fehler"],
  ["Zucker 55 g", "Zucker 55 g (Zutat/Nährwert)"],
  ["Nuss-Nougat-Creme 450 g", "Alias"],
];

console.log("=== extractFromOcr (ocr-boost wrapper) ===");
for (const [input, label] of cases) {
  const out = extractFromOcr(input, []);
  console.log("\n[" + label + "] input:", JSON.stringify(input));
  console.log("  ->", JSON.stringify(out, null, 0));
}

console.log("\n=== base extractFromOcr (synaptic) ===");
for (const [input, label] of cases.slice(0, 6)) {
  const out = baseExtract(input, []);
  console.log("\n[" + label + "] input:", JSON.stringify(input));
  console.log("  ->", JSON.stringify(out, null, 0));
}

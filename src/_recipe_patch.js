import { readFileSync, writeFileSync } from "fs";

const f = new URL("./recipe-list.js", import.meta.url);
let src = readFileSync(f, "utf8");

const edits = [
  [
    '    source_url: rec.sourceUrl || "",',
    '    source: "web",\n    provider: rec.provider || "",\n    sourceUrl: rec.sourceUrl || "",',
  ],
  [
    '  const r = normalizeRecipe({ ...s.recipe, id: uuid(), created_at: new Date().toISOString() });',
    '  const r = normalizeRecipe({ ...s.recipe, id: uuid(), created_at: new Date().toISOString(), source: "synai" });',
  ],
  [
    'function renderRecipeCard(s) {',
    'function recipeSourceLabel(r) {\n  if (!r) return "";\n  if (r.provider) return r.provider;\n  if (r.source === "web") return "Website";\n  if (r.source === "jsonld") return "Website (JSON-LD)";\n  if (r.source === "website") return "Website";\n  if (r.source === "synai") return "SynAI (Synaptic FM)";\n  if (r.source === "shopping") return "Einkauf";\n  return "";\n}\n\nfunction recipeSourceChip(r) {\n  const label = recipeSourceLabel(r);\n  if (!label && !r.sourceUrl) return "";\n  const text = label || "Quelle";\n  if (r.sourceUrl) {\n    return `<a class="rec-chip muted" href="${escapeHtml(r.sourceUrl)}" target="_blank" rel="noopener" title="Original-Rezept öffnen" style="text-decoration:none;">${ICONS.link} ${escapeHtml(text)}</a>`;\n  }\n  return `<span class="rec-chip muted">${ICONS.link} ${escapeHtml(text)}</span>`;\n}\n\nfunction renderRecipeCard(s) {',
  ],
  [
    '        ${missingChips}${more}',
    '        ${missingChips}${more}\n        ${recipeSourceChip(r)}',
  ],
  [
    '        <p style="color: var(--text-muted); font-size: 0.8rem;">${servings} Portionen · ${(r.ingredients || []).length} Zutaten · ${r.is_public ? "öffentlich" : "privat"}</p>',
    '        <p style="color: var(--text-muted); font-size: 0.8rem;">${servings} Portionen · ${(r.ingredients || []).length} Zutaten · ${r.is_public ? "öffentlich" : "privat"}${recipeSourceLabel(r) ? ` · ${escapeHtml(recipeSourceLabel(r))}` : ""}</p>',
  ],
  [
    '    <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 20px; flex-wrap: wrap;">',
    '    ${r.sourceUrl ? `<p style="margin: 0 0 12px; font-size: 0.8rem;"><a href="${escapeHtml(r.sourceUrl)}" target="_blank" rel="noopener" style="color: var(--lime);">${ICONS.link} Original-Rezept öffnen ↗</a></p>` : ""}\n    <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 20px; flex-wrap: wrap;">',
  ],
];

for (const [old, neu] of edits) {
  if (!src.includes(old)) {
    console.error("NOT FOUND:", JSON.stringify(old).slice(0, 90));
    process.exitCode = 1;
    continue;
  }
  src = src.replace(old, neu);
}

writeFileSync(f, src);
console.log("patched recipe-list.js");

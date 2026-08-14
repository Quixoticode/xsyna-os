// ============================================================
// xSyna — Synaptic Foundation Model · Web-Rezepte & Generierung
// ------------------------------------------------------------
// Ergänzungsmodul zur lokalen Engine (src/js/synaptic.js):
//   • Web-Extraktion   – Rezepte von anderen Websites (JSON-LD/
//                        Schema.org bevorzugt, sonst DOM-Heuristik)
//   • Rezept-Generierung – konkrete Rezepte aus dem Bestand
//                        vorschlagen (Pfanne, Curry, Auflauf, …)
// Beides läuft vollständig lokal im Browser.
// ============================================================
import { normalize, parseLine, parseText, mergeItems, inventoryCoverage } from "./synaptic.js";

// ------------------------------------------------------------
// Web-Rezept-Extraktion
// ------------------------------------------------------------
function htmlDoc(html) {
  try {
    return new DOMParser().parseFromString(String(html || ""), "text/html");
  } catch {
    return null;
  }
}

function jsonLdRecipeNodes(doc) {
  const nodes = [];
  if (!doc) return nodes;
  doc.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
    let data;
    try {
      data = JSON.parse(s.textContent);
    } catch {
      return;
    }
    const walk = (v) => {
      if (!v || typeof v !== "object") return;
      if (Array.isArray(v)) {
        v.forEach(walk);
        return;
      }
      if (v["@graph"]) walk(v["@graph"]);
      const types = [].concat(v["@type"] || v.type || []);
      if (types.some((t) => String(t).toLowerCase() === "recipe")) nodes.push(v);
      if (v.mainEntity || v.itemListElement) walk(v.mainEntity || v.itemListElement);
    };
    walk(data);
  });
  return nodes;
}

function jsonLdInstructions(node) {
  const inst = node.recipeInstructions;
  const parts = [];
  const push = (t) => {
    const s = String(t || "").trim();
    if (s) parts.push(s);
  };
  const stepList = (arr) =>
    arr.forEach((x) => {
      if (typeof x === "string") push(x);
      else if (x) push(x.text || x.name);
    });
  if (Array.isArray(inst)) stepList(inst);
  else if (inst && typeof inst === "object") {
    if (Array.isArray(inst.itemListElement)) stepList(inst.itemListElement);
    else push(inst.text || inst.name);
  } else push(inst);
  return parts.join("\n");
}

function jsonLdServings(node) {
  const raw = node.recipeYield;
  if (raw == null) return 2;
  const vals = [].concat(raw);
  for (const v of vals) {
    const m = String(v).match(/(\d+(?:[.,]\d+)?)/);
    if (m) {
      const n = Math.round(Number(m[1].replace(",", ".")));
      if (n > 0 && n < 100) return n;
    }
  }
  return 2;
}

function jsonLdRecipe(node, url) {
  const ingredients = mergeItems(
    [].concat(node.recipeIngredient || node.ingredients || [])
      .map((raw) => parseLine(String(raw).trim()))
      .filter((i) => i.name && i.name.length >= 2)
  ).map((i) => ({ name: i.name, amount: i.amount, unit: i.unit, category: i.category }));
  return {
    title: String(node.name || "").trim().slice(0, 120) || "Unbenanntes Rezept",
    servings: jsonLdServings(node),
    ingredients,
    instructions: jsonLdInstructions(node).slice(0, 4000),
    tags: [].concat(node.recipeCategory || node.keywords || []).map((t) => String(t).trim()).filter(Boolean).slice(0, 6),
    source: "jsonld",
    sourceUrl: url || "",
  };
}

function heuristicRecipe(doc) {
  if (!doc || !doc.body) return null;
  const titleEl = doc.querySelector("h1");
  const title = (titleEl?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120) || "Unbenanntes Rezept";

  const ingLines = [];
  const selectors = [
    ".recipe-ingredients li",
    ".ingredients li",
    ".ingredients-list li",
    "[class*='ingredient'] li",
    "[class*='zutat'] li",
    "ul[class*='ingredient'] li",
    "ul[class*='zutaten'] li",
  ];
  doc.querySelectorAll(selectors.join(",")).forEach((li) => {
    const t = (li.textContent || "").replace(/\s+/g, " ").trim();
    if (t && t.length >= 2 && t.length <= 120) ingLines.push(t);
  });

  // Fallback: kurze Zeilen, die wie Zutaten aussehen
  if (!ingLines.length) {
    const seen = new Set();
    (doc.body.innerText || "").split(/\r?\n/).forEach((l) => {
      const t = l.replace(/\s+/g, " ").trim();
      if (!t || t.length < 2 || t.length > 120 || seen.has(t)) return;
      seen.add(t);
      if (/^\d/.test(t) || parseLine(t).confidence >= 0.5) ingLines.push(t);
    });
  }

  const items = mergeItems(
    ingLines.map((l) => parseLine(l)).filter((i) => i.name && i.name.length >= 2)
  ).map((i) => ({ name: i.name, amount: i.amount, unit: i.unit, category: i.category }));

  const steps = [];
  doc.querySelectorAll(
    "ol[class*='instruction'] li, ol[class*='step'] li, .recipe-steps li, .steps li, [class*='instruction'] li, [class*='zubereitung'] li"
  ).forEach((li) => {
    const t = (li.textContent || "").replace(/\s+/g, " ").trim();
    if (t && t.length >= 8) steps.push(t);
  });

  return {
    title,
    servings: 2,
    ingredients: items,
    instructions: steps.slice(0, 20).join("\n"),
    tags: [],
    source: "website",
    sourceUrl: "",
  };
}

// HTML einer Rezeptseite → Liste von Rezept-Kandidaten
export function extractRecipeFromHtml(html, url) {
  const doc = htmlDoc(html);
  const candidates = [];
  for (const node of jsonLdRecipeNodes(doc)) {
    const r = jsonLdRecipe(node, url);
    if (r.ingredients.length) candidates.push(r);
  }
  if (!candidates.length) {
    const h = heuristicRecipe(doc);
    if (h && h.ingredients.length) candidates.push(h);
  }
  const seen = new Set();
  return candidates.filter((c) => {
    const key = c.title.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ------------------------------------------------------------
// Rezept-Generierung: Vorschläge aus dem aktuellen Bestand
// ------------------------------------------------------------
// Salz/Pfeffer/Öl gelten als Grundausstattung und fließen nicht
// in die Bestands-Abdeckung ein.
const STAPLES = new Set(["Salz", "Pfeffer", "Olivenöl", "Zucker", "Wasser", "Sonnenblumenöl"]);
const SWEET_FRUITS = new Set([
  "Bananen", "Äpfel", "Birnen", "Orangen", "Erdbeeren", "Himbeeren", "Blaubeeren", "Brombeeren",
  "Weintrauben", "Kirschen", "Pfirsiche", "Nektarinen", "Aprikosen", "Pflaumen", "Mango", "Ananas",
  "Kiwi", "Melone", "Datteln", "Feigen",
]);
const PROTEIN_NAMES = [
  "Hähnchen", "Rinderhack", "Rindfleisch", "Schweinefleisch", "Putenbrust", "Lachs", "Thunfisch",
  "Garnelen", "Seelachs", "Schnitzel", "Steak", "Gyros", "Tofu", "Speck", "Schinken", "Salami",
  "Wurst", "Chicken Wings", "Frikadellen",
];

const GEN_AMOUNT = {
  "Nudeln": [200, "g"], "Spätzle": [250, "g"], "Tortellini": [300, "g"], "Gnocchi": [300, "g"],
  "Lasagneplatten": [8, "Stück"], "Reis": [150, "g"], "Kartoffeln": [500, "g"], "Süßkartoffeln": [500, "g"],
  "Wraps": [4, "Stück"], "Brot": [2, "Scheibe"], "Brötchen": [4, "Stück"], "Baguette": [1, "Stück"],
  "Hähnchen": [250, "g"], "Rinderhack": [300, "g"], "Rindfleisch": [300, "g"], "Schweinefleisch": [300, "g"],
  "Putenbrust": [250, "g"], "Lachs": [250, "g"], "Thunfisch": [200, "g"], "Garnelen": [200, "g"],
  "Seelachs": [250, "g"], "Schnitzel": [300, "g"], "Steak": [300, "g"], "Gyros": [250, "g"],
  "Tofu": [250, "g"], "Speck": [100, "g"], "Schinken": [100, "g"], "Salami": [100, "g"],
  "Wurst": [4, "Stück"], "Chicken Wings": [500, "g"], "Frikadellen": [4, "Stück"], "Eier": [2, "Stück"],
  "Butter": [20, "g"], "Käse": [100, "g"], "Mozzarella": [125, "g"], "Feta": [100, "g"],
  "Sahne": [200, "ml"], "Crème fraîche": [150, "g"], "Schmand": [150, "g"], "Joghurt": [150, "g"],
  "Passierte Tomaten": [400, "ml"], "Gehackte Tomaten": [1, "Dose"], "Kokosmilch": [200, "ml"],
  "Sojasauce": [2, "EL"], "Tomatenmark": [1, "EL"], "Pesto": [3, "EL"], "Brühe": [500, "ml"],
  "Olivenöl": [1, "EL"], "Salz": [1, "Prise"], "Pfeffer": [1, "Prise"], "Paprikapulver": [1, "TL"],
  "Currypulver": [1, "TL"], "Currypaste": [1, "EL"], "Kreuzkümmel": [1, "TL"], "Oregano": [1, "TL"],
  "Thymian": [1, "TL"], "Chilipulver": [1, "TL"], "Muskat": [1, "Prise"], "Zimt": [1, "TL"],
  "Kidneybohnen": [1, "Dose"], "Weiße Bohnen": [1, "Dose"], "Kichererbsen": [1, "Dose"], "Mais": [1, "Dose"],
  "Avocado": [1, "Stück"], "Tomaten": [2, "Stück"], "Zucchini": [1, "Stück"], "Paprika": [1, "Stück"],
  "Möhren": [2, "Stück"], "Zwiebeln": [1, "Stück"], "Knoblauch": [2, "Zehe"], "Lauch": [1, "Stück"],
  "Brokkoli": [1, "Stück"], "Blumenkohl": [1, "Stück"], "Champignons": [150, "g"], "Spinat": [100, "g"],
  "Frischkäse": [100, "g"], "Zitronen": [1, "Stück"], "Limetten": [1, "Stück"], "Gurken": [1, "Stück"],
};

function genIng(name, servings, fallbackUnit) {
  const known = GEN_AMOUNT[name];
  let amount = known ? known[0] : null;
  let unit = known ? known[1] : (fallbackUnit || "Stück");
  if (amount == null) {
    if (unit === "g") amount = 150;
    else if (unit === "ml") amount = 200;
    else if (unit === "l") amount = 0.25;
    else amount = 1;
  }
  const factor = servings / 2;
  amount = factor !== 1 ? Math.round(amount * factor * 100) / 100 : amount;
  return { name, amount, unit };
}

function pick(inv, names) {
  return inv.find((i) => names.includes(i.name)) || null;
}

function savoryVegs(inv, n) {
  return inv.filter((i) => i.category === "Obst & Gemüse" && !SWEET_FRUITS.has(i.name)).slice(0, n);
}

function buildPfanne(inv) {
  const base = pick(inv, ["Nudeln", "Spätzle", "Reis", "Kartoffeln"]);
  const protein = pick(inv, PROTEIN_NAMES);
  const vegs = savoryVegs(inv, 2);
  if (!protein && !vegs.length && !base) return null;
  const sauce = pick(inv, ["Sojasauce", "Kokosmilch", "Passierte Tomaten", "Sahne"]);
  const ing = [];
  if (base) ing.push(genIng(base.name, 2));
  if (protein) ing.push(genIng(protein.name, 2));
  for (const v of vegs) ing.push(genIng(v.name, 2, v.unit));
  if (sauce) ing.push(genIng(sauce.name, 2, sauce.unit));
  ing.push(genIng("Olivenöl", 2), genIng("Salz", 2), genIng("Pfeffer", 2));
  if (pick(inv, ["Paprikapulver"])) ing.push(genIng("Paprikapulver", 2));
  const parts = [];
  if (protein) parts.push(protein.name);
  parts.push(...vegs.map((v) => v.name));
  const title = (parts.length ? parts.join("-") : "Gemüse") + "-Pfanne" + (base ? " mit " + base.name : "");
  const steps = [];
  if (base) steps.push(`${base.name} nach Packungsanweisung zubereiten.`);
  if (protein) steps.push(`${protein.name} in mundgerechte Stücke schneiden und im heißen Öl kräftig anbraten.`);
  if (vegs.length) steps.push(`Gemüse (${vegs.map((v) => v.name.toLowerCase()).join(", ")}) putzen, klein schneiden und mitbraten.`);
  if (sauce) steps.push(`${sauce.name} angießen, mit Salz und Pfeffer${pick(inv, ["Paprikapulver"]) ? " und Paprikapulver" : ""} würzen und 5–8 Minuten fertig garen.`);
  else steps.push("Mit Salz und Pfeffer würzen und 5–8 Minuten garen.");
  steps.push(base ? `Mit ${base.name} servieren.` : "Direkt aus der Pfanne servieren.");
  return { title, servings: 2, ingredients: ing, instructions: steps.join("\n"), tags: ["Pfanne", "Schnell"] };
}

function buildCurry(inv) {
  const base = pick(inv, ["Reis"]);
  const sauce = pick(inv, ["Kokosmilch", "Currypaste"]);
  if (!sauce) return null;
  const protein = pick(inv, PROTEIN_NAMES);
  const vegs = savoryVegs(inv, 2);
  if (!protein && !vegs.length) return null;
  const ing = [];
  if (base) ing.push(genIng("Reis", 2));
  if (protein) ing.push(genIng(protein.name, 2));
  for (const v of vegs) ing.push(genIng(v.name, 2, v.unit));
  ing.push(genIng(sauce.name, 2, sauce.unit), genIng("Currypulver", 2), genIng("Salz", 2), genIng("Pfeffer", 2));
  if (base) ing.push(genIng("Olivenöl", 2));
  const title = (protein ? protein.name + "-" : "") + "Curry" + (base ? " mit Reis" : "");
  const steps = [];
  if (base) steps.push("Reis nach Packungsanweisung kochen.");
  if (protein) steps.push(`${protein.name} in Stücke schneiden und in heißem Öl anbraten.`);
  if (vegs.length) steps.push(`Gemüse (${vegs.map((v) => v.name.toLowerCase()).join(", ")}) zugeben und kurz mitbraten.`);
  steps.push(`${sauce.name} angießen, mit Currypulver, Salz und Pfeffer würzen und 10 Minuten sanft köcheln lassen.`);
  if (base) steps.push("Mit Reis servieren.");
  return { title, servings: 2, ingredients: ing, instructions: steps.join("\n"), tags: ["Curry", "Eintopf"] };
}

function buildAuflauf(inv) {
  const base = pick(inv, ["Nudeln", "Kartoffeln", "Spätzle", "Tortellini"]);
  const cheese = pick(inv, ["Käse", "Mozzarella", "Feta", "Sahne", "Schmand", "Crème fraîche"]);
  if (!base || !cheese) return null;
  const vegs = savoryVegs(inv, 2);
  if (!vegs.length) return null;
  const ing = [];
  ing.push(genIng(base.name, 2));
  for (const v of vegs) ing.push(genIng(v.name, 2, v.unit));
  ing.push(genIng(cheese.name, 2, cheese.unit), genIng("Salz", 2), genIng("Pfeffer", 2));
  const title = `${vegs.map((v) => v.name).join("-")}-${base.name}-Auflauf`;
  const steps = [
    `${base.name} bissfest vorkochen und abtropfen lassen.`,
    `Gemüse (${vegs.map((v) => v.name.toLowerCase()).join(", ")}) klein schneiden.`,
    `Alles in eine Auflaufform schichten, mit ${cheese.name} übergießen/bestreuen und mit Salz und Pfeffer würzen.`,
    "Bei 190 °C ca. 25 Minuten goldbraun backen.",
  ];
  return { title, servings: 3, ingredients: ing, instructions: steps.join("\n"), tags: ["Auflauf", "Ofen"] };
}

function buildSuppe(inv) {
  const broth = pick(inv, ["Brühe"]);
  const kartoffeln = pick(inv, ["Kartoffeln"]);
  const vegs = savoryVegs(inv, 2);
  if (!broth || (!kartoffeln && !vegs.length)) return null;
  const ing = [];
  if (kartoffeln) ing.push(genIng("Kartoffeln", 4));
  for (const v of vegs) ing.push(genIng(v.name, 4, v.unit));
  ing.push(genIng("Brühe", 4), genIng("Salz", 2), genIng("Pfeffer", 2));
  const title = kartoffeln ? "Kartoffelsuppe" : "Gemüsesuppe";
  const steps = [
    kartoffeln ? "Kartoffeln schälen und würfeln." : "Gemüse putzen und klein schneiden.",
    "Alles in einen Topf geben, mit Brühe aufgießen und ca. 25 Minuten weich kochen.",
    `Mit Salz und Pfeffer abschmecken${kartoffeln ? " und nach Wunsch fein pürieren" : ""}.`,
  ];
  return { title, servings: 4, ingredients: ing, instructions: steps.join("\n"), tags: ["Suppe", "Eintopf"] };
}

function buildSalat(inv) {
  const vegs = savoryVegs(inv, 3);
  if (vegs.length < 2) return null;
  const cheese = pick(inv, ["Feta", "Käse", "Mozzarella"]);
  const ing = [];
  for (const v of vegs) ing.push(genIng(v.name, 2, v.unit));
  if (cheese) ing.push(genIng(cheese.name, 2, cheese.unit));
  ing.push(genIng("Olivenöl", 2), genIng("Salz", 2), genIng("Pfeffer", 2));
  const title = `${vegs.map((v) => v.name).join("-")}-Salat`;
  const steps = [
    `Gemüse (${vegs.map((v) => v.name.toLowerCase()).join(", ")}) waschen und in mundgerechte Stücke schneiden.`,
    cheese ? `Gewürfelten ${cheese.name} unterheben.` : "",
    "Aus Olivenöl, Salz und Pfeffer ein Dressing rühren und unterheben.",
  ];
  return { title, servings: 2, ingredients: ing, instructions: steps.filter(Boolean).join("\n"), tags: ["Salat", "Frisch"] };
}

function buildPasta(inv) {
  const base = pick(inv, ["Nudeln", "Spätzle", "Tortellini", "Gnocchi"]);
  if (!base) return null;
  const sauce = pick(inv, ["Pesto", "Passierte Tomaten", "Sahne", "Käse", "Mozzarella", "Thunfisch"]);
  if (!sauce) return null;
  const ing = [];
  ing.push(genIng(base.name, 2));
  ing.push(genIng(sauce.name, 2, sauce.unit));
  if (sauce.name === "Thunfisch") ing.push(genIng("Zwiebeln", 2));
  ing.push(genIng("Salz", 2), genIng("Pfeffer", 2));
  const title = `${base.name} mit ${sauce.name === "Passierte Tomaten" ? "Tomatensauce" : sauce.name}`;
  const steps = [
    `${base.name} al dente kochen, etwas Nudelwasser aufheben.`,
    sauce.name === "Thunfisch"
      ? "Zwiebel fein würfeln und andünsten, Thunfisch zugeben."
      : `${sauce.name} in einem Topf erwärmen.`,
    `Sauce mit etwas Nudelwasser verfeinern, mit Salz und Pfeffer würzen und unter die ${base.name.toLowerCase()} heben.`,
  ];
  return { title, servings: 2, ingredients: ing, instructions: steps.join("\n"), tags: ["Pasta", "Schnell"] };
}

function buildEier(inv) {
  const eier = pick(inv, ["Eier"]);
  if (!eier) return null;
  const filling = pick(inv, ["Käse", "Feta", "Tomaten", "Spinat", "Champignons", "Frühlingszwiebeln", "Paprika"]);
  const brot = pick(inv, ["Brot", "Brötchen", "Baguette"]);
  const ing = [];
  ing.push(genIng("Eier", 2));
  if (filling) ing.push(genIng(filling.name, 2, filling.unit));
  if (brot) ing.push(genIng(brot.name, 2, brot.unit));
  ing.push(genIng("Butter", 2), genIng("Salz", 2), genIng("Pfeffer", 2));
  const title = `Omelett${filling ? " mit " + filling.name : ""}`;
  const steps = [
    "Eier verquirlen und mit Salz und Pfeffer würzen.",
    filling ? `${filling.name} klein schneiden und kurz anbraten.` : "",
    filling
      ? "Eier in der Pfanne stocken lassen, Füllung darauf verteilen und zusammenklappen."
      : "Eier in der Pfanne von beiden Seiten goldbraun braten.",
    brot ? `Mit ${brot.name} servieren.` : "",
  ];
  return { title, servings: 1, ingredients: ing, instructions: steps.filter(Boolean).join("\n"), tags: ["Frühstück", "Schnell"] };
}

function buildOfen(inv) {
  const vegs = savoryVegs(inv, 3);
  if (vegs.length < 2) return null;
  const feta = pick(inv, ["Feta", "Käse"]);
  const ing = [];
  for (const v of vegs) ing.push(genIng(v.name, 2, v.unit));
  if (feta) ing.push(genIng(feta.name, 2, feta.unit));
  ing.push(genIng("Olivenöl", 2), genIng("Salz", 2), genIng("Pfeffer", 2), genIng("Paprikapulver", 2));
  const title = "Ofengemüse" + (feta ? " mit " + feta.name : "");
  const steps = [
    `Gemüse (${vegs.map((v) => v.name.toLowerCase()).join(", ")}) in grobe Stücke schneiden.`,
    "Mit Olivenöl, Salz, Pfeffer und Paprikapulver mischen und auf einem Blech verteilen.",
    `Bei 200 °C ca. 25 Minuten backen.${feta ? ` Zum Schluss ${feta.name} darüberbröseln und kurz weitergaren.` : ""}`,
  ];
  return { title, servings: 2, ingredients: ing, instructions: steps.join("\n"), tags: ["Ofen", "Vegetarisch"] };
}

function buildBowl(inv) {
  const reis = pick(inv, ["Reis"]);
  if (!reis) return null;
  const toppings = inv
    .filter((i) => ["Kidneybohnen", "Weiße Bohnen", "Kichererbsen", "Mais", "Avocado", "Tomaten", "Gurken", "Feta", "Eier"].includes(i.name))
    .slice(0, 3);
  if (!toppings.length) return null;
  const ing = [];
  ing.push(genIng("Reis", 2));
  for (const t of toppings) ing.push(genIng(t.name, 2, t.unit));
  ing.push(genIng("Olivenöl", 2), genIng("Salz", 2), genIng("Pfeffer", 2));
  const title = `${toppings.map((t) => t.name).join("-")}-Bowl mit Reis`;
  const steps = [
    "Reis nach Packungsanweisung kochen.",
    `${toppings.map((t) => t.name).join(", ")} vorbereiten (würfeln, abtropfen, garen).`,
    "Alles in Schüsseln schichten, mit Salz, Pfeffer und Olivenöl abschmecken.",
  ];
  return { title, servings: 2, ingredients: ing, instructions: steps.join("\n"), tags: ["Bowl", "Reis"] };
}

function buildWrap(inv) {
  const wrap = pick(inv, ["Wraps"]);
  if (!wrap) return null;
  const filling = pick(inv, ["Käse", "Feta", "Hähnchen", "Eier", "Thunfisch", "Avocado"]);
  const vegs = savoryVegs(inv, 2);
  if (!filling && !vegs.length) return null;
  const ing = [];
  ing.push(genIng("Wraps", 2));
  if (filling) ing.push(genIng(filling.name, 2, filling.unit));
  for (const v of vegs) ing.push(genIng(v.name, 2, v.unit));
  ing.push(genIng("Olivenöl", 2), genIng("Salz", 2), genIng("Pfeffer", 2));
  const fillNames = [];
  if (filling) fillNames.push(filling.name);
  fillNames.push(...vegs.map((v) => v.name));
  const title = "Wrap mit " + fillNames.join(" & ");
  const steps = [
    filling ? `${filling.name} vorbereiten und kurz anbraten/garen.` : "",
    `Gemüse (${vegs.map((v) => v.name.toLowerCase()).join(", ")}) in Streifen schneiden.`,
    "Wraps mit der Füllung belegen, würzen, aufrollen und in der Pfanne von beiden Seiten knusprig braten.",
  ];
  return { title, servings: 2, ingredients: ing, instructions: steps.filter(Boolean).join("\n"), tags: ["Schnell", "Wrap"] };
}

const GENERATORS = [buildPfanne, buildCurry, buildAuflauf, buildSuppe, buildSalat, buildPasta, buildEier, buildOfen, buildBowl, buildWrap];

// Bestand → konkrete Rezept-Vorschläge (inkl. Bestands-Abdeckung)
export function generateRecipeSuggestions(inventory, { limit = 4 } = {}) {
  const inv = inventory || [];
  if (!inv.length) return [];
  const seen = new Set();
  const out = [];
  for (const gen of GENERATORS) {
    try {
      const recipe = gen(inv);
      if (!recipe) continue;
      const key = recipe.title.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const nonStaples = recipe.ingredients.filter((i) => !STAPLES.has(i.name));
      const cov = inventoryCoverage(nonStaples, inv);
      if (cov.have === 0) continue; // nutzt nichts aus dem Bestand
      out.push({
        recipe: {
          ...recipe,
          id: "sugg-" + out.length + "-" + Date.now(),
          is_public: false,
          generated: true,
          created_at: new Date().toISOString(),
        },
        ...cov,
      });
    } catch {
      // einzelner Vorschlag übersprungen
    }
  }
  out.sort((a, b) => b.score - a.score || a.missing.length - b.missing.length);
  return out.slice(0, limit);
}

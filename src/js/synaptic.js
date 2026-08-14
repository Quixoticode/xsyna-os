// ============================================================
// xSyna — Synaptic Foundation Model (lokal, im Browser)
// ------------------------------------------------------------
// Eine kleine, lokale "Foundation-Model"-Engine, die vollständig
// im Browser läuft (kein Server, keine Cloud):
//   • Textextraktion   – rohen Text (OCR/Mikro/manuell) in Items zerlegen
//   • Label-Erkennung  – Lebensmittel-Labels gegen eine Wissensbasis
//                        matchen (inkl. Fuzzy-Matching nach OCR-Fehlern)
//   • Bestands-Scoring – Rezepte gegen den aktuellen Bestand bewerten
//   • Smart-Shopping   – fehlende Zutaten mergen & nach Kategorien bündeln
// ============================================================

export const Synaptic = {
  name: "Synaptic Foundation Model",
  version: "1.0.0",
  runtime: "lokal · Browser-JS",
  locale: "de-DE",
  engines: ["Tesseract.js (OCR)", "Web Speech API (STT)", "Synaptic NLP (Extraktion)"],
  stats: { parses: 0, avgMs: 0 },
};

// ------------------------------------------------------------
// Normalisierung
// ------------------------------------------------------------
const UMLAUT_MAP = { ä: "ae", ö: "oe", ü: "ue", ß: "ss", Ä: "ae", Ö: "oe", Ü: "ue" };

export function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-zäöüß0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function similarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  const dist = levenshtein(a, b);
  return 1 - dist / maxLen;
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[n];
}

// ------------------------------------------------------------
// Wissensbasis (Label-Erkennung)
// name  = kanonisches Label; aliases = OCR-/Alltagsvarianten;
// unit  = Standard-Einheit, wenn keine angegeben wird
// ------------------------------------------------------------
const K = (name, category, unit, aliases = []) => ({ name, category, unit, aliases });

export const CATEGORIES = [
  "Obst & Gemüse",
  "Milchprodukte",
  "Fleisch & Fisch",
  "Backwaren",
  "Nudeln & Getreide",
  "Konserven & Saucen",
  "Gewürze",
  "Öle & Fette",
  "Getränke",
  "Süßes & Snacks",
  "Tiefkühl",
  "Haushalt",
  "Sonstiges",
];

const KNOWLEDGE = [
  // ----- Obst & Gemüse -----
  K("Äpfel", "Obst & Gemüse", "Stück", ["apfel", "apples", "äpfel"]),
  K("Bananen", "Obst & Gemüse", "Stück", ["banane", "bananas"]),
  K("Birnen", "Obst & Gemüse", "Stück", ["birne"]),
  K("Orangen", "Obst & Gemüse", "Stück", ["orange", "apfelsinen", "apfelsine"]),
  K("Zitronen", "Obst & Gemüse", "Stück", ["zitrone", "citrone", "zitronen"]),
  K("Limetten", "Obst & Gemüse", "Stück", ["limette"]),
  K("Erdbeeren", "Obst & Gemüse", "Stück", ["erdbeere", "strawberries"]),
  K("Himbeeren", "Obst & Gemüse", "Stück", ["himbeere"]),
  K("Blaubeeren", "Obst & Gemüse", "Stück", ["blaubeere", "heidelbeeren", "heidelbeere"]),
  K("Brombeeren", "Obst & Gemüse", "Stück", ["brombeere"]),
  K("Weintrauben", "Obst & Gemüse", "g", ["trauben", "weintraube"]),
  K("Tomaten", "Obst & Gemüse", "Stück", ["tomate", "tomatos", "tomaten"]),
  K("Kirschtomaten", "Obst & Gemüse", "Stück", ["kirschtomate", "cocktailtomaten"]),
  K("Gurken", "Obst & Gemüse", "Stück", ["gurke", "salatgurke"]),
  K("Zwiebeln", "Obst & Gemüse", "Stück", ["zwiebel", "onions"]),
  K("Knoblauch", "Obst & Gemüse", "Zehe", ["knoblauchzehen", "knoblauchzehe", "garlic"]),
  K("Kartoffeln", "Obst & Gemüse", "g", ["kartoffel", "potatoes"]),
  K("Süßkartoffeln", "Obst & Gemüse", "g", ["süßkartoffel", "susskartoffel"]),
  K("Möhren", "Obst & Gemüse", "g", ["möhre", "mohre", "karotten", "karotte", "carrots"]),
  K("Paprika", "Obst & Gemüse", "Stück", ["paprikaschoten", "paprikaschote", "peppers"]),
  K("Zucchini", "Obst & Gemüse", "Stück", ["zucchini", "courgette"]),
  K("Auberginen", "Obst & Gemüse", "Stück", ["aubergine", "melanzani"]),
  K("Champignons", "Obst & Gemüse", "g", ["champignon", "pilze", "pilz", "mushrooms"]),
  K("Spinat", "Obst & Gemüse", "g", ["blattspinat"]),
  K("Salat", "Obst & Gemüse", "Stück", ["kopfsalat", "blattsalat", "eisbergsalat", "salatherz"]),
  K("Rucola", "Obst & Gemüse", "g", ["rucola", "rauke"]),
  K("Brokkoli", "Obst & Gemüse", "Stück", ["broccoli"]),
  K("Blumenkohl", "Obst & Gemüse", "Stück", ["karfiol"]),
  K("Rosenkohl", "Obst & Gemüse", "g", ["rosenkohl"]),
  K("Erbsen", "Obst & Gemüse", "g", ["erbsen", "peas"]),
  K("Mais", "Obst & Gemüse", "Dose", ["maiskolben", "mais"]),
  K("Grüne Bohnen", "Obst & Gemüse", "g", ["bohnen", "brechbohnen", "grüne bohnen"]),
  K("Kürbis", "Obst & Gemüse", "Stück", ["hokkaido", "butternut"]),
  K("Avocado", "Obst & Gemüse", "Stück", ["avocados"]),
  K("Lauch", "Obst & Gemüse", "Stück", ["porree"]),
  K("Staudensellerie", "Obst & Gemüse", "Stück", ["sellerie"]),
  K("Ingwer", "Obst & Gemüse", "Stück", ["ingwerwurzel", "ginger"]),
  K("Chili", "Obst & Gemüse", "Stück", ["chilischoten", "chilischote", "peperoni"]),
  K("Petersilie", "Obst & Gemüse", "Bund", ["frische petersilie"]),
  K("Schnittlauch", "Obst & Gemüse", "Bund", []),
  K("Basilikum", "Obst & Gemüse", "Bund", ["frisches basilikum"]),
  K("Dill", "Obst & Gemüse", "Bund", []),
  K("Minze", "Obst & Gemüse", "Bund", ["pfefferminze"]),
  K("Rosmarin", "Obst & Gemüse", "Zweig", ["rosmarinzweig"]),
  K("Thymian", "Obst & Gemüse", "Zweig", []),

  // ----- Milchprodukte -----
  K("Milch", "Milchprodukte", "l", ["vollmilch", "fettarme milch", "h-milch"]),
  K("Butter", "Milchprodukte", "g", []),
  K("Margarine", "Milchprodukte", "g", []),
  K("Käse", "Milchprodukte", "g", ["reibekäse", "geriebener käse", "gouda", "edamer", "emmentaler", "scheibletten"]),
  K("Mozzarella", "Milchprodukte", "g", []),
  K("Feta", "Milchprodukte", "g", ["schafskäse", "hirtenkäse"]),
  K("Parmesan", "Milchprodukte", "g", ["parmesankäse"]),
  K("Sahne", "Milchprodukte", "ml", ["schlagsahne", "süße sahne", "süsse sahne"]),
  K("Crème fraîche", "Milchprodukte", "g", ["creme fraiche"]),
  K("Schmand", "Milchprodukte", "g", []),
  K("Joghurt", "Milchprodukte", "g", ["naturjoghurt", "griechischer joghurt", "griechischer"]),
  K("Quark", "Milchprodukte", "g", ["magerquark"]),
  K("Eier", "Milchprodukte", "Stück", ["ei", "eier", "eiern", "eggs"]),
  K("Frischkäse", "Milchprodukte", "g", ["doppelrahm"]),
  K("Mascarpone", "Milchprodukte", "g", []),
  K("Kefir", "Milchprodukte", "ml", []),
  K("Buttermilch", "Milchprodukte", "ml", []),
  K("Kondensmilch", "Milchprodukte", "ml", []),

  // ----- Fleisch & Fisch -----
  K("Hähnchen", "Fleisch & Fisch", "g", ["hähnchenbrust", "hähnchenschenkel", "huhn", "hühnchen", "chicken"]),
  K("Rinderhack", "Fleisch & Fisch", "g", ["hackfleisch", "hack", "gemischtes hack"]),
  K("Rindfleisch", "Fleisch & Fisch", "g", ["rinderfilet", "rumpsteak", "beef"]),
  K("Schweinefleisch", "Fleisch & Fisch", "g", ["schwein", "schweinefilet", "kassler"]),
  K("Speck", "Fleisch & Fisch", "g", ["frühstücksspeck", "bacon"]),
  K("Schinken", "Fleisch & Fisch", "g", ["kochschinken", "rohschinken", "serranoschinken"]),
  K("Salami", "Fleisch & Fisch", "g", []),
  K("Wurst", "Fleisch & Fisch", "g", ["lyoner", "bratwurst", "würstchen", "wiener", "wienerwürstchen", "leberwurst"]),
  K("Putenbrust", "Fleisch & Fisch", "g", ["pute", "putenschnitzel"]),
  K("Lachs", "Fleisch & Fisch", "g", ["lachsfilet", "geräucherter lachs"]),
  K("Thunfisch", "Fleisch & Fisch", "Dose", ["thunfischdose", "tunfisch"]),
  K("Garnelen", "Fleisch & Fisch", "g", ["shrimps", "crevetten", "shrimp"]),
  K("Seelachs", "Fleisch & Fisch", "g", ["fischfilet", "kabeljau", "dorsch"]),

  // ----- Backwaren -----
  K("Brot", "Backwaren", "Stück", ["toastbrot", "vollkornbrot", "mischbrot", "ciabatta"]),
  K("Brötchen", "Backwaren", "Stück", ["semmeln", "semmel", "wecken", "broetchen"]),
  K("Baguette", "Backwaren", "Stück", []),
  K("Mehl", "Backwaren", "g", ["weizenmehl", "dinkelmehl", "mehl typ 405"]),
  K("Zucker", "Backwaren", "g", ["brauner zucker", "puderzucker"]),
  K("Paniermehl", "Backwaren", "g", ["semmelbrösel", "semmelbroesel"]),
  K("Hefe", "Backwaren", "g", ["trockenhefe", "frische hefe"]),
  K("Backpulver", "Backwaren", "Packung", []),
  K("Vanillezucker", "Backwaren", "Packung", []),
  K("Haferflocken", "Backwaren", "g", []),
  K("Müsli", "Backwaren", "g", ["granola"]),

  // ----- Nudeln & Getreide -----
  K("Nudeln", "Nudeln & Getreide", "g", ["pasta", "spaghetti", "penne", "fusilli", "bandnudeln", "maccaroni", "tagliatelle", "nudel"]),
  K("Reis", "Nudeln & Getreide", "g", ["basmati", "jasminreis", "reis"]),
  K("Couscous", "Nudeln & Getreide", "g", []),
  K("Bulgur", "Nudeln & Getreide", "g", []),
  K("Quinoa", "Nudeln & Getreide", "g", []),
  K("Linsen", "Nudeln & Getreide", "g", ["rote linsen", "linsen"]),
  K("Kichererbsen", "Nudeln & Getreide", "Dose", ["kichererbsen"]),

  // ----- Konserven & Saucen -----
  K("Tomatenmark", "Konserven & Saucen", "g", []),
  K("Passierte Tomaten", "Konserven & Saucen", "ml", ["passata", "tomatensauce", "tomatensosse"]),
  K("Gehackte Tomaten", "Konserven & Saucen", "Dose", ["stückige tomaten", "tomatenwürfel", "tomatenstuecke"]),
  K("Oliven", "Konserven & Saucen", "g", ["schwarze oliven", "grüne oliven"]),
  K("Kapern", "Konserven & Saucen", "g", []),
  K("Senf", "Konserven & Saucen", "g", ["mittelscharfer senf", "dijonsenf"]),
  K("Ketchup", "Konserven & Saucen", "ml", []),
  K("Mayonnaise", "Konserven & Saucen", "ml", ["majo"]),
  K("Essig", "Konserven & Saucen", "ml", ["weinessig", "apfelessig", "balsamico", "balsamico essig"]),
  K("Sojasauce", "Konserven & Saucen", "ml", ["sojasoße", "sojasosse"]),
  K("Brühe", "Konserven & Saucen", "g", ["gemüsebrühe", "hühnerbrühe", "brühepulver", "brühwürfel", "fond"]),
  K("Kokosmilch", "Konserven & Saucen", "ml", []),
  K("Honig", "Konserven & Saucen", "g", []),
  K("Marmelade", "Konserven & Saucen", "g", ["konfitüre", "erdbeermarmelade"]),
  K("Schokocreme", "Konserven & Saucen", "g", ["nussnougatcreme", "nutella", "schokocremes"]),
  K("Erdnussbutter", "Konserven & Saucen", "g", ["erdnussmus"]),

  // ----- Gewürze -----
  K("Salz", "Gewürze", "g", ["speisesalz", "meersalz"]),
  K("Pfeffer", "Gewürze", "g", ["schwarzer pfeffer", "pfefferkörner"]),
  K("Paprikapulver", "Gewürze", "g", ["paprika edelsüß", "edelsüß"]),
  K("Kurkuma", "Gewürze", "g", []),
  K("Kreuzkümmel", "Gewürze", "g", ["cumin"]),
  K("Kümmel", "Gewürze", "g", []),
  K("Oregano", "Gewürze", "g", []),
  K("Majoran", "Gewürze", "g", []),
  K("Muskat", "Gewürze", "g", ["muskatnuss"]),
  K("Zimt", "Gewürze", "g", ["zimtstangen"]),
  K("Currypulver", "Gewürze", "g", ["curry"]),
  K("Chilipulver", "Gewürze", "g", ["chili flakes", "chiliflocken"]),
  K("Knoblauchpulver", "Gewürze", "g", []),
  K("Zwiebelpulver", "Gewürze", "g", []),
  K("Lorbeerblätter", "Gewürze", "Stück", ["lorbeer", "lorbeerblatt"]),

  // ----- Öle & Fette -----
  K("Olivenöl", "Öle & Fette", "ml", ["natives olivenöl"]),
  K("Sonnenblumenöl", "Öle & Fette", "ml", []),
  K("Rapsöl", "Öle & Fette", "ml", []),
  K("Kokosöl", "Öle & Fette", "ml", []),
  K("Sesamöl", "Öle & Fette", "ml", []),
  K("Pflanzenöl", "Öle & Fette", "ml", ["öl", "speiseöl"]),
  K("Butterschmalz", "Öle & Fette", "g", ["schmalz"]),

  // ----- Getränke -----
  K("Wasser", "Getränke", "l", ["mineralwasser", "stilles wasser", "sprudel"]),
  K("Kaffee", "Getränke", "g", ["kaffeebohnen", "gemahlener kaffee", "kaffeepulver"]),
  K("Tee", "Getränke", "Stück", ["schwarztee", "grüner tee", "kamillentee", "teebeutel"]),
  K("Saft", "Getränke", "l", ["orangensaft", "apfelsaft", "multivitaminsaft"]),
  K("Cola", "Getränke", "l", []),
  K("Limonade", "Getränke", "l", ["sprite", "fanta"]),
  K("Bier", "Getränke", "Flasche", ["pils", "weizenbier"]),
  K("Wein", "Getränke", "Flasche", ["rotwein", "weißwein", "weisswein"]),
  K("Sekt", "Getränke", "Flasche", ["prosecco"]),

  // ----- Süßes & Snacks -----
  K("Schokolade", "Süßes & Snacks", "g", ["zartbitterschokolade", "vollmilchschokolade", "schoki"]),
  K("Kekse", "Süßes & Snacks", "g", ["butterkekse", "kekse"]),
  K("Chips", "Süßes & Snacks", "g", ["kartoffelchips"]),
  K("Gummibärchen", "Süßes & Snacks", "g", []),
  K("Eis", "Süßes & Snacks", "g", ["vanilleeis", "schokoladeneis", "speiseeis"]),
  K("Popcorn", "Süßes & Snacks", "g", []),
  K("Nüsse", "Süßes & Snacks", "g", ["mandeln", "walnüsse", "cashews", "haselnüsse", "nüsse"]),
  K("Rosinen", "Süßes & Snacks", "g", []),
  K("Kakaopulver", "Süßes & Snacks", "g", ["kakao", "backkakao"]),
  K("Puddingpulver", "Süßes & Snacks", "Packung", []),

  // ----- Tiefkühl -----
  K("TK-Gemüse", "Tiefkühl", "g", ["tiefkühlgemüse", "tk gemüse", "tiefkühl erbsen", "tiefkühlspinat"]),
  K("Pommes", "Tiefkühl", "g", ["pommes frites"]),
  K("Fischstäbchen", "Tiefkühl", "g", []),
  K("TK-Pizza", "Tiefkühl", "Stück", ["tiefkühlpizza", "pizza"]),
  K("TK-Beeren", "Tiefkühl", "g", ["tiefkühlbeeren", "tk beeren"]),

  // ----- Haushalt -----
  K("Küchenrolle", "Haushalt", "Rolle", ["küchenpapier", "kuechenrolle"]),
  K("Toilettenpapier", "Haushalt", "Packung", ["klopapier"]),
  K("Spülmittel", "Haushalt", "Flasche", []),
  K("Waschmittel", "Haushalt", "Packung", []),
  K("Müllbeutel", "Haushalt", "Packung", ["müllsäcke", "mullsack"]),
  K("Alufolie", "Haushalt", "Rolle", []),
  K("Frischhaltefolie", "Haushalt", "Rolle", []),
  K("Zahnpasta", "Haushalt", "Stück", []),
  K("Seife", "Haushalt", "Stück", ["handseife"]),
  K("Shampoo", "Haushalt", "Flasche", []),
  K("Duschgel", "Haushalt", "Flasche", []),
  K("Batterien", "Haushalt", "Packung", []),
  K("Kerzen", "Haushalt", "Stück", []),

  // ----- Sonstiges -----
  K("Eiswürfel", "Sonstiges", "Packung", []),
  K("Paniermehl", "Sonstiges", "g", []),
  K("Semmelknödel", "Sonstiges", "Packung", ["knödel"]),
];

// Lookup-Tabellen (nur einmal aufbauen)
const KB_KEYS = [];
const KB_LOOKUP = new Map();
const KB_ALIAS = new Map();
for (const entry of KNOWLEDGE) {
  const norm = normalize(entry.name);
  KB_KEYS.push(norm);
  KB_LOOKUP.set(norm, entry);
  for (const alias of entry.aliases) {
    const a = normalize(alias);
    if (!KB_ALIAS.has(a)) KB_ALIAS.set(a, entry);
  }
}

// ------------------------------------------------------------
// Mengen-Parsing ("2-3 EL", "1/2 l", "0,5 kg", "ein halbes", "3")
// ------------------------------------------------------------
const WORD_NUMBERS = {
  ein: 1, eine: 1, einen: 1, einem: 1, einer: 1,
  halb: 0.5, halbe: 0.5, halbes: 0.5, halben: 0.5,
  viertel: 0.25,
  zwei: 2, drei: 3, vier: 4, fünf: 5, funf: 5, sechs: 6, sieben: 7,
  acht: 8, neun: 9, zehn: 10, elf: 11, zwölf: 12, zwolf: 12,
  anderthalb: 1.5, eineinhalb: 1.5, dreiviertel: 0.75,
};
const FRACTIONS = { "½": 0.5, "¼": 0.25, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3 };
const UNITS = [
  "kg", "g", "ml", "l", "liter", "gramm", "kilogramm", "milliliter",
  "stück", "stk", "packung", "pck", "pkg", "dose", "bund", "prise",
  "el", "tl", "tasse", "tassen", "scheibe", "scheiben", "flasche", "flaschen",
  "glas", "gläser", "zehe", "zehen", "würfel", "beutel", "becher", "rolle", "rollen",
  "zweig", "zweige", "blatt", "blätter", "kopf", "köpfe", "spritzer", "schuss",
  "stange", "stangen", "döschen", "portion", "portionen",
];
const UNIT_NORM = {
  kg: "kg", gramm: "g", g: "g", liter: "l", l: "l", milliliter: "ml", ml: "ml", kilogramm: "kg",
  stück: "Stück", stk: "Stück", packung: "Packung", pck: "Packung", pkg: "Packung",
  dose: "Dose", bund: "Bund", prise: "Prise", el: "EL", tl: "TL",
  tasse: "Tasse", tassen: "Tasse", scheibe: "Scheibe", scheiben: "Scheibe",
  flasche: "Flasche", flaschen: "Flasche", glas: "Glas", gläser: "Glas", gläser: "Glas",
  zehe: "Zehe", zehen: "Zehe", würfel: "Würfel", beutel: "Beutel", becher: "Becher",
  rolle: "Rolle", rollen: "Rolle", zweig: "Zweig", zweige: "Zweig",
  blatt: "Blatt", blätter: "Blatt", kopf: "Kopf", köpfe: "Kopf",
  spritzer: "Spritzer", schuss: "Schuss", stange: "Stange", stangen: "Stange",
  döschen: "Döschen", portion: "Portion", portionen: "Portion",
};
const UNIT_RE = new RegExp("^(" + UNITS.join("|") + ")\\b", "i");

function toNumber(raw) {
  if (raw == null) return null;
  let s = String(raw).trim().replace(",", ".");
  if (FRACTIONS[s]) return FRACTIONS[s];
  // Bruch 1/2
  const frac = s.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (frac) return parseInt(frac[1], 10) / parseInt(frac[2], 10);
  // Bereich "2-3" → Maximum (für Einkauf sicherer)
  const range = s.match(/^(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)$/);
  if (range) return Math.max(parseFloat(range[1]), parseFloat(range[2]));
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function parseAmount(raw) {
  const t = String(raw || "").trim();
  let rest = t;
  let amount = null;
  let unit = null;

  // 1) Zahl am Anfang (Bruch vor einfacher Zahl, dann Bereich/Dezimal)
  const numMatch = rest.match(/^(\d+\s*\/\s*\d+|\d+(?:[.,]\d+)?(?:\s*[-–]\s*\d+(?:[.,]\d+)?)?|½|¼|¾|⅓|⅔)\b/);
  if (numMatch) {
    amount = toNumber(numMatch[1]);
    rest = rest.slice(numMatch[0].length).trim();
  } else {
    // 2) Wortzahlen ("zwei", "ein halbes", "anderthalb")
    const wordMatch = rest.match(/^(ein\s+halbes?|eine\s+halbe|einen\s+halben|anderthalb|eineinhalb|halb(es|e|en)?|viertel|dreiviertel|ein|eine|einen|einem|einer|zwei|drei|vier|fünf|funf|sechs|sieben|acht|neun|zehn|elf|zwölf|zwolf)\b/);
    if (wordMatch) {
      let w = wordMatch[1].toLowerCase().replace(/\s+/g, " ");
      if (w.startsWith("ein halbes") || w.startsWith("eine halbe") || w.startsWith("einen halben")) amount = 0.5;
      else amount = WORD_NUMBERS[w] ?? WORD_NUMBERS[w.split(" ")[0]] ?? null;
      rest = rest.slice(wordMatch[0].length).trim();
    }
  }

  // 3) Einheit direkt nach der Menge
  const unitMatch = rest.match(UNIT_RE);
  if (unitMatch) {
    unit = UNIT_NORM[unitMatch[1].toLowerCase()] || null;
    rest = rest.slice(unitMatch[0].length).trim();
  }

  return { amount, unit, name: rest };
}

// ------------------------------------------------------------
// Label-Erkennung (Wissensbasis-Match)
// ------------------------------------------------------------
function matchLabel(name) {
  const q = normalize(name);
  if (!q) return null;

  // 1) Exakt
  const exact = KB_LOOKUP.get(q);
  if (exact) return { ...exact, confidence: 1 };

  // 2) Alias exakt
  const alias = KB_ALIAS.get(q);
  if (alias) return { ...alias, confidence: 1 };

  // 3) Enthalten (längster Treffer gewinnt) – inkl. Alias-Varianten
  let best = null;
  for (const key of KB_KEYS) {
    if (q.includes(key) || key.includes(q)) {
      if (!best || key.length > best.key.length) best = { entry: KB_LOOKUP.get(key), key, confidence: 0.9 };
    }
  }
  for (const [alias, entry] of KB_ALIAS) {
    if (q.includes(alias) || alias.includes(q)) {
      if (!best || alias.length > best.key.length) best = { entry, key: alias, confidence: 0.88 };
    }
  }
  if (best) return { ...best.entry, confidence: best.confidence };

  // 4) Fuzzy (OCR-Fehler, Tippfehler) – inkl. Alias-Varianten
  let bestFuzzy = null;
  const check = (key, entry) => {
    const sim = similarity(q, key);
    if (sim >= 0.62 && (!bestFuzzy || sim > bestFuzzy.sim)) bestFuzzy = { entry, sim };
  };
  for (const key of KB_KEYS) check(key, KB_LOOKUP.get(key));
  for (const [alias, entry] of KB_ALIAS) check(alias, entry);
  if (bestFuzzy) {
    const entry = bestFuzzy.entry;
    return { ...entry, confidence: Math.min(0.92, 0.62 + (bestFuzzy.sim - 0.62) * 2.4) };
  }

  // 5) Unbekannt
  return { name: titleCase(name), category: "Sonstiges", unit: null, confidence: 0.3 };
}

function titleCase(s) {
  return String(s).replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

// ------------------------------------------------------------
// Öffentliche API: Zeile → Item
// ------------------------------------------------------------
export function parseLine(raw) {
  const start = performance.now();
  const { amount, unit, name } = parseAmount(raw);
  const label = matchLabel(name);
  const item = {
    name: label.name,
    amount,
    unit: unit || label.unit || "",
    category: label.category || "Sonstiges",
    confidence: label.confidence,
    source: "manual",
    raw: String(raw || "").trim(),
  };
  Synaptic.stats.parses++;
  Synaptic.stats.avgMs = Synaptic.stats.avgMs === 0
    ? performance.now() - start
    : Synaptic.stats.avgMs * 0.8 + (performance.now() - start) * 0.2;
  return item;
}

export function parseText(text) {
  const fragments = String(text || "")
    .split(/\r?\n|[;,]|•|·|\u2022|–|-/)
    .map((f) => f.trim())
    .filter((f) => f.length >= 2);
  const items = [];
  for (const f of fragments) {
    const item = parseLine(f);
    // Unsinn filtern: nur Zahlen/Einheiten oder zu kurze Namen
    if (!item.name || item.name.length < 2) continue;
    if (/^\d+$/.test(item.name)) continue;
    items.push(item);
  }
  return items;
}

// ------------------------------------------------------------
// OCR-Vorverarbeitung (Tesseract-Rauschen bereinigen)
// ------------------------------------------------------------
const OCR_CHAR_FIXES = [
  [/[|¦]/g, "l"],
  [/\b0(?=[a-zäöüß])/g, "o"],
  [/\bl(?=0)/g, "l"],
  [/\b(I|i|1)(?=[a-zäöüß]{2,})/g, "l"],
  [/€/g, ""],
];

export function cleanOcr(raw) {
  let t = String(raw || "").replace(/\r/g, "\n");
  for (const [re, repl] of OCR_CHAR_FIXES) t = t.replace(re, repl);
  const lines = t
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length >= 2);
  // Duplikate & reine Zahlen raus
  const seen = new Set();
  return lines.filter((l) => {
    if (/^[\d\s.,%€]+$/.test(l)) return false;
    if (seen.has(l)) return false;
    seen.add(l);
    return true;
  });
}

export function extractFromOcr(raw) {
  const lines = cleanOcr(raw);
  const items = [];
  for (const line of lines) {
    const item = parseLine(line);
    if (!item.name || item.name.length < 2) continue;
    if (/^[\d\s.,]+$/.test(item.name)) continue;
    item.source = "camera";
    items.push(item);
  }
  return items;
}

// ------------------------------------------------------------
// Items zusammenführen (gleiches Label + gleiche Einheit)
// ------------------------------------------------------------
export function mergeItems(items) {
  const map = new Map();
  for (const it of items) {
    const key = normalize(it.name) + "|" + (it.unit || "");
    const existing = map.get(key);
    if (existing) {
      if (existing.amount != null && it.amount != null && existing.unit === it.unit) {
        existing.amount = round2(existing.amount + it.amount);
      } else if (existing.amount == null && it.amount != null) {
        existing.amount = it.amount;
      }
    } else {
      map.set(key, { ...it });
    }
  }
  return [...map.values()];
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

// ------------------------------------------------------------
// Bestands-Scoring: Rezept vs. Inventar
// ------------------------------------------------------------
export function inventoryCoverage(ingredients, inventory) {
  const inv = inventory || [];
  const total = ingredients.length;
  const missing = [];
  const have = [];

  for (const ing of ingredients) {
    const match = inv.find((i) => labelMatch(i.name, ing.name));
    const covered = match != null && (ing.amount == null || match.amount == null || match.amount >= ing.amount);
    if (covered) have.push({ ...ing, found: match ? match.amount : null });
    else missing.push({ ...ing });
  }

  const score = total === 0 ? 0 : have.length / total;
  return { total, have: have.length, missing, score, complete: missing.length === 0 };
}

function labelMatch(a, b) {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  return similarity(na, nb) >= 0.85;
}

export function suggestRecipes(recipes, inventory, { query = "", ingredient = "", status = "any", sort = "match" } = {}) {
  const q = normalize(query);
  const ing = normalize(ingredient);
  const scored = recipes.map((r) => {
    const coverage = inventoryCoverage(r.ingredients || [], inventory);
    return { recipe: r, ...coverage };
  });

  const filtered = scored.filter((s) => {
    if (q) {
      const hay = normalize((s.recipe.title || "") + " " + (s.recipe.tags || []).join(" ") + " " + (s.recipe.ingredients || []).map((i) => i.name).join(" "));
      if (!hay.includes(q)) return false;
    }
    if (ing) {
      const has = (s.recipe.ingredients || []).some((i) => labelMatch(i.name, ing));
      if (!has) return false;
    }
    if (status === "complete" && s.missing.length > 0) return false;
    if (status === "missing" && s.missing.length === 0) return false;
    return true;
  });

  if (sort === "az") filtered.sort((a, b) => a.recipe.title.localeCompare(b.recipe.title, "de"));
  else if (sort === "new") filtered.sort((a, b) => new Date(b.recipe.created_at || 0) - new Date(a.recipe.created_at || 0));
  else filtered.sort((a, b) => b.score - a.score || a.missing.length - b.missing.length);

  return filtered;
}

// ------------------------------------------------------------
// Smart-Shopping: fehlende Zutaten bündeln (nach Kategorie)
// ------------------------------------------------------------
export function buildShoppingList(selectedRecipes, inventory) {
  const missing = [];
  for (const r of selectedRecipes) {
    const cov = inventoryCoverage(r.ingredients || [], inventory);
    missing.push(...cov.missing);
  }
  const merged = mergeItems(missing).map((i) => ({ ...i, done: false }));
  return groupByCategory(merged);
}

export function groupByCategory(items) {
  const order = CATEGORIES;
  const groups = new Map();
  for (const it of items) {
    const cat = it.category || "Sonstiges";
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat).push(it);
  }
  return [...groups.entries()].sort((a, b) => {
    const ia = order.indexOf(a[0]);
    const ib = order.indexOf(b[0]);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
}

export function formatAmount(item) {
  const a = item.amount;
  const u = item.unit || "";
  if (a == null) return u;
  const num = Number.isInteger(a) ? String(a) : String(a).replace(".", ",");
  return u ? `${num} ${u}` : num;
}

export function modelInfo() {
  return {
    name: Synaptic.name,
    version: Synaptic.version,
    runtime: Synaptic.runtime,
    locale: Synaptic.locale,
    engines: Synaptic.engines,
    knowledge: KNOWLEDGE.length,
    categories: CATEGORIES.length,
    stats: { ...Synaptic.stats },
  };
}

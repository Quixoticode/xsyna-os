// ============================================================
// xSyna — Rezeptliste (/recipe-list)
// Bestand verwalten · Rezepte finden · Einkaufslisten smart bauen
// Powered by Synaptic Foundation Model (lokal im Browser)
// ============================================================
import { supabase } from "./js/supabase.js";
import "./js/sw-register.js";
import "./js/api-assets.js";
import { toast, confirmModal, escapeHtml } from "./js/ui.js";
import {
  Synaptic,
  parseLine,
  parseText,
  extractFromOcr,
  mergeItems,
  inventoryCoverage,
  suggestRecipes,
  buildShoppingList,
  groupByCategory,
  formatAmount,
  modelInfo,
  CATEGORIES,
} from "./js/synaptic.js";

const $ = (id) => document.getElementById(id);
const LS = {
  inventory: "xsynarec_inventory",
  recipes: "xsynarec_recipes",
  lists: "xsynarec_lists",
  selected: "xsynarec_selected",
};

const state = {
  mode: "local", // "cloud" | "local"
  user: null,
  inventory: [],
  recipes: [],
  lists: [],
  selectedRecipes: new Set(), // recipe ids für die Einkaufsliste
  tab: "bestand",
  recipeFilter: { query: "", ingredient: "", status: "any", sort: "match" },
};

const ICONS = {
  box: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8l-9-5-9 5v8l9 5 9-5V8z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v8"/></svg>',
  book: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
  cart: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>',
  camera: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>',
  mic: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>',
  type: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>',
  plus: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  trash: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>',
  spark: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3m0 12v3m9-9h-3M6 12H3m13.5-6.5l-2 2m-7 7l-2 2m11 0l-2-2m-7-7l-2-2"/><circle cx="12" cy="12" r="3"/></svg>',
  x: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  check: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  link: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
  edit: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
};

// ============================================================
// Store (Cloud + localStorage-Fallback)
// ============================================================
function uuid() {
  return (crypto.randomUUID && crypto.randomUUID()) || "id-" + Date.now() + "-" + Math.random().toString(36).slice(2);
}

function readLS(key, def) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def; } catch { return def; }
}
function writeLS(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* volle */ }
}

function mapRow(row) {
  return {
    id: row.id,
    name: row.name,
    amount: row.amount != null ? Number(row.amount) : null,
    unit: row.unit || "",
    category: row.category || "Sonstiges",
    source: row.source || "manual",
    created_at: row.created_at,
  };
}

async function setCloudMode() {
  const { data } = await supabase.auth.getSession();
  state.user = data?.session?.user || null;
  state.mode = state.user ? "cloud" : "local";
  renderModeBanner();
}

async function loadAll() {
  await setCloudMode();
  if (state.mode === "cloud") {
    try {
      const [{ data: inv, error: e1 }, { data: rec, error: e2 }, { data: lists, error: e3 }] = await Promise.all([
        supabase.from("recipe_inventory").select("*").order("created_at", { ascending: false }),
        supabase.from("recipes").select("*").order("created_at", { ascending: false }),
        supabase.from("shopping_lists").select("*").order("updated_at", { ascending: false }),
      ]);
      if (e1 || e2 || e3) throw new Error((e1 || e2 || e3).message);
      state.inventory = (inv || []).map(mapRow);
      state.recipes = (rec || []).map((r) => ({
        id: r.id,
        title: r.title,
        servings: r.servings,
        ingredients: r.ingredients || [],
        instructions: r.instructions || "",
        tags: r.tags || [],
        is_public: !!r.is_public,
        created_at: r.created_at,
      }));
      state.lists = (lists || []).map((l) => ({ id: l.id, title: l.title, items: l.items || [], created_at: l.created_at }));
    } catch (e) {
      console.warn("[Rezeptliste] Cloud-Fehler, Fallback auf lokal:", e);
      state.mode = "local";
      state.inventory = readLS(LS.inventory, []);
      state.recipes = readLS(LS.recipes, []);
      state.lists = readLS(LS.lists, []);
      toast("Cloud nicht erreichbar – Offline-/Gastmodus aktiv.", "warning", 5000);
    }
  } else {
    state.inventory = readLS(LS.inventory, []);
    state.recipes = readLS(LS.recipes, []);
    state.lists = readLS(LS.lists, []);
  }
  state.selectedRecipes = new Set(readLS(LS.selected, []));
  renderModeBanner();
}

async function persistInventory() {
  writeLS(LS.inventory, state.inventory);
  if (state.mode !== "cloud" || !state.user) return;
  try {
    const { error } = await supabase.from("recipe_inventory").delete().eq("user_id", state.user.id);
    if (error) throw error;
    if (state.inventory.length) {
      const { error: insErr } = await supabase.from("recipe_inventory").insert(
        state.inventory.map((i) => ({
          user_id: state.user.id,
          name: i.name,
          amount: i.amount,
          unit: i.unit,
          category: i.category,
          source: i.source,
        }))
      );
      if (insErr) throw insErr;
    }
  } catch (e) {
    console.warn("[Rezeptliste] Cloud-Sync Inventar fehlgeschlagen:", e);
    state.mode = "local";
    renderModeBanner();
  }
}

async function persistRecipes() {
  writeLS(LS.recipes, state.recipes);
  if (state.mode !== "cloud" || !state.user) return;
  try {
    const { error } = await supabase.from("recipes").delete().eq("user_id", state.user.id);
    if (error) throw error;
    if (state.recipes.length) {
      const { error: insErr } = await supabase.from("recipes").insert(
        state.recipes.map((r) => ({
          user_id: state.user.id,
          title: r.title,
          servings: r.servings || 2,
          ingredients: r.ingredients || [],
          instructions: r.instructions || "",
          tags: r.tags || [],
          is_public: !!r.is_public,
        }))
      );
      if (insErr) throw insErr;
    }
  } catch (e) {
    console.warn("[Rezeptliste] Cloud-Sync Rezepte fehlgeschlagen:", e);
    state.mode = "local";
    renderModeBanner();
  }
}

async function persistLists() {
  writeLS(LS.lists, state.lists);
  if (state.mode !== "cloud" || !state.user) return;
  try {
    const { error } = await supabase.from("shopping_lists").delete().eq("user_id", state.user.id);
    if (error) throw error;
    if (state.lists.length) {
      const { error: insErr } = await supabase.from("shopping_lists").insert(
        state.lists.map((l) => ({ user_id: state.user.id, title: l.title, items: l.items || [] }))
      );
      if (insErr) throw insErr;
    }
  } catch (e) {
    console.warn("[Rezeptliste] Cloud-Sync Listen fehlgeschlagen:", e);
    state.mode = "local";
    renderModeBanner();
  }
}

// ============================================================
// Banner & Nav
// ============================================================
function renderModeBanner() {
  const banner = $("offline-banner");
  if (!banner) return;
  const authBtn = $("auth-btn");
  if (authBtn) {
    if (state.user) {
      authBtn.innerHTML = `${ICONS.spark} Dashboard`;
      authBtn.href = "/internal-services";
    } else {
      authBtn.innerHTML = `${ICONS.spark} Anmelden`;
      authBtn.href = "/auth";
    }
  }
  if (state.mode === "cloud" && state.user) {
    banner.style.display = "none";
  } else {
    banner.style.display = "flex";
    banner.innerHTML = state.user
      ? `<span style="color: var(--text-secondary); font-size: 0.8rem;">⚠️ Offline-Sync unterbrochen – Änderungen werden lokal gespeichert.</span>`
      : `<span style="color: var(--text-secondary); font-size: 0.8rem;">👤 Gast-/Offline-Modus – Daten nur auf diesem Gerät. <a href="/auth" style="color: var(--lime); text-decoration: underline;">Anmelden</a> für Cloud-Sync.</span>`;
  }
}

// ============================================================
// Tabs
// ============================================================
const TABS = [
  { id: "bestand", label: "Bestand", icon: ICONS.box },
  { id: "rezepte", label: "Rezepte", icon: ICONS.book },
  { id: "einkauf", label: "Einkaufsliste", icon: ICONS.cart },
];

function renderTabs() {
  const el = $("tab-bar");
  el.innerHTML = TABS.map(
    (t) => `
    <button class="rec-tab ${state.tab === t.id ? "active" : ""}" data-tab="${t.id}">
      ${t.icon} ${t.label}
      ${t.id === "einkauf" && state.selectedRecipes.size ? `<span class="rec-badge">${state.selectedRecipes.size}</span>` : ""}
    </button>`
  ).join("");
  el.querySelectorAll(".rec-tab").forEach((b) => b.addEventListener("click", () => switchTab(b.dataset.tab)));
}

function switchTab(tab) {
  state.tab = tab;
  renderTabs();
  renderContent();
}

function renderContent() {
  const el = $("app-content");
  if (state.tab === "bestand") el.innerHTML = renderInventory();
  else if (state.tab === "rezepte") el.innerHTML = renderRecipes();
  else el.innerHTML = renderShopping();
  bindCurrentTab();
}

// ============================================================
// BESTAND
// ============================================================
function renderInventory() {
  const groups = groupByCategory(state.inventory);
  const total = state.inventory.length;
  const cards = CATEGORIES.slice(0, 3).map((c) => {
    const count = state.inventory.filter((i) => i.category === c).length;
    return `<span class="rec-kpi">${c}: <b style="color: var(--lime);">${count}</b></span>`;
  }).join("");

  if (!total) {
    return `
      <div class="card rec-empty">
        ${ICONS.box}
        <h3>Dein Bestand ist leer</h3>
        <p style="color: var(--text-secondary); max-width: 420px; margin: 0 auto 24px;">Trage ein, was du vorrätig hast – manuell, per Kamera (Etiketten-Scan) oder per Sprache. Die Synaptic-Engine erkennt Labels automatisch.</p>
        <button class="btn btn-lime" id="btn-add-item">${ICONS.plus} Ersten Artikel hinzufügen</button>
      </div>
    `;
  }

  return `
    <div class="rec-toolbar">
      <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
        <input id="inv-search" class="rec-input" placeholder="Bestand durchsuchen…" style="width: 240px;" />
        <span class="rec-kpi">${total} Artikel</span>
      </div>
      <button class="btn btn-lime btn-sm" id="btn-add-item">${ICONS.plus} Hinzufügen</button>
    </div>
    <div class="rec-kpis">${cards}</div>
    <div id="inv-groups">${groups.map(([cat, items]) => renderInvGroup(cat, items)).join("")}</div>
  `;
}

function renderInvGroup(cat, items) {
  return `
    <div class="rec-group">
      <div class="rec-group-head"><span>${escapeHtml(cat)}</span><span class="rec-group-count">${items.length}</span></div>
      <div class="rec-rows">
        ${items.map(renderInvRow).join("")}
      </div>
    </div>
  `;
}

function renderInvRow(item) {
  const srcIcon = item.source === "camera" ? ICONS.camera : item.source === "mic" ? ICONS.mic : ICONS.type;
  const srcTitle = item.source === "camera" ? "per Kamera erfasst" : item.source === "mic" ? "per Sprache erfasst" : "manuell erfasst";
  return `
    <div class="rec-row" data-id="${item.id}">
      <span class="rec-src" title="${srcTitle}">${srcIcon}</span>
      <span class="rec-name">${escapeHtml(item.name)}</span>
      <span class="rec-amount">${formatAmount(item)}</span>
      <button class="rec-icon-btn" data-act="edit" title="Menge ändern">${ICONS.edit}</button>
      <button class="rec-icon-btn danger" data-act="del" title="Löschen">${ICONS.trash}</button>
    </div>
  `;
}

// ============================================================
// REZEPTE
// ============================================================
function renderRecipes() {
  const f = state.recipeFilter;
  const scored = suggestRecipes(state.recipes, state.inventory, f);

  return `
    <div class="rec-toolbar">
      <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
        <input id="rec-search" class="rec-input" placeholder="Rezepte suchen…" style="width: 200px;" value="${escapeHtml(f.query)}" />
        <input id="rec-ingredient" class="rec-input" placeholder="Zutat filtern (z. B. Tomaten)" style="width: 190px;" value="${escapeHtml(f.ingredient)}" />
        <select id="rec-status" class="rec-input" style="width: auto;">
          <option value="any" ${f.status === "any" ? "selected" : ""}>Alle</option>
          <option value="complete" ${f.status === "complete" ? "selected" : ""}>Nur machbar (nichts fehlt)</option>
          <option value="missing" ${f.status === "missing" ? "selected" : ""}>Es fehlt etwas</option>
        </select>
        <select id="rec-sort" class="rec-input" style="width: auto;">
          <option value="match" ${f.sort === "match" ? "selected" : ""}>Passend zum Bestand</option>
          <option value="new" ${f.sort === "new" ? "selected" : ""}>Neueste</option>
          <option value="az" ${f.sort === "az" ? "selected" : ""}>A–Z</option>
        </select>
      </div>
      <button class="btn btn-lime btn-sm" id="btn-new-recipe">${ICONS.plus} Neues Rezept</button>
    </div>

    <div class="rec-kpis">
      <span class="rec-kpi">${state.recipes.length} Rezepte</span>
      <span class="rec-kpi">${scored.filter((s) => s.complete).length} machbar mit deinem Bestand</span>
    </div>

    ${scored.length ? `<div class="rec-cards">${scored.map(renderRecipeCard).join("")}</div>` : renderEmptyRecipes()}
  `;
}

function renderEmptyRecipes() {
  return `
    <div class="card rec-empty">
      ${ICONS.book}
      <h3>Keine Rezepte gefunden</h3>
      <p style="color: var(--text-secondary); max-width: 420px; margin: 0 auto 24px;">Lege deine ersten Rezepte an – die Synaptic-Engine parst die Zutatenliste automatisch und gleicht sie mit deinem Bestand ab.</p>
      <button class="btn btn-lime" id="btn-new-recipe">${ICONS.plus} Rezept anlegen</button>
    </div>
  `;
}

function renderRecipeCard(s) {
  const r = s.recipe;
  const pct = Math.round(s.score * 100);
  const missingChips = s.missing.slice(0, 3).map((m) => `<span class="rec-chip">${escapeHtml(m.name)}</span>`).join("");
  const more = s.missing.length > 3 ? `<span class="rec-chip muted">+${s.missing.length - 3} mehr</span>` : "";
  const selected = state.selectedRecipes.has(r.id);
  return `
    <div class="card rec-recipe ${s.complete ? "ok" : ""}" data-id="${r.id}">
      <div class="rec-recipe-head">
        <h3 style="font-size: 1rem; font-weight: 600;">${escapeHtml(r.title)}</h3>
        <span class="rec-coverage ${s.complete ? "ok" : ""}" title="${s.have}/${s.total} Zutaten vorhanden">
          ${s.complete ? ICONS.check : ""} ${s.have}/${s.total}
        </span>
      </div>
      ${(r.tags || []).length ? `<div style="display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px;">${r.tags.map((t) => `<span class="rec-chip">${escapeHtml(t)}</span>`).join("")}</div>` : ""}
      <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 14px;">
        ${s.complete ? `<span class="rec-chip ok">✅ Alles vorhanden</span>` : ""}
        ${missingChips}${more}
      </div>
      <div class="rec-recipe-actions">
        <button class="btn btn-secondary btn-sm" data-act="view">Details</button>
        <button class="btn ${selected ? "btn-lime" : "btn-secondary"} btn-sm" data-act="toggleshop">${ICONS.cart} ${selected ? "Ausgewählt" : "Einkaufsliste"}</button>
      </div>
    </div>
  `;
}

// ============================================================
// EINKAUFSLISTE
// ============================================================
let currentListItems = []; // [{name, amount, unit, category, done}]
let currentListTitle = "Einkaufsliste";

function selectedRecipeObjects() {
  return state.recipes.filter((r) => state.selectedRecipes.has(r.id));
}

function renderShopping() {
  const selected = selectedRecipeObjects();
  const saved = state.lists;
  const groups = groupByCategory(currentListItems);
  const doneCount = currentListItems.filter((i) => i.done).length;

  return `
    <div class="rec-toolbar">
      <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
        <input id="list-title" class="rec-input" value="${escapeHtml(currentListTitle)}" style="width: 220px;" placeholder="Listenname" />
        <span class="rec-kpi">${currentListItems.length} Positionen · ${doneCount} erledigt</span>
      </div>
      <div style="display: flex; gap: 8px; flex-wrap: wrap;">
        <button class="btn btn-lime btn-sm" id="btn-recalc">${ICONS.spark} Smart neu berechnen</button>
        <button class="btn btn-secondary btn-sm" id="btn-add-manual">${ICONS.plus} Manuell</button>
        <button class="btn btn-secondary btn-sm" id="btn-copy">Kopieren</button>
        <button class="btn btn-secondary btn-sm" id="btn-save-list">Speichern</button>
      </div>
    </div>

    <div class="rec-kpis">
      <span class="rec-kpi">${selected.length} Rezepte ausgewählt</span>
      <span class="rec-kpi">${currentListItems.length} Artikel</span>
    </div>

    ${selected.length ? `
      <div class="card" style="padding: 16px; margin-bottom: 24px; display: flex; flex-wrap: wrap; gap: 8px; align-items: center;">
        <span style="font-size: 0.8rem; color: var(--text-muted); margin-right: 4px;">Rezepte:</span>
        ${selected.map((r) => `<span class="rec-chip">${escapeHtml(r.title)} <button class="rec-chip-x" data-recipe="${r.id}">×</button></span>`).join("")}
        <button class="btn btn-secondary btn-sm" id="btn-clear-selection" style="margin-left: auto;">Auswahl leeren</button>
      </div>` : `
      <div class="card rec-empty" style="margin-bottom: 24px;">
        ${ICONS.cart}
        <h3>Noch keine Rezepte ausgewählt</h3>
        <p style="color: var(--text-secondary); max-width: 460px; margin: 0 auto;">Gehe zu <b>Rezepte</b> und wähle Rezepte aus – die Einkaufsliste wird automatisch aus den Zutaten gebaut, die in deinem Bestand fehlen.</p>
      </div>`}

    ${groups.length ? `
      <div style="margin-bottom: 24px;">
        <div class="rec-group-head" style="margin-bottom: 8px;"><span>Fehlende Zutaten (${currentListItems.length})</span>
          <span style="display:flex; gap:8px;"><button class="rec-link" id="btn-check-all">Alle abhaken</button><button class="rec-link" id="btn-uncheck-all">Zurücksetzen</button></span>
        </div>
        ${groups.map(([cat, items]) => `
          <div class="rec-group">
            <div class="rec-group-head"><span>${escapeHtml(cat)}</span><span class="rec-group-count">${items.length}</span></div>
            <div class="rec-rows">
              ${items.map((i) => `
                <div class="rec-row ${i.done ? "done" : ""}" data-name="${escapeHtml(i.name)}">
                  <button class="rec-check ${i.done ? "on" : ""}" data-name="${escapeHtml(i.name)}">${i.done ? ICONS.check : ""}</button>
                  <span class="rec-name" style="${i.done ? "text-decoration: line-through; color: var(--text-muted);" : ""}">${escapeHtml(i.name)}</span>
                  <span class="rec-amount">${formatAmount(i)}</span>
                  <button class="rec-icon-btn danger" data-remove="${escapeHtml(i.name)}" title="Entfernen">${ICONS.trash}</button>
                </div>`).join("")}
            </div>
          </div>`).join("")}
      </div>` : `
      <div class="card rec-empty">
        ${ICONS.spark}
        <h3>${selected.length ? "Alles vorhanden! 🎉" : "Liste ist leer"}</h3>
        <p style="color: var(--text-secondary);">${selected.length ? "Für die ausgewählten Rezepte fehlt nichts in deinem Bestand." : "Klicke auf „Smart neu berechnen“, um die Liste aus deinen Rezepten zu bauen."}</p>
      </div>`}

    ${saved.length ? `
      <div class="rec-group" style="margin-top: 32px;">
        <div class="rec-group-head"><span>Gespeicherte Listen</span></div>
        <div class="rec-rows">
          ${saved.map((l) => `
            <div class="rec-row" data-list="${l.id}">
              <span class="rec-name">${escapeHtml(l.title)}</span>
              <span class="rec-amount">${l.items.length} Positionen</span>
              <button class="rec-icon-btn" data-load="${l.id}" title="Laden">${ICONS.link}</button>
              <button class="rec-icon-btn danger" data-dellist="${l.id}" title="Löschen">${ICONS.trash}</button>
            </div>`).join("")}
        </div>
      </div>` : ""}
  `;
}

// ============================================================
// Bindings
// ============================================================
function bindCurrentTab() {
  if (state.tab === "bestand") bindInventory();
  else if (state.tab === "rezepte") bindRecipes();
  else bindShopping();
}

function bindInventory() {
  $("btn-add-item")?.addEventListener("click", () => openAddModal());
  const search = $("inv-search");
  if (search) {
    search.addEventListener("input", () => {
      const q = search.value.trim().toLowerCase();
      const groups = groupByCategory(
        q ? state.inventory.filter((i) => i.name.toLowerCase().includes(q) || (i.category || "").toLowerCase().includes(q)) : state.inventory
      );
      $("inv-groups").innerHTML = groups.map(([cat, items]) => renderInvGroup(cat, items)).join("");
      bindInvRows();
    });
  }
  bindInvRows();
}

function bindInvRows() {
  document.querySelectorAll("#app-content .rec-row[data-id]").forEach((row) => {
    const id = row.dataset.id;
    row.querySelector('[data-act="del"]')?.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!(await confirmModal("Diesen Artikel aus dem Bestand entfernen?"))) return;
      state.inventory = state.inventory.filter((i) => i.id !== id);
      await persistInventory();
      renderContent();
      toast("Artikel entfernt.", "success");
    });
    row.querySelector('[data-act="edit"]')?.addEventListener("click", (e) => {
      e.stopPropagation();
      const item = state.inventory.find((i) => i.id === id);
      if (item) openAmountEditor(item);
    });
  });
}

function bindRecipes() {
  $("btn-new-recipe")?.addEventListener("click", () => openRecipeModal());
  const f = state.recipeFilter;
  const q = $("rec-search");
  if (q) q.addEventListener("input", () => { f.query = q.value; rerenderRecipes(); });
  const ing = $("rec-ingredient");
  if (ing) ing.addEventListener("input", () => { f.ingredient = ing.value; rerenderRecipes(); });
  const status = $("rec-status");
  if (status) status.addEventListener("change", () => { f.status = status.value; rerenderRecipes(); });
  const sort = $("rec-sort");
  if (sort) sort.addEventListener("change", () => { f.sort = sort.value; rerenderRecipes(); });

  document.querySelectorAll("#app-content .rec-recipe").forEach((card) => {
    const id = card.dataset.id;
    card.querySelector('[data-act="view"]')?.addEventListener("click", () => openRecipeModal(id));
    card.querySelector('[data-act="toggleshop"]')?.addEventListener("click", async () => {
      if (state.selectedRecipes.has(id)) state.selectedRecipes.delete(id);
      else state.selectedRecipes.add(id);
      writeLS(LS.selected, [...state.selectedRecipes]);
      renderTabs();
      rerenderRecipes();
      toast(state.selectedRecipes.has(id) ? "Rezept zur Einkaufsliste hinzugefügt." : "Rezept abgewählt.", "info");
    });
  });
}

function rerenderRecipes() {
  const wrap = $("app-content");
  if (wrap) wrap.innerHTML = renderRecipes();
  bindRecipes();
}

function bindShopping() {
  $("btn-recalc")?.addEventListener("click", () => {
    const selected = selectedRecipeObjects();
    if (!selected.length) { toast("Erst Rezepte auswählen (Tab „Rezepte“).", "warning"); return; }
    const t0 = performance.now();
    const grouped = buildShoppingList(selected, state.inventory);
    currentListItems = grouped.flatMap(([, items]) => items);
    toast(`Einkaufsliste mit ${currentListItems.length} Positionen erstellt (${Math.round(performance.now() - t0)} ms).`, "success");
    renderContent();
  });

  $("btn-add-manual")?.addEventListener("click", () => openAddModal(true));

  $("btn-copy")?.addEventListener("click", async () => {
    const text = currentListItems.length
      ? currentListItems.map((i) => `${i.done ? "[x]" : "[ ]"} ${formatAmount(i)} ${i.name}`).join("\n")
      : "Einkaufsliste ist leer.";
    try {
      await navigator.clipboard.writeText(text);
      toast("Liste kopiert.", "success");
    } catch {
      prompt("Liste kopieren:", text);
    }
  });

  $("btn-save-list")?.addEventListener("click", async () => {
    if (!currentListItems.length) { toast("Liste ist leer.", "warning"); return; }
    const title = ($("list-title")?.value || "").trim() || "Einkaufsliste";
    const existing = state.lists.find((l) => l.title === title);
    if (existing) {
      existing.items = currentListItems;
    } else {
      state.lists.unshift({ id: uuid(), title, items: currentListItems, created_at: new Date().toISOString() });
    }
    await persistLists();
    toast("Liste gespeichert.", "success");
    renderContent();
  });

  $("btn-clear-selection")?.addEventListener("click", () => {
    state.selectedRecipes.clear();
    writeLS(LS.selected, []);
    renderContent();
  });

  document.querySelectorAll("#app-content [data-recipe]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.selectedRecipes.delete(btn.dataset.recipe);
      writeLS(LS.selected, [...state.selectedRecipes]);
      renderContent();
    });
  });

  document.querySelectorAll("#app-content .rec-check").forEach((btn) => {
    btn.addEventListener("click", () => {
      const item = currentListItems.find((i) => i.name === btn.dataset.name);
      if (item) item.done = !item.done;
      renderContent();
    });
  });

  document.querySelectorAll("#app-content [data-remove]").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentListItems = currentListItems.filter((i) => i.name !== btn.dataset.remove);
      renderContent();
    });
  });

  $("btn-check-all")?.addEventListener("click", () => {
    currentListItems.forEach((i) => (i.done = true));
    renderContent();
  });
  $("btn-uncheck-all")?.addEventListener("click", () => {
    currentListItems.forEach((i) => (i.done = false));
    renderContent();
  });

  document.querySelectorAll("#app-content [data-load]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const list = state.lists.find((l) => l.id === btn.dataset.load);
      if (!list) return;
      currentListItems = list.items.map((i) => ({ ...i }));
      currentListTitle = list.title;
      renderContent();
      toast(`Liste „${list.title}“ geladen.`, "success");
    });
  });

  document.querySelectorAll("#app-content [data-dellist]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!(await confirmModal("Gespeicherte Liste löschen?"))) return;
      state.lists = state.lists.filter((l) => l.id !== btn.dataset.dellist);
      await persistLists();
      renderContent();
    });
  });

  const titleInput = $("list-title");
  if (titleInput) titleInput.addEventListener("input", () => (currentListTitle = titleInput.value));
}

// ============================================================
// Modal: Artikel hinzufügen (manuell / Kamera / Mikro)
// ============================================================
let addModalCandidates = [];

function openAddModal(forShoppingList = false) {
  addModalCandidates = [];
  const overlay = document.createElement("div");
  overlay.className = "rec-overlay";
  overlay.innerHTML = `
    <div class="rec-modal">
      <div class="rec-modal-head">
        <h3 style="font-size: 1.05rem;">Artikel hinzufügen</h3>
        <button class="rec-icon-btn" data-close>${ICONS.x}</button>
      </div>
      <p style="color: var(--text-muted); font-size: 0.8rem; margin-bottom: 16px;">Synaptic Foundation Model · lokal · Eingabe wird automatisch erkannt</p>
      <div class="rec-source-grid">
        <button class="rec-source" data-mode="manual">${ICONS.type}<span>Manuell</span><small>Zutaten eintippen</small></button>
        <button class="rec-source" data-mode="camera">${ICONS.camera}<span>Kamera</span><small>Etikett scannen</small></button>
        <button class="rec-source" data-mode="mic">${ICONS.mic}<span>Sprache</span><small>Diktieren</small></button>
      </div>
      <div id="add-mode-body"></div>
      <div id="add-candidates"></div>
      <div class="rec-modal-foot" id="add-foot" style="display: none;">
        <button class="btn btn-secondary btn-sm" data-cancel>Abbrechen</button>
        <button class="btn btn-lime btn-sm" id="btn-confirm-add">${ICONS.plus} Hinzufügen (0)</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('[data-close]').addEventListener("click", () => { cleanupStream(); overlay.remove(); });
  overlay.querySelector('[data-cancel]').addEventListener("click", () => { cleanupStream(); overlay.remove(); });
  overlay.addEventListener("click", (e) => { if (e.target === overlay) { cleanupStream(); overlay.remove(); } });

  overlay.querySelector("#btn-confirm-add").addEventListener("click", async () => {
    const selected = addModalCandidates.filter((c) => c.selected);
    if (!selected.length) return;
    if (forShoppingList) {
      currentListItems = mergeItems([
        ...currentListItems,
        ...selected.map((s) => ({ name: s.name, amount: s.amount, unit: s.unit || "", category: s.category || "Sonstiges", done: false })),
      ]);
    } else {
      for (const s of selected) {
        const existing = state.inventory.find((i) => i.name === s.name && (i.unit || "") === (s.unit || ""));
        if (existing && s.amount != null && existing.amount != null) {
          existing.amount = Math.round((existing.amount + s.amount) * 100) / 100;
        } else {
          state.inventory.unshift({
            id: uuid(),
            name: s.name,
            amount: s.amount,
            unit: s.unit || "",
            category: s.category || "Sonstiges",
            source: s.source || "manual",
            created_at: new Date().toISOString(),
          });
        }
      }
      await persistInventory();
    }
    cleanupStream();
    overlay.remove();
    renderContent();
    toast(`${selected.length} Artikel hinzugefügt.`, "success");
  });

  overlay.querySelectorAll(".rec-source").forEach((b) => {
    b.addEventListener("click", () => activateAddMode(b.dataset.mode, overlay, forShoppingList));
  });
}

function activateAddMode(mode, overlay, forShoppingList) {
  overlay.querySelectorAll(".rec-source").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
  const body = overlay.querySelector("#add-mode-body");
  const foot = overlay.querySelector("#add-foot");
  cleanupStream();

  if (mode === "manual") {
    body.innerHTML = `
      <textarea id="manual-text" class="rec-input" rows="5" placeholder="z. B.&#10;2 Tomaten&#10;1 Zwiebel&#10;500 g Mehl&#10;Milch"></textarea>
      <button class="btn btn-secondary btn-sm" id="btn-parse" style="margin-top: 10px;">${ICONS.spark} Erkennen</button>
    `;
    body.querySelector("#btn-parse").addEventListener("click", () => {
      addModalCandidates = parseText(body.querySelector("#manual-text").value).map((i) => ({ ...i, source: "manual", selected: true }));
      renderCandidates(overlay, foot);
    });
  } else if (mode === "camera") {
    body.innerHTML = `
      <div class="rec-cam">
        <video id="cam-video" autoplay playsinline muted style="width: 100%; border-radius: 8px; background: #000; max-height: 300px;"></video>
        <div class="rec-cam-actions">
          <button class="btn btn-lime btn-sm" id="btn-capture">${ICONS.camera} Foto aufnehmen</button>
        </div>
        <div id="ocr-progress" style="display: none; margin-top: 10px;">
          <div class="rec-progress"><div id="ocr-bar" style="width: 0%"></div></div>
          <p id="ocr-status" style="color: var(--text-muted); font-size: 0.75rem; margin-top: 6px;">OCR läuft…</p>
        </div>
      </div>
    `;
    const video = body.querySelector("#cam-video");
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then((stream) => {
        window.__recStream = stream;
        video.srcObject = stream;
        video.play().catch(() => {});
      })
      .catch((e) => {
        body.innerHTML = `<p style="color: var(--error); font-size: 0.85rem;">Kamera nicht verfügbar: ${escapeHtml(e.message)}</p>`;
      });
    body.querySelector("#btn-capture").addEventListener("click", async () => {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
      cleanupStream();
      body.querySelector("#ocr-progress").style.display = "block";
      try {
        const items = await runOcr(dataUrl, body.querySelector("#ocr-bar"), body.querySelector("#ocr-status"));
        addModalCandidates = items.map((i) => ({ ...i, selected: true }));
        renderCandidates(overlay, foot);
        body.querySelector("#ocr-progress").style.display = "none";
      } catch (e) {
        body.querySelector("#ocr-progress").style.display = "none";
        body.innerHTML = `<p style="color: var(--error); font-size: 0.85rem;">OCR fehlgeschlagen: ${escapeHtml(e.message)}<br><span style="color: var(--text-muted);">Offline? OCR-Modell wird beim ersten Mal aus dem CDN geladen.</span></p>`;
      }
    });
  } else {
    body.innerHTML = `
      <div style="text-align: center; padding: 12px 0;">
        <button class="btn btn-lime" id="btn-mic">${ICONS.mic} Aufnahme starten</button>
        <p id="mic-status" style="color: var(--text-muted); font-size: 0.8rem; margin-top: 12px;">Sage z. B. „zwei Tomaten, eine Zwiebel, fünfhundert Gramm Mehl“</p>
        <p id="mic-interim" style="color: var(--lime); font-size: 0.85rem; margin-top: 8px; min-height: 20px;"></p>
      </div>
    `;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      body.innerHTML = `<p style="color: var(--warning); font-size: 0.85rem;">Spracherkennung wird von diesem Browser nicht unterstützt. Nutze Chrome oder Edge – oder die manuelle Eingabe.</p>`;
      return;
    }
    let recognition = null;
    let finalText = "";
    const btn = body.querySelector("#btn-mic");
    const status = body.querySelector("#mic-status");
    const interim = body.querySelector("#mic-interim");

    const stop = () => {
      try { recognition?.stop(); } catch { /* noop */ }
      btn.innerHTML = `${ICONS.mic} Aufnahme starten`;
      btn.classList.remove("rec-recording");
      status.textContent = "Fertig. Erkanntes wird jetzt verarbeitet…";
    };
    const start = () => {
      finalText = "";
      recognition = new SR();
      recognition.lang = "de-DE";
      recognition.interimResults = true;
      recognition.continuous = true;
      recognition.onresult = (e) => {
        let interimText = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) finalText += r[0].transcript + " ";
          else interimText += r[0].transcript;
        }
        interim.textContent = (finalText + interimText).trim();
      };
      recognition.onend = () => {
        btn.innerHTML = `${ICONS.mic} Aufnahme starten`;
        btn.classList.remove("rec-recording");
        status.textContent = "Verarbeite Sprache…";
        const items = parseText(finalText || interim.textContent).map((i) => ({ ...i, source: "mic", selected: true }));
        if (items.length) {
          addModalCandidates = items;
          renderCandidates(overlay, foot);
          status.textContent = `${items.length} Artikel erkannt.`;
        } else {
          status.textContent = "Nichts Verständliches erkannt. Bitte erneut versuchen.";
        }
      };
      recognition.onerror = (e) => {
        status.textContent = "Fehler: " + e.error;
        btn.classList.remove("rec-recording");
      };
      recognition.start();
    };

    btn.addEventListener("click", () => {
      if (btn.classList.contains("rec-recording")) stop();
      else {
        btn.innerHTML = `${ICONS.mic} Aufnahme läuft… (klicken zum Stoppen)`;
        btn.classList.add("rec-recording");
        start();
      }
    });
  }
}

async function runOcr(dataUrl, bar, statusEl) {
  const { createWorker } = await import("https://cdn.jsdelivr.net/npm/tesseract.js@5/+esm");
  statusEl.textContent = "OCR-Modell wird geladen (erster Scan)…";
  const worker = await createWorker("deu+eng", 1, {
    logger: (m) => {
      if (m.status === "recognizing text" && bar) {
        bar.style.width = Math.round(m.progress * 100) + "%";
        statusEl.textContent = `Text wird erkannt… ${Math.round(m.progress * 100)}%`;
      }
    },
  });
  const { data } = await worker.recognize(dataUrl);
  await worker.terminate();
  return extractFromOcr(data.text);
}

function cleanupStream() {
  if (window.__recStream) {
    window.__recStream.getTracks().forEach((t) => t.stop());
    window.__recStream = null;
  }
}

function renderCandidates(overlay, foot) {
  const wrap = overlay.querySelector("#add-candidates");
  const confirmBtn = overlay.querySelector("#btn-confirm-add");
  if (!addModalCandidates.length) {
    wrap.innerHTML = `<p style="color: var(--text-muted); font-size: 0.85rem; padding: 12px 0;">Nichts erkannt. Versuche es erneut oder korrigiere die Eingabe.</p>`;
    foot.style.display = "none";
    return;
  }
  wrap.innerHTML = `
    <div class="rec-group" style="margin-top: 16px;">
      <div class="rec-group-head"><span>Erkannte Artikel (${addModalCandidates.length})</span><span class="rec-group-count">klick zum Bearbeiten</span></div>
      <div class="rec-rows">
        ${addModalCandidates.map((c, idx) => `
          <div class="rec-row" data-idx="${idx}">
            <button class="rec-check ${c.selected ? "on" : ""}" data-toggle="${idx}">${c.selected ? ICONS.check : ""}</button>
            <span class="rec-name">
              <input class="rec-inline-input" data-field="name" data-idx="${idx}" value="${escapeHtml(c.name)}" style="font-weight: 500;" />
              <span style="display:flex; gap:6px; margin-top:4px;">
                <input class="rec-inline-input" data-field="amount" data-idx="${idx}" value="${c.amount ?? ""}" placeholder="Menge" style="width: 70px;" />
                <input class="rec-inline-input" data-field="unit" data-idx="${idx}" value="${escapeHtml(c.unit)}" placeholder="Einheit" style="width: 90px;" />
              </span>
            </span>
            <span class="rec-conf">${Math.round(c.confidence * 100)}%</span>
          </div>`).join("")}
      </div>
    </div>
  `;
  foot.style.display = "flex";

  wrap.querySelectorAll("[data-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const c = addModalCandidates[Number(btn.dataset.toggle)];
      c.selected = !c.selected;
      btn.classList.toggle("on", c.selected);
      btn.innerHTML = c.selected ? ICONS.check : "";
      updateConfirmCount(confirmBtn);
    });
  });
  wrap.querySelectorAll("[data-field]").forEach((input) => {
    input.addEventListener("input", () => {
      const c = addModalCandidates[Number(input.dataset.idx)];
      const field = input.dataset.field;
      if (field === "amount") c.amount = input.value.trim() === "" ? null : Number(String(input.value).replace(",", "."));
      else if (field === "unit") c.unit = input.value.trim();
      else c.name = input.value.trim();
    });
  });
  updateConfirmCount(confirmBtn);
}

function updateConfirmCount(btn) {
  const n = addModalCandidates.filter((c) => c.selected).length;
  btn.innerHTML = `${ICONS.plus} Hinzufügen (${n})`;
  btn.disabled = n === 0;
}

// ============================================================
// Modal: Menge bearbeiten
// ============================================================
function openAmountEditor(item) {
  const overlay = document.createElement("div");
  overlay.className = "rec-overlay";
  overlay.innerHTML = `
    <div class="rec-modal" style="max-width: 380px;">
      <div class="rec-modal-head">
        <h3 style="font-size: 1rem;">${escapeHtml(item.name)}</h3>
        <button class="rec-icon-btn" data-close>${ICONS.x}</button>
      </div>
      <div style="display: flex; gap: 10px; margin-top: 8px;">
        <input id="edit-amount" class="rec-input" type="number" step="any" min="0" value="${item.amount ?? ""}" placeholder="Menge" style="width: 110px;" />
        <input id="edit-unit" class="rec-input" value="${escapeHtml(item.unit)}" placeholder="Einheit" style="flex: 1;" />
      </div>
      <div class="rec-modal-foot">
        <button class="btn btn-secondary btn-sm" data-close2>Abbrechen</button>
        <button class="btn btn-lime btn-sm" id="btn-save-edit">Speichern</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector("[data-close]").addEventListener("click", close);
  overlay.querySelector("[data-close2]").addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  overlay.querySelector("#btn-save-edit").addEventListener("click", async () => {
    const a = overlay.querySelector("#edit-amount").value.trim();
    item.amount = a === "" ? null : Number(a.replace(",", "."));
    item.unit = overlay.querySelector("#edit-unit").value.trim();
    await persistInventory();
    close();
    renderContent();
    toast("Bestand aktualisiert.", "success");
  });
}

// ============================================================
// Modal: Rezept anlegen / ansehen
// ============================================================
function openRecipeModal(id) {
  const existing = id ? state.recipes.find((r) => r.id === id) : null;
  const overlay = document.createElement("div");
  overlay.className = "rec-overlay";
  overlay.innerHTML = `
    <div class="rec-modal rec-modal-lg">
      <div class="rec-modal-head">
        <h3 style="font-size: 1.05rem;">${existing ? "Rezept-Details" : "Neues Rezept"}</h3>
        <button class="rec-icon-btn" data-close>${ICONS.x}</button>
      </div>
      <div id="recipe-body">
        ${existing ? renderRecipeDetail(existing) : renderRecipeForm()}
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector("[data-close]").addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });

  if (existing) {
    overlay.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => {
      overlay.querySelector("#recipe-body").innerHTML = renderRecipeForm(existing);
      bindRecipeForm(overlay);
    }));
    overlay.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async () => {
      if (!(await confirmModal(`Rezept „${existing.title}“ löschen?`))) return;
      state.recipes = state.recipes.filter((r) => r.id !== existing.id);
      state.selectedRecipes.delete(existing.id);
      await persistRecipes();
      overlay.remove();
      renderContent();
      toast("Rezept gelöscht.", "success");
    }));
  } else {
    bindRecipeForm(overlay);
  }
}

function renderRecipeDetail(r) {
  const cov = inventoryCoverage(r.ingredients || [], state.inventory);
  return `
    <h2 style="font-size: 1.4rem; margin-bottom: 4px;">${escapeHtml(r.title)}</h2>
    <p style="color: var(--text-muted); font-size: 0.8rem; margin-bottom: 16px;">${r.servings || 2} Portionen · ${(r.ingredients || []).length} Zutaten · ${r.is_public ? "öffentlich" : "privat"}</p>
    ${(r.tags || []).length ? `<div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom: 16px;">${r.tags.map((t) => `<span class="rec-chip">${escapeHtml(t)}</span>`).join("")}</div>` : ""}
    <div style="margin-bottom: 16px;">
      <div class="rec-group-head" style="margin-bottom: 8px;"><span>Zutaten (${cov.have}/${cov.total} im Bestand)</span>
        <span class="rec-coverage ${cov.complete ? "ok" : ""}" style="font-size: 0.7rem;">${cov.complete ? "✅ Alles vorhanden" : `${cov.missing.length} fehlen`}</span>
      </div>
      <div class="rec-rows">
        ${(r.ingredients || []).map((i) => {
          const have = state.inventory.some((inv) => inv.name.toLowerCase() === i.name.toLowerCase());
          return `<div class="rec-row ${have ? "done" : ""}">
            <span class="rec-check ${have ? "on" : ""}">${have ? ICONS.check : ""}</span>
            <span class="rec-name">${escapeHtml(i.name)}</span>
            <span class="rec-amount">${formatAmount(i)}</span>
          </div>`;
        }).join("")}
      </div>
    </div>
    ${r.instructions ? `<div style="margin-bottom: 16px;"><div class="rec-group-head" style="margin-bottom: 8px;"><span>Zubereitung</span></div><p style="color: var(--text-secondary); font-size: 0.88rem; white-space: pre-wrap; line-height: 1.7;">${escapeHtml(r.instructions)}</p></div>` : ""}
    <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 20px;">
      <button class="btn btn-secondary btn-sm" data-del>${ICONS.trash} Löschen</button>
      <button class="btn btn-lime btn-sm" data-edit>${ICONS.edit} Bearbeiten</button>
    </div>
  `;
}

function renderRecipeForm(r) {
  const ingredientsText = r ? (r.ingredients || []).map((i) => `${formatAmount(i)} ${i.name}`.trim()).join("\n") : "";
  return `
    <div style="display: flex; flex-direction: column; gap: 12px;">
      <div style="display: flex; gap: 10px;">
        <input id="rf-title" class="rec-input" placeholder="Titel, z. B. Spaghetti Bolognese" value="${escapeHtml(r?.title || "")}" style="flex: 1;" />
        <input id="rf-servings" class="rec-input" type="number" min="1" value="${r?.servings || 2}" style="width: 90px;" title="Portionen" />
      </div>
      <div>
        <label class="rec-label">Zutaten (eine pro Zeile – wird automatisch erkannt)</label>
        <textarea id="rf-ingredients" class="rec-input" rows="6" placeholder="400 g Spaghetti&#10;2 Tomaten&#10;1 Zwiebel">${escapeHtml(ingredientsText)}</textarea>
      </div>
      <div>
        <label class="rec-label">Zubereitung</label>
        <textarea id="rf-instructions" class="rec-input" rows="4" placeholder="Schritt für Schritt…">${escapeHtml(r?.instructions || "")}</textarea>
      </div>
      <div style="display: flex; gap: 10px; align-items: center;">
        <input id="rf-tags" class="rec-input" placeholder="Tags (kommagetrennt), z. B. Pasta, Vegetarisch" value="${escapeHtml((r?.tags || []).join(", "))}" style="flex: 1;" />
        <label style="display: flex; align-items: center; gap: 8px; font-size: 0.8rem; color: var(--text-secondary); white-space: nowrap;">
          <input type="checkbox" id="rf-public" ${r?.is_public ? "checked" : ""} /> öffentlich
        </label>
      </div>
      <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 8px;">
        <button class="btn btn-secondary btn-sm" data-cancel>Abbrechen</button>
        <button class="btn btn-lime btn-sm" id="btn-save-recipe" data-edit-id="${r?.id || ""}">${ICONS.spark} Speichern</button>
      </div>
    </div>
  `;
}

function bindRecipeForm(overlay) {
  overlay.querySelector("[data-cancel]")?.addEventListener("click", () => overlay.remove());
  overlay.querySelector("#btn-save-recipe").addEventListener("click", async () => {
    const title = overlay.querySelector("#rf-title").value.trim();
    if (!title) { toast("Bitte einen Titel angeben.", "error"); return; }
    const rawIngredients = overlay.querySelector("#rf-ingredients").value;
    const ingredients = mergeItems(parseText(rawIngredients)).map((i) => ({
      name: i.name, amount: i.amount, unit: i.unit, category: i.category,
    }));
    const servings = Math.max(1, parseInt(overlay.querySelector("#rf-servings").value, 10) || 2);
    const instructions = overlay.querySelector("#rf-instructions").value.trim();
    const tags = overlay.querySelector("#rf-tags").value.split(",").map((t) => t.trim()).filter(Boolean);
    const isPublic = overlay.querySelector("#rf-public").checked;

    const editing = overlay.querySelector("#btn-save-recipe").dataset.editId || null;
    if (editing) {
      const r = state.recipes.find((x) => x.id === editing);
      if (r) Object.assign(r, { title, servings, ingredients, instructions, tags, is_public: isPublic });
    } else {
      state.recipes.unshift({ id: uuid(), title, servings, ingredients, instructions, tags, is_public: isPublic, created_at: new Date().toISOString() });
    }
    await persistRecipes();
    overlay.remove();
    renderContent();
    toast(`Rezept „${title}“ gespeichert (${ingredients.length} Zutaten erkannt).`, "success");
  });

}

// ============================================================
// Model-Info
// ============================================================
function openModelInfo() {
  const info = modelInfo();
  const overlay = document.createElement("div");
  overlay.className = "rec-overlay";
  overlay.innerHTML = `
    <div class="rec-modal" style="max-width: 460px;">
      <div class="rec-modal-head">
        <h3 style="font-size: 1rem;">${ICONS.spark} ${escapeHtml(info.name)}</h3>
        <button class="rec-icon-btn" data-close>${ICONS.x}</button>
      </div>
      <div class="terminal" style="margin-top: 12px;">
        <div class="terminal-header">
          <span class="terminal-dot terminal-dot-red"></span>
          <span class="terminal-dot terminal-dot-yellow"></span>
          <span class="terminal-dot terminal-dot-green"></span>
        </div>
        <div class="terminal-body" style="margin: 0;">
          <span style="color: var(--lime);">model</span>  ${escapeHtml(info.name)} v${info.version}
          <span style="color: var(--lime);">runtime</span>  ${escapeHtml(info.runtime)}
          <span style="color: var(--lime);">locale</span>  ${escapeHtml(info.locale)}
          <span style="color: var(--lime);">engines</span> ${info.engines.map((e) => escapeHtml(e)).join(" · ")}
          <span style="color: var(--lime);">labels</span>  ${info.knowledge} Lebensmittel-Labels
          <span style="color: var(--lime);">parses</span>  ${info.stats.parses} (ø ${info.stats.avgMs.toFixed(1)} ms)
          <span style="color: var(--lime);">privacy</span> 100% lokal – keine Daten verlassen das Gerät
        </div>
      </div>
      <div class="rec-modal-foot">
        <button class="btn btn-secondary btn-sm" data-close2>Schließen</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector("[data-close]").addEventListener("click", close);
  overlay.querySelector("[data-close2]").addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
}

// ============================================================
// Init
// ============================================================
async function init() {
  // Model-Chip
  const chip = $("model-chip");
  if (chip) {
    chip.innerHTML = `<span class="rec-pulse"></span> Synaptic FM · lokal · ${modelInfo().version}`;
    chip.title = "Synaptic Foundation Model – läuft lokal im Browser";
  }
  $("model-info-btn")?.addEventListener("click", openModelInfo);

  renderTabs();

  await loadAll();

  renderContent();

  // Realtime: bei Auth-Änderungen neu laden
  supabase.auth.onAuthStateChange(() => {
    loadAll().then(() => {
      renderTabs();
      renderContent();
    });
  });

  // Online/Offline
  window.addEventListener("online", () => {
    loadAll().then(() => { renderTabs(); renderContent(); });
    toast("Verbindung wiederhergestellt.", "success");
  });
  window.addEventListener("offline", () => {
    if (state.mode === "cloud") {
      state.mode = "local";
      renderModeBanner();
      toast("Offline – Änderungen werden lokal gespeichert.", "warning");
    }
  });
}

init();

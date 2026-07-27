import "./index.css";
import { supabase } from "./js/supabase.js";
import { initNeuralBackground } from "./js/neural-bg.js";
import "./js/sw-register.js";

initNeuralBackground("neural-canvas");

const state = {
  user: null,
  role: "user",
  maintenance: false,
};

const pages = {
  dashboard: {
    title: "Dashboard",
    render: renderDashboard,
    icon: `<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>`,
  },
  admin: {
    title: "Admin",
    render: renderAdmin,
    icon: `<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 1v6m0 6v6"/><circle cx="12" cy="12" r="9"/></svg>`,
    admin: true,
  },
  account: {
    title: "Mein Account",
    render: renderAccount,
    icon: `<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  },
  crm: {
    title: "CRM",
    render: renderCRM,
    icon: `<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/></svg>`,
  },
  support: {
    title: "Support",
    render: renderSupport,
    icon: `<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M18 18.72a9 9 0 0 0 1.74-2.31"/><path d="M21.66 10.5a9 9 0 1 0-18 0c0 3.5 2 6.5 5 8.5"/></svg>`,
  },
  time: {
    title: "Zeiterfassung",
    render: renderTimeTracking,
    icon: `<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`,
  },
  chat: {
    title: "Chat",
    render: renderChat,
    icon: `<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  },
  docs: {
    title: "Docs Editor",
    render: renderDocsEditor,
    icon: `<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`,
  },
  game: {
    title: "xSyna Game",
    render: renderGame,
    icon: `<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M6 12h12"/><path d="M12 6v12"/></svg>`,
  },
  synai: {
    title: "Mini SynAI",
    render: renderMiniSynAI,
    icon: `<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/></svg>`,
  },
};

let currentPage = "dashboard";

function $(id) {
  return document.getElementById(id);
}

function showMessage(text, type = "info") {
  const el = $("auth-message");
  if (!el) return;
  el.textContent = text;
  el.classList.remove("hidden", "text-cyan-400", "text-red-400", "text-amber-400");
  if (type === "error") el.classList.add("text-red-400");
  else if (type === "success") el.classList.add("text-cyan-400");
  else el.classList.add("text-amber-400");
  el.classList.remove("hidden");
}

function storage(key, defaultValue) {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function setStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function checkSession() {
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (session) {
      state.user = session.user;
      state.role = state.user.email === "jake@xsyna.de" ? "admin" : "user";
      initApp();
    }
  });
}

function initApp() {
  $("auth-view")?.classList.add("hidden");
  $("app")?.classList.remove("hidden");
  $("user-email").textContent = state.user?.email || "guest@xsyna.de";
  $("role-badge").textContent = state.role.toUpperCase();

  if (state.role !== "admin") {
    delete pages.admin;
  }

  renderSidebar();
  navigate(currentPage);

  const maintenance = storage("xs_maintenance", { enabled: false });
  if (maintenance.enabled) {
    showMaintenance(maintenance);
  }
}

function renderSidebar() {
  const nav = $("sidebar-nav");
  nav.innerHTML = Object.entries(pages)
    .map(
      ([key, page]) => `
      <button data-page="${key}" class="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-white/70 hover:bg-white/5 hover:text-white transition-colors ${currentPage === key ? "bg-white/10 text-white" : ""}">
        ${page.icon}
        ${page.title}
      </button>
    `
    )
    .join("");

  nav.querySelectorAll("button[data-page]").forEach((btn) => {
    btn.addEventListener("click", () => navigate(btn.dataset.page));
  });
}

function navigate(page) {
  currentPage = page;
  $("page-title").textContent = pages[page].title;
  $("page-content").innerHTML = "";
  pages[page].render($("page-content"));
  renderSidebar();
}

function renderDashboard(container) {
  container.innerHTML = `
    <div class="grid md:grid-cols-3 gap-5 mb-8">
      <div class="liquid-card p-5">
        <div class="text-xs text-white/50 mb-1">Account Status</div>
        <div class="text-xl font-bold text-cyan-400">Aktiv</div>
      </div>
      <div class="liquid-card p-5">
        <div class="text-xs text-white/50 mb-1">Rolle</div>
        <div class="text-xl font-bold text-amber-400">${state.role.toUpperCase()}</div>
      </div>
      <div class="liquid-card p-5">
        <div class="text-xs text-white/50 mb-1">Zeit heute</div>
        <div class="text-xl font-bold text-white" id="dash-today">0h 00m</div>
      </div>
    </div>
    <div class="liquid-card p-6">
      <h3 class="text-lg font-bold mb-3">Willkommen im xSyna Ökosystem</h3>
      <p class="text-white/60 text-sm leading-relaxed mb-4">
        Hier findest du alle internen Tools: CRM, Support, Zeiterfassung, Chat, Docs, das xSyna-Game und das Mini-SynAI-Experiment.
      </p>
      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        ${Object.entries(pages)
          .filter(([key]) => key !== "dashboard")
          .map(
            ([key, page]) => `
          <button onclick="window.dispatchEvent(new CustomEvent('navigate',{detail:'${key}'}))" class="liquid-card p-4 text-center hover:border-cyan-500/30 transition-colors">
            <div class="flex justify-center mb-2 text-cyan-400">${page.icon}</div>
            <div class="text-xs font-medium">${page.title}</div>
          </button>
        `
          )
          .join("")}
      </div>
    </div>
  `;
  updateDashTime();
}

function updateDashTime() {
  const entries = storage("xs_time_entries", []);
  const today = new Date().toISOString().split("T")[0];
  const ms = entries
    .filter((e) => e.date === today && e.duration)
    .reduce((sum, e) => sum + e.duration, 0);
  const hours = Math.floor(ms / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  const el = $("dash-today");
  if (el) el.textContent = `${hours}h ${mins.toString().padStart(2, "0")}m`;
}

function renderAdmin(container) {
  if (state.role !== "admin") {
    container.innerHTML = `<div class="text-red-400">Zugriff verweigert.</div>`;
    return;
  }

  const maintenance = storage("xs_maintenance", { enabled: false, title: "", text: "" });

  container.innerHTML = `
    <div class="grid md:grid-cols-2 gap-5">
      <div class="liquid-card p-5">
        <h3 class="text-lg font-bold mb-4">Wartungsmodus</h3>
        <form id="maintenance-form" class="space-y-3">
          <label class="flex items-center gap-2 text-sm">
            <input type="checkbox" id="maint-enabled" ${maintenance.enabled ? "checked" : ""} class="accent-cyan-500" />
            Wartungsmodus aktivieren
          </label>
          <input type="text" id="maint-title" class="xs-input" placeholder="Überschrift" value="${maintenance.title || ""}" />
          <textarea id="maint-text" class="xs-input" rows="2" placeholder="Status-Text">${maintenance.text || ""}</textarea>
          <button type="submit" class="btn-bio text-sm">Speichern</button>
        </form>
      </div>
      <div class="liquid-card p-5">
        <h3 class="text-lg font-bold mb-4">Accounts</h3>
        <p class="text-sm text-white/60 mb-3">Verwaltung über Supabase Dashboard oder direkt hier.</p>
        <button id="promote-admin" class="btn-bio btn-bio-secondary text-sm">Superuser-Rechte setzen (lokal)</button>
      </div>
    </div>
  `;

  $("maintenance-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const enabled = $("maint-enabled").checked;
    const title = $("maint-title").value;
    const text = $("maint-text").value;
    setStorage("xs_maintenance", { enabled, title, text });
    showMaintenance({ enabled, title, text });
    alert("Wartungsmodus-Einstellungen gespeichert.");
  });

  $("promote-admin").addEventListener("click", () => {
    state.role = "admin";
    setStorage("xs_role", "admin");
    $("role-badge").textContent = "ADMIN";
    navigate("admin");
  });
}

function showMaintenance(config) {
  if (!config.enabled) {
    $("maintenance-screen")?.classList.add("hidden");
    $("maintenance-screen")?.classList.remove("flex");
    return;
  }
  const screen = $("maintenance-screen");
  screen.classList.remove("hidden");
  screen.classList.add("flex");
  $("maintenance-text").textContent = config.text || "Wir arbeiten an xSyna. Bitte hab einen Moment Geduld.";
  $("maintenance-status").textContent = config.title || "System wird aktualisiert...";
  let p = 0;
  const bar = $("maintenance-progress");
  const interval = setInterval(() => {
    p += Math.random() * 15;
    if (p >= 100) {
      p = 100;
      clearInterval(interval);
    }
    bar.style.width = p + "%";
  }, 300);
}

function renderAccount(container) {
  container.innerHTML = `
    <div class="grid md:grid-cols-2 gap-5">
      <div class="liquid-card p-5">
        <h3 class="text-lg font-bold mb-3">Profil</h3>
        <p class="text-sm text-white/60 mb-3">E-Mail: <span class="text-white">${state.user?.email || "Gast"}</span></p>
        <button id="save-profile" class="btn-bio text-sm">Profil speichern</button>
      </div>
      <div class="liquid-card p-5">
        <h3 class="text-lg font-bold mb-3">Beta-Zugang</h3>
        <p class="text-sm text-white/60 mb-3">Bewirb dich für SynAI, xSyn Chip und weitere Produkte.</p>
        <button id="apply-beta" class="btn-bio text-sm">Beta beantragen</button>
      </div>
      <div class="liquid-card p-5">
        <h3 class="text-lg font-bold mb-3">Support</h3>
        <p class="text-sm text-white/60 mb-3">Kontaktiere das xSyna Support-Team.</p>
        <button onclick="window.dispatchEvent(new CustomEvent('navigate',{detail:'support'}))" class="btn-bio text-sm">Ticket erstellen</button>
      </div>
      <div class="liquid-card p-5">
        <h3 class="text-lg font-bold mb-3">Bewerbung</h3>
        <p class="text-sm text-white/60 mb-3">Bewirb dich auf offene Positionen.</p>
        <button class="btn-bio btn-bio-secondary text-sm">Zur Bewerbung</button>
      </div>
    </div>
  `;

  $("apply-beta")?.addEventListener("click", () => {
    const requests = storage("xs_beta_requests", []);
    requests.push({ email: state.user?.email, date: new Date().toISOString(), status: "pending" });
    setStorage("xs_beta_requests", requests);
    alert("Beta-Antrag gesendet.");
  });
}

function renderCRM(container) {
  const contacts = storage("xs_crm_contacts", []);
  container.innerHTML = `
    <div class="liquid-card p-5 mb-5">
      <h3 class="text-lg font-bold mb-3">Neuer Kontakt</h3>
      <form id="crm-form" class="grid md:grid-cols-4 gap-3">
        <input type="text" id="crm-name" class="xs-input" placeholder="Name" required />
        <input type="email" id="crm-email" class="xs-input" placeholder="E-Mail" required />
        <select id="crm-status" class="xs-input">
          <option value="Lead">Lead</option>
          <option value="Kunde">Kunde</option>
          <option value="Partner">Partner</option>
        </select>
        <button type="submit" class="btn-bio text-sm justify-center">Hinzufügen</button>
      </form>
    </div>
    <div class="liquid-card overflow-hidden">
      <table class="w-full text-sm text-left">
        <thead class="bg-white/5 text-white/70">
          <tr><th class="p-3 font-medium">Name</th><th class="p-3 font-medium">E-Mail</th><th class="p-3 font-medium">Status</th></tr>
        </thead>
        <tbody id="crm-table" class="divide-y divide-white/10">
          ${contacts.map((c) => `<tr><td class="p-3">${c.name}</td><td class="p-3">${c.email}</td><td class="p-3"><span class="px-2 py-0.5 rounded-full text-xs bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">${c.status}</span></td></tr>`).join("")}
        </tbody>
      </table>
    </div>
  `;

  $("crm-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const contacts = storage("xs_crm_contacts", []);
    contacts.push({
      name: $("crm-name").value,
      email: $("crm-email").value,
      status: $("crm-status").value,
    });
    setStorage("xs_crm_contacts", contacts);
    renderCRM(container);
  });
}

function renderSupport(container) {
  const tickets = storage("xs_tickets", []);
  container.innerHTML = `
    <div class="liquid-card p-5 mb-5 max-w-2xl">
      <h3 class="text-lg font-bold mb-3">Neues Ticket</h3>
      <form id="ticket-form" class="space-y-3">
        <input type="text" id="ticket-subject" class="xs-input" placeholder="Betreff" required />
        <textarea id="ticket-body" class="xs-input" rows="3" placeholder="Beschreibung" required></textarea>
        <button type="submit" class="btn-bio text-sm">Ticket erstellen</button>
      </form>
    </div>
    <div class="space-y-3">
      ${tickets
        .slice()
        .reverse()
        .map(
          (t) => `
        <div class="liquid-card p-4">
          <div class="flex justify-between items-center mb-1">
            <h4 class="font-bold text-sm">${t.subject}</h4>
            <span class="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">${t.status}</span>
          </div>
          <p class="text-white/60 text-sm">${t.body}</p>
        </div>
      `
        )
        .join("")}
    </div>
  `;

  $("ticket-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const tickets = storage("xs_tickets", []);
    tickets.push({
      subject: $("ticket-subject").value,
      body: $("ticket-body").value,
      status: "Offen",
      date: new Date().toISOString(),
    });
    setStorage("xs_tickets", tickets);
    renderSupport(container);
  });
}

function renderTimeTracking(container) {
  const entries = storage("xs_time_entries", []);
  const isRunning = storage("xs_timer_running", false);
  const started = storage("xs_timer_started", 0);
  container.innerHTML = `
    <div class="liquid-card p-5 mb-5 max-w-xl">
      <h3 class="text-lg font-bold mb-3">Zeiterfassung</h3>
      <div class="flex items-center gap-4 mb-4">
        <div id="timer-display" class="text-4xl font-mono font-bold">00:00:00</div>
        <button id="toggle-timer" class="btn-bio text-sm">${isRunning ? "Stop" : "Start"}</button>
      </div>
      <input type="text" id="timer-desc" class="xs-input" placeholder="Was machst du gerade?" />
    </div>
    <div class="liquid-card overflow-hidden">
      <table class="w-full text-sm text-left">
        <thead class="bg-white/5 text-white/70"><tr><th class="p-3">Datum</th><th class="p-3">Beschreibung</th><th class="p-3">Dauer</th></tr></thead>
        <tbody class="divide-y divide-white/10">
          ${entries
            .slice()
            .reverse()
            .map(
              (e) => `
            <tr><td class="p-3">${e.date}</td><td class="p-3">${e.description}</td><td class="p-3 font-mono">${formatDuration(e.duration)}</td></tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;

  let timerInterval;
  const display = $("timer-display");
  function updateDisplay() {
    const elapsed = Date.now() - started;
    display.textContent = formatDuration(elapsed);
  }
  if (isRunning) {
    updateDisplay();
    timerInterval = setInterval(updateDisplay, 1000);
  }

  $("toggle-timer")?.addEventListener("click", () => {
    const running = storage("xs_timer_running", false);
    if (!running) {
      setStorage("xs_timer_running", true);
      setStorage("xs_timer_started", Date.now());
      renderTimeTracking(container);
    } else {
      const entries = storage("xs_time_entries", []);
      const startedAt = storage("xs_timer_started", Date.now());
      entries.push({
        date: new Date().toISOString().split("T")[0],
        description: $("timer-desc").value || "Arbeit",
        duration: Date.now() - startedAt,
      });
      setStorage("xs_time_entries", entries);
      setStorage("xs_timer_running", false);
      renderTimeTracking(container);
    }
  });
}

function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

function renderChat(container) {
  const messages = storage("xs_chat_messages", [
    { user: "SynAI", text: "Hallo! Wie kann ich dir helfen?", type: "bot" },
  ]);
  container.innerHTML = `
    <div class="liquid-card p-5 h-[60vh] flex flex-col max-w-3xl">
      <div id="chat-history" class="flex-1 overflow-y-auto space-y-3 mb-4 pr-2">
        ${messages
          .map(
            (m) => `
          <div class="flex ${m.type === "user" ? "justify-end" : "justify-start"}">
            <div class="max-w-[80%] px-4 py-2 rounded-2xl text-sm ${m.type === "user" ? "bg-cyan-500/20 text-cyan-100 rounded-br-none" : "bg-white/10 text-white rounded-bl-none"}">
              ${m.text}
            </div>
          </div>
        `
          )
          .join("")}
      </div>
      <form id="chat-form" class="flex gap-2">
        <input type="text" id="chat-input" class="xs-input" placeholder="Nachricht schreiben..." autocomplete="off" />
        <button type="submit" class="btn-bio text-sm justify-center px-5">Senden</button>
      </form>
    </div>
  `;

  $("chat-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const input = $("chat-input");
    const text = input.value.trim();
    if (!text) return;
    const messages = storage("xs_chat_messages", []);
    messages.push({ user: "Du", text, type: "user" });
    messages.push({ user: "SynAI", text: "Interessant! Ich bin noch ein lokales Mini-Experiment, aber ich lerne mit dir.", type: "bot" });
    setStorage("xs_chat_messages", messages);
    renderChat(container);
  });
}

function renderDocsEditor(container) {
  const docs = storage("xs_docs", { content: "# Willkommen bei xSyna Docs\n\nHier kannst du interne Dokumentation editieren." });
  container.innerHTML = `
    <div class="grid md:grid-cols-2 gap-5 h-[65vh]">
      <div class="liquid-card p-0 overflow-hidden flex flex-col">
        <div class="p-3 border-b border-white/10 text-sm font-bold">Markdown Editor</div>
        <textarea id="docs-editor" class="w-full flex-1 bg-transparent p-4 text-sm font-mono resize-none focus:outline-none">${docs.content}</textarea>
      </div>
      <div class="liquid-card p-0 overflow-hidden flex flex-col">
        <div class="p-3 border-b border-white/10 text-sm font-bold">Vorschau</div>
        <div id="docs-preview" class="p-4 text-sm leading-relaxed overflow-auto"></div>
      </div>
    </div>
    <button id="save-docs" class="btn-bio text-sm mt-4">Speichern</button>
  `;

  const editor = $("docs-editor");
  const preview = $("docs-preview");
  function renderPreview() {
    preview.innerHTML = simpleMarkdown(editor.value);
  }
  editor.addEventListener("input", renderPreview);
  renderPreview();

  $("save-docs")?.addEventListener("click", () => {
    setStorage("xs_docs", { content: editor.value });
    alert("Dokument gespeichert.");
  });
}

function simpleMarkdown(md) {
  return md
    .replace(/^# (.*$)/gim, "<h1 class='text-2xl font-bold mb-2'>$1</h1>")
    .replace(/^## (.*$)/gim, "<h2 class='text-xl font-bold mb-2 mt-4'>$1</h2>")
    .replace(/^### (.*$)/gim, "<h3 class='text-lg font-bold mb-1 mt-3'>$1</h3>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/\n/g, "<br/>");
}

function renderGame(container) {
  container.innerHTML = `
    <div class="liquid-card p-5 max-w-2xl">
      <h3 class="text-lg font-bold mb-2">xSyna Reflex</h3>
      <p class="text-sm text-white/60 mb-4">Klicke so schnell wie möglich auf die aktiven Zellen.</p>
      <div id="game-grid" class="grid grid-cols-4 gap-2 mb-4"></div>
      <div class="flex items-center justify-between">
        <div class="text-sm font-mono">Score: <span id="game-score" class="text-cyan-400 font-bold">0</span></div>
        <button id="start-game" class="btn-bio text-sm">Start</button>
      </div>
    </div>
  `;

  const grid = $("game-grid");
  for (let i = 0; i < 16; i++) {
    const cell = document.createElement("button");
    cell.className = "h-16 rounded-lg bg-white/5 border border-white/10 transition-colors";
    cell.dataset.index = i;
    grid.appendChild(cell);
  }

  let score = 0;
  let interval;

  $("start-game").addEventListener("click", () => {
    score = 0;
    $("game-score").textContent = score;
    clearInterval(interval);
    interval = setInterval(() => {
      Array.from(grid.children).forEach((c) => {
        c.classList.remove("bg-cyan-500", "border-cyan-500");
        c.classList.add("bg-white/5");
      });
      const active = Math.floor(Math.random() * 16);
      const cell = grid.children[active];
      cell.classList.remove("bg-white/5");
      cell.classList.add("bg-cyan-500", "border-cyan-500");
    }, 800);
  });

  grid.addEventListener("click", (e) => {
    if (e.target.classList.contains("bg-cyan-500")) {
      score += 10;
      $("game-score").textContent = score;
      e.target.classList.remove("bg-cyan-500", "border-cyan-500");
      e.target.classList.add("bg-white/5");
    }
  });
}

function renderMiniSynAI(container) {
  container.innerHTML = `
    <div class="grid md:grid-cols-2 gap-5">
      <div class="liquid-card p-5">
        <h3 class="text-lg font-bold mb-3">Mini SynAI</h3>
        <p class="text-sm text-white/60 mb-4">
          Ein lokales, browserbasiertes Neuronen-Experiment. 128 virtuelle Neuronen reagieren auf deine Eingabe.
        </p>
        <textarea id="synai-input" class="xs-input" rows="3" placeholder="Gib einen Satz ein..."></textarea>
        <button id="synai-run" class="btn-bio text-sm mt-3">Spike auslösen</button>
        <div id="synai-output" class="mt-4 p-3 rounded-xl bg-white/5 border border-white/10 text-sm font-mono min-h-[80px]"></div>
      </div>
      <div class="liquid-card p-5">
        <h3 class="text-lg font-bold mb-3">Neuronale Aktivität</h3>
        <canvas id="synai-canvas" width="300" height="200" class="w-full h-48 rounded-xl bg-black/30"></canvas>
      </div>
    </div>
  `;

  const canvas = $("synai-canvas");
  const ctx = canvas.getContext("2d");
  const neurons = Array.from({ length: 12 }, () => ({ active: Math.random() > 0.5, x: Math.random() * canvas.width, y: Math.random() * canvas.height }));

  function draw() {
    ctx.fillStyle = "rgba(3,5,8,0.3)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    neurons.forEach((n) => {
      ctx.beginPath();
      ctx.arc(n.x, n.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = n.active ? "#00f0ff" : "#333";
      ctx.fill();
      n.active = Math.random() > 0.7;
    });
  }
  setInterval(draw, 200);

  $("synai-run")?.addEventListener("click", () => {
    const input = $("synai-input").value.trim() || "Spike";
    const output = $("synai-output");
    output.textContent = `Verarbeite: "${input}"\n> ${input.length} Tokens erkannt\n> Synapse 42 feuert\n> Gewicht angepasst`;
  });
}

window.addEventListener("navigate", (e) => {
  navigate(e.detail);
});

$("login-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("email").value.trim();
  if (!email) return;
  const btn = $("login-button");
  btn.disabled = true;
  btn.textContent = "Wird gesendet...";
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin + "/internal-services" },
  });
  btn.disabled = false;
  btn.textContent = "Magic-Link senden";
  if (error) showMessage("Fehler: " + error.message, "error");
  else showMessage("Login-Link gesendet. Bitte E-Mail prüfen.", "success");
});

$("logout-btn")?.addEventListener("click", async () => {
  await supabase.auth.signOut();
  location.reload();
});

const savedRole = storage("xs_role", null);
if (savedRole) state.role = savedRole;

checkSession();

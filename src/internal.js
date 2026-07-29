import { supabase } from "./js/supabase.js";
import { initNeuralBackground } from "./js/neural-bg.js";
import "./js/sw-register.js";
import {
  getProfile,
  setUserRole,
  listUsers,
  getMaintenance,
  setMaintenance,
  getBetaRequests,
  createBetaRequest,
  updateBetaRequestStatus,
  getTickets,
  createTicket,
  getCRMContacts,
  createCRMContact,
  getTimeEntries,
  createTimeEntry,
  getChatMessages,
  createChatMessage,
  getDocs,
  saveDocs,
  isAdmin,
  isStaff,
  syncQueue,
  getSiteConfig,
  setSiteConfig,
  getOrders,
  createOrder,
  updateOrder,
  getOrderUpdates,
  createOrderUpdate,
  encryptTrackingData,
} from "./js/supabase-db.js";

initNeuralBackground("neural-canvas");

const state = {
  user: null,
  profile: null,
  maintenance: { enabled: false },
};

const pages = {
  dashboard: { title: "Dashboard", icon: dashboardIcon, render: renderDashboard },
  admin: { title: "Admin-Panel", icon: adminIcon, render: renderAdmin, requires: ["admin"] },
  users: { title: "Benutzer", icon: usersIcon, render: renderUsers, requires: ["admin"] },
  beta: { title: "Beta-Verwaltung", icon: betaIcon, render: renderBetaAdmin, requires: ["admin", "moderator"] },
  orders: { title: "Aufträge", icon: orderIcon, render: renderOrders, requires: ["admin", "moderator"] },
  account: { title: "Mein Account", icon: accountIcon, render: renderAccount },
  betareq: { title: "Beta-Zugang", icon: betaIcon, render: renderBetaRequest },
  support: { title: "Support", icon: supportIcon, render: renderSupport },
  crm: { title: "CRM", icon: crmIcon, render: renderCRM, requires: ["admin", "moderator"] },
  time: { title: "Zeiterfassung", icon: timeIcon, render: renderTimeTracking },
  chat: { title: "Chat", icon: chatIcon, render: renderChat },
  docs: { title: "Docs", icon: docsIcon, render: renderDocsEditor, requires: ["admin", "moderator"] },
  game: { title: "xSyna Game", icon: gameIcon, render: renderGame },
  synai: { title: "Mini SynAI", icon: synaiIcon, render: renderMiniSynAI },
};

let currentPage = "dashboard";
let timerInterval = null;

function $(id) { return document.getElementById(id); }
function storage(key, def) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def; } catch { return def; } }
function setStorage(key, value) { localStorage.setItem(key, JSON.stringify(value)); }

function showAuthMessage(text, type = "info") {
  const el = $("auth-message");
  if (!el) return;
  el.textContent = text;
  el.style.display = "block";
  el.style.color = type === "error" ? "#f87171" : type === "success" ? "#22d3ee" : "#94a3b8";
}

async function checkSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    state.user = session.user;
    await loadProfile();
  } else {
    window.location.href = "/auth?returnTo=" + encodeURIComponent(window.location.pathname + window.location.search);
  }
}

async function loadProfile() {
  const profile = await getProfile(state.user.id);
  state.profile = profile || { role: "user", permissions: [] };
  await initApp();
}

function hasPermission(perms) {
  if (!perms || perms.length === 0) return true;
  if (state.profile?.role === "admin") return true;
  return perms.includes(state.profile?.role) || perms.some((p) => state.profile?.permissions?.includes(p));
}

async function initApp() {
  await syncQueue();
  const maintenance = await getMaintenance();
  state.maintenance = maintenance;

  $("app").style.display = "flex";
  $("user-email").textContent = state.user?.email || "guest@xsyna.de";
  $("role-badge").textContent = (state.profile?.role || "user").toUpperCase();

  if (maintenance?.enabled) showMaintenance(maintenance);
  else $("maintenance-screen").style.display = "none";

  renderSidebar();
  navigate(currentPage);
}

function renderSidebar() {
  const nav = $("sidebar-nav");
  nav.innerHTML = Object.entries(pages)
    .filter(([, p]) => hasPermission(p.requires))
    .map(([key, page]) => `
      <button data-page="${key}" class="sidebar-link ${currentPage === key ? "active" : ""}">
        ${page.icon}
        <span>${page.title}</span>
      </button>
    `).join("");

  nav.querySelectorAll("button[data-page]").forEach((btn) => {
    btn.addEventListener("click", () => navigate(btn.dataset.page));
  });
}

function navigate(page) {
  if (pages[page]?.requires && !hasPermission(pages[page].requires)) page = "dashboard";
  currentPage = page;
  $("page-title").textContent = pages[page].title;
  const content = $("page-content");
  content.innerHTML = "";
  clearInterval(timerInterval);
  pages[page].render(content);
  renderSidebar();
}

function renderDashboard(container) {
  container.innerHTML = `
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 24px; margin-bottom: 32px;">
      <div class="card card-sm"><div style="color: var(--text-muted); font-size: 0.8rem; margin-bottom: 8px;">Account Status</div><div style="font-size: 1.5rem; font-weight: 700; color: var(--cyan);">Aktiv</div></div>
      <div class="card card-sm"><div style="color: var(--text-muted); font-size: 0.8rem; margin-bottom: 8px;">Rolle</div><div style="font-size: 1.5rem; font-weight: 700; color: var(--amber);">${(state.profile?.role || "user").toUpperCase()}</div></div>
      <div class="card card-sm"><div style="color: var(--text-muted); font-size: 0.8rem; margin-bottom: 8px;">Zeit heute</div><div style="font-size: 1.5rem; font-weight: 700;">${todayTime()}</div></div>
    </div>
    <div class="card">
      <h3 style="font-size: 1.2rem; font-weight: 700; margin-bottom: 12px;">Willkommen im xSyna Ökosystem</h3>
      <p style="color: var(--text-secondary); line-height: 1.6; margin-bottom: 24px;">
        Hier findest du alle internen Tools: CRM, Support, Zeiterfassung, Chat, Docs, das xSyna-Game und das Mini-SynAI-Experiment.
      </p>
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 16px;">
        ${Object.entries(pages).filter(([k]) => k !== "dashboard").map(([k, p]) => `
          <button onclick="window.dispatchEvent(new CustomEvent('xsnav',{detail:'${k}'}))" class="card card-sm" style="text-align: center; cursor: pointer; background: transparent;">
            <div style="display: flex; justify-content: center; margin-bottom: 8px; color: var(--cyan);">${p.icon}</div>
            <div style="font-size: 0.8rem; font-weight: 600;">${p.title}</div>
          </button>
        `).join("")}
      </div>
    </div>
  `;
}

function renderAdmin(container) {
  if (!isAdmin(state.profile)) { container.innerHTML = "<p style='color:#f87171'>Zugriff verweigert.</p>"; return; }
  container.innerHTML = `
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 24px;">
      <div class="card">
        <h3 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 16px;">Wartungsmodus</h3>
        <form id="maintenance-form">
          <label style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px; color: var(--text-secondary); font-size: 0.9rem;">
            <input type="checkbox" id="maint-enabled" ${state.maintenance?.enabled ? "checked" : ""} /> Wartungsmodus aktivieren
          </label>
          <input type="text" id="maint-title" class="input" placeholder="Überschrift" value="${state.maintenance?.title || ""}" style="margin-bottom: 12px;" />
          <textarea id="maint-text" class="input" rows="2" placeholder="Status-Text" style="margin-bottom: 16px;">${state.maintenance?.status_text || ""}</textarea>
          <button type="submit" class="btn btn-primary btn-sm">Speichern</button>
        </form>
      </div>
      <div class="card">
        <h3 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 16px;">System</h3>
        <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 16px;">Verwaltung über das Admin-Panel.</p>
        <button id="sync-queue" class="btn btn-secondary btn-sm" style="margin-bottom: 12px;">Offline-Queue synchronisieren</button>
        <button id="reset-data" class="btn btn-secondary btn-sm">Alle lokalen Daten löschen</button>
      </div>
    </div>
  `;

  $("maintenance-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const config = {
      enabled: $("maint-enabled").checked,
      title: $("maint-title").value,
      status_text: $("maint-text").value,
    };
    const { data, error } = await setMaintenance(config);
    if (error) {
      showAuthMessage("Fehler: " + error.message, "error");
      return;
    }
    state.maintenance = data || config;
    if (state.maintenance?.enabled) showMaintenance(state.maintenance);
    else $("maintenance-screen").style.display = "none";
    showAuthMessage("Wartungsmodus-Einstellungen gespeichert.", "success");
  });

  $("sync-queue")?.addEventListener("click", async () => {
    await syncQueue();
    showAuthMessage("Offline-Queue synchronisiert.", "success");
  });

  $("reset-data")?.addEventListener("click", () => {
    if (confirm("Alle lokalen xSyna-Daten löschen?")) {
      localStorage.clear();
      location.reload();
    }
  });
}

function showMaintenance(config) {
  const screen = $("maintenance-screen");
  screen.style.display = "flex";
  $("maintenance-text").textContent = config.status_text || "Wir arbeiten an xSyna. Bitte hab einen Moment Geduld.";
  $("maintenance-status").textContent = config.title || "System wird aktualisiert...";
  let p = 0;
  const bar = $("maintenance-progress");
  const interval = setInterval(() => {
    p += Math.random() * 20;
    if (p >= 100) { p = 100; clearInterval(interval); }
    bar.style.width = p + "%";
  }, 300);
}

async function renderUsers(container) {
  if (!isAdmin(state.profile)) { container.innerHTML = "<p style='color:#f87171'>Zugriff verweigert.</p>"; return; }
  const { data: users, error } = await listUsers();
  if (error) { container.innerHTML = `<p style='color:#f87171'>Fehler: ${error.message}</p>`; return; }
  container.innerHTML = `
    <div class="card" style="overflow: hidden;">
      <table class="table">
        <thead><tr><th>E-Mail</th><th>Rolle</th><th>Berechtigungen</th><th>Aktionen</th></tr></thead>
        <tbody>${(users || []).map(u => `
          <tr>
            <td>${u.email}</td>
            <td>${u.role}</td>
            <td>${(u.permissions || []).join(", ") || "-"}</td>
            <td><button class="btn btn-secondary btn-sm edit-user" data-email="${u.email}">Bearbeiten</button></td>
          </tr>
        `).join("")}</tbody>
      </table>
    </div>
  `;
  container.querySelectorAll(".edit-user").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const email = btn.dataset.email;
      const newRole = prompt("Neue Rolle (admin, moderator, beta, user):");
      if (!newRole) return;
      const { error } = await setUserRole(email, newRole);
      if (error) { alert("Fehler: " + error.message); return; }
      renderUsers(container);
    });
  });
}

async function renderBetaAdmin(container) {
  if (!isStaff(state.profile)) { container.innerHTML = "<p style='color:#f87171'>Zugriff verweigert.</p>"; return; }
  const { data: requests, error } = await getBetaRequests();
  if (error) { container.innerHTML = `<p style='color:#f87171'>Fehler: ${error.message}</p>`; return; }
  container.innerHTML = `
    <div class="card">
      <h3 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 16px;">Beta-Anträge</h3>
      <div style="display: flex; flex-direction: column; gap: 12px;">
        ${(requests || []).map((r) => `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; border: 1px solid var(--border); border-radius: 8px;" data-id="${r.id}">
            <div>
              <div style="font-weight: 600;">${r.email}</div>
              <div style="font-size: 0.8rem; color: var(--text-muted);">${r.product} — ${r.status}</div>
            </div>
            <div style="display: flex; gap: 8px;">
              <button class="btn btn-primary btn-sm approve-beta" data-id="${r.id}">Genehmigen</button>
              <button class="btn btn-secondary btn-sm reject-beta" data-id="${r.id}">Ablehnen</button>
            </div>
          </div>
        `).join("") || "<p style='color: var(--text-muted);'>Keine Anträge vorhanden.</p>"}
      </div>
    </div>
  `;
  container.querySelectorAll(".approve-beta").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await updateBetaRequestStatus(btn.dataset.id, "approved");
      renderBetaAdmin(container);
    });
  });
  container.querySelectorAll(".reject-beta").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await updateBetaRequestStatus(btn.dataset.id, "rejected");
      renderBetaAdmin(container);
    });
  });
}

function renderAccount(container) {
  container.innerHTML = `
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 24px;">
      <div class="card">
        <h3 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 12px;">Profil</h3>
        <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 16px;">E-Mail: <span style="color: var(--text);">${state.user?.email || "Gast"}</span></p>
        <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 16px;">Rolle: <span style="color: var(--cyan); text-transform: uppercase;">${state.profile?.role || "user"}</span></p>
      </div>
      <div class="card">
        <h3 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 12px;">Beta-Zugang</h3>
        <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 16px;">Bewirb dich für SynAI, xSyn und weitere Produkte.</p>
        <button onclick="window.dispatchEvent(new CustomEvent('xsnav',{detail:'betareq'}))" class="btn btn-primary btn-sm">Beta beantragen</button>
      </div>
      <div class="card">
        <h3 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 12px;">Support</h3>
        <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 16px;">Kontaktiere das xSyna Support-Team.</p>
        <button onclick="window.dispatchEvent(new CustomEvent('xsnav',{detail:'support'}))" class="btn btn-primary btn-sm">Ticket erstellen</button>
      </div>
      <div class="card">
        <h3 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 12px;">Bewerbung</h3>
        <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 16px;">Bewirb dich auf offene Positionen.</p>
        <button class="btn btn-secondary btn-sm" onclick="alert('Bewerbungsformular folgt in Phase 2')">Jetzt bewerben</button>
      </div>
    </div>
  `;
}

function renderBetaRequest(container) {
  container.innerHTML = `
    <div class="card" style="max-width: 500px;">
      <h3 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 12px;">Beta-Zugang beantragen</h3>
      <form id="beta-form">
        <div class="form-group">
          <label class="form-label">Produkt</label>
          <select id="beta-product" class="input">
            <option value="SynAI">SynAI</option>
            <option value="xSyn">xSyn</option>
            <option value="xSyna Labs">xSyna Labs</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Begründung</label>
          <textarea id="beta-reason" class="input" rows="3" required></textarea>
        </div>
        <button type="submit" class="btn btn-primary btn-sm">Antrag senden</button>
      </form>
    </div>
  `;
  $("beta-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    await createBetaRequest({
      user_id: state.user.id,
      email: state.user.email,
      product: $("beta-product").value,
      reason: $("beta-reason").value,
    });
    alert("Beta-Antrag gesendet.");
    $("beta-form").reset();
  });
}

async function renderSupport(container) {
  const { data: tickets, error } = await getTickets();
  if (error) { container.innerHTML = `<p style='color:#f87171'>Fehler: ${error.message}</p>`; return; }
  container.innerHTML = `
    <div class="card" style="max-width: 600px; margin-bottom: 24px;">
      <h3 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 16px;">Neues Ticket</h3>
      <form id="ticket-form">
        <div class="form-group"><label class="form-label">Betreff</label><input type="text" id="ticket-subject" class="input" required /></div>
        <div class="form-group"><label class="form-label">Beschreibung</label><textarea id="ticket-body" class="input" rows="3" required></textarea></div>
        <button type="submit" class="btn btn-primary btn-sm">Ticket erstellen</button>
      </form>
    </div>
    <div style="display: flex; flex-direction: column; gap: 12px;">
      ${(tickets || []).slice().reverse().map((t) => `
        <div class="card card-sm">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <h4 style="font-weight: 700; font-size: 0.95rem;">${t.subject}</h4>
            <span style="font-size: 0.7rem; padding: 2px 8px; border-radius: 999px; background: var(--amber-soft); color: var(--amber); border: 1px solid rgba(251,191,36,0.2);">${t.status}</span>
          </div>
          <p style="color: var(--text-secondary); font-size: 0.85rem;">${t.body}</p>
        </div>
      `).join("")}
    </div>
  `;
  $("ticket-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    await createTicket({
      user_id: state.user.id,
      email: state.user.email,
      subject: $("ticket-subject").value,
      body: $("ticket-body").value,
    });
    renderSupport(container);
  });
}

async function renderCRM(container) {
  if (!isStaff(state.profile)) { container.innerHTML = "<p style='color:#f87171'>Zugriff verweigert.</p>"; return; }
  const { data: contacts, error } = await getCRMContacts();
  if (error) { container.innerHTML = `<p style='color:#f87171'>Fehler: ${error.message}</p>`; return; }
  container.innerHTML = `
    <div class="card" style="margin-bottom: 24px;">
      <h3 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 16px;">Neuer Kontakt</h3>
      <form id="crm-form" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; align-items: end;">
        <div class="form-group" style="margin: 0;"><input type="text" id="crm-name" class="input" placeholder="Name" required /></div>
        <div class="form-group" style="margin: 0;"><input type="email" id="crm-email" class="input" placeholder="E-Mail" required /></div>
        <div class="form-group" style="margin: 0;">
          <select id="crm-status" class="input">
            <option value="Lead">Lead</option>
            <option value="Kunde">Kunde</option>
            <option value="Partner">Partner</option>
          </select>
        </div>
        <button type="submit" class="btn btn-primary btn-sm" style="height: fit-content;">Hinzufügen</button>
      </form>
    </div>
    <div class="card" style="overflow: hidden;">
      <table class="table">
        <thead><tr><th>Name</th><th>E-Mail</th><th>Status</th></tr></thead>
        <tbody>${(contacts || []).map(c => `<tr><td>${c.name}</td><td>${c.email}</td><td><span style="padding: 2px 8px; border-radius: 999px; background: var(--cyan-soft); color: var(--cyan); font-size: 0.75rem;">${c.status}</span></td></tr>`).join("")}</tbody>
      </table>
    </div>
  `;
  $("crm-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    await createCRMContact({
      added_by: state.user.id,
      name: $("crm-name").value,
      email: $("crm-email").value,
      status: $("crm-status").value,
    });
    renderCRM(container);
  });
}

async function renderTimeTracking(container) {
  const { data: entries, error } = await getTimeEntries(state.user.id);
  if (error) { container.innerHTML = `<p style='color:#f87171'>Fehler: ${error.message}</p>`; return; }
  const running = storage("xsyna_timer_running", false);
  const started = storage("xsyna_timer_started", 0);
  container.innerHTML = `
    <div class="card" style="max-width: 500px; margin-bottom: 24px;">
      <h3 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 16px;">Zeiterfassung</h3>
      <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 16px;">
        <div id="timer-display" style="font-size: 2rem; font-family: var(--font-mono); font-weight: 700;">00:00:00</div>
        <button id="toggle-timer" class="btn btn-primary btn-sm">${running ? "Stop" : "Start"}</button>
      </div>
      <input type="text" id="timer-desc" class="input" placeholder="Was machst du gerade?" />
    </div>
    <div class="card" style="overflow: hidden;">
      <table class="table">
        <thead><tr><th>Datum</th><th>Beschreibung</th><th>Dauer</th></tr></thead>
        <tbody>${(entries || []).slice().reverse().map(e => `<tr><td>${e.date}</td><td>${e.description}</td><td style="font-family: var(--font-mono);">${formatDuration(e.duration_ms)}</td></tr>`).join("")}</tbody>
      </table>
    </div>
  `;
  const display = $("timer-display");
  function update() { display.textContent = formatDuration(Date.now() - started); }
  if (running) { update(); timerInterval = setInterval(update, 1000); }
  $("toggle-timer")?.addEventListener("click", async () => {
    const r = storage("xsyna_timer_running", false);
    if (!r) {
      setStorage("xsyna_timer_running", true);
      setStorage("xsyna_timer_started", Date.now());
      renderTimeTracking(container);
    } else {
      const startedAt = storage("xsyna_timer_started", 0);
      await createTimeEntry({
        user_id: state.user.id,
        date: new Date().toISOString().split("T")[0],
        description: $("timer-desc")?.value || "Arbeit",
        duration_ms: Date.now() - startedAt,
      });
      setStorage("xsyna_timer_running", false);
      renderTimeTracking(container);
    }
  });
}

function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((x) => x.toString().padStart(2, "0")).join(":");
}

async function renderChat(container) {
  const { data: messages, error } = await getChatMessages(state.user.id);
  if (error) { container.innerHTML = `<p style='color:#f87171'>Fehler: ${error.message}</p>`; return; }
  container.innerHTML = `
    <div class="card" style="height: 60vh; display: flex; flex-direction: column; max-width: 700px;">
      <div id="chat-history" style="flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; margin-bottom: 16px; padding-right: 8px;">
        ${(messages || []).map(m => `<div style="align-self: ${m.type === "user" ? "flex-end" : "flex-start"}; max-width: 80%; padding: 10px 14px; border-radius: 12px; font-size: 0.9rem; ${m.type === "user" ? "background: var(--cyan-soft); color: var(--text);" : "background: rgba(255,255,255,0.05); color: var(--text-secondary);"}">${m.text}</div>`).join("")}
      </div>
      <form id="chat-form" style="display: flex; gap: 12px;">
        <input type="text" id="chat-input" class="input" placeholder="Nachricht schreiben..." autocomplete="off" />
        <button type="submit" class="btn btn-primary btn-sm" style="flex-shrink: 0;">Senden</button>
      </form>
    </div>
  `;
  $("chat-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = $("chat-input").value.trim();
    if (!text) return;
    await createChatMessage({ user_id: state.user.id, text, type: "user" });
    await createChatMessage({ user_id: state.user.id, text: "Ich bin noch ein lokales Mini-Experiment, aber ich lerne mit dir.", type: "bot" });
    renderChat(container);
  });
}

async function renderDocsEditor(container) {
  const { data: doc, error } = await getDocs();
  if (error) { container.innerHTML = `<p style='color:#f87171'>Fehler: ${error.message}</p>`; return; }
  container.innerHTML = `
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 24px; height: 65vh;">
      <div class="card" style="display: flex; flex-direction: column; padding: 0; overflow: hidden;">
        <div style="padding: 12px 16px; border-bottom: 1px solid var(--border); font-weight: 600; font-size: 0.85rem;">Markdown Editor</div>
        <textarea id="docs-editor" style="flex: 1; background: transparent; border: none; padding: 16px; color: var(--text); font-family: var(--font-mono); font-size: 0.85rem; resize: none; outline: none;">${doc?.content || ""}</textarea>
      </div>
      <div class="card" style="display: flex; flex-direction: column; padding: 0; overflow: hidden;">
        <div style="padding: 12px 16px; border-bottom: 1px solid var(--border); font-weight: 600; font-size: 0.85rem;">Vorschau</div>
        <div id="docs-preview" style="flex: 1; padding: 16px; overflow: auto; font-size: 0.9rem; line-height: 1.6;"></div>
      </div>
    </div>
    <button id="save-docs" class="btn btn-primary btn-sm" style="margin-top: 16px;">Speichern</button>
  `;
  const editor = $("docs-editor");
  const preview = $("docs-preview");
  function update() { preview.innerHTML = simpleMarkdown(editor.value); }
  editor.addEventListener("input", update); update();
  $("save-docs")?.addEventListener("click", async () => {
    await saveDocs(editor.value);
    showAuthMessage("Dokument gespeichert.", "success");
  });
}

function simpleMarkdown(md) {
  return md
    .replace(/^# (.*$)/gim, "<h1 style='font-size:1.6rem;font-weight:700;margin-bottom:12px;'>$1</h1>")
    .replace(/^## (.*$)/gim, "<h2 style='font-size:1.3rem;font-weight:700;margin:16px 0 8px;'>$1</h2>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/\n/g, "<br/>");
}

function renderGame(container) {
  container.innerHTML = `
    <div class="card" style="max-width: 450px;">
      <h3 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 8px;">xSyna Reflex</h3>
      <p style="color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 16px;">Klicke so schnell wie möglich auf die aktiven Zellen.</p>
      <div id="game-grid" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 16px;"></div>
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div style="font-family: var(--font-mono); font-size: 0.9rem;">Score: <span id="game-score" style="color: var(--cyan); font-weight: 700;">0</span></div>
        <button id="start-game" class="btn btn-primary btn-sm">Start</button>
      </div>
    </div>
  `;
  const grid = $("game-grid");
  for (let i = 0; i < 16; i++) {
    const cell = document.createElement("button");
    cell.style.cssText = "height: 60px; border-radius: 8px; background: rgba(255,255,255,0.05); border: 1px solid var(--border); cursor: pointer; transition: all 0.2s;";
    cell.dataset.index = i;
    grid.appendChild(cell);
  }
  let score = 0, interval;
  $("start-game")?.addEventListener("click", () => {
    score = 0; $("game-score").textContent = score; clearInterval(interval);
    interval = setInterval(() => {
      Array.from(grid.children).forEach(c => { c.style.background = "rgba(255,255,255,0.05)"; c.style.borderColor = "var(--border)"; });
      const active = Math.floor(Math.random() * 16);
      grid.children[active].style.background = "var(--cyan)";
      grid.children[active].style.borderColor = "var(--cyan)";
    }, 800);
  });
  grid.addEventListener("click", (e) => {
    if (e.target.style.background === "var(--cyan)") { score += 10; $("game-score").textContent = score; e.target.style.background = "rgba(255,255,255,0.05)"; }
  });
}

function renderMiniSynAI(container) {
  container.innerHTML = `
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 24px;">
      <div class="card">
        <h3 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 12px;">Mini SynAI</h3>
        <p style="color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 16px;">Lokales, browserbasiertes Neuronen-Experiment. Gib einen Satz ein und beobachte die Spikes.</p>
        <textarea id="synai-input" class="input" rows="3" placeholder="Gib einen Satz ein..."></textarea>
        <button id="synai-run" class="btn btn-primary btn-sm" style="margin-top: 12px;">Spike auslösen</button>
        <div id="synai-output" style="margin-top: 16px; padding: 12px; border-radius: 8px; background: rgba(255,255,255,0.03); border: 1px solid var(--border); font-family: var(--font-mono); font-size: 0.8rem; min-height: 80px; white-space: pre-wrap;"></div>
      </div>
      <div class="card">
        <h3 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 12px;">Neuronale Aktivität</h3>
        <canvas id="synai-canvas" width="300" height="200" style="width: 100%; height: 200px; border-radius: 8px; background: rgba(0,0,0,0.3);"></canvas>
      </div>
    </div>
  `;
  const canvas = $("synai-canvas"), ctx = canvas.getContext("2d");
  const neurons = Array.from({ length: 12 }, () => ({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, active: Math.random() > 0.5 }));
  function draw() {
    ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    neurons.forEach(n => { ctx.beginPath(); ctx.arc(n.x, n.y, 4, 0, Math.PI * 2); ctx.fillStyle = n.active ? "var(--cyan)" : "#334"; ctx.fill(); n.active = Math.random() > 0.7; });
  }
  setInterval(draw, 200);
  $("synai-run")?.addEventListener("click", () => {
    const input = $("synai-input").value.trim() || "Spike";
    $("synai-output").textContent = `Verarbeite: "${input}"\n> ${input.length} Tokens erkannt\n> Synapse 42 feuert\n> Gewicht angepasst`;
  });
}

async function renderOrders(container) {
  if (!isStaff(state.profile)) { container.innerHTML = "<p style='color:#f87171'>Zugriff verweigert.</p>"; return; }
  const { data: orders, error } = await getOrders();
  if (error) { container.innerHTML = `<p style='color:#f87171'>Fehler: ${error.message}</p>`; return; }
  const { data: config } = await getSiteConfig();

  container.innerHTML = `
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 24px; margin-bottom: 24px;">
      <div class="card">
        <h3 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 16px;">Neuer Auftrag</h3>
        <form id="order-form">
          <div class="form-group"><input type="text" id="order-title" class="input" placeholder="Titel" required /></div>
          <div class="form-group"><input type="email" id="order-email" class="input" placeholder="Kunden-E-Mail" required /></div>
          <div class="form-group"><textarea id="order-desc" class="input" rows="2" placeholder="Beschreibung"></textarea></div>
          <button type="submit" class="btn btn-primary btn-sm">Auftrag erstellen</button>
        </form>
      </div>
      <div class="card">
        <h3 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 16px;">Tracking-Einstellungen</h3>
        <form id="tracking-config-form">
          <div class="form-group"><label class="form-label">Schritte (kommasepariert)</label><input type="text" id="tracking-steps" class="input" value="${(config?.tracking_steps || []).join(",")}" /></div>
          <div class="form-group"><label class="form-label">Tracking-Schlüssel</label><input type="text" id="tracking-key" class="input" value="${config?.tracking_key || ""}" /></div>
          <button type="submit" class="btn btn-primary btn-sm">Speichern</button>
        </form>
      </div>
    </div>
    <div class="card" style="overflow: hidden;">
      <h3 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 16px;">Aufträge</h3>
      <table class="table">
        <thead><tr><th>Titel</th><th>E-Mail</th><th>Status</th><th>Fortschritt</th><th>Aktionen</th></tr></thead>
        <tbody>${(orders || []).map(o => `
          <tr>
            <td>${o.title}</td>
            <td>${o.customer_email}</td>
            <td>${o.status}</td>
            <td>${o.progress}%</td>
            <td style="display: flex; gap: 8px;">
              <button class="btn btn-secondary btn-sm edit-order" data-id="${o.id}">Bearbeiten</button>
              <button class="btn btn-secondary btn-sm copy-link" data-id="${o.id}">Link</button>
            </td>
          </tr>
        `).join("")}</tbody>
      </table>
    </div>
  `;

  $("order-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    await createOrder({
      user_id: state.user.id,
      customer_email: $("order-email").value,
      title: $("order-title").value,
      description: $("order-desc").value,
      status: (config?.tracking_steps || ["Eingegangen"])[0],
      progress: 0,
    });
    renderOrders(container);
  });

  $("tracking-config-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    await setSiteConfig({
      tracking_key: $("tracking-key").value,
      tracking_steps: $("tracking-steps").value.split(",").map(s => s.trim()).filter(Boolean),
    });
    showAuthMessage("Tracking-Einstellungen gespeichert.", "success");
  });

  container.querySelectorAll(".edit-order").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const orderId = btn.dataset.id;
      const orderRes = await getOrder?.(orderId);
      const order = orderRes?.data;
      if (!order) return alert("Auftrag nicht gefunden");
      const updates = await renderOrderEditor(order, config);
      if (!updates) return;
      await updateOrder(orderId, updates);
      await createOrderUpdate({ order_id: orderId, status: updates.status, progress: updates.progress, message: updates.update_message || "" });
      renderOrders(container);
    });
  });

  container.querySelectorAll(".copy-link").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const orderId = btn.dataset.id;
      const encrypted = await encryptTrackingData(JSON.stringify({ orderId }), config?.tracking_key || "xsyna-default-tracking-key-32");
      const url = `${window.location.origin}/track?data=${encodeURIComponent(encrypted)}`;
      navigator.clipboard.writeText(url);
      showAuthMessage("Tracking-Link kopiert.", "success");
    });
  });
}

async function renderOrderEditor(order, config) {
  const steps = config?.tracking_steps || ["Eingegangen", "In Bearbeitung", "Qualitätskontrolle", "Abgeschlossen"];
  const status = prompt(`Neuer Status? (${steps.join(", ")})`, order.status);
  if (!status) return null;
  const progress = parseInt(prompt("Fortschritt in % (0-100):", order.progress), 10);
  if (Number.isNaN(progress)) return null;
  const message = prompt("Update-Nachricht:");
  return { status, progress, update_message: message };
}

function todayTime() {
  const today = new Date().toISOString().split("T")[0];
  const entries = JSON.parse(localStorage.getItem("xsyna_time_entries") || "[]");
  const ms = entries.filter(e => e.date === today && e.duration_ms).reduce((s, e) => s + e.duration_ms, 0);
  return formatDuration(ms);
}

window.addEventListener("xsnav", (e) => navigate(e.detail));

$("login-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("email").value.trim();
  if (!email) return;
  $("login-button").disabled = true; $("login-button").textContent = "Wird gesendet...";
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin + "/internal-services" } });
  $("login-button").disabled = false; $("login-button").textContent = "Magic-Link senden";
  if (error) showAuthMessage("Fehler: " + error.message, "error");
  else showAuthMessage("Login-Link gesendet. Bitte E-Mail prüfen.", "success");
});

$("logout-btn")?.addEventListener("click", async () => { await supabase.auth.signOut(); location.reload(); });

function dashboardIcon() { return `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>`; }
function adminIcon() { return `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 1v6m0 6v6"/><circle cx="12" cy="12" r="9"/></svg>`; }
function usersIcon() { return `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/></svg>`; }
function betaIcon() { return `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>`; }
function accountIcon() { return `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`; }
function supportIcon() { return `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M18 18.72a9 9 0 0 0 1.74-2.31"/><path d="M21.66 10.5a9 9 0 1 0-18 0c0 3.5 2 6.5 5 8.5"/></svg>`; }
function crmIcon() { return `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/></svg>`; }
function timeIcon() { return `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`; }
function chatIcon() { return `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`; }
function docsIcon() { return `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`; }
function orderIcon() { return `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4H6Z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`; }
function gameIcon() { return `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M6 12h12"/><path d="M12 6v12"/></svg>`; }
function synaiIcon() { return `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/></svg>`; }

checkSession();

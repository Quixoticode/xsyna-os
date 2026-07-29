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
  getOrder,
  createOrder,
  updateOrder,
  getOrderUpdates,
  createOrderUpdate,
  encryptTrackingData,
  getMaintenanceSchedule,
  createMaintenanceSchedule,
  updateMaintenanceSchedule,
  deleteMaintenanceSchedule,
  getAnnouncements,
  getAllAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  getJobs,
  getAllJobs,
  createJob,
  updateJob,
  deleteJob,
  getAuditLog,
  logAction,
  getUserPreferences,
  setUserPreferences,
  updatePassword,
  getFeatureFlags,
  updateFeatureFlag,
  getNotifications,
  countUnreadNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getWebApps,
  getAllWebApps,
  createWebApp,
  updateWebApp,
  getWebAppGrants,
  createWebAppGrant,
  deleteWebAppGrant,
  getApiKeys,
  createApiKey,
  deleteApiKey,
  getSystemHealth,
  insertSystemHealth,
  updateLastSeen,
  getTeams,
  getTeam,
  createTeam,
  getTeamMembers,
  inviteTeamMember,
  getBillingTiers,
  getSubscription,
  createSubscription,
  getInferenceLogs,
  createInferenceLog,
  getUsageStats,
  upsertUsageStat,
  getQuota,
  upsertQuota,
  getDatasets,
  createDataset,
  getTuningJobs,
  createTuningJob,
  updateTuningJob,
  getWebhooks,
  createWebhook,
  deleteWebhook,
  getPublishedModels,
  getAllPublishedModels,
  createPublishedModel,
  approvePublishedModel,
  getInviteCodes,
  createInviteCode,
  validateInviteCode,
  redeemInviteCode,
} from "./js/supabase-db.js";
import { toast, confirmModal, initTheme, toggleTheme, initKeyboardShortcuts, initInactivityTimeout } from "./js/ui.js";

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
  notifications: { title: "Benachrichtigungen", icon: bellIcon, render: renderNotifications },
  apikeys: { title: "API Keys", icon: keyIcon, render: renderApiKeys },
  webapps: { title: "App Directory", icon: docsIcon, render: renderWebApps },
  maintenance: { title: "Wartungsplan", icon: adminIcon, render: renderMaintenancePlanner, requires: ["admin"] },
  announcements: { title: "News", icon: docsIcon, render: renderAnnouncementsAdmin, requires: ["admin"] },
  jobs: { title: "Stellen", icon: usersIcon, render: renderJobsAdmin, requires: ["admin"] },
  audit: { title: "Audit-Log", icon: adminIcon, render: renderAuditLog, requires: ["admin", "moderator"] },
  features: { title: "Feature Flags", icon: adminIcon, render: renderFeatureFlags, requires: ["admin"] },
  health: { title: "System Health", icon: timeIcon, render: renderSystemHealth, requires: ["admin"] },
  betareq: { title: "Beta-Zugang", icon: betaIcon, render: renderBetaRequest },
  support: { title: "Support", icon: supportIcon, render: renderSupport },
  crm: { title: "CRM", icon: crmIcon, render: renderCRM, requires: ["admin", "moderator"] },
  time: { title: "Zeiterfassung", icon: timeIcon, render: renderTimeTracking },
  chat: { title: "Chat", icon: chatIcon, render: renderChat },
  docs: { title: "Docs", icon: docsIcon, render: renderDocsEditor, requires: ["admin", "moderator"] },
  game: { title: "xSyna Game", icon: gameIcon, render: renderGame },
  synai: { title: "Mini SynAI", icon: synaiIcon, render: renderMiniSynAI },
  teams: { title: "Teams", icon: usersIcon, render: renderTeams },
  billing: { title: "Billing", icon: orderIcon, render: renderBilling },
  playground: { title: "Playground", icon: synaiIcon, render: renderPlayground },
  usage: { title: "Usage", icon: timeIcon, render: renderUsage },
  datasets: { title: "Datasets", icon: docsIcon, render: renderDatasets },
  tuning: { title: "Tuning Jobs", icon: synaiIcon, render: renderTuningJobs },
  webhooks2: { title: "Webhooks", icon: docsIcon, render: renderWebhooks2 },
  modelhub: { title: "Model Hub", icon: gameIcon, render: renderModelHub },
  invites: { title: "Invite Codes", icon: adminIcon, render: renderInviteCodes, requires: ["admin"] },
};

let currentPage = "dashboard";
let timerInterval = null;
let realtimeChannel = null;

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
  else { const ms = $("maintenance-screen"); if (ms) ms.style.display = "none"; }

  initNotificationBell();
  updateLastSeen(state.user.id).catch(() => {});

  initTheme();
  initKeyboardShortcuts({
    h: () => navigate("dashboard"),
    a: () => isAdmin(state.profile) && navigate("admin"),
    u: () => isAdmin(state.profile) && navigate("users"),
    o: () => isStaff(state.profile) && navigate("orders"),
    t: () => navigate("time"),
    n: () => navigate("support"),
    d: () => navigate("docs"),
    g: () => navigate("game"),
    s: () => navigate("synai"),
    w: () => navigate("webapps"),
    k: () => navigate("apikeys"),
    f: () => isAdmin(state.profile) && navigate("features"),
    y: () => isAdmin(state.profile) && navigate("health"),
    m: () => isAdmin(state.profile) && navigate("maintenance"),
    j: () => isAdmin(state.profile) && navigate("announcements"),
    l: () => isAdmin(state.profile) && navigate("jobs"),
    e: () => isStaff(state.profile) && navigate("audit"),
  });
  initInactivityTimeout(async () => { await supabase.auth.signOut(); window.location.href = "/auth"; }, 30 * 60 * 1000);

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
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
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

async function renderAccount(container) {
  const prefs = await getUserPreferences(state.user?.id);
  container.innerHTML = `
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 24px;">
      <div class="card">
        <h3 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 12px;">Profil</h3>
        <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 16px;">E-Mail: <span style="color: var(--text);">${state.user?.email || "Gast"}</span></p>
        <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 16px;">Rolle: <span style="color: var(--cyan); text-transform: uppercase;">${state.profile?.role || "user"}</span></p>
      </div>
      <div class="card">
        <h3 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 12px;">Sicherheit</h3>
        <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 16px;">Ändere dein Passwort oder verwalte deinen Account.</p>
        <button id="change-password" class="btn btn-secondary btn-sm" style="margin-bottom: 12px;">Passwort ändern</button>
        <button id="delete-account" class="btn btn-secondary btn-sm" style="color:#ef4444;border-color:rgba(239,68,68,0.4);">Account löschen</button>
      </div>
      <div class="card">
        <h3 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 12px;">Erscheinungsbild</h3>
        <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 16px;">Aktuelles Theme: <span id="current-theme">${prefs?.data?.theme || "system"}</span></p>
        <button id="toggle-theme" class="btn btn-secondary btn-sm">Theme wechseln</button>
      </div>
      <div class="card">
        <h3 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 12px;">Support</h3>
        <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 16px;">Kontaktiere das xSyna Support-Team.</p>
        <button onclick="window.dispatchEvent(new CustomEvent('xsnav',{detail:'support'}))" class="btn btn-primary btn-sm">Ticket erstellen</button>
      </div>
    </div>
  `;
  $("change-password")?.addEventListener("click", changePassword);
  $("delete-account")?.addEventListener("click", deleteAccountAction);
  $("toggle-theme")?.addEventListener("click", async () => {
    const next = toggleTheme();
    $("current-theme").textContent = next;
    await setUserPreferences(state.user.id, { theme: next, notifications_enabled: prefs?.data?.notifications_enabled ?? true });
  });
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

  realtimeChannel = supabase.channel("orders-realtime")
    .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
      renderOrders(container);
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "order_updates" }, () => {
      renderOrders(container);
    })
    .subscribe();

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

async function changePassword() {
  const newPassword = prompt("Neues Passwort (min. 6 Zeichen):");
  if (!newPassword || newPassword.length < 6) return toast("Passwort zu kurz", "error");
  const { error } = await updatePassword(newPassword);
  if (error) toast("Fehler: " + error.message, "error");
  else toast("Passwort erfolgreich aktualisiert", "success");
}

async function deleteAccountAction() {
  if (!await confirmModal("Account unwiderruflich löschen? Alle Daten werden entfernt.")) return;
  await supabase.from("profiles").delete().eq("id", state.user.id);
  localStorage.clear();
  await supabase.auth.signOut();
  toast("Account wurde entfernt. Du wurdest abgemeldet.", "success");
  setTimeout(() => { window.location.href = "/"; }, 1500);
}

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

async function renderMaintenancePlanner(container) {
  if (!isAdmin(state.profile)) { container.innerHTML = "<p style='color:#f87171'>Zugriff verweigert.</p>"; return; }
  const { data: schedules, error } = await getMaintenanceSchedule();
  if (error) { container.innerHTML = `<p style='color:#f87171'>Fehler: ${error.message}</p>`; return; }

  container.innerHTML = `
    <div class="card" style="margin-bottom: 24px;">
      <h3 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 16px;">Neue Wartungsplanung</h3>
      <form id="maintenance-schedule-form" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; align-items: end;">
        <div class="form-group" style="margin: 0;"><input type="text" id="ms-title" class="input" placeholder="Titel" required /></div>
        <div class="form-group" style="margin: 0;"><input type="datetime-local" id="ms-starts" class="input" required /></div>
        <div class="form-group" style="margin: 0;"><input type="datetime-local" id="ms-ends" class="input" /></div>
        <button type="submit" class="btn btn-primary btn-sm" style="height: fit-content;">Hinzufügen</button>
      </form>
    </div>
    <div class="card" style="overflow: hidden;">
      <h3 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 16px;">Geplante Wartungen</h3>
      <table class="table">
        <thead><tr><th>Titel</th><th>Start</th><th>Ende</th><th>Status</th><th>Aktionen</th></tr></thead>
        <tbody>${(schedules || []).map(s => `
          <tr>
            <td>${s.title}</td>
            <td>${new Date(s.starts_at).toLocaleString("de-DE")}</td>
            <td>${s.ends_at ? new Date(s.ends_at).toLocaleString("de-DE") : "-"}</td>
            <td>${s.status}</td>
            <td style="display: flex; gap: 8px;">
              ${["scheduled","in_progress","completed","cancelled"].filter(st => st !== s.status).map(st => `<button class="btn btn-secondary btn-sm ms-status" data-id="${s.id}" data-status="${st}">${st}</button>`).join("")}
              <button class="btn btn-secondary btn-sm ms-delete" data-id="${s.id}" style="color:#ef4444;border-color:rgba(239,68,68,0.4);">Löschen</button>
            </td>
          </tr>
        `).join("")}</tbody>
      </table>
    </div>
  `;

  $("maintenance-schedule-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    await createMaintenanceSchedule({
      title: $("ms-title").value,
      starts_at: new Date($("ms-starts").value).toISOString(),
      ends_at: $("ms-ends").value ? new Date($("ms-ends").value).toISOString() : null,
      created_by: state.user.id,
    });
    renderMaintenancePlanner(container);
  });

  container.querySelectorAll(".ms-status").forEach(btn => {
    btn.addEventListener("click", async () => {
      await updateMaintenanceSchedule(btn.dataset.id, { status: btn.dataset.status });
      renderMaintenancePlanner(container);
    });
  });

  container.querySelectorAll(".ms-delete").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (await confirmModal("Wartungseintrag löschen?")) {
        await deleteMaintenanceSchedule(btn.dataset.id);
        renderMaintenancePlanner(container);
      }
    });
  });
}

async function renderAnnouncementsAdmin(container) {
  if (!isAdmin(state.profile)) { container.innerHTML = "<p style='color:#f87171'>Zugriff verweigert.</p>"; return; }
  const { data: items, error } = await getAllAnnouncements();
  if (error) { container.innerHTML = `<p style='color:#f87171'>Fehler: ${error.message}</p>`; return; }

  container.innerHTML = `
    <div class="card" style="margin-bottom: 24px;">
      <h3 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 16px;">Neue Announcement</h3>
      <form id="announcement-form" style="display: grid; grid-template-columns: 1fr; gap: 12px;">
        <div class="form-group" style="margin: 0;"><input type="text" id="an-title" class="input" placeholder="Titel" required /></div>
        <div class="form-group" style="margin: 0;"><textarea id="an-body" class="input" rows="2" placeholder="Text"></textarea></div>
        <div style="display: flex; gap: 12px; align-items: center;">
          <label style="display: flex; align-items: center; gap: 8px; color: var(--text-secondary); font-size: 0.9rem;"><input type="checkbox" id="an-pinned" /> Angeheftet</label>
          <label style="display: flex; align-items: center; gap: 8px; color: var(--text-secondary); font-size: 0.9rem;"><input type="checkbox" id="an-published" checked /> Veröffentlicht</label>
          <button type="submit" class="btn btn-primary btn-sm" style="margin-left: auto;">Hinzufügen</button>
        </div>
      </form>
    </div>
    <div style="display: flex; flex-direction: column; gap: 12px;">
      ${(items || []).map(a => `
        <div class="card card-sm" style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <div style="font-weight: 600;">${a.title} ${a.pinned ? "📌" : ""} ${a.published ? "" : "<span style='color:var(--text-muted);font-size:0.75rem;'>(Entwurf)</span>"}</div>
            <div style="font-size: 0.85rem; color: var(--text-muted);">${a.body?.slice(0, 80)}...</div>
          </div>
          <button class="btn btn-secondary btn-sm an-delete" data-id="${a.id}" style="color:#ef4444;border-color:rgba(239,68,68,0.4);">Löschen</button>
        </div>
      `).join("")}
    </div>
  `;

  $("announcement-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    await createAnnouncement({
      title: $("an-title").value,
      body: $("an-body").value,
      pinned: $("an-pinned").checked,
      published: $("an-published").checked,
      created_by: state.user.id,
    });
    renderAnnouncementsAdmin(container);
  });

  container.querySelectorAll(".an-delete").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (await confirmModal("Announcement löschen?")) {
        await deleteAnnouncement(btn.dataset.id);
        renderAnnouncementsAdmin(container);
      }
    });
  });
}

async function renderJobsAdmin(container) {
  if (!isAdmin(state.profile)) { container.innerHTML = "<p style='color:#f87171'>Zugriff verweigert.</p>"; return; }
  const { data: jobs, error } = await getAllJobs();
  if (error) { container.innerHTML = `<p style='color:#f87171'>Fehler: ${error.message}</p>`; return; }

  container.innerHTML = `
    <div class="card" style="margin-bottom: 24px;">
      <h3 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 16px;">Neue Stelle</h3>
      <form id="job-form" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; align-items: end;">
        <div class="form-group" style="margin: 0;"><input type="text" id="job-title" class="input" placeholder="Titel" required /></div>
        <div class="form-group" style="margin: 0;"><input type="text" id="job-dept" class="input" placeholder="Abteilung" /></div>
        <div class="form-group" style="margin: 0;"><input type="text" id="job-location" class="input" placeholder="Ort" /></div>
        <div class="form-group" style="margin: 0;"><input type="text" id="job-reqs" class="input" placeholder="Anforderungen (kommasep.)" /></div>
        <button type="submit" class="btn btn-primary btn-sm" style="height: fit-content;">Hinzufügen</button>
      </form>
    </div>
    <div style="display: flex; flex-direction: column; gap: 12px;">
      ${(jobs || []).map(j => `
        <div class="card card-sm" style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <div style="font-weight: 600;">${j.title} <span style="font-size:0.75rem;color:var(--text-muted);">${j.department} | ${j.location}</span></div>
            <div style="font-size: 0.85rem; color: var(--text-muted);">${j.active ? "🟢 Aktiv" : "🔴 Inaktiv"}</div>
          </div>
          <button class="btn btn-secondary btn-sm job-toggle" data-id="${j.id}" data-active="${j.active}">${j.active ? "Deaktivieren" : "Aktivieren"}</button>
        </div>
      `).join("")}
    </div>
  `;

  $("job-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    await createJob({
      title: $("job-title").value,
      department: $("job-dept").value,
      location: $("job-location").value,
      requirements: $("job-reqs").value.split(",").map(s => s.trim()).filter(Boolean),
      active: true,
      created_by: state.user.id,
    });
    renderJobsAdmin(container);
  });

  container.querySelectorAll(".job-toggle").forEach(btn => {
    btn.addEventListener("click", async () => {
      await updateJob(btn.dataset.id, { active: btn.dataset.active !== "true" });
      renderJobsAdmin(container);
    });
  });
}

async function renderAuditLog(container) {
  if (!isStaff(state.profile)) { container.innerHTML = "<p style='color:#f87171'>Zugriff verweigert.</p>"; return; }
  const { data: logs, error } = await getAuditLog(100);
  if (error) { container.innerHTML = `<p style='color:#f87171'>Fehler: ${error.message}</p>`; return; }
  container.innerHTML = `
    <div class="card" style="overflow: hidden;">
      <table class="table">
        <thead><tr><th>Zeit</th><th>Aktion</th><th>Tabelle</th><th>Payload</th></tr></thead>
        <tbody>${(logs || []).map(l => `
          <tr>
            <td>${new Date(l.created_at).toLocaleString("de-DE")}</td>
            <td>${l.action}</td>
            <td>${l.table_name || "-"}</td>
            <td><pre style="font-size:0.75rem;color:var(--text-muted);max-width:300px;overflow:hidden;text-overflow:ellipsis;">${JSON.stringify(l.payload).slice(0, 120)}</pre></td>
          </tr>
        `).join("")}</tbody>
      </table>
    </div>
  `;
}

checkSession();

// --- Notifications ---

async function initNotificationBell() {
  const header = $("user-email")?.parentElement;
  if (!header || $("notif-bell")) return;
  header.insertAdjacentHTML("afterbegin", `
    <button id="notif-bell" style="background:transparent;border:none;color:var(--text);cursor:pointer;position:relative;margin-right:12px;" aria-label="Benachrichtigungen">
      ${bellIcon()}
      <span id="notif-badge" style="display:none;position:absolute;top:-4px;right:-4px;background:var(--amber);border-radius:50%;width:10px;height:10px;"></span>
    </button>
  `);
  $("notif-bell")?.addEventListener("click", () => navigate("notifications"));
  await refreshNotificationBadge();
}

async function refreshNotificationBadge() {
  if (!state.user) return;
  const { count } = await countUnreadNotifications(state.user.id);
  const badge = $("notif-badge");
  if (badge) badge.style.display = count > 0 ? "block" : "none";
}

async function renderNotifications(container) {
  const { data: notifications, error } = await getNotifications(state.user.id);
  if (error) { container.innerHTML = `<p style='color:#f87171'>Fehler: ${error.message}</p>`; return; }

  const unread = (notifications || []).filter(n => !n.read).length;

  container.innerHTML = `
    <div class="card" style="margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center;">
      <div>
        <h3 style="font-size: 1.1rem; font-weight: 700;">Benachrichtigungen</h3>
        <p style="color: var(--text-muted); font-size: 0.85rem;">${unread} ungelesen</p>
      </div>
      <button id="mark-all-read" class="btn btn-secondary btn-sm">Alle als gelesen markieren</button>
    </div>
    <div style="display: flex; flex-direction: column; gap: 12px;">
      ${(notifications || []).map(n => `
        <div class="card card-sm" style="${n.read ? '' : 'border-left: 3px solid var(--cyan);'}">
          <div style="display: flex; justify-content: space-between; align-items: start; gap: 12px;">
            <div>
              <div style="font-weight: ${n.read ? '400' : '700'}; margin-bottom: 4px;">${n.title}</div>
              <div style="font-size: 0.85rem; color: var(--text-secondary);">${n.message || ""}</div>
              <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 8px;">${new Date(n.created_at).toLocaleString("de-DE")}</div>
            </div>
            ${!n.read ? `<button class="btn btn-secondary btn-sm mark-read" data-id="${n.id}">Gelesen</button>` : ""}
          </div>
        </div>
      `).join("")}
    </div>
  `;

  $("mark-all-read")?.addEventListener("click", async () => {
    await markAllNotificationsRead(state.user.id);
    refreshNotificationBadge();
    renderNotifications(container);
  });

  container.querySelectorAll(".mark-read").forEach(btn => {
    btn.addEventListener("click", async () => {
      await markNotificationRead(btn.dataset.id);
      refreshNotificationBadge();
      renderNotifications(container);
    });
  });
}

async function renderApiKeys(container) {
  const { data: keys, error } = await getApiKeys(state.user.id);
  if (error) { container.innerHTML = `<p style='color:#f87171'>Fehler: ${error.message}</p>`; return; }

  container.innerHTML = `
    <div class="card" style="margin-bottom: 24px;">
      <h3 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 16px;">Neuer API-Key</h3>
      <form id="apikey-form" style="display: flex; gap: 12px; flex-wrap: wrap; align-items: end;">
        <div class="form-group" style="margin: 0; flex: 1; min-width: 200px;">
          <label class="form-label">Name</label>
          <input type="text" id="apikey-name" class="input" placeholder="z.B. CI-Deployment" required />
        </div>
        <button type="submit" class="btn btn-primary btn-sm" style="height: fit-content;">Erstellen</button>
      </form>
      <div id="apikey-raw" style="display: none; margin-top: 16px; padding: 12px; background: rgba(0,240,255,0.05); border: 1px solid rgba(0,240,255,0.2); border-radius: 8px;">
        <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 8px;">Speichere diesen Key sofort. Er wird nie wieder angezeigt.</div>
        <code id="apikey-raw-value" style="display: block; word-break: break-all; font-family: var(--font-mono); color: var(--cyan);"></code>
      </div>
    </div>
    <div style="display: flex; flex-direction: column; gap: 12px;">
      ${(keys || []).map(k => `
        <div class="card card-sm" style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <div style="font-weight: 600;">${k.name}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">Scopes: ${(k.scopes || []).join(", ")} | Erstellt: ${new Date(k.created_at).toLocaleDateString("de-DE")}</div>
          </div>
          <button class="btn btn-secondary btn-sm delete-key" data-id="${k.id}">Löschen</button>
        </div>
      `).join("")}
    </div>
  `;

  $("apikey-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = $("apikey-name").value.trim();
    const { data, error } = await createApiKey({ user_id: state.user.id, name });
    if (error) { showAuthMessage("Fehler: " + error.message, "error"); return; }
    const rawBox = $("apikey-raw");
    const rawValue = $("apikey-raw-value");
    rawBox.style.display = "block";
    rawValue.textContent = data.raw_key;
    renderApiKeys(container);
  });

  container.querySelectorAll(".delete-key").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (await confirmModal("API-Key wirklich löschen?")) {
        await deleteApiKey(btn.dataset.id);
        renderApiKeys(container);
      }
    });
  });
}

async function renderWebApps(container) {
  const [{ data: apps }, { data: grants }] = await Promise.all([
    getWebApps(),
    getWebAppGrants(state.user.id),
  ]);

  const grantMap = new Map((grants || []).map(g => [g.app_id, g]));

  container.innerHTML = `
    <div class="card" style="margin-bottom: 24px;">
      <h3 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 8px;">xSyna App Directory</h3>
      <p style="color: var(--text-secondary); font-size: 0.9rem;">Verbinde externe WebApps mit deinem xSyna Account.</p>
    </div>
    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; margin-bottom: 24px;">
      ${(apps || []).map(app => {
        const grant = grantMap.get(app.id);
        return `
          <div class="card card-sm" style="display: flex; flex-direction: column; gap: 12px;">
            <div style="font-weight: 700;">${app.name}</div>
            <div style="font-size: 0.85rem; color: var(--text-secondary); flex: 1;">${app.description || ""}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">Scopes: ${(app.scopes || []).join(", ")}</div>
            <button class="btn ${grant ? 'btn-secondary' : 'btn-primary'} btn-sm toggle-grant" data-app="${app.id}" data-grant="${grant?.id || ""}" data-active="${!!grant}">
              ${grant ? "Trennen" : "Verbinden"}
            </button>
          </div>
        `;
      }).join("")}
    </div>
    ${isAdmin(state.profile) ? `
    <div class="card">
      <h3 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 16px;">Neue App registrieren (Admin)</h3>
      <form id="webapp-form" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; align-items: end;">
        <div class="form-group" style="margin: 0;"><input type="text" id="wa-name" class="input" placeholder="App Name" required /></div>
        <div class="form-group" style="margin: 0;"><input type="text" id="wa-slug" class="input" placeholder="Slug" required /></div>
        <div class="form-group" style="margin: 0;"><input type="text" id="wa-uri" class="input" placeholder="Redirect URI" /></div>
        <button type="submit" class="btn btn-primary btn-sm" style="height: fit-content;">Registrieren</button>
      </form>
    </div>
    ` : ""}
  `;

  container.querySelectorAll(".toggle-grant").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (btn.dataset.active === "true") {
        await deleteWebAppGrant(btn.dataset.grant);
      } else {
        await createWebAppGrant({ app_id: btn.dataset.app, user_id: state.user.id, scopes: ["read:profile"] });
      }
      renderWebApps(container);
    });
  });

  $("webapp-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    await createWebApp({
      owner_id: state.user.id,
      name: $("wa-name").value,
      slug: $("wa-slug").value,
      redirect_uris: [$("wa-uri").value].filter(Boolean),
    });
    renderWebApps(container);
  });
}

async function renderFeatureFlags(container) {
  if (!isAdmin(state.profile)) { container.innerHTML = "<p style='color:#f87171'>Zugriff verweigert.</p>"; return; }
  const { data: flags, error } = await getFeatureFlags();
  if (error) { container.innerHTML = `<p style='color:#f87171'>Fehler: ${error.message}</p>`; return; }

  container.innerHTML = `
    <div class="card" style="margin-bottom: 24px;">
      <h3 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 8px;">Feature Flags</h3>
      <p style="color: var(--text-secondary); font-size: 0.9rem;">Schalte Funktionen für alle Benutzer ein oder aus.</p>
    </div>
    <div style="display: flex; flex-direction: column; gap: 12px;">
      ${(flags || []).map(f => `
        <div class="card card-sm" style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <div style="font-weight: 600;">${f.label}</div>
            <div style="font-size: 0.85rem; color: var(--text-muted);">${f.description || ""} <span style="color:var(--text-secondary);">(min. Rolle: ${f.min_role})</span></div>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" class="flag-toggle" data-id="${f.id}" ${f.enabled ? "checked" : ""} />
            <span style="margin-left: 8px; font-size: 0.85rem;">${f.enabled ? "Aktiv" : "Inaktiv"}</span>
          </label>
        </div>
      `).join("")}
    </div>
  `;

  container.querySelectorAll(".flag-toggle").forEach(t => {
    t.addEventListener("change", async () => {
      await updateFeatureFlag(t.dataset.id, { enabled: t.checked });
      renderFeatureFlags(container);
    });
  });
}

async function renderSystemHealth(container) {
  if (!isAdmin(state.profile)) { container.innerHTML = "<p style='color:#f87171'>Zugriff verweigert.</p>"; return; }
  const { data: metrics, error } = await getSystemHealth(100);
  if (error) { container.innerHTML = `<p style='color:#f87171'>Fehler: ${error.message}</p>`; return; }

  container.innerHTML = `
    <div class="card" style="margin-bottom: 24px;">
      <h3 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 16px;">Neuer Health-Metric</h3>
      <form id="health-form" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; align-items: end;">
        <div class="form-group" style="margin: 0;"><input type="text" id="health-metric" class="input" placeholder="Metric" required /></div>
        <div class="form-group" style="margin: 0;">
          <select id="health-status" class="input" required>
            <option value="operational">Operational</option>
            <option value="degraded">Degraded</option>
            <option value="down">Down</option>
            <option value="maintenance">Maintenance</option>
          </select>
        </div>
        <div class="form-group" style="margin: 0;"><input type="text" id="health-value" class="input" placeholder="Value" /></div>
        <button type="submit" class="btn btn-primary btn-sm" style="height: fit-content;">Speichern</button>
      </form>
    </div>
    <div style="display: flex; flex-direction: column; gap: 12px;">
      ${(metrics || []).map(m => `
        <div class="card card-sm" style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <div style="font-weight: 600;">${m.metric}</div>
            <div style="font-size: 0.85rem; color: var(--text-muted);">${new Date(m.created_at).toLocaleString("de-DE")}</div>
          </div>
          <div style="text-align: right;">
            <div style="font-weight: 700; color: ${statusColor(m.status)};">${m.status}</div>
            <div style="font-size: 0.85rem; color: var(--text-muted);">${m.value || "-"}</div>
          </div>
        </div>
      `).join("")}
    </div>
  `;

  $("health-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    await insertSystemHealth({
      metric: $("health-metric").value,
      status: $("health-status").value,
      value: $("health-value").value,
    });
    renderSystemHealth(container);
  });
}

function statusColor(status) {
  switch (status) {
    case "operational": return "#22d3ee";
    case "degraded": return "#fbbf24";
    case "down": return "#f87171";
    case "maintenance": return "#a78bfa";
    default: return "#94a3b8";
  }
}

function bellIcon() {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`;
}

function keyIcon() {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="M15.5 7.5l3 3L22 7l-3-3-1.5 1.5Z"/></svg>`;
}
// --- New CEO Features Render Functions ---

async function renderTeams(container) {
  const { data: teams, error } = await getTeams(state.user.id);
  if (error) { container.innerHTML = `<p style='color:#f87171'>Fehler: ${error.message}</p>`; return; }

  container.innerHTML = `
    <div class="card" style="margin-bottom: 24px;">
      <h3 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 16px;">Neues Team</h3>
      <form id="team-form" style="display: flex; gap: 12px; flex-wrap: wrap; align-items: end;">
        <div class="form-group" style="margin: 0; flex: 1; min-width: 200px;">
          <label class="form-label">Team Name</label>
          <input type="text" id="team-name" class="input" placeholder="xSyna Labs" required />
        </div>
        <div class="form-group" style="margin: 0; flex: 1; min-width: 200px;">
          <label class="form-label">Slug</label>
          <input type="text" id="team-slug" class="input" placeholder="xsyna-labs" required />
        </div>
        <button type="submit" class="btn btn-primary btn-sm" style="height: fit-content;">Erstellen</button>
      </form>
    </div>
    <div style="display: flex; flex-direction: column; gap: 12px;">
      ${(teams || []).map(t => `
        <div class="card card-sm" style="display: flex; justify-content: space-between; align-items: center; cursor: pointer;">
          <div>
            <div style="font-weight: 700;">${t.name}</div>
            <div style="font-size: 0.85rem; color: var(--text-muted);">${t.slug}</div>
          </div>
          <button class="btn btn-secondary btn-sm view-team" data-id="${t.id}">Öffnen</button>
        </div>
      `).join("")}
    </div>
  `;

  $("team-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    await createTeam({ name: $("team-name").value, slug: $("team-slug").value, owner_id: state.user.id });
    renderTeams(container);
  });
}

async function renderBilling(container) {
  const [{ data: tiers }, { data: subscription }] = await Promise.all([
    getBillingTiers(),
    getSubscription(state.user?.id).catch(() => ({ data: null })),
  ]);

  container.innerHTML = `
    <div class="card" style="margin-bottom: 24px;">
      <h3 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 8px;">Aktuelles Abonnement</h3>
      <p style="color: var(--text-secondary);">${subscription ? `Tier: <strong>${subscription.tier_id}</strong> | Status: ${subscription.status}` : 'Kein aktives Abonnement'}</p>
    </div>
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px;">
      ${(tiers || []).map(t => `
        <div class="card card-sm" style="display: flex; flex-direction: column; gap: 12px;">
          <div style="font-weight: 700; font-size: 1.1rem;">${t.name}</div>
          <div style="font-size: 0.85rem; color: var(--text-secondary); flex: 1;">${t.description}</div>
          <div style="font-size: 1.5rem; font-weight: 700; color: var(--cyan);">€${t.monthly_price}<span style="font-size: 0.75rem; color: var(--text-muted);">/Mo</span></div>
          <ul style="font-size: 0.85rem; color: var(--text-muted); padding-left: 16px;">
            ${(t.features || []).map(f => `<li>${f}</li>`).join("")}
          </ul>
          <button class="btn btn-primary btn-sm select-tier" data-tier="${t.id}">Wählen</button>
        </div>
      `).join("")}
    </div>
  `;

  container.querySelectorAll(".select-tier").forEach(btn => {
    btn.addEventListener("click", async () => {
      toast("Buchung erfolgreich simuliert.", "success");
    });
  });
}

async function renderPlayground(container) {
  container.innerHTML = `
    <div class="card" style="margin-bottom: 24px;">
      <h3 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 16px;">SynAI Inference Playground</h3>
      <form id="inference-form">
        <div class="form-group">
          <label class="form-label">Modell</label>
          <select id="inference-model" class="input">
            <option value="synai-mini">SynAI Mini (128 Neuronen)</option>
            <option value="synai-pro">SynAI Pro (1k Neuronen)</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Prompt</label>
          <textarea id="inference-prompt" class="input" rows="4" placeholder="Gib deinem SynAI eine Aufgabe..."></textarea>
        </div>
        <button type="submit" class="btn btn-primary btn-sm">Inferenz starten</button>
      </form>
      <div id="inference-result" style="margin-top: 24px; display: none; padding: 16px; background: rgba(0,240,255,0.05); border-radius: 8px; font-family: var(--font-mono); font-size: 0.85rem;"></div>
    </div>
  `;

  $("inference-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const model = $("inference-model").value;
    const prompt = $("inference-prompt").value;
    const result = `[SynAI ${model}] Verarbeite Spike-Patterns für: ${prompt.slice(0, 80)}...`;
    await createInferenceLog({ user_id: state.user.id, model_name: model, prompt, result, tokens_used: Math.floor(prompt.length / 4), latency_ms: 120 });
    $("inference-result").style.display = "block";
    $("inference-result").textContent = result;
  });
}

async function renderUsage(container) {
  const { data: logs } = await getInferenceLogs(state.user.id, 100);
  const totalTokens = (logs || []).reduce((sum, l) => sum + (l.tokens_used || 0), 0);

  container.innerHTML = `
    <div class="card" style="margin-bottom: 24px; display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px;">
      <div class="card card-sm"><div style="color: var(--text-muted); font-size: 0.8rem;">API Calls</div><div style="font-size: 1.5rem; font-weight: 700; color: var(--cyan);">${(logs || []).length}</div></div>
      <div class="card card-sm"><div style="color: var(--text-muted); font-size: 0.8rem;">Tokens gesamt</div><div style="font-size: 1.5rem; font-weight: 700; color: var(--amber);">${totalTokens}</div></div>
    </div>
    <div class="card" style="overflow: hidden;">
      <table class="table">
        <thead><tr><th>Zeit</th><th>Modell</th><th>Tokens</th><th>Latenz</th></tr></thead>
        <tbody>${(logs || []).map(l => `
          <tr>
            <td>${new Date(l.created_at).toLocaleString("de-DE")}</td>
            <td>${l.model_name}</td>
            <td>${l.tokens_used}</td>
            <td>${l.latency_ms}ms</td>
          </tr>
        `).join("")}</tbody>
      </table>
    </div>
  `;
}

async function renderDatasets(container) {
  const { data: datasets, error } = await getDatasets(state.user.id);
  if (error) { container.innerHTML = `<p style='color:#f87171'>Fehler: ${error.message}</p>`; return; }

  container.innerHTML = `
    <div class="card" style="margin-bottom: 24px;">
      <h3 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 16px;">Neues Dataset</h3>
      <form id="dataset-form" style="display: flex; gap: 12px; flex-wrap: wrap; align-items: end;">
        <div class="form-group" style="margin: 0; flex: 1; min-width: 200px;">
          <label class="form-label">Name</label>
          <input type="text" id="dataset-name" class="input" placeholder="Trainingsdaten v1" required />
        </div>
        <div class="form-group" style="margin: 0; flex: 1; min-width: 200px;">
          <label class="form-label">Format</label>
          <input type="text" id="dataset-format" class="input" placeholder=".syn, .csv" />
        </div>
        <button type="submit" class="btn btn-primary btn-sm" style="height: fit-content;">Hinzufügen</button>
      </form>
    </div>
    <div style="display: flex; flex-direction: column; gap: 12px;">
      ${(datasets || []).map(d => `
        <div class="card card-sm" style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <div style="font-weight: 700;">${d.name}</div>
            <div style="font-size: 0.85rem; color: var(--text-muted);">${d.format || "-"} | ${d.size_bytes ? (d.size_bytes / 1024).toFixed(2) + " KB" : "-"}</div>
          </div>
          <span style="font-size: 0.75rem; color: var(--text-muted);">${new Date(d.created_at).toLocaleDateString("de-DE")}</span>
        </div>
      `).join("")}
    </div>
  `;

  $("dataset-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    await createDataset({ team_id: state.user.id, name: $("dataset-name").value, format: $("dataset-format").value });
    renderDatasets(container);
  });
}

async function renderTuningJobs(container) {
  const { data: jobs, error } = await getTuningJobs(state.user.id);
  if (error) { container.innerHTML = `<p style='color:#f87171'>Fehler: ${error.message}</p>`; return; }

  container.innerHTML = `
    <div class="card" style="margin-bottom: 24px;">
      <h3 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 16px;">Neuer Tuning-Job</h3>
      <form id="tuning-form" style="display: flex; gap: 12px; flex-wrap: wrap; align-items: end;">
        <div class="form-group" style="margin: 0; flex: 1; min-width: 200px;">
          <label class="form-label">Name</label>
          <input type="text" id="tuning-name" class="input" placeholder="Custom Vision Model" required />
        </div>
        <div class="form-group" style="margin: 0; flex: 1; min-width: 200px;">
          <label class="form-label">Base Model</label>
          <input type="text" id="tuning-base" class="input" placeholder="synai-mini" required />
        </div>
        <button type="submit" class="btn btn-primary btn-sm" style="height: fit-content;">Starten</button>
      </form>
    </div>
    <div style="display: flex; flex-direction: column; gap: 12px;">
      ${(jobs || []).map(j => `
        <div class="card card-sm">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <div style="font-weight: 700;">${j.name}</div>
          <span style="font-size: 0.75rem; color: var(--text-muted);">${j.status}</span>
        </div>
        <div style="width: 100%; height: 8px; background: rgba(255,255,255,0.1); border-radius: 999px; overflow: hidden;">
          <div style="width: ${j.progress}%; height: 100%; background: linear-gradient(135deg, var(--cyan), var(--amber));"></div>
        </div>
        </div>
      `).join("")}
    </div>
  `;

  $("tuning-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    await createTuningJob({ team_id: state.user.id, name: $("tuning-name").value, base_model: $("tuning-base").value });
    renderTuningJobs(container);
  });
}

async function renderWebhooks2(container) {
  const { data: hooks, error } = await getWebhooks(state.user.id);
  if (error) { container.innerHTML = `<p style='color:#f87171'>Fehler: ${error.message}</p>`; return; }

  container.innerHTML = `
    <div class="card" style="margin-bottom: 24px;">
      <h3 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 16px;">Neuer Webhook</h3>
      <form id="webhook-form" style="display: flex; gap: 12px; flex-wrap: wrap; align-items: end;">
        <div class="form-group" style="margin: 0; flex: 1; min-width: 200px;">
          <label class="form-label">Endpoint URL</label>
          <input type="text" id="webhook-url" class="input" placeholder="https://api.example.com/webhook" required />
        </div>
        <div class="form-group" style="margin: 0; flex: 1; min-width: 200px;">
          <label class="form-label">Events (kommasep.)</label>
          <input type="text" id="webhook-events" class="input" placeholder="tuning.completed,order.created" />
        </div>
        <button type="submit" class="btn btn-primary btn-sm" style="height: fit-content;">Hinzufügen</button>
      </form>
    </div>
    <div style="display: flex; flex-direction: column; gap: 12px;">
      ${(hooks || []).map(h => `
        <div class="card card-sm" style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <div style="font-weight: 700;">${h.endpoint_url}</div>
            <div style="font-size: 0.85rem; color: var(--text-muted);">${(h.events || []).join(", ")}</div>
          </div>
          <button class="btn btn-secondary btn-sm delete-webhook" data-id="${h.id}">Löschen</button>
        </div>
      `).join("")}
    </div>
  `;

  $("webhook-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    await createWebhook({ team_id: state.user.id, endpoint_url: $("webhook-url").value, events: $("webhook-events").value.split(",").map(s => s.trim()).filter(Boolean) });
    renderWebhooks2(container);
  });

  container.querySelectorAll(".delete-webhook").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (await confirmModal("Webhook löschen?")) {
        await deleteWebhook(btn.dataset.id);
        renderWebhooks2(container);
      }
    });
  });
}

async function renderModelHub(container) {
  const [{ data: models }, { data: allModels }] = await Promise.all([getPublishedModels(), isAdmin(state.profile) ? getAllPublishedModels() : Promise.resolve({ data: null })]);
  const displayModels = isAdmin(state.profile) ? (allModels || models) : (models || []);

  container.innerHTML = `
    <div class="card" style="margin-bottom: 24px;">
      <h3 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 16px;">Community Model Hub</h3>
      <p style="color: var(--text-secondary);">Entdecke und teile fine-tuned xSyna Modelle.</p>
    </div>
    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px;">
      ${(displayModels || []).map(m => `
        <div class="card card-sm" style="display: flex; flex-direction: column; gap: 12px;">
          <div style="font-weight: 700;">${m.model_name}</div>
          <div style="font-size: 0.85rem; color: var(--text-secondary); flex: 1;">${m.description || ""}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">Base: ${m.base_model || "-"} | Downloads: ${m.downloads}</div>
          ${isAdmin(state.profile) ? `<button class="btn btn-secondary btn-sm approve-model" data-id="${m.id}" data-approved="${m.approved}">${m.approved ? "Freigabe entziehen" : "Freigeben"}</button>` : ""}
        </div>
      `).join("")}
    </div>
  `;

  container.querySelectorAll(".approve-model").forEach(btn => {
    btn.addEventListener("click", async () => {
      await approvePublishedModel(btn.dataset.id, btn.dataset.approved !== "true");
      renderModelHub(container);
    });
  });
}

async function renderInviteCodes(container) {
  if (!isAdmin(state.profile)) { container.innerHTML = "<p style='color:#f87171'>Zugriff verweigert.</p>"; return; }
  const { data: codes, error } = await getInviteCodes();
  if (error) { container.innerHTML = `<p style='color:#f87171'>Fehler: ${error.message}</p>`; return; }

  container.innerHTML = `
    <div class="card" style="margin-bottom: 24px;">
      <h3 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 16px;">Neuer Invite Code</h3>
      <form id="invite-form" style="display: flex; gap: 12px; flex-wrap: wrap; align-items: end;">
        <div class="form-group" style="margin: 0; flex: 1; min-width: 200px;">
          <label class="form-label">Code</label>
          <input type="text" id="invite-code" class="input" placeholder="BETA2026" required />
        </div>
        <div class="form-group" style="margin: 0; flex: 1; min-width: 200px;">
          <label class="form-label">Verwendungen (leer = unbegrenzt)</label>
          <input type="number" id="invite-uses" class="input" placeholder="100" />
        </div>
        <button type="submit" class="btn btn-primary btn-sm" style="height: fit-content;">Erstellen</button>
      </form>
    </div>
    <div style="display: flex; flex-direction: column; gap: 12px;">
      ${(codes || []).map(c => `
        <div class="card card-sm" style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <div style="font-weight: 700; font-family: var(--font-mono);">${c.code}</div>
            <div style="font-size: 0.85rem; color: var(--text-muted);">Verbleibend: ${c.uses_left ?? "∞"}</div>
          </div>
        </div>
      `).join("")}
    </div>
  `;

  $("invite-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const uses = $("invite-uses").value;
    await createInviteCode({ code: $("invite-code").value, uses_left: uses ? parseInt(uses) : null, created_by: state.user.id });
    renderInviteCodes(container);
  });
}

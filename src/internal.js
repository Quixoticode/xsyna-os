import { supabase } from "./js/supabase.js";
import { initNeuralBackground } from "./js/neural-bg.js";
import "./js/sw-register.js";
import {
  getProfile,
  updateProfile,
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

  getInviteCodes,
  createInviteCode,
  validateInviteCode,
  redeemInviteCode,
  getGameScores,
  createGameScore,
  getSavedPrompts,
  createSavedPrompt,
  deleteSavedPrompt,
  getWaitlist,
  createWaitlistEntry,
  updateWaitlistStatus,
  getFeedback,
  createFeedback,
  updateFeedbackStatus,
  getApplications,
  createApplication,
  updateApplicationStatus,
  getReferrals,
  createReferral,
  subscribeNewsletter,
  getNewsletterSubscribers,
  trackUserDevice,
  getUserDevices,
  getRolePermissions,
  updateRolePermissions,
} from "./js/supabase-db.js";
import { toast, confirmModal, initTheme, toggleTheme, initKeyboardShortcuts, initInactivityTimeout, escapeHtml } from "./js/ui.js";

initNeuralBackground("neural-canvas");
console.log("[xSyna] internal.js loaded, neural bg initialized");
window.__XSYNA_APP_READY = false;
window.__XSYNA_INIT_STEP = "module-loaded";

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
  teams: { title: "Teams", icon: usersIcon, render: renderTeams, requires: ["admin"] },
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

function debugStep(step, detail = "") {
  window.__XSYNA_INIT_STEP = step;
  const el = document.getElementById("debug-info");
  if (!el) return;
  el.style.display = "block";
  const line = document.createElement("div");
  line.textContent = `[${new Date().toLocaleTimeString()}] ${step}${detail ? ": " + detail : ""}`;
  el.appendChild(line);
  console.log(`[xSyna debug] ${step}`, detail);
}

debugStep("module-parsed", "internal.js loaded");

async function checkSession() {
  console.log("[xSyna] checkSession started");
  debugStep("checkSession", "start");
  try {
    // Race getSession against a 3s timeout
    let session = null;
    try {
      const sessionPromise = supabase.auth.getSession();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 3000)
      );
      const result = await Promise.race([sessionPromise, timeoutPromise]);
      session = result?.data?.session;
      if (result?.error) {
        console.error("[xSyna] getSession error:", result.error);
      }
    } catch (raceErr) {
      console.warn("[xSyna] getSession race failed:", raceErr.message);
      // Timed out or failed - redirect to auth as fallback
    }

    if (!session || !session.user) {
      debugStep("no-session", "redirect to /auth");
      window.location.href = "/auth?returnTo=" + encodeURIComponent(window.location.pathname + window.location.search);
      return;
    }
    debugStep("session-found", session.user.email);
    state.user = session.user;
    await loadProfile();
  } catch (err) {
    console.error("[xSyna] checkSession failed:", err);
    debugStep("checkSession-error", err.message || err);
    // Show error with retry option
    var appEl = $("app");
    if (appEl) {
      appEl.classList.remove("hidden");
      appEl.style.display = "flex";
      appEl.innerHTML = '<div style="padding:24px;color:#f87171;text-align:center;">' +
        '<p>Fehler beim Laden der Sitzung: ' + escapeHtml(err.message || err) + '</p>' +
        '<button onclick="location.reload()" style="margin-top:12px;padding:10px 20px;background:var(--cyan);color:#000;border:none;border-radius:8px;cursor:pointer;font-weight:600;">Neu laden</button>' +
        '<br><a href="/auth" style="display:inline-block;margin-top:8px;color:var(--cyan);">Zum Login</a>' +
        '</div>';
    }
    window.__XSYNA_APP_READY = true;
  }
}

async function loadProfile() {
  try {
    debugStep("loadProfile", "user " + state.user.id);
    const profile = await getProfile(state.user.id);
    debugStep("profile-loaded", profile ? profile.role : "fallback user");
    state.profile = profile || { role: "user", permissions: [] };
    await initApp();
  } catch (err) {
    console.error("[xSyna] loadProfile failed:", err);
    const appEl = $("app");
    if (appEl) {
      appEl.classList.remove("hidden");
      appEl.style.display = "flex";
      appEl.innerHTML = `<div style="padding:24px;color:#f87171;text-align:center;">Fehler beim Laden des Profils: ${escapeHtml(err.message || err)}<br><button id="retry-load" style="margin-top:12px;padding:8px 16px;background:var(--cyan);border:none;border-radius:8px;color:#000;cursor:pointer;">Erneut versuchen</button></div>`;
      $("retry-load")?.addEventListener("click", () => { location.reload(); });
    }
  }
}

function hasPermission(perms) {
  if (!perms || perms.length === 0) return true;
  if (state.profile?.role === "admin") return true;
  return perms.includes(state.profile?.role) || perms.some((p) => state.profile?.permissions?.includes(p));
}

async function initApp() {
  try {
    debugStep("initApp", "start");
    await syncQueue();
    debugStep("syncQueue", "done");
    const maintenance = await getMaintenance();
    debugStep("maintenance", maintenance?.enabled ? "enabled" : "disabled");
    state.maintenance = maintenance;

    const appEl = $("app");
    appEl.classList.remove("hidden");
    appEl.style.display = "flex";
    window.__XSYNA_APP_READY = true;
    $("user-email").textContent = state.user?.email || "guest@xsyna.de";
    $("role-badge").textContent = (state.profile?.role || "user").toUpperCase();
    debugStep("app-ready", state.user?.email);

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
    g: () => window.open("/games", "_blank"),
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
  } catch (err) {
    console.error("[xSyna] initApp failed:", err);
    const appEl = $("app");
    if (appEl) {
      appEl.classList.remove("hidden");
      appEl.style.display = "flex";
      appEl.innerHTML = `<div style="padding:24px;color:#f87171;text-align:center;">
        <p style="margin-bottom:12px;">Fehler beim Initialisieren des Panels:</p>
        <pre style="background:rgba(0,0,0,0.3);padding:12px;border-radius:8px;font-size:0.8rem;overflow:auto;text-align:left;max-width:600px;margin:0 auto 16px;white-space:pre-wrap;">${escapeHtml(err.message || err)}</pre>
        <button id="clear-cache-reload" style="padding:8px 16px;background:var(--cyan);border:none;border-radius:8px;color:#000;cursor:pointer;">Cache leeren & neu laden</button>
      </div>`;
      $("clear-cache-reload")?.addEventListener("click", () => {
        if ("caches" in window) caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))).finally(() => location.reload());
        else location.reload();
      });
    }
  }
}

function renderSidebar() {
  const nav = $("sidebar-nav");
  nav.innerHTML = Object.entries(pages)
    .filter(([, p]) => hasPermission(p.requires))
    .map(([key, page]) => `
      <button data-page="${key}" class="sidebar-link ${currentPage === key ? "active" : ""}">
        ${page.icon()}
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
        Hier findest du alle internen Tools: CRM, Support, Zeiterfassung, Chat, Docs und das xSyna-Game.
      </p>
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 16px;">
        ${Object.entries(pages).filter(([k]) => k !== "dashboard").map(([k, p]) => `
          <button onclick="window.dispatchEvent(new CustomEvent('xsnav',{detail:'${k}'}))" class="card card-sm" style="text-align: center; cursor: pointer; background: transparent;">
            <div style="display: flex; justify-content: center; margin-bottom: 8px; color: var(--cyan);">${p.icon()}</div>
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
  const profile = state.profile || {};
  container.innerHTML = `
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 24px;">
      <div class="card">
        <h3 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 12px;">Profil bearbeiten</h3>
        <form id="profile-form">
          <div class="form-group">
            <label class="form-label">Anzeigename</label>
            <input type="text" id="profile-fullname" class="input" value="${escapeHtml(profile.full_name || "")}" placeholder="Max Mustermann" />
          </div>
          <div class="form-group">
            <label class="form-label">Avatar URL</label>
            <input type="url" id="profile-avatar" class="input" value="${escapeHtml(profile.avatar_url || "")}" placeholder="https://.../avatar.png" />
          </div>
          <div class="form-group">
            <label class="form-label">E-Mail</label>
            <input type="email" class="input" value="${escapeHtml(state.user?.email || "")}" disabled />
          </div>
          <div class="form-group">
            <label class="form-label">Rolle</label>
            <input type="text" class="input" value="${(profile.role || "user").toUpperCase()}" disabled />
          </div>
          <button type="submit" class="btn btn-primary btn-sm">Profil speichern</button>
        </form>
      </div>
      <div class="card">
        <h3 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 12px;">Sicherheit</h3>
        <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 16px;">Ändere dein Passwort oder verwalte deinen Account.</p>
        <button id="change-password" class="btn btn-secondary btn-sm" style="margin-bottom: 12px;">Passwort ändern</button>
        <button id="register-passkey" class="btn btn-secondary btn-sm" style="margin-bottom: 12px;">Passkey registrieren</button>
        <button id="delete-account" class="btn btn-secondary btn-sm" style="color:#ef4444;border-color:rgba(239,68,68,0.4);">Account löschen</button>
      </div>
      <div class="card">
        <h3 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 12px;">Verknüpfte Konten</h3>
        <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 16px;">Melde dich alternativ mit SSO oder Passkey an.</p>
        <div id="linked-identities" style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px;"></div>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;">
          <button id="link-google" class="btn btn-secondary btn-sm" type="button">Google</button>
          <button id="link-apple" class="btn btn-secondary btn-sm" type="button">Apple</button>
          <button id="link-github" class="btn btn-secondary btn-sm" type="button">GitHub</button>
        </div>
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
  $("profile-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const updates = {
      full_name: $("profile-fullname").value.trim(),
      avatar_url: $("profile-avatar").value.trim(),
    };
    const { data, error } = await updateProfile(state.user.id, updates);
    if (error) {
      toast("Fehler: " + error.message, "error");
    } else {
      state.profile = { ...state.profile, ...data };
      toast("Profil gespeichert", "success");
      renderAccount(container);
    }
  });
  $("change-password")?.addEventListener("click", changePassword);
  $("delete-account")?.addEventListener("click", deleteAccountAction);
  $("register-passkey")?.addEventListener("click", registerPasskeyAction);
  $("link-google")?.addEventListener("click", () => linkProvider("google"));
  $("link-apple")?.addEventListener("click", () => linkProvider("apple"));
  $("link-github")?.addEventListener("click", () => linkProvider("github"));
  renderIdentities();
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
            <option value="xSyn">xSyn</option>
            <option value="xSyna Labs">xSyna Labs</option>
            <option value="xSyna Games">xSyna Games</option>
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

try {
  checkSession();
} catch (err) {
  console.error("[xSyna] top-level checkSession error:", err);
  window.__XSYNA_INIT_STEP = "top-level-error:" + (err.message || err);
  const appEl = $("app");
  if (appEl) {
    appEl.classList.remove("hidden");
    appEl.style.display = "flex";
    appEl.innerHTML = `<div style="padding:24px;color:#f87171;text-align:center;">Kritischer Startfehler: ${escapeHtml(err.message || err)}<br><a href="/auth" style="color:var(--cyan)">Zurück zum Login</a></div>`;
  }
}

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

// --- Missing stub functions ---

async function renderTeams(container) {
  container.innerHTML = `
    <div class="card" style="text-align: center; padding: 48px;">
      <h3 style="color: var(--cyan); margin-bottom: 8px;">Teams</h3>
      <p style="color: var(--text-secondary); margin-bottom: 16px;">Team-Verwaltung ist in Entwicklung.</p>
      <p style="color: var(--text-muted); font-size: 0.85rem;">Bald kannst du hier Teams erstellen und Mitglieder einladen.</p>
    </div>
  `;
}

async function renderInviteCodes(container) {
  container.innerHTML = `
    <div class="card" style="text-align: center; padding: 48px;">
      <h3 style="color: var(--cyan); margin-bottom: 8px;">Invite Codes</h3>
      <p style="color: var(--text-secondary); margin-bottom: 16px;">Einladungs-Codes sind in Entwicklung.</p>
      <p style="color: var(--text-muted); font-size: 0.85rem;">Bald kannst du hier Einladungscodes erstellen und verwalten.</p>
    </div>
  `;
}

async function registerPasskeyAction() {
  try {
    if (typeof supabase.auth.startPasskeyRegistration === "function") {
      const { error } = await supabase.auth.startPasskeyRegistration();
      if (error) throw error;
      toast("Passkey-Registrierung gestartet. Folge den Browser-Anweisungen.", "success");
    } else {
      toast("Passkey wird von diesem Setup noch nicht unterstützt.", "error");
    }
  } catch (e) {
    toast("Passkey-Fehler: " + (e.message || e), "error");
  }
}

async function linkProvider(provider) {
  try {
    if (typeof supabase.auth.linkIdentity === "function") {
      const { error } = await supabase.auth.linkIdentity({
        provider,
        options: { redirectTo: window.location.origin + "/internal-services" },
      });
      if (error) throw error;
    } else {
      toast("Provider-Verknüpfung wird von diesem Setup noch nicht unterstützt.", "error");
    }
  } catch (e) {
    toast("SSO-Fehler: " + (e.message || e), "error");
  }
}

async function renderIdentities() {
  const container = document.getElementById("linked-identities");
  if (!container) return;
  try {
    if (typeof supabase.auth.getUserIdentities === "function") {
      const { data } = await supabase.auth.getUserIdentities();
      if (data?.identities?.length) {
        container.innerHTML = data.identities.map(i =>
          `<div style="font-size: 0.85rem; color: var(--cyan);">${i.provider} (${i.identity_data?.email || "verknüpft"})</div>`
        ).join("");
      } else {
        container.innerHTML = '<div style="font-size: 0.85rem; color: var(--text-muted);">Keine Konten verknüpft.</div>';
      }
    } else {
      container.innerHTML = '<div style="font-size: 0.85rem; color: var(--text-muted);">Identitäten-Abfrage nicht verfügbar.</div>';
    }
  } catch (e) {
    container.innerHTML = '<div style="font-size: 0.85rem; color: var(--text-muted);">Fehler beim Laden.</div>';
  }
}

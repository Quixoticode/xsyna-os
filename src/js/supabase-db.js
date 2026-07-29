import { supabase } from "./supabase.js";

const QUEUE_KEY = "xsyna_sync_queue";
const CACHE_KEY = "xsyna_cache";

function queue(op, table, payload) {
  const q = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
  q.push({ op, table, payload, createdAt: Date.now() });
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
}

function getQueue() {
  return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
}

function clearQueue() {
  localStorage.setItem(QUEUE_KEY, "[]");
}

function cacheRead(key, fallback) {
  const v = localStorage.getItem(CACHE_KEY + ":" + key);
  return v ? JSON.parse(v) : fallback;
}

function cacheWrite(key, value) {
  localStorage.setItem(CACHE_KEY + ":" + key, JSON.stringify(value));
}

export async function syncQueue() {
  if (!navigator.onLine) return;
  const q = getQueue();
  if (!q.length) return;
  for (const item of q) {
    try {
      if (item.op === "insert") {
        await supabase.from(item.table).insert(item.payload);
      } else if (item.op === "update") {
        const { id, ...rest } = item.payload;
        await supabase.from(item.table).update(rest).eq("id", id);
      } else if (item.op === "delete") {
        await supabase.from(item.table).delete().eq("id", item.payload.id);
      }
    } catch (e) {
      console.error("Sync failed for", item, e);
    }
  }
  clearQueue();
}

window.addEventListener("online", syncQueue);

export async function getProfile(userId) {
  if (!userId) return null;
  try {
    const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single();
    if (error) throw error;
    cacheWrite("profile_" + userId, data);
    return data;
  } catch (e) {
    return cacheRead("profile_" + userId, null);
  }
}

export async function setUserRole(email, role) {
  const { data, error } = await supabase.from("profiles").update({ role }).eq("email", email).select().single();
  return { data, error };
}

export async function listUsers() {
  const { data, error } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
  return { data, error };
}

export async function getMaintenance() {
  try {
    const { data, error } = await supabase.from("maintenance_mode").select("*").single();
    if (error) throw error;
    cacheWrite("maintenance", data);
    return data;
  } catch (e) {
    return cacheRead("maintenance", { enabled: false, title: "", status_text: "", progress: 0 });
  }
}

export async function setMaintenance(config) {
  try {
    const { data, error } = await supabase
      .from("maintenance_mode")
      .update({ ...config, updated_at: new Date().toISOString() })
      .eq("id", 1)
      .select()
      .single();
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function getBetaRequests() {
  try {
    const { data, error } = await supabase.from("beta_requests").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function createBetaRequest({ email, product, reason, user_id }) {
  const payload = { email, product, reason, user_id, status: "pending" };
  try {
    const { data, error } = await supabase.from("beta_requests").insert(payload).select().single();
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    queue("insert", "beta_requests", payload);
    return { data: payload, error: null };
  }
}

export async function updateBetaRequestStatus(id, status) {
  try {
    const { data, error } = await supabase.from("beta_requests").update({ status }).eq("id", id).select().single();
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function getTickets() {
  try {
    const { data, error } = await supabase.from("support_tickets").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function createTicket({ email, subject, body, user_id }) {
  const payload = { email, subject, body, user_id, status: "Offen" };
  try {
    const { data, error } = await supabase.from("support_tickets").insert(payload).select().single();
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    queue("insert", "support_tickets", payload);
    return { data: payload, error: null };
  }
}

export async function getCRMContacts() {
  try {
    const { data, error } = await supabase.from("crm_contacts").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function createCRMContact({ name, email, status, added_by }) {
  const payload = { name, email, status, added_by };
  try {
    const { data, error } = await supabase.from("crm_contacts").insert(payload).select().single();
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    queue("insert", "crm_contacts", payload);
    return { data: payload, error: null };
  }
}

export async function getTimeEntries(userId) {
  try {
    const { data, error } = await supabase.from("time_entries").select("*").eq("user_id", userId).order("created_at", { ascending: false });
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function createTimeEntry({ user_id, date, description, duration_ms }) {
  const payload = { user_id, date, description, duration_ms };
  try {
    const { data, error } = await supabase.from("time_entries").insert(payload).select().single();
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    queue("insert", "time_entries", payload);
    return { data: payload, error: null };
  }
}

export async function getChatMessages(userId) {
  try {
    const { data, error } = await supabase.from("chat_messages").select("*").eq("user_id", userId).order("created_at", { ascending: true });
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function createChatMessage({ user_id, text, type = "user" }) {
  const payload = { user_id, text, type };
  try {
    const { data, error } = await supabase.from("chat_messages").insert(payload).select().single();
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    queue("insert", "chat_messages", payload);
    return { data: payload, error: null };
  }
}

export async function getDocs() {
  try {
    const { data, error } = await supabase.from("docs").select("*").single();
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: cacheRead("docs", { content: "# xSyna Docs\n\nHier kannst du interne Dokumentation editieren." }), error: null };
  }
}

export async function saveDocs(content) {
  try {
    const { data, error } = await supabase.from("docs").update({ content, updated_at: new Date().toISOString() }).eq("id", 1).select().single();
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    cacheWrite("docs", { content });
    return { data: { content }, error: null };
  }
}

export function isAdmin(profile) {
  return profile?.role === "admin";
}

export function isStaff(profile) {
  return profile?.role === "admin" || profile?.role === "moderator";
}

// --- Orders / Tracking ---

export async function getSiteConfig() {
  try {
    const { data, error } = await supabase.from("site_config").select("*").single();
    if (error) throw error;
    cacheWrite("site_config", data);
    return { data, error: null };
  } catch (e) {
    return { data: cacheRead("site_config", { tracking_key: "xsyna-default-tracking-key-32", tracking_steps: ["Eingegangen", "In Bearbeitung", "Qualitätskontrolle", "Abgeschlossen"] }), error: null };
  }
}

export async function setSiteConfig({ tracking_key, tracking_steps }) {
  try {
    const { data, error } = await supabase.from("site_config").update({ tracking_key, tracking_steps, updated_at: new Date().toISOString() }).eq("id", 1).select().single();
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function getOrders() {
  try {
    const { data, error } = await supabase.from("orders").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function getOrder(id) {
  try {
    const { data, error } = await supabase.from("orders").select("*").eq("id", id).single();
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function createOrder(payload) {
  try {
    const { data, error } = await supabase.from("orders").insert(payload).select().single();
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    queue("insert", "orders", payload);
    return { data: payload, error: null };
  }
}

export async function updateOrder(id, updates) {
  try {
    const { data, error } = await supabase.from("orders").update({ ...updates, updated_at: new Date().toISOString() }).eq("id", id).select().single();
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function getOrderUpdates(orderId) {
  try {
    const { data, error } = await supabase.from("order_updates").select("*").eq("order_id", orderId).order("created_at", { ascending: true });
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function createOrderUpdate({ order_id, status, progress, message }) {
  const payload = { order_id, status, progress, message };
  try {
    const { data, error } = await supabase.from("order_updates").insert(payload).select().single();
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: payload, error: null };
  }
}

// Simple symmetric encryption helpers using crypto.subtle with AES-GCM.
// The key is derived from a secret string via SHA-256. This is NOT suitable
// for highly sensitive data, but enough for obfuscated public tracking links.

function strToBuf(str) {
  return new TextEncoder().encode(str);
}

function bufToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64ToBuf(base64) {
  const normalized = base64.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveKey(secret) {
  const keyMaterial = await crypto.subtle.importKey("raw", strToBuf(secret), "PBKDF2", false, ["deriveBits", "deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: strToBuf("xsyna-tracking-salt"), iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

export async function encryptTrackingData(plainText, secret) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(secret);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, strToBuf(plainText));
  const combined = new Uint8Array(iv.length + new Uint8Array(encrypted).length);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  return bufToBase64(combined);
}

export async function decryptTrackingData(cipherBase64, secret) {
  const combined = base64ToBuf(cipherBase64);
  const iv = combined.slice(0, 12);
  const encrypted = combined.slice(12);
  const key = await deriveKey(secret);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, encrypted);
  return new TextDecoder().decode(decrypted);
}

// --- Maintenance schedule ---

export async function getMaintenanceSchedule() {
  try {
    const { data, error } = await supabase.from("maintenance_schedule").select("*").order("starts_at", { ascending: true });
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function createMaintenanceSchedule(payload) {
  try {
    const { data, error } = await supabase.from("maintenance_schedule").insert(payload).select().single();
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function updateMaintenanceSchedule(id, updates) {
  try {
    const { data, error } = await supabase.from("maintenance_schedule").update({ ...updates, updated_at: new Date().toISOString() }).eq("id", id).select().single();
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function deleteMaintenanceSchedule(id) {
  try {
    const { error } = await supabase.from("maintenance_schedule").delete().eq("id", id);
    if (error) throw error;
    return { error: null };
  } catch (e) {
    return { error: e };
  }
}

// --- Announcements ---

export async function getAnnouncements() {
  try {
    const { data, error } = await supabase.from("announcements").select("*").eq("published", true).order("pinned", { ascending: false }).order("published_at", { ascending: false });
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function getAllAnnouncements() {
  try {
    const { data, error } = await supabase.from("announcements").select("*").order("published_at", { ascending: false });
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function createAnnouncement(payload) {
  try {
    const { data, error } = await supabase.from("announcements").insert(payload).select().single();
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function updateAnnouncement(id, updates) {
  try {
    const { data, error } = await supabase.from("announcements").update({ ...updates, updated_at: new Date().toISOString() }).eq("id", id).select().single();
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function deleteAnnouncement(id) {
  try {
    const { error } = await supabase.from("announcements").delete().eq("id", id);
    if (error) throw error;
    return { error: null };
  } catch (e) {
    return { error: e };
  }
}

// --- Jobs ---

export async function getJobs() {
  try {
    const { data, error } = await supabase.from("jobs").select("*").eq("active", true).order("published_at", { ascending: false });
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function getAllJobs() {
  try {
    const { data, error } = await supabase.from("jobs").select("*").order("published_at", { ascending: false });
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function createJob(payload) {
  try {
    const { data, error } = await supabase.from("jobs").insert(payload).select().single();
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function updateJob(id, updates) {
  try {
    const { data, error } = await supabase.from("jobs").update({ ...updates, updated_at: new Date().toISOString() }).eq("id", id).select().single();
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function deleteJob(id) {
  try {
    const { error } = await supabase.from("jobs").delete().eq("id", id);
    if (error) throw error;
    return { error: null };
  } catch (e) {
    return { error: e };
  }
}

// --- Audit log ---

export async function getAuditLog(limit = 100) {
  try {
    const { data, error } = await supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(limit);
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function logAction({ user_id, action, table_name, record_id, payload }) {
  try {
    const { error } = await supabase.from("audit_log").insert({ user_id, action, table_name, record_id, payload });
    if (error) throw error;
    return { error: null };
  } catch (e) {
    return { error: e };
  }
}

// --- User preferences ---

export async function getUserPreferences(userId) {
  try {
    const { data, error } = await supabase.from("user_preferences").select("*").eq("id", userId).single();
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function setUserPreferences(userId, updates) {
  try {
    const { data, error } = await supabase.from("user_preferences").upsert({ id: userId, ...updates, updated_at: new Date().toISOString() }, { onConflict: "id" }).select().single();
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

// --- Account ---

export async function updatePassword(newPassword) {
  try {
    const { data, error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function deleteAccount(userId) {
  try {
    const { error } = await supabase.auth.admin.deleteUser(userId);
    if (error) throw error;
    return { error: null };
  } catch (e) {
    return { error: e };
  }
}

// --- Feature flags ---

export async function getFeatureFlags() {
  try {
    const { data, error } = await supabase.from("feature_flags").select("*").order("key", { ascending: true });
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function updateFeatureFlag(id, updates) {
  try {
    const { data, error } = await supabase.from("feature_flags").update({ ...updates, updated_at: new Date().toISOString() }).eq("id", id).select().single();
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

// --- Notifications ---

export async function getNotifications(userId, limit = 100) {
  try {
    const { data, error } = await supabase.from("notifications").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(limit);
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function countUnreadNotifications(userId) {
  try {
    const { count, error } = await supabase.from("notifications").select("*", { count: "exact" }).eq("user_id", userId).eq("read", false);
    if (error) throw error;
    return { count: count || 0, error: null };
  } catch (e) {
    return { count: 0, error: e };
  }
}

export async function createNotification({ user_id, title, message, type = "info", payload = {} }) {
  try {
    const { data, error } = await supabase.from("notifications").insert({ user_id, title, message, type, payload }).select().single();
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function markNotificationRead(id) {
  try {
    const { data, error } = await supabase.from("notifications").update({ read: true }).eq("id", id).select().single();
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function markAllNotificationsRead(userId) {
  try {
    const { error } = await supabase.from("notifications").update({ read: true }).eq("user_id", userId).eq("read", false);
    if (error) throw error;
    return { error: null };
  } catch (e) {
    return { error: e };
  }
}

// --- WebApps / External Apps ---

export async function getWebApps() {
  try {
    const { data, error } = await supabase.from("web_apps").select("*").eq("public", true).eq("approved", true).order("name", { ascending: true });
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function getAllWebApps() {
  try {
    const { data, error } = await supabase.from("web_apps").select("*").order("name", { ascending: true });
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function createWebApp(payload) {
  try {
    const { data, error } = await supabase.from("web_apps").insert(payload).select().single();
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function updateWebApp(id, updates) {
  try {
    const { data, error } = await supabase.from("web_apps").update({ ...updates, updated_at: new Date().toISOString() }).eq("id", id).select().single();
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function getWebAppGrants(userId) {
  try {
    const { data, error } = await supabase.from("web_app_grants").select("*").eq("user_id", userId);
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function createWebAppGrant({ app_id, user_id, scopes = ["read:profile"] }) {
  try {
    const { data, error } = await supabase.from("web_app_grants").insert({ app_id, user_id, scopes }).select().single();
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function deleteWebAppGrant(id) {
  try {
    const { error } = await supabase.from("web_app_grants").delete().eq("id", id);
    if (error) throw error;
    return { error: null };
  } catch (e) {
    return { error: e };
  }
}

// --- API Keys ---

function generateApiKey() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array)).replace(/[^a-zA-Z0-9]/g, "").slice(0, 32);
}

export async function getApiKeys(userId) {
  try {
    const { data, error } = await supabase.from("user_api_keys").select("id, name, scopes, last_used_at, created_at").eq("user_id", userId).order("created_at", { ascending: false });
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function createApiKey({ user_id, name, scopes = ["read:profile"] }) {
  try {
    const rawKey = "xs_" + generateApiKey();
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(rawKey));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const key_hash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    const { data, error } = await supabase.from("user_api_keys").insert({ user_id, name, key_hash, scopes }).select().single();
    if (error) throw error;
    return { data: { ...data, raw_key: rawKey }, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function deleteApiKey(id) {
  try {
    const { error } = await supabase.from("user_api_keys").delete().eq("id", id);
    if (error) throw error;
    return { error: null };
  } catch (e) {
    return { error: e };
  }
}

// --- System health ---

export async function getSystemHealth(limit = 50) {
  try {
    const { data, error } = await supabase.from("system_health").select("*").order("created_at", { ascending: false }).limit(limit);
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function insertSystemHealth(payload) {
  try {
    const { data, error } = await supabase.from("system_health").insert(payload).select().single();
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

// --- Superuser / admin utilities ---

export async function updateLastSeen(userId) {
  try {
    const { error } = await supabase.from("profiles").update({ last_seen_at: new Date().toISOString() }).eq("id", userId);
    if (error) throw error;
    return { error: null };
  } catch (e) {
    return { error: e };
  }
}

// --- Teams / Organizations ---

export async function getTeams(userId) {
  try {
    const { data, error } = await supabase.from("team_members").select("teams(*)").eq("user_id", userId);
    if (error) throw error;
    return { data: (data || []).map(r => r.teams), error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function getTeam(teamId) {
  try {
    const { data, error } = await supabase.from("teams").select("*").eq("id", teamId).single();
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function createTeam(payload) {
  try {
    const { data, error } = await supabase.from("teams").insert(payload).select().single();
    if (error) throw error;
    if (data) {
      await supabase.from("team_members").insert({ team_id: data.id, user_id: payload.owner_id, role: "owner" });
    }
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function getTeamMembers(teamId) {
  try {
    const { data, error } = await supabase.from("team_members").select("*, profiles(id, email, full_name)").eq("team_id", teamId);
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function inviteTeamMember(teamId, email, role = "member") {
  try {
    const { data: userData } = await supabase.from("profiles").select("id").eq("email", email).single();
    const userId = userData?.id;
    const { data, error } = await supabase.from("team_members").insert({ team_id: teamId, user_id: userId, role, invited_email: email }).select().single();
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

// --- Billing & Subscriptions ---

export async function getBillingTiers() {
  try {
    const { data, error } = await supabase.from("billing_tiers").select("*").eq("active", true).order("monthly_price", { ascending: true });
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function getSubscription(teamId) {
  try {
    const { data, error } = await supabase.from("subscriptions").select("*").eq("team_id", teamId).single();
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function createSubscription(payload) {
  try {
    const { data, error } = await supabase.from("subscriptions").insert(payload).select().single();
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

// --- Inference Logs ---

export async function getInferenceLogs(userId, limit = 100) {
  try {
    const { data, error } = await supabase.from("inference_logs").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(limit);
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function createInferenceLog(payload) {
  try {
    const { data, error } = await supabase.from("inference_logs").insert(payload).select().single();
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

// --- Usage Stats ---

export async function getUsageStats(teamId, limit = 30) {
  try {
    const { data, error } = await supabase.from("usage_stats").select("*").eq("team_id", teamId).order("date", { ascending: false }).limit(limit);
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function upsertUsageStat(payload) {
  try {
    const { data, error } = await supabase.from("usage_stats").upsert(payload, { onConflict: "team_id,date" }).select().single();
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

// --- Quotas ---

export async function getQuota(teamId) {
  try {
    const { data, error } = await supabase.from("quotas").select("*").eq("team_id", teamId).single();
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function upsertQuota(payload) {
  try {
    const { data, error } = await supabase.from("quotas").upsert(payload, { onConflict: "id" }).select().single();
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

// --- Datasets ---

export async function getDatasets(teamId) {
  try {
    const { data, error } = await supabase.from("datasets").select("*").eq("team_id", teamId).order("created_at", { ascending: false });
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function createDataset(payload) {
  try {
    const { data, error } = await supabase.from("datasets").insert(payload).select().single();
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

// --- Tuning Jobs ---

export async function getTuningJobs(teamId) {
  try {
    const { data, error } = await supabase.from("tuning_jobs").select("*").eq("team_id", teamId).order("created_at", { ascending: false });
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function createTuningJob(payload) {
  try {
    const { data, error } = await supabase.from("tuning_jobs").insert(payload).select().single();
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function updateTuningJob(id, updates) {
  try {
    const { data, error } = await supabase.from("tuning_jobs").update({ ...updates, updated_at: new Date().toISOString() }).eq("id", id).select().single();
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

// --- Webhooks ---

export async function getWebhooks(teamId) {
  try {
    const { data, error } = await supabase.from("webhooks").select("*").eq("team_id", teamId).order("created_at", { ascending: false });
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function createWebhook(payload) {
  try {
    const { data, error } = await supabase.from("webhooks").insert(payload).select().single();
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function deleteWebhook(id) {
  try {
    const { error } = await supabase.from("webhooks").delete().eq("id", id);
    if (error) throw error;
    return { error: null };
  } catch (e) {
    return { error: e };
  }
}

// --- Community Model Hub ---

export async function getPublishedModels() {
  try {
    const { data, error } = await supabase.from("published_models").select("*").eq("public", true).eq("approved", true).order("created_at", { ascending: false });
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function getAllPublishedModels() {
  try {
    const { data, error } = await supabase.from("published_models").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function createPublishedModel(payload) {
  try {
    const { data, error } = await supabase.from("published_models").insert(payload).select().single();
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function approvePublishedModel(id, approved = true) {
  try {
    const { data, error } = await supabase.from("published_models").update({ approved }).eq("id", id).select().single();
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

// --- Invite Codes ---

export async function getInviteCodes() {
  try {
    const { data, error } = await supabase.from("invite_codes").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function createInviteCode(payload) {
  try {
    const { data, error } = await supabase.from("invite_codes").insert(payload).select().single();
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function validateInviteCode(code) {
  try {
    const { data, error } = await supabase.from("invite_codes").select("*").eq("code", code).single();
    if (error) throw error;
    const valid = data && (data.uses_left === null || data.uses_left > 0);
    return { data, valid: !!valid, error: null };
  } catch (e) {
    return { data: null, valid: false, error: e };
  }
}

export async function redeemInviteCode(code) {
  try {
    const { data } = await supabase.from("invite_codes").select("*").eq("code", code).single();
    if (data && data.uses_left !== null && data.uses_left > 0) {
      await supabase.from("invite_codes").update({ uses_left: data.uses_left - 1 }).eq("id", data.id);
    }
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

// --- CEO Features 2.0 ---

export async function getGameScores(limit = 50) {
  try {
    const { data, error } = await supabase.from("game_scores").select("*, profiles(email, full_name)").order("score", { ascending: false }).limit(limit);
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function createGameScore(payload) {
  try {
    const { data, error } = await supabase.from("game_scores").insert(payload).select().single();
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function getSavedPrompts(userId) {
  try {
    const { data, error } = await supabase.from("saved_prompts").select("*").or(`user_id.eq.${userId},is_public.eq.true`).order("created_at", { ascending: false });
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function createSavedPrompt(payload) {
  try {
    const { data, error } = await supabase.from("saved_prompts").insert(payload).select().single();
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function deleteSavedPrompt(id) {
  try {
    const { error } = await supabase.from("saved_prompts").delete().eq("id", id);
    if (error) throw error;
    return { error: null };
  } catch (e) {
    return { error: e };
  }
}

export async function getWaitlist() {
  try {
    const { data, error } = await supabase.from("waitlist").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function createWaitlistEntry(payload) {
  try {
    const { data, error } = await supabase.from("waitlist").insert(payload).select().single();
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function updateWaitlistStatus(id, status) {
  try {
    const { data, error } = await supabase.from("waitlist").update({ status, invited_at: status === 'invited' ? new Date().toISOString() : undefined }).eq("id", id).select().single();
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function getFeedback() {
  try {
    const { data, error } = await supabase.from("feedback").select("*, profiles(email)").order("created_at", { ascending: false });
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function createFeedback(payload) {
  try {
    const { data, error } = await supabase.from("feedback").insert(payload).select().single();
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function updateFeedbackStatus(id, status) {
  try {
    const { data, error } = await supabase.from("feedback").update({ status }).eq("id", id).select().single();
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function getApplications() {
  try {
    const { data, error } = await supabase.from("applications").select("*, jobs(title)").order("created_at", { ascending: false });
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function createApplication(payload) {
  try {
    const { data, error } = await supabase.from("applications").insert(payload).select().single();
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function updateApplicationStatus(id, status) {
  try {
    const { data, error } = await supabase.from("applications").update({ status }).eq("id", id).select().single();
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function getReferrals(userId) {
  try {
    const { data, error } = await supabase.from("referrals").select("*").eq("referrer_id", userId).order("created_at", { ascending: false });
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function createReferral(payload) {
  try {
    const { data, error } = await supabase.from("referrals").insert(payload).select().single();
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function subscribeNewsletter(email) {
  try {
    const { data, error } = await supabase.from("newsletter_subscribers").insert({ email }).select().single();
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function getNewsletterSubscribers() {
  try {
    const { data, error } = await supabase.from("newsletter_subscribers").select("*").order("subscribed_at", { ascending: false });
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function trackUserDevice(payload) {
  try {
    const { data, error } = await supabase.from("user_devices").insert(payload).select().single();
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function getUserDevices(userId) {
  try {
    const { data, error } = await supabase.from("user_devices").select("*").eq("user_id", userId).order("last_active", { ascending: false });
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function getRolePermissions() {
  try {
    const { data, error } = await supabase.from("role_permissions").select("*").order("role_name");
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function updateRolePermissions(id, permissions) {
  try {
    const { data, error } = await supabase.from("role_permissions").update({ permissions, updated_at: new Date().toISOString() }).eq("id", id).select().single();
    if (error) throw error;
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

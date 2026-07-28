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

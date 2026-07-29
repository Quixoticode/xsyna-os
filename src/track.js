import { initNeuralBackground } from "./js/neural-bg.js";
import "./js/sw-register.js";
import { decryptTrackingData, getOrder, getOrderUpdates, getSiteConfig } from "./js/supabase-db.js";

initNeuralBackground("neural-canvas");

const $ = (id) => document.getElementById(id);
const container = $("track-container");

function renderError(message) {
  container.innerHTML = `
    <div class="card" style="text-align: center; padding: 48px 24px;">
      <h2 style="font-size: 1.25rem; font-weight: 700; margin-bottom: 8px; color: #f87171;">Tracking nicht möglich</h2>
      <p style="color: var(--text-secondary);">${message}</p>
    </div>
  `;
}

function renderProgress(order, updates, config) {
  const steps = config?.tracking_steps || ["Eingegangen", "In Bearbeitung", "Qualitätskontrolle", "Abgeschlossen"];
  const currentStepIndex = steps.findIndex((s) => s.toLowerCase() === (order?.status || "").toLowerCase());
  const progress = order?.progress ?? 0;

  container.innerHTML = `
    <div class="card" style="padding: 40px;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; flex-wrap: wrap; gap: 12px;">
        <div>
          <h2 style="font-size: 1.4rem; font-weight: 700; margin-bottom: 4px;">${order.title || "Auftrag"}</h2>
          <p style="color: var(--text-secondary); font-size: 0.9rem;">${order.description || ""}</p>
        </div>
        <span style="font-size: 0.75rem; padding: 4px 12px; border-radius: 999px; background: var(--cyan-soft); color: var(--cyan); border: 1px solid rgba(34,211,238,0.2); font-weight: 600;">
          ${order.status || "Unbekannt"}
        </span>
      </div>

      <div style="margin-bottom: 24px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <span style="font-size: 0.85rem; color: var(--text-muted);">Gesamtfortschritt</span>
          <span style="font-size: 0.85rem; font-weight: 700; color: var(--cyan);">${progress}%</span>
        </div>
        <div style="width: 100%; height: 10px; background: rgba(255,255,255,0.08); border-radius: 999px; overflow: hidden;">
          <div style="width: ${progress}%; height: 100%; background: linear-gradient(135deg, var(--cyan), var(--amber)); border-radius: 999px; transition: width 0.6s ease;"></div>
        </div>
      </div>

      <div style="display: flex; justify-content: space-between; position: relative; margin-bottom: 40px; padding: 0 8px;">
        ${steps
          .map((step, idx) => {
            const active = idx <= currentStepIndex;
            return `
              <div style="flex: 1; text-align: center; position: relative; z-index: 2;">
                <div style="width: 24px; height: 24px; border-radius: 50%; margin: 0 auto 8px; display: flex; align-items: center; justify-content: center; font-size: 0.7rem; font-weight: 700; transition: all 0.3s; ${
                  active
                    ? "background: var(--cyan); color: #000;"
                    : "background: rgba(255,255,255,0.08); color: var(--text-muted); border: 1px solid var(--border);"
                }">
                  ${idx < currentStepIndex ? "✓" : idx + 1}
                </div>
                <div style="font-size: 0.7rem; color: ${active ? "var(--text)" : "var(--text-muted)"};">${step}</div>
              </div>
            `;
          })
          .join(
            `<div style="flex: 1; position: relative; top: 12px; height: 2px; background: rgba(255,255,255,0.08);"></div>`
          )}
      </div>

      <h3 style="font-size: 1rem; font-weight: 700; margin-bottom: 16px;">Status-Historie</h3>
      <div style="display: flex; flex-direction: column; gap: 12px;">
        ${(updates || []).length === 0 ? `<p style="color: var(--text-muted); font-size: 0.9rem;">Noch keine Updates vorhanden.</p>` : ""}
        ${(updates || []).map((u) => `
          <div class="card card-sm" style="border-left: 3px solid var(--cyan);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <strong style="font-size: 0.9rem;">${u.status}</strong>
              <span style="font-size: 0.75rem; color: var(--text-muted);">${new Date(u.created_at).toLocaleDateString("de-DE")}</span>
            </div>
            ${u.message ? `<p style="color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 4px;">${u.message}</p>` : ""}
            <div style="font-size: 0.75rem; color: var(--cyan);">Fortschritt: ${u.progress}%</div>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

async function init() {
  const params = new URLSearchParams(window.location.search);
  const dataParam = params.get("data");
  if (!dataParam) {
    renderError("Kein Tracking-Link vorhanden. Bitte verwende den Link aus deiner E-Mail.");
    return;
  }

  const { data: config, error: configError } = await getSiteConfig();
  if (configError) {
    renderError("Konfiguration konnte nicht geladen werden.");
    return;
  }

  let orderId;
  try {
    const decrypted = await decryptTrackingData(dataParam, config.tracking_key);
    const parsed = JSON.parse(decrypted);
    orderId = parsed.orderId;
  } catch (e) {
    renderError("Der Tracking-Link ist ungültig oder abgelaufen.");
    return;
  }

  if (!orderId) {
    renderError("Der Tracking-Link enthält keine Auftragsnummer.");
    return;
  }

  const [orderRes, updatesRes] = await Promise.all([getOrder(orderId), getOrderUpdates(orderId)]);

  if (orderRes.error || !orderRes.data) {
    renderError("Auftrag konnte nicht gefunden werden.");
    return;
  }

  renderProgress(orderRes.data, updatesRes.data || [], config);
}

init().catch((e) => {
  console.error(e);
  renderError("Ein unerwarteter Fehler ist aufgetreten.");
});

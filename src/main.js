import { initNeuralBackground } from "./js/neural-bg.js";
import "./js/sw-register.js";
import "./js/api-assets.js";
import { getAnnouncements, getJobs, getMaintenance } from "./js/supabase-db.js";

initNeuralBackground("neural-canvas");
checkMaintenanceMode();

function reveal() {
  const reveals = document.querySelectorAll(".reveal");
  reveals.forEach((el) => {
    const windowHeight = window.innerHeight;
    const elementTop = el.getBoundingClientRect().top;
    if (elementTop < windowHeight - 100) {
      el.classList.add("active");
    }
  });
}

window.addEventListener("scroll", reveal, { passive: true });
window.addEventListener("load", reveal);
reveal();

async function checkMaintenanceMode() {
  try {
    const m = await getMaintenance();
    if (!m || !m.enabled) return;
    const progress = Math.max(0, Math.min(100, Number(m.progress) || 0));
    document.body.innerHTML = `
      <div style="position:fixed;inset:0;z-index:9999;background:#000;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:24px;color:#fff;">
        <div style="width:56px;height:56px;border:2px solid rgba(163,230,53,0.2);border-top-color:#a3e635;border-radius:50%;animation:xs-spin 1s linear infinite;margin-bottom:24px;"></div>
        <h1 style="font-size:2rem;font-weight:700;margin-bottom:8px;">${escapeHtml(m.title || "Wartungsmodus")}</h1>
        <p style="color:#9ca3af;max-width:480px;margin-bottom:24px;">${escapeHtml(m.status_text || "Wir arbeiten an xSyna. Bitte hab einen Moment Geduld.")}</p>
        <div style="width:100%;max-width:480px;height:8px;background:rgba(255,255,255,0.1);border-radius:999px;overflow:hidden;margin-bottom:16px;">
          <div style="height:100%;background:linear-gradient(90deg,#a3e635,#22d3ee);width:${progress}%;transition:width 0.4s;"></div>
        </div>
        <div style="font-family:ui-monospace,Menlo,monospace;font-size:0.85rem;color:#a3e635;">${progress}% — System wird aktualisiert</div>
      </div>
      <style>@keyframes xs-spin{to{transform:rotate(360deg)}}</style>
    `;
  } catch (e) {
    // DB unreachable/offline -> show the site normally (Notdesign)
    console.warn("[xSyna] maintenance check skipped:", e);
  }
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function renderNewsAndJobs() {
  try {
    const [{ data: announcements }, { data: jobs }] = await Promise.all([
      getAnnouncements().catch(() => ({ data: null })),
      getJobs().catch(() => ({ data: null }))
    ]);

  const newsContainer = document.querySelector("#news .news-grid");
  if (newsContainer && announcements?.length) {
    newsContainer.innerHTML = announcements.map(a => `
      <article class="card card-sm reveal active">
        <span class="tag ${a.pinned ? 'tag-amber' : 'tag-cyan'}">${a.pinned ? 'Wichtig' : 'Update'}</span>
        <h3 class="card-title">${a.title}</h3>
        <p class="card-text">${a.body || ''}</p>
        ${a.link ? `<a href="${a.link}" style="color: var(--cyan); font-size: 0.85rem; margin-top: 12px; display: inline-block;">Mehr erfahren →</a>` : ''}
      </article>
    `).join("");
  }

  const jobsContainer = document.querySelector("#jobs .container");
  if (jobsContainer && jobs?.length) {
    const list = jobsContainer.querySelector(".section-header-center p");
    if (list) {
      const jobsHtml = jobs.map(j => `
        <div style="text-align: left; margin-top: 16px; padding: 16px; border: 1px solid var(--border); border-radius: var(--radius);">
          <div style="font-weight: 700; color: var(--text);">${j.title}</div>
          <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 8px;">${j.department || ''} ${j.location ? '· ' + j.location : ''}</div>
          <p style="font-size: 0.9rem; color: var(--text-secondary); margin-bottom: 8px;">${j.description || ''}</p>
          ${j.requirements?.length ? `<div style="display: flex; flex-wrap: gap; gap: 8px;">${j.requirements.map(r => `<span style="font-size: 0.75rem; padding: 4px 10px; border-radius: 999px; background: var(--cyan-soft); color: var(--cyan);">${r}</span>`).join('')}</div>` : ''}
        </div>
      `).join("");
      const wrapper = document.createElement("div");
      wrapper.innerHTML = jobsHtml;
      jobsContainer.querySelector(".section-header-center").appendChild(wrapper);
    }
  }
  } catch(e) {
    console.error("[xSyna] renderNewsAndJobs failed:", e);
  }
}

renderNewsAndJobs();

import { initNeuralBackground } from "./js/neural-bg.js";
import "./js/sw-register.js";
import { getAnnouncements, getJobs } from "./js/supabase-db.js";

initNeuralBackground("neural-canvas");

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

import { supabase } from "./js/supabase.js";
import "./js/sw-register.js";

const $ = (id) => document.getElementById(id);

function showMessage(text, type = "info") {
  const el = $("auth-message");
  el.textContent = text;
  el.style.display = "block";
  el.style.color = type === "error" ? "#f87171" : type === "success" ? "#22d3ee" : "#94a3b8";
}

function setTab(tab) {
  document.querySelectorAll(".auth-tab").forEach((btn) => {
    const isActive = btn.dataset.tab === tab;
    btn.style.color = isActive ? "var(--text)" : "var(--text-secondary)";
    btn.style.background = isActive ? "rgba(255,255,255,0.08)" : "transparent";
  });
  $("login-form").style.display = tab === "login" ? "block" : "none";
  $("register-form").style.display = tab === "register" ? "block" : "none";
}

document.querySelectorAll(".auth-tab").forEach((btn) => {
  btn.addEventListener("click", () => setTab(btn.dataset.tab));
});

$("login-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("email").value.trim();
  if (!email) return;
  $("login-button").disabled = true;
  $("login-button").textContent = "Wird gesendet...";
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin + "/auth" },
  });
  $("login-button").disabled = false;
  $("login-button").textContent = "Magic-Link senden";
  if (error) showMessage("Fehler: " + error.message, "error");
  else showMessage("Login-Link gesendet. Bitte E-Mail prüfen.", "success");
});

$("register-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("register-email").value.trim();
  const password = $("register-password").value;
  if (!email || !password) return;
  $("register-button").disabled = true;
  $("register-button").textContent = "Wird erstellt...";
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: window.location.origin + "/auth" },
  });
  $("register-button").disabled = false;
  $("register-button").textContent = "Konto erstellen";
  if (error) showMessage("Fehler: " + error.message, "error");
  else if (data.session) {
    showMessage("Erfolgreich angemeldet. Weiterleitung...", "success");
    redirectAfterAuth();
  } else {
    showMessage("Konto erstellt. Bitte E-Mail bestätigen.", "success");
  }
});

async function redirectAfterAuth() {
  const params = new URLSearchParams(window.location.search);
  const returnTo = params.get("returnTo") || "/internal-services";
  window.location.href = returnTo;
}

async function checkSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    redirectAfterAuth();
  }
}

checkSession();

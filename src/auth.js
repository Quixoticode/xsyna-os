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
    btn.classList.toggle("active", isActive);
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
  const password = $("password")?.value;
  if (!email) return;

  $("login-button").disabled = true;
  $("login-button").textContent = "Wird gesendet...";

  if (password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    $("login-button").disabled = false;
    $("login-button").textContent = "Anmelden / Magic-Link senden";
    if (error) showMessage("Fehler: " + error.message, "error");
    else if (data.session) {
      showMessage("Erfolgreich angemeldet. Weiterleitung...", "success");
      redirectAfterAuth();
    }
  } else {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin + "/auth" },
    });
    $("login-button").disabled = false;
    $("login-button").textContent = "Anmelden / Magic-Link senden";
    if (error) showMessage("Fehler: " + error.message, "error");
    else showMessage("Login-Link gesendet. Bitte E-Mail prüfen.", "success");
  }
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

// Passkey support (best-effort via WebAuthn / Supabase experimental API)
async function registerPasskey() {
  try {
    if (typeof supabase.auth.startPasskeyRegistration === "function") {
      const { error } = await supabase.auth.startPasskeyRegistration();
      if (error) throw error;
      showMessage("Passkey-Registrierung gestartet. Folge den Browser-Anweisungen.", "success");
    } else {
      showMessage("Passkey wird von deinem Browser oder Supabase-Setup noch nicht unterstützt.", "error");
    }
  } catch (e) {
    showMessage("Passkey-Fehler: " + (e.message || e), "error");
  }
}

async function loginWithPasskey() {
  try {
    if (typeof supabase.auth.startPasskeyLogin === "function") {
      const { data, error } = await supabase.auth.startPasskeyLogin();
      if (error) throw error;
      if (data?.session) {
        showMessage("Erfolgreich mit Passkey angemeldet.", "success");
        redirectAfterAuth();
      }
    } else {
      showMessage("Passkey wird von deinem Browser oder Supabase-Setup noch nicht unterstützt.", "error");
    }
  } catch (e) {
    showMessage("Passkey-Fehler: " + (e.message || e), "error");
  }
}

$("passkey-btn")?.addEventListener("click", loginWithPasskey);
$("github-sso-btn")?.addEventListener("click", signInWithGitHub);

// Optional: Third-party OAuth (GitHub) - prepared but requires Supabase provider setup
async function signInWithGitHub() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "github",
    options: { redirectTo: window.location.origin + "/auth" },
  });
  if (error) showMessage("SSO-Fehler: " + error.message, "error");
}

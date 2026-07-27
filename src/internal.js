import "./index.css";
import { supabase } from "./js/supabase.js";
import { initNeuralBackground } from "./js/neural-bg.js";
import "./js/sw-register.js";

initNeuralBackground("neural-canvas");

const loginForm = document.getElementById("login-form");
const loginButton = document.getElementById("login-button");
const authMessage = document.getElementById("auth-message");
const authCard = document.getElementById("auth-card");
const dashboardCard = document.getElementById("dashboard-card");
const logoutButton = document.getElementById("logout-button");

function showMessage(text, type = "info") {
  authMessage.textContent = text;
  authMessage.classList.remove("hidden", "text-cyan-400", "text-red-400", "text-amber-400");
  if (type === "error") authMessage.classList.add("text-red-400");
  else if (type === "success") authMessage.classList.add("text-cyan-400");
  else authMessage.classList.add("text-amber-400");
}

async function checkSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    showDashboard();
  }
}

function showDashboard() {
  authCard.classList.add("hidden");
  dashboardCard.classList.remove("hidden");
}

function showAuth() {
  authCard.classList.remove("hidden");
  dashboardCard.classList.add("hidden");
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = document.getElementById("email").value.trim();
  if (!email) return;

  loginButton.disabled = true;
  loginButton.textContent = "Wird gesendet...";

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: window.location.origin + "/internal-services",
    },
  });

  loginButton.disabled = false;
  loginButton.textContent = "Magic-Link senden";

  if (error) {
    showMessage("Fehler: " + error.message, "error");
  } else {
    showMessage("Login-Link wurde gesendet. Bitte E-Mail prüfen.", "success");
  }
});

logoutButton.addEventListener("click", async () => {
  const { error } = await supabase.auth.signOut();
  if (error) {
    showMessage("Fehler beim Abmelden: " + error.message, "error");
  } else {
    showAuth();
  }
});

checkSession();

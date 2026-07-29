import { initNeuralBackground } from "./js/neural-bg.js";
import "./js/sw-register.js";

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

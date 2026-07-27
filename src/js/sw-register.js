export function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("/sw.js")
        .then((registration) => {
          console.log("[xSyna SW] registered:", registration.scope);
        })
        .catch((error) => {
          console.error("[xSyna SW] registration failed:", error);
        });
    });
  }
}

registerServiceWorker();

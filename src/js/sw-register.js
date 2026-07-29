export function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      // Unregister any stale service workers first to avoid stale JS bundles.
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => {
          registration.update();
        });
      });

      navigator.serviceWorker
        .register("/sw.js")
        .then((registration) => {
          console.log("[xSyna SW] registered:", registration.scope);

          // Detect when a new service worker is waiting and activate it immediately.
          registration.addEventListener("updatefound", () => {
            const newWorker = registration.installing;
            if (!newWorker) return;
            newWorker.addEventListener("statechange", () => {
              if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                newWorker.postMessage({ type: "SKIP_WAITING" });
              }
            });
          });
        })
        .catch((error) => {
          console.error("[xSyna SW] registration failed:", error);
        });
    });
  }
}

registerServiceWorker();

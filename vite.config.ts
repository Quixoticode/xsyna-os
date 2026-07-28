import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  server: {
    hmr: false,
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        docs: resolve(__dirname, "docs/index.html"),
        auth: resolve(__dirname, "auth/index.html"),
        internal: resolve(__dirname, "internal-services/index.html"),
        track: resolve(__dirname, "track/index.html"),
      },
    },
  },
});

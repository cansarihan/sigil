import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  build: {
    target: "es2022",
    sourcemap: true,
    rollupOptions: {
      output: {
        // The Stellar SDK is most of the bundle and changes far less often
        // than this app, so it gets its own chunk and stays cached across
        // deploys instead of being re-downloaded with every UI tweak.
        manualChunks: (id) => (id.includes("@stellar/stellar-sdk") ? "stellar-sdk" : undefined),
      },
    },
    // The SDK chunk is legitimately over the default 500 kB advisory.
    chunkSizeWarningLimit: 1_800,
  },
});

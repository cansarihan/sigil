import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves the app from /<repo>/, so the base path is injected
  // at build time rather than hard-coded to one hosting choice.
  base: process.env.VITE_BASE ?? "/",
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

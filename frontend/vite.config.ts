import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  base: "/admapsdashboard/",
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    proxy: {
      // Proxy for main sandbox API
      "/api-proxy": {
        target: "https://sandbox.vmmaps.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-proxy/, "/admaps/api/v1"),
      },
      // Proxy for ITC events / live-traffic API
      "/itc-proxy": {
        target: "https://staging.vmmaps.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/itc-proxy/, "/itc/events"),
      },
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
}));

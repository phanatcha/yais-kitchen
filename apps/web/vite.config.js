import basicSsl from "@vitejs/plugin-basic-ssl";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// `npm run dev:lan` (mode "lan") serves the app to other laptops on the
// network for the live class demo (docs/live-demo.md). Browsers only allow
// the camera on https or localhost, so it uses a self-signed certificate.
// Everything else goes through the same address, so nothing is blocked as
// mixed content: /api to the gateway, and /rtc (LiveKit's signalling
// WebSocket) to the local LiveKit server.
const lan = {
  plugins: [basicSsl({ name: "yais-kitchen-demo" })],
  define: {
    "import.meta.env.VITE_API_URL": JSON.stringify("/api"),
    "import.meta.env.VITE_LIVEKIT_THROUGH_SITE": JSON.stringify("true"),
  },
  server: {
    host: true,
    proxy: {
      "/api": { target: "http://127.0.0.1:8080" },
      "/rtc": { target: "ws://127.0.0.1:7880", ws: true },
    },
  },
};

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === "lan" ? lan.plugins : [])],
  ...(mode === "lan" && { define: lan.define, server: lan.server }),
}));

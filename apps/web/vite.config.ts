import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const HOTE_LOCAL = "127.0.0.1";

export default defineConfig({
  plugins: [react()],
  server: { host: HOTE_LOCAL, port: 5173, strictPort: true },
});

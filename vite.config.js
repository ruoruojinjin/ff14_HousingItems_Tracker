import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // GitHub Pages 部署路徑：https://<user>.github.io/Ff14_HousingItems_Tracker/
  base: "/Ff14_HousingItems_Tracker/",
});

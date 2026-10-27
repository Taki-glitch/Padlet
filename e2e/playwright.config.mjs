// Test de fumée sur le site publié (lecture seule : aucune connexion, aucune donnée). À lancer à la main (.github/workflows/e2e-smoke.yml).
import { defineConfig } from "@playwright/test";
export default defineConfig({ testDir: ".", testMatch: "*.spec.mjs", timeout: 60000, retries: 1, use: { baseURL: process.env.PADLET_URL || "https://taki-glitch.github.io/Padlet/" } });

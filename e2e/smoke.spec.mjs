// ÉCRIT MAIS JAMAIS EXÉCUTÉ dans l'environnement de rédaction (pas de navigateur). Vérifie seulement la page de connexion du site publié :
// elle charge, affiche le formulaire, n'exécute pas d'erreur JavaScript et expose le manifeste. Aucune connexion, aucune donnée.
import { test, expect } from "@playwright/test";

test("la page se charge et affiche la connexion sans erreur JavaScript", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("./");
  await expect(page).toHaveTitle(/Padlet/);
  await expect(page.locator("#auth-username")).toBeVisible();
  await expect(page.locator("#auth-password")).toBeVisible();
  expect(errors, `erreurs JavaScript : ${errors.join(" | ")}`).toEqual([]);
});

test("le manifeste et les icônes sont servis sous /Padlet/", async ({ request }) => {
  const manifest = await request.get("manifest.webmanifest");
  expect(manifest.ok()).toBeTruthy();
  const json = await manifest.json();
  expect(json.start_url).toBe("./");
  for (const icon of json.icons) expect((await request.get(icon.src)).ok(), icon.src).toBeTruthy();
});

test("affichage mobile : le formulaire de connexion reste utilisable", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 700 });
  await page.goto("./");
  await expect(page.locator("#auth-username")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow, "défilement horizontal inattendu").toBeFalsy();
});

// Lancement Chromium partagé + utilitaires communs aux sources qui ont besoin
// d'un vrai navigateur (Indeed, Météojob, APEC sont client-rendered ou protégés).
import { chromium } from "playwright";
import { existsSync } from "node:fs";

export const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";

export async function launchBrowser() {
  const options = {};
  // Certains environnements exposent un Chromium pré-installé à un chemin fixe,
  // avec une révision différente de celle attendue par le paquet playwright.
  const preinstalled = "/opt/pw-browsers/chromium";
  if (existsSync(preinstalled)) options.executablePath = preinstalled;
  return chromium.launch(options);
}

export async function newPage(browser) {
  return browser.newPage({ userAgent: UA, locale: "fr-FR" });
}

// Les bandeaux cookies bloquent le rendu des résultats sur Météojob et l'APEC.
export async function dismissCookies(page) {
  const patterns = [/tout accepter/i, /ok pour moi/i, /j'accepte/i, /^accepter$/i, /accepter (et )?continuer/i];
  for (const pattern of patterns) {
    try {
      const btn = page.getByRole("button", { name: pattern }).first();
      if (await btn.isVisible({ timeout: 1200 })) {
        await btn.click();
        await page.waitForTimeout(600);
        return true;
      }
    } catch {}
  }
  return false;
}

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
// Sur les pages de détail de l'APEC, tant que Didomi n'est pas accepté la page
// reste à son écran de consentement et paraît annoncer une offre expirée.
const COOKIE_BUTTONS = ["#didomi-notice-agree-button", "#onetrust-accept-btn-handler", "button[id*='accept-all' i]"];
const COOKIE_LABELS = [/tout accepter/i, /ok pour moi/i, /j'accepte/i, /^accepter$/i, /accepter (et )?continuer/i];

// `isVisible()` teste l'instant présent et n'attend pas : passer un `timeout`
// ne change rien. Le bandeau apparaissant après le chargement, il faut donc
// sonder en boucle jusqu'à une échéance.
export async function dismissCookies(page, timeout = 7000) {
  const deadline = Date.now() + timeout;
  const candidates = [
    ...COOKIE_BUTTONS.map((s) => () => page.locator(s).first()),
    ...COOKIE_LABELS.map((p) => () => page.getByRole("button", { name: p }).first()),
  ];

  while (Date.now() < deadline) {
    for (const build of candidates) {
      try {
        const btn = build();
        if (await btn.isVisible()) {
          await btn.click();
          await page.waitForTimeout(800);
          return true;
        }
      } catch {}
    }
    await page.waitForTimeout(350);
  }
  return false;
}

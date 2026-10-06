// Lancement Chromium partagé + utilitaires communs aux sources qui ont besoin
// d'un vrai navigateur (Indeed, Météojob, APEC sont client-rendered ou protégés).
// Playwright is imported lazily: HTTP-only sources (LinkedIn, Hellowork) must
// keep working on a machine where it or its Chromium isn't installed yet.
import { existsSync } from "node:fs";

export const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";

export async function launchBrowser() {
  const { chromium } = await import("playwright");
  const options = {};
  // Certains environnements exposent un Chromium pré-installé à un chemin fixe,
  // avec une révision différente de celle attendue par le paquet playwright.
  const preinstalled = "/opt/pw-browsers/chromium";
  if (existsSync(preinstalled)) options.executablePath = preinstalled;
  return chromium.launch(options);
}

// Images, fonts and media are never read by an extractor: skipping them
// roughly halves the load time of a results page.
const SKIPPED_RESOURCES = new Set(["image", "font", "media"]);

/**
 * One context per source lane: a lane reuses its page from one search to the
 * next, so the cookie banner is dismissed once per lane, not once per search.
 */
export async function newContext(browser) {
  const context = await browser.newContext({ userAgent: UA, locale: "fr-FR" });
  await context.route("**/*", (route) =>
    SKIPPED_RESOURCES.has(route.request().resourceType()) ? route.abort() : route.continue()
  );
  return context;
}

export async function newPage(browser) {
  const context = await newContext(browser);
  const page = await context.newPage();
  // Closing a standalone page also releases its private context.
  page.on("close", () => context.close().catch(() => {}));
  return page;
}

/**
 * Waits until the results are rendered instead of sleeping a fixed time.
 * Dismisses the cookie banner on the page's first visit, then
 * waits again: on Météojob and the APEC the banner holds the results back.
 * Resolves false when nothing showed up (empty page, layout change).
 */
export async function waitForResults(page, selector, timeout = 8000) {
  const found = () =>
    page.waitForSelector(selector, { timeout, state: "attached" }).then(() => true, () => false);
  if (!page.__veilleCookies) {
    page.__veilleCookies = true;
    await Promise.race([found(), page.waitForTimeout(2500)]);
    await dismissCookies(page, 3000);
  }
  const ok = await found();
  // Cards are inserted in one go by the frameworks used, but a short settle
  // catches the last ones of a list rendered in chunks.
  if (ok) await page.waitForTimeout(300);
  return ok;
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

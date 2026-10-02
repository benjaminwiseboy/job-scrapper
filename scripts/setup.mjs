// Environment check for the plugin, and the SessionStart hook.
//
//   node scripts/setup.mjs                    status as JSON (node, deps, Chromium, profiles)
//   node scripts/setup.mjs --install-deps     npm install in the plugin root, when node_modules is missing
//   node scripts/setup.mjs --install-browser  downloads Playwright's Chromium (~150 MB, once per machine)
//   node scripts/setup.mjs --hook             SessionStart: prints a nudge only when something needs attention
//
// Writes nothing to the database. The hook must never fail or block a session:
// every error is swallowed and it always exits 0.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIG_PATH, loadConfig } from "./lib/config.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const arg = process.argv[2];

export function dashboardHash() {
  return createHash("sha256").update(readFileSync(join(ROOT, "dashboard", "index.html"))).digest("hex").slice(0, 12);
}

if (arg === "--hook") {
  try {
    hook();
  } catch {}
  process.exit(0);
}

if (arg === "--install-deps") {
  const lock = existsSync(join(ROOT, "package-lock.json"));
  const r = spawnSync("npm", [lock ? "ci" : "install", "--omit=dev"], { cwd: ROOT, stdio: "inherit", shell: true });
  process.exit(r.status ?? 1);
}

if (arg === "--install-browser") {
  const cli = join(ROOT, "node_modules", "playwright", "cli.js");
  if (!existsSync(cli)) {
    console.error("Le paquet playwright est absent : lance d'abord --install-deps.");
    process.exit(1);
  }
  const r = spawnSync(process.execPath, [cli, "install", "chromium"], { cwd: ROOT, stdio: "inherit" });
  process.exit(r.status ?? 1);
}

console.log(JSON.stringify(await status(), null, 2));

async function status() {
  const config = loadConfig();
  const hash = dashboardHash();
  let deps = false;
  let chromium = false;
  try {
    const { chromium: c } = await import("playwright");
    deps = true;
    chromium = existsSync(c.executablePath()) || existsSync("/opt/pw-browsers/chromium");
  } catch {}
  return {
    pluginRoot: ROOT,
    node: { version: process.versions.node, ok: Number(process.versions.node.split(".")[0]) >= 18 },
    deps,
    chromium,
    configPath: CONFIG_PATH,
    active: config.active,
    dashboardHash: hash,
    profiles: Object.entries(config.profiles).map(([id, p]) => ({
      id,
      label: p.label,
      artifactUrl: p.artifactUrl,
      workspace: p.workspace,
      dashboardUpToDate: p.dashboardHash === hash,
    })),
  };
}

function hook() {
  const config = loadConfig();
  const ids = Object.keys(config.profiles);
  const lines = [];
  if (!ids.length) {
    lines.push(
      "[Veille Emploi] Le plugin est installé mais aucun profil n'est configuré. " +
        "Si l'utilisateur parle de recherche d'emploi, de stage, d'alternance, de CV, ou demande par où commencer, " +
        "propose-lui /veille:demarrer (onboarding guidé, une quinzaine de minutes)."
    );
  } else {
    const hash = dashboardHash();
    const stale = ids.filter((id) => config.profiles[id].dashboardHash && config.profiles[id].dashboardHash !== hash);
    if (stale.length) {
      lines.push(
        `[Veille Emploi] Une nouvelle version du dashboard est disponible pour : ${stale.join(", ")}. ` +
          "À l'occasion, propose /veille:profils pour le republier (les données ne bougent pas)."
      );
    }
  }
  if (!existsSync(join(ROOT, "node_modules", "playwright"))) {
    lines.push(
      "[Veille Emploi] Les dépendances du plugin ne sont pas installées : avant un scraping ou un CV, " +
        `lance \`node "${join(ROOT, "scripts", "setup.mjs")}" --install-deps\`.`
    );
  }
  if (lines.length) console.log(lines.join("\n"));
}

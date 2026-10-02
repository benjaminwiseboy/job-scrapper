// Installs the plugin from an unzipped copy: copies it to a stable folder
// (~/.veille-emploi/plugin, so the Downloads folder can be emptied), registers
// that folder as the `veille-emploi` marketplace and installs `veille` from it.
// Running it again with a newer zip updates the plugin; profiles are untouched.
//
//   node scripts/install.mjs [--dry-run]
//
// Launched by Installer.cmd (Windows) and Installer.command (macOS, Linux).
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIG_DIR } from "./lib/config.mjs";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEST = join(CONFIG_DIR, "plugin");
const dryRun = process.argv.includes("--dry-run");

const say = (s = "") => console.log(s);

say("Installation de Veille Emploi");
say("=============================");

if (Number(process.versions.node.split(".")[0]) < 18) {
  say(`Node.js ${process.versions.node} est trop ancien : installe la version LTS depuis https://nodejs.org, puis relance.`);
  process.exit(1);
}

// 1. Copy to a stable place. Only ever replace a folder that is this plugin.
if (resolve(DEST) !== SRC) {
  const manifest = join(DEST, ".claude-plugin", "plugin.json");
  if (existsSync(DEST)) {
    const ours = existsSync(manifest) && JSON.parse(readFileSync(manifest, "utf8")).name === "veille";
    if (!ours) {
      say(`Le dossier ${DEST} existe et ne contient pas ce plugin : je n'y touche pas.`);
      process.exit(1);
    }
  }
  say(`Copie du plugin dans ${DEST}`);
  if (!dryRun) {
    rmSync(DEST, { recursive: true, force: true });
    cpSync(SRC, DEST, { recursive: true });
  }
}

// 2. Register and install through the Claude Code CLI.
const hasCli = spawnSync("claude --version", { shell: true, encoding: "utf8" }).status === 0;
if (!hasCli) {
  say();
  say("La commande « claude » est introuvable dans le terminal.");
  say("Ouvre Claude Code et tape ces deux commandes, l'une après l'autre :");
  say();
  say(`  /plugin marketplace add ${DEST}`);
  say("  /plugin install veille@veille-emploi");
  say();
  say("Puis lance /veille:demarrer.");
  process.exit(0);
}

// Removing first makes a rerun act as an update, and repoints a catalogue that
// was added from elsewhere (GitHub, a clone). Profiles live in config.json and
// are not affected.
run("plugin marketplace remove veille-emploi", true);
if (!run(`plugin marketplace add "${DEST}"`) || !run("plugin install veille@veille-emploi")) {
  say();
  say("L'installation n'a pas abouti. Tu peux la finir dans Claude Code :");
  say(`  /plugin marketplace add ${DEST}`);
  say("  /plugin install veille@veille-emploi");
  process.exit(1);
}

say();
say("C'est installé.");
say("Ouvre Claude Code (ou redémarre-le s'il était ouvert) et tape : /veille:demarrer");

function run(args, quiet = false) {
  if (dryRun) {
    say(`[simulation] claude ${args}`);
    return true;
  }
  const r = spawnSync(`claude ${args}`, { shell: true, encoding: "utf8" });
  if (!quiet) process.stdout.write(r.stdout || "");
  if (!quiet && r.status !== 0) process.stdout.write(r.stderr || "");
  return r.status === 0;
}

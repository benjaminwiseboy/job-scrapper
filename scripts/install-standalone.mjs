// Installs Veille Emploi without the Claude Code plugin system: copies the app
// to ~/.veille-emploi/app, then writes each command as a personal skill in
// ~/.claude/skills/veille-<name>/, with the app path filled in. Personal skills
// load in every project, so /veille-demarrer works from any folder.
// Running it again with a newer zip updates everything; profiles are untouched.
//
//   node scripts/install.mjs [--dry-run]      (shipped under that name in the standalone zip)
//
// Launched by Installer.cmd (Windows) and Installer.command (macOS, Linux).
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIG_DIR } from "./lib/config.mjs";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEST = join(CONFIG_DIR, "app");
const SKILLS_DIR = join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"), "skills");
const MARKER = ".veille-standalone";
const dryRun = process.argv.includes("--dry-run");

const say = (s = "") => console.log(s);

say("Installation de Veille Emploi");
say("=============================");

if (Number(process.versions.node.split(".")[0]) < 18) {
  say(`Node.js ${process.versions.node} est trop ancien : installe la version LTS depuis https://nodejs.org, puis relance.`);
  process.exit(1);
}

// 1. Copy to a stable place. Only ever replace a folder this installer made.
if (resolve(DEST) !== SRC) {
  if (existsSync(DEST) && !existsSync(join(DEST, MARKER))) {
    say(`Le dossier ${DEST} existe et n'a pas été créé par cet installeur : je n'y touche pas.`);
    process.exit(1);
  }
  say(`Copie de l'application dans ${DEST}`);
  if (!dryRun) {
    rmSync(DEST, { recursive: true, force: true });
    cpSync(SRC, DEST, { recursive: true });
    writeFileSync(join(DEST, MARKER), "");
  }
}

// 2. Fill in the app path, wherever the skills and docs refer to it.
const root = DEST.split("\\").join("/");
const fill = (text) =>
  text.replaceAll("${CLAUDE_PLUGIN_ROOT}", root).replaceAll("<racine du plugin>", root);
const base = dryRun ? SRC : DEST;
for (const dir of ["docs", ...readdirSync(join(base, "skills")).map((n) => join("skills", n))]) {
  for (const file of readdirSync(join(base, dir)).filter((f) => f.endsWith(".md"))) {
    const path = join(base, dir, file);
    if (!dryRun) writeFileSync(path, fill(readFileSync(path, "utf8")));
  }
}

// 3. Register each command as a personal skill. Leave alone a same-named skill
// that is not ours.
let installed = 0;
for (const name of readdirSync(join(base, "skills"))) {
  const target = join(SKILLS_DIR, `veille-${name}`, "SKILL.md");
  if (existsSync(target) && !readFileSync(target, "utf8").includes("veille-config.mjs")) {
    say(`Une autre skill « veille-${name} » existe déjà dans ${SKILLS_DIR} : je la laisse.`);
    continue;
  }
  const text = fill(readFileSync(join(base, "skills", name, "SKILL.md"), "utf8"));
  if (dryRun) say(`[simulation] ${target}`);
  else {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text);
  }
  installed++;
}

say();
say(`C'est installé (${installed} commandes).`);
say("Ouvre Claude Code (ou redémarre-le s'il était ouvert) et tape : /veille-demarrer");
say(`Pour désinstaller : supprime ${DEST} et les dossiers veille-* de ${SKILLS_DIR}.`);

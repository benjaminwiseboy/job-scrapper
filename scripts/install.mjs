// Installs Veille Emploi as personal Claude Code skills: copies the app
// to ~/.veille-emploi/app, then writes each command as a personal skill in
// ~/.claude/skills/veille-<name>/, with the app path filled in. Personal skills
// load in every project, so /veille-demarrer works from any folder.
// Running it again with another release updates (or rolls back) everything;
// profiles are untouched.
//
//   node scripts/install.mjs [--dry-run]
//
// Launched by Installer.cmd (Windows) and Installer.command (macOS, Linux),
// from the release they downloaded. From an unzipped release or a clone, it
// installs that copy as is, without downloading anything.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIG_DIR, getSecret, setSecret } from "./lib/config.mjs";
import { ask, askHidden } from "./lib/prompt.mjs";
import { appVersion, compareVersions } from "./lib/version.mjs";

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

const version = appVersion(SRC);
const previous = resolve(DEST) !== SRC && existsSync(join(DEST, MARKER)) ? appVersion(DEST) : null;
if (!previous || !version) say(`Version ${version ?? "inconnue"}`);
else {
  const order = compareVersions(version, previous);
  if (order > 0) say(`Mise à jour : ${previous} → ${version}`);
  else if (order < 0) say(`Retour à une version antérieure : ${previous} → ${version}`);
  else say(`Réinstallation de la version ${version}`);
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
  text.replaceAll("${VEILLE_ROOT}", root).replaceAll("<racine de l'application>", root);
const base = dryRun ? SRC : DEST;
for (const dir of ["docs", ...readdirSync(join(base, "skills")).map((n) => join("skills", n))]) {
  for (const file of readdirSync(join(base, dir)).filter((f) => f.endsWith(".md"))) {
    const path = join(base, dir, file);
    if (!dryRun) writeFileSync(path, fill(readFileSync(path, "utf8")));
  }
}

// 3. Register each command as a personal skill. Leave alone a same-named skill
// that is not ours: ours carry the marker, or (installed before it existed)
// mention the app's path or its config script.
const ours = (target) => {
  if (existsSync(join(dirname(target), MARKER))) return true;
  const text = readFileSync(target, "utf8");
  return text.includes(root) || text.includes("veille-config.mjs");
};
let installed = 0;
for (const name of readdirSync(join(base, "skills"))) {
  const target = join(SKILLS_DIR, `veille-${name}`, "SKILL.md");
  if (existsSync(target) && !ours(target)) {
    say(`Une autre skill « veille-${name} » existe déjà dans ${SKILLS_DIR} : je la laisse.`);
    continue;
  }
  const text = fill(readFileSync(join(base, "skills", name, "SKILL.md"), "utf8"));
  if (dryRun) say(`[simulation] ${target}`);
  else {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text);
    writeFileSync(join(dirname(target), MARKER), "");
  }
  installed++;
}

// 4. Optional Hunter.io key, asked here so that nobody has to open a terminal
// (or paste it into a conversation) later. Hidden input, stored locally only.
if (process.stdin.isTTY && !dryRun) {
  say();
  say("Option « Contacts RH » : trouver les emails du recrutement d'une entreprise (Hunter.io).");
  say("Il faut ta propre clé, gratuite : compte sur https://hunter.io, puis clé sur https://hunter.io/api-keys.");
  say("Attention : 50 recherches par mois sur le forfait gratuit. Une recherche peut consommer");
  say("un crédit sans rien donner d'utile : à utiliser avec parcimonie, sur les offres qui comptent.");
  const had = Boolean(getSecret("hunter"));
  const replace = had ? /^o/i.test(await ask("Une clé Hunter est déjà enregistrée. La remplacer ? (o/N) : ")) : true;
  if (replace) {
    const key = await askHidden("Colle ta clé Hunter (clic droit pour coller), ou Entrée pour passer : ");
    if (key) {
      setSecret("hunter", key);
      say("Clé enregistrée sur cet ordinateur uniquement.");
    } else if (!had) {
      say("Pas de clé : tout le reste marche. Relance cet installeur pour l'ajouter plus tard.");
    }
  }
}

say();
say(`C'est installé : version ${version}, ${installed} commandes.`);
say("Ouvre Claude Code (ou redémarre-le s'il était ouvert) et tape : /veille-demarrer");
say(`Pour désinstaller : supprime ${DEST} et les dossiers veille-* de ${SKILLS_DIR}.`);

// Builds the release assets in dist/ (the workflow uploads them as they are):
//   veille-emploi.zip          the app; the installers download it from GitHub
//   veille-emploi.zip.sha256   its checksum, verified before anything runs
//   Installer.cmd              Windows installer, CRLF whatever the checkout
//   Installer-mac.zip          Installer.command, zipped to keep it executable
//
//   node scripts/package.mjs
//
// The zip ships scripts/install.mjs, which registers the commands as personal
// skills (/veille-scrape, /veille-cv...).
//
// Content = files git tracks or would track (so .gitignore keeps cv/, db-writes/,
// details/ and other personal working files out), minus maintainer-only files,
// plus node_modules so the recipient needs no npm install. No dependency: the
// zip is written by hand with zlib.
import { deflateRawSync } from "node:zlib";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { appVersion, releaseRepo } from "./lib/version.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TOP = "veille-emploi";
const VERSION = appVersion(ROOT);
const REPO = releaseRepo(ROOT);
// One build only: commands installed as personal skills.
// --standalone is still accepted, as a no-op, for older instructions.
const standalone = true;
// The asset name never changes: releases/latest/download/<name> relies on it.
const DIST = join(ROOT, "dist");
const out = join(DIST, `${TOP}.zip`);

// Maintainer-only: Codex copies of the skills, the repo's own CLAUDE.md, CI.
// cv-sur-mesure/ is a separate project that happens to live in this folder.
// The installers are release assets of their own: they download this zip.
const EXCLUDE = [
  /^\.agents\//,
  /^AGENTS\.md$/,
  /^CLAUDE\.md$/,
  /^dist\//,
  /^cv-sur-mesure\//,
  /^\.github\//,
  /^\.gitattributes$/,
  /^Installer\.(cmd|command)$/,
];
// The project-local skills in .claude/skills/veille-<name>/ are shipped as
// skills/<name>/, installed by scripts/install.mjs as personal skills. The
// recipient gets LISEZMOI.txt instead of the README.
EXCLUDE.push(/^README\.md$/);
const TEXT = /\.(md|mjs|html)$/;
const EXECUTABLE = [/\.command$/, /\.sh$/];
let CRC_TABLE; // filled on first use by crc32()

if (!existsSync(join(ROOT, "node_modules", "playwright"))) {
  console.error("node_modules absent : lance d'abord npm install.");
  process.exit(1);
}

const listed = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: ROOT })
  .toString("utf8")
  .split("\0")
  .filter((f) => f && !EXCLUDE.some((re) => re.test(f)) && existsSync(join(ROOT, f)));
const files = [...new Set([...listed, ...walk(join(ROOT, "node_modules"))])].sort();

const entries = [];
for (const rel of files) {
  let name = rel;
  let data = readFileSync(join(ROOT, rel));
  if (standalone) {
    const local = rel.match(/^\.claude\/skills\/veille-([^/]+)\/(.+)$/);
    if (local) name = `skills/${local[1]}/${local[2]}`;
    else if (rel.startsWith(".claude/")) continue;
    if (TEXT.test(rel) && !rel.startsWith("node_modules/")) data = Buffer.from(toStandalone(name, data.toString("utf8")));
  }
  const mode = EXECUTABLE.some((re) => re.test(rel)) ? 0o755 : 0o644;
  entries.push({ name: `${TOP}/${name}`, data, mode, mtime: statSync(join(ROOT, rel)).mtime });
}
if (standalone) entries.push({ name: `${TOP}/LISEZMOI.txt`, data: Buffer.from(readme()), mode: 0o644, mtime: new Date() });
if (new Set(entries.map((e) => e.name)).size !== entries.length) {
  console.error("Deux fichiers visent le même chemin dans le zip (skills/ et .claude/skills/ à la fois ?).");
  process.exit(1);
}

mkdirSync(DIST, { recursive: true });
const archive = zip(entries);
writeFileSync(out, archive);
// sha256sum format, so `sha256sum -c` checks it too.
const sha256 = createHash("sha256").update(archive).digest("hex");
writeFileSync(`${out}.sha256`, `${sha256}  ${TOP}.zip\n`);

const lines = (path, eol) => readFileSync(join(ROOT, path), "utf8").replace(/\r?\n/g, eol);
writeFileSync(join(DIST, "Installer.cmd"), lines("Installer.cmd", "\r\n"));
const mac = Buffer.from(lines("Installer.command", "\n"));
writeFileSync(join(DIST, "Installer-mac.zip"), zip([{ name: "Installer.command", data: mac, mode: 0o755, mtime: new Date() }]));

const mb = (archive.length / 1048576).toFixed(1);
console.log(JSON.stringify({ version: VERSION, out, sha256, files: entries.length, sizeMB: Number(mb) }, null, 2));

// Personal skills cannot be namespaced: /veille-cv becomes /veille-cv, and the
// skill's name follows. The app path is filled in by the installer.
function toStandalone(name, text) {
  text = text.replace(/\/veille-(?=[a-z…<*])/g, "/veille-");
  if (/^skills\/[^/]+\/SKILL\.md$/.test(name)) text = text.replace(/^name: (?!veille-)/m, "name: veille-");
  return text;
}

function walk(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...walk(full));
    else if (entry.isFile()) found.push(relative(ROOT, full).split(sep).join("/"));
  }
  return found;
}

function readme() {
  const releases = `https://github.com/${REPO}/releases/latest`;
  return `Veille Emploi ${VERSION} — installation
============================

Ce zip est téléchargé par l'installeur : tu n'as normalement pas à l'ouvrir.

1. Télécharge l'installeur sur ${releases}
   Windows : Installer.cmd. macOS : Installer-mac.zip, à dézipper
   (Linux : sh Installer.command).
2. Double-clique dessus. Il télécharge la dernière version, vérifie son
   empreinte et l'installe. Si Node.js manque, il propose de l'installer.
3. Ouvre Claude Code (ou redémarre-le) et tape : /veille-demarrer

L'application est copiée dans ~/.veille-emploi/app et les commandes
(/veille-demarrer, /veille-scrape, /veille-cv…) sont ajoutées comme skills
personnelles dans ~/.claude/skills. Pour mettre à jour, relance le même
installeur : les profils ne bougent pas.

Sans connexion, depuis ce dossier dézippé : node scripts/install.mjs
installe cette version-ci telle quelle.

Facultatif — emails RH avec Hunter.io (/veille-contacts, bouton « Contacts RH ») :
chacun utilise sa propre clé, aucune n'est fournie.
1. Crée un compte gratuit sur https://hunter.io et confirme ton email.
2. Copie ta clé sur https://hunter.io/api-keys
   (aide : https://help.hunter.io/en/articles/1970978-what-is-and-where-i-can-find-my-api-secret-key).
3. Colle-la dans Claude Code, qui l'enregistre sur cet ordinateur. Ou relance
   l'installeur : à la fin, il demande la clé (clic droit pour coller, puis
   Entrée), sans l'afficher.

ATTENTION AUX CRÉDITS : le forfait gratuit donne 50 crédits par mois, soit au
plus 50 recherches. Une recherche consomme 1 crédit dès que Hunter renvoie des
adresses, même si aucune n'est utile : tu peux payer un crédit et ne voir aucun
contact. À utiliser avec parcimonie, sur les offres qui comptent vraiment.
`.replace(/\n/g, "\r\n");
}

// ------------------------------------------------------------------ zip writer

function zip(items) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const item of items) {
    const name = Buffer.from(item.name, "utf8");
    const packed = deflateRawSync(item.data, { level: 9 });
    const stored = packed.length >= item.data.length;
    const body = stored ? item.data : packed;
    const crc = crc32(item.data);
    const [time, date] = dosTime(item.mtime);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(stored ? 0 : 8, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(item.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE((3 << 8) | 20, 4); // made by Unix, so the mode bits are honoured
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(stored ? 0 : 8, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(item.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(((0o100000 | item.mode) << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += local.length + name.length + body.length;
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(items.length, 8);
  end.writeUInt16LE(items.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

function dosTime(d) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const date = ((Math.max(d.getFullYear(), 1980) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return [time, date];
}

function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

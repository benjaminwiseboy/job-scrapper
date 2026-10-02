// Builds a shareable zip of the plugin: unzip, double-click the installer, done.
//
//   node scripts/package.mjs [--out dist/veille-emploi.zip]
//   node scripts/package.mjs --standalone   no plugin: dist/veille-emploi-standalone.zip
//
// --standalone ships install-standalone.mjs as the installer, which registers
// the commands as personal skills (/veille-scrape instead of /veille:scrape).
//
// Content = files git tracks or would track (so .gitignore keeps cv/, db-writes/,
// details/ and other personal working files out), minus maintainer-only files,
// plus node_modules so the recipient needs no npm install. No dependency: the
// zip is written by hand with zlib.
import { deflateRawSync } from "node:zlib";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TOP = "veille-emploi";
const standalone = process.argv.includes("--standalone");
const outArg = process.argv.indexOf("--out");
const out =
  outArg > -1 ? process.argv[outArg + 1] : join(ROOT, "dist", `${TOP}${standalone ? "-standalone" : ""}.zip`);

// Maintainer-only: Codex copies of the skills and the repo's own CLAUDE.md.
const EXCLUDE = [/^\.agents\//, /^AGENTS\.md$/, /^CLAUDE\.md$/, /^dist\//];
// Standalone: no plugin manifest or hook; the project-local skill copies in
// .claude/skills/veille-<name>/ are shipped as skills/<name>/.
if (standalone) EXCLUDE.push(/^\.claude-plugin\//, /^hooks\//, /^README\.md$/, /^scripts\/install\.mjs$/);
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
    if (rel === "scripts/install-standalone.mjs") name = "scripts/install.mjs";
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

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, zip(entries));
const mb = (statSync(out).size / 1048576).toFixed(1);
console.log(JSON.stringify({ out, files: entries.length, sizeMB: Number(mb) }, null, 2));

// Personal skills cannot be namespaced: /veille:cv becomes /veille-cv, and the
// skill's name follows. The app path is filled in by the installer.
function toStandalone(name, text) {
  text = text.replace(/\/veille:(?=[a-z…<*])/g, "/veille-");
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
  return `Veille Emploi — installation sans plugin
=========================================

1. Dézippe ce dossier où tu veux.
2. Windows : double-clique sur Installer.cmd.
   macOS : double-clique sur Installer.command (Linux : sh Installer.command).
   Si Node.js manque, l'installeur propose de l'installer.
3. Ouvre Claude Code (ou redémarre-le) et tape : /veille-demarrer

L'application est copiée dans ~/.veille-emploi/app et les commandes
(/veille-demarrer, /veille-scrape, /veille-cv…) sont ajoutées comme skills
personnelles dans ~/.claude/skills. Aucun plugin n'est installé. Le dossier
dézippé peut être supprimé ensuite ; relancer l'installeur d'un zip plus récent
met à jour sans toucher aux profils.
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

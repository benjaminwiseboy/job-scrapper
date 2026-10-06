// Local registry of job-search profiles. Each profile is one dashboard
// artifact (its URL is the database) plus a local workspace folder for
// working files (CVs, scrape reports, batches). Lives outside the app so it
// survives updates and works from any folder.
//
//   node scripts/veille-config.mjs                 active profile (JSON)
//   node scripts/veille-config.mjs get [--profile <id>]
//   node scripts/veille-config.mjs list
//   node scripts/veille-config.mjs add --id <id> --label <label> --url <artifactUrl> [--workspace <dir>]
//   node scripts/veille-config.mjs use <id>
//   node scripts/veille-config.mjs set --profile <id> --dashboard-hash <hash>
//   node scripts/veille-config.mjs remove <id>     forgets the profile, touches neither artifact nor files
//   node scripts/veille-config.mjs secret hunter [<key>] [--remove]   stores an API key in secrets.json
//                                  (no key: asks for it, hidden, in an interactive terminal)
//
// Exit codes: 0 ok, 2 bad usage, 3 no profile configured / unknown profile.
// The config directory can be moved with VEILLE_HOME.
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { askHidden } from "./lib/prompt.mjs";
import { CONFIG_PATH, SECRETS_PATH, defaultWorkspace, getSecret, loadConfig, saveConfig, setSecret } from "./lib/config.mjs";

function describe(config, id) {
  const p = config.profiles[id];
  return { id, active: config.active === id, ...p, configPath: CONFIG_PATH };
}

function fail(code, message) {
  console.error(message);
  process.exit(code);
}

const [cmd = "get", ...rest] = process.argv.slice(2).filter(Boolean);
const args = parseArgs(rest);
const positional = rest.find((a) => !a.startsWith("--"));
const config = loadConfig();

switch (cmd) {
  case "get": {
    const id = args.profile || config.active;
    if (!id || !config.profiles[id]) {
      fail(3, id
        ? `Profil inconnu : ${id}. Profils existants : ${Object.keys(config.profiles).join(", ") || "aucun"}.`
        : "Aucun profil configuré. Lance /veille-demarrer pour créer le premier.");
    }
    console.log(JSON.stringify(describe(config, id), null, 2));
    break;
  }
  case "list": {
    console.log(JSON.stringify({
      active: config.active,
      configPath: CONFIG_PATH,
      profiles: Object.keys(config.profiles).map((id) => describe(config, id)),
    }, null, 2));
    break;
  }
  case "add": {
    const id = String(args.id || "").toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(id)) fail(2, "--id attendu : minuscules, chiffres et tirets (ex. « camille » ou « camille-alternance »).");
    if (!/^https:\/\/claude\.ai\/(code\/)?artifact\/[\w-]+$/.test(String(args.url || ""))) fail(2, "--url attendu : l'URL claude.ai de l'artefact du dashboard.");
    const workspace = resolve(args.workspace || defaultWorkspace(id));
    mkdirSync(workspace, { recursive: true });
    const previous = config.profiles[id] || {};
    config.profiles[id] = {
      label: args.label || previous.label || id,
      artifactUrl: args.url,
      workspace,
      createdAt: previous.createdAt || new Date().toISOString(),
      ...(previous.dashboardHash ? { dashboardHash: previous.dashboardHash } : {}),
    };
    config.active = id;
    saveConfig(config);
    console.log(JSON.stringify(describe(config, id), null, 2));
    break;
  }
  case "use": {
    if (!positional || !config.profiles[positional]) fail(3, `Profil inconnu : ${positional}.`);
    config.active = positional;
    saveConfig(config);
    console.log(JSON.stringify(describe(config, positional), null, 2));
    break;
  }
  case "set": {
    const id = args.profile || config.active;
    if (!id || !config.profiles[id]) fail(3, `Profil inconnu : ${id}.`);
    if (args["dashboard-hash"]) config.profiles[id].dashboardHash = args["dashboard-hash"];
    if (args.label) config.profiles[id].label = args.label;
    saveConfig(config);
    console.log(JSON.stringify(describe(config, id), null, 2));
    break;
  }
  case "remove": {
    if (!positional || !config.profiles[positional]) fail(3, `Profil inconnu : ${positional}.`);
    delete config.profiles[positional];
    if (config.active === positional) config.active = Object.keys(config.profiles)[0] || null;
    saveConfig(config);
    console.log(JSON.stringify({ removed: positional, active: config.active }, null, 2));
    break;
  }
  case "secret": {
    // Never echoes the key: only whether one is set. Without a value, asks for
    // it in the terminal (hidden), so it stays out of the shell history; from a
    // non-interactive shell it only reports the status. Claude passes the value
    // when the user pasted the key in the conversation.
    const [name, given] = rest.filter((a) => !a.startsWith("--"));
    if (!/^[a-z]+$/.test(name || "")) fail(2, "Usage : secret <nom> [<clé>] [--remove]");
    if (args.remove) setSecret(name, null);
    else {
      const value = given || (process.stdin.isTTY ? await askHidden(`Colle ta clé ${name} puis Entrée : `) : "");
      if (value.trim()) setSecret(name, value.trim());
    }
    console.log(JSON.stringify({ name, set: Boolean(getSecret(name)), path: SECRETS_PATH }, null, 2));
    break;
  }
  default:
    fail(2, `Commande inconnue : ${cmd}. Attendu : get, list, add, use, set, remove, secret.`);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2);
    const value = argv[i + 1] === undefined || argv[i + 1].startsWith("--") ? true : argv[++i];
    out[key] = value;
  }
  return out;
}

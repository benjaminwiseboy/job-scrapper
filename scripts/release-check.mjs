// Runs before `npm version` (preversion): a release is cut from an up-to-date
// main, so that the published zip matches what is on GitHub. npm itself
// already refuses a dirty working tree.
//
//   npm version patch|minor|major      bump, commit, tag, push: the CI publishes
//
// Set VEILLE_RELEASE_ANY_BRANCH=1 to cut a pre-release from another branch.
import { execFileSync } from "node:child_process";

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const fail = (msg) => {
  console.error(msg);
  process.exit(1);
};

const branch = git("rev-parse", "--abbrev-ref", "HEAD");
if (branch !== "main" && process.env.VEILLE_RELEASE_ANY_BRANCH !== "1") {
  fail(`Une version se publie depuis main (branche actuelle : ${branch}).`);
}
git("fetch", "--quiet", "origin");
const upstream = `origin/${branch}`;
let behind = "0";
try {
  behind = git("rev-list", "--count", `HEAD..${upstream}`);
} catch {}
if (behind !== "0") fail(`${upstream} a ${behind} commit(s) que tu n'as pas : fais d'abord git pull.`);

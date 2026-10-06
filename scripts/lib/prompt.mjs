// Terminal prompts shared by veille-config.mjs and the installer.

// Reads a line without echoing it, for an API key. Pasting works (the whole
// chunk arrives at once); in an old Windows console, right-click pastes.
export function askHidden(prompt) {
  return new Promise((done) => {
    const stdin = process.stdin;
    let value = "";
    process.stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          process.stdout.write(value ? ` (${value.length} caractères reçus)\n` : "\n");
          return done(value.trim());
        }
        if (ch === "\u0003") process.exit(130);
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else if (ch >= " ") value += ch;
      }
    };
    stdin.on("data", onData);
  });
}

// Reads a visible line (yes/no questions).
export function ask(prompt) {
  return new Promise((done) => {
    process.stdout.write(prompt);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    process.stdin.once("data", (line) => {
      process.stdin.pause();
      done(String(line).trim());
    });
  });
}

import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const __dirname = path.dirname(new URL(import.meta.url).pathname);

const srcDir = path.join(__dirname, "../src");
const distDir = path.join(__dirname, "../dist");

// Récupère la date de modification la plus récente d’un dossier
function getLatestMtime(dir) {
  let latest = 0;
  if (!fs.existsSync(dir)) return 0;

  const walk = (folder) => {
    for (const file of fs.readdirSync(folder)) {
      const fullPath = path.join(folder, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        walk(fullPath);
      } else {
        if (stat.mtimeMs > latest) latest = stat.mtimeMs;
      }
    }
  };

  walk(dir);
  return latest;
}

const plugin = JSON.parse(fs.readFileSync("src/plugin.json", "utf8"));
const name = plugin.id.replace(/^@/, "").replace(/\//, "-");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const version = pkg.version;
const folder = `${name}-${version}`;


// Compare scr and dist dates
const srcMTime = getLatestMtime(srcDir);
const distMTime = getLatestMtime(distDir);

if (srcMTime > distMTime) {
  console.log("🔨 Source files changed — rebuilding...");
  execSync("npm run build", { stdio: "inherit" });
} else {
  console.log("✅ Build is up-to-date — skipping rebuild.");
}

if (fs.existsSync(folder)) fs.rmSync(folder, { recursive: true, force: true });
fs.cpSync("dist", folder, { recursive: true });

// create a tar.gz archive file
execSync(`tar -czf ${folder}.tar.gz ${folder}`, { stdio: "inherit" });

// cleanup
fs.rmSync(folder, { recursive: true, force: true });

console.log(`✅ Archive created : ${folder}.tar.gz`);

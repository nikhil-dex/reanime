import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

const root = resolve("public/assets/characters");
const manifestPaths = [];

async function findManifests(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "index.json" || entry.name.startsWith(".")) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await findManifests(path);
    } else if (entry.isFile() && entry.name === "manifest.json") {
      manifestPaths.push(path);
    }
  }
}

function requiredAssets(manifest) {
  const assets = manifest.assets;
  if (!assets || typeof assets !== "object" || Array.isArray(assets)) return [];
  const paths = Object.keys(assets);
  const combinedFace = paths.includes("face/normal.png");
  return [
    ...["neutral", "pointing", "crossed_arms", "facepalm", "thumbs_up"].map((name) => `body/${name}.png`),
    "head/base.png",
    ...(combinedFace
      ? ["normal", "closed", "wide", "angry", "sad"].map((name) => `face/${name}.png`)
      : [
        ...["normal", "closed", "wide", "angry", "sad"].map((name) => `eyes/${name}.png`),
        ...["normal", "raised", "angry", "worried", "sad"].map((name) => `eyebrows/${name}.png`),
      ]),
    ...["neutral", "smile", "open", "shout", "sad"].map((name) => `mouths/${name}.png`),
  ];
}

async function isValidPackage(manifestPath) {
  try {
    const packageRoot = dirname(manifestPath);
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) return false;
    if (typeof manifest.package_id !== "string" || typeof manifest.version !== "string") return false;
    const canonical = manifest.architecture && manifest.renderer;
    if (!canonical && (!manifest.assets || typeof manifest.assets !== "object" || Array.isArray(manifest.assets))) return false;
    const calibrationStat = await stat(join(packageRoot, "calibration.json"));
    if (!calibrationStat.isFile()) return false;
    if (canonical) {
      const files = [];
      async function collect(directory) {
        for (const entry of await readdir(directory, { withFileTypes: true })) {
          const path = join(directory, entry.name);
          if (entry.isDirectory()) await collect(path);
          else if (entry.isFile() && entry.name.endsWith(".png")) files.push(relative(packageRoot, path).split("\\").join("/"));
        }
      }
      await collect(packageRoot);
      if (!files.includes("body/neutral.png") || !files.includes("head/base.png")) return false;
      if (!files.some((file) => file.startsWith("face/") && !file.endsWith("source_sheet.png"))) return false;
      if (!files.some((file) => file.startsWith("mouths/"))) return false;
      const left = files.filter((file) => file.startsWith("hands/left/"));
      const right = files.filter((file) => file.startsWith("hands/right/"));
      if (left.length !== right.length || !left.length) return false;
      const assets = Object.fromEntries(files.map((file) => [file, { format: "PNG" }]));
      await writeFile(join(packageRoot, "resource-index.json"), `${JSON.stringify({ assets }, null, 2)}\n`);
      return true;
    }
    for (const asset of requiredAssets(manifest)) {
      if (!(asset in manifest.assets)) return false;
      const assetStat = await stat(join(packageRoot, asset));
      if (!assetStat.isFile()) return false;
    }
    for (const asset of Object.keys(manifest.assets).filter((asset) => asset.startsWith("hands/"))) {
      if (!asset.endsWith(".png")) return false;
      const assetStat = await stat(join(packageRoot, asset));
      if (!assetStat.isFile()) return false;
    }
    return true;
  } catch {
    return false;
  }
}

await mkdir(root, { recursive: true });
await findManifests(root);
const packageRoots = new Set();
for (const manifestPath of manifestPaths) {
  if (await isValidPackage(manifestPath)) packageRoots.add(dirname(manifestPath));
}

const packages = [...packageRoots]
  .sort((left, right) => left.localeCompare(right))
  .map((packageRoot) => ({
    path: `/assets/characters/${relative(root, packageRoot).split("\\").join("/")}/`,
  }));

await writeFile(join(root, "index.json"), `${JSON.stringify({ packages }, null, 2)}\n`);
console.log(`Indexed ${packages.length} character package(s) in ${relative(process.cwd(), root)}`);

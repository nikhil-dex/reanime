import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

const root = resolve("public/assets/characters");
const manifests = [];

async function findManifests(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === "index.json" || entry.name.startsWith(".")) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await findManifests(path);
    else if (entry.isFile() && entry.name === "manifest.json") manifests.push(path);
  }
}

await mkdir(root, { recursive: true });
await findManifests(root);
const packageRoots = new Set(manifests.map(dirname));
try {
  const previous = JSON.parse(await readFile(join(root, "index.json"), "utf8"));
  for (const entry of previous.packages ?? []) {
    if (typeof entry.path !== "string" || !entry.path.startsWith("/assets/characters/")) continue;
    const stalePath = resolve(root, entry.path.slice("/assets/characters/".length));
    const staleRelative = relative(root, stalePath);
    if (staleRelative.startsWith("..") || packageRoots.has(stalePath)) continue;
    packageRoots.add(stalePath);
  }
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

const packages = [...packageRoots]
  .sort((left, right) => left.localeCompare(right))
  .map((packageRoot) => ({ path: `/assets/characters/${relative(root, packageRoot).split(sep).join("/")}/` }));

await writeFile(join(root, "index.json"), `${JSON.stringify({ packages }, null, 2)}\n`);
console.log(`Indexed ${packages.length} character package(s) in ${relative(process.cwd(), root)}`);

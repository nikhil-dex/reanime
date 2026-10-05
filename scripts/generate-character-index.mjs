import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const root = resolve("public/assets/characters");
const entries = await readdir(root, { withFileTypes: true });
const packages = [];

for (const entry of entries) {
  if (!entry.isDirectory()) continue;
  try {
    await readFile(join(root, entry.name, "manifest.json"), "utf8");
    packages.push({ path: `/assets/characters/${entry.name}/` });
  } catch {
    // Folders without a manifest are not character packages.
  }
}

await mkdir(root, { recursive: true });
await writeFile(join(root, "index.json"), `${JSON.stringify({ packages }, null, 2)}\n`);
console.log(`Indexed ${packages.length} character package(s) in ${relative(process.cwd(), root)}`);

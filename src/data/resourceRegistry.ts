import type {
  BodyPose,
  CalibrationLayer,
  CharacterCalibration,
  CharacterResource,
  Face,
  Eyebrows,
  Eyes,
  Mouth,
  ResourceCollection,
  ResourceRegistry,
} from "../types/project";
import { calibrationLayers, createDefaultCalibration } from "./characterCalibration";

type ManifestAsset = { sha256?: string; size?: [number, number]; format?: string };
type RawManifest = {
  schemaVersion?: number;
  character?: string;
  package_id?: string;
  packageId?: string;
  version?: string;
  packageVersion?: string;
  canvas?: string | { width: number; height: number };
  assets?: Record<string, ManifestAsset>;
  layers?: Partial<CharacterCalibration["layers"]>;
};
type PackageIndex = { packages: { path: string }[] };
type CalibrationFile = {
  schemaVersion?: number;
  character?: string;
  characterId?: string;
  packageVersion?: string;
  layers?: Partial<CharacterCalibration["layers"]>;
};

export const resourceRegistry: ResourceRegistry = {
  characters: {},
  packages: {},
  backgrounds: {},
  expressions: {},
  eyes: {},
  mouths: {},
  effects: {},
  voices: {},
  bgm: {},
  sfx: {},
};

const bodyPoses: BodyPose[] = ["neutral", "pointing", "crossed_arms", "facepalm", "thumbs_up"];
const eyes: Eyes[] = ["normal", "closed", "wide", "angry", "sad"];
const faces: Face[] = ["normal", "closed", "wide", "angry", "sad"];
const eyebrows: Eyebrows[] = ["normal", "raised", "angry", "worried", "sad"];
const mouths: Mouth[] = ["neutral", "smile", "open", "shout", "sad"];

function packageUrl(root: string, relativePath: string): string {
  return `${root.replace(/\/$/, "")}/${relativePath}`;
}

function parseCanvas(canvas: RawManifest["canvas"]): { width: number; height: number } | undefined {
  if (typeof canvas === "object" && canvas) return canvas;
  if (typeof canvas === "string") {
    const [width, height] = canvas.split("x").map(Number);
    if (width && height) return { width, height };
  }
  return undefined;
}

function assetPath(root: string, folder: string, name: string): string {
  return packageUrl(root, `${folder}/${name}.png`);
}

function normalizeCharacterId(value: string | undefined, packageId: string | undefined): string | undefined {
  if (value && /^[a-z0-9_-]+$/i.test(value) && !value.includes(" ")) return value.toLowerCase();
  const match = packageId?.match(/^([A-Z0-9]+)_CHARACTER/i);
  return match?.[1]?.toLowerCase();
}

function assetMap<T extends string>(root: string, manifestAssets: Record<string, ManifestAsset>, folder: string, names: readonly T[]): Partial<Record<T, string>> {
  const mapped: Partial<Record<T, string>> = {};
  for (const name of names) {
    if (`${folder}/${name}.png` in manifestAssets) mapped[name] = assetPath(root, folder, name);
  }
  return mapped;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Resource file not found: ${url}`);
  return response.json() as Promise<T>;
}

async function fetchOptionalJson<T>(url: string): Promise<T | undefined> {
  const response = await fetch(url);
  if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) return undefined;
  return response.json() as Promise<T>;
}

async function validateAsset(root: string, path: string): Promise<void> {
  const response = await fetch(packageUrl(root, path));
  if (!response.ok) throw new Error(`missing required asset '${path}'`);
}

function calibrationFromFile(characterId: string, packageVersion: string, file?: CalibrationFile, combinedFace = false): { calibration: CharacterCalibration; supportedLayers: CalibrationLayer[] } {
  const supportedLayers = calibrationLayers.filter((layer) => Boolean(file?.layers?.[layer]));
  const calibration = createDefaultCalibration(characterId, packageVersion, file?.layers);
  return { calibration, supportedLayers: supportedLayers.length ? supportedLayers : combinedFace ? ["body", "head", "face", "mouth"] : ["body", "head", "eyes", "eyebrows", "mouth"] };
}

async function loadPackage(root: string): Promise<CharacterResource> {
  let manifest = await fetchJson<RawManifest>(packageUrl(root, "manifest.json"));
  const packageMetadata = manifest;
  let calibrationFile: CalibrationFile | undefined;
  if (!manifest.assets && manifest.layers) {
    calibrationFile = {
      schemaVersion: manifest.schemaVersion,
      character: manifest.character,
      packageVersion: manifest.packageVersion,
      layers: manifest.layers,
    };
    manifest = await fetchJson<RawManifest>(packageUrl(root, "calibration.json"));
  }
  const characterId = normalizeCharacterId(packageMetadata.character ?? manifest.character, packageMetadata.packageId ?? packageMetadata.package_id ?? manifest.packageId ?? manifest.package_id);
  const packageVersion = packageMetadata.packageVersion ?? packageMetadata.version ?? manifest.packageVersion ?? manifest.version;
  const assets = manifest.assets;
  const canvas = parseCanvas(manifest.canvas);
  if (!characterId || !packageVersion || !assets || !canvas) throw new Error("manifest is missing character, version, canvas, or assets");
  const combinedFace = "face/normal.png" in assets;
  const required = combinedFace
    ? [
      ...bodyPoses.map((pose) => `body/${pose}.png`),
      "head/base.png",
      ...faces.map((face) => `face/${face}.png`),
      ...mouths.map((mouth) => `mouths/${mouth}.png`),
    ]
    : [
      ...bodyPoses.map((pose) => `body/${pose}.png`),
      "head/base.png",
      ...eyes.map((eye) => `eyes/${eye}.png`),
      ...eyebrows.map((eyebrow) => `eyebrows/${eyebrow}.png`),
      ...mouths.map((mouth) => `mouths/${mouth}.png`),
    ];
  for (const path of required) {
    if (!(path in assets)) throw new Error(`missing required asset '${path}'`);
    await validateAsset(root, path);
  }
  if (Object.keys(assets).some((path) => path.startsWith("arms/"))) throw new Error("arms/ is not a supported package category");

  calibrationFile ??= await fetchOptionalJson<CalibrationFile>(packageUrl(root, "calibration.json"));
  if (calibrationFile) {
    if (calibrationFile.schemaVersion !== 1 || calibrationFile.character !== characterId || calibrationFile.packageVersion !== packageVersion && calibrationFile.packageVersion !== packageVersion.replace(/\.0$/, "")) {
      throw new Error("calibration.json schema or package version is incompatible");
    }
  }
  const { calibration, supportedLayers } = calibrationFromFile(characterId, packageVersion, calibrationFile, combinedFace);
  const body = assetMap(root, assets, "body", bodyPoses) as Record<BodyPose, string>;
  const faceAssets = combinedFace ? assetMap(root, assets, "face", faces) as Record<Face, string> : undefined;
  const eyeAssets = combinedFace ? undefined : assetMap(root, assets, "eyes", eyes) as Record<Eyes, string>;
  const eyebrowAssets = combinedFace ? undefined : assetMap(root, assets, "eyebrows", eyebrows) as Record<Eyebrows, string>;
  const mouthAssets = assetMap(root, assets, "mouths", mouths) as Record<Mouth, string>;
  const head = assetPath(root, "head", "base");
  const hair = "hair/default.png" in assets ? assetPath(root, "hair", "default") : undefined;
  return {
    id: characterId,
    name: characterId[0].toUpperCase() + characterId.slice(1),
    packageVersion,
    body: body.neutral,
    head,
    hair,
    eyes: eyeAssets?.normal ?? faceAssets?.normal ?? head,
    eyebrows: eyebrowAssets?.normal ?? "normal",
    face: faceAssets?.normal,
    mouth: mouthAssets.neutral,
    expression: "expressions/neutral.png" in assets ? assetPath(root, "expressions", "neutral") : head,
    assets: { body, head, hair, face: faceAssets, eyes: eyeAssets, eyebrows: eyebrowAssets, mouth: mouthAssets },
    canvas,
    calibration,
    supportedLayers,
    packageRoot: root,
    manifest: packageMetadata as Record<string, unknown>,
  };
}

function versionParts(version: string): number[] {
  return version.split(".").map((part) => Number.parseInt(part, 10) || 0);
}

function compareVersions(left: string, right: string): number {
  const a = versionParts(left);
  const b = versionParts(right);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    if ((a[index] ?? 0) !== (b[index] ?? 0)) return (a[index] ?? 0) - (b[index] ?? 0);
  }
  return 0;
}

export async function discoverCharacterResources(): Promise<{ resources: CharacterResource[]; warnings: string[] }> {
  const index = await fetchJson<PackageIndex>("/assets/characters/index.json");
  const loaded: CharacterResource[] = [];
  const warnings: string[] = [];
  for (const entry of index.packages) {
    try {
      const resource = await loadPackage(entry.path);
      loaded.push(resource);
      resourceRegistry.packages[`${resource.id}@${resource.packageVersion ?? "unknown"}`] = resource;
    } catch (error) {
      warnings.push(`Character package invalid: ${entry.path} ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  for (const id of new Set(loaded.map((resource) => resource.id))) {
    const versions = loaded.filter((resource) => resource.id === id).sort((a, b) => compareVersions(b.packageVersion ?? "0", a.packageVersion ?? "0"));
    const newest = versions[0];
    if (newest) resourceRegistry.characters[id] = newest;
  }
  return { resources: loaded, warnings };
}

export async function loadSubaruResource(): Promise<CharacterResource> {
  const { resources } = await discoverCharacterResources();
  const resource = resources.filter((item) => item.id === "subaru").sort((a, b) => compareVersions(b.packageVersion ?? "0", a.packageVersion ?? "0"))[0];
  if (!resource) throw new Error("No valid Subaru character package was discovered.");
  return resource;
}

export type { ResourceCollection };

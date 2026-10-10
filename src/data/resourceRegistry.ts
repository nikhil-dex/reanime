import type {
  BodyPose,
  CalibrationLayer,
  CharacterCalibration,
  CharacterResource,
  Face,
  Eyebrows,
  Eyes,
  Mouth,
  HandPose,
  ResourceCollection,
  ResourceRegistry,
} from "../types/project";
import { calibrationLayers, createDefaultCalibration } from "./characterCalibration";
import { assetUrl, listInstalledCharacterPackages } from "./characterLibrary";

type ManifestAsset = { sha256?: string; size?: [number, number]; format?: string };
type RawManifest = {
  schemaVersion?: number;
  character?: string;
  package_id?: string;
  packageId?: string;
  version?: string;
  packageVersion?: string;
  canvas?: string | { width: number; height: number };
  renderer_architecture?: unknown[];
  pivots?: CharacterCalibration["pivots"];
  assets?: Record<string, ManifestAsset>;
  architecture?: Record<string, unknown>;
  renderer?: { layer_order?: string[]; headGroup?: string[] };
  layers?: Partial<CharacterCalibration["layers"]>;
};
type PackageIndex = { packages: { path: string }[] };
type CalibrationFile = {
  schemaVersion?: number;
  character?: string;
  characterId?: string;
  package_id?: string;
  version?: string;
  packageVersion?: string;
  layers?: Partial<CharacterCalibration["layers"] & Record<string, { transform?: Partial<CharacterCalibration["layers"][CalibrationLayer]>; pivot?: { x?: number; y?: number } }>> & { headGroup?: { transform?: Partial<CharacterCalibration["layers"]["head"]>; pivot?: { x?: number; y?: number } } };
  pivots?: CharacterCalibration["pivots"];
};
type ResourceIndex = { assets: Record<string, ManifestAsset> };

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

function discoveredAssetMap(root: string, manifestAssets: Record<string, ManifestAsset>, folder: string): Record<string, string> | undefined {
  const prefix = `${folder}/`;
  const entries = Object.keys(manifestAssets)
    .filter((path) => path.startsWith(prefix) && path.endsWith(".png"))
    .map((path) => [path.slice(prefix.length, -".png".length), packageUrl(root, path)] as const);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function cleanAssetMap(root: string, manifestAssets: Record<string, ManifestAsset>, folder: string): Record<string, string> | undefined {
  const entries = Object.keys(manifestAssets)
    .filter((path) => path.startsWith(`${folder}/`) && path.endsWith(".png"))
    .map((path) => [path.slice(folder.length + 1, -4), packageUrl(root, path)] as const);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Resource file not found: ${url}`);
  return response.json() as Promise<T>;
}

function clearRegistry(): void {
  for (const collection of [resourceRegistry.characters, resourceRegistry.packages]) {
    for (const key of Object.keys(collection)) delete collection[key];
  }
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
  const flatLayers: Partial<CharacterCalibration["layers"]> = {};
  const pivots = { ...file?.pivots };
  const clampPivot = (value: number | undefined): number => Number.isFinite(value) ? Math.min(1, Math.max(0, value as number)) : 0.5;
  for (const layer of calibrationLayers) {
    const sourceLayer = layer === "head" ? file?.layers?.head ?? file?.layers?.headGroup : file?.layers?.[layer];
    const value = sourceLayer;
    if (!value) continue;
    const nested = value as { transform?: Partial<CharacterCalibration["layers"][CalibrationLayer]>; pivot?: { x?: number; y?: number } };
    const transform = nested.transform && typeof nested.transform === "object" ? nested.transform : value as Partial<CharacterCalibration["layers"][CalibrationLayer]>;
    flatLayers[layer] = transform as CharacterCalibration["layers"][CalibrationLayer];
    if (nested.pivot) pivots[layer === "head" ? "headGroup" : layer as keyof typeof pivots] = { x: clampPivot(nested.pivot.x), y: clampPivot(nested.pivot.y) };
  }
  for (const target of ["headGroup", "hands", "leftArm", "rightArm"] as const) {
    const pivot = pivots[target];
    if (pivot) pivots[target] = { x: clampPivot(pivot.x), y: clampPivot(pivot.y) };
  }
  const supportedLayers = calibrationLayers.filter((layer) => Boolean(flatLayers[layer]));
  const calibration = createDefaultCalibration(characterId, packageVersion, flatLayers, pivots);
  return { calibration, supportedLayers: supportedLayers.length ? supportedLayers : combinedFace ? ["body", "head", "face", "mouth"] : ["body", "head", "eyes", "eyebrows", "mouth"] };
}

export async function loadPackage(root: string, source: "bundled" | "installed" = "bundled"): Promise<CharacterResource> {
  let manifest = await fetchJson<RawManifest>(packageUrl(root, "manifest.json"));
  const packageMetadata = manifest;
  let calibrationFile: CalibrationFile | undefined;
  if (!manifest.assets && manifest.layers) {
    calibrationFile = {
      schemaVersion: manifest.schemaVersion,
      character: manifest.character,
      packageVersion: manifest.packageVersion,
      layers: manifest.layers,
      pivots: manifest.pivots,
    };
    manifest = await fetchJson<RawManifest>(packageUrl(root, "calibration.json"));
  }
  if (!manifest.assets) {
    const index = await fetchJson<ResourceIndex>(packageUrl(root, "resource-index.json"));
    manifest = { ...manifest, assets: index.assets };
  }
  const characterId = normalizeCharacterId(packageMetadata.character ?? manifest.character, packageMetadata.packageId ?? packageMetadata.package_id ?? manifest.packageId ?? manifest.package_id);
  const packageVersion = packageMetadata.packageVersion ?? packageMetadata.version ?? manifest.packageVersion ?? manifest.version;
  const assets = manifest.assets;
  const canvas = parseCanvas(manifest.canvas);
  if (!characterId || !packageVersion || !assets || !canvas) throw new Error("manifest is missing character, version, canvas, or assets");
  const faceAssetMap = cleanAssetMap(root, assets, "face");
  const productionFaces = Object.keys(faceAssetMap ?? {}).filter((name) => name !== "source_sheet");
  const combinedFace = productionFaces.length > 0;
  const bodyAssetMap = cleanAssetMap(root, assets, "body");
  const mouthAssetMap = cleanAssetMap(root, assets, "mouths");
  const required = combinedFace
    ? [
      "body/neutral.png", "head/base.png",
      ...productionFaces.map((face) => `face/${face}.png`),
      ...Object.keys(mouthAssetMap ?? {}).map((mouth) => `mouths/${mouth}.png`),
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
  const handsPaths = Object.keys(assets).filter((path) => path.startsWith("hands/") && !path.startsWith("hands/paired_reference/"));
  for (const path of handsPaths) {
    if (!path.endsWith(".png") || !(path in assets)) throw new Error(`invalid hands asset '${path}'`);
    await validateAsset(root, path);
  }
  const leftArmAssets = cleanAssetMap(root, assets, "hands/left");
  const rightArmAssets = cleanAssetMap(root, assets, "hands/right");
  if (leftArmAssets && !rightArmAssets || rightArmAssets && !leftArmAssets) throw new Error("independent arm packages must provide both hands/left and hands/right");
  for (const path of [...Object.keys(leftArmAssets ?? {}), ...Object.keys(rightArmAssets ?? {})]) {
    const fullPath = path.includes("/") ? path : path;
    if (!fullPath || fullPath === "paired_reference") throw new Error("invalid independent arm asset");
  }

  calibrationFile ??= await fetchOptionalJson<CalibrationFile>(packageUrl(root, "calibration.json"));
  if (calibrationFile) {
    const calibrationCharacter = calibrationFile.character ?? calibrationFile.characterId ?? calibrationFile.package_id?.replace(/_character$/i, "").toLowerCase();
    const calibrationVersion = calibrationFile.packageVersion ?? calibrationFile.version;
    if (calibrationFile.schemaVersion !== undefined && calibrationFile.schemaVersion !== 1 || calibrationCharacter && calibrationCharacter !== characterId && calibrationFile.package_id !== packageMetadata.package_id || calibrationVersion !== packageVersion && calibrationVersion !== packageVersion.replace(/\.0$/, "")) {
      throw new Error("calibration.json schema or package version is incompatible");
    }
  }
  const { calibration, supportedLayers } = calibrationFromFile(characterId, packageVersion, calibrationFile, combinedFace);
  const body = bodyAssetMap as Record<BodyPose, string>;
  const faceAssets = combinedFace ? faceAssetMap && Object.fromEntries(productionFaces.map((name) => [name, faceAssetMap[name]])) as Record<Face, string> : undefined;
  const eyeAssets = combinedFace ? undefined : assetMap(root, assets, "eyes", eyes) as Record<Eyes, string>;
  const eyebrowAssets = combinedFace ? undefined : assetMap(root, assets, "eyebrows", eyebrows) as Record<Eyebrows, string>;
  const mouthAssets = mouthAssetMap as Record<Mouth, string>;
  const discoveredHands = discoveredAssetMap(root, assets, "hands");
  const directHands = discoveredHands
    ? Object.fromEntries(Object.entries(discoveredHands).filter(([name]) => !name.includes("/"))) as Record<HandPose, string>
    : undefined;
  const handsAssets = directHands && Object.keys(directHands).length ? directHands : undefined;
  const supportedLayersWithHands = handsAssets && !supportedLayers.includes("hands")
    ? [...supportedLayers, "hands" as CalibrationLayer]
    : supportedLayers;
  const head = assetPath(root, "head", "base");
  const hair = "hair/default.png" in assets ? assetPath(root, "hair", "default") : undefined;
  const neutralFace = faceAssets?.normal ?? Object.values(faceAssets ?? {})[0];
  const neutralMouth = mouthAssets.neutral ?? Object.values(mouthAssets)[0];
  const neutralBody = body.neutral ?? Object.values(body)[0];
  const independentArms = leftArmAssets && rightArmAssets;
  const applicableLayers = [
    ...supportedLayersWithHands,
    ...(combinedFace ? ["face", "mouth"] as CalibrationLayer[] : []),
    ...(leftArmAssets && rightArmAssets ? ["leftArm", "rightArm"] as CalibrationLayer[] : []),
  ];
  return {
    id: characterId,
    name: characterId[0].toUpperCase() + characterId.slice(1),
    packageVersion,
    body: neutralBody,
    head,
    hair,
    eyes: eyeAssets?.normal ?? neutralFace ?? head,
    eyebrows: eyebrowAssets?.normal ?? "normal",
    face: neutralFace,
    mouth: neutralMouth,
    expression: "expressions/neutral.png" in assets ? assetPath(root, "expressions", "neutral") : head,
    assets: { body, head, hair, face: faceAssets, eyes: eyeAssets, eyebrows: eyebrowAssets, mouth: mouthAssets, hands: independentArms ? undefined : handsAssets, leftArm: leftArmAssets, rightArm: rightArmAssets },
    canvas,
    calibration,
    supportedLayers: calibrationLayers.filter((layer) => applicableLayers.includes(layer)),
    packageRoot: root,
    manifest: packageMetadata as Record<string, unknown>,
    source,
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
  clearRegistry();
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
  try {
    const installed = await listInstalledCharacterPackages();
    for (const packageSummary of installed) {
      try {
        const resource = await loadPackage(assetUrl(packageSummary.installedPath), "installed");
        loaded.push(resource);
        resourceRegistry.packages[`${resource.id}@${resource.packageVersion ?? "unknown"}`] = resource;
      } catch (error) {
        warnings.push(`Installed character package invalid: ${packageSummary.installedPath} ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  } catch (error) {
    if (error instanceof Error && !error.message.includes("available in the desktop app")) throw error;
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

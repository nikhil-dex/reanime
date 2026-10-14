import type {
  BodyPose,
  CalibrationLayer,
  CharacterCalibration,
  CharacterResource,
  CanonicalCharacterManifest,
  Face,
  Mouth,
  ResourceRegistry,
} from "../types/project";
import { createDefaultCalibration } from "./characterCalibration";
import { assetUrl, listInstalledCharacterPackages } from "./characterLibrary";

type PackageIndex = { packages: { path: string }[] };

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

function packageUrl(root: string, path: string): string {
  const normalizedRoot = root.replace(/[\\/]+$/, "");
  const joined = `${normalizedRoot}/${path}`;
  return /^[A-Za-z]:[\\/]|^\/(?:Users|home)\//.test(root)
    ? assetUrl(joined)
    : joined;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Resource file not found: ${url}`);
  return response.json() as Promise<T>;
}

function validateManifest(manifest: CanonicalCharacterManifest): void {
  if (manifest.schema_version !== "1.0" || manifest.rig?.type !== "state_compositor") {
    throw new Error("Unsupported character package; expected schema 1.0 layered PNG state compositor.");
  }
  if (!manifest.states || typeof manifest.states !== "object" || !manifest.default_state
    || typeof manifest.default_state !== "object") {
    throw new Error("Character package must define canonical states and default_state maps.");
  }
  if (!manifest.canvas || manifest.canvas.width !== 1254 || manifest.canvas.height !== 1254
    || manifest.canvas.color_space !== "RGBA" || manifest.canvas.background !== "transparent") {
    throw new Error("Character package canvas must be exactly 1254x1254 transparent RGBA.");
  }
  const expectedLayers = ["body", "headGroup", "head", "face", "mouth"];
  if (!Array.isArray(manifest.rig?.layers)) {
    throw new Error("Character package must define the canonical rig.layers array.");
  }
  if (manifest.rig.layers.map((layer) => layer.id).join(",") !== expectedLayers.join(",")) {
    throw new Error("Character package rig must use the canonical body/headGroup/head/face/mouth compositor layers.");
  }
  const expectedTypes: Record<string, string> = {
    body: "pose_state",
    headGroup: "container",
    head: "base_art",
    face: "expression_state",
    mouth: "mouth_state",
  };
  for (const layer of manifest.rig.layers) {
    if (layer.type !== expectedTypes[layer.id] || layer.required !== true) {
      throw new Error(`Character package rig layer '${layer.id}' has an unsupported type or is not required.`);
    }
  }
  const headGroup = manifest.rig.layers.find((layer) => layer.id === "headGroup");
  if (headGroup?.children?.join(",") !== "head,face,mouth") {
    throw new Error("Character package headGroup must contain head, face, and mouth.");
  }
  if (manifest.rig.layers.find((layer) => layer.id === "face")?.composition !== "eyes_and_eyebrows_combined") {
    throw new Error("Character package face assets must combine eyes and eyebrows.");
  }
  for (const group of ["body", "face", "mouth"] as const) {
    if (!manifest.states[group] || typeof manifest.states[group] !== "object" || Array.isArray(manifest.states[group])
      || Object.keys(manifest.states[group]).length === 0) {
      throw new Error(`Character package is missing states.${group}.`);
    }
    const layerPaths = manifest.rig.layers.find((layer) => layer.id === group)?.assets;
    const statePaths = Object.values(manifest.states[group]);
    if (!layerPaths || [...layerPaths].sort().join("\n") !== [...statePaths].sort().join("\n")) {
      throw new Error(`Character package rig layer '${group}' assets must match states.${group}.`);
    }
  }
  if (!manifest.assets || typeof manifest.assets !== "object" || Array.isArray(manifest.assets)) {
    throw new Error("Character package assets must be a flat PNG asset registry.");
  }
  for (const group of ["body", "face", "mouth"] as const) {
    for (const [state, path] of Object.entries(manifest.states[group])) {
      const prefix = `${group}/`;
      if (!/^[A-Za-z0-9_-]+$/.test(state) || typeof path !== "string"
        || !path.startsWith(prefix) || !path.toLowerCase().endsWith(".png")) {
        throw new Error(`Invalid canonical ${group} state or PNG path: ${state}`);
      }
    }
  }
  if (Object.keys(manifest.default_state).length !== 3
    || (["body", "face", "mouth"] as const).some((group) => !Object.hasOwn(manifest.states[group], manifest.default_state[group]))) {
    throw new Error("Character package defaults must select one declared body, face, and mouth state.");
  }
  const headAssets = manifest.rig.layers.find((layer) => layer.id === "head")?.assets;
  if (!headAssets || headAssets.length !== 1 || !headAssets[0].startsWith("head/") || !headAssets[0].toLowerCase().endsWith(".png")) {
    throw new Error("Character package head layer must reference exactly one PNG under head/.");
  }
}

async function validatePng(root: string, path: string): Promise<void> {
  if (path.startsWith("/") || path.includes("\\") || path.split("/").some((part) => part === ".." || part === ".")) {
    throw new Error(`Unsafe character asset path: ${path}`);
  }
  const response = await fetch(packageUrl(root, path));
  if (!response.ok) throw new Error(`Missing character asset '${path}'.`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 26
    || !signature.every((value, index) => bytes[index] === value)
    || String.fromCharCode(...bytes.subarray(12, 16)) !== "IHDR") {
    throw new Error(`Character asset '${path}' is not a readable PNG.`);
  }
  const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (header.getUint32(16, false) !== 1254 || header.getUint32(20, false) !== 1254) {
    throw new Error(`Character asset '${path}' must be exactly 1254x1254 to match the canonical canvas.`);
  }
  if (bytes[25] !== 6) throw new Error(`Character asset '${path}' must use RGBA color to preserve transparency.`);
}

function calibrationFromManifest(
  manifest: CanonicalCharacterManifest,
  file: Record<string, unknown>,
): CharacterCalibration {
  if (file.schema_version !== "1.0"
    || file.package_id !== manifest.package_id
    || file.version !== manifest.version
    || !file.canvas || typeof file.canvas !== "object"
    || (file.canvas as Record<string, unknown>).width !== manifest.canvas.width
    || (file.canvas as Record<string, unknown>).height !== manifest.canvas.height
    || !file.layers || typeof file.layers !== "object" || Array.isArray(file.layers)) {
    throw new Error(`calibration.json must use schema 1.0 and match ${manifest.package_id} v${manifest.version} and its canvas.`);
  }
  const sourceLayers = file.layers as Record<string, Record<string, unknown>>;
  const supportedLayers: CalibrationLayer[] = ["body", "headGroup", "head", "face", "mouth"];
  if (supportedLayers.some((layer) => !sourceLayers[layer])) {
    throw new Error("calibration.json must define transforms for body, headGroup, head, face, and mouth.");
  }
  const baseline: Partial<Record<CalibrationLayer, Partial<CharacterCalibration["layers"][CalibrationLayer]>>> = {};
  for (const layer of supportedLayers) {
    const source = sourceLayers[layer];
    if (!source || typeof source !== "object" || Array.isArray(source)) {
      throw new Error(`calibration.json layer '${layer}' must be a transform object.`);
    }
    const allowedKeys = layer === "headGroup"
      ? ["x", "y", "scaleX", "scaleY", "rotation", "opacity", "pivot"]
      : ["x", "y", "scaleX", "scaleY", "rotation", "opacity"];
    if (Object.keys(source).some((key) => !allowedKeys.includes(key))) {
      throw new Error(`calibration.json layer '${layer}' contains unsupported transform fields.`);
    }
    const values = ["x", "y", "scaleX", "scaleY", "rotation", "opacity"] as const;
    const transform = Object.fromEntries(values.map((key) => [key, source[key]]));
    if (values.some((key) => typeof source[key] !== "number" || !Number.isFinite(source[key] as number))) {
      throw new Error(`calibration.json layer '${layer}' has an invalid transform.`);
    }
    const typedTransform = transform as Partial<CharacterCalibration["layers"][CalibrationLayer]>;
    if ((typedTransform.scaleX ?? 1) <= 0 || (typedTransform.scaleY ?? 1) <= 0
      || (typedTransform.opacity ?? 1) < 0 || (typedTransform.opacity ?? 1) > 1) {
      throw new Error(`calibration.json layer '${layer}' scale must be positive and opacity must be between 0 and 1.`);
    }
    baseline[layer] = typedTransform;
  }
  const pivotValue = sourceLayers.headGroup.pivot as { x?: unknown; y?: unknown } | undefined;
  if (pivotValue && (typeof pivotValue.x !== "number" || typeof pivotValue.y !== "number"
    || !Number.isFinite(pivotValue.x) || !Number.isFinite(pivotValue.y)
    || pivotValue.x < 0 || pivotValue.x > 1 || pivotValue.y < 0 || pivotValue.y > 1)) {
    throw new Error("calibration.json headGroup pivot must use normalized x and y values between 0 and 1.");
  }
  return createDefaultCalibration(manifest.package_id, manifest.version, baseline, {
    headGroup: pivotValue ? { x: pivotValue.x as number, y: pivotValue.y as number } : undefined,
  });
}

export async function loadPackage(root: string, source: "bundled" | "installed" = "bundled"): Promise<CharacterResource> {
  const manifest = await fetchJson<CanonicalCharacterManifest>(packageUrl(root, "manifest.json"));
  validateManifest(manifest);
  const calibrationData = await fetchJson<Record<string, unknown>>(packageUrl(root, "calibration.json"));
  const calibration = calibrationFromManifest(manifest, calibrationData);
  const assetEntries = Object.entries(manifest.assets);
  const expectedStates = [
    ...Object.entries(manifest.states.body).map(([state, path]) => [path, "body", state] as const),
    ...Object.entries(manifest.states.face).map(([state, path]) => [path, "face", state] as const),
    ...Object.entries(manifest.states.mouth).map(([state, path]) => [path, "mouth", state] as const),
    [manifest.rig.layers.find((layer) => layer.id === "head")?.assets?.[0] ?? "", "head", "head"] as const,
  ];
  if (assetEntries.length !== expectedStates.length) {
    throw new Error("Manifest asset registry must contain only the assets referenced by the canonical compositor.");
  }
  for (const [path, layer, state] of expectedStates) {
    const metadata = manifest.assets[path];
    if (!metadata || metadata.path !== path || metadata.layer !== layer || metadata.state !== state || metadata.type !== "png") {
      throw new Error(`Manifest asset registry entry '${path}' does not match its ${layer}/${state} state mapping.`);
    }
  }
  await Promise.all(assetEntries.map(([path]) => validatePng(root, path)));
  const mapStates = <T extends string>(states: Record<T, string>): Record<T, string> =>
    Object.fromEntries((Object.entries(states) as [T, string][]).map(([id, path]) => [id, packageUrl(root, path)])) as Record<T, string>;
  const headPath = manifest.rig.layers.find((layer) => layer.id === "head")?.assets?.[0];
  if (!headPath) throw new Error("Canonical character manifest is missing its head PNG.");
  return {
    id: manifest.package_id,
    name: manifest.display_name ?? manifest.name ?? manifest.package_id,
    packageVersion: manifest.version,
    assets: {
      body: mapStates<BodyPose>(manifest.states.body),
      head: packageUrl(root, headPath),
      face: mapStates<Face>(manifest.states.face),
      mouth: mapStates<Mouth>(manifest.states.mouth),
    },
    defaults: manifest.default_state,
    canvas: { width: manifest.canvas.width, height: manifest.canvas.height },
    calibration,
    supportedLayers: ["body", "headGroup", "head", "face", "mouth"],
    packageRoot: root,
    manifest,
    source,
  };
}

function clearRegistry(): void {
  for (const collection of [resourceRegistry.characters, resourceRegistry.packages]) {
    for (const key of Object.keys(collection)) delete collection[key];
  }
}

export async function discoverCharacterResources(): Promise<{ resources: CharacterResource[]; warnings: string[] }> {
  clearRegistry();
  const index = await fetchJson<PackageIndex>("/assets/characters/index.json");
  const loaded: CharacterResource[] = [];
  const warnings: string[] = [];
  const registeredPackages = new Set<string>();
  const register = (resource: CharacterResource, packagePath: string) => {
    const key = `${resource.id}@${resource.packageVersion ?? "unknown"}`;
    if (registeredPackages.has(key)) {
      warnings.push(`Duplicate character package ignored: ${key} (${packagePath})`);
      return;
    }
    registeredPackages.add(key);
    loaded.push(resource);
    resourceRegistry.packages[key] = resource;
  };
  for (const entry of index.packages) {
    try {
      register(await loadPackage(entry.path), entry.path);
    } catch (error) {
      warnings.push(`Character package invalid: ${entry.path} ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const installed = await listInstalledCharacterPackages();
  for (const summary of installed) {
    if (summary.status === "error" || summary.status === "missing") {
      warnings.push(summary.error ?? `Installed character package is unavailable: ${summary.packageId}`);
      continue;
    }
    try {
      register(await loadPackage(summary.installedPath, "installed"), summary.installedPath);
    } catch (error) {
      warnings.push(`Installed character package invalid: ${summary.installedPath} ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  for (const id of new Set(loaded.map((resource) => resource.id))) {
    const versions = loaded.filter((resource) => resource.id === id)
      .sort((left, right) => (right.packageVersion ?? "0").localeCompare(left.packageVersion ?? "0", undefined, { numeric: true }));
    if (versions[0]) resourceRegistry.characters[id] = versions[0];
  }
  return { resources: loaded, warnings };
}

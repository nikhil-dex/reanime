import type { CalibrationLayer, CharacterCalibration, CharacterResource } from "../types/project";

type Manifest = Record<string, unknown> & {
  assets?: Record<string, Record<string, unknown>>;
  package_id?: string;
  version?: string;
};

const encoder = new TextEncoder();

function arrayBuffer(data: Uint8Array): ArrayBuffer {
  return Uint8Array.from(data).buffer as ArrayBuffer;
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value: number): Uint8Array {
  return Uint8Array.of(value & 0xff, (value >>> 8) & 0xff);
}

function u32(value: number): Uint8Array {
  return Uint8Array.of(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function zipStore(files: { name: string; data: Uint8Array }[]): Blob {
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    const crc = crc32(file.data);
    const header = concat([
      u32(0x04034b50), u16(20), u16(0x800), u16(0), u16(0), u16(0),
      u32(crc), u32(file.data.length), u32(file.data.length), u16(name.length), u16(0), name, file.data,
    ]);
    local.push(header);
    central.push(concat([
      u32(0x02014b50), u16(20), u16(20), u16(0x800), u16(0), u16(0), u16(0),
      u32(crc), u32(file.data.length), u32(file.data.length), u16(name.length), u16(0), u16(0),
      u16(0), u16(0), u32(0), u32(offset), name,
    ]));
    offset += header.length;
  }
  const centralData = concat(central);
  const localData = concat(local);
  return new Blob([
    arrayBuffer(localData),
    arrayBuffer(centralData),
    arrayBuffer(concat([u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(centralData.length), u32(localData.length), u16(0)])),
  ], { type: "application/zip" });
}

function nextVersion(version: string): { number: number; packageVersion: string } {
  const [majorText, minorText] = version.split(".");
  const major = Number.parseInt(majorText ?? "0", 10);
  const minor = Number.parseInt(minorText ?? "0", 10) + 1;
  const number = major + minor / 10;
  return { number, packageVersion: `${major}.${minor}.0` };
}

function calibrationJson(calibration: CharacterCalibration, version: string, canvas: { width: number; height: number }, layers: CalibrationLayer[]): Uint8Array {
  const packageLayers = Object.fromEntries(layers.map((layer) => {
    return [layer, calibration.layers[layer]];
  }));
  return encoder.encode(`${JSON.stringify({
    schemaVersion: 1,
    character: calibration.characterId,
    packageVersion: version,
    canvas,
    layers: packageLayers,
    pivots: calibration.pivots,
  }, null, 2)}\n`);
}

async function sha256(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", arrayBuffer(data));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function exportPackageCalibration(resource: CharacterResource, calibration: CharacterCalibration): Promise<{ packageVersion: string; fileName: string }> {
  const sourceManifest = resource.manifest as Manifest;
  const currentVersion = resource.packageVersion ?? "0.3.0";
  const next = nextVersion(currentVersion);
  const packageId = `${calibration.characterId.toUpperCase()}_CHARACTER_v${next.packageVersion}`;
  const directory = `${calibration.characterId}_v${next.packageVersion}/`;
  const exportLayers = resource.assets.hands && !resource.supportedLayers.includes("hands")
    ? [...resource.supportedLayers, "hands" as CalibrationLayer]
    : resource.supportedLayers;
  const calibrationData = calibrationJson(calibration, next.packageVersion, resource.canvas, exportLayers);
  let assets = sourceManifest.assets;
  if (!assets) {
    const indexResponse = await fetch(`${resource.packageRoot.replace(/\/$/, "")}/resource-index.json`);
    if (!indexResponse.ok) throw new Error("Package does not provide an explicit resource index for export.");
    const index = await indexResponse.json() as { assets?: Record<string, Record<string, unknown>> };
    assets = index.assets;
  }
  if (!assets) throw new Error("Package has no exportable asset index.");
  const files: { name: string; data: Uint8Array }[] = [];
  for (const path of Object.keys(assets)) {
    if (path === "calibration.json") continue;
    const response = await fetch(`${resource.packageRoot.replace(/\/$/, "")}/${path}`);
    if (!response.ok) throw new Error(`Unable to copy package asset: ${path}`);
    files.push({ name: `${directory}${path}`, data: new Uint8Array(await response.arrayBuffer()) });
  }
  const {
    packageId: _packageId,
    packageVersion: _packageVersion,
    ...sourceManifestFields
  } = sourceManifest as Manifest & { packageId?: unknown; packageVersion?: unknown };
  const manifest: Manifest = {
    ...sourceManifestFields,
    package_id: packageId,
    version: next.packageVersion,
    assets: {
      ...assets,
      "calibration.json": { format: "JSON", sha256: await sha256(calibrationData) },
    },
  };
  files.push({ name: `${directory}calibration.json`, data: calibrationData });
  files.push({ name: `${directory}manifest.json`, data: encoder.encode(`${JSON.stringify(manifest, null, 2)}\n`) });
  const readmeResponse = await fetch(`${resource.packageRoot.replace(/\/$/, "")}/README.md`);
  if (readmeResponse.ok) files.push({ name: `${directory}README.md`, data: new Uint8Array(await readmeResponse.arrayBuffer()) });
  const fileName = `${packageId}.zip`;
  const url = URL.createObjectURL(zipStore(files));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
  return { packageVersion: next.packageVersion, fileName };
}

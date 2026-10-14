import type { CharacterCalibration, CharacterResource } from "../types/project";
import { assetUrl } from "./characterLibrary";

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

function calibrationJson(calibration: CharacterCalibration, packageId: string, version: string, canvas: { width: number; height: number }): Uint8Array {
  return encoder.encode(`${JSON.stringify({
    schema_version: "1.0",
    package_id: packageId,
    version,
    canvas,
    layers: Object.fromEntries(Object.entries(calibration.layers).map(([layer, transform]) => [
      layer,
      layer === "headGroup" ? { ...transform, pivot: calibration.pivots?.headGroup } : transform,
    ])),
  }, null, 2)}\n`);
}

export async function exportPackageCalibration(resource: CharacterResource, calibration: CharacterCalibration): Promise<{ packageVersion: string; fileName: string }> {
  const sourceManifest = resource.manifest;
  const currentVersion = resource.packageVersion ?? "0.3.0";
  const next = nextVersion(currentVersion);
  const packageId = sourceManifest.package_id;
  const directory = `${calibration.characterId}_v${next.packageVersion}/`;
  const calibrationData = calibrationJson(calibration, packageId, next.packageVersion, resource.canvas);
  const assets = sourceManifest.assets;
  if (!assets) throw new Error("Package has no exportable asset index.");
  const files: { name: string; data: Uint8Array }[] = [];
  for (const path of Object.keys(assets)) {
    if (path === "calibration.json") continue;
    const response = await fetch(assetUrl(`${resource.packageRoot.replace(/[\\/]+$/, "")}/${path}`));
    if (!response.ok) throw new Error(`Unable to copy package asset: ${path}`);
    files.push({ name: `${directory}${path}`, data: new Uint8Array(await response.arrayBuffer()) });
  }
  const manifest = {
    ...sourceManifest,
    package_id: packageId,
    version: next.packageVersion,
    assets,
  };
  files.push({ name: `${directory}calibration.json`, data: calibrationData });
  files.push({ name: `${directory}manifest.json`, data: encoder.encode(`${JSON.stringify(manifest, null, 2)}\n`) });
  const readmeResponse = await fetch(assetUrl(`${resource.packageRoot.replace(/[\\/]+$/, "")}/README.md`));
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

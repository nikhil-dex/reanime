import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { CharacterImportPreview, CharacterPackageSummary } from "../types/characterLibrary";

const tauriAvailable = () => "__TAURI_INTERNALS__" in window;

export async function chooseCharacterPackage(): Promise<string | null> {
  if (!tauriAvailable()) throw new Error("Character package importing is available in the desktop app.");
  const selected = await open({
    multiple: false,
    directory: false,
    filters: [{ name: "Character Package", extensions: ["zip"] }],
  });
  return typeof selected === "string" ? selected : null;
}

export async function previewCharacterPackage(path: string): Promise<CharacterImportPreview> {
  if (!tauriAvailable()) throw new Error("Character package importing is available in the desktop app.");
  return invoke<CharacterImportPreview>("preview_character_package", { sourcePath: path });
}

export async function installCharacterPackage(path: string): Promise<CharacterPackageSummary> {
  if (!tauriAvailable()) throw new Error("Character package importing is available in the desktop app.");
  return invoke<CharacterPackageSummary>("install_character_package", { sourcePath: path });
}

export async function checkCharacterPackageInstalled(packageId: string): Promise<boolean> {
  if (!tauriAvailable()) return false;
  return invoke<boolean>("is_character_package_installed", { packageId });
}

export async function listInstalledCharacterPackages(): Promise<CharacterPackageSummary[]> {
  if (!tauriAvailable()) return [];
  return invoke<CharacterPackageSummary[]>("list_character_packages");
}

export async function removeCharacterPackage(managedPath: string): Promise<void> {
  if (!tauriAvailable()) throw new Error("Character package removal is available in the desktop app.");
  await invoke("remove_character_package", { managedPath });
}

export function assetUrl(path: string): string {
  const windowsPath = /^[A-Za-z]:[\\/]/.test(path);
  const normalizedPath = windowsPath ? path.replace(/\//g, "\\") : path;
  const filesystemPath = path.startsWith("/Users/") || path.startsWith("/home/") || windowsPath;
  return tauriAvailable() && filesystemPath ? convertFileSrc(normalizedPath) : normalizedPath;
}

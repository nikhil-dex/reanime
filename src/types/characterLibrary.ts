import type { CharacterResource } from "./project";

export interface CharacterPackageSummary {
  characterId: string;
  displayName: string;
  packageId: string;
  version: string;
  architecture?: string;
  canvas?: { width: number; height: number };
  author?: string;
  description?: string;
  previewPath?: string;
  installedPath: string;
  importedAt: number;
  source: "bundled" | "installed";
  status?: "ready" | "missing" | "error";
  error?: string | null;
  bodyPoseCount?: number;
  faceVariantCount?: number;
  mouthVariantCount?: number;
}

export interface CharacterImportPreview extends CharacterPackageSummary {
  bodyPoseCount?: number;
  faceVariantCount?: number;
  mouthVariantCount?: number;
}

export interface CharacterLibraryState {
  packages: CharacterPackageSummary[];
  loading: boolean;
  error: string | null;
}

export interface InstalledCharacterPackage {
  summary: CharacterPackageSummary;
  resource?: CharacterResource;
}

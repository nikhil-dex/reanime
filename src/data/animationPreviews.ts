import type { CharacterResource, Face, Mouth } from "../types/project";

export type PreviewTarget = "headGroup" | "face" | "mouth";
export interface PreviewKeyframe {
  time: number;
  rotation?: number;
  value?: string;
}
export interface AnimationPreview {
  id: string;
  name: string;
  category: "head" | "face" | "mouth";
  duration: number;
  actions: { target: PreviewTarget; keyframes: PreviewKeyframe[] }[];
  userDefined?: boolean;
}
export interface PreviewRuntime {
  headGroupRotation: number;
  face?: Face;
  mouth?: Mouth;
}

const previewStorageKey = (resource: CharacterResource) => `reanime-animation-qa-${resource.id}@${resource.packageVersion}`;
const selectedPreviewStorageKey = (resource: CharacterResource) => `${previewStorageKey(resource)}-selected`;

export function loadSelectedPreview(resource: CharacterResource): string | null {
  return localStorage.getItem(selectedPreviewStorageKey(resource));
}

export function saveSelectedPreview(resource: CharacterResource, id: string | null): void {
  if (id) localStorage.setItem(selectedPreviewStorageKey(resource), id);
  else localStorage.removeItem(selectedPreviewStorageKey(resource));
}

export function defaultPreviews(resource: CharacterResource): AnimationPreview[] {
  const faces = Object.keys(resource.assets.face);
  const mouths = Object.keys(resource.assets.mouth);
  const closedFace = faces.find((face) => face.includes("closed")) ?? resource.defaults.face;
  const openMouth = mouths.find((mouth) => mouth === "open") ?? resource.defaults.mouth;
  return [
    { id: "head-jiggle", name: "Head Jiggle", category: "head", duration: 300, actions: [{ target: "headGroup", keyframes: [{ time: 0, rotation: 0 }, { time: 100, rotation: -3 }, { time: 200, rotation: 3 }, { time: 300, rotation: 0 }] }] },
    { id: "head-nod", name: "Head Nod", category: "head", duration: 450, actions: [{ target: "headGroup", keyframes: [{ time: 0, rotation: 0 }, { time: 150, rotation: 6 }, { time: 300, rotation: -2 }, { time: 450, rotation: 0 }] }] },
    { id: "head-shake", name: "Head Shake", category: "head", duration: 400, actions: [{ target: "headGroup", keyframes: [{ time: 0, rotation: 0 }, { time: 100, rotation: -6 }, { time: 200, rotation: 6 }, { time: 300, rotation: -4 }, { time: 400, rotation: 0 }] }] },
    { id: "blink", name: "Blink", category: "face", duration: 300, actions: [{ target: "face", keyframes: [{ time: 0, value: resource.defaults.face }, { time: 120, value: closedFace }, { time: 220, value: resource.defaults.face }] }] },
    { id: "mouth-talking", name: "Talking", category: "mouth", duration: 600, actions: [{ target: "mouth", keyframes: [{ time: 0, value: resource.defaults.mouth }, { time: 150, value: openMouth }, { time: 300, value: resource.defaults.mouth }, { time: 450, value: openMouth }, { time: 600, value: resource.defaults.mouth }] }] },
  ];
}

export function loadPreviews(resource: CharacterResource): AnimationPreview[] {
  const defaults = defaultPreviews(resource);
  try {
    const saved = JSON.parse(localStorage.getItem(previewStorageKey(resource)) ?? "[]") as AnimationPreview[];
    return [...defaults, ...saved.filter((preview) => preview.userDefined && !defaults.some((item) => item.id === preview.id))];
  } catch {
    return defaults;
  }
}

export function savePreviews(resource: CharacterResource, previews: AnimationPreview[]): void {
  localStorage.setItem(previewStorageKey(resource), JSON.stringify(previews.filter((preview) => preview.userDefined)));
}

export function previewRuntime(preview: AnimationPreview, elapsed: number): PreviewRuntime {
  const runtime: PreviewRuntime = { headGroupRotation: 0 };
  for (const action of preview.actions) {
    const frames = action.keyframes;
    const time = Math.min(Math.max(elapsed, 0), preview.duration);
    const next = frames.find((frame) => frame.time >= time) ?? frames[frames.length - 1];
    const previous = [...frames].reverse().find((frame) => frame.time <= time) ?? frames[0];
    if (!next || !previous) continue;
    if (action.target === "headGroup") {
      const span = next.time - previous.time;
      const amount = span ? (time - previous.time) / span : 0;
      runtime.headGroupRotation = (previous.rotation ?? 0) + ((next.rotation ?? 0) - (previous.rotation ?? 0)) * amount;
    } else if (action.target === "face" && next.value) runtime.face = next.value as Face;
    else if (action.target === "mouth" && next.value) runtime.mouth = next.value as Mouth;
  }
  return runtime;
}

import type { CharacterResource, Face, Mouth } from "../types/project";

export type PreviewTarget = "headGroup" | "face" | "mouth" | "hands" | "leftArm" | "rightArm";
export interface PreviewKeyframe {
  time: number;
  rotation?: number;
  value?: string;
}
export interface AnimationPreview {
  id: string;
  name: string;
  category: "head" | "face" | "mouth" | "hands";
  duration: number;
  actions: { target: PreviewTarget; keyframes: PreviewKeyframe[] }[];
  userDefined?: boolean;
}
export interface PreviewRuntime {
  headGroupRotation: number;
  face?: Face;
  mouth?: Mouth;
  hands?: string;
  leftArm?: string;
  rightArm?: string;
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
  const previews: AnimationPreview[] = [
    { id: "head-jiggle", name: "Head Jiggle", category: "head", duration: 300, actions: [{ target: "headGroup", keyframes: [{ time: 0, rotation: 0 }, { time: 100, rotation: -3 }, { time: 200, rotation: 3 }, { time: 300, rotation: 0 }] }] },
    { id: "head-nod", name: "Head Nod", category: "head", duration: 450, actions: [{ target: "headGroup", keyframes: [{ time: 0, rotation: 0 }, { time: 150, rotation: 6 }, { time: 300, rotation: -2 }, { time: 450, rotation: 0 }] }] },
    { id: "head-shake", name: "Head Shake", category: "head", duration: 400, actions: [{ target: "headGroup", keyframes: [{ time: 0, rotation: 0 }, { time: 100, rotation: -6 }, { time: 200, rotation: 6 }, { time: 300, rotation: -4 }, { time: 400, rotation: 0 }] }] },
    { id: "blink", name: "Blink", category: "face", duration: 300, actions: [{ target: "face", keyframes: [{ time: 0, value: "normal" }, { time: 120, value: "closed" }, { time: 220, value: "normal" }] }] },
    { id: "mouth-talking", name: "Talking", category: "mouth", duration: 600, actions: [{ target: "mouth", keyframes: [{ time: 0, value: "neutral" }, { time: 150, value: "open" }, { time: 300, value: "smile" }, { time: 450, value: "open" }, { time: 600, value: "neutral" }] }] },
  ];
  if (resource.assets.hands) {
    Object.keys(resource.assets.hands).forEach((pose) => previews.push({
      id: `hands-${pose}`,
      name: `Hands: ${pose.replaceAll("_", " ")}`,
      category: "hands",
      duration: 900,
      actions: [{ target: "hands", keyframes: [{ time: 0, value: pose }, { time: 900, value: pose }] }],
    }));
  }
  const armPreviewTargets: { target: "leftArm" | "rightArm"; assets?: Record<string, string> }[] = [
    { target: "leftArm", assets: resource.assets.leftArm },
    { target: "rightArm", assets: resource.assets.rightArm },
  ];
  for (const { target, assets } of armPreviewTargets) {
    if (!assets) continue;
    Object.keys(assets).forEach((pose) => previews.push({
      id: `${target}-${pose}`,
      name: `${target === "leftArm" ? "Left Arm" : "Right Arm"}: ${pose.replaceAll("_", " ")}`,
      category: "hands",
      duration: 900,
      actions: [{ target, keyframes: [{ time: 0, value: pose }, { time: 900, value: pose }] }],
    }));
  }
  return previews;
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
    if (action.target === "headGroup") {
      const span = next.time - previous.time;
      const amount = span ? (time - previous.time) / span : 0;
      runtime.headGroupRotation = (previous.rotation ?? 0) + ((next.rotation ?? 0) - (previous.rotation ?? 0)) * amount;
    } else if (action.target === "face" && next.value) runtime.face = next.value as Face;
    else if (action.target === "mouth" && next.value) runtime.mouth = next.value as Mouth;
    else if (action.target === "hands" && next.value) runtime.hands = next.value;
    else if (action.target === "leftArm" && next.value) runtime.leftArm = next.value;
    else if (action.target === "rightArm" && next.value) runtime.rightArm = next.value;
  }
  return runtime;
}

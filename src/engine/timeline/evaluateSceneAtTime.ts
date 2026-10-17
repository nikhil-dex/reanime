import type { CharacterInstance, Scene, TimelineClip, TimelineKeyframe, TimelineTrack } from "../../types/project";

export interface EvaluatedScene {
  scene: Scene;
  activeEffects: TimelineClip[];
  activeAudio: TimelineClip[];
  activeSubtitles: TimelineClip[];
}

function compareKeyframes(left: TimelineKeyframe, right: TimelineKeyframe): number {
  return left.time - right.time;
}

function valueAt(keyframes: TimelineKeyframe[], time: number): unknown {
  const ordered = [...keyframes].sort(compareKeyframes);
  let previous: TimelineKeyframe | undefined;
  let next: TimelineKeyframe | undefined;
  for (const keyframe of ordered) {
    if (keyframe.time <= time) previous = keyframe;
    else {
      next = keyframe;
      break;
    }
  }
  if (!previous) return undefined;
  if (!next || previous.interpolation !== "linear" || typeof previous.value !== "number" || typeof next.value !== "number") {
    return previous.value;
  }
  const span = next.time - previous.time;
  if (span <= 0) return next.value;
  const progress = Math.min(1, Math.max(0, (time - previous.time) / span));
  return previous.value + (next.value - previous.value) * progress;
}

function applyCharacterKeyframe(character: CharacterInstance, property: string, value: unknown): void {
  if (value === undefined) return;
  switch (property) {
    case "position.x":
    case "position.y":
      if (typeof value === "number" && Number.isFinite(value)) character.position[property.slice("position.".length) as "x" | "y"] = value;
      break;
    case "scale":
      if (typeof value === "number" && Number.isFinite(value) && value > 0) character.scale = value;
      break;
    case "visible":
      if (typeof value === "boolean") character.visible = value;
      break;
    case "body":
      if (typeof value === "string") character.body = value;
      break;
    case "face":
      if (typeof value === "string") character.face = value;
      break;
    case "mouth":
      if (typeof value === "string") character.mouth = value;
      break;
    case "eyes":
      if (typeof value === "string") character.eyes = value;
      break;
    case "eyebrows":
      if (typeof value === "string") character.eyebrows = value;
      break;
    case "expression":
      if (typeof value === "string") character.expression = value as CharacterInstance["expression"];
      break;
    default:
      break;
  }
}

function activeClips(tracks: TimelineTrack[], kind: TimelineTrack["kind"], time: number): TimelineClip[] {
  return tracks.filter((track) => track.kind === kind).flatMap((track) => (track.clips ?? [])
    .filter((clip) => clip.start <= time && time < clip.start + clip.duration));
}

/**
 * Pure deterministic scene evaluation. Times are seconds relative to the
 * beginning of the scene. Missing tracks preserve legacy static-scene behavior.
 */
export function evaluateSceneAtTime(source: Scene, timeSeconds: number): EvaluatedScene {
  if (!Number.isFinite(timeSeconds) || timeSeconds < 0) {
    throw new Error("Timeline evaluation time must be a finite, non-negative number.");
  }
  const time = Math.min(timeSeconds, source.duration);
  const scene: Scene = structuredClone(source);
  const tracks = scene.tracks ?? [];

  for (const track of tracks) {
    if (track.kind === "character" || track.kind === "expression") {
      const target = scene.characters.find((character) => character.id === track.targetId);
      if (!target) continue;
      const properties = new Set(track.keyframes.map((keyframe) => keyframe.property));
      for (const property of properties) {
        applyCharacterKeyframe(target, property, valueAt(
          track.keyframes.filter((keyframe) => keyframe.property === property), time,
        ));
      }
    }
    if (track.kind === "background") {
      const backgroundKeyframe = valueAt(track.keyframes.filter((keyframe) => keyframe.property === "background" || keyframe.property === "resourceId"), time);
      if (typeof backgroundKeyframe === "string") scene.background = backgroundKeyframe;
      const clip = [...(track.clips ?? [])]
        .filter((item) => item.start <= time && time < item.start + item.duration)
        .sort((a, b) => b.start - a.start)[0];
      if (clip?.resourceId) scene.background = clip.resourceId;
    }
  }

  return {
    scene,
    activeEffects: activeClips(tracks, "effect", time),
    activeAudio: activeClips(tracks, "audio", time),
    activeSubtitles: activeClips(tracks, "subtitle", time),
  };
}

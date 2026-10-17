export interface Point {
  x: number;
  y: number;
}

export type Expression = "neutral" | "happy" | "angry" | "shocked" | "sad" | "confused" | "dead_inside";
export type Face = string;
export type Mouth = string;
export type BodyPose = string;
export type CalibrationLayer = "body" | "headGroup" | "head" | "face" | "mouth";
export type PivotTarget = "headGroup";

/** Properties currently supported by the deterministic scene evaluator. */
export type CharacterKeyframeProperty =
  | "position.x"
  | "position.y"
  | "scale"
  | "visible"
  | "body"
  | "face"
  | "mouth"
  | "eyes"
  | "eyebrows"
  | "expression";

export type TimelineTrackKind =
  | "character"
  | "background"
  | "expression"
  | "effect"
  | "audio"
  | "subtitle";

export interface TimelineKeyframe {
  /** Time in seconds relative to the start of the scene. */
  time: number;
  /** Property path within the track's target. */
  property: string;
  /** Numeric values interpolate linearly; other values hold until replaced. */
  value: number | string | boolean | null;
  interpolation?: "linear" | "hold";
}

export interface TimelineClip {
  id: string;
  start: number;
  duration: number;
  resourceId?: string;
  properties?: Record<string, number | string | boolean | null>;
}

export interface TimelineTrack {
  id: string;
  name: string;
  kind: TimelineTrackKind;
  /** Character instance ID for character/expression tracks. */
  targetId?: string;
  keyframes: TimelineKeyframe[];
  /** Timed resource clips are used by backgrounds, effects, audio and subtitles. */
  clips?: TimelineClip[];
}

export interface CalibrationPivot {
  x: number;
  y: number;
}

export interface CalibrationTransform {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  opacity: number;
}

export interface CharacterCalibration {
  characterId: string;
  packageVersion: string;
  layers: Record<CalibrationLayer, CalibrationTransform>;
  pivots?: Partial<Record<PivotTarget, CalibrationPivot>>;
}

export interface Character {
  id: string;
  name: string;
  packageVersion?: string;
}

export interface CharacterInstance {
  id: string;
  characterId: string;
  packageVersion?: string;
  position: Point;
  scale: number;
  expression: Expression;
  body: BodyPose;
  face: Face;
  mouth: Mouth;
  eyes?: string;
  eyebrows?: string;
  hands?: string;
  leftArm?: string;
  rightArm?: string;
  visible: boolean;
  layer: number;
}

export interface Scene {
  id: string;
  name: string;
  duration: number;
  background: string;
  characters: CharacterInstance[];
  camera: {
    position: Point;
    zoom: number;
  };
  subtitles: string[];
  audio: string[];
  /** Optional for old project files; absent tracks behave as a static scene. */
  tracks?: TimelineTrack[];
}

export interface Project {
  name: string;
  width: number;
  height: number;
  fps: number;
  scenes: Scene[];
}

export interface CharacterResource extends Character {
  assets: {
    body: Record<BodyPose, string>;
    head: string;
    face: Record<Face, string>;
    mouth: Record<Mouth, string>;
  };
  defaults: { body: BodyPose; face: Face; mouth: Mouth };
  canvas: { width: number; height: number };
  calibration: CharacterCalibration;
  supportedLayers: CalibrationLayer[];
  packageRoot: string;
  manifest: CanonicalCharacterManifest;
  source?: "bundled" | "installed";
  preview?: string;
}

export interface CanonicalCharacterManifest {
  schema_version: "1.0";
  package_id: string;
  version: string;
  name?: string;
  display_name?: string;
  description?: string;
  author?: string;
  canvas: { width: number; height: number; color_space: "RGBA"; background: "transparent" };
  rig: {
    type: "state_compositor";
    layers: Array<{ id: string; type: string; required: true; assets?: string[]; children?: string[]; composition?: string }>;
    notes?: string[];
  };
  states: {
    body: Record<BodyPose, string>;
    face: Record<Face, string>;
    mouth: Record<Mouth, string>;
  };
  default_state: { body: BodyPose; face: Face; mouth: Mouth };
  assets: Record<string, { path: string; layer: string; state: string; type: "png" }>;
  counts?: Record<string, number>;
}

export type ResourceCollection = Record<string, string>;

export interface ResourceRegistry {
  characters: Record<string, CharacterResource>;
  packages: Record<string, CharacterResource>;
  backgrounds: ResourceCollection;
  expressions: ResourceCollection;
  eyes: ResourceCollection;
  mouths: ResourceCollection;
  effects: ResourceCollection;
  voices: ResourceCollection;
  bgm: ResourceCollection;
  sfx: ResourceCollection;
}

export interface Point {
  x: number;
  y: number;
}

export type Expression = "neutral" | "happy" | "angry" | "shocked" | "sad" | "confused" | "dead_inside";
export type Eyes = string;
export type Face = string;
export type Eyebrows = string;
export type Mouth = string;
export type BodyPose = string;
export type HandPose = string;
export type CalibrationLayer = "body" | "head" | "face" | "hair" | "eyes" | "eyebrows" | "mouth" | "hands" | "leftArm" | "rightArm";
export type PivotTarget = "headGroup" | "hands" | "leftArm" | "rightArm";

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
  body: string;
  head: string;
  hair?: string;
  eyes: string;
  eyebrows: string;
  face?: string;
  mouth: string;
  packageVersion?: string;
  expression: string;
}

export interface CharacterInstance {
  id: string;
  characterId: string;
  packageVersion?: string;
  position: Point;
  scale: number;
  expression: Expression;
  body: BodyPose;
  eyes: Eyes;
  eyebrows: Eyebrows;
  face?: Face;
  mouth: Mouth;
  hands?: HandPose;
  leftArm?: HandPose;
  rightArm?: HandPose;
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
    hair?: string;
    face?: Record<Face, string>;
    eyes?: Record<Eyes, string>;
    eyebrows?: Record<Eyebrows, string>;
    mouth: Record<Mouth, string>;
    hands?: Record<HandPose, string>;
    leftArm?: Record<HandPose, string>;
    rightArm?: Record<HandPose, string>;
  };
  canvas: { width: number; height: number };
  calibration: CharacterCalibration;
  supportedLayers: CalibrationLayer[];
  packageRoot: string;
  manifest: Record<string, unknown>;
  source?: "bundled" | "installed";
  preview?: string;
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

export interface Point {
  x: number;
  y: number;
}

export type Expression = "neutral" | "happy" | "angry" | "shocked" | "sad" | "confused" | "dead_inside";
export type Eyes = "normal" | "closed" | "wide" | "angry" | "sad";
export type Eyebrows = "normal" | "raised" | "angry" | "sad";
export type Mouth = "neutral" | "smile" | "open" | "shout" | "sad";
export type ArmPose = "neutral" | "pointing" | "crossed" | "facepalm" | "thumbs_up";

export interface Character {
  id: string;
  name: string;
  body: string;
  head: string;
  hair: string;
  eyes: string;
  eyebrows: string;
  mouth: string;
  arms: string;
  expression: string;
}

export interface CharacterInstance {
  id: string;
  characterId: string;
  position: Point;
  scale: number;
  expression: Expression;
  eyes: Eyes;
  eyebrows: Eyebrows;
  mouth: Mouth;
  arms: {
    left: ArmPose;
    right: ArmPose;
  };
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
  palette: {
    body: number;
    head: number;
    hair: number;
    accent: number;
  };
  assets: {
    body: string;
    head: string;
    hair: string;
    eyes: Record<Eyes, string>;
    eyebrows: Record<Eyebrows, string>;
    mouth: Record<Mouth, string>;
    arms: Record<ArmPose, string>;
  };
}

export type ResourceCollection = Record<string, string>;

export interface ResourceRegistry {
  characters: Record<string, CharacterResource>;
  backgrounds: ResourceCollection;
  expressions: ResourceCollection;
  eyes: ResourceCollection;
  mouths: ResourceCollection;
  arms: ResourceCollection;
  effects: ResourceCollection;
  voices: ResourceCollection;
  bgm: ResourceCollection;
  sfx: ResourceCollection;
}

export interface Point {
  x: number;
  y: number;
}

export interface CharacterInstance {
  id: string;
  characterId: string;
  position: Point;
  scale: number;
  expression: string;
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

export type ResourceCollection = Record<string, string>;

export interface ResourceRegistry {
  characters: ResourceCollection;
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

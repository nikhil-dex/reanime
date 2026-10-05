import type { Project, Scene } from "../types/project";

export const sampleScene: Scene = {
  id: "scene-1",
  name: "First conversation",
  duration: 12,
  background: "placeholder",
  characters: [
    {
      id: "kai-instance",
      characterId: "subaru",
      position: { x: 0.5, y: 0.55 },
      scale: 1,
      expression: "neutral",
      body: "neutral",
      eyes: "normal",
      eyebrows: "normal",
      face: "normal",
      mouth: "neutral",
      visible: true,
      layer: 1,
    },
  ],
  camera: {
    position: { x: 0.5, y: 0.5 },
    zoom: 1,
  },
  subtitles: [],
  audio: [],
};

export const initialProject: Project = {
  name: "Untitled conversation",
  width: 1920,
  height: 1080,
  fps: 30,
  scenes: [sampleScene],
};

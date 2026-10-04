import { create } from "zustand";
import { initialProject } from "../data/sampleScene";
import type { Project } from "../types/project";

interface EditorState {
  project: Project;
  activeSceneId: string;
  selectedObjectId: string | null;
  isPlaying: boolean;
  playhead: number;
  setPlaying: (isPlaying: boolean) => void;
  setPlayhead: (playhead: number) => void;
  updateProjectName: (name: string) => void;
  resetProject: () => void;
  addCharacter: (characterId: string) => void;
  updateCharacter: (updates: Partial<Pick<CharacterState, "characterId" | "expression" | "eyes" | "eyebrows" | "mouth" | "scale" | "position">> & { arms?: Partial<CharacterState["arms"]> }) => void;
}

type CharacterState = Project["scenes"][number]["characters"][number];

export const useEditorStore = create<EditorState>((set) => ({
  project: initialProject,
  activeSceneId: initialProject.scenes[0]?.id ?? "",
  selectedObjectId: initialProject.scenes[0]?.characters[0]?.id ?? null,
  isPlaying: false,
  playhead: 0,
  setPlaying: (isPlaying) => set({ isPlaying }),
  setPlayhead: (playhead) => set({ playhead }),
  updateProjectName: (name) =>
    set((state) => ({ project: { ...state.project, name } })),
  resetProject: () =>
    set({
      project: structuredClone(initialProject),
      activeSceneId: initialProject.scenes[0]?.id ?? "",
      selectedObjectId: initialProject.scenes[0]?.characters[0]?.id ?? null,
      isPlaying: false,
      playhead: 0,
    }),
  addCharacter: (characterId) =>
    set((state) => {
      const scene = state.project.scenes.find((item) => item.id === state.activeSceneId);
      if (!scene) return state;
      const id = `${characterId}-${scene.characters.length + 1}`;
      const character: CharacterState = {
        id,
        characterId,
        position: { x: 0.5, y: 0.55 },
        scale: 1,
        expression: "neutral",
        eyes: "normal",
        eyebrows: "normal",
        mouth: "neutral",
        arms: { left: "neutral", right: "neutral" },
        visible: true,
        layer: scene.characters.length + 1,
      };
      return {
        project: {
          ...state.project,
          scenes: state.project.scenes.map((item) =>
            item.id === scene.id ? { ...item, characters: [...item.characters, character] } : item,
          ),
        },
        selectedObjectId: id,
      };
    }),
  updateCharacter: (updates) =>
    set((state) => ({
      project: {
        ...state.project,
        scenes: state.project.scenes.map((scene) =>
          scene.id !== state.activeSceneId
            ? scene
            : {
                ...scene,
                characters: scene.characters.map((character) =>
                  character.id !== state.selectedObjectId
                    ? character
                    : { ...character, ...updates, arms: updates.arms ? { ...character.arms, ...updates.arms } : character.arms },
                ),
              },
        ),
      },
    })),
}));

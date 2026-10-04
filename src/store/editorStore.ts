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
}

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
}));

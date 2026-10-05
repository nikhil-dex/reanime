import { create } from "zustand";
import { initialProject } from "../data/sampleScene";
import type { Project } from "../types/project";
import type { CalibrationLayer, CalibrationTransform, CharacterCalibration } from "../types/project";
import { createDefaultCalibration } from "../data/characterCalibration";
import { discoverCharacterResources } from "../data/resourceRegistry";
import { resolveExpression } from "../data/characterExpressions";

interface EditorState {
  project: Project;
  resourcesReady: boolean;
  resourceRevision: number;
  activeSceneId: string;
  selectedObjectId: string | null;
  isPlaying: boolean;
  playhead: number;
  calibration: CharacterCalibration;
  calibrationBaseline: CharacterCalibration;
  calibrationMode: boolean;
  calibrationLayer: CalibrationLayer;
  showGuides: boolean;
  showGrid: boolean;
  showBoundingBox: boolean;
  referenceMode: boolean;
  setPlaying: (isPlaying: boolean) => void;
  setPlayhead: (playhead: number) => void;
  updateProjectName: (name: string) => void;
  resetProject: () => void;
  setResourcesReady: (calibration: CharacterCalibration) => void;
  refreshResources: () => Promise<void>;
  setCalibrationMode: (enabled: boolean) => void;
  setCalibrationLayer: (layer: CalibrationLayer) => void;
  updateCalibration: (updates: Partial<CalibrationTransform>) => void;
  resetCalibrationLayer: () => void;
  resetAllCalibration: () => void;
  setCalibrationDisplay: (key: "showGuides" | "showGrid" | "showBoundingBox" | "referenceMode", value: boolean) => void;
  importCalibration: (data: unknown) => void;
  addCharacter: (characterId: string) => void;
  updateCharacter: (updates: Partial<Pick<CharacterState, "characterId" | "expression" | "body" | "face" | "eyes" | "eyebrows" | "mouth" | "scale" | "position">>) => void;
}

type CharacterState = Project["scenes"][number]["characters"][number];

export const useEditorStore = create<EditorState>((set) => ({
  project: initialProject,
  resourcesReady: false,
  resourceRevision: 0,
  activeSceneId: initialProject.scenes[0]?.id ?? "",
  selectedObjectId: initialProject.scenes[0]?.characters[0]?.id ?? null,
  isPlaying: false,
  playhead: 0,
  calibration: createDefaultCalibration(),
  calibrationBaseline: createDefaultCalibration(),
  calibrationMode: false,
  calibrationLayer: "head",
  showGuides: true,
  showGrid: true,
  showBoundingBox: true,
  referenceMode: false,
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
  setResourcesReady: (calibration) => set({ calibration, calibrationBaseline: calibration, resourcesReady: true }),
  refreshResources: async () => {
    const { resources, warnings } = await discoverCharacterResources();
    const active = resources.sort((a, b) => (b.packageVersion ?? "0").localeCompare(a.packageVersion ?? "0", undefined, { numeric: true }))[0];
    if (warnings.length) console.warn(...warnings);
    if (active) {
      set((state) => ({
        calibration: active.calibration,
        calibrationBaseline: active.calibration,
        calibrationLayer: active.supportedLayers.includes(state.calibrationLayer) ? state.calibrationLayer : (active.supportedLayers[0] ?? "head"),
        resourcesReady: true,
        resourceRevision: state.resourceRevision + 1,
      }));
    }
  },
  setCalibrationMode: (calibrationMode) => set({ calibrationMode }),
  setCalibrationLayer: (calibrationLayer) => set({ calibrationLayer }),
  updateCalibration: (updates) =>
    set((state) => ({
      calibration: {
        ...state.calibration,
        layers: {
          ...state.calibration.layers,
          [state.calibrationLayer]: { ...state.calibration.layers[state.calibrationLayer], ...updates },
        },
      },
    })),
  resetCalibrationLayer: () =>
    set((state) => ({
      calibration: {
        ...state.calibration,
        layers: {
          ...state.calibration.layers,
          [state.calibrationLayer]: state.calibrationBaseline.layers[state.calibrationLayer],
        },
      },
    })),
  resetAllCalibration: () => set((state) => ({ calibration: state.calibrationBaseline })),
  setCalibrationDisplay: (key, value) => set({ [key]: value }),
  importCalibration: (data) => {
    if (!data || typeof data !== "object") throw new Error("Calibration import must be a JSON object.");
    const candidate = data as Partial<CharacterCalibration> & { schemaVersion?: number };
    set((state) => {
      if (
        candidate.schemaVersion !== 1 ||
        candidate.characterId !== state.calibrationBaseline.characterId ||
        candidate.packageVersion !== state.calibrationBaseline.packageVersion ||
        !candidate.layers
      ) {
        throw new Error(`Calibration package or version does not match ${state.calibrationBaseline.characterId} ${state.calibrationBaseline.packageVersion}.`);
      }
      return { calibration: candidate as CharacterCalibration };
    });
  },
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
        body: "neutral",
        eyes: "normal",
        eyebrows: "normal",
        face: "normal",
        mouth: "neutral",
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
                    : {
                      ...character,
                      ...updates,
                      ...(updates.expression ? resolveExpression(updates.expression) : {}),
                      ...(updates.face ? {
                        eyes: updates.face,
                        eyebrows: updates.face === "angry" ? "angry" : updates.face === "sad" ? "sad" : "normal",
                      } : {}),
                    },
                ),
              },
        ),
      },
    })),
}));

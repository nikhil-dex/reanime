import { create } from "zustand";
import { initialProject } from "../data/sampleScene";
import type { Project } from "../types/project";
import type { CalibrationLayer, CalibrationPivot, CalibrationTransform, CharacterCalibration, PivotTarget } from "../types/project";
import { createDefaultCalibration } from "../data/characterCalibration";
import { discoverCharacterResources } from "../data/resourceRegistry";
import { resolveExpression } from "../data/characterExpressions";
import { resourceRegistry } from "../data/resourceRegistry";

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
  previewId: string | null;
  previewPlaying: boolean;
  previewLoop: boolean;
  previewElapsed: number;
  previewRunAll: boolean;
  setPlaying: (isPlaying: boolean) => void;
  setPlayhead: (playhead: number) => void;
  updateProjectName: (name: string) => void;
  resetProject: () => void;
  setResourcesReady: (calibration: CharacterCalibration) => void;
  refreshResources: () => Promise<void>;
  setCalibrationMode: (enabled: boolean) => void;
  setCalibrationLayer: (layer: CalibrationLayer) => void;
  updateCalibration: (updates: Partial<CalibrationTransform>) => void;
  updatePivot: (target: PivotTarget, updates: Partial<CalibrationPivot>) => void;
  resetPivot: (target: PivotTarget) => void;
  resetCalibrationLayer: () => void;
  resetAllCalibration: () => void;
  setCalibrationDisplay: (key: "showGuides" | "showGrid" | "showBoundingBox" | "referenceMode", value: boolean) => void;
  importCalibration: (data: unknown) => void;
  addCharacter: (characterId: string) => void;
  updateCharacter: (updates: Partial<Pick<CharacterState, "characterId" | "expression" | "body" | "face" | "eyes" | "eyebrows" | "mouth" | "hands" | "leftArm" | "rightArm" | "scale" | "position">>) => void;
  setPreview: (previewId: string | null) => void;
  setPreviewPlaying: (playing: boolean) => void;
  setPreviewLoop: (loop: boolean) => void;
  setPreviewElapsed: (elapsed: number) => void;
  setPreviewRunAll: (runAll: boolean) => void;
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
  previewId: null,
  previewPlaying: false,
  previewLoop: false,
  previewElapsed: 0,
  previewRunAll: false,
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
      let currentCalibration = active.calibration;
      try {
        const stored = localStorage.getItem(`reanime-calibration-${active.id}@${active.packageVersion}`);
        if (stored) {
          const parsed = JSON.parse(stored) as CharacterCalibration;
          if (parsed.characterId === active.id && parsed.packageVersion === active.packageVersion && parsed.layers) currentCalibration = parsed;
        }
      } catch {
        console.warn(`Unable to restore saved calibration for ${active.id}@${active.packageVersion}.`);
      }
      set((state) => ({
        calibrationBaseline: active.calibration,
        calibration: currentCalibration,
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
  updatePivot: (target, updates) =>
    set((state) => ({
      calibration: {
        ...state.calibration,
        pivots: {
          ...state.calibration.pivots,
          [target]: {
            x: Math.min(1, Math.max(0, updates.x ?? state.calibration.pivots?.[target]?.x ?? 0.5)),
            y: Math.min(1, Math.max(0, updates.y ?? state.calibration.pivots?.[target]?.y ?? 0.5)),
          },
        },
      },
    })),
  resetPivot: (target) =>
    set((state) => ({
      calibration: {
        ...state.calibration,
        pivots: {
          ...state.calibration.pivots,
          [target]: { x: 0.5, y: 0.5 },
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
        pivots: ["head", "hands", "leftArm", "rightArm"].includes(state.calibrationLayer)
          ? (() => {
            const target: PivotTarget = state.calibrationLayer === "head" ? "headGroup" : state.calibrationLayer as PivotTarget;
            return { ...state.calibration.pivots, [target]: state.calibrationBaseline.pivots?.[target] ?? { x: 0.5, y: 0.5 } };
          })()
          : state.calibration.pivots,
      },
    })),
  resetAllCalibration: () => set((state) => ({
    calibration: {
      ...state.calibrationBaseline,
      pivots: {
        ...state.calibrationBaseline.pivots,
      },
    },
  })),
  setCalibrationDisplay: (key, value) => set({ [key]: value }),
  setPreview: (previewId) => set({ previewId, previewPlaying: false, previewElapsed: 0 }),
  setPreviewPlaying: (previewPlaying) => set({ previewPlaying }),
  setPreviewLoop: (previewLoop) => set({ previewLoop }),
  setPreviewElapsed: (previewElapsed) => set({ previewElapsed }),
  setPreviewRunAll: (previewRunAll) => set({ previewRunAll }),
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
        packageVersion: resourceRegistry.characters[characterId]?.packageVersion,
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

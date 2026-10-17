import { create } from "zustand";
import { initialProject } from "../data/sampleScene";
import type { Project } from "../types/project";
import type { CalibrationLayer, CalibrationPivot, CalibrationTransform, CharacterCalibration, PivotTarget } from "../types/project";
import { createDefaultCalibration, isValidStoredCalibration, parsePackageCalibration } from "../data/characterCalibration";
import { discoverCharacterResources } from "../data/resourceRegistry";
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
  loadProject: (project: Project) => void;
  setActiveScene: (sceneId: string) => void;
  addScene: () => void;
  duplicateScene: (sceneId: string) => void;
  deleteScene: (sceneId: string) => void;
  renameScene: (sceneId: string, name: string) => void;
  updateSceneDuration: (sceneId: string, duration: number) => void;
  moveScene: (sceneId: string, direction: -1 | 1) => void;
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
  activateCharacter: (characterId: string) => void;
  updateCharacter: (updates: Partial<Pick<CharacterState, "characterId" | "expression" | "body" | "face" | "mouth" | "scale" | "position">>) => void;
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
  loadProject: (project) =>
    set({
      project: structuredClone(project),
      activeSceneId: project.scenes[0]?.id ?? "",
      selectedObjectId: project.scenes[0]?.characters[0]?.id ?? null,
      isPlaying: false,
      playhead: 0,
      previewId: null,
      previewPlaying: false,
      previewElapsed: 0,
    }),
  setActiveScene: (sceneId) =>
    set((state) => {
      const scene = state.project.scenes.find((item) => item.id === sceneId);
      if (!scene) return state;
      return { activeSceneId: sceneId, selectedObjectId: scene.characters[0]?.id ?? null, isPlaying: false, playhead: 0 };
    }),
  addScene: () =>
    set((state) => {
      const previous = state.project.scenes.find((item) => item.id === state.activeSceneId) ?? state.project.scenes[state.project.scenes.length - 1];
      const stamp = Date.now();
      const index = state.project.scenes.length + 1;
      const characters = previous ? structuredClone(previous.characters).map((character, i) => ({ ...character, id: `${character.characterId}-${stamp}-${i + 1}` })) : [];
      const scene = {
        id: `scene-${stamp}-${index}`,
        name: `Scene ${index}`,
        duration: previous?.duration ?? 12,
        background: previous?.background ?? "placeholder",
        characters,
        camera: previous ? structuredClone(previous.camera) : { position: { x: 0.5, y: 0.5 }, zoom: 1 },
        subtitles: previous ? [...previous.subtitles] : [],
        audio: previous ? [...previous.audio] : [],
      };
      return { project: { ...state.project, scenes: [...state.project.scenes, scene] }, activeSceneId: scene.id, selectedObjectId: characters[0]?.id ?? null, isPlaying: false, playhead: 0 };
    }),
  duplicateScene: (sceneId) =>
    set((state) => {
      const index = state.project.scenes.findIndex((item) => item.id === sceneId);
      if (index < 0) return state;
      const source = state.project.scenes[index];
      const stamp = Date.now();
      const duplicate = {
        ...structuredClone(source),
        id: `scene-${stamp}-copy`,
        name: `${source.name} Copy`,
        characters: source.characters.map((character, i) => ({ ...structuredClone(character), id: `${character.characterId}-${stamp}-${i + 1}` })),
      };
      const scenes = [...state.project.scenes];
      scenes.splice(index + 1, 0, duplicate);
      return { project: { ...state.project, scenes }, activeSceneId: duplicate.id, selectedObjectId: duplicate.characters[0]?.id ?? null, isPlaying: false, playhead: 0 };
    }),
  deleteScene: (sceneId) =>
    set((state) => {
      if (state.project.scenes.length <= 1) return state;
      const index = state.project.scenes.findIndex((item) => item.id === sceneId);
      if (index < 0) return state;
      const scenes = state.project.scenes.filter((item) => item.id !== sceneId);
      const wasActive = state.activeSceneId === sceneId;
      const nextActive = wasActive ? scenes[Math.min(index, scenes.length - 1)] : scenes.find((item) => item.id === state.activeSceneId)!;
      return { project: { ...state.project, scenes }, activeSceneId: nextActive.id, selectedObjectId: wasActive ? nextActive.characters[0]?.id ?? null : state.selectedObjectId, isPlaying: false, playhead: 0 };
    }),
  renameScene: (sceneId, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    set((state) => ({ project: { ...state.project, scenes: state.project.scenes.map((scene) => scene.id === sceneId ? { ...scene, name: trimmed } : scene) } }));
  },
  updateSceneDuration: (sceneId, duration) => {
    if (!Number.isFinite(duration)) return;
    const safeDuration = Math.min(600, Math.max(0.1, duration));
    set((state) => ({
      project: { ...state.project, scenes: state.project.scenes.map((scene) => scene.id === sceneId ? { ...scene, duration: safeDuration } : scene) },
      ...(state.activeSceneId === sceneId ? { playhead: Math.min(state.playhead, safeDuration) } : {}),
    }));
  },
  moveScene: (sceneId, direction) =>
    set((state) => {
      const index = state.project.scenes.findIndex((item) => item.id === sceneId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= state.project.scenes.length) return state;
      const scenes = [...state.project.scenes];
      [scenes[index], scenes[target]] = [scenes[target], scenes[index]];
      return { project: { ...state.project, scenes } };
    }),
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
          const parsed: unknown = JSON.parse(stored);
          if (isValidStoredCalibration(parsed, active.id, active.packageVersion ?? "unknown")) currentCalibration = parsed;
          else console.warn(`Saved calibration for ${active.id}@${active.packageVersion} is invalid; using package defaults.`);
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
        pivots: state.calibrationLayer === "headGroup"
          ? { ...state.calibration.pivots, headGroup: state.calibrationBaseline.pivots?.headGroup ?? { x: 0.5, y: 0.5 } }
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
  importCalibration: (data) => set((state) => ({
    calibration: parsePackageCalibration(
      data,
      state.calibrationBaseline.characterId,
      state.calibrationBaseline.packageVersion,
      resourceRegistry.characters[state.calibrationBaseline.characterId]?.canvas,
    ),
  })),
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
        body: resourceRegistry.characters[characterId]?.defaults.body ?? "neutral",
        face: resourceRegistry.characters[characterId]?.defaults.face ?? "normal",
        mouth: resourceRegistry.characters[characterId]?.defaults.mouth ?? "neutral",
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
  activateCharacter: (characterId) => {
    const resource = resourceRegistry.characters[characterId];
    if (!resource) return;
    let calibration = resource.calibration;
    try {
      const stored = localStorage.getItem(`reanime-calibration-${resource.id}@${resource.packageVersion}`);
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        if (isValidStoredCalibration(parsed, resource.id, resource.packageVersion ?? "unknown")) calibration = parsed;
        else console.warn(`Saved calibration for ${resource.id}@${resource.packageVersion} is invalid; using package defaults.`);
      }
    } catch { console.warn(`Unable to restore saved calibration for ${resource.id}@${resource.packageVersion}.`); }
    set({ calibration, calibrationBaseline: resource.calibration, calibrationLayer: resource.supportedLayers[0] ?? "head" });
  },
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
                      ...(updates.characterId && resourceRegistry.characters[updates.characterId] ? {
                        packageVersion: resourceRegistry.characters[updates.characterId].packageVersion,
                        body: resourceRegistry.characters[updates.characterId].defaults.body,
                        face: resourceRegistry.characters[updates.characterId].defaults.face,
                        mouth: resourceRegistry.characters[updates.characterId].defaults.mouth,
                      } : {}),
                    },
                ),
              },
        ),
      },
    })),
}));

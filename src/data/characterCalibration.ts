import type { CharacterCalibration, CalibrationLayer, CalibrationTransform } from "../types/project";

export const calibrationLayers: CalibrationLayer[] = ["body", "head", "face", "hair", "eyes", "eyebrows", "mouth"];

export const defaultCalibrationTransform = (): CalibrationTransform => ({
  x: 0,
  y: 0,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  opacity: 1,
});

export const createDefaultCalibration = (
  characterId = "subaru",
  packageVersion = "0.1.0",
  baseline?: Partial<Record<CalibrationLayer, Partial<CalibrationTransform>>>,
): CharacterCalibration => ({
  characterId,
  packageVersion,
  layers: Object.fromEntries(
    calibrationLayers.map((layer) => [layer, { ...defaultCalibrationTransform(), ...baseline?.[layer] }]),
  ) as CharacterCalibration["layers"],
});

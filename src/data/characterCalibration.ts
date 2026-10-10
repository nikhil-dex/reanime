import type { CalibrationPivot, CharacterCalibration, CalibrationLayer, CalibrationTransform } from "../types/project";

export const calibrationLayers: CalibrationLayer[] = ["body", "head", "face", "hair", "eyes", "eyebrows", "mouth", "hands", "leftArm", "rightArm"];

export const defaultCalibrationTransform = (): CalibrationTransform => ({
  x: 0,
  y: 0,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  opacity: 1,
});

export const defaultCalibrationPivot = (): CalibrationPivot => ({ x: 0.5, y: 0.5 });

export const createDefaultCalibration = (
  characterId = "subaru",
  packageVersion = "0.1.0",
  baseline?: Partial<Record<CalibrationLayer, Partial<CalibrationTransform>>>,
  pivots?: Partial<CharacterCalibration["pivots"]>,
): CharacterCalibration => ({
  characterId,
  packageVersion,
  layers: Object.fromEntries(
    calibrationLayers.map((layer) => [layer, { ...defaultCalibrationTransform(), ...baseline?.[layer] }]),
  ) as CharacterCalibration["layers"],
  pivots: {
    headGroup: { ...defaultCalibrationPivot(), ...pivots?.headGroup },
    hands: { ...defaultCalibrationPivot(), ...pivots?.hands },
    leftArm: { ...defaultCalibrationPivot(), ...pivots?.leftArm },
    rightArm: { ...defaultCalibrationPivot(), ...pivots?.rightArm },
  },
});

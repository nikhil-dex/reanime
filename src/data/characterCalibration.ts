import type { CalibrationPivot, CharacterCalibration, CalibrationLayer, CalibrationTransform } from "../types/project";

export const calibrationLayers: CalibrationLayer[] = ["body", "headGroup", "head", "face", "mouth"];

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
  },
});

export function parsePackageCalibration(
  data: unknown,
  characterId: string,
  packageVersion: string,
  expectedCanvas?: { width: number; height: number },
): CharacterCalibration {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Calibration import must be a JSON object.");
  }
  const source = data as Record<string, unknown>;
  const canvas = source.canvas;
  if (source.schema_version !== "1.0" || source.package_id !== characterId || source.version !== packageVersion) {
    throw new Error(`Calibration package or version does not match ${characterId} ${packageVersion}.`);
  }
  if (!canvas || typeof canvas !== "object" || Array.isArray(canvas)
    || !Number.isInteger((canvas as Record<string, unknown>).width)
    || !Number.isInteger((canvas as Record<string, unknown>).height)
    || ((canvas as Record<string, number>).width ?? 0) < 1
    || ((canvas as Record<string, number>).height ?? 0) < 1) {
    throw new Error("Calibration canvas must contain positive integer width and height.");
  }
  const canvasRecord = canvas as Record<string, unknown>;
  if (expectedCanvas
    && (canvasRecord.width !== expectedCanvas.width || canvasRecord.height !== expectedCanvas.height)) {
    throw new Error("Calibration canvas does not match the selected character package.");
  }
  const layersValue = source.layers;
  if (!layersValue || typeof layersValue !== "object" || Array.isArray(layersValue)) {
    throw new Error("Calibration layers must define body, headGroup, head, face, and mouth.");
  }
  const layersSource = layersValue as Record<string, unknown>;
  if (Object.keys(layersSource).sort().join(",") !== [...calibrationLayers].sort().join(",")) {
    throw new Error("Calibration layers must contain exactly body, headGroup, head, face, and mouth.");
  }
  const transforms = {} as CharacterCalibration["layers"];
  for (const layer of calibrationLayers) {
    const value = layersSource[layer];
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`Calibration layer '${layer}' must be a transform object.`);
    }
    const transform = value as Record<string, unknown>;
    const keys = layer === "headGroup"
      ? ["x", "y", "scaleX", "scaleY", "rotation", "opacity", "pivot"]
      : ["x", "y", "scaleX", "scaleY", "rotation", "opacity"];
    if (Object.keys(transform).some((key) => !keys.includes(key))) {
      throw new Error(`Calibration layer '${layer}' contains unsupported transform fields.`);
    }
    const numbers = ["x", "y", "scaleX", "scaleY", "rotation", "opacity"] as const;
    if (numbers.some((key) => typeof transform[key] !== "number" || !Number.isFinite(transform[key]))) {
      throw new Error(`Calibration layer '${layer}' must define finite numeric transforms.`);
    }
    if ((transform.scaleX as number) <= 0 || (transform.scaleY as number) <= 0
      || (transform.opacity as number) < 0 || (transform.opacity as number) > 1) {
      throw new Error(`Calibration layer '${layer}' scale must be positive and opacity must be between 0 and 1.`);
    }
    transforms[layer] = {
      x: transform.x as number,
      y: transform.y as number,
      scaleX: transform.scaleX as number,
      scaleY: transform.scaleY as number,
      rotation: transform.rotation as number,
      opacity: transform.opacity as number,
    };
  }
  const headGroup = layersSource.headGroup as Record<string, unknown>;
  const sourcePivot = headGroup.pivot;
  let pivot: CalibrationPivot | undefined;
  if (sourcePivot !== undefined) {
    if (!sourcePivot || typeof sourcePivot !== "object" || Array.isArray(sourcePivot)) {
      throw new Error("Calibration headGroup pivot must define normalized x and y values.");
    }
    const point = sourcePivot as Record<string, unknown>;
    if (Object.keys(point).some((key) => !["x", "y"].includes(key))
      || typeof point.x !== "number" || !Number.isFinite(point.x) || point.x < 0 || point.x > 1
      || typeof point.y !== "number" || !Number.isFinite(point.y) || point.y < 0 || point.y > 1) {
      throw new Error("Calibration headGroup pivot x and y must be normalized values between 0 and 1.");
    }
    pivot = { x: point.x, y: point.y };
  }
  return {
    characterId,
    packageVersion,
    layers: transforms,
    pivots: { headGroup: pivot ?? defaultCalibrationPivot() },
  };
}

export function isValidStoredCalibration(
  value: unknown,
  characterId: string,
  packageVersion: string,
): value is CharacterCalibration {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.characterId !== characterId || candidate.packageVersion !== packageVersion
    || !candidate.layers || typeof candidate.layers !== "object" || Array.isArray(candidate.layers)) return false;
  const layers = candidate.layers as Record<string, unknown>;
  if (Object.keys(layers).sort().join(",") !== [...calibrationLayers].sort().join(",")) return false;
  for (const layer of calibrationLayers) {
    const transform = layers[layer];
    if (!transform || typeof transform !== "object" || Array.isArray(transform)) return false;
    const fields = transform as Record<string, unknown>;
    if (["x", "y", "scaleX", "scaleY", "rotation", "opacity"]
      .some((key) => typeof fields[key] !== "number" || !Number.isFinite(fields[key]))) return false;
    if ((fields.scaleX as number) <= 0 || (fields.scaleY as number) <= 0
      || (fields.opacity as number) < 0 || (fields.opacity as number) > 1) return false;
  }
  const pivots = candidate.pivots;
  if (pivots === undefined) return true;
  if (!pivots || typeof pivots !== "object" || Array.isArray(pivots)) return false;
  const pivotRecord = pivots as Record<string, unknown>;
  if (Object.keys(pivotRecord).some((key) => key !== "headGroup")) return false;
  const pivot = pivotRecord.headGroup;
  return pivot === undefined || (!!pivot && typeof pivot === "object" && !Array.isArray(pivot)
    && typeof (pivot as Record<string, unknown>).x === "number"
    && Number.isFinite((pivot as Record<string, number>).x)
    && (pivot as Record<string, number>).x >= 0 && (pivot as Record<string, number>).x <= 1
    && typeof (pivot as Record<string, unknown>).y === "number"
    && Number.isFinite((pivot as Record<string, number>).y)
    && (pivot as Record<string, number>).y >= 0 && (pivot as Record<string, number>).y <= 1);
}

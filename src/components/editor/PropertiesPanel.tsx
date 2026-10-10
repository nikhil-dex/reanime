import { useEffect, useRef } from "react";
import { Icon } from "../common/Icon";
import { resourceRegistry } from "../../data/resourceRegistry";
import { exportPackageCalibration } from "../../data/packageExporter";
import { useEditorStore } from "../../store/editorStore";
import type { CalibrationLayer, Face } from "../../types/project";
import { loadPreviews, loadSelectedPreview, saveSelectedPreview } from "../../data/animationPreviews";

const faces: Face[] = ["normal", "closed", "wide", "angry", "sad"];

function calibrationLayerLabel(layer: CalibrationLayer): string {
  return layer === "head" ? "HeadGroup" : layer === "leftArm" ? "Left Arm" : layer === "rightArm" ? "Right Arm" : layer.replaceAll("_", " ").replace(/^\w/, (letter) => letter.toUpperCase());
}

export function PropertiesPanel() {
  const selected = useEditorStore((state) => state.project.scenes.find((scene) => scene.id === state.activeSceneId)?.characters.find((character) => character.id === state.selectedObjectId));
  const updateCharacter = useEditorStore((state) => state.updateCharacter);
  const character = selected ? resourceRegistry.characters[selected.characterId] : undefined;
  const previews = character ? loadPreviews(character) : [];
  const previewId = useEditorStore((state) => state.previewId);
  const previewPlaying = useEditorStore((state) => state.previewPlaying);
  const previewLoop = useEditorStore((state) => state.previewLoop);
  const setPreview = useEditorStore((state) => state.setPreview);
  const setPreviewPlaying = useEditorStore((state) => state.setPreviewPlaying);
  const setPreviewLoop = useEditorStore((state) => state.setPreviewLoop);
  const setPreviewElapsed = useEditorStore((state) => state.setPreviewElapsed);
  const previewRunAll = useEditorStore((state) => state.previewRunAll);
  const setPreviewRunAll = useEditorStore((state) => state.setPreviewRunAll);
  const activePreviewId = previewId ?? (character ? loadSelectedPreview(character) : null);
  const activePreview = previews.find((preview) => preview.id === activePreviewId);
  useEffect(() => {
    if (!previewRunAll || previewPlaying || !activePreview) return;
    const index = previews.findIndex((preview) => preview.id === activePreview.id);
    const next = previews[index + 1];
    if (!next) {
      setPreviewRunAll(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setPreview(next.id);
      setPreviewPlaying(true);
    }, 150);
    return () => window.clearTimeout(timer);
  }, [previewRunAll, previewPlaying, activePreview, previews, setPreview, setPreviewPlaying, setPreviewRunAll]);
  const supportedCalibrationLayers = character?.supportedLayers ?? [];
  const calibrationMode = useEditorStore((state) => state.calibrationMode);
  const showGuides = useEditorStore((state) => state.showGuides);
  const showGrid = useEditorStore((state) => state.showGrid);
  const showBoundingBox = useEditorStore((state) => state.showBoundingBox);
  const referenceMode = useEditorStore((state) => state.referenceMode);
  const calibration = useEditorStore((state) => state.calibration);
  const calibrationLayer = useEditorStore((state) => state.calibrationLayer);
  const setCalibrationMode = useEditorStore((state) => state.setCalibrationMode);
  const setCalibrationLayer = useEditorStore((state) => state.setCalibrationLayer);
  const updateCalibration = useEditorStore((state) => state.updateCalibration);
  const updatePivot = useEditorStore((state) => state.updatePivot);
  const resetPivot = useEditorStore((state) => state.resetPivot);
  const resetCalibrationLayer = useEditorStore((state) => state.resetCalibrationLayer);
  const resetAllCalibration = useEditorStore((state) => state.resetAllCalibration);
  const setCalibrationDisplay = useEditorStore((state) => state.setCalibrationDisplay);
  const importCalibration = useEditorStore((state) => state.importCalibration);
  const importRef = useRef<HTMLInputElement>(null);
  const transform = calibration.layers[calibrationLayer];
  const pivotTarget = calibrationLayer === "hands" ? "hands" : calibrationLayer === "leftArm" ? "leftArm" : calibrationLayer === "rightArm" ? "rightArm" : calibrationLayer === "head" ? "headGroup" : undefined;
  const pivot = pivotTarget ? calibration.pivots?.[pivotTarget] ?? { x: 0.5, y: 0.5 } : undefined;

  const exportCalibration = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ schemaVersion: 1, ...calibration }, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${calibration.characterId}-calibration.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const saveCalibration = () => {
    localStorage.setItem(`reanime-calibration-${calibration.characterId}@${calibration.packageVersion}`, JSON.stringify(calibration));
  };

  const savePackageCalibration = async () => {
    if (!character) return;
    const currentVersion = character.packageVersion ?? "unknown";
    const [majorText, minorText] = currentVersion.split(".");
    const nextVersion = `${Number.parseInt(majorText ?? "0", 10)}.${Number.parseInt(minorText ?? "0", 10) + 1}.0`;
    const confirmed = window.confirm(
      `Save Package Calibration\n\nCurrent package: ${character.id} v${currentVersion}\nNew package: ${character.id} v${nextVersion}\n\nAssets: UNCHANGED\nCalibration: UPDATED\n\nCreate the new package?`,
    );
    if (!confirmed) return;
    try {
      const result = await exportPackageCalibration(character, calibration);
      window.alert(`${result.fileName} was created. Extract it into public/assets/characters/ and click Refresh Assets to use it.`);
    } catch (error) {
      console.error("Package calibration export failed", error);
      window.alert(`Package calibration export failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const updateTransform = (key: keyof typeof transform, value: number) => updateCalibration({ [key]: value });

  useEffect(() => {
    if (!calibrationMode) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const step = event.shiftKey ? 10 : 1;
      if (event.key === "ArrowLeft") updateCalibration({ x: transform.x - step });
      else if (event.key === "ArrowRight") updateCalibration({ x: transform.x + step });
      else if (event.key === "ArrowUp") updateCalibration({ y: transform.y - step });
      else if (event.key === "ArrowDown") updateCalibration({ y: transform.y + step });
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [calibrationMode, transform.x, transform.y, updateCalibration]);

  const select = <T extends string>(label: string, value: T, options: readonly T[], onChange: (next: T) => void, formatOption: (option: T) => string = (option) => option.replace("_", " ")) => (
    <label className="control-field"><span>{label}</span><select className="select-field" value={value} onChange={(event) => onChange(event.target.value as T)}>{options.map((option) => <option key={option} value={option}>{formatOption(option)}</option>)}</select></label>
  );

  return (
    <aside className="properties-panel panel">
      <div className="panel-heading"><div><span className="eyebrow">INSPECTOR</span><h2>Properties</h2></div><button className={`icon-button small${calibrationMode ? " active" : ""}`} onClick={() => setCalibrationMode(!calibrationMode)} aria-label="Calibration Mode" title="Calibration Mode">⌖</button></div>
      {selected && character ? (
        <>
          <div className="selected-object"><span className="asset-avatar large">{character.name[0]}</span><span className="asset-copy"><strong>{character.name}</strong><small>Character · Visible</small></span><span className="more-button">•••</span></div>
          {!calibrationMode ? <div className="property-group">
            <div className="property-title"><span>CHARACTER</span><Icon name="chevron" /></div>
            {select("Character", selected.characterId, Object.keys(resourceRegistry.characters), (value) => updateCharacter({ characterId: value }))}
            {select("Body Pose", selected.body, Object.keys(character.assets.body), (value) => updateCharacter({ body: value }))}
            {character.assets.face && select("Face", selected.face ?? Object.keys(character.assets.face)[0], Object.keys(character.assets.face).filter((value) => value !== "source_sheet"), (value) => updateCharacter({ face: value }))}
            {!character.assets.face && select("Face", selected.face ?? selected.eyes, faces, (value) => updateCharacter({ face: value }))}
            {select("Mouth", selected.mouth, Object.keys(character.assets.mouth), (value) => updateCharacter({ mouth: value }))}
            {character.assets.hands && select("Hands", selected.hands ?? (character.assets.hands.neutral ? "neutral" : Object.keys(character.assets.hands)[0]), Object.keys(character.assets.hands), (value) => updateCharacter({ hands: value }))}
            {character.assets.leftArm && select("Left Arm Pose", selected.leftArm ?? (character.assets.leftArm.neutral ? "neutral" : Object.keys(character.assets.leftArm)[0]), Object.keys(character.assets.leftArm), (value) => updateCharacter({ leftArm: value }))}
            {character.assets.rightArm && select("Right Arm Pose", selected.rightArm ?? (character.assets.rightArm.neutral ? "neutral" : Object.keys(character.assets.rightArm)[0]), Object.keys(character.assets.rightArm), (value) => updateCharacter({ rightArm: value }))}
          </div> : (
            <div className="property-group calibration-panel">
              <div className="property-title"><span>CHARACTER CALIBRATION</span><Icon name="chevron" /></div>
              {select("Character", selected.characterId, [selected.characterId], () => undefined)}
              {select("Layer", calibrationLayer, supportedCalibrationLayers, setCalibrationLayer, calibrationLayerLabel)}
              {(["x", "y", "scaleX", "scaleY", "rotation", "opacity"] as const).map((key) => (
                <label className="control-field" key={key}><span>{key === "rotation" ? "Rotation (°)" : key === "opacity" ? "Layer Opacity" : key}</span><input className="calibration-input" type="number" step={key === "opacity" ? 0.01 : key.startsWith("scale") ? 0.01 : 1} min={key === "opacity" ? 0 : undefined} max={key === "opacity" ? 1 : undefined} value={transform[key]} onChange={(event) => updateTransform(key, Number(event.target.value))} /></label>
              ))}
              {pivotTarget && pivot && <div className="pivot-controls">
                <div className="property-title"><span>{pivotTarget === "headGroup" ? "HEAD GROUP PIVOT" : pivotTarget === "leftArm" ? "LEFT ARM PIVOT" : pivotTarget === "rightArm" ? "RIGHT ARM PIVOT" : "HANDS PIVOT"}</span><Icon name="chevron" /></div>
                <label className="control-field"><span>Pivot X</span><input className="calibration-input" type="number" min="0" max="1" step="0.01" value={pivot.x} onChange={(event) => updatePivot(pivotTarget, { x: Number(event.target.value) })} /></label>
                <label className="control-field"><span>Pivot Y</span><input className="calibration-input" type="number" min="0" max="1" step="0.01" value={pivot.y} onChange={(event) => updatePivot(pivotTarget, { y: Number(event.target.value) })} /></label>
                <button className="select-field" onClick={() => resetPivot(pivotTarget)}>Reset Pivot</button>
              </div>}
              <div className="calibration-actions"><button className="select-field" onClick={resetCalibrationLayer}>Reset Layer</button><button className="select-field" onClick={resetAllCalibration}>Reset All</button></div>
              <div className="calibration-actions"><button className="select-field" onClick={saveCalibration}>Save Calibration</button><button className="select-field" onClick={exportCalibration}>Export</button></div>
              <button className="select-field package-calibration-button" onClick={() => void savePackageCalibration()}>Save Package Calibration</button>
              <div className="calibration-actions"><button className="select-field" onClick={() => importRef.current?.click()}>Import</button><input ref={importRef} hidden type="file" accept="application/json" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; void file.text().then((text) => importCalibration(JSON.parse(text))).catch((error: unknown) => console.error("Calibration import failed", error)); }} /></div>
              {([["showGuides", showGuides], ["showGrid", showGrid], ["showBoundingBox", showBoundingBox], ["referenceMode", referenceMode]] as const).map(([key, checked]) => <label className="calibration-toggle" key={key}><input type="checkbox" checked={checked} onChange={(event) => setCalibrationDisplay(key, event.target.checked)} />{key.replace(/([A-Z])/g, " $1")}</label>)}
            </div>
          )}
          {!calibrationMode && <div className="property-group">
            <div className="property-title"><span>TRANSFORM</span><Icon name="chevron" /></div>
            <div className="coordinate-fields">
              <label className="number-field"><span>X</span><input type="number" min="0" max="1" step="0.01" value={selected.position.x} onChange={(event) => updateCharacter({ position: { ...selected.position, x: Number(event.target.value) } })} /><small>0–1</small></label>
              <label className="number-field"><span>Y</span><input type="number" min="0" max="1" step="0.01" value={selected.position.y} onChange={(event) => updateCharacter({ position: { ...selected.position, y: Number(event.target.value) } })} /><small>0–1</small></label>
            </div>
            <label className="field-label scale-label" htmlFor="scale">Scale</label>
            <label className="number-field"><span className="scale-icon">↗</span><input id="scale" type="number" min="0.1" max="4" step="0.05" value={selected.scale} onChange={(event) => updateCharacter({ scale: Number(event.target.value) })} /><small>×</small></label>
          </div>}
          {!calibrationMode && <div className="property-group animation-qa-panel">
            <div className="property-title"><span>ANIMATION QA</span><Icon name="chevron" /></div>
            <label className="control-field"><span>Preview</span><select className="select-field" value={activePreviewId ?? ""} onChange={(event) => { const id = event.target.value || null; setPreview(id); if (character) saveSelectedPreview(character, id); }}>
              <option value="">Select preview</option>
              {previews.map((preview) => <option key={preview.id} value={preview.id}>{preview.name}</option>)}
            </select></label>
            <div className="calibration-actions">
              <button className="select-field" disabled={!activePreview} onClick={() => setPreviewPlaying(!previewPlaying)}>{previewPlaying ? "Pause" : "Play"}</button>
              <button className={`select-field${previewLoop ? " active" : ""}`} disabled={!activePreview} onClick={() => setPreviewLoop(!previewLoop)}>Loop</button>
            </div>
            <div className="calibration-actions">
              <button className="select-field" disabled={!activePreview} onClick={() => { setPreviewElapsed(0); setPreviewPlaying(false); setPreviewRunAll(false); }}>Reset Preview</button>
              <button className="select-field" disabled={!activePreview} onClick={() => { setPreviewElapsed(0); setPreviewPlaying(true); }}>Run Preview</button>
            </div>
            <button className="select-field" disabled={!previews.length} onClick={() => { setPreviewRunAll(true); setPreview(previews[0]?.id ?? null); setPreviewPlaying(true); }}>Run All Previews</button>
            <small className="inspector-tip-text">Saved per character package version. Preview motion never changes calibration.</small>
          </div>}
          <div className="inspector-tip"><Icon name="spark" /><span>Changes update the live PixiJS preview immediately.</span></div>
        </>
      ) : <div className="inspector-empty">Select an object to view its properties.</div>}
    </aside>
  );
}

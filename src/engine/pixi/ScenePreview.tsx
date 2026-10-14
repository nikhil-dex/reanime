import { useEffect, useMemo, useRef } from "react";
import { Application, Container, Graphics } from "pixi.js";
import { discoverCharacterResources, resourceRegistry } from "../../data/resourceRegistry";
import { useEditorStore } from "../../store/editorStore";
import { CharacterRenderer } from "./CharacterRenderer";
import { loadPreviews, previewRuntime } from "../../data/animationPreviews";

export function ScenePreview() {
  const hostRef = useRef<HTMLDivElement>(null);
  const scene = useEditorStore((state) => state.project.scenes.find((item) => item.id === state.activeSceneId));
  const calibration = useEditorStore((state) => state.calibration);
  const calibrationMode = useEditorStore((state) => state.calibrationMode);
  const showGrid = useEditorStore((state) => state.showGrid);
  const showGuides = useEditorStore((state) => state.showGuides);
  const showBoundingBox = useEditorStore((state) => state.showBoundingBox);
  const referenceMode = useEditorStore((state) => state.referenceMode);
  const calibrationLayer = useEditorStore((state) => state.calibrationLayer);
  const setCalibrationLayer = useEditorStore((state) => state.setCalibrationLayer);
  const updateCalibration = useEditorStore((state) => state.updateCalibration);
  const updatePivot = useEditorStore((state) => state.updatePivot);
  const previewId = useEditorStore((state) => state.previewId);
  const previewPlaying = useEditorStore((state) => state.previewPlaying);
  const previewLoop = useEditorStore((state) => state.previewLoop);
  const previewElapsed = useEditorStore((state) => state.previewElapsed);
  const setPreviewElapsed = useEditorStore((state) => state.setPreviewElapsed);
  const setPreviewPlaying = useEditorStore((state) => state.setPreviewPlaying);
  const sceneSnapshot = useMemo(() => JSON.stringify(scene), [scene]);
  const previewResource = scene?.characters.map((instance) => resourceRegistry.characters[instance.characterId]).find(Boolean);
  const preview = previewResource && previewId ? loadPreviews(previewResource).find((item) => item.id === previewId) : undefined;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let app: Application | undefined;
    let appReady = false;
    let initializationStage = "creating Pixi application";
    let cleanupResize: (() => void) | undefined;
    const initialize = async () => {
      const pixiApp = new Application();
      app = pixiApp;
      initializationStage = "initializing Pixi application";
      await pixiApp.init({ background: "#151720", antialias: true, resolution: Math.min(window.devicePixelRatio || 1, 2), autoDensity: true, width: Math.max(host.clientWidth, 1), height: Math.max(host.clientHeight, 1) });
      if (disposed) { pixiApp.destroy(true); return; }
      appReady = true;
      initializationStage = "loading character resources";
      host.appendChild(pixiApp.canvas);
      if (!Object.keys(resourceRegistry.characters).length) await discoverCharacterResources();
      if (disposed) return;
      const renderer = new CharacterRenderer();
      initializationStage = "creating scene layer";
      const sceneLayer = new Container();
      pixiApp.stage.addChild(sceneLayer);
      const redraw = async (width: number, height: number) => {
        initializationStage = "rendering scene";
        if (disposed || !pixiApp.renderer) return;
        pixiApp.renderer.resize(width, height);
        sceneLayer.removeChildren().forEach((child) => child.destroy());
        const background = new Graphics().rect(0, 0, width, height).fill({ color: 0x151720 });
        const grid = new Graphics();
        if (showGrid) for (let x = 0; x < width; x += 32) for (let y = 0; y < height; y += 32) grid.circle(x, y, 1).fill({ color: 0x272a37, alpha: 0.55 });
        sceneLayer.addChild(background, grid);
        if (calibrationMode && showGuides) {
          const guides = new Graphics().moveTo(width / 2, 0).lineTo(width / 2, height).moveTo(0, height / 2).lineTo(width, height / 2).stroke({ color: 0x9f91ff, alpha: 0.35, width: 1 });
          sceneLayer.addChild(guides);
        }
        for (const instance of scene?.characters ?? []) {
          const resource = resourceRegistry.characters[instance.characterId];
          const versionedResource = instance.packageVersion
            ? resourceRegistry.packages[`${instance.characterId}@${instance.packageVersion}`]
            : resource;
          if (versionedResource && instance.visible) {
            const runtime = preview ? previewRuntime(preview, previewElapsed) : undefined;
            const renderCalibration = calibration.characterId === versionedResource.id && calibration.packageVersion === versionedResource.packageVersion
              ? calibration
              : versionedResource.calibration;
            const figure = await renderer.render(instance, versionedResource, width, height, renderCalibration, calibrationLayer, referenceMode, calibrationMode ? setCalibrationLayer : undefined, calibrationMode ? (layer, x, y) => {
              if (layer === calibrationLayer) updateCalibration({ x: calibration.layers[layer].x + x / scaleFor(width, height, versionedResource.canvas.width, versionedResource.canvas.height), y: calibration.layers[layer].y + y / scaleFor(width, height, versionedResource.canvas.width, versionedResource.canvas.height) });
            } : undefined, runtime, calibrationMode, (target, x, y) => {
              updatePivot(target, {
                x: (calibration.pivots?.[target]?.x ?? 0.5) + x,
                y: (calibration.pivots?.[target]?.y ?? 0.5) + y,
              });
            });
            if (disposed || !pixiApp.renderer) return;
            if (calibrationMode && showBoundingBox) {
              figure.addChild(new Graphics().rect(
                -versionedResource.canvas.width / 2,
                -versionedResource.canvas.height / 2,
                versionedResource.canvas.width,
                versionedResource.canvas.height,
              ).stroke({ color: 0xf19c9c, alpha: 0.5, width: 2 }));
            }
            sceneLayer.addChild(figure);
          }
        }
      };
      await redraw(host.clientWidth, host.clientHeight);
      let frame = 0;
      let last = performance.now();
      const animate = (now: number) => {
        if (disposed || !previewPlaying || !preview) return;
        const next = previewElapsed + now - last;
        last = now;
        if (next >= preview.duration) {
          if (previewLoop) setPreviewElapsed(next % preview.duration);
          else {
            setPreviewElapsed(preview.duration);
            setPreviewPlaying(false);
          }
        } else setPreviewElapsed(next);
        frame = requestAnimationFrame(animate);
      };
      if (previewPlaying) frame = requestAnimationFrame(animate);
      const observer = new ResizeObserver(([entry]) => { if (entry) void redraw(entry.contentRect.width, entry.contentRect.height); });
      observer.observe(host);
      cleanupResize = () => { observer.disconnect(); cancelAnimationFrame(frame); };
    };
    void initialize().catch((error: unknown) => {
      if (!disposed) {
        const selectedCharacters = (scene?.characters ?? []).map((instance) => {
          const resource = resourceRegistry.characters[instance.characterId];
          const versionedResource = instance.packageVersion
            ? resourceRegistry.packages[`${instance.characterId}@${instance.packageVersion}`]
            : undefined;
          return {
            id: instance.characterId,
            packagePath: resource?.packageRoot ?? versionedResource?.packageRoot,
            packageVersion: instance.packageVersion,
          };
        });
        console.error("PixiJS preview failed to initialize", {
          error,
          stack: error instanceof Error ? error.stack : undefined,
          initializationStage,
          selectedCharacters,
        });
        host.textContent = "Preview could not be initialized.";
      }
    });
    return () => { disposed = true; cleanupResize?.(); if (app && appReady) app.destroy(true, { children: true }); };
  }, [sceneSnapshot, scene, calibration, calibrationMode, calibrationLayer, referenceMode, showGrid, showGuides, showBoundingBox, setCalibrationLayer, updateCalibration, updatePivot, preview, previewPlaying, previewLoop, previewElapsed, setPreviewElapsed, setPreviewPlaying]);

  return <div className="pixi-host" ref={hostRef} aria-label="PixiJS scene preview" />;
}

function scaleFor(width: number, height: number, canvasWidth: number, canvasHeight: number): number {
  return Math.min(width / canvasWidth, height / canvasHeight);
}

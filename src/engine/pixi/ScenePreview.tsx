import { useEffect, useMemo, useRef } from "react";
import { Application, Container, Graphics } from "pixi.js";
import { loadSubaruResource, resourceRegistry } from "../../data/resourceRegistry";
import { useEditorStore } from "../../store/editorStore";
import { CharacterRenderer } from "./CharacterRenderer";

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
  const sceneSnapshot = useMemo(() => JSON.stringify(scene), [scene]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let app: Application | undefined;
    let appReady = false;
    let cleanupResize: (() => void) | undefined;
    const initialize = async () => {
      const pixiApp = new Application();
      app = pixiApp;
      await pixiApp.init({ background: "#151720", antialias: true, resolution: Math.min(window.devicePixelRatio || 1, 2), autoDensity: true, width: Math.max(host.clientWidth, 1), height: Math.max(host.clientHeight, 1) });
      if (disposed) { pixiApp.destroy(true); return; }
      appReady = true;
      host.appendChild(pixiApp.canvas);
      await loadSubaruResource();
      if (disposed) return;
      const renderer = new CharacterRenderer();
      const sceneLayer = new Container();
      pixiApp.stage.addChild(sceneLayer);
      const redraw = async (width: number, height: number) => {
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
          if (resource && instance.visible) {
            const figure = await renderer.render(instance, resource, width, height, calibration, calibrationLayer, referenceMode, calibrationMode ? setCalibrationLayer : undefined, calibrationMode ? (layer, x, y) => {
              if (layer === calibrationLayer) updateCalibration({ x: calibration.layers[layer].x + x / scaleFor(width, height, resource.canvas.width, resource.canvas.height), y: calibration.layers[layer].y + y / scaleFor(width, height, resource.canvas.width, resource.canvas.height) });
            } : undefined);
            if (calibrationMode && showBoundingBox) {
              figure.addChild(new Graphics().rect(-512, -512, 1024, 1024).stroke({ color: 0xf19c9c, alpha: 0.5, width: 2 }));
            }
            sceneLayer.addChild(figure);
          }
        }
      };
      await redraw(host.clientWidth, host.clientHeight);
      const observer = new ResizeObserver(([entry]) => { if (entry) void redraw(entry.contentRect.width, entry.contentRect.height); });
      observer.observe(host);
      cleanupResize = () => observer.disconnect();
    };
    void initialize().catch((error: unknown) => { if (!disposed) { console.error("PixiJS preview failed to initialize", error); host.textContent = "Preview could not be initialized."; } });
    return () => { disposed = true; cleanupResize?.(); if (app && appReady) app.destroy(true, { children: true }); };
  }, [sceneSnapshot, scene, calibration, calibrationMode, calibrationLayer, referenceMode, showGrid, showGuides, showBoundingBox, setCalibrationLayer, updateCalibration]);

  return <div className="pixi-host" ref={hostRef} aria-label="PixiJS scene preview" />;
}

function scaleFor(width: number, height: number, canvasWidth: number, canvasHeight: number): number {
  return Math.min(width / canvasWidth, height / canvasHeight);
}

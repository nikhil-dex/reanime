import { useEffect, useMemo, useRef } from "react";
import { Application, Container, Graphics } from "pixi.js";
import { resourceRegistry } from "../../data/resourceRegistry";
import { useEditorStore } from "../../store/editorStore";
import { CharacterRenderer } from "./CharacterRenderer";

export function ScenePreview() {
  const hostRef = useRef<HTMLDivElement>(null);
  const scene = useEditorStore((state) => state.project.scenes.find((item) => item.id === state.activeSceneId));
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
      const renderer = new CharacterRenderer();
      const sceneLayer = new Container();
      pixiApp.stage.addChild(sceneLayer);
      const redraw = (width: number, height: number) => {
        pixiApp.renderer.resize(width, height);
        sceneLayer.removeChildren().forEach((child) => child.destroy());
        const background = new Graphics().rect(0, 0, width, height).fill({ color: 0x151720 });
        const grid = new Graphics();
        for (let x = 0; x < width; x += 32) for (let y = 0; y < height; y += 32) grid.circle(x, y, 1).fill({ color: 0x272a37, alpha: 0.55 });
        sceneLayer.addChild(background, grid);
        for (const instance of scene?.characters ?? []) {
          const resource = resourceRegistry.characters[instance.characterId];
          if (resource && instance.visible) sceneLayer.addChild(renderer.render(instance, resource, width, height));
        }
      };
      redraw(host.clientWidth, host.clientHeight);
      const observer = new ResizeObserver(([entry]) => { if (entry) redraw(entry.contentRect.width, entry.contentRect.height); });
      observer.observe(host);
      cleanupResize = () => observer.disconnect();
    };
    void initialize().catch((error: unknown) => { if (!disposed) { console.error("PixiJS preview failed to initialize", error); host.textContent = "Preview could not be initialized."; } });
    return () => { disposed = true; cleanupResize?.(); if (app && appReady) app.destroy(true, { children: true }); };
  }, [sceneSnapshot, scene]);

  return <div className="pixi-host" ref={hostRef} aria-label="PixiJS scene preview" />;
}

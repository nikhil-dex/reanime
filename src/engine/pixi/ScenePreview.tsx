import { useEffect, useRef } from "react";
import { Application, Container, Graphics } from "pixi.js";
import { sampleScene } from "../../data/sampleScene";

export function ScenePreview() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    let app: Application | undefined;
    let appReady = false;

    const initialize = async () => {
      const pixiApp = new Application();
      app = pixiApp;
      await pixiApp.init({
        background: "#151720",
        antialias: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        autoDensity: true,
        width: Math.max(host.clientWidth, 1),
        height: Math.max(host.clientHeight, 1),
      });
      if (disposed) {
        pixiApp.destroy(true);
        return;
      }
      appReady = true;
      host.appendChild(pixiApp.canvas);

      const character = new Container();
      pixiApp.stage.addChild(character);

      const redraw = (width: number, height: number) => {
        pixiApp.renderer.resize(width, height);
        character.removeChildren().forEach((child) => child.destroy());

        const background = new Graphics()
          .rect(0, 0, width, height)
          .fill({ color: 0x151720 });
        const grid = new Graphics();
        for (let x = 0; x < width; x += 32) {
          for (let y = 0; y < height; y += 32) {
            grid.circle(x, y, 1).fill({ color: 0x272a37, alpha: 0.55 });
          }
        }
        character.addChild(background, grid);

        const instance = sampleScene.characters[0];
        if (!instance?.visible) return;
        const centerX = width * instance.position.x;
        const centerY = height * instance.position.y;
        const unit = Math.min(width / 660, height / 400) * instance.scale;
        const figure = new Container();
        figure.position.set(centerX, centerY);
        figure.scale.set(unit);

        figure.addChild(
          new Graphics()
            .ellipse(0, 119, 70, 10)
            .fill({ color: 0x08090d, alpha: 0.34 }),
          new Graphics()
            .roundRect(-76, 31, 152, 96, 42)
            .fill({ color: 0x8170db })
            .roundRect(-76, 31, 152, 96, 42)
            .stroke({ color: 0xa89cf0, width: 2 }),
          new Graphics()
            .roundRect(-49, 63, 98, 65, 28)
            .fill({ color: 0x9a8af2 }),
          new Graphics()
            .ellipse(0, -9, 63, 70)
            .fill({ color: 0xf2c8ac })
            .stroke({ color: 0xffddc7, width: 2 }),
          new Graphics()
            .ellipse(0, -49, 65, 37)
            .fill({ color: 0x382c45 })
            .ellipse(-52, -31, 16, 34)
            .fill({ color: 0x382c45 })
            .ellipse(52, -31, 16, 34)
            .fill({ color: 0x382c45 }),
          new Graphics()
            .ellipse(-22, -7, 4, 6)
            .fill({ color: 0x302438 })
            .ellipse(22, -7, 4, 6)
            .fill({ color: 0x302438 })
            .moveTo(-7, 16)
            .quadraticCurveTo(0, 21, 7, 16)
            .stroke({ color: 0xa45e68, width: 2 }),
        );
        character.addChild(figure);
      };

      redraw(host.clientWidth, host.clientHeight);
      const observer = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (entry) redraw(entry.contentRect.width, entry.contentRect.height);
      });
      observer.observe(host);

      return () => observer.disconnect();
    };

    let stopObserving: (() => void) | undefined;
    void initialize().then((cleanup) => {
      stopObserving = cleanup;
    }).catch((error: unknown) => {
      if (!disposed) {
        console.error("PixiJS preview failed to initialize", error);
        host.textContent = "Preview could not be initialized.";
      }
    });

    return () => {
      disposed = true;
      stopObserving?.();
      if (app && appReady) {
        app.destroy(true, { children: true });
      }
    };
  }, []);

  return <div className="pixi-host" ref={hostRef} aria-label="PixiJS scene preview" />;
}

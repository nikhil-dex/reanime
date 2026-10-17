import { Application, Assets, Container, Graphics, Sprite, Text } from "pixi.js";
import type { Scene, TimelineClip } from "../../types/project";
import { resourceRegistry } from "../../data/resourceRegistry";
import { CharacterRenderer } from "../pixi/CharacterRenderer";

export interface RenderFrameOptions {
  width: number;
  height: number;
  backgroundColor?: number;
}

export class DeterministicSceneRenderer {
  private app: Application | null = null;
  private readonly stage = new Container();
  private readonly characterRenderer = new CharacterRenderer();
  private readonly options: RenderFrameOptions;

  constructor(options: RenderFrameOptions) {
    if (!Number.isInteger(options.width) || options.width < 1
      || !Number.isInteger(options.height) || options.height < 1) {
      throw new Error("Export width and height must be positive integers.");
    }
    this.options = { backgroundColor: 0x151720, ...options };
  }

  async initialize(): Promise<void> {
    if (this.app) return;
    const app = new Application();
    await app.init({
      width: this.options.width,
      height: this.options.height,
      resolution: 1,
      autoDensity: false,
      antialias: true,
      background: this.options.backgroundColor,
      preference: "webgl",
    });
    this.app = app;
    app.stage.addChild(this.stage);
  }

  async renderScene(scene: Scene, activeEffects: TimelineClip[] = [], activeSubtitles: TimelineClip[] = []): Promise<Blob> {
    if (!this.app) throw new Error("Export renderer is not initialized.");
    const app = this.app;
    this.stage.removeChildren().forEach((child) => child.destroy({ children: true }));
    this.stage.addChild(new Graphics()
      .rect(0, 0, this.options.width, this.options.height)
      .fill({ color: this.options.backgroundColor ?? 0x151720 }));

    const backgroundPath = resourceRegistry.backgrounds[scene.background];
    if (backgroundPath) {
      const texture = await Assets.load(backgroundPath);
      const background = new Sprite(texture);
      background.anchor.set(0.5);
      background.position.set(this.options.width / 2, this.options.height / 2);
      background.scale.set(Math.max(this.options.width / texture.width, this.options.height / texture.height));
      this.stage.addChildAt(background, 1);
    }

    const orderedCharacters = [...scene.characters]
      .filter((character) => character.visible)
      .sort((left, right) => left.layer - right.layer);

    for (const instance of orderedCharacters) {
      const resource = instance.packageVersion
        ? resourceRegistry.packages[`${instance.characterId}@${instance.packageVersion}`]
          ?? resourceRegistry.characters[instance.characterId]
        : resourceRegistry.characters[instance.characterId];
      if (!resource) {
        throw new Error(`Character resource '${instance.characterId}' is not available for export.`);
      }
      const figure = await this.characterRenderer.render(
        instance, resource, this.options.width, this.options.height, resource.calibration,
      );
      this.stage.addChild(figure);
    }

    for (const clip of activeEffects) {
      if (!clip.resourceId) continue;
      const path = resourceRegistry.effects[clip.resourceId];
      if (!path) {
        throw new Error(`Effect resource '${clip.resourceId}' is not available for export.`);
      }
      const texture = await Assets.load(path);
      const effect = new Sprite(texture);
      effect.anchor.set(0.5);
      const properties = clip.properties ?? {};
      const x = typeof properties.x === "number" ? properties.x : 0.5;
      const y = typeof properties.y === "number" ? properties.y : 0.5;
      const scale = typeof properties.scale === "number" ? properties.scale : 1;
      const opacity = typeof properties.opacity === "number" ? properties.opacity : 1;
      effect.position.set(x <= 1 ? x * this.options.width : x, y <= 1 ? y * this.options.height : y);
      effect.scale.set(scale);
      effect.alpha = Math.min(1, Math.max(0, opacity));
      this.stage.addChild(effect);
    }

    for (const clip of activeSubtitles) {
      const properties = clip.properties ?? {};
      const content = typeof properties.text === "string" ? properties.text : "";
      if (!content.trim()) continue;
      const fontSize = typeof properties.fontSize === "number" && properties.fontSize > 0
        ? Math.min(256, properties.fontSize)
        : 48;
      const color = typeof properties.color === "string" ? properties.color : "#ffffff";
      const x = typeof properties.x === "number" ? properties.x : 0.5;
      const y = typeof properties.y === "number" ? properties.y : 0.88;
      const anchorX = typeof properties.anchorX === "number" ? properties.anchorX : 0.5;
      const text = new Text({
        text: content,
        style: {
          fontFamily: "Arial, sans-serif",
          fontSize,
          fill: color,
          fontWeight: "bold",
          align: "center",
          wordWrap: true,
          wordWrapWidth: this.options.width * 0.9,
          stroke: { color: "#000000", width: Math.max(2, fontSize * 0.08) },
        },
      });
      text.anchor.set(Math.min(1, Math.max(0, anchorX)), 0.5);
      text.position.set(x <= 1 ? x * this.options.width : x, y <= 1 ? y * this.options.height : y);
      this.stage.addChild(text);
    }

    app.renderer.render({ container: this.stage });
    // Export the fixed-size renderer canvas, not extracted stage bounds. Character sprites can extend beyond the project frame.
    const canvas = app.canvas;
    const convertToBlob = "convertToBlob" in canvas && typeof canvas.convertToBlob === "function"
      ? canvas.convertToBlob.bind(canvas)
      : undefined;
    if (convertToBlob) return convertToBlob({ type: "image/png" });

    const toBlob = "toBlob" in canvas && typeof canvas.toBlob === "function"
      ? canvas.toBlob.bind(canvas)
      : undefined;
    if (toBlob) {
      return new Promise<Blob>((resolve, reject) => {
        toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error("PixiJS could not encode the rendered frame as PNG."));
        }, "image/png");
      });
    }
    throw new Error("The current canvas implementation cannot encode PNG frames.");
  }

  destroy(): void {
    if (!this.app) return;
    this.stage.removeChildren().forEach((child) => child.destroy({ children: true }));
    this.app.destroy(true);
    this.app = null;
  }
}

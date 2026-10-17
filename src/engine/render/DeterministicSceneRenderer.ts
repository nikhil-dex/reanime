import { Application, Assets, Container, Graphics, Sprite } from "pixi.js";
import type { Scene } from "../../types/project";
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

  async renderScene(scene: Scene): Promise<Blob> {
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

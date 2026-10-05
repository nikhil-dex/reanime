import { Assets, Container, Sprite } from "pixi.js";
import type { CharacterInstance, CharacterResource } from "../../types/project";
import type { CalibrationLayer, CharacterCalibration } from "../../types/project";

export class CharacterRenderer {
  async render(instance: CharacterInstance, resource: CharacterResource, width: number, height: number, calibration: CharacterCalibration, selectedLayer?: CalibrationLayer, referenceMode = false, onLayerSelect?: (layer: CalibrationLayer) => void, onLayerDrag?: (layer: CalibrationLayer, x: number, y: number) => void): Promise<Container> {
    const figure = new Container();
    const scale = Math.min(width / resource.canvas.width, height / resource.canvas.height) * instance.scale;
    figure.position.set(width * instance.position.x, height * instance.position.y);
    figure.scale.set(scale);

    const face = instance.face ?? instance.eyes;
    let layers: { name: CalibrationLayer; path: string }[];
    if (resource.assets.face) {
      layers = [
        { name: "body", path: resource.assets.body[instance.body] },
        { name: "head", path: resource.assets.head },
        { name: "face", path: resource.assets.face[face] },
        { name: "mouth", path: resource.assets.mouth[instance.mouth] },
      ];
    } else {
      if (!resource.assets.eyes || !resource.assets.eyebrows) throw new Error(`Character resource '${resource.id}' has no face or legacy eye assets.`);
      layers = [
        { name: "body", path: resource.assets.body[instance.body] },
        { name: "head", path: resource.assets.head },
        { name: "eyes", path: resource.assets.eyes[instance.eyes] },
        { name: "eyebrows", path: resource.assets.eyebrows[instance.eyebrows] },
        { name: "mouth", path: resource.assets.mouth[instance.mouth] },
      ];
    }
    if (!resource.assets.face && resource.assets.hair && resource.supportedLayers.includes("hair")) {
      layers.splice(2, 0, { name: "hair", path: resource.assets.hair });
    }
    const texturePaths = layers.map((layer) => layer.path);
    const textures = await Promise.all(texturePaths.map((path) => Assets.load(path)));
    for (const [index, texture] of textures.entries()) {
      const layerDefinition = layers[index];
      if (!layerDefinition) continue;
      const sprite = new Sprite(texture);
      const transform = calibration.layers[layerDefinition.name];
      sprite.anchor.set(0.5);
      sprite.position.set(transform.x, transform.y);
      sprite.scale.set(transform.scaleX, transform.scaleY);
      sprite.rotation = transform.rotation * Math.PI / 180;
      sprite.alpha = transform.opacity * (referenceMode && layerDefinition.name === selectedLayer ? 0.5 : 1);
      sprite.eventMode = "static";
      sprite.cursor = "pointer";
      sprite.on("pointertap", () => onLayerSelect?.(layerDefinition.name));
      let previousPointer: { x: number; y: number } | undefined;
      sprite.on("pointerdown", (event) => { previousPointer = { x: event.global.x, y: event.global.y }; });
      sprite.on("pointermove", (event) => {
        if (!previousPointer) return;
        onLayerDrag?.(layerDefinition.name, event.global.x - previousPointer.x, event.global.y - previousPointer.y);
        previousPointer = { x: event.global.x, y: event.global.y };
      });
      sprite.on("pointerup", () => { previousPointer = undefined; });
      sprite.on("pointerupoutside", () => { previousPointer = undefined; });
      figure.addChild(sprite);
    }
    return figure;
  }
}

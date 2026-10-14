import { Assets, Container, Graphics, Sprite } from "pixi.js";
import type { CharacterInstance, CharacterResource } from "../../types/project";
import type { CalibrationLayer, CharacterCalibration } from "../../types/project";
import type { PreviewRuntime } from "../../data/animationPreviews";

export class CharacterRenderer {
  async render(
    instance: CharacterInstance,
    resource: CharacterResource,
    width: number,
    height: number,
    calibration: CharacterCalibration,
    selectedLayer?: CalibrationLayer,
    referenceMode = false,
    onLayerSelect?: (layer: CalibrationLayer) => void,
    onLayerDrag?: (layer: CalibrationLayer, x: number, y: number) => void,
    preview?: PreviewRuntime,
    showPivotMarkers = false,
    onPivotDrag?: (target: "headGroup", x: number, y: number) => void,
  ): Promise<Container> {
    const figure = new Container();
    const scale = Math.min(width / resource.canvas.width, height / resource.canvas.height) * instance.scale;
    figure.position.set(width * instance.position.x, height * instance.position.y);
    figure.scale.set(scale);

    const pivot = calibration.pivots?.headGroup ?? { x: 0.5, y: 0.5 };
    const pivotPoint = {
      x: pivot.x * resource.canvas.width - resource.canvas.width / 2,
      y: pivot.y * resource.canvas.height - resource.canvas.height / 2,
    };
    const headGroup = new Container();
    headGroup.pivot.set(pivotPoint.x, pivotPoint.y);
    headGroup.position.set(pivotPoint.x, pivotPoint.y);
    const headGroupTransform = calibration.layers.headGroup;
    headGroup.position.set(pivotPoint.x + headGroupTransform.x, pivotPoint.y + headGroupTransform.y);
    headGroup.scale.set(headGroupTransform.scaleX, headGroupTransform.scaleY);
    headGroup.rotation = (headGroupTransform.rotation + (preview?.headGroupRotation ?? 0)) * Math.PI / 180;
    headGroup.alpha = headGroupTransform.opacity
      * (referenceMode && selectedLayer === "headGroup" ? 0.5 : 1);

    if (showPivotMarkers) {
      const marker = new Graphics()
        .circle(pivotPoint.x, pivotPoint.y, 7).fill({ color: 0xffc857, alpha: 0.9 })
        .circle(pivotPoint.x, pivotPoint.y, 11).stroke({ color: 0xfff0a6, width: 2 });
      marker.eventMode = "static";
      marker.cursor = "crosshair";
      let previous: { x: number; y: number } | undefined;
      marker.on("pointerdown", (event) => { previous = { x: event.global.x, y: event.global.y }; });
      marker.on("pointermove", (event) => {
        if (!previous) return;
        onPivotDrag?.(
          "headGroup",
          (event.global.x - previous.x) / figure.scale.x / resource.canvas.width,
          (event.global.y - previous.y) / figure.scale.y / resource.canvas.height,
        );
        previous = { x: event.global.x, y: event.global.y };
      });
      marker.on("pointerup", () => { previous = undefined; });
      marker.on("pointerupoutside", () => { previous = undefined; });
      figure.addChild(marker);
    }

    const faceState = preview?.face ?? instance.face;
    const mouthState = preview?.mouth ?? instance.mouth;
    const bodyPath = resource.assets.body[instance.body];
    const facePath = resource.assets.face[faceState];
    const mouthPath = resource.assets.mouth[mouthState];
    if (!bodyPath || !facePath || !mouthPath) {
      throw new Error(`Character '${resource.name}' is missing a selected canonical body, face, or mouth state.`);
    }

    const definitions: { name: CalibrationLayer; path: string }[] = [
      { name: "body", path: bodyPath },
      { name: "head", path: resource.assets.head },
      { name: "face", path: facePath },
      { name: "mouth", path: mouthPath },
    ];
    const textures = await Promise.all(definitions.map(({ path }) => Assets.load(path)));
    for (const [index, definition] of definitions.entries()) {
      const transform = calibration.layers[definition.name];
      const sprite = new Sprite(textures[index]);
      sprite.anchor.set(0.5);
      sprite.position.set(transform.x, transform.y);
      sprite.scale.set(transform.scaleX, transform.scaleY);
      sprite.rotation = transform.rotation * Math.PI / 180;
      sprite.alpha = transform.opacity
        * (referenceMode && definition.name === selectedLayer ? 0.5 : 1);
      sprite.eventMode = "static";
      sprite.cursor = "pointer";
      sprite.on("pointertap", () => onLayerSelect?.(definition.name));
      let previousPointer: { x: number; y: number } | undefined;
      sprite.on("pointerdown", (event) => { previousPointer = { x: event.global.x, y: event.global.y }; });
      sprite.on("pointermove", (event) => {
        if (!previousPointer) return;
        onLayerDrag?.(definition.name, event.global.x - previousPointer.x, event.global.y - previousPointer.y);
        previousPointer = { x: event.global.x, y: event.global.y };
      });
      sprite.on("pointerup", () => { previousPointer = undefined; });
      sprite.on("pointerupoutside", () => { previousPointer = undefined; });
      if (definition.name === "body") figure.addChild(sprite);
      else headGroup.addChild(sprite);
    }
    figure.addChild(headGroup);
    return figure;
  }
}

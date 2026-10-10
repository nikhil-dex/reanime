import { Assets, Container, Graphics, Sprite } from "pixi.js";
import type { CharacterInstance, CharacterResource } from "../../types/project";
import type { CalibrationLayer, CharacterCalibration } from "../../types/project";
import type { PreviewRuntime } from "../../data/animationPreviews";

const visiblePixelsCache = new Map<string, Promise<boolean>>();

async function hasVisiblePixels(path: string): Promise<boolean> {
  const cached = visiblePixelsCache.get(path);
  if (cached) return cached;
  const result = (async () => {
  try {
    const response = await fetch(path);
    if (!response.ok || typeof createImageBitmap !== "function") return true;
    const bitmap = await createImageBitmap(await response.blob());
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close();
      return true;
    }
    context.drawImage(bitmap, 0, 0);
    const alpha = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
    bitmap.close();
    for (let index = 3; index < alpha.length; index += 4) {
      if (alpha[index] !== 0) return true;
    }
    return false;
  } catch {
    return true;
  }
  })();
  visiblePixelsCache.set(path, result);
  return result;
}

export class CharacterRenderer {
  async render(instance: CharacterInstance, resource: CharacterResource, width: number, height: number, calibration: CharacterCalibration, selectedLayer?: CalibrationLayer, referenceMode = false, onLayerSelect?: (layer: CalibrationLayer) => void, onLayerDrag?: (layer: CalibrationLayer, x: number, y: number) => void, preview?: PreviewRuntime, showPivotMarkers = false, onPivotDrag?: (target: "headGroup" | "hands" | "leftArm" | "rightArm", x: number, y: number) => void): Promise<Container> {
    const figure = new Container();
    const scale = Math.min(width / resource.canvas.width, height / resource.canvas.height) * instance.scale;
    figure.position.set(width * instance.position.x, height * instance.position.y);
    figure.scale.set(scale);
    const headGroup = new Container();
    const canvasPivot = (target: "headGroup" | "hands" | "leftArm" | "rightArm") => {
      const pivot = calibration.pivots?.[target] ?? { x: 0.5, y: 0.5 };
      return { x: pivot.x * resource.canvas.width - resource.canvas.width / 2, y: pivot.y * resource.canvas.height - resource.canvas.height / 2 };
    };
    const headPivot = canvasPivot("headGroup");
    const addPivotMarker = (target: "headGroup" | "hands" | "leftArm" | "rightArm", point: { x: number; y: number }) => {
      if (!showPivotMarkers) return;
      const marker = new Graphics().circle(point.x, point.y, 7).fill({ color: 0xffc857, alpha: 0.9 }).circle(point.x, point.y, 11).stroke({ color: 0xfff0a6, width: 2 });
      marker.eventMode = "static";
      marker.cursor = "crosshair";
      let previous: { x: number; y: number } | undefined;
      marker.on("pointerdown", (event) => { previous = { x: event.global.x, y: event.global.y }; });
      marker.on("pointermove", (event) => {
        if (!previous) return;
        onPivotDrag?.(target, (event.global.x - previous.x) / figure.scale.x / resource.canvas.width, (event.global.y - previous.y) / figure.scale.y / resource.canvas.height);
        previous = { x: event.global.x, y: event.global.y };
      });
      marker.on("pointerup", () => { previous = undefined; });
      marker.on("pointerupoutside", () => { previous = undefined; });
      figure.addChild(marker);
    };
    addPivotMarker("headGroup", headPivot);

    const face = preview?.face ?? instance.face ?? instance.eyes;
    let layers: { name: CalibrationLayer; path: string }[];
    if (resource.assets.face) {
      layers = [
        { name: "body", path: resource.assets.body[instance.body] },
        { name: "head", path: resource.assets.head },
        { name: "face", path: resource.assets.face[face] },
        { name: "mouth", path: resource.assets.mouth[preview?.mouth ?? instance.mouth] },
      ];
    } else {
      if (!resource.assets.eyes || !resource.assets.eyebrows) throw new Error(`Character resource '${resource.id}' has no face or legacy eye assets.`);
      layers = [
        { name: "body", path: resource.assets.body[instance.body] },
        { name: "head", path: resource.assets.head },
        { name: "eyes", path: resource.assets.eyes[instance.eyes] },
        { name: "eyebrows", path: resource.assets.eyebrows[instance.eyebrows] },
        { name: "mouth", path: resource.assets.mouth[preview?.mouth ?? instance.mouth] },
      ];
    }
    if (!resource.assets.face && resource.assets.hair && resource.supportedLayers.includes("hair")) {
      layers.splice(2, 0, { name: "hair", path: resource.assets.hair });
    }
    const armLayers: { name: "leftArm" | "rightArm"; path: string }[] = [];
    if (resource.assets.hands) {
      const requestedHands = preview?.hands ?? instance.hands;
      const handPose = requestedHands && resource.assets.hands[requestedHands]
        ? requestedHands
        : resource.assets.hands.neutral
          ? "neutral"
          : Object.keys(resource.assets.hands)[0];
      const handPath = handPose ? resource.assets.hands[handPose] : undefined;
      if (handPath) {
        const handsLayer = { name: "hands" as const, path: handPath };
        const architecture = Array.isArray(resource.manifest.renderer_architecture)
          ? resource.manifest.renderer_architecture.map((layer) => String(layer).toLowerCase().split(" ")[0])
          : [];
        const handsIndex = architecture.indexOf("hands");
        if (handsIndex >= 0) {
          const insertBefore = layers.findIndex((layer) => architecture.indexOf(layer.name) >= handsIndex);
          layers.splice(insertBefore >= 0 ? insertBefore : layers.length, 0, handsLayer);
        } else {
          layers.push(handsLayer);
        }
      }
    }
    for (const [name, assets, requested] of [
      ["leftArm", resource.assets.leftArm, preview?.leftArm ?? instance.leftArm],
      ["rightArm", resource.assets.rightArm, preview?.rightArm ?? instance.rightArm],
    ] as const) {
      if (!assets) continue;
      let pose = requested && assets[requested] ? requested : undefined;
      if (!pose || pose === "neutral") {
        const neutralPath = assets.neutral;
        if (neutralPath && await hasVisiblePixels(neutralPath)) pose = "neutral";
        else {
          const fallback = Object.entries(assets).find(([candidate]) => candidate !== "neutral");
          pose = fallback?.[0];
        }
      }
      if (pose && assets[pose]) armLayers.push({ name, path: assets[pose] });
    }
    const createSprite = (layerDefinition: { name: CalibrationLayer; path: string }, texture: Awaited<ReturnType<typeof Assets.load>>, applyTransform = true) => {
      const sprite = new Sprite(texture);
      const transform = applyTransform ? calibration.layers[layerDefinition.name] : undefined;
      sprite.anchor.set(0.5);
      if (transform) {
        sprite.position.set(transform.x, transform.y);
        sprite.scale.set(transform.scaleX, transform.scaleY);
        sprite.rotation = transform.rotation * Math.PI / 180;
        sprite.alpha = transform.opacity * (referenceMode && layerDefinition.name === selectedLayer ? 0.5 : 1);
      }
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
      return sprite;
    };
    const textures = await Promise.all([...layers, ...armLayers].map(({ path }) => Assets.load(path)));
    const sprites = layers.map((layer, index) => createSprite(layer, textures[index], layer.name !== "head"));
    const armSprites = armLayers.map((layer, index) => createSprite(layer, textures[layers.length + index], false));
    const bodySprite = layers
      .map((layer, index) => ({ layer, sprite: sprites[index] }))
      .find(({ layer }) => layer.name === "body")?.sprite;
    const handsSprite = layers
      .map((layer, index) => ({ layer, sprite: sprites[index] }))
      .find(({ layer }) => layer.name === "hands")?.sprite;
    if (bodySprite) figure.addChild(bodySprite);
    layers.forEach((layer, index) => {
      if (layer.name !== "body" && layer.name !== "hands") headGroup.addChild(sprites[index]);
    });
    figure.addChild(headGroup);
    const headTransform = calibration.layers.head;
    headGroup.pivot.set(headPivot.x, headPivot.y);
    headGroup.position.set(headPivot.x + headTransform.x, headPivot.y + headTransform.y);
    headGroup.scale.set(headTransform.scaleX, headTransform.scaleY);
    headGroup.rotation = (headTransform.rotation + (preview?.headGroupRotation ?? 0)) * Math.PI / 180;
    headGroup.alpha = headTransform.opacity * (referenceMode && selectedLayer === "head" ? 0.5 : 1);
    if (handsSprite) {
      const handsGroup = new Container();
      const handsPivot = canvasPivot("hands");
      const handsTransform = calibration.layers.hands;
      handsGroup.pivot.set(handsPivot.x, handsPivot.y);
      handsGroup.position.set(handsPivot.x + handsTransform.x, handsPivot.y + handsTransform.y);
      handsGroup.scale.set(handsTransform.scaleX, handsTransform.scaleY);
      handsGroup.rotation = handsTransform.rotation * Math.PI / 180;
      handsGroup.alpha = handsTransform.opacity * (referenceMode && selectedLayer === "hands" ? 0.5 : 1);
      handsGroup.addChild(handsSprite);
      figure.addChild(handsGroup);
      addPivotMarker("hands", handsPivot);
    }
    for (const [index, layer] of armLayers.entries()) {
      const group = new Container();
      const pivot = canvasPivot(layer.name);
      const transform = calibration.layers[layer.name];
      group.pivot.set(pivot.x, pivot.y);
      group.position.set(pivot.x + transform.x, pivot.y + transform.y);
      group.scale.set(transform.scaleX, transform.scaleY);
      group.rotation = transform.rotation * Math.PI / 180;
      group.alpha = transform.opacity * (referenceMode && selectedLayer === layer.name ? 0.5 : 1);
      group.addChild(armSprites[index]);
      figure.addChild(group);
      addPivotMarker(layer.name, pivot);
    }
    return figure;
  }
}

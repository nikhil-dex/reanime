import { Container, Graphics } from "pixi.js";
import type { CharacterInstance, CharacterResource } from "../../types/project";

export class CharacterRenderer {
  render(instance: CharacterInstance, resource: CharacterResource, width: number, height: number): Container {
    const unit = Math.min(width / 660, height / 400) * instance.scale;
    const figure = new Container();
    figure.position.set(width * instance.position.x, height * instance.position.y);
    figure.scale.set(unit);

    const body = new Graphics().roundRect(-76, 31, 152, 96, 42).fill({ color: resource.palette.body }).stroke({ color: resource.palette.accent, width: 2 });
    const head = new Graphics().ellipse(0, -9, 63, 70).fill({ color: resource.palette.head }).stroke({ color: resource.palette.accent, width: 2 });
    const hair = new Graphics().ellipse(0, -49, 65, 37).fill({ color: resource.palette.hair })
      .ellipse(-52, -31, 16, 34).fill({ color: resource.palette.hair })
      .ellipse(52, -31, 16, 34).fill({ color: resource.palette.hair });
    const eyes = new Graphics();
    if (instance.eyes === "closed") {
      eyes.moveTo(-27, -8).quadraticCurveTo(-22, -3, -17, -8).stroke({ color: resource.palette.hair, width: 3 })
        .moveTo(17, -8).quadraticCurveTo(22, -3, 27, -8).stroke({ color: resource.palette.hair, width: 3 });
    } else {
      const eyeHeight = instance.eyes === "wide" ? 9 : 6;
      eyes.ellipse(-22, -7, 4, eyeHeight).fill({ color: resource.palette.hair })
        .ellipse(22, -7, 4, eyeHeight).fill({ color: resource.palette.hair });
    }
    const eyebrows = new Graphics();
    const browY = instance.eyebrows === "raised" ? -22 : -19;
    const browTilt = instance.eyebrows === "angry" ? 4 : instance.eyebrows === "sad" ? -4 : 0;
    eyebrows.moveTo(-30, browY + browTilt).lineTo(-14, browY - browTilt).stroke({ color: resource.palette.hair, width: 3 })
      .moveTo(14, browY - browTilt).lineTo(30, browY + browTilt).stroke({ color: resource.palette.hair, width: 3 });
    const mouth = new Graphics();
    if (instance.mouth === "smile") mouth.moveTo(-9, 14).quadraticCurveTo(0, 23, 9, 14).stroke({ color: 0xa45e68, width: 2 });
    else if (instance.mouth === "sad") mouth.moveTo(-9, 20).quadraticCurveTo(0, 12, 9, 20).stroke({ color: 0xa45e68, width: 2 });
    else if (instance.mouth === "open" || instance.mouth === "shout") mouth.ellipse(0, 17, instance.mouth === "shout" ? 10 : 7, instance.mouth === "shout" ? 9 : 6).fill({ color: 0x7d4654 });
    else mouth.moveTo(-7, 16).lineTo(7, 16).stroke({ color: 0xa45e68, width: 2 });
    const arms = new Graphics();
    if (instance.arms.left === "pointing" || instance.arms.right === "pointing") arms.moveTo(-65, 56).lineTo(-104, 40).lineTo(-122, 40).stroke({ color: resource.palette.body, width: 13 });
    else if (instance.arms.left === "crossed" || instance.arms.right === "crossed") arms.moveTo(-61, 72).lineTo(61, 72).stroke({ color: resource.palette.accent, width: 14 });
    else if (instance.arms.left === "facepalm" || instance.arms.right === "facepalm") arms.moveTo(55, 64).lineTo(55, 0).stroke({ color: resource.palette.body, width: 13 });
    else if (instance.arms.left === "thumbs_up" || instance.arms.right === "thumbs_up") arms.moveTo(62, 75).lineTo(95, 45).lineTo(95, 30).stroke({ color: resource.palette.body, width: 13 });
    figure.addChild(body, head, hair, eyes, eyebrows, mouth, arms);
    if (instance.expression === "shocked") figure.addChild(new Graphics().ellipse(0, -9, 78, 84).stroke({ color: 0xffd978, width: 2, alpha: 0.7 }));
    return figure;
  }
}

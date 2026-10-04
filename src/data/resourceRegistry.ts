import type { CharacterResource, ResourceRegistry } from "../types/project";

const asset = (character: string, layer: string) => `/assets/characters/${character}/${layer}.png`;

const makeCharacter = (
  id: string,
  name: string,
  colors: { body: string; head: string; hair: string },
): CharacterResource => {
  const prefix = (layer: string) => asset(id, layer);
  const toColor = (value: string) => Number.parseInt(value.slice(1), 16);
  return {
    id,
    name,
    body: prefix("body"),
    head: prefix("head"),
    hair: prefix("hair"),
    eyes: prefix("eyes-normal"),
    eyebrows: prefix("eyebrows-normal"),
    mouth: prefix("mouth-neutral"),
    arms: prefix("arms-neutral"),
    expression: prefix("expression-neutral"),
    palette: {
      body: toColor(colors.body),
      head: toColor(colors.head),
      hair: toColor(colors.hair),
      accent: toColor(colors.body) ^ 0x222222,
    },
    assets: {
      body: prefix("body"),
      head: prefix("head"),
      hair: prefix("hair"),
      eyes: Object.fromEntries(["normal", "closed", "wide", "angry", "sad"].map((pose) => [pose, prefix(`eyes-${pose}`)])) as CharacterResource["assets"]["eyes"],
      eyebrows: Object.fromEntries(["normal", "raised", "angry", "sad"].map((pose) => [pose, prefix(`eyebrows-${pose}`)])) as CharacterResource["assets"]["eyebrows"],
      mouth: Object.fromEntries(["neutral", "smile", "open", "shout", "sad"].map((pose) => [pose, prefix(`mouth-${pose}`)])) as CharacterResource["assets"]["mouth"],
      arms: Object.fromEntries(["neutral", "pointing", "crossed", "facepalm", "thumbs_up"].map((pose) => [pose, prefix(`arms-${pose}`)])) as CharacterResource["assets"]["arms"],
    },
  };
};

export const resourceRegistry: ResourceRegistry = {
  characters: {
    kai: makeCharacter("kai", "Kai", { body: "#8170db", head: "#f2c8ac", hair: "#382c45" }),
    mira: makeCharacter("mira", "Mira", { body: "#4f9f9a", head: "#e7b89f", hair: "#263b4a" }),
  },
  backgrounds: {},
  expressions: {},
  eyes: {},
  mouths: {},
  arms: {},
  effects: {},
  voices: {},
  bgm: {},
  sfx: {},
};

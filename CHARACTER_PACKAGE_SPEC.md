# Re:Anime Character Package Specification

This document defines the only supported character package format: the versioned layered-PNG state compositor used by Reze's `manifest.json`. Importers must reject other package schemas rather than infer or repair their format.

## Package structure

```text
character-package/
  manifest.json
  calibration.json
  body/
    neutral.png
  head/
    head.png
  face/
    normal_open.png
  mouth/
    neutral.png
```

Additional body poses, face expressions, and mouth states may be included. Every asset referenced by the manifest must be a readable PNG inside this package. The directory names shown above are canonical. Paths are relative to the directory containing `manifest.json`; absolute paths, parent traversal, and references outside the package are invalid.

## Manifest schema

`schema_version` is `1.0`. A package has one stable `package_id` and a numeric `MAJOR.MINOR.PATCH` version. The canvas is positive-size, transparent RGBA. `name` and `display_name` are user-facing metadata; neither is an identifier.

The required groups are:

- `rig.layers`: exactly `body`, `headGroup`, `head`, `face`, and `mouth`, in that order. The head group contains the other three head layers. Face PNGs combine eyes and eyebrows.
- `states.body`, `states.face`, and `states.mouth`: non-empty maps from stable state IDs to PNG paths. State IDs contain letters, numbers, `_`, or `-`. The head is one fixed faceless head-and-hair PNG referenced by the `head` rig layer.
- `default_state`: one defined state ID for each state group.
- `assets`: a flat registry keyed by every referenced PNG path, with matching `path`, `layer`, `state`, and `type: "png"` fields. Layer IDs such as `body` and `headGroup` are metadata, not asset paths.

The following compact example is structurally complete:

```json
{
  "schema_version": "1.0",
  "package_id": "sample_character",
  "version": "1.0.0",
  "name": "Sample Character",
  "canvas": {
    "width": 1024,
    "height": 1024,
    "color_space": "RGBA",
    "background": "transparent"
  },
  "rig": {
    "type": "state_compositor",
    "layers": [
      { "id": "body", "type": "pose_state", "required": true, "assets": ["body/neutral.png"] },
      { "id": "headGroup", "type": "container", "required": true, "children": ["head", "face", "mouth"] },
      { "id": "head", "type": "base_art", "required": true, "assets": ["head/head.png"] },
      {
        "id": "face",
        "type": "expression_state",
        "required": true,
        "composition": "eyes_and_eyebrows_combined",
        "assets": ["face/normal_open.png"]
      },
      { "id": "mouth", "type": "mouth_state", "required": true, "assets": ["mouth/neutral.png"] }
    ]
  },
  "states": {
    "body": { "neutral": "body/neutral.png" },
    "face": { "normal_open": "face/normal_open.png" },
    "mouth": { "neutral": "mouth/neutral.png" }
  },
  "default_state": { "body": "neutral", "face": "normal_open", "mouth": "neutral" },
  "assets": {
    "body/neutral.png": { "path": "body/neutral.png", "layer": "body", "state": "neutral", "type": "png" },
    "head/head.png": { "path": "head/head.png", "layer": "head", "state": "head", "type": "png" },
    "face/normal_open.png": { "path": "face/normal_open.png", "layer": "face", "state": "normal_open", "type": "png" },
    "mouth/neutral.png": { "path": "mouth/neutral.png", "layer": "mouth", "state": "neutral", "type": "png" }
  }
}
```

`counts` and descriptive metadata may be included, but counts are informational; state maps determine available poses and expressions. No arbitrary root, rig, state, asset-metadata, or layer fields are accepted. The current renderer supports no optional overlay group.

## Artwork and compositing

- Body files are complete character pose images with arms and hands already included. Selecting a body state replaces the complete body.
- `head/head.png` is one faceless head-and-hair composition.
- Each face file contains a complete eyes-and-eyebrows expression, but not the head, hair, or mouth.
- Mouth files contain mouth artwork only; mouth animation selects among the declared mouth states.
- All images use the declared transparent RGBA canvas and aligned canvas coordinates so state changes do not shift the artwork.
- Rendering is deterministic: body, head, face, then mouth. Calibration applies per layer, with a head-group transform around its normalized pivot.
- Optional overlays, skeletal animation, independent arms/hands, and external rig formats are not supported.

## Calibration

`calibration.json` is separate from the PNG artwork and must match the manifest's package ID, version, and canvas:

```json
{
  "schema_version": "1.0",
  "package_id": "sample_character",
  "version": "1.0.0",
  "canvas": { "width": 1024, "height": 1024 },
  "layers": {
    "body": { "x": 0, "y": 0, "scaleX": 1, "scaleY": 1, "rotation": 0, "opacity": 1 },
    "headGroup": {
      "x": 0, "y": 0, "scaleX": 1, "scaleY": 1, "rotation": 0, "opacity": 1,
      "pivot": { "x": 0.5, "y": 0.5 }
    },
    "head": { "x": 0, "y": 0, "scaleX": 1, "scaleY": 1, "rotation": 0, "opacity": 1 },
    "face": { "x": 0, "y": 0, "scaleX": 1, "scaleY": 1, "rotation": 0, "opacity": 1 },
    "mouth": { "x": 0, "y": 0, "scaleX": 1, "scaleY": 1, "rotation": 0, "opacity": 1 }
  }
}
```

Offsets are canvas pixels, rotation is degrees, scale values must be positive, opacity is in `[0, 1]`, and the optional head-group pivot is normalized to `[0, 1]`. Calibration remains package/version-specific; it never rewrites source PNGs.

## Unsupported formats

Skeletal or bone rigs, FBX/Mixamo, Spine, Live2D, independent arm or hand assets, split eyes/eyebrows, arbitrary overlay groups, and alternate/legacy manifests are rejected. Re:Anime does not automatically migrate or reinterpret them. Existing scene data remains intact; reimport or migrate artwork into this specification before using the character.

## Import troubleshooting

- `states.<group>.<state>` must point to a real `.png` within the package and its corresponding asset-registry entry must match the state and layer.
- The `head` rig layer must reference exactly one head PNG. `headGroup` contains layer IDs, not file paths.
- Every PNG is decoded during package validation; renaming an invalid or missing file does not repair the package.
- `calibration.json` must match the package ID, version, and canvas and define exactly the five canonical transforms.
- A package with an unsupported schema, invalid state/default, unsafe path, unreadable PNG, missing asset, or invalid calibration is rejected before it is published to managed storage.
- Reze's shipped package is the canonical working reference. Subaru compatibility is conditional on the package being available and converted to the same schema; do not infer an alternate format from missing legacy files.

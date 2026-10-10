# Reze Character Package v0.2.1

## Runtime architecture

Character
- Body
- HeadGroup
  - Head
  - Face
  - Mouth
- LeftArm
- RightArm

## Independent arm assets

`hands/left/` and `hands/right/` contain independently extracted arm/hand poses
from the supplied masked sprite sheet. Each production asset is a 1024x1024 RGBA PNG.

## Paired reference poses

`hands/paired_reference/` contains gestures where the two arms physically touch
or overlap in the source art (heart, prayer, crossed-arm compositions). These are
reference-only and are NOT presented as independent production layers.

## Pivot preparation

`calibration.json` contains independent pivot data for HeadGroup, LeftArm and RightArm.
This prepares the character for future animation. No Timeline/keyframe/idle animation
is included in this package.

## Source fidelity

The supplied artwork was used as the source of truth. No new character design was
invented.


## Face asset source

`face/states_sheet_clean.png` is copied unchanged from the earlier Reze source ZIP. It is a complete eye-expression sheet containing both-eye expressions; no new face art was generated. It remains a sheet rather than individually split production states.


## Individually selectable face states

`face/` now contains individually selectable 1024x1024 transparent PNGs. Each state
pairs adjacent left/right eye components from the original alpha-masked sprite sheet
so the renderer can swap both eyes together as one Face layer. `source_sheet.png`
is retained as the original reference. The states use the supplied artwork only;
no new face artwork was generated.

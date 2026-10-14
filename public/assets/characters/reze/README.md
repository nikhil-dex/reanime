# Reze — Re:Anime Character Package v0.3.0

## Package contents
- Body pose states: 10
- Head base: 1
- Combined eyes + eyebrows face states: 11
- Mouth states: 8

## Layer contract
- `body/`: complete body pose images, including arms/hands for each pose.
- `head/head.png`: supplied head/hair base layer.
- `face/`: eyes and eyebrows combined into a single expression layer.
- `mouth/`: mouth-only states.
- `manifest.json`: Re:Anime package metadata and state registry.
- `calibration.json`: initial neutral transforms.

## Defaults
- Body: `neutral`
- Face: `normal_open`
- Mouth: `neutral`

## Important
All PNGs have been uniformly resized from the supplied 1254×1254 canvas to 1024×1024 to match the current Re:Anime production canvas. The artwork and transparent placement were preserved by uniform resampling; no layer was individually repositioned.

Calibration is a neutral starting point, not a claim that all layer pivots have been visually validated inside the running Re:Anime renderer.

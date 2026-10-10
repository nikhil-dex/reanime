# SUBARU_CHARACTER_v0.4

Re:Anime production character package.

## Architecture
Body + Head+Hair + Face(Eyes+Eyebrows) + Mouth

## Canvas
1024x1024 RGBA PNG with transparent background.

## v0.4 changes
- Head+hair artwork scaled to 85% inside the unchanged 1024x1024 canvas.
- Combined Face assets created from the approved v0.3 eye and eyebrow layers.
- Legacy `eyes/` and `eyebrows/` production directories removed.
- v0.3 remains untouched and backward-compatible.

## Production rules
- Master is immutable.
- No text, labels, borders, or backgrounds in production sprites.
- PNGs remain immutable; calibration belongs in `calibration.json`.
- Consistency is more important than redesign or visual improvement.

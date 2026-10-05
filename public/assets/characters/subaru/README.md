# ReAnime Subaru Character Package — SUBARU_CHARACTER_v0.1

## STATUS: LOCKED

This package is the production baseline for the Subaru modular character in re:anime.

**Master:** `master/subaru_master_v1.png`  
**Master SHA-256:** `b428036147dfbd2ee15c2bd9370cd56652577fc115c6f694565df2afad870a7c`  
**Canvas:** 1024×1024  
**Format:** RGBA PNG  
**Version:** 0.1.0

## Renderer layers

```text
Body
 + Head
 + Hair
 + Eyes
 + Eyebrows
 + Mouth
        ↓
   Final Composite
```

Body assets already contain their arms and hands. There is intentionally no separate `arms/` layer.

## Immutable rule

`master/subaru_master_v1.png` is the single visual source of truth.

Do not:
- redesign the character
- regenerate the master
- use a drifted variant as a new master
- change canvas size
- move the established coordinate system
- bake facial features into Head/Hair/Body
- add backgrounds or text
- create separate arm/hand sprites for v0.1

## Expressions

The `expressions/` directory contains reference/QA composites only. The renderer should continue composing expressions dynamically from the modular layers.

## Change policy

Any future modification must create a new package version, e.g. `SUBARU_CHARACTER_v0.2`. Never silently overwrite this locked baseline.

See `manifest.json` for the complete asset inventory and SHA-256 hashes.

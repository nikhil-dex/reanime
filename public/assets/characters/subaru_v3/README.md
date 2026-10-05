# Re:Anime Subaru Character Package v0.3

## Package ID
`SUBARU_CHARACTER_v0.3`

## Status
WORKING CALIBRATION — not production locked yet.

## Renderer model
```text
Body Pose
    +
Head (includes Hair)
    +
Eyes
    +
Eyebrows
    +
Mouth
    =
Final Character
```

### Important architecture change
Hair is now permanently attached to `head/base.png` for this package.
There is intentionally **no `hair/` directory**.

`head/base.png` contains:
- clean head/ears
- Subaru hairstyle
- no eyes
- no eyebrows
- no mouth
- no body
- no clothing
- transparent RGBA background

### Calibration baseline
- Body: Y 0
- Head + Hair: Y 0
- Eyes: Y +41
- Eyebrows: Y +41
- Mouth: Y +41

These are renderer metadata values in `calibration.json`. Source PNGs are not modified by calibration.

### Production rule
Do not modify this package in place after it is locked. If final QA requires changes, create `SUBARU_CHARACTER_v0.4`.

# Re:Anime media registry

Place media assets in this directory (or a subdirectory) and register them in `index.json`.

Example:

```json
{
  "voices": {
    "subaru_intro": "/assets/media/audio/subaru_intro.wav"
  },
  "bgm": {
    "lofi_theme": "/assets/media/audio/lofi_theme.mp3"
  },
  "sfx": {
    "door_hit": "/assets/media/audio/door_hit.wav"
  },
  "backgrounds": {
    "school_rooftop": "/assets/media/backgrounds/school_rooftop.png"
  },
  "effects": {
    "sparkle": "/assets/media/effects/sparkle.png"
  }
}
```

Supported registry groups: `backgrounds`, `expressions`, `eyes`, `mouths`, `effects`, `voices`, `bgm`, `sfx`.

Use stable IDs containing only letters, numbers, underscores, or hyphens. Asset paths must start with `/assets/` and must not contain path traversal segments. Audio tracks reference these IDs through `TimelineClip.resourceId`; clip timing is in seconds relative to the scene. The current mixer supports registered audio resources that the browser can decode, such as WAV and MP3. This registry is for bundled project assets, not an upload UI.

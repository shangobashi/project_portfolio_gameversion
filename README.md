# CRT TV WebGL Experience

This branch renders the Kaplay game inside a 3D CRT TV in a Three.js scene.

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:5176/`.

## Replace the TV model

The CRT TV model is stored at:

```
public/assets/models/crt_tv.glb
```

Replace that file with any GLB/GLTF CRT model. Keep the screen mesh named or
materialed with `screen` if possible so the loader can auto-detect it.

## How the screen mesh is selected

`src/threeScene.js` tries to find a mesh whose name or material name includes
`screen`. If none are found, it falls back to the mesh with the largest
screen-like area and smallest depth.

## How the game-to-screen mapping works

- The Kaplay game renders into the existing `#game` canvas.
- Three.js reads that canvas with a `CanvasTexture`.
- The texture is applied to the TV screen mesh via a custom shader.

This keeps the game logic intact without re-writing the Kaplay loop.

## CRT effects and tuning

CRT effects are implemented in `src/threeScene.js`:

- **Scanlines + RGB mask** in the screen shader.
- **Curvature/barrel distortion** in the shader (`SCREEN_CURVATURE`).
- **Bloom** via `EffectComposer` + `UnrealBloomPass`.

Tuning knobs:

- `SCREEN_CURVATURE`
- `uScanlineIntensity` / `uNoiseIntensity` uniforms
- `bloomStrength` (mobile vs desktop)
- renderer pixel ratio clamp

## Performance toggles

- Pixel ratio is capped for mobile.
- Bloom intensity is reduced on mobile.

If you need more headroom:

- Disable bloom in `src/threeScene.js`.
- Lower the renderer pixel ratio cap.

## Notes

- The TV model is CC0 (public domain) from Poly Pizza (Kenney). You can replace
  it freely.
- The HTML dialogue overlay is currently offscreen; the game canvas is mapped to
  the CRT screen. If you need the dialogue text to appear inside the CRT, the
  next step is to render dialogue text into a canvas layer or build a 3D text UI.

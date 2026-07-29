Place the real DeepAR Studio `.deepar` assets here before native builds:

- `beauty/skin_whitening_smoothing.deepar`
- `beauty/glam_beauty.deepar`
- `beauty/soft_pink_glow.deepar`
- `beauty/face_slim_youngify.deepar`
- `beauty/bright_eyes_teeth.deepar`
- `beauty/k_beauty_porcelain.deepar`
- `beauty/blush_highlights.deepar`
- `accessories/3d_fashion_aviators.deepar`
- `accessories/golden_flower_crown.deepar`
- `background/bokeh_blur.deepar`

After adding or replacing assets, run:

```sh
npm run asset
```

The native `react-native-deepar` wrapper loads bundled effects by these mask names.

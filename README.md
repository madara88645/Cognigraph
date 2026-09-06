# CogniGraph

An interactive, fully client-side 3D brain for learning cognitive neuroscience (v2 rewrite of CogniGraph: no backend, no API keys needed). One HTML file, no backend, no API keys.

- **Pathways** — eight everyday moments (recognising a face, recalling a word, a fear response, making a decision, reading a sentence, learning a motor skill, shifting attention, sleep consolidation) replayed hub by hub with the evidence behind each step.
- **Atlas** — 28 regions (13 cortical patches + 15 modelled structures): function, connections, what breaks when damaged, famous cases. Lesion mode lets you knock regions out.
- **Neurons** — 150 Izhikevich point neurons running live, with six neuromodulator sliders that say exactly what they change and how well-supported that mapping is.

Every technical term is clickable, and the **How this simulation works** drawer separates physiology from metaphor.

> Educational simulation. Not medical software. Regions are simplified hubs, not the whole story.

## Run

Open `dist/index.html` in a browser (needs internet for Three.js from jsdelivr and fonts), or serve `dist/`:

```bash
python3 -m http.server 8765 --directory dist
```

## Develop

Source lives in `src/` as small ES modules; `build.py` (stdlib only) concatenates them into the single `dist/index.html`.

```bash
python3 build.py && node --test 'tests/*.test.mjs'
```

`CONTRACTS.md` documents the build model, file ownership and the Scene / Mode / UI APIs. `research/` holds the content research and the plan the build followed.

## Credits

Built with [three.js](https://threejs.org/) (r170). Brain geometry is procedural (no scanned asset); positions are proportional, not MNI coordinates. Colours are chosen for distinguishability, not realism.

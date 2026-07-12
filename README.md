# omidard.github.io

Personal site for **Omid Ardalani** — computational biologist working on pangenome-scale
metabolic models, machine learning on genomes, and agentic AI systems for biology.

Live at **<https://omidard.github.io>**

## What it links to

| | |
|---|---|
| [biggr.org](https://biggr.org) | BiGG 2026, the next-generation BiGG Models database. First author on the pipeline. |
| [panGEMs browser](https://omidard.github.io/panGEMs/) | 2,313 *E. coli* + 2,346 Lactobacillaceae strain-specific genome-scale models |
| [EcopanGEM](https://github.com/omidard/EcopanGEM) | Pangenome-scale reconstruction of *E. coli* metabolism |
| [LactoPanGEM](https://github.com/omidard/LactoPanGEM) | Pangenome reconstruction of Lactobacillaceae metabolism |
| [GrowthDB](https://github.com/omidard/GrowthDB) | Experimental prokaryote growth, uptake and secretion rates |
| [Media](https://github.com/omidard/Media) | Citation-backed, model-ready growth media mapped to BiGG exchanges |
| [ORCID](https://orcid.org/0000-0002-0064-3802) | Full publication list |

## Stack

Static HTML, CSS and vanilla JavaScript. No build step, no dependencies, no tracking.
Served directly by GitHub Pages from `main`.

- `index.html` — content
- `style.css` — design tokens and layout (dark primary, light supported)
- `script.js` — theme toggle, scroll reveal, animated counters, card filters
- `Omid_Ardalani_CV.pdf` — downloadable CV

Design follows the [ui-ux-pro-max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)
system: Portfolio Grid pattern, Modern Dark style, Exo / Roboto Mono, Expo-out easing.
All motion respects `prefers-reduced-motion`.

## Local preview

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

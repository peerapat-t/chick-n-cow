# Chick n Cow 🐔🐮🐴

A picture-reading game: the green frame moves across an M×N grid and the player says the name of each picture.

## Getting started

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # outputs to dist/
npm start         # production server at http://localhost:3000 (PORT, CARDS_DIR)
```

## Features
- **Game page** (`#/`): 4 levels — 1: 3×3 medium speed, 2: 4×4 fast, 3: 5×5 very fast, 4: 6×6 fastest. Each level starts with a 3-2-1 countdown, there is a short break between levels, and Restart starts again from level 1 (levels are defined in `LEVELS` in `src/game.ts`)
  - Keyboard: `Space` = start/pause, `R` = restart, `F` = fullscreen · tap a card to hear it when the game isn't running
- **Settings page** (`#/settings`): choose cards, add custom cards (upload an image + record or upload a sound, then trim it on the waveform), Light/Dark/System theme, music on/off with 3 tracks (slow / normal / fast with drums), pronunciation help on/off
- Settings are saved in `localStorage`; cards are stored on the server in `cards/`

## Cards
Every card — built-in or added from the settings page — is its own folder in `cards/`:

```
cards/
  chicken/  card.json  image.svg   sound.wav
  cow/      card.json  image.svg   sound.wav
  card-xxxx/card.json  image.webp  sound.webm   <- added from the settings page
```

`card.json`: `{ "label": "ไก่", "image": "image.svg", "sound": "sound.wav", "createdAt": 1 }` (sound is optional; cards without one are silent).
To add a card by hand, create a folder with those files. Deleting a card in the app deletes its folder.

The server (`server/`) serves `GET/POST /api/cards`, `DELETE /api/cards/:id` and the files under `/cards/`. The same code runs inside `npm run dev`.
In Docker, mount `cards/` as a volume (or set `CARDS_DIR`) so uploaded cards survive container restarts.

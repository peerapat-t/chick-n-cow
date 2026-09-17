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
- **Game page** (`#/`): 10 levels on a fixed 2×4 grid, each faster than the last (1.40s per card down to 0.45s). `sound/start.*` plays before the game; `sound/during.*` loops while playing and is sped up by the same factor as the cards (level 10 ≈ 3.1×). A whistle marks each step (can be turned off)
  - Keyboard: `Space` = start/pause, `R` = restart, `F` = fullscreen
- **Settings page** (`#/settings`): per-level card pools (drag cards between the tray and the 10 levels; a level can never be empty), add cards, Light/Dark/System theme, game sound on/off, whistle on/off
- Settings are saved in `localStorage`; cards are stored on the server in `cards/`

## Sounds
Put `start.*` and `during.*` in `sound/` (mp3, m4a, ogg, opus, wav, webm or flac). With no files there, the game uses countdown beeps and plays nothing while running. Override the folder with `SOUND_DIR`.

## Cards
Every card — built-in or added from the settings page — is its own folder in `cards/`:

```
cards/
  chicken/  card.json  image.svg
  cow/      card.json  image.svg
  card-xxxx/card.json  image.webp   <- added from the settings page
```

`card.json`: `{ "label": "ไก่", "image": "image.svg", "createdAt": 1 }`.
To add a card by hand, create a folder with those files. Deleting a card in the app deletes its folder.

The server (`server/`) serves `GET/POST /api/cards`, `DELETE /api/cards/:id` and the files under `/cards/`. The same code runs inside `npm run dev`.
In Docker, mount `cards/` as a volume (or set `CARDS_DIR`) so uploaded cards survive container restarts.

# Transpose Chords Plugin

This plugin automatically transposes chord names displayed on the highway to E Standard tuning (only if original tuning is not E Standard and song was not converted).

## How it works

When a song is loaded, the plugin detects the tuning (e.g., Eb Standard) and transposes all chord names up to E Standard. For example:
- In Eb Standard tuning, D#7 becomes E7
- In D Standard tuning, C#7 becomes E7

## Installation

```bash
cd /path/to/feedBack/plugins
git clone https://github.com/got-feedBack/feedBack-plugin-transpose-chords.git transpose-chords
docker compose restart
```

## Usage

The plugin adds a **Transpose Chords** toggle button to the player controls. In the v3 player, plugin buttons live in the Plugins rail popover.

The toggle starts on when the app loads, so no configuration is needed. Click it to turn transposition off and restore the original chord names. Click it again to turn it back on. The choice is not saved, so the toggle is on again after the next app load.

## Limitations

- Only uniform tunings are transposed: every string must be shifted by the same amount from E Standard (for example Eb, D or C Standard). Drop and open tunings are left unchanged.
- Only chord names change. Notes and fret numbers on the highway stay as charted.

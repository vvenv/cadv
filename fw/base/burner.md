# CADV

**A home screen plus 25 small apps for the Cardputer-ADV, written in TypeScript on the Moddable SDK.** Only the home screen lives in flash. The apps are kept in `cadv/` on the microSD card: pick one and it loads into the second app slot. One app runs at a time, and each keeps its own settings.

## Apps

| | |
| --- | --- |
| **Study** | Spelling drill and English–Chinese lookup from school textbook word lists, typing practice, Morse trainer |
| **Time** | Wi-Fi clock with alarm, countdown you start by standing the device up, counter, metronome, step counter |
| **Sound** | Tuner, sound-level meter, sleep-noise generator, recorder, one-octave piano |
| **Tools** | Calculator and unit converter, bubble level, dice, notes on the card, IR TV remote, Wi-Fi/BLE scanner, BLE keyboard, USB card reader, JavaScript REPL, device info |
| **Games** | Three small games |

## Getting started

1. Flash this image. It is the home screen only.
2. Copy app images to the card. From a computer with the source tree run `./do.sh sd fw`, or put `<id>.bin` (plus `<id>.txt` for the name and `<id>.icon` for the icon) into `cadv/` by hand.
3. Choose an app and press `Enter`. If the slot already holds that exact image, it starts straight away without rewriting.

If an app crashes or resets before it has run for about 3 seconds, the bootloader rolls back to the home screen.

## Controls

| Key | Action |
| --- | --- |
| `,` `/` `;` `.` | Move through the grid (as printed on the keycaps) |
| Letter | Jump to the next app whose id starts with it |
| `Enter` | Load the app |
| `Del` | Cancel loading, or rescan the card |
| Hold `Fn+Del` | From any app: back to the home screen |
| `Fn+[` / `Fn+]` | Backlight |
| `Fn+T` | Colour theme (shared by all apps) |

Source, build instructions and app images: https://github.com/vvenv/cadv

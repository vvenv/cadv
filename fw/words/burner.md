# Words · 拼写

**An English spelling drill for the Cardputer-ADV, built on Chinese school textbook word lists.** The top line shows the part of speech and the Chinese meaning. You type the word into the blanks below it. Get it wrong and only the wrong letters are cleared, so you keep the part you already got right.

## Features

- **A word bank built in, with no SD card needed.** It ships with the primary-school list from the Fujian Education Press (闽教版) textbooks. You can add a junior-high list on the SD card.
- **Meaning or phonetics.** Press `Space` to swap the top line between `n. 名字` and the IPA spelling.
- **Three difficulty levels.** *Easy* blanks about ⅓ of the letters, *Medium* about ½, and *Hard* the whole word.
- **Picks up where you stopped.** Words you've already spelled correctly are saved, and the next session starts with the ones you haven't finished.
- **Mistake review.** Up to 40 missed words are kept. Switch to *Mistakes only* to practise just those. A word drops off the list as soon as you spell it right.
- **Big, steady type.** The blanks use a monospaced font sized 48 / 32 / 20 px to fit the word, so the line never shifts while you type.
- A green ✓ or red ✗ shows after each answer, and you can turn shuffle on or off.
- Shares settings with the other CADV apps: 4 backlight levels, colour themes (`Fn+T`) and volume.

## Controls

| Key | Action |
| --- | --- |
| Letters | Fill the blanks. The answer is checked when the word is full |
| `Space` | Switch between meaning and phonetics |
| `Enter` | Submit the answer (it doesn't have to be complete). With nothing typed, opens the menu |
| `Del` | Delete the last letter, or go back in menus |
| `[` / `]` | Difficulty down / up |
| `\` | Switch word bank |
| `,` / `.` | Previous / next word |
| `-` / `=` | Volume |
| `?` | Help for the current screen |
| `Fn+[` / `Fn+]` | Backlight |

## Optional SD card

```
/cadv/words/junior.bin        junior-high word bank (shows as 初中)
/cadv/words/progress/         written automatically: progress and mistakes
```

If the card is missing or can't be read, the app falls back to the built-in bank and keeps your saved choice for the next time the card is present.

Source and other apps (clock, dictionary, metronome, tuner …): https://github.com/vvenv/cadv

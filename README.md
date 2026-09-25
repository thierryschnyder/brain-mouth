# Brain Mouth

A family word game that trains the "brain to mouth" connection. A random word appears, and the player talks about it until the timer runs out. Then the phone goes to the next player. It works with a group or solo, for players from about 6 years old.

- Progressive Web App (PWA). It runs in the browser on iPhone, Android and tablets, and can be added to the home screen.
- Plain HTML, CSS and JavaScript. No build step, no backend, no accounts.
- Works offline after the first visit.
- The interface has no text: only icons, colours, numbers, the word and the language names.

## How to play

1. **Start screen**
   - Tap a language.
   - Set the time with **−** / **+** (10 to 120 seconds, in steps of 10).
   - Turn the skip button on or off.
   - Tap the big ▶.
2. **Pass the phone**: hand the phone to the next player. They tap the pulsing ▶ when ready.
3. **Word**
   - The word appears and the timer starts.
   - 🔊 reads the word aloud (for children who can't read yet).
   - ⏭ swaps the word for a new one and restarts the timer.
4. **Time's up**: a chime plays, the phone vibrates (Android only), and the screen turns coral with a ringing bell. After two seconds, or on a tap, it goes back to step 2.
5. **Home** (top left): **press and hold** for under a second to return to the start screen. A quick tap only makes it wiggle, so it can't be hit by accident.

The app remembers the last language, time and skip setting on the device. Words don't repeat until the whole list has been used, then the list is reshuffled.

## Run it locally

A service worker needs a real web server; opening `index.html` as a file won't work. Any static server is fine. From this folder, run one of:

```sh
python3 -m http.server 8000
# or
npx serve .
```

Then open <http://localhost:8000>.

**To try it on your phone**, the phone must be on the same Wi-Fi. Open `http://<your-computer-ip>:8000`.

The game itself works over plain `http://` on your local network. Offline mode, "Add to Home Screen" as a real app and the screen wake lock need **https**, so for the full experience deploy it (see below). Deploying is free and takes a minute.

## Deploy for free

The whole app is this folder of static files. Upload it as it is.

### GitHub Pages
1. Push this repository to GitHub.
2. Go to **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, select your branch (e.g. `main`) and the `/ (root)` folder, then save.
4. After a minute the app is live at `https://<user>.github.io/<repo>/`.

All paths in the app are relative, so it works in a sub-folder like this.

### Netlify
- **Drag and drop**: go to <https://app.netlify.com/drop> and drop this folder on the page.
- **Or connect the repository**: build command empty, publish directory `.`.

### Install on a phone
- **iPhone / iPad (Safari)**: Share button → **Add to Home Screen**.
- **Android (Chrome)**: menu ⋮ → **Add to Home screen** / **Install app**.

Open the app once while online. After that it works offline.

## Edit the word lists

The word lists are in `languages/`, one file per language:

```json
{
  "name": "Français",
  "locale": "fr-FR",
  "words": [
    "chat",
    "chien",
    "lapin"
  ]
}
```

- **Add a word**: add a line like `"tortue",` anywhere in the list.
- **Remove a word**: delete its line.
- Each word is in double quotes, and words are separated by commas. **The last word has no comma after it.** A missing or extra comma makes the file invalid. If that happens, the app keeps working but hides that language, and the browser console names the file. You can check a file at <https://jsonlint.com>.
- Duplicates are removed automatically.
- Words can be several words long (e.g. `"pomme de terre"`).
- Save the file with UTF-8 encoding (the default in almost every editor), so letters like é, ö and ü work.

When you're online, the app always loads the latest word list, so there's no need to change anything else after editing a list.

## Add a new language

Example: English.

1. Create `languages/en.json`:
   ```json
   {
     "name": "English",
     "locale": "en-GB",
     "words": [
       "cat",
       "dog",
       "apple"
     ]
   }
   ```
   - `name`: the language's name in that language. It is shown on the language button.
   - `locale`: used to pick the voice for 🔊, e.g. `en-GB`, `it-IT`, `es-ES`, `de-CH`.
2. Add the file name to `languages/languages.json`:
   ```json
   {
     "languages": [
       "fr.json",
       "de.json",
       "en.json"
     ]
   }
   ```

That's all; no code changes are needed. The buttons appear in the order listed in the manifest. On first launch, the app picks the language that matches the phone's language, if there is one.

## When you change the app itself

If you edit `index.html`, `style.css`, `app.js` or the icons, open `sw.js` and bump `CACHE_VERSION`, e.g. `'v1'` → `'v2'`. This makes installed phones pick up the new version, on the next launch or the one after. Word list edits don't need this.

## Project layout

```
index.html              screens and the icon set (inline SVG)
style.css               all styling and animations
app.js                  game logic
sw.js                   service worker (offline cache)
manifest.webmanifest    PWA manifest (name, icons, colours)
icons/                  app icons (SVG source + PNGs)
languages/languages.json  list of available languages
languages/fr.json       French words
languages/de.json       German words
```

## Notes on devices

- **Sound**: the time-up chime is generated with the Web Audio API, so there are no sound files. On iPhone, audio is unlocked by the first tap on ▶. On iOS 17 and later, the app asks for "playback" audio so the chime plays even with the ring/silent switch on silent. On older iOS versions, the silent switch mutes it.
- **Vibration**: Android only. iPhone browsers don't allow vibration, which is why the chime and the colour change are always there.
- **Speech (🔊)**: uses the voices installed on the device. Most phones already have French and German voices.
  - If a language has no voice, open the phone's settings and install one:
    - iPhone: Settings → Accessibility → Spoken Content → Voices.
    - Android: Settings → Text-to-speech → Install voice data.
  - With a mute switch or silent mode on, iPhone may also mute speech.
- **Screen stays on** during the game where supported (Wake Lock API): Chrome on Android, and Safari from iOS 16.4 (inside a home-screen app from iOS 18.4).
- **German words** use Swiss spelling and everyday Swiss words (Velo, Glace, Trottinett, Giesskanne…). Change them if you prefer Germany's German.

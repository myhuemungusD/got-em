# got-em

Single-file street dice app that syncs game state through Firebase Realtime Database. Open `index.html` in a browser, create a game, share the URL, and both players see rolls update live.

## Modes implemented
- Street Craps (2 dice, first to 3 sequences won)
- C-Lo (3 dice, best of 1)
- 4-5-6 (same head-to-head scoring as C-Lo)
- 10,000 / Farkle variant (6 dice, first to 10,000, 1000-entry rule)

## Firebase setup

1. Create a project at https://console.firebase.google.com
2. In the project console, add a Web app (the `</>` icon) and copy the `firebaseConfig` snippet it gives you.
3. Open `index.html` and replace the placeholder `firebaseConfig` near the top of the `<script type="module">` block with your real values.
4. Enable **Realtime Database**: Build -> Realtime Database -> Create database (pick a region, start in locked mode).
5. Enable **Anonymous Auth**: Build -> Authentication -> Get started -> Sign-in method -> Anonymous -> Enable.
6. Paste the contents of `database.rules.json` into Realtime Database -> Rules and publish.

Game state is written to `games/<gameId>` in the database. Each new game generates a short ID; the share URL is `index.html?game=<gameId>`.

## Running locally

Because the page uses ES modules, open it via a local web server rather than `file://`:

```
python3 -m http.server 8000
# then visit http://localhost:8000/
```

## Optional: deploy with Firebase Hosting

```
npm install -g firebase-tools
firebase login
firebase init hosting     # use this directory as public root, single-page app: no
firebase deploy
```

# Shahi Ludo 👑

A browser-based, two-player online Ludo — no server, no build step, no installs.
Open `index.html` (or the GitHub Pages link), create a game, send your friend
the link, and play. Rich "royal marble & gold" visuals, animated 3D dice,
hopping tokens, capture bursts, and win confetti.

---

## How it connects without a server

Your browser and your friend's browser connect **directly** to each other
using WebRTC (peer-to-peer) via a small library called **PeerJS**. PeerJS
uses a free, public "signalling" server (run by the PeerJS project, not you)
purely to help the two browsers find each other and shake hands — after
that, all game data (dice rolls, moves) flows directly between the two
browsers. You don't need to run or pay for anything.

The `lib/peerjs.min.js` file in this repo is a local copy of that library,
so the site works even if some CDN somewhere is down — the only external
thing it ever talks to at runtime is PeerJS's free signalling service.

## Deploying to GitHub Pages (2 minutes)

1. Create a new GitHub repository (public) and upload **this whole folder**
   (`index.html`, `style.css`, `lib/`, `js/`, this `README.md`) — either by
   dragging the files into the GitHub web UI, or with git:
   ```bash
   git init
   git add .
   git commit -m "Shahi Ludo"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo>.git
   git push -u origin main
   ```
2. In the repo, go to **Settings → Pages**.
3. Under "Build and deployment", set **Source: Deploy from a branch**,
   branch **main**, folder **/ (root)**. Save.
4. GitHub gives you a URL after a minute, usually:
   `https://<your-username>.github.io/<your-repo>/`

That's it — open that link, and it's live for anyone to use.

## How to play

1. Open the site. Enter your name.
2. **Create Game** → pick a gem colour → you get a short room code and an
   "Copy Invite Link" button. Send that link (or just the code) to your friend
   any way you like — WhatsApp, whatever.
3. Your friend opens the link (or clicks **Join Game** and types the code),
   picks one of the remaining colours, and the game starts for both of you
   automatically.
4. Tap the die on your turn. If a move is available, your movable gems glow
   — tap one to move it. Roll a 6, capture an opponent, or get a gem home to
   go again. Land on a star or start square and you're safe from capture.

## Rules implemented

- Classic 4-arm Ludo track with 4 colours available (any 2 in play at once).
- Roll a 6 to bring a gem out of your palace.
- Capturing sends an opponent's gem back to their palace.
- Star squares and start squares are safe — no captures there.
- Two of your own gems on one square form a block — opponents can't land on it.
- Exact roll needed to bring a gem all the way home.
- Rolling three 6es in a row forfeits that turn.
- First to get all 4 gems home wins.

## A couple of honest limitations

- **No reconnect / resume**: since there's no server to remember game state,
  if either of you closes the tab mid-game, that game is over — start a new
  one. (The room code itself can't be reused either, since it's tied to that
  browser session.)
- **Strict NAT/firewall networks**: peer-to-peer connections work on the very
  large majority of home and mobile networks. On rare restrictive networks
  (some corporate/campus firewalls), the direct connection can fail to
  establish. If "Connecting…" hangs, try a mobile hotspot or a different
  network on one side.
- Sound effects are synthesized in-browser (Web Audio), so there are no audio
  files to manage — but that also means they're simple tones/percussion
  rather than sampled sound.

## File structure

```
shahi-ludo/
├── index.html          — page structure, lobby + game screens, modals
├── style.css            — all visual design (theme, board, animations)
├── lib/
│   └── peerjs.min.js     — vendored PeerJS library (WebRTC helper)
├── js/
│   ├── board-data.js     — board geometry: the 56-cell ring path, per-
│   │                        colour start/home-column/safe-square data
│   ├── game-engine.js    — pure rules engine: dice, legal moves, capture,
│   │                        turns, win condition (no DOM/network code)
│   ├── network.js        — PeerJS wrapper: host/join, message send/receive
│   ├── renderer.js        — board/token/dice DOM rendering + animations
│   │                        + synthesized sound effects
│   └── main.js            — wires lobby, network, engine and renderer
│                             together; the host runs game-engine.js as
│                             the single source of truth, the guest only
│                             sends intents and renders what the host sends
└── README.md
```

Everything is plain JavaScript (no build step, no framework) so it runs
straight from static files — which is exactly what GitHub Pages serves.

## Customizing

- Colours, fonts and the whole look live in `style.css` under `:root` at the
  top (CSS custom properties) — change `--gold`, `--ruby` etc. to retheme.
- Board geometry is entirely data-driven from `js/board-data.js`; it was
  generated and verified programmatically (every step of every colour's
  path checked for valid adjacency) rather than hand-placed, so it's safe
  to leave alone unless you want a different track shape.

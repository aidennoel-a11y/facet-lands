#!/bin/bash
# Facet Lands on a Mac: updates the game, builds it, starts it, and opens it
# in the browser. Double-click to run (the first time: right-click, Open).
# Needs Node.js (nodejs.org). Add "server" to also run the multiplayer
# server here:  ./play.command server
cd "$(dirname "$0")" || exit 1

echo "Getting the latest version..."
git pull origin claude/sharp-cerf-ujjlr6 2>/dev/null || echo "(Couldn't update: playing the version you have.)"

echo
echo "Installing what the game needs (only slow the first time)..."
npm install --no-audit --no-fund || { echo "Something went wrong: is Node.js installed (nodejs.org)?"; read -r; exit 1; }

if [ "$1" = "server" ]; then
  (cd server && npm install --no-audit --no-fund && npm start) &
fi

echo
echo "Building the game..."
npm run build || { echo "The build failed (see above)."; read -r; exit 1; }

# (A moment for it to start, then open it.)
(sleep 3 && open http://localhost:4173) &
echo
echo "============================================================"
echo " The game opens in your browser: http://localhost:4173"
echo " To join a world on another computer, in Play online put that"
echo " computer's address as the server, e.g. ws://192.168.1.42:8787"
echo " Leave this window open while you play; close it to stop."
echo "============================================================"
npm run preview -- --port 4173 --strictPort

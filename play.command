#!/bin/bash
# Facet Lands on a Mac: updates the game, builds it, starts it, and opens it
# in the browser. Double-click to run (the first time: right-click, Open).
# Needs Node.js (nodejs.org). Add "server" to also run the multiplayer
# server here:  ./play.command server
cd "$(dirname "$0")" || exit 1

echo "Getting the latest version..."
if [ ! -d .git ]; then
  # (A copy downloaded as a zip can't update itself: playing online with
  # someone on a newer version, hardly anything is shared.)
  echo
  echo "============================================================"
  echo " This copy was downloaded as a zip, so it can't update itself."
  echo " To play online, everyone needs the latest version. Set it up"
  echo " once with git instead (see SETUP-MAC.txt next to this file),"
  echo " and from then on this updates it every time."
  echo "============================================================"
  echo
elif ! git pull origin claude/sharp-cerf-ujjlr6; then
  echo
  echo "!! Couldn't update (see above): playing the version you have."
  echo "!! Online, the others may be on a newer one: then little is shared."
  echo
fi

echo
echo "Installing what the game needs (only slow the first time)..."
npm install --no-audit --no-fund || { echo "Something went wrong: is Node.js installed (nodejs.org)?"; read -r; exit 1; }

if [ "$1" = "server" ]; then
  (cd server && npm install --no-audit --no-fund && npm start) &
fi

echo
echo "Building the game..."
npm run build || { echo "The build failed (see above)."; read -r; exit 1; }

# (A moment for it to start, then open it: in Chrome, if it's here (its
# graphics are quicker than Safari's), as a window of its own, no tabs or
# address bar, like a game; else in the usual browser.)
open_game() {
  if [ -d "/Applications/Google Chrome.app" ] || [ -d "$HOME/Applications/Google Chrome.app" ]; then
    open -na "Google Chrome" --args --app=http://localhost:4173 --start-maximized
  else
    echo "(Chrome isn't installed: opening in your usual browser. Chrome runs the game more smoothly: google.com/chrome)"
    open http://localhost:4173
  fi
}
(sleep 3 && open_game) &
echo
echo "============================================================"
echo " The game opens in Chrome: http://localhost:4173"
echo " Play online: host a world, or click one in the list to join."
echo " Leave this window open while you play; close it to stop."
echo "============================================================"
npm run preview -- --port 4173 --strictPort

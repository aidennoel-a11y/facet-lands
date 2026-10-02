# Facet Lands server

The multiplayer server: rooms of players walking the same world. Each
room has a six-letter code. The host opens a room for one of their worlds
and the others join with its code.

The world itself is never sent, because every player builds it from its
seed. The server only passes on where everyone is (15 times a second)
and keeps the room's time of day.

## Running it on your own computer

```
cd server
npm install
npm start            # listens on port 8787 (set PORT to change it)
```

In the game, choose **Play online** and use the server address
`ws://localhost:8787`. This only works from a copy of the game running on
your computer: a page served over https (like the published artifact)
must use a `wss://` address.

## Putting it online (free): Render

1. Push this repository to GitHub (it already is).
2. On https://render.com, sign in with GitHub, then **New > Web Service**,
   and pick this repository.
3. Settings:
   - **Root Directory:** `server`
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
4. Create it. When it's live, Render shows its address, like
   `https://facet-lands-server.onrender.com`.
5. In the game, choose **Play online** and use that address with `wss://`
   in front instead of `https://`: `wss://facet-lands-server.onrender.com`.

A free Render service goes to sleep after about 15 minutes with nobody on
it. The first player to connect after that waits up to a minute while it
wakes up.

Fly.io and Railway work the same way: a Node service started with
`npm start` in `server/`, listening on the `PORT` they give it.

## Checking it's up

Open the server's address in a browser (`https://…`). It answers with how
many worlds are open.

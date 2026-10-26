#!/usr/bin/env bash
# One-time Spotify wiring: puts the Client ID in .env.local (public, ends up in
# the browser bundle) and both halves in Convex (the secret stays server side).
#
# Create the app first at https://developer.spotify.com/dashboard:
#   Redirect URI  http://127.0.0.1:3000/spotify/callback
#   APIs          Web API + Web Playback SDK
#   Users         add every listener's Spotify account (5 max in dev mode)
set -euo pipefail
cd "$(dirname "$0")/.."

read -r -p "Spotify Client ID: " CLIENT_ID
read -r -s -p "Spotify Client Secret (hidden): " CLIENT_SECRET
echo

if [ -z "$CLIENT_ID" ] || [ -z "$CLIENT_SECRET" ]; then
  echo "Both values are required." >&2
  exit 1
fi

touch .env.local
# Replace any existing line rather than stacking duplicates.
if grep -q '^NEXT_PUBLIC_SPOTIFY_CLIENT_ID=' .env.local; then
  tmp=$(mktemp)
  grep -v '^NEXT_PUBLIC_SPOTIFY_CLIENT_ID=' .env.local > "$tmp"
  mv "$tmp" .env.local
fi
printf '\nNEXT_PUBLIC_SPOTIFY_CLIENT_ID=%s\n' "$CLIENT_ID" >> .env.local
echo "✓ wrote NEXT_PUBLIC_SPOTIFY_CLIENT_ID to .env.local"

npx convex env set SPOTIFY_CLIENT_ID "$CLIENT_ID" > /dev/null
npx convex env set SPOTIFY_CLIENT_SECRET "$CLIENT_SECRET" > /dev/null
echo "✓ set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET on the Convex deployment"

echo
echo "Restart the dev server, then open http://127.0.0.1:3000 — not localhost,"
echo "which Spotify rejects as a redirect target."

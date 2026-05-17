# WaffleSMP Store

WaffleSMP website with:

- player accounts
- gem purchase requests
- rank purchases using gems
- persistent Netlify Blobs storage in production
- admin approvals dashboard

## Run

```powershell
npm install
node dev-server.mjs
```

Then open `http://localhost:3000`.

## Netlify

- Publish directory: `public`
- Functions directory: `netlify/functions`
- Production account and order data is stored in a site-scoped Netlify Blob store named `wafflesmp-store`
- For local Netlify-style development, use `netlify dev`
- Make sure the whole project is deployed from the repo root, not by uploading only the `public` folder, so Netlify also builds the function
- A fallback [public/_redirects](C:/Users/minec/OneDrive/Documents/New%20project%202/public/_redirects) file is included so `/api/*` still rewrites to the function in production
- If the live backend is down, the site still loads and shows ranks, but checkout and admin actions are disabled so you do not miss browser-only orders

## GitHub Pages

- GitHub Pages is static only, so the live shared backend will not run there
- The site will still load correctly on a repo subpath and show ranks
- When checkout is offline, players are told to email `drdonutiskool@gmail.com` with the rank they want
- If you want real shared accounts, orders, and admin approvals, use Netlify or another backend host instead of GitHub Pages alone

## Admin Login

- Username: `COOLMAN155`
- Password: `8675309b`

## Notes

- `100 gems = $1`
- Member is free and automatically included
- Gem orders stay pending until staff approves payment
- Approved gem orders add gems to the account balance
- Rank orders deduct gems immediately and then wait for staff approval

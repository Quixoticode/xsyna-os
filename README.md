# xSyna Static Website

A pure static HTML/CSS/JS website for xSyna — no build step, no framework.

## Stack

- Static HTML pages (`/`, `/auth`, `/docs`, `/internal-services`, `/track`)
- Vanilla ES modules with import maps
- Pure CSS design system in `src/index.css`
- Three.js neural background (`src/js/neural-bg.js`)
- Supabase client for auth & data (`src/js/supabase.js`, `src/js/supabase-db.js`)
- Service worker for offline support (`sw.js`)

## Project structure

```
.
├── index.html                 # Landing page
├── auth/index.html            # Login / register
├── docs/index.html            # Documentation
├── internal-services/index.html # Dashboard / admin panel
├── track/index.html           # Public order/commission tracking
├── src/
│   ├── index.css              # Global design system
│   ├── main.js                # Landing page entry
│   ├── auth.js                # Auth page entry
│   ├── docs.js                # Docs page entry
│   ├── internal.js            # Dashboard / admin panel entry
│   ├── track.js               # Tracking page entry
│   └── js/
│       ├── supabase.js        # Supabase client
│       ├── supabase-db.js     # DB helpers & offline queue
│       ├── neural-bg.js       # Three.js background
│       └── sw-register.js     # Service worker registration
├── sw.js                      # Service worker
├── supabase/migrations/       # SQL schema migrations
├── scripts/setup-admin.mjs    # Promote a user to admin
└── package.json               # Minimal static-server scripts
```

## Development

Serve the folder with any static server:

```bash
npm run dev
# or
python3 -m http.server 3000
```

The site uses ES module import maps, so it must be served over HTTP(S) — `file://` will not work for module imports.

## Supabase setup

1. Run `supabase/migrations/001_initial_schema.sql` in the Supabase SQL Editor.
2. Run `supabase/migrations/002_orders_tracking.sql`.
3. Update `src/js/supabase.js` if you ever need to change the Supabase URL or anon key.
4. Promote your first admin:

```bash
SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/setup-admin.mjs admin@example.com
```

## Static serving notes

- All pages are independent `.html` files in their own folders.
- The service worker caches the core assets for offline use.
- External dependencies (`three`, `@supabase/supabase-js`) are loaded via CDN through the import map.

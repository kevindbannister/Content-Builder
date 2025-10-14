# ContentOS App (Vite + React)

## Quick start
```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173).

## Publishing to GitHub Pages
The production build is emitted into the `docs/` folder so that GitHub Pages can serve it directly from the repository. To update the hosted site:

```bash
npm run build
```

Commit the regenerated `docs/` folder and ensure GitHub Pages is configured to deploy from the `main` branch, `/docs` folder. The static assets already include a `.nojekyll` file so GitHub Pages will serve them without processing.

## Versioning & automatic refresh

- App version: **1.9.20** (also shown in the UI header next to the **New** button).
- Bump the version in `package.json` for each release. The build injects that version into the client bundle so GitHub Pages loads the newest assets and clears any cached local data automatically.
- When the deployed version changes, any previously stored `contentos.*` data in `localStorage` is removed so you always start from a clean slate on the preview site.

### Notes
- Tailwind is loaded via the CDN play version in `index.html`. It's fine for prototyping.
- Your webhooks are left as-is, pointing at `http://localhost:5678/webhook-test/...`.
- All state is stored in `localStorage` under keys starting with `contentos.`
- CSV upload uses a simple client-side parser.

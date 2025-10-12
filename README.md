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

Commit the regenerated `docs/` folder and ensure GitHub Pages is configured to deploy from the `main` branch, `/docs` folder. In the repository **Settings → Pages** screen choose:

- **Source**: *Deploy from a branch*
- **Branch**: *main* / *docs*
- Leave **Custom domain** blank unless you have set one up
- Keep **Enforce HTTPS** enabled

Those defaults are enough—no other Pages settings need to change. The static assets already include a `.nojekyll` file so GitHub Pages will serve them without processing.

### Notes
- Tailwind is loaded via the CDN play version in `index.html`. It's fine for prototyping.
- Your webhooks are left as-is, pointing at `http://localhost:5678/...`.
- All state is stored in `localStorage` under keys starting with `contentos.`
- CSV upload uses a simple client-side parser.

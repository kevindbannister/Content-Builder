# ContentOS App (Vite + React)

## Quick start
```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173).

### Notes
- Tailwind is loaded via the CDN play version in `index.html`. It's fine for prototyping.
- Your webhooks are left as-is, pointing at `http://localhost:5678/...`.
- All state is stored in `localStorage` under keys starting with `contentos.`
- CSV upload uses a simple client-side parser.
```

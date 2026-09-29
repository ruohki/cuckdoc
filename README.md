# Cuckdoc

Paste markdown, press one button, get Word-ready rich text on your clipboard.

**Live: <https://ruohki.github.io/cuckdoc/>**

The whole thing runs in the browser. There is no server, no API, no database and
nothing to configure — `dist/` is a static site you can drop on any host.

## How the copy works

Word decides how a paste looks by reading the `text/html` flavour of the
clipboard, so the app renders your markdown to HTML with every style written
inline and puts that on the clipboard alongside a plain-text fallback. It tries
the async Clipboard API first, falls back to a hidden `contenteditable` plus
`execCommand('copy')` when the browser blocks that, and if both fail it hands you
the HTML in a dialog rather than silently doing nothing.

A few things are shaped specifically for Word's HTML importer:

- **Code blocks are paragraphs, not `<pre>`.** Word maps `<pre>` to its built-in
  "HTML Preformatted" style, which has wrapping switched off, so long lines run
  off the edge of the page. Each source line is emitted as its own paragraph and
  leading indentation becomes non-breaking spaces, which Word won't collapse.
- **A shaded code block is a single-cell table.** That is the one construction
  Word reliably renders with both a background fill and a border.
- **Table cells set `word-break`.** It lowers each column's minimum width so
  `width:100%` can actually be honoured instead of being overridden by one long
  URL.
- **Task list items become `☒` / `☐`.** Word has no checkbox to paste into.
- **Headings use Word's own Heading 1/2/3 colours** (`#2F5496`, `#1F3864`) so
  pasted text matches a document already using Office styles. Switch the
  *Headings* control to *Black & white* for templates that want plain headings.

The preview pane is not an approximation: it renders the exact HTML that goes on
the clipboard, in Carlito (metric-identical to Calibri).

## Layout

```
src/app.html     the tool — a page fragment (no <html>/<head>/<body>)
src/404.html     the not-found page, same fragment shape
vendor/          marked 4.3.0, vendored so deploys have no CDN dependency
build.mjs        wraps the fragments into standalone documents
dist/            build output — this is what you deploy
```

`src/*.html` are fragments because the same `src/app.html` is published as a
Claude artifact, and that host supplies the document skeleton. A static host
supplies nothing, so `build.mjs` adds the doctype, `<head>`, charset/viewport
meta, favicon and the small reset the fragments assume. It also rewrites the
markdown library's `<script src>` from the CDN to the vendored copy.

One rule in that reset matters more than it looks: `[hidden]{display:none!important}`.
The error banner and the manual-copy dialog set `display`, which beats the
user-agent `[hidden]` rule on specificity — without it both are stuck on screen.

## Build

```sh
node build.mjs        # or: npm run build
```

Writes `dist/index.html`, `dist/404.html` and `dist/vendor/marked.min.js`.
About 93 kB total. No dependencies to install.

```sh
npm run preview       # build, then serve dist/ at http://localhost:8080
```

## Deploy

Upload `dist/` as-is.

| Host | What to set |
| --- | --- |
| Netlify | publish directory `dist`, build command `node build.mjs` |
| Vercel | output directory `dist`, framework preset **Other** |
| Cloudflare Pages | build output directory `dist`, build command `node build.mjs` |
| GitHub Pages | already wired up: `.github/workflows/pages.yml` builds and deploys on every push to `main` |
| nginx / Caddy / S3 | serve `dist/` as the document root |

If the site is served from a sub-path, build with `BASE_PATH=/that/path/ node build.mjs`
so the 404 page's link home points at the right place. The Pages workflow sets
this for you.

`404.html` is picked up automatically by Netlify, Vercel, Cloudflare Pages and
GitHub Pages. For nginx, wire it up explicitly:

```nginx
root /srv/cuckdoc;
error_page 404 /404.html;
```

Everything is same-origin and cacheable. The only outbound requests the page
makes are to `fonts.googleapis.com` and `fonts.gstatic.com`; every font has a
real fallback stack, so the tool works unchanged if those are blocked.

## Offline / air-gapped

Fonts are the only remaining network dependency. To cut it, download the four
families into `vendor/fonts/`, replace the `<link rel="stylesheet">` in
`src/app.html` and `src/404.html` with local `@font-face` rules, and copy the
directory in `build.mjs` next to the `marked.min.js` copy.

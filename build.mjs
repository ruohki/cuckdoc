#!/usr/bin/env node
//
// Builds the deployable static site in dist/ from src/.
//
// The files in src/ are page *fragments* — the same shape the Claude artifact
// host publishes, with no <!doctype>, <html>, <head> or <body> of their own.
// That host injects a small reset and the charset/viewport meta; a plain static
// host injects nothing, so this script supplies the document skeleton those
// fragments assume. It also points the markdown library at the vendored copy in
// vendor/ so a deployment has no runtime dependency on a CDN.
//
//   node build.mjs
//   BASE_PATH=/cuckdoc/ node build.mjs     # when served from a sub-path
//
// Output: dist/index.html, dist/404.html, dist/vendor/marked.min.js

import { readFile, writeFile, mkdir, rm, copyFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, 'dist');

const MARKED_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/marked/4.3.0/marked.min.js';
const MARKED_LOCAL = 'vendor/marked.min.js';

// Where the site is mounted. The 404 page is served for arbitrarily deep paths,
// so its link home must be absolute — and on a GitHub Pages project site that
// is /<repo>/, not /. Everything else in the build is already relative.
const BASE_PATH = (process.env.BASE_PATH || '/').replace(/\/*$/, '/');
const HOME_LINK = 'class="home" href="/"';

// The `md` badge, as the favicon. Inline so the build stays a single artifact.
const FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E" +
  "%3Crect width='32' height='32' rx='7' fill='%232D5BD7'/%3E" +
  "%3Ctext x='16' y='21' text-anchor='middle' font-family='monospace' font-size='13' " +
  "font-weight='600' fill='%23ffffff'%3Emd%3C/text%3E%3C/svg%3E";

// What the artifact host provides for free and a static host does not. The
// [hidden] rule earns its place: .manual and .crash set `display`, which beats
// the user-agent [hidden] rule on specificity and would leave the error banner
// and the manual-copy dialog permanently on screen.
const RESET = [
  'html{color-scheme:light dark}',
  'body{margin:0}',
  'img{max-width:100%}',
  '[hidden]{display:none!important}'
].join('');

/**
 * Split a fragment at the first top-level element into head content and body
 * content, lifting its <title> out so it can sit in a real <head>.
 */
function split(fragment, marker, file) {
  const at = fragment.indexOf(marker);
  if (at === -1) {
    throw new Error(`build: ${file} no longer contains ${marker} — update the marker in build.mjs`);
  }
  const titleMatch = fragment.slice(0, at).match(/<title>([\s\S]*?)<\/title>/);
  if (!titleMatch) throw new Error(`build: ${file} has no <title>`);

  return {
    title: titleMatch[1].trim(),
    head: fragment.slice(0, at).replace(/<title>[\s\S]*?<\/title>/, '').trim(),
    body: fragment.slice(at).trim()
  };
}

function page({ title, description, head, body }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="${description}">
<meta name="theme-color" content="#2D5BD7">
<title>${title}</title>
<link rel="icon" href="${FAVICON}">
<style>${RESET}</style>
${head}
</head>
<body>
${body}
</body>
</html>
`;
}

async function build() {
  await rm(dist, { recursive: true, force: true });
  await mkdir(join(dist, 'vendor'), { recursive: true });

  const app = split(await readFile(join(root, 'src/app.html'), 'utf8'), '<div class="app">', 'src/app.html');
  const notFound = split(await readFile(join(root, 'src/404.html'), 'utf8'), '<div class="four">', 'src/404.html');

  if (!app.head.includes(MARKED_CDN)) {
    throw new Error('build: src/app.html no longer loads marked from the expected CDN URL');
  }
  if (!notFound.body.includes(HOME_LINK)) {
    throw new Error('build: src/404.html no longer contains the home link — update HOME_LINK in build.mjs');
  }

  await writeFile(join(dist, 'index.html'), page({
    title: app.title,
    description: 'Paste markdown, press one button, and get Word-ready rich text on your clipboard.',
    head: app.head.replace(MARKED_CDN, MARKED_LOCAL),
    body: app.body
  }));

  await writeFile(join(dist, '404.html'), page({
    title: notFound.title,
    description: 'That page does not exist on Cuckdoc.',
    head: notFound.head,
    body: notFound.body.replace(HOME_LINK, `class="home" href="${BASE_PATH}"`)
  }));

  await copyFile(join(root, 'vendor/marked.min.js'), join(dist, 'vendor/marked.min.js'));

  for (const file of ['index.html', '404.html', 'vendor/marked.min.js']) {
    const { size } = await stat(join(dist, file));
    console.log(`  dist/${file.padEnd(22)} ${(size / 1024).toFixed(1).padStart(7)} kB`);
  }
  console.log('\nStatic build ready. Serve dist/ from any host — no server code required.');
}

build().catch((err) => {
  console.error(err.message);
  process.exit(1);
});

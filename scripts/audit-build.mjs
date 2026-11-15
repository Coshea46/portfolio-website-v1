import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const origin = 'https://www.conoroshea.dev';
const buildDir = resolve(process.argv[2] || join(dirname(fileURLToPath(import.meta.url)), '../dist'));
const errors = [];
const pages = new Map();
const external = new Set();
let localReferences = 0;
let anchorReferences = 0;
const fail = (page, message) => errors.push(`${page}: ${message}`);
const decode = (value) => value.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt);/gi, (_, entity) => {
  if (entity[0] === '#') return String.fromCodePoint(entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10));
  return { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' }[entity.toLowerCase()];
});

async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const groups = await Promise.all(entries.map((entry) => entry.isDirectory() ? filesIn(join(directory, entry.name)) : [join(directory, entry.name)]));
  return groups.flat();
}

function attributes(source) {
  return Object.fromEntries([...source.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)]
    .map((match) => [match[1].toLowerCase(), decode(match[2] ?? match[3] ?? match[4] ?? '')]));
}

async function existingTarget(pathname) {
  const target = resolve(buildDir, `.${decodeURIComponent(pathname)}`);
  const outside = relative(buildDir, target);
  if (outside === '..' || outside.startsWith(`..${sep}`)) return null;
  for (const candidate of [target, join(target, 'index.html'), ...(extname(target) ? [] : [`${target}.html`])]) {
    if (await stat(candidate).then((entry) => entry.isFile()).catch(() => false)) return candidate;
  }
  return null;
}

async function checkReference(page, reference) {
  if (!reference || /^(?:data|blob|mailto|tel|javascript):/i.test(reference)) return;
  let url;
  try { url = new URL(reference, page.canonical); }
  catch { fail(page.name, `invalid URL ${reference}`); return; }
  if (url.origin !== origin) { external.add(url.href); return; }
  localReferences++;
  let target;
  try { target = await existingTarget(url.pathname); }
  catch { fail(page.name, `invalid local path ${reference}`); return; }
  if (!target) { fail(page.name, `missing local target ${reference}`); return; }
  if (url.hash && target.endsWith('.html')) {
    anchorReferences++;
    const anchor = decodeURIComponent(url.hash.slice(1));
    if (anchor && !pages.get(target)?.ids.has(anchor)) fail(page.name, `missing anchor ${reference}`);
  }
}

try {
  const files = await filesIn(buildDir);
  for (const file of files.filter((name) => name.endsWith('.html'))) {
    const html = await readFile(file, 'utf8');
    const name = relative(buildDir, file).split(sep).join('/');
    const route = `/${name}`.replace(/index\.html$/, '').replace(/\.html$/, '').replace(/\/+$/, '') || '/';
    const page = { name, canonical: new URL(route, origin).href, ids: new Set(), refs: [], metadata: new Map(), h1: 0 };
    for (const match of html.matchAll(/<([a-z][\w:-]*)\b([^<>]*?)>/gi)) {
      const tag = match[1].toLowerCase();
      const attrs = attributes(match[2]);
      if ('id' in attrs) {
        if (page.ids.has(attrs.id)) fail(name, `duplicate id "${attrs.id}"`);
        page.ids.add(attrs.id);
      }
      if (tag === 'h1') page.h1++;
      if (tag === 'img' && !('alt' in attrs)) fail(name, `image missing alt attribute: ${attrs.src}`);
      for (const key of ['href', 'src', 'poster', 'data-expand-src']) if (attrs[key]) page.refs.push(attrs[key]);
      if (attrs.srcset && !attrs.srcset.startsWith('data:')) {
        page.refs.push(...attrs.srcset.split(',').map((candidate) => candidate.trim().split(/\s+/)[0]));
      }
      if (tag === 'link' && attrs.rel?.split(/\s+/).includes('canonical')) {
        if (page.metadata.has('canonical')) fail(name, 'multiple canonical links');
        page.metadata.set('canonical', attrs.href);
      }
      if (tag === 'meta') page.metadata.set(attrs.property || attrs.name, attrs.content);
    }
    const title = decode(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').trim();
    if (!title) fail(name, 'missing page title');
    if (page.h1 !== 1) fail(name, `expected one h1; found ${page.h1}`);
    const missingMetadata = [];
    for (const key of ['description', 'canonical', 'og:type', 'og:site_name', 'og:title', 'og:description', 'og:url', 'og:image', 'og:image:alt', 'twitter:card', 'twitter:title', 'twitter:description', 'twitter:image', 'twitter:image:alt']) {
      const value = page.metadata.get(key);
      if (!value?.trim()) missingMetadata.push(key);
      if (/localhost|127\.0\.0\.1|\[::1\]/i.test(value ?? '')) fail(name, `local development URL in ${key}`);
    }
    if (missingMetadata.length) fail(name, `missing metadata: ${missingMetadata.join(', ')}`);
    for (const key of ['canonical', 'og:url']) if (page.metadata.has(key) && page.metadata.get(key) !== page.canonical) fail(name, `${key} must be ${page.canonical}`);
    for (const key of ['og:image', 'twitter:image']) {
      const value = page.metadata.get(key);
      if (value && !value.startsWith(`${origin}/`)) fail(name, `${key} must use ${origin}`);
      if (value) page.refs.push(value);
    }
    pages.set(file, page);
  }
  if (!pages.size) fail('dist', 'no HTML pages found; run the production build first');
  for (const page of pages.values()) for (const ref of page.refs) await checkReference(page, ref);

  const sitemap = await readFile(join(buildDir, 'sitemap.xml'), 'utf8').catch(() => null);
  const sitemapURLs = new Set();
  if (!sitemap) fail('sitemap.xml', 'missing sitemap');
  else {
    for (const match of sitemap.matchAll(/<loc>([\s\S]*?)<\/loc>/g)) {
      const url = decode(match[1].trim());
      if (sitemapURLs.has(url)) fail('sitemap.xml', `duplicate URL ${url}`);
      sitemapURLs.add(url);
      if (!url.startsWith(`${origin}/`)) fail('sitemap.xml', `URL must use ${origin}: ${url}`);
      await checkReference({ name: 'sitemap.xml', canonical: `${origin}/sitemap.xml` }, url);
    }
    for (const page of pages.values()) if (!sitemapURLs.has(page.canonical)) fail('sitemap.xml', `missing page ${page.canonical}`);
  }
  const robots = await readFile(join(buildDir, 'robots.txt'), 'utf8').catch(() => null);
  if (!robots) fail('robots.txt', 'missing robots.txt');
  else {
    if (!/^User-agent:\s*\*\s*$/im.test(robots) || !/^Allow:\s*\/\s*$/im.test(robots)) fail('robots.txt', 'expected User-agent: * and Allow: /');
    if (!robots.split(/\r?\n/).includes(`Sitemap: ${origin}/sitemap.xml`)) fail('robots.txt', `expected Sitemap: ${origin}/sitemap.xml`);
    if (/localhost|127\.0\.0\.1|\[::1\]/i.test(robots)) fail('robots.txt', 'contains a local development URL');
  }
  console.log(`Audited ${pages.size} pages, ${localReferences} local references, ${anchorReferences} anchors and ${sitemapURLs.size} sitemap URLs. Skipped ${external.size} distinct external URLs.`);
  if (errors.length) {
    console.error(`Build audit failed with ${errors.length} issue(s):\n${errors.map((message) => `- ${message}`).join('\n')}`);
    process.exitCode = 1;
  } else console.log('Build audit passed: routes, assets, anchors, headings, metadata, sitemap and robots.txt.');
} catch (error) {
  console.error(`Build audit failed: ${error.message}. Run npm run build first.`);
  process.exitCode = 1;
}

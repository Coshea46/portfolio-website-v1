# portfolio-website-v1

Personal portfolio built with Astro, YAML and MDX. Vercel builds the static site when changes are pushed to `master`.

## Develop
```bash
npm ci
npm run dev      # http://localhost:4321
```

## Validate for production

```bash
npm run check
npm run build
npm run audit:build
npm run preview  # inspect the generated static site
```

The build audit checks every generated page's routes, assets, anchors, headings, canonical/social metadata, sitemap and robots.txt. External links and browser interactions need separate verification. There are no configured lint or unit-test suites.

Canonical URLs use `https://www.conoroshea.dev`. No environment variables or credentials are required for this static portfolio; linked applications manage their own services.

## Brand assets

The supplied original pixel artwork is retained in `src/assets/brand`. Regenerate the checked-in navbar character and favicons with:

```bash
node scripts/prepare-brand-assets.mjs
```

## Dependency scope

Compatible security patches are locked in `package-lock.json`. Remaining audit advisories require major upgrades to the Astro/image/diagram toolchain. The current site has no server adapter, public image-processing endpoint, untrusted content rendering or user uploads; image processing uses only committed assets at build time. Reassess those advisories before adding any of these capabilities, and keep development servers bound to localhost.

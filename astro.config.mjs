import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import yaml from '@modyfi/vite-plugin-yaml';

export default defineConfig({
  site: 'https://conoroshea.dev',

  integrations: [mdx()],
  vite: {
    plugins: [yaml()],
  },
});

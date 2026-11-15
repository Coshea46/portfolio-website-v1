import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import yaml from '@modyfi/vite-plugin-yaml';

export default defineConfig({
  site: 'https://www.conoroshea.dev',

  integrations: [
    mdx(),
    {
      name: 'separate-vite-caches',
      hooks: {
        'astro:config:setup': ({ command, updateConfig }) => {
          // Builds must not invalidate dependencies used by the running preview.
          updateConfig({ vite: { cacheDir: `node_modules/.vite-${command}` } });
        },
      },
    },
  ],
  vite: {
    plugins: [yaml()],
  },
});

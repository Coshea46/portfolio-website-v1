import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import yaml from '@modyfi/vite-plugin-yaml';

export default defineConfig({
  site: 'https://portfolio-website-v1-puce.vercel.app',
 // update when deployed
  integrations: [mdx()],
  vite: {
    plugins: [yaml()],
  },
});

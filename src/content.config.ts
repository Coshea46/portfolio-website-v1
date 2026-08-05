import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({
    pattern: '**/*.mdx',
    base: './src/content/blog',
    // "judo-clipper/index.mdx"      -> "judo-clipper"
    // "judo-clipper/deep-dive.mdx"  -> "judo-clipper/deep-dive"
    generateId: ({ entry }) =>
      entry
        .replace(/\.mdx?$/, '')
        .replace(/\/?index$/, '')
        .replace(/^\/+/, ''),
  }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    date: z.coerce.date().optional(),
    icon: z.string().optional(),
    tech: z.array(z.string()).optional(),
  }),
});

export const collections = { blog };

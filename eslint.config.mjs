// Minimal flat config. Next.js 16 dropped `next lint`; the production build
// still runs TypeScript via `next build`. Add stricter rules later.
export default [
  {
    ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts', '.next/dev/**'],
  },
];

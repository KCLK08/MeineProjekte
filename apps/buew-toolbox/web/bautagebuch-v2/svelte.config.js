import adapter from '@sveltejs/adapter-static';

const base =
  process.env.BTB_WEB_BASE || '/apps/buew-toolbox/bautagebuch';

export default {
  kit: {
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      fallback: 'index.html',
    }),
    paths: {
      relative: true,
      base,
    },
  },
};

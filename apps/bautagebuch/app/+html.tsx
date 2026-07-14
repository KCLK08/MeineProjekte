import { ScrollViewStyleReset } from 'expo-router/html';
import type { ReactNode } from 'react';

// Web-only root HTML for static rendering / GitHub Pages.
export default function Root({ children }: { children: ReactNode }) {
  return (
    <html lang="de">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />
        <meta name="theme-color" content="#12534b" />
        <title>Bautagebuch</title>
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: responsiveBackground }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

const responsiveBackground = `
body {
  background-color: #eef2f5;
}
@media (prefers-color-scheme: dark) {
  body {
    background-color: #0d3f39;
  }
}`;

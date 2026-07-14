import { WebShell } from '@meineprojekte/ui';

const WEB_URL = 'https://kclk08.github.io/meineprojekte/apps/ds-datenbank/';

export default function App() {
  return <WebShell title="DS-Datenbank" uri={WEB_URL} />;
}

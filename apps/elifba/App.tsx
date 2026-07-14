import { WebShell } from '@meineprojekte/ui';

const WEB_URL = 'https://kclk08.github.io/MeineProjekte/apps/elifba/';

export default function App() {
  return <WebShell title="ELIFBA" uri={WEB_URL} />;
}

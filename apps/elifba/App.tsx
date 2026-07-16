import { WebShell } from '@meineprojekte/ui';

const WEB_URL = 'https://meineprojekte.pages.dev/apps/elifba/';

export default function App() {
  return <WebShell title="ELIFBA" uri={WEB_URL} />;
}

import { WebShell } from '@meineprojekte/ui';

const WEB_URL = 'https://meineprojekte.pages.dev/apps/buew-toolbox/';

export default function App() {
  return <WebShell title="BÜW-Toolbox" uri={WEB_URL} />;
}

import { WebShell } from '@meineprojekte/ui';

// Kein öffentliches Web-Hosting in diesem Repo — Web lokal öffnen (apps/buew-toolbox/web/).
const WEB_URL = '';

export default function App() {
  return <WebShell title="BÜW-Toolbox" uri={WEB_URL} />;
}

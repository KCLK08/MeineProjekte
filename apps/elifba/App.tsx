import { WebShell } from '@meineprojekte/ui';

// Kein öffentliches Web-Hosting in diesem Repo — Web lokal öffnen (apps/elifba/web/).
const WEB_URL = '';

export default function App() {
  return <WebShell title="ELIFBA" uri={WEB_URL} />;
}

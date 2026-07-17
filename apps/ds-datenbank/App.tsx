import { WebShell } from '@meineprojekte/ui';

// Kein öffentliches Web-Hosting in diesem Repo — Web lokal öffnen (apps/ds-datenbank/web/).
const WEB_URL = '';

export default function App() {
  return <WebShell title="DS-Datenbank" uri={WEB_URL} />;
}

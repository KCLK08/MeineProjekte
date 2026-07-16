import { Redirect } from 'expo-router';

/** Settings moved out of the tab bar – keep route for deep links. */
export default function SettingsTabRedirect() {
  return <Redirect href="/settings" />;
}

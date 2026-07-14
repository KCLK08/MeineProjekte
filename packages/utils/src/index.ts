export function formatBuildDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('de-DE', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function apkReleaseTag(slug: string): string {
  return `${slug}-apk-latest`;
}

export function githubReleaseApkUrl(owner: string, repo: string, slug: string, fileName: string): string {
  return `https://github.com/${owner}/${repo}/releases/download/${apkReleaseTag(slug)}/${fileName}`;
}

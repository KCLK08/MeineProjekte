<svelte:head>
  <title>SiteReport</title>
  <meta name="description" content="Offline Baustellen-Protokoll mit Foto und XLSX-Export" />
</svelte:head>

<style>
  :global(:root) {
    --bg: #f6f3ee;
    --ink: #151515;
    --muted: #6a625a;
    --accent: #e07a5f;
    --accent-2: #3d405b;
    --panel: #fffdf9;
    --border: #e7dfd5;
    --radius: 14px;
    font-family: "IBM Plex Sans", "Helvetica Neue", Arial, sans-serif;
  }

  :global(body) {
    margin: 0;
    background: radial-gradient(1200px 800px at 10% -10%, #fdebd2 0%, transparent 60%),
      radial-gradient(900px 700px at 100% 0%, #dbe7f6 0%, transparent 55%),
      var(--bg);
    color: var(--ink);
  }

  :global(*) {
    box-sizing: border-box;
  }
</style>

<slot />

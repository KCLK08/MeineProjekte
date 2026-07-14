import {
  AllyMap,
  InputVillage,
  PlayerInfo,
  PlayerMap,
  UnitSpeedMap,
  VillageMap,
  WorldConfig,
} from "./types";

const COORD_RE = /(\d{1,3})\s*\|\s*(\d{1,3})/g;

export function parsePlayers(text: string): PlayerMap {
  const map: PlayerMap = new Map();
  const lines = text.split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    const parts = line.split(",");
    if (parts.length < 3) continue;
    const id = parts[0].trim();
    const name = decodeMaybe(parts[1].trim());
    const allyId = parts[2].trim();
    const villageCount = Number(parts[3]);
    const points = Number(parts[4]);
    const rank = Number(parts[5]);
    if (id && name) {
      const info: PlayerInfo = {
        playerId: id,
        playerName: name,
        allyId,
        villageCount: Number.isFinite(villageCount) ? villageCount : undefined,
        points: Number.isFinite(points) ? points : undefined,
        rank: Number.isFinite(rank) ? rank : undefined,
      };
      map.set(id, info);
    }
  }
  return map;
}

export function parseAllies(text: string): AllyMap {
  const map: AllyMap = new Map();
  const lines = text.split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    const parts = line.split(",");
    if (parts.length < 3) continue;
    const allyId = parts[0].trim();
    const allyName = decodeMaybe(parts[1].trim());
    const allyTag = decodeMaybe(parts[2].trim());
    if (!allyId || !allyName) continue;
    map.set(allyId, { allyId, allyName, allyTag });
  }
  return map;
}

export function parseVillages(text: string, players: PlayerMap, allies: AllyMap): VillageMap {
  const map: VillageMap = new Map();
  const lines = text.split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    const parts = line.split(",");
    if (parts.length < 5) continue;
    const villageId = parts[0].trim();
    const villageName = decodeMaybe(parts[1].trim());
    const x = Number(parts[2]);
    const y = Number(parts[3]);
    const playerId = parts[4].trim();
    const villagePoints = Number(parts[5]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const player = players.get(playerId);
    const playerName = player?.playerName ?? "Unbekannt";
    const allyId = player?.allyId ?? "0";
    const ally = allies.get(allyId);
    const allyName = ally?.allyName ?? "Kein Stamm";
    const allyTag = ally?.allyTag ?? "-";
    const coord = formatCoord(x, y);
    map.set(coord, {
      villageId,
      villageName,
      playerId,
      playerName,
      allyId,
      allyName,
      allyTag,
      x,
      y,
      points: Number.isFinite(villagePoints) ? villagePoints : undefined,
    });
  }
  return map;
}

export function extractReportIds(text: string) {
  const ids: string[] = [];
  const add = (value: string | undefined) => {
    if (!value) return;
    ids.push(value.toLowerCase());
  };
  const patterns = [
    /\[report\]([a-f0-9]{32})\[\/report\]/gi,
    /public_report\/([a-f0-9]{32})/gi,
    /\b([a-f0-9]{32})\b/gi,
  ];
  for (const regex of patterns) {
    let match: RegExpExecArray | null = null;
    while ((match = regex.exec(text)) !== null) {
      add(match[1]);
    }
  }
  return Array.from(new Set(ids));
}

export function extractReportText(html: string) {
  if (!html) return "";
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    doc.querySelectorAll("script, style, noscript").forEach((node) => node.remove());
    const selectors = [
      "#content_value",
      "#content",
      ".content",
      ".report",
      ".report-container",
      ".report_content",
      "article",
      "main",
    ];
    let raw = "";
    for (const selector of selectors) {
      const node = doc.querySelector(selector);
      if (node && node.textContent) {
        raw = node.textContent;
        break;
      }
    }
    if (!raw) {
      raw = doc.body?.textContent ?? "";
    }
    const cleaned = raw
      .split("\n")
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter((line) => line && !line.startsWith("TribalWars."))
      .join(" ");
    return cleaned.replace(/\s+/g, " ").trim().slice(0, 400);
  } catch {
    return "";
  }
}

export function buildReportSrcDoc(html: string, baseUrl: string) {
  if (!html) return "";
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    doc.querySelectorAll("script, noscript").forEach((node) => node.remove());
    const baseHref = baseUrl ? (baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`) : "";
    const styles = Array.from(doc.querySelectorAll('link[rel="stylesheet"]'))
      .map((link) => link.getAttribute("href"))
      .filter(Boolean) as string[];
    const content = doc.querySelector("#content_value") ?? doc.body;
    const contentHtml = content ? content.outerHTML : "";
    const styleTags = styles
      .map((href) => `<link rel="stylesheet" href="${href}">`)
      .join("\n");
    return `<!doctype html>
<html>
  <head>
    ${baseHref ? `<base href="${baseHref}">` : ""}
    ${styleTags}
    <style>
      body { margin: 0; padding: 0; background: transparent; }
      table { max-width: 100%; }
    </style>
  </head>
  <body>
    ${contentHtml}
  </body>
</html>`;
  } catch {
    return html;
  }
}

export function extractReportTitle(html: string) {
  if (!html) return "";
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    doc.querySelectorAll("script, noscript").forEach((node) => node.remove());
    const selectors = [
      "h1",
      ".report-title",
      ".report_title",
      ".report h2",
      ".report h3",
      ".content h2",
      ".content h3",
      "#content h2",
      "#content_value h2",
    ];
    for (const selector of selectors) {
      const node = doc.querySelector(selector);
      const text = node?.textContent?.trim();
      if (text) return text.replace(/\s+/g, " ").trim();
    }
    const title = doc.title?.trim();
    if (title) return title.replace(/\s+/g, " ").trim();
    return "";
  } catch {
    return "";
  }
}

export type ReportDetails = {
  subject: string;
  battleTime: string;
  headline: string;
  attackerLuck: string;
  attackerLuckPercent: number;
  moral: string;
  attacker: string;
  origin: string;
  attackerTroops: string;
  attackerLosses: string;
  attackerUnits: Record<string, number>;
  attackerLossesUnits: Record<string, number>;
  effects: string;
  defender: string;
  target: string;
  defenderTroops: string;
  defenderLosses: string;
  defenderUnits: Record<string, number>;
  defenderLossesUnits: Record<string, number>;
  loot: string;
  buildings: Record<string, number>;
  loyalty: string;
  buildingDamage: string[];
  spyReport: boolean;
  outcomeDotIcon: string;
  commandIcon: string;
};

export function extractReportDetails(html: string): ReportDetails {
  const empty: ReportDetails = {
    subject: "",
    battleTime: "",
    headline: "",
    attackerLuck: "",
    attackerLuckPercent: 0,
    moral: "",
    attacker: "",
    origin: "",
    attackerTroops: "",
    attackerLosses: "",
    attackerUnits: {},
    attackerLossesUnits: {},
    effects: "",
    defender: "",
    target: "",
    defenderTroops: "",
    defenderLosses: "",
    defenderUnits: {},
    defenderLossesUnits: {},
    loot: "",
    buildings: {},
    loyalty: "",
    buildingDamage: [],
    spyReport: false,
    outcomeDotIcon: "",
    commandIcon: "",
  };
  if (!html) return empty;
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    doc.querySelectorAll("script, style, noscript").forEach((node) => node.remove());

    const textOf = (node: Element | null | undefined) =>
      node?.textContent?.replace(/\s+/g, " ").trim() ?? "";

    const normalize = (value: string) =>
      value.toLowerCase().replace(/\s+/g, " ").replace(/:$/, "").trim();

    const findValueByLabel = (labels: string[]) => {
      const normalized = labels.map(normalize);
      const rows = Array.from(doc.querySelectorAll("tr"));
      for (const row of rows) {
        const cells = Array.from(row.querySelectorAll("th, td"));
        if (cells.length < 2) continue;
        const label = normalize(textOf(cells[0]));
        if (normalized.includes(label)) {
          return textOf(cells[1]);
        }
      }
      const dts = Array.from(doc.querySelectorAll("dt"));
      for (const dt of dts) {
        const label = normalize(textOf(dt));
        if (normalized.includes(label)) {
          const dd = dt.nextElementSibling;
          return textOf(dd);
        }
      }
      return "";
    };

    const findSectionTable = (label: string) => {
      const candidates = Array.from(doc.querySelectorAll("h1, h2, h3, h4, th"));
      const needle = normalize(label);
      for (const node of candidates) {
        const txt = normalize(textOf(node));
        if (txt === needle) {
          const table =
            node.closest("table") ??
            node.parentElement?.querySelector("table") ??
            node.nextElementSibling?.querySelector("table") ??
            node.parentElement?.nextElementSibling?.querySelector("table");
          if (table) return table;
        }
      }
      return null;
    };

    const extractSide = (label: string) => {
      const table = findSectionTable(label);
      if (!table) return { name: "", place: "", troops: "", losses: "" };
      const rows = Array.from(table.querySelectorAll("tr"));
      const byLabel = new Map<string, string>();
      for (const row of rows) {
        const cells = Array.from(row.querySelectorAll("th, td"));
        if (cells.length < 2) continue;
        const key = normalize(textOf(cells[0]));
        const value = textOf(cells[1]);
        if (key) byLabel.set(key, value);
      }
      const troopsRow =
        rows.find((row) => normalize(textOf(row.querySelector("th, td"))) === "truppen") ??
        rows.find((row) => normalize(textOf(row.querySelector("th, td"))) === "einheiten");
      const lossesRow =
        rows.find((row) => normalize(textOf(row.querySelector("th, td"))) === "verluste");
      const troops = troopsRow ? textOf(troopsRow) : "";
      const losses = lossesRow ? textOf(lossesRow) : "";
      return {
        name: byLabel.get("angreifer") ?? byLabel.get("verteidiger") ?? "",
        place: byLabel.get("herkunft") ?? byLabel.get("ziel") ?? "",
        troops,
        losses,
      };
    };

    const parseNumberList = (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) return [];
      const hasSeparators = /[.\s]/.test(trimmed);
      // Forwarded report plain text can collapse table cells into one compact digit blob
      // (e.g. "0013650608012371"). Interpreting that as a single unit count is wrong.
      if (!hasSeparators && /^\d{6,}$/.test(trimmed)) return [];
      return (trimmed.match(/\d[\d.]*/g) ?? [])
        .map((raw) => Number(raw.replace(/\./g, "")))
        .filter((num) => Number.isFinite(num));
    };

    const mapUnitsFromNumbers = (numbers: number[]) => {
      const commonOrder = [
        "spear",
        "sword",
        "axe",
        "spy",
        "light",
        "heavy",
        "ram",
        "catapult",
        "snob",
        "knight",
        "militia",
      ];
      const units: Record<string, number> = {};
      for (let i = 0; i < numbers.length && i < commonOrder.length; i += 1) {
        units[commonOrder[i]] = numbers[i] ?? 0;
      }
      return units;
    };

    const parsePlainTextFallback = (rawText: string): ReportDetails => {
      const normalizedRaw = rawText.replace(/\r/g, "");
      const lines = normalizedRaw
        .split("\n")
        .map((line) => line.replace(/\s+/g, " ").trim())
        .filter(Boolean);

      const readLineValue = (...labels: string[]) => {
        const needles = labels.map((label) => label.toLowerCase().trim());
        for (let index = 0; index < lines.length; index += 1) {
          const line = lines[index];
          const lower = line.toLowerCase();
          for (const needle of needles) {
            const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const re = new RegExp(`^${escaped}(?:\\s*[:\\t]\\s*|\\s+)(.+)$`, "i");
            const match = line.match(re);
            if (match?.[1]) return match[1].trim();
            if (lower === needle || lower === `${needle}:`) {
              for (let next = index + 1; next < lines.length; next += 1) {
                const candidate = lines[next].trim();
                if (!candidate) continue;
                if (/^[a-zäöüß ]+\s*:$/i.test(candidate)) break;
                return candidate;
              }
              return "";
            }
          }
        }
        return "";
      };

      const attacker = readLineValue("Angreifer");
      const defender = readLineValue("Verteidiger");
      const origin = readLineValue("Herkunft");
      const target = readLineValue("Ziel");
      if (!attacker && !defender && !origin && !target) return empty;

      const subject = readLineValue("Betreff");
      const battleTime = readLineValue("Kampfzeit");
      const luckRaw = readLineValue("Glück");
      const attackerLuckPercent =
        Number((luckRaw.match(/([\d.,]+)/)?.[1] ?? "0").replace(",", ".")) || 0;
      const moral = readLineValue("Moral");
      const loot = readLineValue("Beute");
      const loyaltyRaw = lines.find((line) => /^Zustimmung\b/i.test(line)) ?? "";
      const loyalty = loyaltyRaw.trim();
      const buildingDamage = Array.from(
        normalizedRaw.matchAll(/(Schaden durch [^\n]+|[A-Za-zÄÖÜäöüß ]+ beschädigt von Level[^\n]+)/gi)
      ).map((m) => (m[1] ?? "").trim()).filter(Boolean);
      const spyReport = /erspäht|spionage|spähbericht/i.test(normalizedRaw);

      const headlineMatch = normalizedRaw.match(/([^\n]*?(?:hat gewonnen|hat verloren|Unentschieden)[^\n]*)/i);
      const headline = (headlineMatch?.[1] ?? "").trim();

      const attackerSection = (() => {
        const match = normalizedRaw.match(/Angreifer:[\s\S]*?(?=Verteidiger:|$)/i);
        return match?.[0] ?? "";
      })();
      const defenderSection = (() => {
        const match = normalizedRaw.match(/Verteidiger:[\s\S]*?(?=Beute:|Schaden durch|Zustimmung:|Hinweis:|$)/i);
        return match?.[0] ?? "";
      })();

      const attackerTroopsRaw = (attackerSection.match(/Anzahl:\s*([^\n]+)/i)?.[1] ?? "").trim();
      const attackerLossesRaw = (attackerSection.match(/Verluste:\s*([^\n]+)/i)?.[1] ?? "").trim();
      const defenderTroopsRaw = (defenderSection.match(/Anzahl:\s*([^\n]+)/i)?.[1] ?? "").trim();
      const defenderLossesRaw = (defenderSection.match(/Verluste:\s*([^\n]+)/i)?.[1] ?? "").trim();

      const attackerUnits = mapUnitsFromNumbers(parseNumberList(attackerTroopsRaw));
      const attackerLossesUnits = mapUnitsFromNumbers(parseNumberList(attackerLossesRaw));
      const defenderUnits = mapUnitsFromNumbers(parseNumberList(defenderTroopsRaw));
      const defenderLossesUnits = mapUnitsFromNumbers(parseNumberList(defenderLossesRaw));

      return {
        subject,
        battleTime,
        headline,
        attackerLuck: luckRaw,
        attackerLuckPercent,
        moral,
        attacker,
        origin,
        attackerTroops: attackerTroopsRaw || "0",
        attackerLosses: attackerLossesRaw || "0",
        attackerUnits,
        attackerLossesUnits,
        effects: readLineValue("Effekte"),
        defender,
        target,
        defenderTroops: defenderTroopsRaw || "0",
        defenderLosses: defenderLossesRaw || "0",
        defenderUnits,
        defenderLossesUnits,
        loot: loot || "0",
        buildings: {},
        loyalty,
        buildingDamage,
        spyReport,
        outcomeDotIcon: "",
        commandIcon: "",
      };
    };

    const contentRoot =
      doc.querySelector("#content_value") ?? doc.querySelector("#content") ?? doc.body;
    const hasAttackTables =
      Boolean(doc.querySelector("#attack_info_att")) &&
      Boolean(doc.querySelector("#attack_info_def")) &&
      Boolean(doc.querySelector("#attack_info_att_units")) &&
      Boolean(doc.querySelector("#attack_info_def_units"));
    const fullText = textOf(doc.body);
    if (!hasAttackTables) return parsePlainTextFallback(html);
    const h3s = Array.from(contentRoot?.querySelectorAll("h3") ?? []);
    const h4s = Array.from(contentRoot?.querySelectorAll("h4") ?? []);
    const subject = h3s[0]?.textContent?.replace(/\s+/g, " ").trim() ?? findValueByLabel(["Betreff"]);
    const battleTime = h4s[0]?.textContent?.replace(/\s+/g, " ").trim() ?? findValueByLabel(["Kampfzeit", "Kampfzeitpunkt", "Zeit"]);
    const attackerLuck =
      doc.querySelector("#attack_luck b")?.textContent?.replace(/\s+/g, " ").trim() ??
      findValueByLabel(["Angreiferglück", "Glück"]);
    const attackerLuckPercent = Number((attackerLuck.match(/([\d.,]+)/)?.[1] ?? "0").replace(",", ".")) || 0;
    const moral = h4s.find((node) => /moral/i.test(textOf(node)))?.textContent?.replace(/\s+/g, " ").trim() ?? "";
    const effects = (() => {
      const table = doc.querySelector("#attack_info_att");
      const rows = Array.from(table?.querySelectorAll("tr") ?? []);
      for (const row of rows) {
        const cells = Array.from(row.querySelectorAll("th, td"));
        if (cells.length < 2) continue;
        const label = normalize(textOf(cells[0]));
        if (label === "effekte") {
          return textOf(cells[1]).replace(/\s+/g, " ").trim();
        }
      }
      return findValueByLabel(["Effekte", "Effekt"]);
    })();
    const loot = (() => {
      const table = doc.querySelector("#attack_results");
      const rows = Array.from(table?.querySelectorAll("tr") ?? []);
      for (const row of rows) {
        const cells = Array.from(row.querySelectorAll("th, td"));
        if (cells.length < 2) continue;
        const label = normalize(textOf(cells[0]));
        if (label === "beute") {
          const last = cells[cells.length - 1];
          return textOf(last);
        }
      }
      return findValueByLabel(["Beute", "Rohstoffe"]);
    })();

    const loyalty = (() => {
      const match = fullText.match(/Zustimmung[^0-9-]*([0-9-]+)\s*(?:auf|→)\s*([0-9-]+)/i);
      if (match) return `Zustimmung von ${match[1]} auf ${match[2]}`;
      const matchSink = fullText.match(/Zustimmung[^0-9-]*gesunken[^0-9-]*([0-9-]+)\s*(?:auf|→)\s*([0-9-]+)/i);
      if (matchSink) return `Zustimmung von ${matchSink[1]} auf ${matchSink[2]}`;
      const simple = fullText.match(/Zustimmung[^0-9-]*([0-9-]+)/i);
      return simple ? `Zustimmung: ${simple[1]}` : "";
    })();

    const buildingDamage = (() => {
      const rows = Array.from(doc.querySelectorAll("#attack_results tr"));
      const results: string[] = [];
      for (const row of rows) {
        const text = textOf(row);
        if (!text) continue;
        if (/Schaden durch/i.test(text) || /beschädigt von Level/i.test(text)) {
          results.push(text.replace(/\s+/g, " ").trim());
        }
      }
      return results;
    })();

    const spyReport =
      Boolean(doc.querySelector("#attack_spy_resources")) ||
      Boolean(doc.querySelector("#attack_spy_building_data")) ||
      h4s.some((node) => /spionage/i.test(textOf(node)));

    const extractImageIconName = (pattern: RegExp) => {
      const images = Array.from(doc.querySelectorAll("img[src]"));
      for (const img of images) {
        const src = img.getAttribute("src") ?? "";
        const match = src.match(pattern);
        if (match?.[1]) return match[1].toLowerCase();
      }
      return "";
    };

    const outcomeDotIcon = extractImageIconName(/\/graphic\/dots\/([a-z_]+)\.(?:webp|png|gif|jpg|jpeg|svg)/i);
    const commandIcon = extractImageIconName(
      /\/graphic\/command\/(attack_small|attack_medium|attack_large)\.(?:webp|png|gif|jpg|jpeg|svg)/i
    );

    let headline = h3s.find((node, idx) => idx > 0 && /hat gewonnen|hat verloren|unentschieden/i.test(textOf(node)))?.textContent?.replace(/\s+/g, " ").trim() ?? "";
    const headlineCandidates = Array.from(doc.querySelectorAll("h1, h2, h3, .report-title, .report_title"));
    for (const node of headlineCandidates) {
      const t = textOf(node);
      if (t && /hat gewonnen|hat verloren|unentschieden/i.test(t)) {
        headline = t;
        break;
      }
    }
    if (!headline) {
      const bodyText = textOf(doc.body);
      const match = bodyText.match(/([A-Za-zÄÖÜäöüß0-9_ ]+\s+hat\s+(gewonnen|verloren)|Unentschieden)/i);
      if (match) headline = match[0].trim();
    }

    const attackerSide = extractSide("Angreifer");
    const defenderSide = extractSide("Verteidiger");

    const extractUnits = (tableId: string) => {
      const table = doc.querySelector(`#${tableId}`);
      if (!table) return { troops: "", losses: "", units: {} as Record<string, number>, lossesUnits: {} as Record<string, number> };
      const headerRow = table.querySelector("tr.center");
      const unitCells = Array.from(headerRow?.querySelectorAll("a.unit_link") ?? []);
      const units = unitCells.map((link) => link.getAttribute("data-unit") ?? "");
      const rows = Array.from(table.querySelectorAll("tr"));
      const readRow = (label: string) => {
        const row = rows.find((r) => normalize(textOf(r.querySelector("td, th"))) === normalize(label));
        if (!row) return { text: "", map: {} as Record<string, number> };
        const counts = Array.from(row.querySelectorAll("td[data-unit-count]"));
        const pairs: string[] = [];
        const map: Record<string, number> = {};
        counts.forEach((cell, idx) => {
          const count = cell.getAttribute("data-unit-count") ?? cell.textContent ?? "";
          const value = String(count).trim() || "0";
          const unit = units[idx] ?? `unit${idx + 1}`;
          const num = Number(value.replace(/\./g, "")) || 0;
          map[unit] = num;
          pairs.push(`${unit}: ${num}`);
        });
        return { text: pairs.join(", "), map };
      };
      const troops = readRow("Anzahl");
      const losses = readRow("Verluste");
      return {
        troops: troops.text,
        losses: losses.text,
        units: troops.map,
        lossesUnits: losses.map,
      };
    };

    const attackerUnits = extractUnits("attack_info_att_units");
    const defenderUnits = extractUnits("attack_info_def_units");

    const parseLevel = (value: unknown) => {
      if (typeof value === "number" && Number.isFinite(value)) return value;
      const text = String(value ?? "");
      const numeric = Number(text.replace(/[^\d-]/g, ""));
      if (Number.isFinite(numeric)) return numeric;
      const match = text.match(/-?\d+/);
      return match ? Number(match[0]) : 0;
    };

    const tryParseLevel = (value: unknown): number | null => {
      if (value == null) return null;
      const parsed = parseLevel(value);
      if (!Number.isFinite(parsed)) return null;
      // Building levels are positive in report context; 0 usually means parse failure/no data.
      return parsed > 0 ? parsed : null;
    };

    const resolveBuildingKey = (value: string) => {
      const normalized = value.trim().toLowerCase();
      const map: Record<string, string> = {
        "hauptgebäude": "main",
        "kaserne": "barracks",
        "stall": "stable",
        "werkstatt": "garage",
        "kirche": "church",
        "erste kirche": "church_f",
        "schmiede": "smith",
        "versammlungsplatz": "place",
        "marktplatz": "market",
        "holzfäller": "wood",
        "lehmgrube": "stone",
        "eisenmine": "iron",
        "bauernhof": "farm",
        "speicher": "storage",
        "versteck": "hide",
        "wall": "wall",
        "akademie": "snob",
        "wachturm": "watchtower",
      };
      if (map[normalized]) return map[normalized];
      return normalized.replace(/\s+/g, "_");
    };

    const buildings = (() => {
      const result: Record<string, number> = {};
      const container = doc.querySelector("#attack_spy_building_data");
      if (!container) return result;

      const input = container.matches("input")
        ? (container as HTMLInputElement)
        : (container.querySelector("input") as HTMLInputElement | null);
      const raw = input?.getAttribute("value") ?? "";
      if (raw) {
        try {
          const decoded = raw.replace(/&quot;/g, "\"");
          const parsed = JSON.parse(decoded);
          if (Array.isArray(parsed)) {
            for (const item of parsed) {
              if (Array.isArray(item) && item.length >= 2) {
                const key = resolveBuildingKey(String(item[0] ?? ""));
                if (!key) continue;
                const level = tryParseLevel(item[1]);
                if (level != null) result[key] = level;
                continue;
              }
              if (!item || typeof item !== "object") continue;
              const rec = item as Record<string, unknown>;
              const rawName = String(rec.name ?? rec.building ?? "").trim();
              if (!rawName) continue;
              const key = resolveBuildingKey(rawName);
              const level = tryParseLevel(rec.level ?? rec.value ?? rec.amount);
              if (level != null) result[key] = level;
            }
          } else if (parsed && typeof parsed === "object") {
            for (const [rawName, rawLevel] of Object.entries(parsed as Record<string, unknown>)) {
              const key = resolveBuildingKey(rawName);
              if (!key) continue;
              const level = tryParseLevel(rawLevel);
              if (level != null) result[key] = level;
            }
          }
        } catch {
          // Fall through to table/icon parsing.
        }
      }

      if (Object.keys(result).length === 0) {
        const extractLevelFromRow = (row: Element) => {
          const attrCandidates: Array<string | null> = [
            row.getAttribute("data-level"),
            row.getAttribute("data-building-level"),
            row.getAttribute("title"),
          ];
          for (const cell of Array.from(row.querySelectorAll("td,th,span,div,img"))) {
            attrCandidates.push(
              cell.getAttribute("data-level"),
              cell.getAttribute("data-building-level"),
              cell.getAttribute("title"),
              cell.getAttribute("data-original-title"),
              cell.getAttribute("alt")
            );
          }
          for (const candidate of attrCandidates) {
            const level = tryParseLevel(candidate);
            if (level != null) return level;
          }
          const cells = Array.from(row.querySelectorAll("th,td"));
          if (cells.length > 1) {
            const fromLastCell = tryParseLevel(textOf(cells[cells.length - 1]));
            if (fromLastCell != null) return fromLastCell;
          }
          return null;
        };

        const rows = Array.from(container.querySelectorAll("tr"));
        for (const row of rows) {
          const img = row.querySelector("img[src*=\"/graphic/buildings/\"]") as HTMLImageElement | null;
          let key = "";
          if (img?.src) {
            const match = img.src.match(/\/buildings\/([a-z_]+)\./i);
            if (match?.[1]) key = match[1].toLowerCase();
          }
          const cells = Array.from(row.querySelectorAll("th,td"));
          const labelText = cells.length > 0 ? textOf(cells[0]) : "";
          if (!key && labelText) key = resolveBuildingKey(labelText);
          if (!key) continue;
          const level = extractLevelFromRow(row);
          if (level != null) result[key] = level;
        }
      }

      return result;
    })();

    const regexValue = (label: string) => {
      const re = new RegExp(`${label}\\s*:?\\s*([^\\n]+)`, "i");
      const m = fullText.match(re);
      return m ? m[1].trim() : "";
    };

    const attacker = attackerSide.name || regexValue("Angreifer");
    const origin = attackerSide.place || regexValue("Herkunft");
    const attackerTroops = attackerUnits.troops || attackerSide.troops || regexValue("Truppen");
    const attackerLosses = attackerUnits.losses || attackerSide.losses || regexValue("Verluste");
    const defender = defenderSide.name || regexValue("Verteidiger");
    const target = defenderSide.place || regexValue("Ziel");
    const defenderTroops = defenderUnits.troops || defenderSide.troops || "";
    const defenderLosses = defenderUnits.losses || defenderSide.losses || "";

    return {
      subject,
      battleTime,
      headline,
      attackerLuck,
      attackerLuckPercent,
      moral,
      attacker,
      origin,
      attackerTroops: attackerTroops || "0",
      attackerLosses: attackerLosses || "0",
      attackerUnits: attackerUnits.units,
      attackerLossesUnits: attackerUnits.lossesUnits,
      effects,
      defender,
      target,
      defenderTroops: defenderTroops || "0",
      defenderLosses: defenderLosses || "0",
      defenderUnits: defenderUnits.units,
      defenderLossesUnits: defenderUnits.lossesUnits,
      loot: loot || "0",
      buildings,
      loyalty,
      buildingDamage,
      spyReport,
      outcomeDotIcon,
      commandIcon,
    };
  } catch {
    return empty;
  }
}

export function parseConfig(text: string): WorldConfig {
  if (text.trim().startsWith("<")) {
    return parseConfigXml(text);
  }
  const lines = text.split(/\r?\n/);
  const config: WorldConfig = { speed: 1, unitSpeed: 1 };
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [key, value] = trimmed.split("=");
    if (!value) continue;
    if (key === "speed") config.speed = Number(value);
    if (key === "unit_speed") config.unitSpeed = Number(value);
  }
  if (!Number.isFinite(config.speed) || config.speed <= 0) config.speed = 1;
  if (!Number.isFinite(config.unitSpeed) || config.unitSpeed <= 0) config.unitSpeed = 1;
  return config;
}

export function parseUnitInfo(text: string): UnitSpeedMap {
  if (text.trim().startsWith("<")) {
    return parseUnitInfoXml(text);
  }
  const map: UnitSpeedMap = new Map();
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return map;

  const headerParts = lines[0].split(",");
  const hasHeader = headerParts[0].trim().toLowerCase() === "unit";
  const speedIndex = hasHeader
    ? headerParts.findIndex((p) => p.trim().toLowerCase() === "speed")
    : -1;

  const startIndex = hasHeader ? 1 : 0;
  for (let i = startIndex; i < lines.length; i += 1) {
    const parts = lines[i].split(",");
    if (parts.length < 2) continue;
    const unit = parts[0].trim();
    const speedPart = speedIndex >= 0 ? parts[speedIndex] : parts[parts.length - 1];
    const speed = Number(speedPart);
    if (!unit || !Number.isFinite(speed)) continue;
    map.set(unit, speed);
  }
  return map;
}

export function parseUnitNames(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("<")) {
    try {
      const doc = new DOMParser().parseFromString(text, "text/xml");
      const nodes = Array.from(doc.documentElement.children);
      const names = nodes
        .map((node) => node.nodeName)
        .filter(Boolean)
        .map((name) => name.toLowerCase().trim());
      return Array.from(new Set(names));
    } catch {
      return [];
    }
  }
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];
  const headerParts = lines[0].split(",");
  const hasHeader = headerParts[0].trim().toLowerCase() === "unit";
  const startIndex = hasHeader ? 1 : 0;
  const names: string[] = [];
  for (let i = startIndex; i < lines.length; i += 1) {
    const parts = lines[i].split(",");
    if (parts.length === 0) continue;
    const unit = parts[0].trim().toLowerCase();
    if (unit) names.push(unit);
  }
  return Array.from(new Set(names));
}

export function parseAttackers(text: string): { entries: InputVillage[]; errors: string[] } {
  const errors: string[] = [];
  const entries: InputVillage[] = [];
  const coords = extractCoords(text);
  for (const coord of coords) {
    const [xRaw, yRaw] = coord.split("|");
    const x = Number(xRaw);
    const y = Number(yRaw);
    const label = undefined;
    entries.push({ coord, x, y, label });
  }
  if (entries.length === 0 && text.trim()) {
    errors.push("Keine gültigen Koordinaten gefunden.");
  }
  return { entries, errors };
}

export function parseTargets(text: string): { entries: InputVillage[]; errors: string[] } {
  const errors: string[] = [];
  const entries: InputVillage[] = [];
  const coords = extractCoords(text);
  for (const coord of coords) {
    const [xRaw, yRaw] = coord.split("|");
    const x = Number(xRaw);
    const y = Number(yRaw);
    entries.push({ coord, x, y });
  }
  if (entries.length === 0 && text.trim()) {
    errors.push("Keine gültigen Ziel-Koordinaten gefunden.");
  }
  return { entries, errors };
}

export function formatCoord(x: number, y: number): string {
  return `${x}|${y}`;
}

export function secondsPerField(
  unitSpeeds: UnitSpeedMap,
  selectedUnits: string[],
  config: WorldConfig
): { seconds: number | null; slowestUnit?: string } {
  if (selectedUnits.length === 0) return { seconds: null };
  let slowest: { unit: string; minutes: number } | null = null;
  for (const unit of selectedUnits) {
    const minutes = unitSpeeds.get(unit);
    if (minutes === undefined) continue;
    if (!slowest || minutes > slowest.minutes) {
      slowest = { unit, minutes };
    }
  }
  if (!slowest) return { seconds: null };
  const baseSeconds = slowest.minutes * 60;
  const seconds = baseSeconds / (config.speed * config.unitSpeed);
  return { seconds, slowestUnit: slowest.unit };
}

export function formatDuration(totalSeconds: number): string {
  const rounded = Math.round(totalSeconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const seconds = rounded % 60;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

export function formatDate(date: Date, tzMode: "local" | "utc"): string {
  const options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: tzMode === "utc" ? "UTC" : undefined,
  };
  return new Intl.DateTimeFormat("de-DE", options).format(date);
}

export function parseDateTime(value: string, tzMode: "local" | "utc"): Date | null {
  if (!value) return null;
  if (tzMode === "utc") {
    const withZ = value.endsWith("Z") ? value : `${value}Z`;
    const date = new Date(withZ);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function pad(num: number): string {
  return String(num).padStart(2, "0");
}

export function normalizeQueryList(value: string): string[] {
  return value
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function extractCoords(text: string): string[] {
  const matches = text.matchAll(COORD_RE);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const match of matches) {
    const x = Number(match[1]);
    const y = Number(match[2]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const coord = formatCoord(x, y);
    if (seen.has(coord)) continue;
    seen.add(coord);
    result.push(coord);
  }
  return result;
}

function decodeMaybe(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return value;
  }
}

function parseConfigXml(text: string): WorldConfig {
  const config: WorldConfig = { speed: 1, unitSpeed: 1 };
  try {
    const doc = new DOMParser().parseFromString(text, "text/xml");
    const speedNode = doc.querySelector("config > speed");
    const unitSpeedNode = doc.querySelector("config > unit_speed");
    if (speedNode?.textContent) config.speed = Number(speedNode.textContent);
    if (unitSpeedNode?.textContent) config.unitSpeed = Number(unitSpeedNode.textContent);
  } catch {
    return config;
  }
  if (!Number.isFinite(config.speed) || config.speed <= 0) config.speed = 1;
  if (!Number.isFinite(config.unitSpeed) || config.unitSpeed <= 0) config.unitSpeed = 1;
  return config;
}

function parseUnitInfoXml(text: string): UnitSpeedMap {
  const map: UnitSpeedMap = new Map();
  try {
    const doc = new DOMParser().parseFromString(text, "text/xml");
    const unitNodes = Array.from(doc.documentElement.children);
    for (const unit of unitNodes) {
      const name = unit.nodeName;
      const speedNode = unit.querySelector("speed");
      if (!speedNode?.textContent) continue;
      const speed = Number(speedNode.textContent);
      if (!Number.isFinite(speed)) continue;
      map.set(name, speed);
    }
  } catch {
    return map;
  }
  return map;
}

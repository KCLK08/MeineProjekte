import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import pako from "pako";
import {
  extractCoords,
  extractReportIds,
  extractReportText,
  extractReportTitle,
  extractReportDetails,
  parseUnitNames,
  formatDate,
  formatDuration,
  normalizeQueryList,
  parseAllies,
  parseAttackers,
  parseConfig,
  parseDateTime,
  parsePlayers,
  parseTargets,
  parseUnitInfo,
  parseVillages,
  secondsPerField,
} from "./utils";
import { AttackRow, UnitSpeedMap, WorldConfig } from "./types";

const DEFAULT_UNITS = [
  "spear",
  "sword",
  "axe",
  "archer",
  "spy",
  "light",
  "marcher",
  "heavy",
  "ram",
  "catapult",
  "knight",
  "snob",
];

const AG_UNIT = "snob";

const OVERVIEW_UNIT_ORDER = [
  "spear",
  "sword",
  "axe",
  "archer",
  "spy",
  "light",
  "marcher",
  "heavy",
  "ram",
  "catapult",
  "knight",
  "snob",
];

const UNIT_LABELS_DE: Record<string, string> = {
  spear: "Speerträger",
  sword: "Schwertkämpfer",
  axe: "Axtkämpfer",
  archer: "Bogenschütze",
  spy: "Späher",
  light: "Leichte Kavallerie",
  marcher: "Berittener Bogenschütze",
  heavy: "Schwere Kavallerie",
  ram: "Rammbock",
  catapult: "Katapult",
  knight: "Paladin",
  snob: "Adelsgeschlecht",
  militia: "Miliz",
};

const BUILDING_ICON_ORDER = [
  "main",
  "barracks",
  "stable",
  "garage",
  "church",
  "snob",
  "smith",
  "place",
  "market",
  "wood",
  "stone",
  "iron",
  "farm",
  "storage",
  "hide",
  "wall",
  "watchtower",
];

const OFF_UNITS = new Set(["axe", "light", "ram", "catapult", "marcher"]);
const DEFF_UNITS = new Set(["spear", "sword", "heavy", "archer"]);
const TROOP_POP: Record<string, number> = {
  spear: 1,
  sword: 1,
  axe: 1,
  archer: 1,
  spy: 2,
  light: 4,
  marcher: 5,
  heavy: 6,
  ram: 5,
  catapult: 8,
  knight: 10,
  snob: 100,
  militia: 0,
};
const STANDDEFF_DEFAULT_UNITS = ["spear", "sword", "archer", "heavy", "spy"];
const OFF_RELOCATE_UNITS = new Set(["axe", "light", "marcher", "ram", "catapult", "knight", "snob"]);
const FORWARDED_EXPORT_CONSOLE_SNIPPET = `(async () => {
  const links = [...new Set(
    [...document.querySelectorAll('a[href*="screen=report"][href*="view="]')]
      .map(a => new URL(a.getAttribute("href") || "", location.origin).toString())
      .filter(Boolean)
  )];
  if (!links.length) { console.log("Keine report view-Links gefunden."); return; }

  const UNIT_ORDER = ["spear","sword","axe","spy","light","heavy","ram","catapult","snob"];
  const BUILDING_LABELS = {
    "Hauptgebäude": "main",
    "Kaserne": "barracks",
    "Stall": "stable",
    "Werkstatt": "garage",
    "Adelshof": "snob",
    "Schmiede": "smith",
    "Versammlungsplatz": "place",
    "Marktplatz": "market",
    "Holzfällerlager": "wood",
    "Lehmgrube": "stone",
    "Eisenmine": "iron",
    "Bauernhof": "farm",
    "Speicher": "storage",
    "Versteck": "hide",
    "Wall": "wall",
    "Wachturm": "watchtower"
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const txt = (node) => (node?.textContent || "").replace(/\\s+/g, " ").trim();
  const norm = (s) => txt({ textContent: String(s || "").replace(/:$/, "") }).toLowerCase();

  const rowValue = (doc, label) => {
    const rows = [...doc.querySelectorAll("tr")];
    const needle = norm(label);
    for (const row of rows) {
      const cells = [...row.querySelectorAll("th,td")];
      if (cells.length < 2) continue;
      if (norm(txt(cells[0])) === needle) return txt(cells[1]);
    }
    return "";
  };

  const unitRow = (table, label) => {
    if (!table) return {};
    const rows = [...table.querySelectorAll("tr")];
    const needle = norm(label);
    for (const row of rows) {
      const cells = [...row.querySelectorAll("th,td")];
      if (!cells.length) continue;
      if (norm(txt(cells[0])) !== needle) continue;
      const unitCells = [...row.querySelectorAll("td.unit-item,th.unit-item")];
      const nums = unitCells.map((cell) => {
        const data = Number(cell.getAttribute("data-unit-count"));
        if (Number.isFinite(data)) return data;
        const raw = txt(cell).replace(/[^\\d-]/g, "");
        const n = Number(raw);
        return Number.isFinite(n) ? n : 0;
      });
      const map = {};
      for (let i = 0; i < UNIT_ORDER.length; i += 1) map[UNIT_ORDER[i]] = nums[i] || 0;
      return map;
    }
    return {};
  };

  const parseBuildings = (doc) => {
    const result = {};
    const rows = [...doc.querySelectorAll("tr")];
    for (const row of rows) {
      const cells = [...row.querySelectorAll("th,td")];
      if (cells.length < 2) continue;
      const name = txt(cells[0]).replace(/:$/, "");
      const key = BUILDING_LABELS[name];
      if (!key) continue;
      const raw = txt(cells[1]).replace(/[^\\d-]/g, "");
      const level = Number(raw);
      if (Number.isFinite(level) && level >= 0) result[key] = level;
    }
    return result;
  };

  const parseOne = (html, url) => {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const view = new URL(url).searchParams.get("view") || "";
    const attInfo = doc.querySelector("#attack_info_att");
    const defInfo = doc.querySelector("#attack_info_def");
    const attUnitsTable = doc.querySelector("#attack_info_att_units");
    const defUnitsTable = doc.querySelector("#attack_info_def_units");
    const awayTable = doc.querySelector("#attack_spy_away");
    const dotMatch = html.match(/\\/graphic\\/dots\\/([a-z_]+)\\.(?:png|webp|gif|svg)/i);

    const subject = rowValue(doc, "Betreff") || txt(doc.querySelector("h2")) || "";
    const report = {
      view,
      subject,
      battleTime: rowValue(doc, "Kampfzeit"),
      attacker: rowValue(attInfo || doc, "Angreifer"),
      origin: rowValue(attInfo || doc, "Herkunft"),
      defender: rowValue(defInfo || doc, "Verteidiger"),
      target: rowValue(defInfo || doc, "Ziel"),
      attackerUnits: unitRow(attUnitsTable, "Anzahl"),
      attackerLosses: unitRow(attUnitsTable, "Verluste"),
      defenderUnits: unitRow(defUnitsTable, "Anzahl"),
      defenderLosses: unitRow(defUnitsTable, "Verluste"),
      outsideUnits: unitRow(awayTable, "Einheiten außerhalb"),
      buildings: parseBuildings(doc),
      loot: rowValue(doc, "Beute"),
      loyalty: rowValue(doc, "Zustimmung"),
      buildingDamage: [
        rowValue(doc, "Schaden durch Rammböcke"),
        rowValue(doc, "Schaden durch Katapultbeschuss")
      ].filter(Boolean),
      outcomeDot: dotMatch ? String(dotMatch[1]).toLowerCase() : "",
    };
    return report;
  };

  const reports = [];
  for (const url of links) {
    try {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) continue;
      const html = await res.text();
      reports.push(parseOne(html, url));
      console.log("ok", url);
    } catch (e) {
      console.warn("skip", url, e);
    }
    await wait(200);
  }

  const out = JSON.stringify(reports, null, 2);
  const world = (location.host.split(".")[0] || "world").toLowerCase();
  const blob = new Blob([out], { type: "application/json;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "forwarded_reports_json_" + world + "_" + Date.now() + ".json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
  console.log("Export fertig:", reports.length, "Reports");
})();`;

type SortKey =
  | "attackerPlayer"
  | "attackerVillage"
  | "attackerCoord"
  | "targetPlayer"
  | "targetVillage"
  | "targetCoord"
  | "distance"
  | "travel"
  | "sendFrom";

type SortDir = "asc" | "desc";

type TzMode = "local" | "utc";

type ArrivalWindow = {
  id: string;
  start: string;
  end: string;
};

type PlanSection = {
  id: string;
  label: string;
  rows: AttackRow[];
};

type OutgoingInsertAttack = {
  id: string;
  commandType: "attack" | "support" | "return";
  commandLabel: string;
  originName: string;
  originCoord: string;
  targetName: string;
  targetCoord: string;
  arrivalAtIso: string;
  arrivalLabel: string;
  rawLine: string;
};

type IncomingInsertAttack = {
  id: string;
  unitLabel: string;
  attackerPlayer: string;
  originName: string;
  originCoord: string;
  targetName: string;
  targetCoord: string;
  distanceLabel: string;
  sentAtLabel: string;
  returnAtLabel: string;
  arrivalAtIso: string;
  arrivalLabel: string;
  rawLine: string;
};

type AttackCommandType = "attack" | "fake" | "ag" | "wallbreaker";
type DefenderTargetType = AttackCommandType;
type TimeTypeFilter = "all" | "attack" | "fake" | "ag" | "wallbreaker";

type AttackSlot = {
  slotId: string;
  sourceRowId: string;
  attackerCoord: string;
  attackerPlayer: string;
  attackerVillage: string;
  attackerX: number;
  attackerY: number;
  type: AttackCommandType;
  unit: string;
  travelSecondsByTarget: Map<string, number>;
};

type DefenseDemand = {
  demandId: string;
  sourceRowId: string;
  targetCoord: string;
  targetPlayer: string;
  targetVillage: string;
  targetX: number;
  targetY: number;
  acceptedTypes: Set<AttackCommandType>;
  allowedAttackerPlayers: Set<string> | null;
};

type PlanMetrics = {
  demandTotal: number;
  demandFulfilled: number;
  demandOpen: number;
  slotsTotal: number;
  slotsUsed: number;
  slotsUnused: number;
  unmetTypeMismatch: number;
  unmetAttackerMismatch: number;
  unmetTimeMismatch: number;
  unmetNoSlots: number;
};

type PlannerTimeEntry = {
  id: string;
  date: string;
  from: string;
  to: string;
  player: string;
  type: TimeTypeFilter;
};

type CoordAttackerRow = {
  id: string;
  coord: string;
  x: number;
  y: number;
  unit: string;
  commandType: AttackCommandType;
  count: number;
};

type TargetCoordRow = {
  id: string;
  coord: string;
  x: number;
  y: number;
  count: number;
  targetType: DefenderTargetType;
  assignedAttacker: string;
};

type PlayersFlowStage = "input" | "review" | "final";
type TribeFlowStage = "tribe" | "players" | "review" | "final";
type FakeUnitSelectionType = "dynamic" | "manual";
type VillageRole = "off" | "deff" | "fake_dorf" | "unknown";
type FakeGroupFilter = "all" | VillageRole;

type FakeArrivalWindow = {
  id: string;
  from: string;
  to: string;
};

type FakeVillageState = {
  coord: string;
  villageId: string;
  villageName: string;
  playerName: string;
  x: number;
  y: number;
  troops: Record<string, number>;
  points: number;
  role: VillageRole;
  usedCount: number;
};

type FakePlanRow = {
  attackType: "fake" | "off" | "ag";
  originCoord: string;
  originVillageId: string;
  targetCoord: string;
  targetVillageId: string;
  sendAt: Date;
  arrivalAt: Date;
  unit: string;
  units: Record<string, number>;
  link: string;
  wbLine: string;
};

type FakeAgChainPreset = "light50_snob1" | "axe100_snob1";

type StanddeffUnitTarget = Record<string, number>;

type StanddeffTransferRow = {
  id: string;
  sourceVillageId: string;
  targetVillageId: string;
  sourceCoord: string;
  sourceName: string;
  targetCoord: string;
  targetName: string;
  units: Record<string, number>;
  etaAtIso: string;
  etaLabel: string;
  deadlineIso: string;
  deadlineLabel: string;
  bufferSeconds: number;
  link: string;
  sourceOwnBefore?: number;
  sourceOwnAfter?: number;
  sourceInVillageBefore?: number;
  sourceInVillageAfter?: number;
};

type StanddeffValidationRow = {
  label: string;
  ok: boolean;
  detail: string;
};

type TabitResultRow = {
  id: string;
  sourceCoord: string;
  sourceName: string;
  sourceVillageId: string;
  targetCoord: string;
  targetName: string;
  targetVillageId: string;
  arrivalIso: string;
  arrivalLabel: string;
  etaSeconds: number;
  sendIso: string;
  sendLabel: string;
  unitPack: Record<string, number>;
  mode: "support" | "attack";
  link: string;
  bufferSeconds: number;
};

type RetimeResultRow = {
  id: string;
  attackerPlayer: string;
  unitPack: Record<string, number>;
  sourceCoord: string;
  sourceName: string;
  sourceVillageId: string;
  targetCoord: string;
  targetName: string;
  targetVillageId: string;
  sendAtIso: string;
  sendAtLabel: string;
  arrivalAtIso: string;
  arrivalAtLabel: string;
  link: string;
};

export default function App() {
  const [playerText, setPlayerText] = useState("");
  const [villageText, setVillageText] = useState("");
  const [allyText, setAllyText] = useState("");
  const [configText, setConfigText] = useState("");
  const [unitInfoText, setUnitInfoText] = useState("");

  const [config, setConfig] = useState<WorldConfig>({ speed: 1, unitSpeed: 1 });
  const [unitSpeeds, setUnitSpeeds] = useState<UnitSpeedMap>(new Map());

  const [attackersText, setAttackersText] = useState("");
  const [targetsText, setTargetsText] = useState("");
  const [attackerMode, setAttackerMode] = useState<"coords" | "players" | "tribe">("coords");
  const [targetMode, setTargetMode] = useState<"coords" | "players" | "tribe">("coords");
  const [attackerPlayerInput, setAttackerPlayerInput] = useState("");
  const [targetPlayerInput, setTargetPlayerInput] = useState("");
  const [attackerPlayers, setAttackerPlayers] = useState<string[]>([]);
  const [targetPlayers, setTargetPlayers] = useState<string[]>([]);
  const [attackerTribeInput, setAttackerTribeInput] = useState("");
  const [targetTribeInput, setTargetTribeInput] = useState("");
  const [attackerExcludedPlayers, setAttackerExcludedPlayers] = useState<string[]>([]);
  const [targetExcludedPlayers, setTargetExcludedPlayers] = useState<string[]>([]);
  const [attackerExcludedCoords, setAttackerExcludedCoords] = useState<string[]>([]);
  const [targetExcludedCoords, setTargetExcludedCoords] = useState<string[]>([]);
  const [attackerActivePlayer, setAttackerActivePlayer] = useState<string>("");
  const [targetActivePlayer, setTargetActivePlayer] = useState<string>("");

  const [arrivalWindows, setArrivalWindows] = useState<ArrivalWindow[]>([]);
  const [tzMode, setTzMode] = useState<TzMode>("local");
  const [unitInfoIncludesSpeed, setUnitInfoIncludesSpeed] = useState(true);
  const [maxPerAttacker, setMaxPerAttacker] = useState(0);
  const [maxPerTarget, setMaxPerTarget] = useState(0);
  const [timeInputDate, setTimeInputDate] = useState(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  });
  const [timeInputFrom, setTimeInputFrom] = useState(() => {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, "0");
    const m = String(now.getMinutes()).padStart(2, "0");
    const s = String(now.getSeconds()).padStart(2, "0");
    return `${h}:${m}:${s}`;
  });
  const [timeInputTo, setTimeInputTo] = useState(() => {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, "0");
    const m = String(now.getMinutes()).padStart(2, "0");
    const s = String(now.getSeconds()).padStart(2, "0");
    return `${h}:${m}:${s}`;
  });
  const [timeInputPlayer, setTimeInputPlayer] = useState("__all__");
  const [timeInputType, setTimeInputType] = useState<TimeTypeFilter>("all");
  const [sendTimeEntries, setSendTimeEntries] = useState<PlannerTimeEntry[]>([]);
  const [arrivalTimeEntries, setArrivalTimeEntries] = useState<PlannerTimeEntry[]>([]);

  const [selectedSlowUnit, setSelectedSlowUnit] = useState("");

  const [sortKey, setSortKey] = useState<SortKey>("sendFrom");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [filter, setFilter] = useState("");
  const [generatedPlans, setGeneratedPlans] = useState<PlanSection[] | null>(null);
  const [planMetrics, setPlanMetrics] = useState<PlanMetrics | null>(null);
  const [planTimingHint, setPlanTimingHint] = useState<string | null>(null);
  const [planTimingDetails, setPlanTimingDetails] = useState<string[]>([]);
  const [plannerNow, setPlannerNow] = useState(Date.now());

  const [activeDbTab, setActiveDbTab] = useState<
    "insert" | "doerfer" | "suche" | "berichte" | "angriffe" | "tools"
  >("insert");
  const [activeDbTool, setActiveDbTool] = useState<
    "" | "angriffsplaner" | "wb_dsu" | "fake_generator" | "standdeff_verteiler"
  >("");
  const [toolsMenuOpen, setToolsMenuOpen] = useState(false);
  const toolsMenuRef = useRef<HTMLDivElement | null>(null);
  const [activeVillagesTab, setActiveVillagesTab] = useState<"truppen" | "gebaeude">("truppen");
  const [activeSearchTab, setActiveSearchTab] = useState<"suche" | "dorffilter">("suche");
  const [activeAttacksTab, setActiveAttacksTab] = useState<"eigene" | "alle" | "tabit" | "retimes">("eigene");
  const [ownAttackFilterPlayer, setOwnAttackFilterPlayer] = useState("");
  const [ownAttackFilterCoord, setOwnAttackFilterCoord] = useState("");
  const [ownAttackFilterType, setOwnAttackFilterType] = useState<"all" | "attack" | "support" | "return">("all");
  const [ownAttackFilterDate, setOwnAttackFilterDate] = useState("");
  const [searchAccountInput, setSearchAccountInput] = useState("");
  const [searchTribeInput, setSearchTribeInput] = useState("");
  const [searchCoordXInput, setSearchCoordXInput] = useState("");
  const [searchCoordYInput, setSearchCoordYInput] = useState("");
  const [searchAccountSuggestOpen, setSearchAccountSuggestOpen] = useState(false);
  const [searchTribeSuggestOpen, setSearchTribeSuggestOpen] = useState(false);
  const [villageFilterPlayerSuggestOpen, setVillageFilterPlayerSuggestOpen] = useState(false);
  const [villageFilterTribeSuggestOpen, setVillageFilterTribeSuggestOpen] = useState(false);
  const [searchCriteria, setSearchCriteria] = useState({
    account: "",
    tribe: "",
    coordX: "",
    coordY: "",
  });
  const [searchHasRun, setSearchHasRun] = useState(false);
  const [searchValidationMessage, setSearchValidationMessage] = useState("");
  const [villageFilterPlayerInput, setVillageFilterPlayerInput] = useState("");
  const [villageFilterTribeInput, setVillageFilterTribeInput] = useState("");
  const [villageFilterMinXInput, setVillageFilterMinXInput] = useState("");
  const [villageFilterMinYInput, setVillageFilterMinYInput] = useState("");
  const [villageFilterMaxXInput, setVillageFilterMaxXInput] = useState("");
  const [villageFilterMaxYInput, setVillageFilterMaxYInput] = useState("");
  const [villageFilterRadiusInput, setVillageFilterRadiusInput] = useState("");
  const [villageFilterCenterXInput, setVillageFilterCenterXInput] = useState("");
  const [villageFilterCenterYInput, setVillageFilterCenterYInput] = useState("");
  const [villageFilterMinPointsInput, setVillageFilterMinPointsInput] = useState("");
  const [villageFilterMaxPointsInput, setVillageFilterMaxPointsInput] = useState("");
  const [villageFilterTypeInput, setVillageFilterTypeInput] = useState<
    "all" | "off" | "deff" | "bunker" | "unknown"
  >("all");
  const [villageFilterCriteria, setVillageFilterCriteria] = useState({
    player: "",
    tribe: "",
    minX: "",
    minY: "",
    maxX: "",
    maxY: "",
    radius: "",
    centerX: "",
    centerY: "",
    minPoints: "",
    maxPoints: "",
    type: "all" as "all" | "off" | "deff" | "bunker" | "unknown",
  });
  const [villageFilterHasRun, setVillageFilterHasRun] = useState(false);
  const [searchVillagePointsHistory, setSearchVillagePointsHistory] = useState<
    Array<{ snapshotAt: string; points: number }>
  >([]);
  const [searchVillagePointsLoading, setSearchVillagePointsLoading] = useState(false);
  const searchAccountSuggestRef = useRef<HTMLDivElement | null>(null);
  const searchTribeSuggestRef = useRef<HTMLDivElement | null>(null);
  const villageFilterPlayerSuggestRef = useRef<HTMLDivElement | null>(null);
  const villageFilterTribeSuggestRef = useRef<HTMLDivElement | null>(null);
  const searchCoordXRef = useRef<HTMLInputElement | null>(null);
  const searchCoordYRef = useRef<HTMLInputElement | null>(null);

  const [dbWorlds, setDbWorlds] = useState<string[]>([]);
  const [dbWorldMeta, setDbWorldMeta] = useState<Record<string, { playerName?: string }>>({});
  const [activeDbWorld, setActiveDbWorld] = useState("");
  const [dbWorldInput, setDbWorldInput] = useState("");
  const [dbWorldBaseInput, setDbWorldBaseInput] = useState("");
  const [dbWorldLoadState, setDbWorldLoadState] = useState<"idle" | "loading" | "error" | "success">("idle");
  const [dbWorldLoadMessage, setDbWorldLoadMessage] = useState("");
  const [dbWorldLastLoaded, setDbWorldLastLoaded] = useState("");
  const [dbSelectedPlayerId, setDbSelectedPlayerId] = useState("");
  const [dbSelectedPlayerName, setDbSelectedPlayerName] = useState("");
  const [dbPlayerSelectInput, setDbPlayerSelectInput] = useState("");
  const [dbWorldPlayerInput, setDbWorldPlayerInput] = useState("");
  const [dbWorldSyncReady, setDbWorldSyncReady] = useState(false);
  const [dbLoadedWorld, setDbLoadedWorld] = useState("");
  const [dbReports, setDbReports] = useState<{ id: string; signature?: string; title: string; content: string; fetchedAt: string; details: ReturnType<typeof extractReportDetails> }[]>([]);
  const [dbReportsLoading, setDbReportsLoading] = useState(false);
  const [dbReportsStatus, setDbReportsStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [dbReportsImportMessage, setDbReportsImportMessage] = useState("");
  const savedReportIdsRef = useRef<Set<string>>(new Set());
  const savedReportSignaturesRef = useRef<Set<string>>(new Set());
  const savedReportSignatureByIdRef = useRef<Map<string, string>>(new Map());
  const DB_API = (() => {
    const lsApi =
      typeof window !== "undefined"
        ? (window.localStorage.getItem("apiBaseUrl") || "").trim()
        : "";
    const envApi = ((import.meta as any)?.env?.VITE_API_BASE_URL || "").trim();
    const base = (lsApi || envApi).replace(/\/+$/, "");
    if (base) return base;
    if (typeof window !== "undefined") {
      const host = window.location.hostname || "localhost";
      if (host === "localhost" || host === "127.0.0.1") {
        return "http://localhost:4174";
      }
    }
    return "";
  })();
  const pendingReportIdsRef = useRef<string[]>([]);
  const resetTimersRef = useRef<Record<string, number>>({});
  const dbWorldsLoadedRef = useRef(false);
  const insertsHydratingRef = useRef(false);
  const hoverHideTimerRef = useRef<number | null>(null);
  const searchMapCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hoveredReportId, setHoveredReportId] = useState<string | null>(null);
  const [hoverPos, setHoverPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [hoverHeight, setHoverHeight] = useState(520);
  const [reportViewerId, setReportViewerId] = useState<string | null>(null);
  const [reportViewerLoading, setReportViewerLoading] = useState(false);
  const [reportViewerError, setReportViewerError] = useState("");
  const [attackTypeHover, setAttackTypeHover] = useState<{
    top: number;
    left: number;
    title: string;
    lines: string[];
  } | null>(null);

  const [dbVillageEntries, setDbVillageEntries] = useState<
    {
      player: string;
      village: string;
      coord: string;
      troops: Record<string, number>;
      troopsOwn?: Record<string, number>;
      troopsInVillage?: Record<string, number>;
      troopsOutwards?: Record<string, number>;
      troopsMoving?: Record<string, number>;
      troopsTotal?: Record<string, number>;
      buildings: Record<string, number>;
      role: VillageRole;
      isBunker?: boolean;
      updatedAt: string;
      sourceReportId: string;
    }[]
  >([]);
  const [dbVillageFilter, setDbVillageFilter] = useState("");
  const [dbVillageSortKey, setDbVillageSortKey] = useState<"dorf" | "typ">("dorf");
  const [dbVillageSortDir, setDbVillageSortDir] = useState<"asc" | "desc">("asc");
  const [reportsExpanded, setReportsExpanded] = useState(false);
  const [reportResultFilters, setReportResultFilters] = useState<Set<string>>(new Set(["all"]));
  const [reportCommandFilter, setReportCommandFilter] = useState<"all" | "small" | "medium" | "large">("all");
  const [reportUnitFilter, setReportUnitFilter] = useState<"snob" | "spy" | "knight" | null>(null);
  const [reportsRowsPerPage, setReportsRowsPerPage] = useState(10);
  const [reportsAccountFilter, setReportsAccountFilter] = useState("");
  const [reportsTribeFilter, setReportsTribeFilter] = useState("");
  const [reportsCoordX, setReportsCoordX] = useState("");
  const [reportsCoordY, setReportsCoordY] = useState("");
  const [debouncedReportsAccountFilter, setDebouncedReportsAccountFilter] = useState("");
  const [debouncedReportsTribeFilter, setDebouncedReportsTribeFilter] = useState("");
  const [debouncedReportsCoordX, setDebouncedReportsCoordX] = useState("");
  const [debouncedReportsCoordY, setDebouncedReportsCoordY] = useState("");
  const [reportColumns, setReportColumns] = useState<string[]>([
    "attacker",
    "origin",
    "defender",
    "target",
    "battleTime",
    "command",
    "report",
  ]);
  const [reportColumnsOpen, setReportColumnsOpen] = useState(false);
  const [reportColumnsPos, setReportColumnsPos] = useState<{ x: number; y: number } | null>(null);
  const [reportSortKey, setReportSortKey] = useState<string | null>("battleTime");
  const [reportSortDir, setReportSortDir] = useState<"asc" | "desc">("desc");
  const [wbDsuCommands, setWbDsuCommands] = useState("");
  const [wbDsuUvPlan, setWbDsuUvPlan] = useState(false);
  const [wbDsuGroupByPlayer, setWbDsuGroupByPlayer] = useState(false);
  const [wbDsuTransferState, setWbDsuTransferState] = useState<"idle" | "success" | "error">("idle");
  const [wbDsuTransferMessage, setWbDsuTransferMessage] = useState("");
  const [wbDsuGeneratedLinks, setWbDsuGeneratedLinks] = useState<{ label: string; url: string }[]>([]);
  const [fgGroupFilter, setFgGroupFilter] = useState<FakeGroupFilter>("all");
  const [fgAttacksPerButton, setFgAttacksPerButton] = useState(20);
  const [fgOpenDelay, setFgOpenDelay] = useState(250);
  const [fgMaxAttacksPerVillage, setFgMaxAttacksPerVillage] = useState(0);
  const [fgUnitSelectionType, setFgUnitSelectionType] = useState<FakeUnitSelectionType>("dynamic");
  const [fgSendSpy, setFgSendSpy] = useState(true);
  const [fgKeepCatapults, setFgKeepCatapults] = useState(0);
  const [fgFilterRatio, setFgFilterRatio] = useState(false);
  const [fgAvoidNightBonus, setFgAvoidNightBonus] = useState(false);
  const [fgNightBonusBuffer, setFgNightBonusBuffer] = useState(15);
  const [fgTargetCoordsInput, setFgTargetCoordsInput] = useState("");
  const [fgTargetPlayerInput, setFgTargetPlayerInput] = useState("");
  const [fgArrivalWindows, setFgArrivalWindows] = useState<FakeArrivalWindow[]>([]);
  const [fgArrivalFromInput, setFgArrivalFromInput] = useState("");
  const [fgArrivalToInput, setFgArrivalToInput] = useState("");
  const [fgManualUnitsToSend, setFgManualUnitsToSend] = useState<Record<string, number>>({});
  const [fgManualUnitsToKeep, setFgManualUnitsToKeep] = useState<Record<string, number>>({});
  const [fgMixOffEnabled, setFgMixOffEnabled] = useState(false);
  const [fgMixOffCount, setFgMixOffCount] = useState(0);
  const [fgMixOffTargetCoords, setFgMixOffTargetCoords] = useState<string[]>([]);
  const [fgAgChainsEnabled, setFgAgChainsEnabled] = useState(false);
  const [fgAgChainsCount, setFgAgChainsCount] = useState(0);
  const [fgAgChainPreset, setFgAgChainPreset] = useState<FakeAgChainPreset>("light50_snob1");
  const [fgStatusMessage, setFgStatusMessage] = useState("");
  const [fgStatusType, setFgStatusType] = useState<"idle" | "success" | "error">("idle");
  const [fgTotalPossibleAttacks, setFgTotalPossibleAttacks] = useState<number | null>(null);
  const [fgResultRows, setFgResultRows] = useState<FakePlanRow[]>([]);
  const [fgUnusedCoords, setFgUnusedCoords] = useState<string[]>([]);
  const [sdTargetUnits, setSdTargetUnits] = useState<StanddeffUnitTarget>({
    spear: 200,
    sword: 200,
    archer: 0,
    heavy: 0,
    spy: 10,
  });
  const [sdOpenPerBatch, setSdOpenPerBatch] = useState(20);
  const [sdOpenDelay, setSdOpenDelay] = useState(250);
  const [sdSupports, setSdSupports] = useState<StanddeffTransferRow[]>([]);
  const [sdDeffRelocations, setSdDeffRelocations] = useState<StanddeffTransferRow[]>([]);
  const [sdOffRelocations, setSdOffRelocations] = useState<StanddeffTransferRow[]>([]);
  const [sdStatusType, setSdStatusType] = useState<"idle" | "success" | "error">("idle");
  const [sdStatusMessage, setSdStatusMessage] = useState("");
  const [sdCoverageStats, setSdCoverageStats] = useState<{
    threatenedVillages: number;
    fullyCoveredVillages: number;
    openNeeds: number;
    unresolvedOffMoves: number;
    unresolvedSurplusMoves: number;
  } | null>(null);
  const [sdUnresolvedHints, setSdUnresolvedHints] = useState<string[]>([]);
  const [sdValidationRows, setSdValidationRows] = useState<StanddeffValidationRow[]>([]);
  const [tabitUnits, setTabitUnits] = useState<Record<string, number>>(() =>
    Object.fromEntries(OVERVIEW_UNIT_ORDER.map((unit) => [unit, 0]))
  );
  const [tabitFriendshipBonus, setTabitFriendshipBonus] = useState("0%");
  const [tabitUtBooster, setTabitUtBooster] = useState("0%");
  const [tabitResultCount, setTabitResultCount] = useState("10");
  const [tabitIgnorePaladin, setTabitIgnorePaladin] = useState(true);
  const [tabitNoDuplicateTargets, setTabitNoDuplicateTargets] = useState(true);
  const [tabitSendAsSupport, setTabitSendAsSupport] = useState(true);
  const [tabitSosRequest, setTabitSosRequest] = useState("");
  const [tabitStatus, setTabitStatus] = useState("");
  const [tabitResults, setTabitResults] = useState<TabitResultRow[]>([]);
  const [tabitOpenDelay, setTabitOpenDelay] = useState(250);
  const [tabitOpenPerBatch, setTabitOpenPerBatch] = useState(20);
  const [retimeSendAsSupport, setRetimeSendAsSupport] = useState(true);
  const [retimeMaxResults, setRetimeMaxResults] = useState("100");
  const [attackPlannerTab, setAttackPlannerTab] = useState<"angreifer" | "verteidiger" | "zeiten">("angreifer");
  const [attackerCoordRows, setAttackerCoordRows] = useState<CoordAttackerRow[]>([]);
  const [attackerListEditMode, setAttackerListEditMode] = useState(false);
  const [targetCoordRows, setTargetCoordRows] = useState<TargetCoordRow[]>([]);
  const [targetListEditMode, setTargetListEditMode] = useState(false);
  const [attackerPlayersStage, setAttackerPlayersStage] = useState<PlayersFlowStage>("input");
  const [attackerTribeStage, setAttackerTribeStage] = useState<TribeFlowStage>("tribe");
  const [attackerTribeSelectedPlayers, setAttackerTribeSelectedPlayers] = useState<string[]>([]);
  const [targetPlayersStage, setTargetPlayersStage] = useState<PlayersFlowStage>("input");
  const [targetTribeStage, setTargetTribeStage] = useState<TribeFlowStage>("tribe");
  const [targetTribeSelectedPlayers, setTargetTribeSelectedPlayers] = useState<string[]>([]);
  const [attackUnitCount, setAttackUnitCount] = useState(1);
  const [attackCommandType, setAttackCommandType] = useState<AttackCommandType>("attack");
  const [targetDefaultCount, setTargetDefaultCount] = useState(1);
  const [targetDefaultAllowAttack, setTargetDefaultAllowAttack] = useState(true);
  const [targetDefaultAllowFake, setTargetDefaultAllowFake] = useState(false);
  const [targetDefaultAllowAg, setTargetDefaultAllowAg] = useState(false);
  const [targetDefaultAllowWallbreaker, setTargetDefaultAllowWallbreaker] = useState(false);
  const [targetDefaultAssignedAttacker, setTargetDefaultAssignedAttacker] = useState("__all__");
  const [attackerRowsPerPage, setAttackerRowsPerPage] = useState(25);
  const [attackerSearch, setAttackerSearch] = useState("");
  const [targetRowsPerPage, setTargetRowsPerPage] = useState(25);
  const [targetSearch, setTargetSearch] = useState("");
  const reportColumnsDragRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const reportColumnsButtonRef = useRef<HTMLButtonElement | null>(null);

  const [insertSosStatus, setInsertSosStatus] = useState<"idle" | "done">("idle");
  const [insertUnitsStatus, setInsertUnitsStatus] = useState<"idle" | "done">("idle");
  const [insertBuildingsStatus, setInsertBuildingsStatus] = useState<"idle" | "done">("idle");
  const [insertOutgoingStatus, setInsertOutgoingStatus] = useState<"idle" | "done">("idle");

  const [dbPlayerText, setDbPlayerText] = useState("");
  const [dbVillageText, setDbVillageText] = useState("");
  const [dbAllyText, setDbAllyText] = useState("");
  const [dbConfigText, setDbConfigText] = useState("");
  const [dbUnitInfoText, setDbUnitInfoText] = useState("");

  const [insertSosText, setInsertSosText] = useState("");
  const [dbIncomingAttacks, setDbIncomingAttacks] = useState<IncomingInsertAttack[]>([]);
  const [insertForwardedText, setInsertForwardedText] = useState("");
  const [insertUnitsText, setInsertUnitsText] = useState("");
  const [insertBuildingsText, setInsertBuildingsText] = useState("");
  const [insertOutgoingText, setInsertOutgoingText] = useState("");
  const [dbOutgoingAttacks, setDbOutgoingAttacks] = useState<OutgoingInsertAttack[]>([]);

  const [worldCode, setWorldCode] = useState("");
  const [worldBaseUrl, setWorldBaseUrl] = useState("");
  const [worldLoadState, setWorldLoadState] = useState<"idle" | "loading" | "error" | "success">("idle");
  const [worldLoadMessage, setWorldLoadMessage] = useState("");
  const [worldAutoLoaded, setWorldAutoLoaded] = useState(false);

  useEffect(() => {
    if (playerText) {
      localStorage.setItem("ds_players", playerText);
    }
  }, [playerText]);

  useEffect(() => {
    if (villageText) {
      localStorage.setItem("ds_villages", villageText);
    }
  }, [villageText]);

  useEffect(() => {
    if (allyText) {
      localStorage.setItem("ds_allies", allyText);
    }
  }, [allyText]);

  useEffect(() => {
    if (configText) {
      localStorage.setItem("ds_config", configText);
    }
  }, [configText]);

  useEffect(() => {
    if (unitInfoText) {
      localStorage.setItem("ds_unit_info", unitInfoText);
    }
  }, [unitInfoText]);

  useEffect(() => {
    const savedAttackers = localStorage.getItem("ds_attackers") ?? "";
    const savedTargets = localStorage.getItem("ds_targets") ?? "";
    const savedArrivalStart = localStorage.getItem("ds_arrival_start") ?? "";
    const savedArrivalEnd = localStorage.getItem("ds_arrival_end") ?? "";
    const savedAttackerMode = localStorage.getItem("ds_attacker_mode") ?? "coords";
    const savedTargetMode = localStorage.getItem("ds_target_mode") ?? "coords";
    const savedAttackerPlayers = localStorage.getItem("ds_attacker_players_list") ?? "[]";
    const savedTargetPlayers = localStorage.getItem("ds_target_players_list") ?? "[]";
    const savedAttackerTribe = localStorage.getItem("ds_attacker_tribe") ?? "";
    const savedTargetTribe = localStorage.getItem("ds_target_tribe") ?? "";
    const savedAttackerExcludedPlayers = localStorage.getItem("ds_attacker_excluded_players") ?? "[]";
    const savedTargetExcludedPlayers = localStorage.getItem("ds_target_excluded_players") ?? "[]";
    const savedAttackerExcludedCoords = localStorage.getItem("ds_attacker_excluded_coords") ?? "[]";
    const savedTargetExcludedCoords = localStorage.getItem("ds_target_excluded_coords") ?? "[]";
    const savedAttackerCoordRows = localStorage.getItem("ds_attacker_coord_rows") ?? "[]";
    const savedTargetCoordRows = localStorage.getItem("ds_target_coord_rows") ?? "[]";
    const savedPlannerTab = localStorage.getItem("ds_attack_planner_tab") ?? "angreifer";
    const savedAttackerActive = localStorage.getItem("ds_attacker_active_player") ?? "";
    const savedTargetActive = localStorage.getItem("ds_target_active_player") ?? "";
    const savedWindowsRaw = localStorage.getItem("ds_arrival_windows");
    const savedMaxPerAttacker = localStorage.getItem("ds_max_per_attacker") ?? "0";
    const savedMaxPerTarget = localStorage.getItem("ds_max_per_target") ?? "0";
    const savedTimeInputDate = localStorage.getItem("ds_time_input_date") ?? "";
    const savedTimeInputFrom = localStorage.getItem("ds_time_input_from") ?? "";
    const savedTimeInputTo = localStorage.getItem("ds_time_input_to") ?? "";
    const savedTimeInputPlayer = localStorage.getItem("ds_time_input_player") ?? "__all__";
    const savedTimeInputType = localStorage.getItem("ds_time_input_type") ?? "all";
    const savedSendEntriesRaw = localStorage.getItem("ds_send_time_entries") ?? "[]";
    const savedArrivalEntriesRaw = localStorage.getItem("ds_arrival_time_entries") ?? "[]";
    const savedGeneratedPlansRaw = localStorage.getItem("ds_generated_plans") ?? "";
    const savedPlanMetricsRaw = localStorage.getItem("ds_plan_metrics") ?? "";
    setAttackersText(savedAttackers);
    setTargetsText(savedTargets);
    setAttackerMode(
      savedAttackerMode === "players" || savedAttackerMode === "tribe" ? savedAttackerMode : "coords"
    );
    setTargetMode(
      savedTargetMode === "players" || savedTargetMode === "tribe" ? savedTargetMode : "coords"
    );
    setAttackerTribeInput(savedAttackerTribe);
    setTargetTribeInput(savedTargetTribe);
    setAttackerActivePlayer(savedAttackerActive);
    setTargetActivePlayer(savedTargetActive);
    try {
      setAttackerPlayers(JSON.parse(savedAttackerPlayers));
    } catch {
      setAttackerPlayers([]);
    }
    try {
      setTargetPlayers(JSON.parse(savedTargetPlayers));
    } catch {
      setTargetPlayers([]);
    }
    try {
      setAttackerExcludedPlayers(JSON.parse(savedAttackerExcludedPlayers));
    } catch {
      setAttackerExcludedPlayers([]);
    }
    try {
      setTargetExcludedPlayers(JSON.parse(savedTargetExcludedPlayers));
    } catch {
      setTargetExcludedPlayers([]);
    }
    try {
      setAttackerExcludedCoords(JSON.parse(savedAttackerExcludedCoords));
    } catch {
      setAttackerExcludedCoords([]);
    }
    try {
      const parsed = JSON.parse(savedAttackerCoordRows);
      if (Array.isArray(parsed)) {
        const restored = parsed
          .filter((item) => typeof item?.coord === "string")
          .map((item) => {
            const [xRaw, yRaw] = String(item.coord).split("|");
            const x = Number(xRaw);
            const y = Number(yRaw);
            const commandType: AttackCommandType =
              item?.commandType === "fake" ||
              item?.commandType === "ag" ||
              item?.commandType === "wallbreaker"
                ? item.commandType
                : "attack";
            return {
              id: typeof item?.id === "string" && item.id ? item.id : createId(),
              coord: item.coord,
              x: Number.isFinite(x) ? x : 0,
              y: Number.isFinite(y) ? y : 0,
              unit: typeof item?.unit === "string" ? item.unit : "",
              commandType,
              count: Math.max(1, Number(item?.count) || 1),
            };
          });
        setAttackerCoordRows(restored);
      }
    } catch {
      setAttackerCoordRows([]);
    }
    try {
      setTargetExcludedCoords(JSON.parse(savedTargetExcludedCoords));
    } catch {
      setTargetExcludedCoords([]);
    }
    try {
      const parsed = JSON.parse(savedTargetCoordRows);
      if (Array.isArray(parsed)) {
        const restored = parsed
          .filter((item) => typeof item?.coord === "string")
          .map((item) => {
            const [xRaw, yRaw] = String(item.coord).split("|");
            const x = Number(xRaw);
            const y = Number(yRaw);
            const targetType: DefenderTargetType =
              item?.targetType === "attack" ||
              item?.targetType === "fake" ||
              item?.targetType === "ag" ||
              item?.targetType === "wallbreaker"
                ? item.targetType
                : "attack";
            return {
              id: typeof item?.id === "string" && item.id ? item.id : createId(),
              coord: item.coord,
              x: Number.isFinite(x) ? x : 0,
              y: Number.isFinite(y) ? y : 0,
              count: Math.max(1, Number(item?.count) || 1),
              targetType,
              assignedAttacker:
                typeof item?.assignedAttacker === "string" && item.assignedAttacker
                  ? item.assignedAttacker
                  : "__all__",
            };
          });
        setTargetCoordRows(restored);
      }
    } catch {
      setTargetCoordRows([]);
    }
    setMaxPerAttacker(Number(savedMaxPerAttacker) || 0);
    setMaxPerTarget(Number(savedMaxPerTarget) || 0);
    if (savedTimeInputDate) setTimeInputDate(savedTimeInputDate);
    if (savedTimeInputFrom) setTimeInputFrom(savedTimeInputFrom);
    if (savedTimeInputTo) setTimeInputTo(savedTimeInputTo);
    setTimeInputPlayer(savedTimeInputPlayer || "__all__");
    setTimeInputType(
      savedTimeInputType === "attack" ||
        savedTimeInputType === "fake" ||
        savedTimeInputType === "ag" ||
        savedTimeInputType === "wallbreaker"
        ? savedTimeInputType
        : "all"
    );
    setAttackPlannerTab(
      savedPlannerTab === "verteidiger" || savedPlannerTab === "zeiten"
        ? savedPlannerTab
        : "angreifer"
    );
    const savedPlayers = localStorage.getItem("ds_players") ?? "";
    const savedVillages = localStorage.getItem("ds_villages") ?? "";
    const savedAllies = localStorage.getItem("ds_allies") ?? "";
    const savedConfig = localStorage.getItem("ds_config") ?? "";
    const savedUnitInfo = localStorage.getItem("ds_unit_info") ?? "";
    if (savedPlayers) setPlayerText(savedPlayers);
    if (savedVillages) setVillageText(savedVillages);
    if (savedAllies) setAllyText(savedAllies);
    if (savedConfig) setConfigText(savedConfig);
    if (savedUnitInfo) setUnitInfoText(savedUnitInfo);
    const savedWorld = localStorage.getItem("ds_world_code") ?? "";
    const savedBase = localStorage.getItem("ds_world_base") ?? "";
    const savedUnitInfoIncludes = localStorage.getItem("ds_unit_info_includes_speed");
    const savedAutoLoaded = localStorage.getItem("ds_world_auto_loaded") ?? "false";
    if (savedWorld) setWorldCode(savedWorld);
    if (savedBase) setWorldBaseUrl(savedBase);
    if (savedUnitInfoIncludes) setUnitInfoIncludesSpeed(savedUnitInfoIncludes === "true");
    setWorldAutoLoaded(savedAutoLoaded === "true");
    if (savedWindowsRaw) {
      try {
        const parsed = JSON.parse(savedWindowsRaw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setArrivalWindows(
            parsed.map((item) => ({
              id: typeof item.id === "string" ? item.id : createId(),
              start: typeof item.start === "string" ? item.start : "",
              end: typeof item.end === "string" ? item.end : "",
            }))
          );
        }
      } catch {
        // Ignore invalid data.
      }
    } else if (savedArrivalStart || savedArrivalEnd) {
      setArrivalWindows([
        {
          id: createId(),
          start: savedArrivalStart,
          end: savedArrivalEnd,
        },
      ]);
    }
    try {
      const parsed = JSON.parse(savedSendEntriesRaw);
      if (Array.isArray(parsed)) {
        setSendTimeEntries(
          parsed
            .filter((item) => typeof item?.id === "string")
            .map((item) => ({
              id: item.id,
              date: typeof item?.date === "string" ? item.date : "",
              from: typeof item?.from === "string" ? item.from : "",
              to: typeof item?.to === "string" ? item.to : "",
              player: typeof item?.player === "string" ? item.player : "__all__",
              type:
                item?.type === "attack" ||
                item?.type === "fake" ||
                item?.type === "ag" ||
                item?.type === "wallbreaker"
                  ? item.type
                  : "all",
            }))
        );
      }
    } catch {
      setSendTimeEntries([]);
    }
    try {
      const parsed = JSON.parse(savedArrivalEntriesRaw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        setArrivalTimeEntries(
          parsed
            .filter((item) => typeof item?.id === "string")
            .map((item) => ({
              id: item.id,
              date: typeof item?.date === "string" ? item.date : "",
              from: typeof item?.from === "string" ? item.from : "",
              to: typeof item?.to === "string" ? item.to : "",
              player: typeof item?.player === "string" ? item.player : "__all__",
              type:
                item?.type === "attack" ||
                item?.type === "fake" ||
                item?.type === "ag" ||
                item?.type === "wallbreaker"
                  ? item.type
                  : "all",
            }))
        );
      } else if (savedWindowsRaw) {
        try {
          const parsedWindows = JSON.parse(savedWindowsRaw);
          if (Array.isArray(parsedWindows)) {
            setArrivalTimeEntries(
              parsedWindows
                .filter((item) => typeof item?.id === "string")
                .map((item) => {
                  const startRaw = typeof item?.start === "string" ? item.start : "";
                  const endRaw = typeof item?.end === "string" ? item.end : "";
                  const [startDate = "", startTime = ""] = startRaw.split("T");
                  const [endDate = "", endTime = ""] = endRaw.split("T");
                  return {
                    id: item.id,
                    date: startDate || endDate,
                    from: startTime,
                    to: endTime,
                    player: "__all__",
                    type: "all" as TimeTypeFilter,
                  };
                })
            );
          }
        } catch {
          setArrivalTimeEntries([]);
        }
      }
    } catch {
      setArrivalTimeEntries([]);
    }
    if (savedGeneratedPlansRaw) {
      const restoredPlans = deserializeGeneratedPlans(savedGeneratedPlansRaw);
      if (restoredPlans) {
        setGeneratedPlans(restoredPlans);
      }
    }
    if (savedPlanMetricsRaw) {
      try {
        const parsedMetrics = JSON.parse(savedPlanMetricsRaw);
        if (parsedMetrics && typeof parsedMetrics === "object") {
          setPlanMetrics({
            demandTotal: Number(parsedMetrics.demandTotal) || 0,
            demandFulfilled: Number(parsedMetrics.demandFulfilled) || 0,
            demandOpen: Number(parsedMetrics.demandOpen) || 0,
            slotsTotal: Number(parsedMetrics.slotsTotal) || 0,
            slotsUsed: Number(parsedMetrics.slotsUsed) || 0,
            slotsUnused: Number(parsedMetrics.slotsUnused) || 0,
            unmetTypeMismatch: Number(parsedMetrics.unmetTypeMismatch) || 0,
            unmetAttackerMismatch: Number(parsedMetrics.unmetAttackerMismatch) || 0,
            unmetTimeMismatch: Number(parsedMetrics.unmetTimeMismatch) || 0,
            unmetNoSlots: Number(parsedMetrics.unmetNoSlots) || 0,
          });
        }
      } catch {
        setPlanMetrics(null);
      }
    }

    const savedActiveDbWorld = localStorage.getItem("db_active_world") ?? "";
    const bootstrap = async () => {
      try {
        const response = await fetch(`${DB_API}/api/worlds`);
        if (!response.ok) throw new Error("worlds load failed");
        const payload = await response.json();
        const worlds = Array.isArray(payload?.worlds) ? payload.worlds : [];
        const worldCodes = worlds
          .map((item) => item.code)
          .filter((code) => typeof code === "string");
        const metaMap: Record<string, { playerName?: string }> = {};
        for (const item of worlds) {
          if (typeof item?.code === "string" && typeof item?.playerName === "string") {
            metaMap[item.code] = { playerName: item.playerName };
          }
        }
        const withActive =
          savedActiveDbWorld && !worldCodes.includes(savedActiveDbWorld)
            ? [...worldCodes, savedActiveDbWorld]
            : worldCodes;
        if (savedActiveDbWorld && !worldCodes.includes(savedActiveDbWorld)) {
          await fetch(`${DB_API}/api/worlds`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code: savedActiveDbWorld }),
          });
        }
        setDbWorldMeta(metaMap);
        setDbWorlds(withActive);
        if (savedActiveDbWorld) {
          setActiveDbWorld(savedActiveDbWorld);
        } else if (withActive.length > 0) {
          setActiveDbWorld(withActive[0]);
        }
      } catch {
        if (savedActiveDbWorld) {
          setDbWorlds([savedActiveDbWorld]);
          setActiveDbWorld(savedActiveDbWorld);
        }
      } finally {
        dbWorldsLoadedRef.current = true;
      }
    };
    void bootstrap();
  }, []);

  useEffect(() => {
    localStorage.setItem("ds_attackers", attackersText);
  }, [attackersText]);

  useEffect(() => {
    localStorage.setItem("ds_targets", targetsText);
  }, [targetsText]);

  useEffect(() => {
    localStorage.setItem("ds_attacker_mode", attackerMode);
  }, [attackerMode]);

  useEffect(() => {
    localStorage.setItem("ds_target_mode", targetMode);
  }, [targetMode]);

  useEffect(() => {
    localStorage.setItem("ds_attacker_players_list", JSON.stringify(attackerPlayers));
  }, [attackerPlayers]);

  useEffect(() => {
    localStorage.setItem("ds_target_players_list", JSON.stringify(targetPlayers));
  }, [targetPlayers]);

  useEffect(() => {
    localStorage.setItem("ds_attacker_tribe", attackerTribeInput);
  }, [attackerTribeInput]);

  useEffect(() => {
    localStorage.setItem("ds_target_tribe", targetTribeInput);
  }, [targetTribeInput]);

  useEffect(() => {
    localStorage.setItem("ds_attacker_excluded_players", JSON.stringify(attackerExcludedPlayers));
  }, [attackerExcludedPlayers]);

  useEffect(() => {
    localStorage.setItem("ds_target_excluded_players", JSON.stringify(targetExcludedPlayers));
  }, [targetExcludedPlayers]);

  useEffect(() => {
    localStorage.setItem("ds_attacker_excluded_coords", JSON.stringify(attackerExcludedCoords));
  }, [attackerExcludedCoords]);

  useEffect(() => {
    localStorage.setItem("ds_target_excluded_coords", JSON.stringify(targetExcludedCoords));
  }, [targetExcludedCoords]);

  useEffect(() => {
    localStorage.setItem("ds_attacker_coord_rows", JSON.stringify(attackerCoordRows));
  }, [attackerCoordRows]);

  useEffect(() => {
    localStorage.setItem("ds_target_coord_rows", JSON.stringify(targetCoordRows));
  }, [targetCoordRows]);

  useEffect(() => {
    localStorage.setItem("ds_attacker_active_player", attackerActivePlayer);
  }, [attackerActivePlayer]);

  useEffect(() => {
    localStorage.setItem("ds_target_active_player", targetActivePlayer);
  }, [targetActivePlayer]);

  useEffect(() => {
    localStorage.setItem("ds_arrival_windows", JSON.stringify(arrivalWindows));
  }, [arrivalWindows]);

  useEffect(() => {
    localStorage.setItem("ds_max_per_attacker", String(maxPerAttacker));
  }, [maxPerAttacker]);

  useEffect(() => {
    localStorage.setItem("ds_max_per_target", String(maxPerTarget));
  }, [maxPerTarget]);

  useEffect(() => {
    localStorage.setItem("ds_time_input_date", timeInputDate);
  }, [timeInputDate]);

  useEffect(() => {
    localStorage.setItem("ds_time_input_from", timeInputFrom);
  }, [timeInputFrom]);

  useEffect(() => {
    localStorage.setItem("ds_time_input_to", timeInputTo);
  }, [timeInputTo]);

  useEffect(() => {
    localStorage.setItem("ds_time_input_player", timeInputPlayer);
  }, [timeInputPlayer]);

  useEffect(() => {
    localStorage.setItem("ds_time_input_type", timeInputType);
  }, [timeInputType]);

  useEffect(() => {
    localStorage.setItem("ds_send_time_entries", JSON.stringify(sendTimeEntries));
  }, [sendTimeEntries]);

  useEffect(() => {
    localStorage.setItem("ds_arrival_time_entries", JSON.stringify(arrivalTimeEntries));
  }, [arrivalTimeEntries]);

  useEffect(() => {
    localStorage.setItem("ds_world_code", worldCode);
  }, [worldCode]);

  useEffect(() => {
    localStorage.setItem("ds_world_base", worldBaseUrl);
  }, [worldBaseUrl]);

  useEffect(() => {
    localStorage.setItem("ds_world_auto_loaded", String(worldAutoLoaded));
  }, [worldAutoLoaded]);

  useEffect(() => {
    localStorage.setItem("ds_attack_planner_tab", attackPlannerTab);
  }, [attackPlannerTab]);

  useEffect(() => {
    localStorage.setItem("ds_unit_info_includes_speed", String(unitInfoIncludesSpeed));
  }, [unitInfoIncludesSpeed]);

  useEffect(() => {
    if (!toolsMenuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!toolsMenuRef.current) return;
      if (!toolsMenuRef.current.contains(event.target as Node)) {
        setToolsMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, [toolsMenuOpen]);

  useEffect(() => {
    if (!generatedPlans) {
      localStorage.removeItem("ds_generated_plans");
      return;
    }
    localStorage.setItem("ds_generated_plans", serializeGeneratedPlans(generatedPlans));
  }, [generatedPlans]);

  useEffect(() => {
    if (!planMetrics) {
      localStorage.removeItem("ds_plan_metrics");
      return;
    }
    localStorage.setItem("ds_plan_metrics", JSON.stringify(planMetrics));
  }, [planMetrics]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setPlannerNow(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (activeDbWorld) {
      localStorage.setItem("db_active_world", activeDbWorld);
    }
  }, [activeDbWorld]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedReportsAccountFilter(reportsAccountFilter.trim());
      setDebouncedReportsTribeFilter(reportsTribeFilter.trim());
      setDebouncedReportsCoordX(reportsCoordX.trim());
      setDebouncedReportsCoordY(reportsCoordY.trim());
    }, 300);
    return () => window.clearTimeout(timer);
  }, [reportsAccountFilter, reportsTribeFilter, reportsCoordX, reportsCoordY]);

  useEffect(() => {
    if (!activeDbWorld) {
      setDbWorldSyncReady(false);
      setDbLoadedWorld("");
      setDbPlayerText("");
      setDbVillageText("");
      setDbAllyText("");
      setDbConfigText("");
      setDbUnitInfoText("");
      setDbWorldBaseInput("");
      setDbWorldLastLoaded("");
      setDbSelectedPlayerId("");
      setDbSelectedPlayerName("");
      setDbPlayerSelectInput("");
      setDbWorldPlayerInput("");
      setDbWorldLoadState("idle");
      setDbWorldLoadMessage("");
      setDbReports([]);
      setDbReportsLoading(false);
      setDbReportsStatus("idle");
      savedReportIdsRef.current = new Set();
      savedReportSignaturesRef.current = new Set();
      savedReportSignatureByIdRef.current = new Map();
      pendingReportIdsRef.current = [];
      setInsertSosStatus("idle");
      setInsertUnitsStatus("idle");
      setInsertBuildingsStatus("idle");
      setInsertOutgoingStatus("idle");
      setInsertSosText("");
      setInsertForwardedText("");
      setInsertUnitsText("");
      setInsertBuildingsText("");
      setInsertOutgoingText("");
      setDbIncomingAttacks([]);
      setDbOutgoingAttacks([]);
      return;
    }
    pendingReportIdsRef.current = [];
    setDbWorldSyncReady(false);
    setDbLoadedWorld("");
    setDbPlayerText("");
    setDbVillageText("");
    setDbAllyText("");
    setDbConfigText("");
    setDbUnitInfoText("");
    setDbWorldBaseInput("");
    setDbWorldLastLoaded("");
    setDbSelectedPlayerId("");
    setDbSelectedPlayerName("");
    setDbPlayerSelectInput("");
    setDbWorldPlayerInput("");
    setDbReports([]);
    setDbVillageEntries([]);
    setInsertSosText("");
    setInsertForwardedText("");
    setInsertUnitsText("");
    setInsertBuildingsText("");
    setInsertOutgoingText("");
    setDbIncomingAttacks([]);
    setDbOutgoingAttacks([]);
    setDbWorldLoadState("idle");
    setDbWorldLoadMessage("");
    savedReportIdsRef.current = new Set();
    savedReportSignaturesRef.current = new Set();
    savedReportSignatureByIdRef.current = new Map();
    setDbReportsStatus("idle");
    setInsertSosStatus("idle");
    setInsertUnitsStatus("idle");
    setInsertBuildingsStatus("idle");
    setInsertOutgoingStatus("idle");
    const hydrate = async () => {
      const world = activeDbWorld;
      await loadDbWorldMeta(world);
      await loadWorldDataFromBackend(world);
      await loadInsertsFromBackend(world);
      await loadVillageEntriesFromBackend(world);
      await loadReportsFromBackend(world);
      if (activeDbWorld === world) {
        setDbLoadedWorld(world);
        setDbWorldSyncReady(true);
      }
    };
    void hydrate();
  }, [activeDbWorld]);

  const isDbDataReady = dbWorldSyncReady && dbLoadedWorld === activeDbWorld;

  useEffect(() => {
    if (!activeDbWorld) return;
    if (!isDbDataReady) return;
    void saveWorldDataToBackend(activeDbWorld, { players: dbPlayerText });
  }, [activeDbWorld, dbPlayerText, isDbDataReady]);

  useEffect(() => {
    if (!activeDbWorld) return;
    if (!isDbDataReady) return;
    void saveWorldDataToBackend(activeDbWorld, { villages: dbVillageText });
  }, [activeDbWorld, dbVillageText, isDbDataReady]);

  useEffect(() => {
    if (!activeDbWorld) return;
    if (!isDbDataReady) return;
    void saveWorldDataToBackend(activeDbWorld, { allies: dbAllyText });
  }, [activeDbWorld, dbAllyText, isDbDataReady]);

  useEffect(() => {
    if (!activeDbWorld) return;
    if (!isDbDataReady) return;
    void saveWorldDataToBackend(activeDbWorld, { config: dbConfigText });
  }, [activeDbWorld, dbConfigText, isDbDataReady]);

  useEffect(() => {
    if (!activeDbWorld) return;
    if (!isDbDataReady) return;
    void saveWorldDataToBackend(activeDbWorld, { unit_info: dbUnitInfoText });
  }, [activeDbWorld, dbUnitInfoText, isDbDataReady]);

  useEffect(() => {
    if (!activeDbWorld) return;
    if (!isDbDataReady) return;
    void saveDbWorldMeta(activeDbWorld, dbWorldBaseInput || undefined, undefined, undefined, undefined);
  }, [activeDbWorld, dbWorldBaseInput, isDbDataReady]);

  useEffect(() => {
    if (!activeDbWorld) return;
    if (!isDbDataReady) return;
    void saveDbWorldMeta(activeDbWorld, undefined, dbWorldLastLoaded || undefined, undefined, undefined);
  }, [activeDbWorld, dbWorldLastLoaded, isDbDataReady]);

  useEffect(() => {
    if (!activeDbWorld) return;
    if (!dbSelectedPlayerId) return;
    if (!isDbDataReady) return;
    void saveDbWorldMeta(
      activeDbWorld,
      undefined,
      undefined,
      dbSelectedPlayerId,
      dbSelectedPlayerName
    );
  }, [activeDbWorld, dbSelectedPlayerId, dbSelectedPlayerName, isDbDataReady]);

  useEffect(() => {
    if (!activeDbWorld) return;
    if (!isDbDataReady) return;
    void saveInsertsToBackend(activeDbWorld, { sos: insertSosText });
  }, [activeDbWorld, insertSosText, isDbDataReady]);

  useEffect(() => {
    if (!activeDbWorld) return;
    if (!isDbDataReady) return;
    void saveInsertsToBackend(activeDbWorld, {
      incoming_attacks: JSON.stringify(dbIncomingAttacks),
    });
  }, [activeDbWorld, dbIncomingAttacks, isDbDataReady]);

  useEffect(() => {
    if (!activeDbWorld) return;
    if (!isDbDataReady) return;
    const toSave = dedupeReports(dbReports).filter((report) => {
      const signature = report.signature || buildReportSignature(report.details);
      const existingSignature = savedReportSignatureByIdRef.current.get(report.id);
      if (existingSignature && signature && existingSignature === signature) return false;
      if (!existingSignature && signature && savedReportSignaturesRef.current.has(signature)) return false;
      return true;
    });
    if (toSave.length === 0) return;
    void saveReportsToBackend(activeDbWorld, toSave);
  }, [activeDbWorld, dbReports, isDbDataReady]);

  useEffect(() => {
    if (!activeDbWorld) return;
    if (!isDbDataReady) return;
    void saveVillageEntriesToBackend(activeDbWorld, dbVillageEntries);
  }, [activeDbWorld, dbVillageEntries, isDbDataReady]);

  useEffect(() => {
    if (!activeDbWorld) return;
    if (!isDbDataReady) return;
    void saveInsertsToBackend(activeDbWorld, { forwarded: insertForwardedText });
  }, [activeDbWorld, insertForwardedText, isDbDataReady]);

  const enqueueForwardedReportIds = useCallback(
    (ids: string[]) => {
      if (!activeDbWorld) return;
      const normalized = Array.from(
        new Set(
          ids
            .map((id) => id.trim().toLowerCase())
            .filter((id) => /^[a-f0-9]{32}$/.test(id))
        )
      );
      if (normalized.length === 0) return;
      const pending = new Set(pendingReportIdsRef.current.map((id) => id.toLowerCase()));
      const fresh = normalized.filter((id) => !pending.has(id));
      if (fresh.length === 0) return;
      setDbReportsStatus("loading");
      if (dbReportsLoading) {
        pendingReportIdsRef.current = [...pendingReportIdsRef.current, ...fresh];
      } else {
        void loadForwardedReports(fresh);
      }
    },
    [activeDbWorld, dbReportsLoading]
  );

  const importForwardedReportsFromText = useCallback((rawText: string) => {
    const text = rawText.trim();
    if (!text) return 0;
    const sanitizeForwardedBlock = (value: string) => {
      let normalized = value
        .replace(/^===\s*view:\s*\d+\s*===\s*$/gim, "")
        .replace(/\[spoiler\][\s\S]*?\[\/spoiler\]/gi, "")
        .replace(/\$\([\s\S]*?ReportExport\.initExportReport\(\);?/gi, "")
        .trim();

      const lines = normalized
        .split(/\r?\n/)
        .map((line) => line.replace(/\s+/g, " ").trim())
        .filter(Boolean);

      const skipLines = new Set(
        [
          "berichte",
          "alle",
          "angriffe",
          "verteidigung",
          "unterstützung",
          "handel",
          "events",
          "sonstiges",
          "weitergeleitet",
          "öffentlich",
          "filter",
          "ordner",
          "weiterleiten",
          "verschieben",
          "löschen",
          "exportieren",
          "archiv",
          "farm-assistent",
          "raubzug",
          "» truppen in simulator einfügen",
          "» überlebende truppen in simulator einfügen",
        ].map((line) => line.toLowerCase())
      );

      const filteredLines = lines.filter((line) => {
        const lower = line.toLowerCase();
        if (skipLines.has(lower)) return false;
        if (/^\[report_export\]/i.test(lower)) return false;
        if (/^\$\(/.test(line)) return false;
        if (/^reportexport\.initexportreport/i.test(lower)) return false;
        return true;
      });

      const anchorIndex = filteredLines.findIndex((line) =>
        /^(betreff|kampfzeit|angreifer:|verteidiger:|spionage|zustimmung:)/i.test(line)
      );
      const output =
        anchorIndex >= 0
          ? filteredLines.slice(anchorIndex).join("\n")
          : filteredLines.join("\n");

      return output.trim();
    };

    const tagBlocks = Array.from(text.matchAll(/\[report\]([\s\S]*?)\[\/report\]/gi))
      .map((match) => (match[1] || "").trim())
      .filter(Boolean);
    const viewBlocks =
      tagBlocks.length === 0
        ? text
            .split(/(?=^===\s*view:\s*\d+\s*===\s*$)/gim)
            .map((chunk) => chunk.trim())
            .filter((chunk) => chunk.length > 0)
        : [];
    const blocks = tagBlocks.length > 0 ? tagBlocks : viewBlocks.length > 0 ? viewBlocks : [text];

    const existingSignatures = new Set(
      dbReports
        .map((item) => item.signature || buildReportSignature(item.details))
        .filter((sig): sig is string => Boolean(sig))
    );

    const toAppend: Array<{
      id: string;
      signature?: string;
      title: string;
      content: string;
      fetchedAt: string;
      details: ReturnType<typeof extractReportDetails>;
    }> = [];

    for (const block of blocks) {
      const cleanedBlock = sanitizeForwardedBlock(block);
      if (!cleanedBlock) continue;
      const details = normalizeReportDetailsForStorage(extractReportDetails(cleanedBlock));
      if (!details.attacker && !details.defender) continue;
      const signature = buildReportSignature(details);
      if (signature && existingSignatures.has(signature)) continue;
      if (signature) existingSignatures.add(signature);

      const titleFromHtml = extractReportTitle(cleanedBlock).trim();
      const title = titleFromHtml || details.subject || "Weitergeleiteter Bericht";
      const content = extractReportText(cleanedBlock) || cleanedBlock;
      const baseId = signature ? `fwd-${signature.slice(0, 24)}` : `fwd-${createId()}`;
      const fetchedAt = new Date().toISOString();
      toAppend.push({
        id: `${baseId}-${toAppend.length + 1}`,
        signature: signature || undefined,
        title,
        content,
        fetchedAt,
        details,
      });
    }

    if (toAppend.length === 0) return 0;
    setDbReports((prev) => dedupeReports([...prev, ...toAppend]));
    return toAppend.length;
  }, [dbReports]);

  useEffect(() => {
    if (!activeDbWorld) return;
    if (insertsHydratingRef.current) return;
    const trimmed = insertForwardedText.trim();
    if (!trimmed) return;
    // JSON-Import läuft manuell über den Button, damit keine Fehl-Erkennung als Report-IDs passiert.
    if (/^[\[{]/.test(trimmed)) return;
    const reportIds = extractReportIds(insertForwardedText);
    if (reportIds.length > 0) {
      enqueueForwardedReportIds(reportIds);
      setInsertForwardedText("");
      return;
    }
    const imported = importForwardedReportsFromText(insertForwardedText);
    if (imported > 0) {
      setDbReportsStatus("done");
      setInsertForwardedText("");
    } else if (insertForwardedText.trim()) {
      setDbReportsStatus("error");
    }
  }, [activeDbWorld, insertForwardedText, enqueueForwardedReportIds, importForwardedReportsFromText]);

  useEffect(() => {
    if (dbReportsStatus !== "done" && dbReportsStatus !== "error") return;
    const key = "reports";
    const existing = resetTimersRef.current[key];
    if (existing) window.clearTimeout(existing);
    resetTimersRef.current[key] = window.setTimeout(() => {
      setDbReportsStatus("idle");
    }, 3000);
  }, [dbReportsStatus]);

  useEffect(() => {
    if (!dbReportsImportMessage) return;
    if (!/abgeschlossen/i.test(dbReportsImportMessage)) return;
    const key = "reports_import_message";
    const existing = resetTimersRef.current[key];
    if (existing) window.clearTimeout(existing);
    resetTimersRef.current[key] = window.setTimeout(() => {
      setDbReportsImportMessage("");
    }, 60_000);
    return () => {
      const current = resetTimersRef.current[key];
      if (current) window.clearTimeout(current);
    };
  }, [dbReportsImportMessage]);

  useEffect(() => {
    if (!activeDbWorld) return;
    if (dbReportsLoading) return;
    if (pendingReportIdsRef.current.length === 0) return;
    const pending = pendingReportIdsRef.current;
    pendingReportIdsRef.current = [];
    void loadForwardedReports(pending);
  }, [activeDbWorld, dbReportsLoading]);

  useEffect(() => {
    if (!activeDbWorld) return;
    if (!isDbDataReady) return;
    void saveInsertsToBackend(activeDbWorld, { units: insertUnitsText });
  }, [activeDbWorld, insertUnitsText, isDbDataReady]);

  useEffect(() => {
    if (!activeDbWorld) return;
    if (!isDbDataReady) return;
    void saveInsertsToBackend(activeDbWorld, { buildings: insertBuildingsText });
  }, [activeDbWorld, insertBuildingsText, isDbDataReady]);

  useEffect(() => {
    if (!activeDbWorld) return;
    if (!isDbDataReady) return;
    void saveInsertsToBackend(activeDbWorld, { outgoing_attacks: insertOutgoingText });
  }, [activeDbWorld, insertOutgoingText, isDbDataReady]);

  const hasDbPlannerData = useMemo(
    () =>
      Boolean(
        activeDbWorld &&
          (dbPlayerText.trim() ||
            dbVillageText.trim() ||
            dbAllyText.trim() ||
            dbConfigText.trim() ||
            dbUnitInfoText.trim())
      ),
    [activeDbWorld, dbPlayerText, dbVillageText, dbAllyText, dbConfigText, dbUnitInfoText]
  );
  const plannerPlayerText = hasDbPlannerData ? dbPlayerText || playerText : playerText;
  const plannerVillageText = hasDbPlannerData ? dbVillageText || villageText : villageText;
  const plannerAllyText = hasDbPlannerData ? dbAllyText || allyText : allyText;
  const plannerConfigText = hasDbPlannerData ? dbConfigText || configText : configText;
  const plannerUnitInfoText = hasDbPlannerData ? dbUnitInfoText || unitInfoText : unitInfoText;

  const players = useMemo(() => parsePlayers(plannerPlayerText), [plannerPlayerText]);
  const allies = useMemo(() => parseAllies(plannerAllyText), [plannerAllyText]);
  const villages = useMemo(
    () => parseVillages(plannerVillageText, players, allies),
    [plannerVillageText, players, allies]
  );
  const villageIdToCoord = useMemo(() => {
    const map = new Map<string, string>();
    for (const [coord, village] of villages.entries()) {
      const id = String(village.villageId ?? "").trim();
      if (!id) continue;
      map.set(id, coord);
    }
    return map;
  }, [villages]);

  const dbPlayers = useMemo(() => parsePlayers(dbPlayerText), [dbPlayerText]);
  const dbAllies = useMemo(() => parseAllies(dbAllyText), [dbAllyText]);
  const dbAllyMeta = useMemo(() => {
    const map = new Map<
      string,
      {
        rank?: number;
        points?: number;
        members?: number;
        villages?: number;
      }
    >();
    const lines = dbAllyText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    for (const line of lines) {
      const parts = line.split(",");
      if (parts.length < 3) continue;
      const allyId = parts[0]?.trim();
      if (!allyId) continue;
      const members = Number(parts[3]);
      const villages = Number(parts[4]);
      const points = Number(parts[5]);
      const rank = Number(parts[7] ?? parts[6]);
      map.set(allyId, {
        rank: Number.isFinite(rank) ? rank : undefined,
        points: Number.isFinite(points) ? points : undefined,
        members: Number.isFinite(members) ? members : undefined,
        villages: Number.isFinite(villages) ? villages : undefined,
      });
    }
    return map;
  }, [dbAllyText]);
  const dbVillages = useMemo(
    () => parseVillages(dbVillageText, dbPlayers, dbAllies),
    [dbVillageText, dbPlayers, dbAllies]
  );
  const dbSelectedPlayerInfo = useMemo(() => {
    if (dbSelectedPlayerId) {
      const byId = dbPlayers.get(dbSelectedPlayerId);
      if (byId) return byId;
    }
    const selected = dbSelectedPlayerName.trim().toLowerCase();
    if (!selected) return null;
    for (const player of dbPlayers.values()) {
      if (player.playerName.trim().toLowerCase() === selected) return player;
    }
    return null;
  }, [dbPlayers, dbSelectedPlayerId, dbSelectedPlayerName]);
  const dbSelectedPlayerPointsLabel = useMemo(() => {
    if (!dbSelectedPlayerInfo || dbSelectedPlayerInfo.points == null) return "-";
    const points = dbSelectedPlayerInfo.points.toLocaleString("de-DE");
    if (dbSelectedPlayerInfo.rank == null) return points;
    return `${points} (Platz ${dbSelectedPlayerInfo.rank.toLocaleString("de-DE")})`;
  }, [dbSelectedPlayerInfo]);
  const dbSelectedPlayerStats = useMemo(() => {
    const selected = (dbSelectedPlayerName || "").trim().toLowerCase();
    if (!selected) {
      return {
        villageCount: 0,
        offCount: 0,
        deffCount: 0,
        fakeVillageCount: 0,
      };
    }
    const ownVillageCoords = new Set<string>();
    for (const [coord, village] of dbVillages.entries()) {
      if ((village.playerName || "").trim().toLowerCase() === selected) {
        ownVillageCoords.add(coord);
      }
    }
    const ownEntries = dbVillageEntries.filter((entry) => {
      const entryPlayer = (entry.player || "").trim().toLowerCase();
      return ownVillageCoords.has(entry.coord) || entryPlayer === selected;
    });
    return {
      villageCount: ownVillageCoords.size,
      offCount: ownEntries.filter((item) => item.role === "off").length,
      deffCount: ownEntries.filter((item) => item.role === "deff").length,
      fakeVillageCount: ownEntries.filter((item) => item.role === "fake_dorf").length,
    };
  }, [dbSelectedPlayerName, dbVillages, dbVillageEntries]);
  const searchResults = useMemo(() => {
    if (!searchHasRun) return [] as Array<{
      playerId: string;
      playerName: string;
      points: number;
      rank: number;
      tribeName: string;
      tribeTag: string;
      villages: number;
      avgPointsPerVillage: number;
      bestRank: number;
      maxVillages: number;
      maxPoints: number;
      reportsCount: number;
      utReportsCount: number;
      offVillages: number;
      deffVillages: number;
      fakeVillages: number;
      watchtowers: number;
      churches: number;
      totalBashis: number;
      attackerBashis: number;
      defenderBashis: number;
      supporterBashis: number;
      babaNobles: number;
      avgOffLine: string;
      avgFakeLine: string;
      avgDeffTabLine: string;
      avgDeffGrossLine: string;
      avgSendTime: string;
      earliestSendTime: string;
      latestSendTime: string;
    }>;

    const accountNeedle = searchCriteria.account.trim().toLowerCase();
    const tribeNeedle = searchCriteria.tribe.trim().toLowerCase();
    const coordX = searchCriteria.coordX.trim();
    const coordY = searchCriteria.coordY.trim();
    const hasCoordFilter = /^\d{1,3}$/.test(coordX) && /^\d{1,3}$/.test(coordY);
    const coordNeedle = hasCoordFilter ? `${Number(coordX)}|${Number(coordY)}` : "";

    const villageEntriesByCoord = new Map(dbVillageEntries.map((entry) => [entry.coord, entry]));
    const villagesByPlayerId = new Map<string, string[]>();
    for (const [coord, village] of dbVillages.entries()) {
      const list = villagesByPlayerId.get(village.playerId) ?? [];
      list.push(coord);
      villagesByPlayerId.set(village.playerId, list);
    }

    return Array.from(dbPlayers.values())
      .filter((player) => {
        if (accountNeedle && !player.playerName.toLowerCase().includes(accountNeedle)) return false;
        if (tribeNeedle) {
          const ally = dbAllies.get(player.allyId);
          const tribeTag = ally?.allyTag?.toLowerCase() ?? "";
          const tribeName = ally?.allyName?.toLowerCase() ?? "";
          if (!tribeTag.includes(tribeNeedle) && !tribeName.includes(tribeNeedle)) return false;
        }
        if (hasCoordFilter) {
          const coords = villagesByPlayerId.get(player.playerId) ?? [];
          if (!coords.includes(coordNeedle)) return false;
        }
        return true;
      })
      .map((player) => {
        const ally = dbAllies.get(player.allyId);
        const villageCoords = villagesByPlayerId.get(player.playerId) ?? [];
        const villageCount = player.villageCount ?? villageCoords.length;
        const offVillages = villageCoords.filter(
          (coord) => normalizeVillageRole(villageEntriesByCoord.get(coord)?.role) === "off"
        ).length;
        const deffVillages = villageCoords.filter(
          (coord) => normalizeVillageRole(villageEntriesByCoord.get(coord)?.role) === "deff"
        ).length;
        const fakeVillages = villageCoords.filter(
          (coord) => normalizeVillageRole(villageEntriesByCoord.get(coord)?.role) === "fake_dorf"
        ).length;
        const watchtowers = villageCoords.filter(
          (coord) => Number(villageEntriesByCoord.get(coord)?.buildings?.watchtower ?? 0) > 0
        ).length;
        const churches = villageCoords.filter((coord) => {
          const buildings = villageEntriesByCoord.get(coord)?.buildings ?? {};
          return Number(buildings.church ?? 0) > 0 || Number(buildings.church_f ?? 0) > 0;
        }).length;

        let reportsCount = 0;
        let utReportsCount = 0;
        let attackerBashis = 0;
        let defenderBashis = 0;
        let babaNobles = 0;
        let offSamples = 0;
        let fakeSamples = 0;
        let deffTabSamples = 0;
        let deffGrossSamples = 0;
        const offTotals = { axe: 0, light: 0, archer: 0, ram: 0, catapult: 0 };
        const fakeTotals = { axe: 0, light: 0, spy: 0, archer: 0, ram: 0, catapult: 0 };
        const deffTabTotals = { spear: 0, sword: 0, heavy: 0, spy: 0, light: 0, archer: 0 };
        const deffGrossTotals = { spear: 0, sword: 0, heavy: 0, spy: 0, light: 0, archer: 0 };
        const sendTimesSec: number[] = [];
        const nameNeedle = player.playerName.trim().toLowerCase();
        for (const report of dbReports) {
          const attackerName = (report.details?.attacker ?? "").trim().toLowerCase();
          const defenderName = (report.details?.defender ?? "").trim().toLowerCase();
          const isAttacker = attackerName === nameNeedle;
          const isDefender = defenderName === nameNeedle;
          if (!isAttacker && !isDefender) continue;
          reportsCount += 1;
          if (report.details?.spyReport) utReportsCount += 1;
          if (isAttacker) {
            attackerBashis += sumUnits(report.details?.defenderLossesUnits ?? {});
            if (Number(report.details?.attackerUnits?.snob ?? 0) > 0) babaNobles += 1;
            const units = report.details?.attackerUnits ?? {};
            const total = sumUnits(units);
            const likelyFake = total > 0 && (total <= 250 || (Number(units.spy ?? 0) > 0 && total <= 600));
            if (likelyFake) {
              fakeSamples += 1;
              fakeTotals.axe += Number(units.axe ?? 0);
              fakeTotals.light += Number(units.light ?? 0);
              fakeTotals.spy += Number(units.spy ?? 0);
              fakeTotals.archer += Number(units.archer ?? 0);
              fakeTotals.ram += Number(units.ram ?? 0);
              fakeTotals.catapult += Number(units.catapult ?? 0);
            } else {
              offSamples += 1;
              offTotals.axe += Number(units.axe ?? 0);
              offTotals.light += Number(units.light ?? 0);
              offTotals.archer += Number(units.archer ?? 0);
              offTotals.ram += Number(units.ram ?? 0);
              offTotals.catapult += Number(units.catapult ?? 0);
            }
            const sendDate = parseBattleTime(report.details?.battleTime ?? "", report.fetchedAt);
            if (!Number.isNaN(sendDate.getTime())) {
              sendTimesSec.push(
                sendDate.getHours() * 3600 + sendDate.getMinutes() * 60 + sendDate.getSeconds()
              );
            }
          }
          if (isDefender) {
            defenderBashis += sumUnits(report.details?.attackerLossesUnits ?? {});
            const units = report.details?.defenderUnits ?? {};
            const total = sumUnits(units);
            if (total > 0 && total <= 3000) {
              deffTabSamples += 1;
              deffTabTotals.spear += Number(units.spear ?? 0);
              deffTabTotals.sword += Number(units.sword ?? 0);
              deffTabTotals.heavy += Number(units.heavy ?? 0);
              deffTabTotals.spy += Number(units.spy ?? 0);
              deffTabTotals.light += Number(units.light ?? 0);
              deffTabTotals.archer += Number(units.archer ?? 0);
            } else if (total > 3000) {
              deffGrossSamples += 1;
              deffGrossTotals.spear += Number(units.spear ?? 0);
              deffGrossTotals.sword += Number(units.sword ?? 0);
              deffGrossTotals.heavy += Number(units.heavy ?? 0);
              deffGrossTotals.spy += Number(units.spy ?? 0);
              deffGrossTotals.light += Number(units.light ?? 0);
              deffGrossTotals.archer += Number(units.archer ?? 0);
            }
          }
        }

        const points = player.points ?? 0;
        const avgPointsPerVillage = villageCount > 0 ? points / villageCount : 0;
        const avg = (value: number, count: number) => (count > 0 ? Math.round(value / count) : 0);
        const formatTime = (seconds: number) => {
          const s = Math.max(0, Math.floor(seconds));
          const h = String(Math.floor(s / 3600)).padStart(2, "0");
          const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
          const sec = String(s % 60).padStart(2, "0");
          return `${h}:${m}:${sec}`;
        };
        const avgSendTime =
          sendTimesSec.length > 0
            ? formatTime(sendTimesSec.reduce((sum, value) => sum + value, 0) / sendTimesSec.length)
            : "00:00:00";
        const earliestSendTime =
          sendTimesSec.length > 0 ? formatTime(Math.min(...sendTimesSec)) : "00:00:00";
        const latestSendTime =
          sendTimesSec.length > 0 ? formatTime(Math.max(...sendTimesSec)) : "00:00:00";
        return {
          playerId: player.playerId,
          playerName: player.playerName,
          points,
          rank: player.rank ?? 0,
          tribeName: ally?.allyName ?? "Kein Stamm",
          tribeTag: ally?.allyTag ?? "-",
          villages: villageCount,
          avgPointsPerVillage,
          bestRank: player.rank ?? 0,
          maxVillages: villageCount,
          maxPoints: points,
          reportsCount,
          utReportsCount,
          offVillages,
          deffVillages,
          fakeVillages,
          watchtowers,
          churches,
          totalBashis: attackerBashis + defenderBashis,
          attackerBashis,
          defenderBashis,
          supporterBashis: 0,
          babaNobles,
          avgOffLine: `Axt: ${avg(offTotals.axe, offSamples)}, Lkav: ${avg(
            offTotals.light,
            offSamples
          )}, Bogen: ${avg(offTotals.archer, offSamples)}, Ramme: ${avg(
            offTotals.ram,
            offSamples
          )}, Kata: ${avg(offTotals.catapult, offSamples)}`,
          avgFakeLine: `Axt: ${avg(fakeTotals.axe, fakeSamples)}, Lkav: ${avg(
            fakeTotals.light,
            fakeSamples
          )}, Spy: ${avg(fakeTotals.spy, fakeSamples)}, Bogen: ${avg(
            fakeTotals.archer,
            fakeSamples
          )}, Ramme: ${avg(fakeTotals.ram, fakeSamples)}, Kata: ${avg(
            fakeTotals.catapult,
            fakeSamples
          )}`,
          avgDeffTabLine: `Speer: ${avg(deffTabTotals.spear, deffTabSamples)}, Schwert: ${avg(
            deffTabTotals.sword,
            deffTabSamples
          )}, Skav: ${avg(deffTabTotals.heavy, deffTabSamples)}, Spy: ${avg(
            deffTabTotals.spy,
            deffTabSamples
          )}, Lkav: ${avg(deffTabTotals.light, deffTabSamples)}, Bogen: ${avg(
            deffTabTotals.archer,
            deffTabSamples
          )}`,
          avgDeffGrossLine: `Speer: ${avg(deffGrossTotals.spear, deffGrossSamples)}, Schwert: ${avg(
            deffGrossTotals.sword,
            deffGrossSamples
          )}, Skav: ${avg(deffGrossTotals.heavy, deffGrossSamples)}, Spy: ${avg(
            deffGrossTotals.spy,
            deffGrossSamples
          )}, Lkav: ${avg(deffGrossTotals.light, deffGrossSamples)}, Bogen: ${avg(
            deffGrossTotals.archer,
            deffGrossSamples
          )}`,
          avgSendTime,
          earliestSendTime,
          latestSendTime,
        };
      })
      .sort((a, b) => {
        if (a.reportsCount !== b.reportsCount) return b.reportsCount - a.reportsCount;
        if (a.points !== b.points) return b.points - a.points;
        return a.playerName.localeCompare(b.playerName, "de");
      });
  }, [
    searchHasRun,
    searchCriteria,
    dbPlayers,
    dbAllies,
    dbVillages,
    dbVillageEntries,
    dbReports,
  ]);
  const searchPrimaryResult = searchResults[0] ?? null;
  const searchAccountSuggestions = useMemo(() => {
    const needle = searchAccountInput.trim().toLowerCase();
    if (needle.length < 2) return [] as string[];
    const all = Array.from(new Set(Array.from(dbPlayers.values()).map((player) => player.playerName)));
    const starts = all
      .filter((name) => name.toLowerCase().startsWith(needle))
      .sort((a, b) => a.localeCompare(b, "de"));
    const contains = all
      .filter((name) => !name.toLowerCase().startsWith(needle) && name.toLowerCase().includes(needle))
      .sort((a, b) => a.localeCompare(b, "de"));
    return [...starts, ...contains].slice(0, 8);
  }, [searchAccountInput, dbPlayers]);
  const searchTribeSuggestions = useMemo(() => {
    const needle = searchTribeInput.trim().toLowerCase();
    if (needle.length < 2) return [] as Array<{ tag: string; name: string; value: string }>;
    const all = Array.from(dbAllies.values())
      .map((ally) => ({
        tag: ally.allyTag || "-",
        name: ally.allyName || "",
        value: ally.allyTag ? `[${ally.allyTag}]` : ally.allyName,
      }))
      .filter((ally) => ally.value);
    const starts = all
      .filter(
        (ally) =>
          ally.value.toLowerCase().startsWith(needle) ||
          ally.name.toLowerCase().startsWith(needle)
      )
      .sort((a, b) => a.value.localeCompare(b.value, "de"));
    const contains = all
      .filter(
        (ally) =>
          !(
            ally.value.toLowerCase().startsWith(needle) ||
            ally.name.toLowerCase().startsWith(needle)
          ) &&
          (ally.value.toLowerCase().includes(needle) || ally.name.toLowerCase().includes(needle))
      )
      .sort((a, b) => a.value.localeCompare(b.value, "de"));
    return [...starts, ...contains].slice(0, 8);
  }, [searchTribeInput, dbAllies]);
  const villageFilterPlayerSuggestions = useMemo(() => {
    const needle = villageFilterPlayerInput.trim().toLowerCase();
    if (needle.length < 2) return [] as string[];
    const all = Array.from(new Set(Array.from(dbPlayers.values()).map((player) => player.playerName)));
    const starts = all
      .filter((name) => name.toLowerCase().startsWith(needle))
      .sort((a, b) => a.localeCompare(b, "de"));
    const contains = all
      .filter((name) => !name.toLowerCase().startsWith(needle) && name.toLowerCase().includes(needle))
      .sort((a, b) => a.localeCompare(b, "de"));
    return [...starts, ...contains].slice(0, 8);
  }, [villageFilterPlayerInput, dbPlayers]);
  const villageFilterTribeSuggestions = useMemo(() => {
    const needle = villageFilterTribeInput.trim().toLowerCase();
    if (needle.length < 2) return [] as Array<{ tag: string; name: string; value: string }>;
    const all = Array.from(dbAllies.values())
      .map((ally) => ({
        tag: ally.allyTag || "-",
        name: ally.allyName || "",
        value: ally.allyTag ? `[${ally.allyTag}]` : ally.allyName,
      }))
      .filter((ally) => ally.value);
    const starts = all
      .filter(
        (ally) =>
          ally.value.toLowerCase().startsWith(needle) ||
          ally.name.toLowerCase().startsWith(needle)
      )
      .sort((a, b) => a.value.localeCompare(b.value, "de"));
    const contains = all
      .filter(
        (ally) =>
          !(
            ally.value.toLowerCase().startsWith(needle) ||
            ally.name.toLowerCase().startsWith(needle)
          ) &&
          (ally.value.toLowerCase().includes(needle) || ally.name.toLowerCase().includes(needle))
      )
      .sort((a, b) => a.value.localeCompare(b.value, "de"));
    return [...starts, ...contains].slice(0, 8);
  }, [villageFilterTribeInput, dbAllies]);
  const searchTribeResult = useMemo(() => {
    if (!searchHasRun) return null as null | {
      allyId: string;
      allyTag: string;
      allyName: string;
      rank: number;
      points: number;
      members: number;
      villages: number;
      avgPointsPerPlayer: number;
      avgPointsPerVillage: number;
      offVillages: number;
      deffVillages: number;
      totalKills: number;
      attackerKills: number;
      defenderKills: number;
      maxVillages: number;
      maxPoints: number;
      killRatio: string;
      coords: Set<string>;
    };
    const accountNeedle = searchCriteria.account.trim();
    const tribeNeedleRaw = searchCriteria.tribe.trim();
    if (accountNeedle || !tribeNeedleRaw) return null;
    const tribeNeedle = tribeNeedleRaw.replace(/^\[|\]$/g, "").toLowerCase();
    const allies = Array.from(dbAllies.values());
    const exactTag = allies.find((ally) => ally.allyTag.toLowerCase() === tribeNeedle);
    const exactName = allies.find((ally) => ally.allyName.toLowerCase() === tribeNeedle);
    const starts = allies.find(
      (ally) =>
        ally.allyTag.toLowerCase().startsWith(tribeNeedle) ||
        ally.allyName.toLowerCase().startsWith(tribeNeedle)
    );
    const contains = allies.find(
      (ally) =>
        ally.allyTag.toLowerCase().includes(tribeNeedle) ||
        ally.allyName.toLowerCase().includes(tribeNeedle)
    );
    const found = exactTag ?? exactName ?? starts ?? contains ?? null;
    if (!found) return null;
    const memberPlayers = Array.from(dbPlayers.values()).filter((player) => player.allyId === found.allyId);
    const memberNames = new Set(memberPlayers.map((player) => player.playerName.trim().toLowerCase()));
    const coords = new Set<string>();
    for (const [coord, village] of dbVillages.entries()) {
      if (village.allyId === found.allyId) coords.add(coord);
    }
    const entryMap = new Map(dbVillageEntries.map((entry) => [entry.coord, entry]));
    const offVillages = Array.from(coords).filter(
      (coord) => normalizeVillageRole(entryMap.get(coord)?.role) === "off"
    ).length;
    const deffVillages = Array.from(coords).filter(
      (coord) => normalizeVillageRole(entryMap.get(coord)?.role) === "deff"
    ).length;
    let attackerKills = 0;
    let defenderKills = 0;
    for (const report of dbReports) {
      const attacker = (report.details?.attacker ?? "").trim().toLowerCase();
      const defender = (report.details?.defender ?? "").trim().toLowerCase();
      if (memberNames.has(attacker)) {
        attackerKills += sumUnits(report.details?.defenderLossesUnits ?? {});
      }
      if (memberNames.has(defender)) {
        defenderKills += sumUnits(report.details?.attackerLossesUnits ?? {});
      }
    }
    const meta = dbAllyMeta.get(found.allyId);
    const members = meta?.members ?? memberPlayers.length;
    const villages = meta?.villages ?? coords.size;
    const points =
      meta?.points ?? memberPlayers.reduce((sum, player) => sum + Number(player.points ?? 0), 0);
    const avgPointsPerPlayer = members > 0 ? points / members : 0;
    const avgPointsPerVillage = villages > 0 ? points / villages : 0;
    const killRatio =
      defenderKills <= 0
        ? attackerKills > 0
          ? "Infinity"
          : "0"
        : (attackerKills / defenderKills).toFixed(2);

    return {
      allyId: found.allyId,
      allyTag: found.allyTag,
      allyName: found.allyName,
      rank: meta?.rank ?? 0,
      points,
      members,
      villages,
      avgPointsPerPlayer,
      avgPointsPerVillage,
      offVillages,
      deffVillages,
      totalKills: attackerKills + defenderKills,
      attackerKills,
      defenderKills,
      maxVillages: villages,
      maxPoints: points,
      killRatio,
      coords,
    };
  }, [
    searchHasRun,
    searchCriteria,
    dbAllies,
    dbPlayers,
    dbVillages,
    dbVillageEntries,
    dbReports,
    dbAllyMeta,
  ]);
  const searchDisplayMode: "none" | "player" | "tribe" =
    searchTribeResult ? "tribe" : searchPrimaryResult ? "player" : "none";
  const searchCoordVillageResult = useMemo(() => {
    if (!searchHasRun) return null as null | {
      coord: string;
      villageName: string;
      playerName: string;
      tribeTag: string;
      points: number;
      role: VillageRole;
      isBunker: boolean;
      updatedAt: string;
      sourceReportId: string;
      troopsOwn: Record<string, number>;
      troopsTotal: Record<string, number>;
      troopsMerged: Record<string, number>;
      buildings: Record<string, number>;
      troopsSourceReport: {
        id: string;
        title: string;
        battleTime: string;
      } | null;
      buildingsSourceReport: {
        id: string;
        title: string;
        battleTime: string;
      } | null;
      ownerCurrent: string;
      ownerSinceText: string;
      ownerSinceSource: string;
      conquestCount: number;
      buildingDamageReports: number;
      oldestReportText: string;
      newestReportText: string;
      pointsStats: {
        current: number;
        snapshots: number;
        trendText: string;
      };
      reportMentions: Array<{
        id: string;
        title: string;
        outcomeIcon: string;
        battleTime: string;
        attacker: string;
        defender: string;
        origin: string;
        target: string;
        side: "origin" | "target";
      }>;
    };
    const coordX = searchCriteria.coordX.trim();
    const coordY = searchCriteria.coordY.trim();
    const hasCoordFilter = /^\d{1,3}$/.test(coordX) && /^\d{1,3}$/.test(coordY);
    if (!hasCoordFilter) return null;
    const coord = `${Number(coordX)}|${Number(coordY)}`;
    const worldVillage = dbVillages.get(coord);
    if (!worldVillage) return null;
    const entryMap = new Map(dbVillageEntries.map((entry) => [entry.coord, entry]));
    const entry = entryMap.get(coord);
    const coordReports = dbReports.filter((report) => {
      const origin = parseCoord(report.details?.origin ?? "");
      const target = parseCoord(report.details?.target ?? "");
      return origin === coord || target === coord;
    });
    const reportMentions = coordReports
      .flatMap((report) => {
        const origin = parseCoord(report.details?.origin ?? "");
        const target = parseCoord(report.details?.target ?? "");
        const rows: Array<{
          id: string;
          title: string;
          outcomeIcon: string;
          battleTime: string;
          attacker: string;
          defender: string;
          origin: string;
          target: string;
          side: "origin" | "target";
        }> = [];
        if (origin === coord) {
          rows.push({
            id: report.id,
            title: report.title || `Report ${report.id}`,
            outcomeIcon: getOutcomeIcon(report),
            battleTime: report.details?.battleTime || "-",
            attacker: report.details?.attacker || "-",
            defender: report.details?.defender || "-",
            origin: report.details?.origin || "-",
            target: report.details?.target || "-",
            side: "origin",
          });
        }
        if (target === coord) {
          rows.push({
            id: report.id,
            title: report.title || `Report ${report.id}`,
            outcomeIcon: getOutcomeIcon(report),
            battleTime: report.details?.battleTime || "-",
            attacker: report.details?.attacker || "-",
            defender: report.details?.defender || "-",
            origin: report.details?.origin || "-",
            target: report.details?.target || "-",
            side: "target",
          });
        }
        return rows;
      })
      .sort((a, b) => parseBattleTime(b.battleTime, new Date().toISOString()).getTime() - parseBattleTime(a.battleTime, new Date().toISOString()).getTime())
      .slice(0, 8);

    const parseReportDateMs = (battleTime: string, fallback: string) =>
      parseBattleTime(battleTime, fallback).getTime();

    const conquestCandidates = coordReports
      .filter((report) => parseCoord(report.details?.target ?? "") === coord)
      .filter((report) => Number(report.details?.attackerUnits?.snob ?? 0) > 0)
      .filter((report) => {
        const winner = normalizeName(getWinnerName(report.details?.headline ?? ""));
        const attacker = normalizeName(report.details?.attacker ?? "");
        return Boolean(winner && attacker && winner === attacker);
      })
      .sort(
        (a, b) =>
          parseReportDateMs(b.details?.battleTime ?? "", b.fetchedAt) -
          parseReportDateMs(a.details?.battleTime ?? "", a.fetchedAt)
      );

    const newestByTime = [...coordReports].sort(
      (a, b) =>
        parseReportDateMs(b.details?.battleTime ?? "", b.fetchedAt) -
        parseReportDateMs(a.details?.battleTime ?? "", a.fetchedAt)
    );
    const oldestByTime = [...coordReports].sort(
      (a, b) =>
        parseReportDateMs(a.details?.battleTime ?? "", a.fetchedAt) -
        parseReportDateMs(b.details?.battleTime ?? "", b.fetchedAt)
    );

    let ownerSinceText = "Unbekannt";
    let ownerSinceSource = "Keine eindeutige Adelungsinformation in Berichten.";
    if (conquestCandidates.length > 0) {
      const latestConquest = conquestCandidates[0];
      ownerSinceText = latestConquest.details?.battleTime || new Date(latestConquest.fetchedAt).toLocaleString("de-DE");
      ownerSinceSource = `Geschätzt aus Adels-Bericht (${latestConquest.id})`;
    } else {
      const ownerNeedle = normalizeName(worldVillage.playerName || "");
      const earliestOriginByOwner = oldestByTime.find((report) => {
        const origin = parseCoord(report.details?.origin ?? "");
        const attacker = normalizeName(report.details?.attacker ?? "");
        return origin === coord && ownerNeedle && attacker === ownerNeedle;
      });
      if (earliestOriginByOwner) {
        ownerSinceText =
          earliestOriginByOwner.details?.battleTime ||
          new Date(earliestOriginByOwner.fetchedAt).toLocaleString("de-DE");
        ownerSinceSource = `Mindestens seit erstem Herkunftsbericht (${earliestOriginByOwner.id})`;
      }
    }

    const buildingDamageReports = coordReports.filter(
      (report) => (report.details?.buildingDamage?.length ?? 0) > 0
    ).length;
    const oldestReportText =
      oldestByTime[0]?.details?.battleTime ||
      (oldestByTime[0] ? new Date(oldestByTime[0].fetchedAt).toLocaleString("de-DE") : "-");
    const newestReportText =
      newestByTime[0]?.details?.battleTime ||
      (newestByTime[0] ? new Date(newestByTime[0].fetchedAt).toLocaleString("de-DE") : "-");

    const ally = dbAllies.get(worldVillage.allyId);
    const coordReportsByTimeDesc = [...coordReports].sort(
      (a, b) =>
        parseReportDateMs(b.details?.battleTime ?? "", b.fetchedAt) -
        parseReportDateMs(a.details?.battleTime ?? "", a.fetchedAt)
    );

    const troopReportCandidate =
      coordReportsByTimeDesc.find((report) => {
        const target = parseCoord(report.details?.target ?? "");
        if (target !== coord) return false;
        const defenderUnits =
          report.details?.defenderUnits && typeof report.details.defenderUnits === "object"
            ? report.details.defenderUnits
            : {};
        return Object.keys(defenderUnits).length > 0;
      }) ??
      coordReportsByTimeDesc.find((report) => {
        const origin = parseCoord(report.details?.origin ?? "");
        if (origin !== coord) return false;
        const attackerUnits =
          report.details?.attackerUnits && typeof report.details.attackerUnits === "object"
            ? report.details.attackerUnits
            : {};
        return Object.keys(attackerUnits).length > 0;
      }) ??
      null;
    const normalizeNumericRecord = (raw: Record<string, unknown> | undefined | null) =>
      Object.entries(raw ?? {}).reduce<Record<string, number>>((acc, [key, value]) => {
        const parsed = Number(value ?? 0);
        acc[key] = Number.isFinite(parsed) ? parsed : 0;
        return acc;
      }, {});
    const troopsFromReports =
      troopReportCandidate == null
        ? {}
        : parseCoord(troopReportCandidate.details?.origin ?? "") === coord
        ? normalizeNumericRecord(troopReportCandidate.details?.attackerUnits as Record<string, unknown>)
        : normalizeNumericRecord(troopReportCandidate.details?.defenderUnits as Record<string, unknown>);
    const hasMeaningfulBuildingLevels = (raw: Record<string, unknown> | undefined | null) =>
      Object.values(raw ?? {}).some((value) => Number(value ?? 0) > 0);
    const buildingsReportCandidate =
      coordReportsByTimeDesc.find((report) => {
        const target = parseCoord(report.details?.target ?? "");
        if (target !== coord) return false;
        const hasBuildingLevels = hasMeaningfulBuildingLevels(
          report.details?.buildings as Record<string, unknown> | undefined
        );
        return hasBuildingLevels;
      }) ??
      coordReportsByTimeDesc.find((report) => {
        const hasBuildingLevels = hasMeaningfulBuildingLevels(
          report.details?.buildings as Record<string, unknown> | undefined
        );
        return hasBuildingLevels;
      }) ??
      null;
    const buildingsFromReports =
      buildingsReportCandidate?.details?.buildings &&
      typeof buildingsReportCandidate.details.buildings === "object"
        ? filterReportBuildingsForDisplay(
            normalizeNumericRecord(
              buildingsReportCandidate.details.buildings as Record<string, unknown>
            )
          )
        : {};
    const derivedRole =
      entry?.role && entry.role !== "unknown"
        ? normalizeVillageRole(entry.role)
        : Object.keys(troopsFromReports).length > 0
        ? classifyVillage(troopsFromReports)
        : "unknown";
    const derivedBunker =
      entry?.isBunker != null
        ? Boolean(entry.isBunker)
        : Object.keys(troopsFromReports).length > 0
        ? isBunkerVillage(troopsFromReports)
        : false;

    return {
      coord,
      villageName: worldVillage.villageName || coord,
      playerName: worldVillage.playerName || "-",
      tribeTag: ally?.allyTag || "-",
      points: Number(worldVillage.points ?? 0),
      role: derivedRole,
      isBunker: derivedBunker,
      updatedAt: entry?.updatedAt ?? "",
      sourceReportId: entry?.sourceReportId ?? "",
      troopsOwn: {},
      troopsTotal: troopsFromReports,
      troopsMerged: {},
      buildings: buildingsFromReports,
      troopsSourceReport: troopReportCandidate
        ? {
            id: troopReportCandidate.id,
            title: troopReportCandidate.title || `Report ${troopReportCandidate.id}`,
            battleTime:
              troopReportCandidate.details?.battleTime ||
              new Date(troopReportCandidate.fetchedAt).toLocaleString("de-DE"),
          }
        : null,
      buildingsSourceReport: buildingsReportCandidate
        ? {
            id: buildingsReportCandidate.id,
            title: buildingsReportCandidate.title || `Report ${buildingsReportCandidate.id}`,
            battleTime:
              buildingsReportCandidate.details?.battleTime ||
              new Date(buildingsReportCandidate.fetchedAt).toLocaleString("de-DE"),
          }
        : null,
      ownerCurrent: worldVillage.playerName || "-",
      ownerSinceText,
      ownerSinceSource,
      conquestCount: conquestCandidates.length,
      buildingDamageReports,
      oldestReportText,
      newestReportText,
      pointsStats: {
        current: Number(worldVillage.points ?? 0),
        snapshots: Number.isFinite(Number(worldVillage.points ?? NaN)) ? 1 : 0,
        trendText:
          "Historische Dorfpunktestände fehlen. Für echte Entwicklung werden zeitliche Dorf-Snapshots benötigt.",
      },
      reportMentions,
    };
  }, [searchHasRun, searchCriteria, dbVillages, dbVillageEntries, dbReports, dbAllies]);
  const villageFilterReportUnitsByCoord = useMemo(() => {
    const maxUnitsByCoord = new Map<string, Record<string, number>>();
    const normalizeUnits = (raw: Record<string, unknown> | undefined | null) => {
      const out: Record<string, number> = {};
      if (!raw || typeof raw !== "object") return out;
      for (const [unit, value] of Object.entries(raw)) {
        const parsed = Number(value ?? 0);
        if (!Number.isFinite(parsed) || parsed <= 0) continue;
        out[unit] = parsed;
      }
      return out;
    };
    const sumUnitsLocal = (units: Record<string, number>) =>
      Object.values(units).reduce((sum, value) => sum + Math.max(0, Number(value ?? 0)), 0);
    const mergeUnits = (coord: string, units: Record<string, unknown> | undefined | null) => {
      if (!coord || !units || typeof units !== "object") return;
      const target = maxUnitsByCoord.get(coord) ?? {};
      for (const [unit, value] of Object.entries(units)) {
        const parsed = Number(value ?? 0);
        if (!Number.isFinite(parsed) || parsed <= 0) continue;
        target[unit] = Math.max(Number(target[unit] ?? 0), parsed);
      }
      maxUnitsByCoord.set(coord, target);
    };

    for (const report of dbReports) {
      const origin = parseCoord(report.details?.origin ?? "");
      const target = parseCoord(report.details?.target ?? "");
      const attackerUnits = normalizeUnits(
        report.details?.attackerUnits as Record<string, unknown> | undefined
      );
      const defenderUnits = normalizeUnits(
        report.details?.defenderUnits as Record<string, unknown> | undefined
      );
      const attackerTotal = sumUnitsLocal(attackerUnits);
      const likelySmallFake =
        attackerTotal > 0 &&
        (attackerTotal <= 250 ||
          (Number(attackerUnits.spy ?? 0) > 0 && attackerTotal <= 600));
      const attackerKind = classifyReportAttackKind(attackerUnits);
      const useAttackerForRole = attackerKind !== "fake" && !likelySmallFake;
      if (useAttackerForRole) {
        mergeUnits(origin, attackerUnits);
      }
      mergeUnits(target, defenderUnits);
    }
    return maxUnitsByCoord;
  }, [dbReports]);

  const villageFilterRows = useMemo(() => {
    const toInt = (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) return null;
      if (!/^\d{1,3}$/.test(trimmed)) return null;
      return Number(trimmed);
    };

    const playerNeedle = villageFilterCriteria.player.trim().toLowerCase();
    const tribeNeedle = villageFilterCriteria.tribe.trim().toLowerCase();
    const minX = toInt(villageFilterCriteria.minX);
    const minY = toInt(villageFilterCriteria.minY);
    const maxX = toInt(villageFilterCriteria.maxX);
    const maxY = toInt(villageFilterCriteria.maxY);
    const minPoints = Number(villageFilterCriteria.minPoints.replace(/[^\d]/g, "") || 0);
    const maxPointsRaw = Number(villageFilterCriteria.maxPoints.replace(/[^\d]/g, "") || 0);
    const hasMinPoints = villageFilterCriteria.minPoints.trim().length > 0;
    const hasMaxPoints = villageFilterCriteria.maxPoints.trim().length > 0;
    const radius = villageFilterCriteria.radius.trim() ? Number(villageFilterCriteria.radius.trim()) : null;
    const centerX = toInt(villageFilterCriteria.centerX);
    const centerY = toInt(villageFilterCriteria.centerY);
    const hasRadiusFilter =
      Number.isFinite(radius) && (radius ?? 0) >= 0 && centerX !== null && centerY !== null;
    const rows: Array<{
      coord: string;
      villageName: string;
      playerName: string;
      tribeTag: string;
      role: "off" | "deff" | "unknown";
      isBunker: boolean;
      category: "off" | "deff" | "bunker" | "unknown";
      typeLabel: string;
      points: number;
    }> = [];

    for (const [coord, village] of dbVillages.entries()) {
      const reportUnits = villageFilterReportUnitsByCoord.get(coord) ?? {};
      const hasReportUnits = Object.keys(reportUnits).length > 0;
      const rawRole = hasReportUnits ? classifyVillage(reportUnits) : "unknown";
      const role: "off" | "deff" | "unknown" = rawRole === "fake_dorf" ? "unknown" : rawRole;
      const isBunker = hasReportUnits ? isBunkerVillage(reportUnits) : false;
      const category: "off" | "deff" | "bunker" | "unknown" = isBunker ? "bunker" : role;
      const ally = dbAllies.get(village.allyId);
      const tribeTag = ally?.allyTag || "";
      const tribeName = ally?.allyName || "";
      const villageName = village.villageName || coord;
      const playerName = village.playerName || "-";
      const points = Number(village.points ?? 0);

      if (playerNeedle && !playerName.toLowerCase().includes(playerNeedle)) continue;
      if (tribeNeedle) {
        const hay = `${tribeTag} ${tribeName}`.toLowerCase();
        if (!hay.includes(tribeNeedle)) continue;
      }
      if (minX !== null && village.x < minX) continue;
      if (minY !== null && village.y < minY) continue;
      if (maxX !== null && village.x > maxX) continue;
      if (maxY !== null && village.y > maxY) continue;
      if (hasMinPoints && points < minPoints) continue;
      if (hasMaxPoints && points > maxPointsRaw) continue;
      if (hasRadiusFilter) {
        const dx = village.x - (centerX as number);
        const dy = village.y - (centerY as number);
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance > (radius as number)) continue;
      }
      if (villageFilterCriteria.type !== "all" && category !== villageFilterCriteria.type) {
        continue;
      }

      rows.push({
        coord,
        villageName,
        playerName,
        tribeTag: tribeTag || "-",
        role,
        isBunker,
        category,
        typeLabel: category === "bunker" ? "Bunker" : villageRoleLabel(role),
        points,
      });
    }

    return rows.sort((a, b) => a.coord.localeCompare(b.coord, "de"));
  }, [villageFilterCriteria, dbVillages, dbAllies, villageFilterReportUnitsByCoord]);
  const villageReportCountByCoord = useMemo(() => {
    const counts = new Map<string, number>();
    for (const report of dbReports) {
      const origin = parseCoord(report.details?.origin ?? "");
      const target = parseCoord(report.details?.target ?? "");
      if (origin) {
        counts.set(origin, (counts.get(origin) ?? 0) + 1);
      }
      if (target) {
        counts.set(target, (counts.get(target) ?? 0) + 1);
      }
    }
    return counts;
  }, [dbReports]);
  const villageFilterSections = useMemo(() => {
    return {
      all: villageFilterRows,
      off: villageFilterRows.filter((row) => row.category === "off"),
      deff: villageFilterRows.filter((row) => row.category === "deff"),
      bunker: villageFilterRows.filter((row) => row.category === "bunker"),
      unknown: villageFilterRows.filter((row) => row.category === "unknown"),
    };
  }, [villageFilterRows]);
  const searchPrimaryPlayerCoords = useMemo(() => {
    if (searchDisplayMode === "tribe" && searchTribeResult) {
      return searchTribeResult.coords;
    }
    if (searchDisplayMode === "none" && searchCoordVillageResult) {
      return new Set([searchCoordVillageResult.coord]);
    }
    if (!searchPrimaryResult) return new Set<string>();
    const coords = new Set<string>();
    for (const [coord, village] of dbVillages.entries()) {
      if (village.playerId === searchPrimaryResult.playerId) {
        coords.add(coord);
      }
    }
    return coords;
  }, [searchDisplayMode, searchTribeResult, searchCoordVillageResult, searchPrimaryResult, dbVillages]);
  const reportViewerReport = useMemo(
    () => (reportViewerId ? dbReports.find((item) => item.id === reportViewerId) ?? null : null),
    [dbReports, reportViewerId]
  );
  const ownOutgoingAttacks = dbOutgoingAttacks;
  const filteredOwnOutgoingAttacks = useMemo(() => {
    const playerNeedle = ownAttackFilterPlayer.trim().toLowerCase();
    const coordNeedle = ownAttackFilterCoord.trim().toLowerCase();
    return ownOutgoingAttacks.filter((row) => {
      if (ownAttackFilterType !== "all" && row.commandType !== ownAttackFilterType) return false;
      if (playerNeedle) {
        const hay = `${row.originName} ${dbSelectedPlayerName || ""}`.toLowerCase();
        if (!hay.includes(playerNeedle)) return false;
      }
      if (coordNeedle) {
        const hay = `${row.originCoord} ${row.targetCoord}`.toLowerCase();
        if (!hay.includes(coordNeedle)) return false;
      }
      if (ownAttackFilterDate) {
        const arrival = new Date(row.arrivalAtIso);
        if (Number.isNaN(arrival.getTime())) return false;
        const y = arrival.getFullYear();
        const m = String(arrival.getMonth() + 1).padStart(2, "0");
        const d = String(arrival.getDate()).padStart(2, "0");
        const isoDate = `${y}-${m}-${d}`;
        if (isoDate !== ownAttackFilterDate) return false;
      }
      return true;
    });
  }, [
    ownOutgoingAttacks,
    ownAttackFilterPlayer,
    ownAttackFilterCoord,
    ownAttackFilterType,
    ownAttackFilterDate,
    dbSelectedPlayerName,
  ]);
  const incomingTypeStatsByOrigin = useMemo(() => {
    const map = new Map<string, { off: number; fake: number; ag: number; total: number }>();
    for (const report of dbReports) {
      const origin = parseCoord(report.details?.origin ?? "");
      if (!origin) continue;
      const units = report.details?.attackerUnits ?? {};
      const kind = classifyReportAttackKind(units);
      if (!map.has(origin)) {
        map.set(origin, { off: 0, fake: 0, ag: 0, total: 0 });
      }
      const stats = map.get(origin)!;
      if (kind === "off") stats.off += 1;
      if (kind === "fake") stats.fake += 1;
      if (kind === "ag") stats.ag += 1;
      if (kind !== "unknown") stats.total += 1;
    }
    return map;
  }, [dbReports]);
  const allAttackRows = useMemo(() => {
    const incoming = dbIncomingAttacks.map((row) => ({
      id: `in-${row.id}`,
      direction: "eingehend" as const,
      commandType: "attack" as const,
      unitLabel: row.unitLabel,
      playerName: row.attackerPlayer,
      originName: row.originName,
      originCoord: row.originCoord,
      targetName: row.targetName,
      targetCoord: row.targetCoord,
      sentAtLabel: row.sentAtLabel,
      returnAtLabel: row.returnAtLabel,
      arrivalAtIso: row.arrivalAtIso,
      arrivalLabel: row.arrivalLabel,
      predictedType: predictIncomingType(
        row.originCoord,
        row.unitLabel,
        incomingTypeStatsByOrigin.get(row.originCoord)
      ),
    }));
    return incoming.sort(
      (a, b) => new Date(a.arrivalAtIso).getTime() - new Date(b.arrivalAtIso).getTime()
    );
  }, [dbIncomingAttacks, incomingTypeStatsByOrigin]);
  const searchVillagePointsSeries = useMemo(() => {
    const base = [...searchVillagePointsHistory]
      .filter((item) => Number.isFinite(item.points))
      .sort((a, b) => new Date(a.snapshotAt).getTime() - new Date(b.snapshotAt).getTime());
    if (base.length >= 2) return base;
    if (searchCoordVillageResult) {
      return [
        {
          snapshotAt: new Date().toISOString(),
          points: Number(searchCoordVillageResult.points || 0),
        },
      ];
    }
    return base;
  }, [searchVillagePointsHistory, searchCoordVillageResult]);
  const forwardedReportIdsPreview = useMemo(
    () => extractReportIds(insertForwardedText),
    [insertForwardedText]
  );
  const forwardedReportNewIdsPreview = useMemo(() => {
    if (forwardedReportIdsPreview.length === 0) return [] as string[];
    const existing = new Set(dbReports.map((item) => item.id.toLowerCase()));
    return forwardedReportIdsPreview.filter((id) => !existing.has(id.toLowerCase()));
  }, [forwardedReportIdsPreview, dbReports]);
  const dbConfig = useMemo(() => parseConfig(dbConfigText), [dbConfigText]);
  const dbUnitSpeeds = useMemo(() => parseUnitInfo(dbUnitInfoText), [dbUnitInfoText]);
  const dbAvailableUnits = useMemo(() => {
    const fromNames = parseUnitNames(dbUnitInfoText).map((name) => name.toLowerCase());
    if (fromNames.length > 0) return fromNames;
    const fromSpeeds = Array.from(dbUnitSpeeds.keys()).map((name) => name.toLowerCase());
    if (fromSpeeds.length > 0) return fromSpeeds;
    return DEFAULT_UNITS;
  }, [dbUnitInfoText, dbUnitSpeeds]);
  const dbOverviewUnitOrder = useMemo(() => {
    const available = new Set(dbAvailableUnits);
    const ordered = OVERVIEW_UNIT_ORDER.filter((unit) => available.has(unit));
    return ordered.length > 0 ? ordered : dbAvailableUnits;
  }, [dbAvailableUnits]);

  useEffect(() => {
    setFgManualUnitsToSend((prev) => {
      const next: Record<string, number> = {};
      for (const unit of dbOverviewUnitOrder) {
        next[unit] = Number.isFinite(prev[unit]) ? prev[unit] : 0;
      }
      return next;
    });
    setFgManualUnitsToKeep((prev) => {
      const next: Record<string, number> = {};
      for (const unit of dbOverviewUnitOrder) {
        next[unit] = Number.isFinite(prev[unit]) ? prev[unit] : 0;
      }
      return next;
    });
  }, [dbOverviewUnitOrder]);

  useEffect(() => {
    const raw = localStorage.getItem("ds_fake_generator_settings");
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Partial<{
        groupFilter: FakeGroupFilter;
        attacksPerButton: number;
        openDelay: number;
        maxAttacksPerVillage: number;
        unitSelectionType: FakeUnitSelectionType;
        sendSpy: boolean;
        keepCatapults: number;
        filterRatio: boolean;
        avoidNightBonus: boolean;
        nightBonusBuffer: number;
        targetCoordsInput: string;
        targetPlayerInput: string;
        arrivalWindows: FakeArrivalWindow[];
        manualUnitsToSend: Record<string, number>;
        manualUnitsToKeep: Record<string, number>;
        mixOffEnabled: boolean;
        mixOffCount: number;
        mixOffTargetCoords: string[];
        mixOffTargetCoord: string;
        agChainsEnabled: boolean;
        agChainsCount: number;
        agChainPreset: FakeAgChainPreset;
      }>;
      if (parsed.groupFilter) setFgGroupFilter(parsed.groupFilter);
      if (Number.isFinite(parsed.attacksPerButton)) setFgAttacksPerButton(Math.max(1, Number(parsed.attacksPerButton)));
      if (Number.isFinite(parsed.openDelay)) setFgOpenDelay(Math.max(200, Number(parsed.openDelay)));
      if (Number.isFinite(parsed.maxAttacksPerVillage))
        setFgMaxAttacksPerVillage(Math.max(0, Number(parsed.maxAttacksPerVillage)));
      if (parsed.unitSelectionType) setFgUnitSelectionType(parsed.unitSelectionType);
      if (typeof parsed.sendSpy === "boolean") setFgSendSpy(parsed.sendSpy);
      if (Number.isFinite(parsed.keepCatapults)) setFgKeepCatapults(Math.max(0, Number(parsed.keepCatapults)));
      if (typeof parsed.filterRatio === "boolean") setFgFilterRatio(parsed.filterRatio);
      if (typeof parsed.avoidNightBonus === "boolean") setFgAvoidNightBonus(parsed.avoidNightBonus);
      if (Number.isFinite(parsed.nightBonusBuffer)) setFgNightBonusBuffer(Math.max(0, Number(parsed.nightBonusBuffer)));
      if (typeof parsed.targetCoordsInput === "string") setFgTargetCoordsInput(parsed.targetCoordsInput);
      if (typeof parsed.targetPlayerInput === "string") setFgTargetPlayerInput(parsed.targetPlayerInput);
      if (Array.isArray(parsed.arrivalWindows)) {
        setFgArrivalWindows(
          parsed.arrivalWindows
            .filter((item) => item && typeof item.from === "string" && typeof item.to === "string")
            .map((item) => ({ id: item.id || createId(), from: item.from, to: item.to }))
        );
      }
      if (parsed.manualUnitsToSend && typeof parsed.manualUnitsToSend === "object") {
        setFgManualUnitsToSend(parsed.manualUnitsToSend);
      }
      if (parsed.manualUnitsToKeep && typeof parsed.manualUnitsToKeep === "object") {
        setFgManualUnitsToKeep(parsed.manualUnitsToKeep);
      }
      if (typeof parsed.mixOffEnabled === "boolean") setFgMixOffEnabled(parsed.mixOffEnabled);
      if (Number.isFinite(parsed.mixOffCount)) setFgMixOffCount(Math.max(0, Number(parsed.mixOffCount)));
      if (Array.isArray(parsed.mixOffTargetCoords)) {
        setFgMixOffTargetCoords(
          parsed.mixOffTargetCoords
            .filter((value): value is string => typeof value === "string")
            .map((value) => value.trim())
            .filter(Boolean)
        );
      } else if (typeof parsed.mixOffTargetCoord === "string" && parsed.mixOffTargetCoord.trim()) {
        setFgMixOffTargetCoords([parsed.mixOffTargetCoord.trim()]);
      }
      if (typeof parsed.agChainsEnabled === "boolean") setFgAgChainsEnabled(parsed.agChainsEnabled);
      if (Number.isFinite(parsed.agChainsCount)) setFgAgChainsCount(Math.max(0, Number(parsed.agChainsCount)));
      if (parsed.agChainPreset === "light50_snob1" || parsed.agChainPreset === "axe100_snob1") {
        setFgAgChainPreset(parsed.agChainPreset);
      }
    } catch {
      // Ignore invalid legacy local storage.
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(
      "ds_fake_generator_settings",
      JSON.stringify({
        groupFilter: fgGroupFilter,
        attacksPerButton: fgAttacksPerButton,
        openDelay: fgOpenDelay,
        maxAttacksPerVillage: fgMaxAttacksPerVillage,
        unitSelectionType: fgUnitSelectionType,
        sendSpy: fgSendSpy,
        keepCatapults: fgKeepCatapults,
        filterRatio: fgFilterRatio,
        avoidNightBonus: fgAvoidNightBonus,
        nightBonusBuffer: fgNightBonusBuffer,
        targetCoordsInput: fgTargetCoordsInput,
        targetPlayerInput: fgTargetPlayerInput,
        arrivalWindows: fgArrivalWindows,
        manualUnitsToSend: fgManualUnitsToSend,
        manualUnitsToKeep: fgManualUnitsToKeep,
        mixOffEnabled: fgMixOffEnabled,
        mixOffCount: fgMixOffCount,
        mixOffTargetCoords: fgMixOffTargetCoords,
        agChainsEnabled: fgAgChainsEnabled,
        agChainsCount: fgAgChainsCount,
        agChainPreset: fgAgChainPreset,
      })
    );
  }, [
    fgGroupFilter,
    fgAttacksPerButton,
    fgOpenDelay,
    fgMaxAttacksPerVillage,
    fgUnitSelectionType,
    fgSendSpy,
    fgKeepCatapults,
    fgFilterRatio,
    fgAvoidNightBonus,
    fgNightBonusBuffer,
    fgTargetCoordsInput,
    fgTargetPlayerInput,
    fgArrivalWindows,
    fgManualUnitsToSend,
    fgManualUnitsToKeep,
    fgMixOffEnabled,
    fgMixOffCount,
    fgMixOffTargetCoords,
    fgAgChainsEnabled,
    fgAgChainsCount,
    fgAgChainPreset,
  ]);

  const fgNightBonusConfig = useMemo(() => {
    const activeMatch = dbConfigText.match(/<night[^>]*active="(\d+)"/i);
    const activeNodeMatch = dbConfigText.match(/<night[^>]*>[\s\S]*?<active>\s*(\d+)\s*<\/active>/i);
    const startMatch = dbConfigText.match(/<start_hour>\s*(\d{1,2})\s*<\/start_hour>/i);
    const endMatch = dbConfigText.match(/<end_hour>\s*(\d{1,2})\s*<\/end_hour>/i);
    const startAltMatch = dbConfigText.match(/<night[^>]*>[\s\S]*?<start>\s*(\d{1,2})\s*<\/start>/i);
    const endAltMatch = dbConfigText.match(/<night[^>]*>[\s\S]*?<end>\s*(\d{1,2})\s*<\/end>/i);
    const ratioMatch = dbConfigText.match(/<newbie[^>]*ratio="(\d+)"/i);
    const fakeLimitAttrMatch = dbConfigText.match(/<game[^>]*fake_limit="(\d+)"/i);
    const fakeLimitNodeMatch = dbConfigText.match(/<fake_limit>\s*(\d+)\s*<\/fake_limit>/i);
    const startHourRaw = Number(startMatch?.[1] ?? startAltMatch?.[1]);
    const endHourRaw = Number(endMatch?.[1] ?? endAltMatch?.[1]);
    const hasNightData = Number.isFinite(startHourRaw) && Number.isFinite(endHourRaw);
    const startHour = hasNightData ? ((startHourRaw % 24) + 24) % 24 : 0;
    const endHour = hasNightData ? ((endHourRaw % 24) + 24) % 24 : 8;
    return {
      active: activeMatch?.[1] === "1" || activeNodeMatch?.[1] === "1",
      hasNightData,
      startHour,
      endHour,
      ratio: ratioMatch ? Number(ratioMatch[1]) : 0,
      fakeLimitPercent: Number(
        fakeLimitAttrMatch?.[1] ?? fakeLimitNodeMatch?.[1] ?? 0
      ),
    };
  }, [dbConfigText]);

  const fgTargetCoords = useMemo(() => {
    const combined: string[] = [];
    const seen = new Set<string>();
    const addCoord = (coord: string) => {
      if (!dbVillages.has(coord)) return;
      if (seen.has(coord)) return;
      seen.add(coord);
      combined.push(coord);
    };

    const found = extractCoords(fgTargetCoordsInput);
    for (const coord of found) addCoord(coord);

    const playerQueries = normalizeQueryList(fgTargetPlayerInput);
    if (playerQueries.length > 0) {
      const resolvedPlayers = resolvePlayerNamesByQuery(dbPlayers, playerQueries)
        .map((name) => name.trim().toLowerCase())
        .filter(Boolean);
      if (resolvedPlayers.length > 0) {
        const resolvedSet = new Set(resolvedPlayers);
        for (const [coord, village] of dbVillages.entries()) {
          const owner = (village.playerName || "").trim().toLowerCase();
          if (!owner || !resolvedSet.has(owner)) continue;
          addCoord(coord);
        }
      }
    }

    return combined;
  }, [fgTargetCoordsInput, fgTargetPlayerInput, dbVillages, dbPlayers]);

  const fgOffTargetSuggestions = useMemo(() => {
    const targets = new Set(fgTargetCoords);
    if (targets.size === 0) return [] as Array<{
      coord: string;
      offScore: number;
      deffScore: number;
      samples: number;
      score: number;
    }>;

    const scoreByCoord = new Map<
      string,
      { offScore: number; deffScore: number; samples: number; score: number }
    >();
    for (const coord of fgTargetCoords) {
      scoreByCoord.set(coord, { offScore: 0, deffScore: 0, samples: 0, score: 0 });
    }

    const normalizeUnits = (raw: Record<string, unknown> | undefined | null) => {
      const out: Record<string, number> = {};
      if (!raw) return out;
      for (const [key, value] of Object.entries(raw)) {
        const numeric = Number(value ?? 0);
        if (!Number.isFinite(numeric)) continue;
        out[key] = Math.max(0, numeric);
      }
      return out;
    };
    const getOffScore = (units: Record<string, number>) =>
      (units.axe ?? 0) * 1 +
      (units.light ?? 0) * 1.8 +
      (units.ram ?? 0) * 6 +
      (units.catapult ?? 0) * 5 +
      (units.marcher ?? 0) * 2;
    const getDeffScore = (units: Record<string, number>) =>
      (units.spear ?? 0) * 1 +
      (units.sword ?? 0) * 1 +
      (units.heavy ?? 0) * 2.4 +
      (units.archer ?? 0) * 1 +
      (units.spy ?? 0) * 0.25;

    const uniqueReports = dedupeReports(dbReports);
    for (const report of uniqueReports) {
      const details = report.details;
      const targetCoord = parseCoord(details?.target ?? "");
      const originCoord = parseCoord(details?.origin ?? "");
      const relevantTarget =
        (targetCoord && targets.has(targetCoord) && targetCoord) ||
        (originCoord && targets.has(originCoord) && originCoord) ||
        "";
      if (!relevantTarget) continue;
      const bucket = scoreByCoord.get(relevantTarget);
      if (!bucket) continue;

      const battleMs = parseBattleTime(
        details?.battleTime ?? "",
        report.fetchedAt || new Date().toISOString()
      ).getTime();
      const nowMs = Date.now();
      const ageDays = Number.isFinite(battleMs)
        ? Math.max(0, (nowMs - battleMs) / (1000 * 60 * 60 * 24))
        : 365;
      const recencyWeight = Math.max(0.15, Math.exp(-ageDays / 45));

      // If the coord is the report target, defender units are likely stationed there.
      if (targetCoord === relevantTarget) {
        const stationed = normalizeUnits(
          (details?.defenderUnits as Record<string, unknown> | undefined) ?? {}
        );
        bucket.offScore += getOffScore(stationed) * recencyWeight * 1.1;
        bucket.deffScore += getDeffScore(stationed) * recencyWeight * 1.1;
        bucket.samples += 1;
      }

      // If the coord is the report origin, attacker units were sent from there.
      if (originCoord === relevantTarget) {
        const sent = normalizeUnits(
          (details?.attackerUnits as Record<string, unknown> | undefined) ?? {}
        );
        bucket.offScore += getOffScore(sent) * recencyWeight * 0.9;
        bucket.deffScore += getDeffScore(sent) * recencyWeight * 0.7;
        bucket.samples += 0.8;
      }
    }

    const results = Array.from(scoreByCoord.entries()).map(([coord, values]) => {
      const score =
        values.offScore * 1.25 -
        values.deffScore * 0.9 +
        Math.min(values.samples, 12) * 8;
      return {
        coord,
        offScore: values.offScore,
        deffScore: values.deffScore,
        samples: values.samples,
        score,
      };
    });
    results.sort((a, b) => b.score - a.score);
    return results;
  }, [fgTargetCoords, dbReports]);

  const fgAgTargetSuggestions = useMemo(() => {
    const targets = new Set(fgTargetCoords);
    if (targets.size === 0) {
      return [] as Array<{
        coord: string;
        avgDeffScore: number;
        samples: number;
        myAttacks: number;
        myWipes: number;
        score: number;
      }>;
    }

    const me = (dbSelectedPlayerName || "").trim().toLowerCase();
    const buckets = new Map<
      string,
      {
        deffSum: number;
        deffSamples: number;
        samples: number;
        myAttacks: number;
        myWipes: number;
      }
    >();
    for (const coord of fgTargetCoords) {
      buckets.set(coord, {
        deffSum: 0,
        deffSamples: 0,
        samples: 0,
        myAttacks: 0,
        myWipes: 0,
      });
    }

    const normalizeUnits = (raw: Record<string, unknown> | undefined | null) => {
      const out: Record<string, number> = {};
      if (!raw) return out;
      for (const [key, value] of Object.entries(raw)) {
        const numeric = Number(value ?? 0);
        if (!Number.isFinite(numeric)) continue;
        out[key] = Math.max(0, numeric);
      }
      return out;
    };
    const asRecord = (value: unknown): Record<string, unknown> | undefined => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
      return value as Record<string, unknown>;
    };

    const deffScore = (units: Record<string, number>) =>
      (units.spear ?? 0) * 1 +
      (units.sword ?? 0) * 1 +
      (units.heavy ?? 0) * 2.4 +
      (units.archer ?? 0) * 1 +
      (units.spy ?? 0) * 0.2;

    const uniqueReports = dedupeReports(dbReports);
    for (const report of uniqueReports) {
      const details = report.details;
      const targetCoord = parseCoord(details?.target ?? "");
      if (!targetCoord || !targets.has(targetCoord)) continue;
      const bucket = buckets.get(targetCoord);
      if (!bucket) continue;

      bucket.samples += 1;

      const defender = normalizeUnits(
        asRecord(details?.defenderUnits)
      );
      if (Object.keys(defender).length > 0) {
        bucket.deffSum += deffScore(defender);
        bucket.deffSamples += 1;
      }

      const attackerName = String(details?.attacker ?? "").trim().toLowerCase();
      if (me && attackerName === me) {
        bucket.myAttacks += 1;
        const attackerUnits = normalizeUnits(
          asRecord(details?.attackerUnits)
        );
        const attackerLosses = normalizeUnits(
          asRecord(details?.attackerLossesUnits) ?? asRecord(details?.attackerLosses)
        );
        const totalSent = sumUnits(attackerUnits);
        const totalLost = sumUnits(attackerLosses);
        if (totalSent > 0 && totalLost >= totalSent) {
          bucket.myWipes += 1;
        }
      }
    }

    const result = Array.from(buckets.entries()).map(([coord, values]) => {
      const avgDeffScore =
        values.deffSamples > 0 ? values.deffSum / values.deffSamples : Number.POSITIVE_INFINITY;
      const myNoWipes = Math.max(0, values.myAttacks - values.myWipes);
      const wipeRate = values.myAttacks > 0 ? values.myWipes / values.myAttacks : 0;
      const score =
        // Prefer villages with little to no observed deff.
        (Number.isFinite(avgDeffScore) ? -avgDeffScore * 1.2 : -250) +
        // Prefer targets where own attacks were not full wipes.
        myNoWipes * 220 -
        values.myWipes * 900 -
        wipeRate * 450 +
        // Slight confidence bonus for having observations.
        Math.min(values.samples, 20) * 8;
      return {
        coord,
        avgDeffScore: Number.isFinite(avgDeffScore) ? avgDeffScore : 0,
        samples: values.samples,
        myAttacks: values.myAttacks,
        myWipes: values.myWipes,
        score,
      };
    });
    result.sort((a, b) => b.score - a.score);
    return result;
  }, [fgTargetCoords, dbReports, dbSelectedPlayerName]);

  useEffect(() => {
    if (fgMixOffCount <= 0) {
      if (fgMixOffTargetCoords.length > 0) setFgMixOffTargetCoords([]);
      return;
    }
    if (fgTargetCoords.length === 0) {
      if (fgMixOffTargetCoords.length > 0) setFgMixOffTargetCoords([]);
      return;
    }
    setFgMixOffTargetCoords((prev) => {
      const suggestedCoords = fgOffTargetSuggestions.map((item) => item.coord);
      const fallbackCoord = suggestedCoords[0] || fgTargetCoords[0] || "";
      const next: string[] = [];
      for (let i = 0; i < fgMixOffCount; i += 1) {
        const current = prev[i];
        if (current && fgTargetCoords.includes(current)) {
          next.push(current);
        } else {
          next.push(suggestedCoords[i] || fallbackCoord);
        }
      }
      return next;
    });
  }, [fgTargetCoords, fgMixOffCount, fgMixOffTargetCoords.length, fgOffTargetSuggestions]);

  const fgArrivalRanges = useMemo(() => {
    return fgArrivalWindows
      .map((window) => ({
        ...window,
        fromDate: new Date(window.from),
        toDate: new Date(window.to),
      }))
      .filter((window) => Number.isFinite(window.fromDate.getTime()) && Number.isFinite(window.toDate.getTime()))
      .filter((window) => window.toDate.getTime() >= window.fromDate.getTime());
  }, [fgArrivalWindows]);

  const fgCurrentPlayerVillages = useMemo(() => {
    const selected = (dbSelectedPlayerName || "").trim().toLowerCase();
    if (!selected) return [] as FakeVillageState[];
    const ownCoords = new Set<string>();
    for (const [coord, village] of dbVillages.entries()) {
      if ((village.playerName || "").trim().toLowerCase() === selected) ownCoords.add(coord);
    }
    const byCoord = new Map(dbVillageEntries.map((entry) => [entry.coord, entry]));
    const result: FakeVillageState[] = [];
    for (const coord of ownCoords) {
      const worldVillage = dbVillages.get(coord);
      if (!worldVillage) continue;
      const entry = byCoord.get(coord);
      const troops: Record<string, number> = {};
      const hasOwn = Boolean(entry?.troopsOwn && Object.keys(entry.troopsOwn).length > 0);
      const hasInVillage = Boolean(
        entry?.troopsInVillage && Object.keys(entry.troopsInVillage).length > 0
      );
      const hasOutwards = Boolean(
        entry?.troopsOutwards && Object.keys(entry.troopsOutwards).length > 0
      );
      const hasMoving = Boolean(entry?.troopsMoving && Object.keys(entry.troopsMoving).length > 0);
      for (const unit of dbOverviewUnitOrder) {
        const ownRaw = Math.max(0, Number(entry?.troopsOwn?.[unit] ?? 0));
        const inVillageRaw = Math.max(0, Number(entry?.troopsInVillage?.[unit] ?? 0));
        const outwardsRaw = Math.max(0, Number(entry?.troopsOutwards?.[unit] ?? 0));
        const movingRaw = Math.max(0, Number(entry?.troopsMoving?.[unit] ?? 0));

        // Preferred source: own troops currently present in village.
        // "eigene" can include troops that are not in village, so subtract those first.
        if (hasOwn && (hasOutwards || hasMoving)) {
          const ownInVillageDerived = Math.max(0, ownRaw - outwardsRaw - movingRaw);
          troops[unit] = hasInVillage
            ? Math.min(ownInVillageDerived, inVillageRaw)
            : ownInVillageDerived;
          continue;
        }

        // Fallbacks when partial categories are missing.
        if (hasOwn && hasInVillage) {
          troops[unit] = Math.min(ownRaw, inVillageRaw);
        } else if (hasOwn) {
          troops[unit] = ownRaw;
        } else if (hasInVillage) {
          troops[unit] = inVillageRaw;
        } else {
          troops[unit] = 0;
        }
      }
      result.push({
        coord,
        villageId: worldVillage.villageId,
        villageName: worldVillage.villageName,
        playerName: worldVillage.playerName,
        x: worldVillage.x,
        y: worldVillage.y,
        troops,
        points: Number(worldVillage.points ?? 0),
        role: entry?.role ?? classifyVillage(troops),
        usedCount: 0,
      });
    }
    const filtered =
      fgGroupFilter === "all" ? result : result.filter((village) => village.role === fgGroupFilter);
    return filtered.sort((a, b) => a.coord.localeCompare(b.coord, "de"));
  }, [dbSelectedPlayerName, dbVillages, dbVillageEntries, dbOverviewUnitOrder, fgGroupFilter]);

  const fgAvailableOffVillageCount = useMemo(() => {
    const selected = (dbSelectedPlayerName || "").trim().toLowerCase();
    if (!selected) return 0;
    const entriesByCoord = new Map(dbVillageEntries.map((entry) => [entry.coord, entry]));
    let count = 0;
    for (const [coord, village] of dbVillages.entries()) {
      if ((village.playerName || "").trim().toLowerCase() !== selected) continue;
      const entry = entriesByCoord.get(coord);
      const hasOwn = Boolean(entry?.troopsOwn && Object.keys(entry.troopsOwn).length > 0);
      const hasInVillage = Boolean(
        entry?.troopsInVillage && Object.keys(entry.troopsInVillage).length > 0
      );
      const hasOutwards = Boolean(
        entry?.troopsOutwards && Object.keys(entry.troopsOutwards).length > 0
      );
      const hasMoving = Boolean(entry?.troopsMoving && Object.keys(entry.troopsMoving).length > 0);
      const getAvailable = (unit: string) => {
        const ownRaw = Math.max(0, Number(entry?.troopsOwn?.[unit] ?? 0));
        const inVillageRaw = Math.max(0, Number(entry?.troopsInVillage?.[unit] ?? 0));
        const outwardsRaw = Math.max(0, Number(entry?.troopsOutwards?.[unit] ?? 0));
        const movingRaw = Math.max(0, Number(entry?.troopsMoving?.[unit] ?? 0));
        if (hasOwn && (hasOutwards || hasMoving)) {
          const ownInVillageDerived = Math.max(0, ownRaw - outwardsRaw - movingRaw);
          return hasInVillage
            ? Math.min(ownInVillageDerived, inVillageRaw)
            : ownInVillageDerived;
        }
        if (hasOwn && hasInVillage) return Math.min(ownRaw, inVillageRaw);
        if (hasOwn) return ownRaw;
        if (hasInVillage) return inVillageRaw;
        return 0;
      };

      const axe = getAvailable("axe");
      const light = getAvailable("light");
      const ram = getAvailable("ram");
      if (axe >= 2000 && light >= 900 && ram >= 100) {
        count += 1;
      }
    }
    return count;
  }, [dbSelectedPlayerName, dbVillageEntries, dbVillages]);

  const fgAvailableAgChainsCount = useMemo(() => {
    if (fgCurrentPlayerVillages.length === 0) return 0;
    if (fgTargetCoords.length === 0) return 0;

    const selectedPlayerPoints = dbSelectedPlayerInfo?.points ?? 0;
    const ratioEnabled =
      fgFilterRatio && fgNightBonusConfig.ratio > 0 && selectedPlayerPoints > 0;

    const validTargets = fgTargetCoords.filter((targetCoord) => {
      const targetVillage = dbVillages.get(targetCoord);
      if (!targetVillage) return false;
      if (!ratioEnabled) return true;
      const targetPlayer = dbPlayers.get(targetVillage.playerId);
      const targetPoints = targetPlayer?.points ?? 0;
      return targetPoints >= selectedPlayerPoints / fgNightBonusConfig.ratio;
    });
    if (validTargets.length === 0) return 0;

    const working = fgCurrentPlayerVillages.map((village) => ({
      ...village,
      troops: { ...village.troops },
      usedCount: 0,
    }));
    const now = new Date();
    let chainCount = 0;

    const pickCandidate = (
      targetCoord: string,
      unitsBuilder: (village: FakeVillageState) => Record<string, number> | null,
      attackType: "off" | "ag",
      usedOrigins: Set<string>,
      minArrivalMs: number
    ) => {
      const targetVillage = dbVillages.get(targetCoord);
      if (!targetVillage) return null as null | {
        village: (typeof working)[number];
        units: Record<string, number>;
        slowestUnit: string;
        travelSeconds: number;
        arrivalAt: Date;
      };
      const candidates: Array<{
        village: (typeof working)[number];
        units: Record<string, number>;
        slowestUnit: string;
        travelSeconds: number;
        arrivalAt: Date;
      }> = [];
      for (const village of working) {
        if (usedOrigins.has(village.coord)) continue;
        if (fgMaxAttacksPerVillage > 0 && village.usedCount >= fgMaxAttacksPerVillage) continue;
        const units = unitsBuilder(village);
        if (!units) continue;
        const slowestUnit = getSlowestFakeUnit(units);
        const speedSeconds = getFakeSpeedSeconds(slowestUnit);
        if (!speedSeconds) continue;
        const distance = Math.hypot(village.x - targetVillage.x, village.y - targetVillage.y);
        const travelSeconds = distance * speedSeconds;
        const arrivalAt = new Date(now.getTime() + travelSeconds * 1000);
        if (arrivalAt.getTime() < minArrivalMs) continue;
        if (
          !isFakeArrivalAllowed(
            arrivalAt,
            village.playerName,
            attackType === "ag" ? "ag" : "attack"
          )
        ) {
          continue;
        }
        candidates.push({
          village,
          units,
          slowestUnit,
          travelSeconds,
          arrivalAt,
        });
      }
      if (candidates.length === 0) return null;
      candidates.sort((a, b) => {
        const usageDiff = a.village.usedCount - b.village.usedCount;
        if (usageDiff !== 0) return usageDiff;
        const travelDiff = a.travelSeconds - b.travelSeconds;
        if (travelDiff !== 0) return travelDiff;
        return a.village.coord.localeCompare(b.village.coord, "de");
      });
      return candidates[0];
    };

    while (true) {
      let builtForAnyTarget = false;
      for (const targetCoord of validTargets) {
        const usedOrigins = new Set<string>();
        const offCandidate = pickCandidate(
          targetCoord,
          (village) => buildOffMixUnits(village),
          "off",
          usedOrigins,
          0
        );
        if (!offCandidate) continue;
        const miniUsedOrigins = new Set<string>();

        let miniCount = 0;
        const minArrivalMs = offCandidate.arrivalAt.getTime() + 1000;
        const selectedMini: Array<{
          village: (typeof working)[number];
          units: Record<string, number>;
        }> = [];
        while (miniCount < 4) {
          const miniCandidate = pickCandidate(
            targetCoord,
            (village) => buildAgChainMiniUnits(village, fgAgChainPreset),
            "ag",
            miniUsedOrigins,
            minArrivalMs
          );
          if (!miniCandidate) break;
          miniUsedOrigins.add(miniCandidate.village.coord);
          selectedMini.push({ village: miniCandidate.village, units: miniCandidate.units });
          miniCount += 1;
        }
        if (miniCount < 4) continue;

        subtractFakeUnits(offCandidate.village, offCandidate.units);
        offCandidate.village.usedCount += 1;
        for (const mini of selectedMini) {
          subtractFakeUnits(mini.village, mini.units);
          mini.village.usedCount += 1;
        }
        chainCount += 1;
        builtForAnyTarget = true;
        break;
      }
      if (!builtForAnyTarget) break;
    }

    return chainCount;
  }, [
    fgCurrentPlayerVillages,
    fgTargetCoords,
    dbSelectedPlayerInfo?.points,
    fgFilterRatio,
    fgNightBonusConfig.ratio,
    dbVillages,
    dbPlayers,
    fgMaxAttacksPerVillage,
    fgAgChainPreset,
    fgArrivalRanges,
    fgAvoidNightBonus,
    fgNightBonusBuffer,
  ]);

  const fgOpenButtonRanges = useMemo(() => {
    const perButton = Math.max(1, fgAttacksPerButton);
    const ranges: Array<{ start: number; end: number; index: number }> = [];
    for (let start = 0, index = 0; start < fgResultRows.length; start += perButton, index += 1) {
      ranges.push({
        start,
        end: Math.min(fgResultRows.length, start + perButton),
        index,
      });
    }
    return ranges;
  }, [fgAttacksPerButton, fgResultRows.length]);

  const sdUnitOrder = useMemo(() => {
    const available = new Set(dbOverviewUnitOrder);
    return STANDDEFF_DEFAULT_UNITS.filter((unit) => available.has(unit));
  }, [dbOverviewUnitOrder]);

  const sdOwnVillages = useMemo(() => {
    const selected = (dbSelectedPlayerName || "").trim().toLowerCase();
    if (!selected) return [] as Array<{
      coord: string;
      villageId: string;
      villageName: string;
      x: number;
      y: number;
      troops: Record<string, number>;
      role: VillageRole;
    }>;
    const entriesByCoord = new Map(dbVillageEntries.map((entry) => [entry.coord, entry]));
    const result: Array<{
      coord: string;
      villageId: string;
      villageName: string;
      x: number;
      y: number;
      troops: Record<string, number>;
      role: VillageRole;
    }> = [];
    for (const [coord, village] of dbVillages.entries()) {
      if ((village.playerName || "").trim().toLowerCase() !== selected) continue;
      const entry = entriesByCoord.get(coord);
      const troopsSource =
        entry?.troopsInVillage ??
        entry?.troopsOwn ??
        entry?.troopsTotal ??
        entry?.troops ??
        {};
      const troops: Record<string, number> = {};
      for (const unit of dbOverviewUnitOrder) {
        troops[unit] = Math.max(0, Number(troopsSource?.[unit] ?? 0));
      }
      result.push({
        coord,
        villageId: village.villageId,
        villageName: village.villageName,
        x: village.x,
        y: village.y,
        troops,
        role: normalizeVillageRole(entry?.role ?? classifyVillage(troops)),
      });
    }
    return result.sort((a, b) => a.coord.localeCompare(b.coord, "de"));
  }, [dbSelectedPlayerName, dbVillageEntries, dbVillages, dbOverviewUnitOrder]);
  const retimeRows = useMemo(() => {
    const maxRows = Math.max(1, Number(retimeMaxResults.replace(/[^\d]/g, "") || "100"));
    const selectedOwnVillages = sdOwnVillages.filter((village) => {
      if (village.role !== "off") return false;
      for (const unit of dbOverviewUnitOrder) {
        if (!OFF_RELOCATE_UNITS.has(unit)) continue;
        if (Number(village.troops?.[unit] ?? 0) > 0) return true;
      }
      return false;
    });
    if (selectedOwnVillages.length === 0) return [] as RetimeResultRow[];
    const nowMs = Date.now();
    const rows: RetimeResultRow[] = [];
    for (const incoming of allAttackRows) {
      const impactMs = new Date(incoming.arrivalAtIso).getTime();
      if (!Number.isFinite(impactMs)) continue;
      const enemyUnit = resolveIncomingUnitKey(incoming.unitLabel);
      if (!enemyUnit) continue;
      const enemyUnitSeconds = secondsPerField(dbUnitSpeeds, [enemyUnit], dbConfig).seconds;
      if (!enemyUnitSeconds || enemyUnitSeconds <= 0) continue;
      const [originX, originY] = incoming.originCoord.split("|").map((value) => Number(value));
      const [targetX, targetY] = incoming.targetCoord.split("|").map((value) => Number(value));
      if (
        !Number.isFinite(originX) ||
        !Number.isFinite(originY) ||
        !Number.isFinite(targetX) ||
        !Number.isFinite(targetY)
      ) {
        continue;
      }
      const enemyDistance = Math.hypot(originX - targetX, originY - targetY);
      const returnMs = Math.round(impactMs + enemyDistance * enemyUnitSeconds * 1000);
      if (returnMs <= nowMs) continue;
      const targetVillage = dbVillages.get(incoming.originCoord);
      if (!targetVillage) continue;
      for (const source of selectedOwnVillages) {
        if (source.coord === incoming.originCoord) continue;
        const fullUnitPack: Record<string, number> = {};
        for (const unit of dbOverviewUnitOrder) {
          if (!OFF_RELOCATE_UNITS.has(unit)) continue;
          const amount = Math.max(0, Number(source.troops?.[unit] ?? 0));
          if (amount > 0) fullUnitPack[unit] = amount;
        }
        const noRamPack: Record<string, number> = {};
        for (const [unit, amount] of Object.entries(fullUnitPack)) {
          if (unit === "ram") continue;
          noRamPack[unit] = amount;
        }

        const candidatePacks: Array<{ idSuffix: string; pack: Record<string, number> }> = [];
        if (Object.keys(fullUnitPack).length > 0) {
          candidatePacks.push({ idSuffix: "full", pack: fullUnitPack });
        }
        const noRamUnits = Object.keys(noRamPack);
        if (noRamUnits.length > 0) {
          const hasDifferentComposition =
            noRamUnits.length !== Object.keys(fullUnitPack).length ||
            Object.keys(fullUnitPack).includes("ram");
          if (hasDifferentComposition) {
            candidatePacks.push({ idSuffix: "noram", pack: noRamPack });
          }
        }

        for (const candidate of candidatePacks) {
          const packUnits = Object.keys(candidate.pack);
          if (packUnits.length === 0) continue;
          const unitSeconds = secondsPerField(dbUnitSpeeds, packUnits, dbConfig).seconds;
          if (!unitSeconds || unitSeconds <= 0) continue;
          const distance = Math.hypot(source.x - targetVillage.x, source.y - targetVillage.y);
          const hitMs = returnMs + 1000;
          const sendMs = Math.round(hitMs - distance * unitSeconds * 1000);
          if (sendMs <= nowMs) continue;
          rows.push({
            id: `${incoming.id}-${source.coord}-${candidate.idSuffix}-${retimeSendAsSupport ? "sup" : "atk"}`,
            attackerPlayer: incoming.playerName || "-",
            unitPack: candidate.pack,
            sourceCoord: source.coord,
            sourceName: source.villageName,
            sourceVillageId: source.villageId,
            targetCoord: incoming.originCoord,
            targetName: targetVillage.villageName || incoming.originName,
            targetVillageId: targetVillage.villageId,
            sendAtIso: new Date(sendMs).toISOString(),
            sendAtLabel: new Date(sendMs).toLocaleString("de-DE"),
            arrivalAtIso: new Date(hitMs).toISOString(),
            arrivalAtLabel: new Date(hitMs).toLocaleString("de-DE"),
            link: buildStanddeffActionLink(source.villageId, targetVillage.villageId, candidate.pack),
          });
        }
      }
    }
    return rows
      .sort((a, b) => new Date(a.sendAtIso).getTime() - new Date(b.sendAtIso).getTime())
      .slice(0, maxRows);
  }, [
    allAttackRows,
    sdOwnVillages,
    dbUnitSpeeds,
    dbConfig,
    dbVillages,
    retimeSendAsSupport,
    retimeMaxResults,
    dbOverviewUnitOrder,
  ]);

  const sdThreatByTarget = useMemo(() => {
    const ownCoords = new Set(sdOwnVillages.map((item) => item.coord));
    const byTarget = new Map<
      string,
      { earliestArrivalMs: number; earliestArrivalIso: string; earliestArrivalLabel: string; attacks: number }
    >();
    for (const row of allAttackRows) {
      if (!ownCoords.has(row.targetCoord)) continue;
      const label = row.predictedType.label;
      if (label !== "OFF" && label !== "Fake" && label !== "Unbekannt") {
        continue;
      }
      const arrivalMs = new Date(row.arrivalAtIso).getTime();
      if (!Number.isFinite(arrivalMs)) continue;
      const existing = byTarget.get(row.targetCoord);
      if (!existing || arrivalMs < existing.earliestArrivalMs) {
        byTarget.set(row.targetCoord, {
          earliestArrivalMs: arrivalMs,
          earliestArrivalIso: row.arrivalAtIso,
          earliestArrivalLabel: row.arrivalLabel,
          attacks: (existing?.attacks ?? 0) + 1,
        });
      } else {
        byTarget.set(row.targetCoord, {
          ...existing,
          attacks: existing.attacks + 1,
        });
      }
    }
    return byTarget;
  }, [allAttackRows, sdOwnVillages]);

  const sdThreatenedCount = sdThreatByTarget.size;
  const tabitExportText = useMemo(() => {
    if (tabitResults.length === 0) return "";
    return tabitResults
      .map((row) => {
        const attackerVillageId = row.sourceVillageId || "0";
        const targetVillageId = row.targetVillageId || "0";
        const unitCandidates = dbOverviewUnitOrder.filter(
          (unit) => Math.max(0, Number(row.unitPack[unit] ?? 0)) > 0
        );
        const slowestFromCalc = secondsPerField(dbUnitSpeeds, unitCandidates, dbConfig).slowestUnit;
        const slowestUnit = slowestFromCalc || unitCandidates[0] || "spear";
        const arrivalTs = new Date(row.arrivalIso).getTime();
        const typeCode = 8;
        const unitParts = dbOverviewUnitOrder
          .map((unit) => `${unit}=${btoa(String(Math.max(0, Number(row.unitPack[unit] ?? 0))))}`)
          .join("/");
        return `${attackerVillageId}&${targetVillageId}&${slowestUnit}&${arrivalTs}&${typeCode}&false&false&${unitParts}`;
      })
      .join("\n");
  }, [tabitResults, dbOverviewUnitOrder, dbUnitSpeeds, dbConfig]);
  const tabitBbCodeText = useMemo(() => {
    if (tabitResults.length === 0) return "";
    const esc = (value: string) => value.replace(/\[/g, "(").replace(/\]/g, ")");
    const lines: string[] = [];
    lines.push("[table]");
    lines.push(
      "[**][b]Herkunftsdorf[/b][||][b]Ziel[/b][||][b]Modus[/b][||][b]Abschicken[/b][||][b]Ankunft[/b][||][b]Zeit bis Abschicken[/b][||][b]Action[/b][/**]"
    );
    for (const row of tabitResults) {
      const source = `[village]${esc(row.sourceCoord)}[/village]`;
      const target = `[village]${esc(row.targetCoord)}[/village]`;
      const mode = row.mode === "support" ? "Unterstützung" : "Angriff";
      const send = esc(row.sendLabel);
      const arrival = esc(row.arrivalLabel);
      const countdown = esc(formatSendCountdown(new Date(row.sendIso), plannerNow));
      const action = row.link ? `[url=${row.link}]Play[/url]` : "-";
      lines.push(`[**]${source}[||]${target}[||]${mode}[||]${send}[||]${arrival}[||]${countdown}[||]${action}[/**]`);
    }
    lines.push("[/table]");
    return lines.join("\n");
  }, [tabitResults, plannerNow]);

  const sdCombinedRelocations = useMemo(() => {
    const merged = new Map<string, StanddeffTransferRow>();
    const appendRow = (row: StanddeffTransferRow) => {
      const key = `${row.sourceCoord}|${row.targetCoord}`;
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, {
          ...row,
          units: { ...row.units },
        });
        return;
      }
      const units = { ...existing.units };
      for (const unit of dbOverviewUnitOrder) {
        const add = Math.max(0, Number(row.units?.[unit] ?? 0));
        if (add <= 0) continue;
        units[unit] = Math.max(0, Number(units[unit] ?? 0)) + add;
      }
      const etaMs = Math.max(
        new Date(existing.etaAtIso).getTime(),
        new Date(row.etaAtIso).getTime()
      );
      const deadlineMs = Math.min(
        new Date(existing.deadlineIso).getTime(),
        new Date(row.deadlineIso).getTime()
      );
      merged.set(key, {
        ...existing,
        units,
        etaAtIso: new Date(etaMs).toISOString(),
        etaLabel: new Date(etaMs).toLocaleString("de-DE"),
        deadlineIso: new Date(deadlineMs).toISOString(),
        deadlineLabel: new Date(deadlineMs).toLocaleString("de-DE"),
        bufferSeconds: Math.floor((deadlineMs - etaMs) / 1000),
        link: buildStanddeffActionLink(existing.sourceVillageId, existing.targetVillageId, units),
      });
    };
    for (const row of sdDeffRelocations) appendRow(row);
    for (const row of sdOffRelocations) appendRow(row);
    return Array.from(merged.values()).sort(
      (a, b) => new Date(a.deadlineIso).getTime() - new Date(b.deadlineIso).getTime()
    );
  }, [sdDeffRelocations, sdOffRelocations, dbOverviewUnitOrder]);

  useEffect(() => {
    const canvas = searchMapCanvasRef.current;
    if (!canvas || searchDisplayMode === "none") return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const width = 1000;
    const height = 1000;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = "#5e8429";
    ctx.fillRect(0, 0, width, height);

    const allVillages = Array.from(dbVillages.values());
    if (allVillages.length === 0) return;
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const village of allVillages) {
      if (village.x < minX) minX = village.x;
      if (village.x > maxX) maxX = village.x;
      if (village.y < minY) minY = village.y;
      if (village.y > maxY) maxY = village.y;
    }
    const mapPadding = 10;
    const spanX = Math.max(1, maxX - minX);
    const spanY = Math.max(1, maxY - minY);
    const toPx = (x: number, y: number) => ({
      px: mapPadding + ((x - minX) / spanX) * (width - mapPadding * 2),
      py: mapPadding + ((y - minY) / spanY) * (height - mapPadding * 2),
    });

    ctx.strokeStyle = "rgba(20, 40, 18, 0.35)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 10; i += 1) {
      const x = mapPadding + (i / 10) * (width - mapPadding * 2);
      const y = mapPadding + (i / 10) * (height - mapPadding * 2);
      ctx.beginPath();
      ctx.moveTo(x, mapPadding);
      ctx.lineTo(x, height - mapPadding);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(mapPadding, y);
      ctx.lineTo(width - mapPadding, y);
      ctx.stroke();
    }

    ctx.fillStyle = "rgba(245, 252, 240, 0.75)";
    for (const village of allVillages) {
      const { px, py } = toPx(village.x, village.y);
      ctx.fillRect(px, py, 1.25, 1.25);
    }

    ctx.fillStyle = "#29b6f6";
    for (const coord of searchPrimaryPlayerCoords) {
      const village = dbVillages.get(coord);
      if (!village) continue;
      const { px, py } = toPx(village.x, village.y);
      ctx.fillRect(px - 1, py - 1, 3, 3);
    }
  }, [searchDisplayMode, searchPrimaryPlayerCoords, dbVillages]);

  useEffect(() => {
    function handleSearchSuggestOutsideClick(event: MouseEvent) {
      const target = event.target as Node;
      if (
        searchAccountSuggestRef.current &&
        !searchAccountSuggestRef.current.contains(target)
      ) {
        setSearchAccountSuggestOpen(false);
      }
      if (
        searchTribeSuggestRef.current &&
        !searchTribeSuggestRef.current.contains(target)
      ) {
        setSearchTribeSuggestOpen(false);
      }
      if (
        villageFilterPlayerSuggestRef.current &&
        !villageFilterPlayerSuggestRef.current.contains(target)
      ) {
        setVillageFilterPlayerSuggestOpen(false);
      }
      if (
        villageFilterTribeSuggestRef.current &&
        !villageFilterTribeSuggestRef.current.contains(target)
      ) {
        setVillageFilterTribeSuggestOpen(false);
      }
    }
    document.addEventListener("mousedown", handleSearchSuggestOutsideClick);
    return () => document.removeEventListener("mousedown", handleSearchSuggestOutsideClick);
  }, []);

  useEffect(() => {
    if (!activeDbWorld || !searchCoordVillageResult) {
      setSearchVillagePointsHistory([]);
      setSearchVillagePointsLoading(false);
      return;
    }
    const controller = new AbortController();
    const load = async () => {
      setSearchVillagePointsLoading(true);
      try {
        const response = await fetch(
          `${DB_API}/api/history/village/${encodeURIComponent(activeDbWorld)}/${encodeURIComponent(
            searchCoordVillageResult.coord
          )}?limit=240`,
          { signal: controller.signal }
        );
        if (!response.ok) throw new Error("history load failed");
        const payload = await response.json();
        const rows = Array.isArray(payload?.history) ? payload.history : [];
        setSearchVillagePointsHistory(
          rows
            .map((row: unknown) => {
              const item = row as { snapshotAt?: unknown; points?: unknown };
              return {
                snapshotAt: String(item.snapshotAt ?? ""),
                points: Number(item.points ?? 0),
              };
            })
            .filter((row) => row.snapshotAt && Number.isFinite(row.points))
        );
      } catch {
        if (!controller.signal.aborted) {
          setSearchVillagePointsHistory([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setSearchVillagePointsLoading(false);
        }
      }
    };
    void load();
    return () => controller.abort();
  }, [DB_API, activeDbWorld, searchCoordVillageResult]);

  useEffect(() => {
    if (!activeDbWorld) return;
    if (insertsHydratingRef.current) return;
    if (!insertUnitsText.trim()) return;
    if (!dbSelectedPlayerId && !dbSelectedPlayerName.trim()) return;
    const parsed = parseTroopsOverview(insertUnitsText, dbOverviewUnitOrder);
    if (parsed.length === 0) return;
    setDbVillageEntries((current) => mergeVillageEntries(current, parsed));
    setInsertUnitsText("");
    triggerStatus("units", setInsertUnitsStatus);
  }, [activeDbWorld, insertUnitsText, dbOverviewUnitOrder, dbSelectedPlayerId, dbSelectedPlayerName]);

  useEffect(() => {
    if (!activeDbWorld) return;
    if (insertsHydratingRef.current) return;
    if (!insertBuildingsText.trim()) return;
    if (!dbSelectedPlayerId && !dbSelectedPlayerName.trim()) return;
    const parsed = parseBuildingsOverview(insertBuildingsText);
    if (parsed.length === 0) return;
    setDbVillageEntries((current) => mergeVillageEntries(current, parsed));
    setInsertBuildingsText("");
    triggerStatus("buildings", setInsertBuildingsStatus);
  }, [activeDbWorld, insertBuildingsText, dbSelectedPlayerId, dbSelectedPlayerName]);

  useEffect(() => {
    if (!activeDbWorld) return;
    if (insertsHydratingRef.current) return;
    const raw = insertSosText.trim();
    if (!raw) return;
    const parsed = parseIncomingAttacksInsert(insertSosText);
    if (parsed.length === 0) return;
    setDbIncomingAttacks((prev) => {
      const existingBySig = new Map<string, IncomingInsertAttack[]>();
      for (const row of prev) {
        const sig = buildIncomingAttackSignature(row);
        const bucket = existingBySig.get(sig) ?? [];
        bucket.push(row);
        existingBySig.set(sig, bucket);
      }

      const incomingBySig = new Map<string, IncomingInsertAttack[]>();
      for (const row of parsed) {
        const sig = buildIncomingAttackSignature(row);
        const bucket = incomingBySig.get(sig) ?? [];
        bucket.push(row);
        incomingBySig.set(sig, bucket);
      }

      const additions: IncomingInsertAttack[] = [];
      for (const [sig, incomingRows] of incomingBySig.entries()) {
        const existingCount = existingBySig.get(sig)?.length ?? 0;
        const missingCount = Math.max(0, incomingRows.length - existingCount);
        if (missingCount <= 0) continue;
        additions.push(...incomingRows.slice(0, missingCount));
      }

      return [...prev, ...additions].sort(
        (a, b) => new Date(a.arrivalAtIso).getTime() - new Date(b.arrivalAtIso).getTime()
      );
    });
    setInsertSosText("");
    triggerStatus("sos", setInsertSosStatus);
  }, [activeDbWorld, insertSosText]);

  useEffect(() => {
    const EXPIRY_GRACE_MS = 60_000;
    const timer = window.setInterval(() => {
      const now = Date.now();
      setDbIncomingAttacks((prev) =>
        prev.filter((row) => {
          const arrivalMs = new Date(row.arrivalAtIso).getTime();
          if (!Number.isFinite(arrivalMs)) return true;
          return arrivalMs + EXPIRY_GRACE_MS > now;
        })
      );
    }, 15_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!activeDbWorld) return;
    if (insertsHydratingRef.current) return;
    const raw = insertOutgoingText.trim();
    if (!raw) return;
    const parsed = parseOutgoingAttacksInsert(insertOutgoingText);
    if (parsed.length === 0) return;
    setDbOutgoingAttacks((prev) => {
      const map = new Map<string, OutgoingInsertAttack>();
      for (const row of prev) {
        const key = `${row.commandType}|${row.originCoord}|${row.targetCoord}|${row.arrivalAtIso}`;
        map.set(key, row);
      }
      for (const row of parsed) {
        const key = `${row.commandType}|${row.originCoord}|${row.targetCoord}|${row.arrivalAtIso}`;
        if (!map.has(key)) {
          map.set(key, row);
        }
      }
      return Array.from(map.values()).sort(
        (a, b) => new Date(a.arrivalAtIso).getTime() - new Date(b.arrivalAtIso).getTime()
      );
    });
    setInsertOutgoingText("");
    triggerStatus("outgoing", setInsertOutgoingStatus);
  }, [activeDbWorld, insertOutgoingText]);

  useEffect(() => {
    if (!dbSelectedPlayerId && !dbSelectedPlayerName.trim()) return;
    setDbVillageEntries((current) => {
      const selectedName = dbSelectedPlayerName.trim().toLowerCase();
      const filtered = current.filter((entry) => {
        const worldVillage = dbVillages.get(entry.coord);
        if (worldVillage) {
          if (dbSelectedPlayerId) return worldVillage.playerId === dbSelectedPlayerId;
          return worldVillage.playerName.trim().toLowerCase() === selectedName;
        }
        return entry.player.trim().toLowerCase() === selectedName;
      });
      return filtered.length === current.length ? current : filtered;
    });
  }, [dbSelectedPlayerId, dbSelectedPlayerName, dbVillages]);

  useEffect(() => {
    setConfig(parseConfig(plannerConfigText));
  }, [plannerConfigText]);

  useEffect(() => {
    setUnitSpeeds(parseUnitInfo(plannerUnitInfoText));
  }, [plannerUnitInfoText]);

  const availableUnits = useMemo(() => {
    const fromNames = parseUnitNames(plannerUnitInfoText).map((name) => name.toLowerCase());
    if (fromNames.length > 0) return fromNames;
    const fromFile = Array.from(unitSpeeds.keys());
    if (fromFile.length > 0) return fromFile;
    return DEFAULT_UNITS;
  }, [plannerUnitInfoText, unitSpeeds]);

  const agSlowUnit = useMemo(() => {
    return availableUnits.find((unit) => unit.toLowerCase() === AG_UNIT) ?? AG_UNIT;
  }, [availableUnits]);

  useEffect(() => {
    if (!selectedSlowUnit && availableUnits.length > 0) {
      const ramUnit = availableUnits.find((unit) => unit.toLowerCase() === "ram");
      setSelectedSlowUnit(ramUnit ?? availableUnits[0]);
    }
  }, [availableUnits, selectedSlowUnit]);

  useEffect(() => {
    if (attackCommandType !== "ag") return;
    if (!agSlowUnit) return;
    if (selectedSlowUnit !== agSlowUnit) {
      setSelectedSlowUnit(agSlowUnit);
    }
  }, [attackCommandType, selectedSlowUnit, agSlowUnit]);

  useEffect(() => {
    const inFinalList = attackerMode === "coords" || attackerCoordRows.length > 0;
    if (!inFinalList || attackerCoordRows.length === 0) {
      setAttackerListEditMode(false);
    }
  }, [attackerMode, attackerCoordRows.length]);

  useEffect(() => {
    const inFinalList = targetMode === "coords" || targetCoordRows.length > 0;
    if (!inFinalList || targetCoordRows.length === 0) {
      setTargetListEditMode(false);
    }
  }, [targetMode, targetCoordRows.length]);

  useEffect(() => {
    if (availableUnits.length === 0) return;
    setAttackerCoordRows((prev) =>
      prev.map((row) =>
        row.unit ? row : { ...row, unit: selectedSlowUnit || availableUnits[0] || "" }
      )
    );
  }, [availableUnits, selectedSlowUnit]);

  const buildDefaultAttackerRow = useCallback(
    (entry: { coord: string; x: number; y: number }): CoordAttackerRow => ({
      id: createId(),
      coord: entry.coord,
      x: entry.x,
      y: entry.y,
      unit: attackCommandType === "ag" ? agSlowUnit : selectedSlowUnit || availableUnits[0] || "",
      commandType: attackCommandType,
      count: Math.max(1, attackUnitCount),
    }),
    [attackCommandType, agSlowUnit, selectedSlowUnit, availableUnits, attackUnitCount]
  );
  const targetTypeOptions = useMemo<DefenderTargetType[]>(() => {
    const options: DefenderTargetType[] = [];
    if (targetDefaultAllowAttack) options.push("attack");
    if (targetDefaultAllowFake) options.push("fake");
    if (targetDefaultAllowAg) options.push("ag");
    if (targetDefaultAllowWallbreaker) options.push("wallbreaker");
    return options;
  }, [
    targetDefaultAllowAttack,
    targetDefaultAllowFake,
    targetDefaultAllowAg,
    targetDefaultAllowWallbreaker,
  ]);
  const editableTargetTypeOptions = useMemo<DefenderTargetType[]>(
    () => ["attack", "fake", "ag", "wallbreaker"],
    []
  );
  const defaultTargetType: DefenderTargetType = targetTypeOptions[0] ?? "attack";
  const setSingleDefaultTargetType = useCallback((next: DefenderTargetType) => {
    setTargetDefaultAllowAttack(next === "attack");
    setTargetDefaultAllowFake(next === "fake");
    setTargetDefaultAllowAg(next === "ag");
    setTargetDefaultAllowWallbreaker(next === "wallbreaker");
  }, []);
  const buildDefaultTargetRow = useCallback(
    (entry: { coord: string; x: number; y: number }): TargetCoordRow => ({
      id: createId(),
      coord: entry.coord,
      x: entry.x,
      y: entry.y,
      count: Math.max(1, targetDefaultCount),
      targetType: defaultTargetType,
      assignedAttacker: targetDefaultAssignedAttacker || "__all__",
    }),
    [
      targetDefaultCount,
      defaultTargetType,
      targetDefaultAssignedAttacker,
    ]
  );

  useEffect(() => {
    if (attackerMode !== "coords") return;
    if (!attackersText.trim()) return;
    const coords = extractCoords(attackersText);
    if (coords.length === 0) return;
    setAttackerCoordRows((prev) => {
      const next = [...prev];
      for (const coord of coords) {
        const [xRaw, yRaw] = coord.split("|");
        const x = Number(xRaw);
        const y = Number(yRaw);
        next.push(buildDefaultAttackerRow({ coord, x, y }));
      }
      return next;
    });
    setAttackersText("");
  }, [
    attackerMode,
    attackersText,
    buildDefaultAttackerRow,
  ]);
  useEffect(() => {
    if (targetMode !== "coords") return;
    if (!targetsText.trim()) return;
    const coords = extractCoords(targetsText);
    if (coords.length === 0) return;
    setTargetCoordRows((prev) => {
      const next = [...prev];
      for (const coord of coords) {
        const [xRaw, yRaw] = coord.split("|");
        const x = Number(xRaw);
        const y = Number(yRaw);
        next.push(buildDefaultTargetRow({ coord, x, y }));
      }
      return next;
    });
    setTargetsText("");
  }, [targetMode, targetsText, buildDefaultTargetRow]);

  useEffect(() => {
    if (!agSlowUnit) return;
    setAttackerCoordRows((prev) =>
      prev.map((row) =>
        row.commandType === "ag" && row.unit !== agSlowUnit ? { ...row, unit: agSlowUnit } : row
      )
    );
  }, [agSlowUnit]);

  const effectiveConfig = useMemo<WorldConfig>(
    () => (unitInfoIncludesSpeed ? { speed: 1, unitSpeed: 1 } : config),
    [unitInfoIncludesSpeed, config]
  );

  const { seconds: secondsField, slowestUnit } = useMemo(
    () =>
      secondsPerField(
        unitSpeeds,
        selectedSlowUnit ? [selectedSlowUnit] : [],
        effectiveConfig
      ),
    [unitSpeeds, selectedSlowUnit, effectiveConfig]
  );

  const { errors: attackerErrors } = useMemo(
    () => (attackerMode === "coords" ? parseAttackers(attackersText) : { entries: [], errors: [] }),
    [attackersText, attackerMode]
  );

  const { errors: targetErrors } = useMemo(
    () => (targetMode === "coords" ? parseTargets(targetsText) : { entries: [], errors: [] }),
    [targetsText, targetMode]
  );

  const villagesByPlayer = useMemo(() => {
    const map = new Map<string, { coord: string; x: number; y: number; name: string }[]>();
    for (const [coord, village] of villages.entries()) {
      const key = village.playerName;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push({ coord, x: village.x, y: village.y, name: village.villageName });
    }
    return map;
  }, [villages]);

  const attackerPlayerList = useMemo(
    () => uniqueNames(attackerPlayers),
    [attackerPlayers]
  );
  const targetPlayerList = useMemo(
    () => uniqueNames(targetPlayers),
    [targetPlayers]
  );

  const attackerTribe = useMemo(
    () => resolveAllyByQuery(allies, attackerTribeInput),
    [allies, attackerTribeInput]
  );
  const targetTribe = useMemo(
    () => resolveAllyByQuery(allies, targetTribeInput),
    [allies, targetTribeInput]
  );

  const attackerTribePlayers = useMemo(
    () => collectPlayersByAlly(players, attackerTribe?.allyId ?? ""),
    [players, attackerTribe]
  );
  const targetTribePlayers = useMemo(
    () => collectPlayersByAlly(players, targetTribe?.allyId ?? ""),
    [players, targetTribe]
  );

  const effectiveAttackerPlayers = useMemo(
    () =>
      attackerMode === "tribe"
        ? uniqueNames(attackerTribeSelectedPlayers)
        : attackerPlayerList,
    [attackerMode, attackerTribeSelectedPlayers, attackerPlayerList]
  );
  const effectiveTargetPlayers = useMemo(
    () =>
      targetMode === "tribe"
        ? uniqueNames(targetTribeSelectedPlayers)
        : targetPlayerList,
    [targetMode, targetTribeSelectedPlayers, targetPlayerList]
  );

  const filteredAttackerPlayers = useMemo(
    () => effectiveAttackerPlayers.filter((name) => !attackerExcludedPlayers.includes(name)),
    [effectiveAttackerPlayers, attackerExcludedPlayers]
  );
  const filteredTargetPlayers = useMemo(
    () => effectiveTargetPlayers.filter((name) => !targetExcludedPlayers.includes(name)),
    [effectiveTargetPlayers, targetExcludedPlayers]
  );

  useEffect(() => {
    if (attackerMode === "coords") return;
    setAttackerExcludedCoords([]);
    setAttackerExcludedPlayers([]);
    setAttackerActivePlayer("");
    if (attackerMode === "players") {
      setAttackerPlayersStage("input");
    } else {
      setAttackerTribeStage("tribe");
      setAttackerTribeSelectedPlayers([]);
    }
  }, [attackerMode]);

  useEffect(() => {
    if (targetMode === "coords") return;
    setTargetExcludedCoords([]);
    setTargetExcludedPlayers([]);
    setTargetActivePlayer("");
    if (targetMode === "players") {
      setTargetPlayersStage("input");
    } else {
      setTargetTribeStage("tribe");
      setTargetTribeSelectedPlayers([]);
    }
  }, [targetMode]);

  useEffect(() => {
    if (attackerMode !== "tribe") return;
    if (attackerTribeStage !== "players") return;
    if (attackerTribePlayers.length === 0) return;
    if (attackerTribeSelectedPlayers.length === 0) {
      setAttackerTribeSelectedPlayers(attackerTribePlayers);
    }
  }, [attackerMode, attackerTribeStage, attackerTribePlayers, attackerTribeSelectedPlayers.length]);

  useEffect(() => {
    if (targetMode !== "tribe") return;
    if (targetTribeStage !== "players") return;
    if (targetTribePlayers.length === 0) return;
    if (targetTribeSelectedPlayers.length === 0) {
      setTargetTribeSelectedPlayers(targetTribePlayers);
    }
  }, [targetMode, targetTribeStage, targetTribePlayers, targetTribeSelectedPlayers.length]);

  useEffect(() => {
    if (filteredAttackerPlayers.length === 0) {
      setAttackerActivePlayer("");
      return;
    }
    if (!filteredAttackerPlayers.includes(attackerActivePlayer)) {
      setAttackerActivePlayer(filteredAttackerPlayers[0]);
    }
  }, [filteredAttackerPlayers, attackerActivePlayer]);

  useEffect(() => {
    if (filteredTargetPlayers.length === 0) {
      setTargetActivePlayer("");
      return;
    }
    if (!filteredTargetPlayers.includes(targetActivePlayer)) {
      setTargetActivePlayer(filteredTargetPlayers[0]);
    }
  }, [filteredTargetPlayers, targetActivePlayer]);

  const attackersByPlayers = useMemo(
    () => collectCoordsFromPlayers(villagesByPlayer, filteredAttackerPlayers, attackerExcludedCoords),
    [villagesByPlayer, filteredAttackerPlayers, attackerExcludedCoords]
  );
  const targetsByPlayers = useMemo(
    () => collectCoordsFromPlayers(villagesByPlayer, filteredTargetPlayers, targetExcludedCoords),
    [villagesByPlayer, filteredTargetPlayers, targetExcludedCoords]
  );

  const attackerCoordsByRow = useMemo(
    () =>
      attackerCoordRows.map((entry) => ({
        coord: entry.coord,
        x: entry.x,
        y: entry.y,
      })),
    [attackerCoordRows]
  );

  const attackerSelectionCommitted =
    attackerMode === "coords" ||
    (attackerMode === "players" && attackerPlayersStage === "final") ||
    (attackerMode === "tribe" && attackerTribeStage === "final");
  const useRowBackedAttackers = attackerMode === "coords" || attackerCoordRows.length > 0;

  useEffect(() => {
    if (!attackerSelectionCommitted) return;
    if (attackerMode === "coords") return;
    setAttackerCoordRows((prev) => {
      const nextCoords = attackersByPlayers.map((entry) => entry.coord).sort();
      const prevCoords = Array.from(new Set(prev.map((row) => row.coord))).sort();
      if (
        prev.length > 0 &&
        nextCoords.length === prevCoords.length &&
        nextCoords.every((coord, index) => coord === prevCoords[index])
      ) {
        return prev;
      }
      const byCoord = new Map(prev.map((row) => [row.coord, row]));
      const next: CoordAttackerRow[] = attackersByPlayers.map((entry) => {
        const existing = byCoord.get(entry.coord);
        return (
          existing ?? {
            id: createId(),
            coord: entry.coord,
            x: entry.x,
            y: entry.y,
            unit: selectedSlowUnit || availableUnits[0] || "",
            commandType: attackCommandType,
            count: Math.max(1, attackUnitCount),
          }
        );
      });
      return next;
    });
  }, [
    attackerSelectionCommitted,
    attackerMode,
    attackersByPlayers,
    selectedSlowUnit,
    availableUnits,
    attackCommandType,
    attackUnitCount,
  ]);

  const mergedAttackers = useMemo(
    () => (useRowBackedAttackers ? attackerCoordsByRow : attackersByPlayers),
    [useRowBackedAttackers, attackerCoordsByRow, attackersByPlayers]
  );
  const attackerRows = useMemo(() => {
    if (useRowBackedAttackers) {
      return attackerCoordRows.map((row) => {
        const village = villages.get(row.coord);
        return {
          rowId: row.id,
          coord: row.coord,
          playerName: village?.playerName ?? "Unbekannt",
          villageName: village?.villageName ?? row.coord,
          unit: row.unit || "-",
          commandType: row.commandType,
          count: row.count,
        };
      });
    }
    if (mergedAttackers.length === 0) return [];
    return mergedAttackers.map((entry, index) => {
      const village = villages.get(entry.coord);
      const playerName = village?.playerName ?? "Unbekannt";
      const villageName = village?.villageName ?? entry.coord;
      const editable = attackerCoordRows.find((row) => row.coord === entry.coord);
      return {
        rowId: `coord-${entry.coord}-${index}`,
        coord: entry.coord,
        playerName,
        villageName,
        unit: (editable?.unit ?? selectedSlowUnit) || "-",
        commandType: editable?.commandType ?? attackCommandType,
        count: editable?.count ?? attackUnitCount,
      };
    });
  }, [
    useRowBackedAttackers,
    attackerCoordRows,
    mergedAttackers,
    villages,
    selectedSlowUnit,
    attackCommandType,
    attackUnitCount,
  ]);
  const attackerCoordSettings = useMemo(
    () => new Map(attackerCoordRows.map((row) => [row.coord, row])),
    [attackerCoordRows]
  );
  const showAttackerFinalList = attackerMode === "coords" || attackerCoordRows.length > 0;
  const attackerSelectionStepActive =
    (attackerMode === "players" && attackerPlayersStage !== "final") ||
    (attackerMode === "tribe" && attackerTribeStage !== "final");
  const targetCoordsByRow = useMemo(
    () =>
      targetCoordRows.map((entry) => ({
        coord: entry.coord,
        x: entry.x,
        y: entry.y,
      })),
    [targetCoordRows]
  );
  const targetSelectionCommitted =
    targetMode === "coords" ||
    (targetMode === "players" && targetPlayersStage === "final") ||
    (targetMode === "tribe" && targetTribeStage === "final");
  const useRowBackedTargets = targetMode === "coords" || targetCoordRows.length > 0;

  useEffect(() => {
    if (!targetSelectionCommitted) return;
    if (targetMode === "coords") return;
    setTargetCoordRows((prev) => {
      const nextCoords = targetsByPlayers.map((entry) => entry.coord).sort();
      const prevCoords = Array.from(new Set(prev.map((row) => row.coord))).sort();
      if (
        prev.length > 0 &&
        nextCoords.length === prevCoords.length &&
        nextCoords.every((coord, index) => coord === prevCoords[index])
      ) {
        return prev;
      }
      const byCoord = new Map(prev.map((row) => [row.coord, row]));
      const next: TargetCoordRow[] = targetsByPlayers.map((entry) => {
        const existing = byCoord.get(entry.coord);
        return existing ?? buildDefaultTargetRow(entry);
      });
      return next;
    });
  }, [targetSelectionCommitted, targetMode, targetsByPlayers, buildDefaultTargetRow]);

  const mergedTargets = useMemo(
    () => (useRowBackedTargets ? targetCoordsByRow : targetsByPlayers),
    [useRowBackedTargets, targetCoordsByRow, targetsByPlayers]
  );
  const targetRows = useMemo(() => {
    if (useRowBackedTargets) {
      return targetCoordRows.map((row) => {
        const village = villages.get(row.coord);
        return {
          rowId: row.id,
          coord: row.coord,
          playerName: village?.playerName ?? "Unbekannt",
          villageName: village?.villageName ?? row.coord,
          count: row.count,
          targetType: row.targetType,
          assignedAttacker: row.assignedAttacker,
        };
      });
    }
    if (mergedTargets.length === 0) return [];
    return mergedTargets.map((entry, index) => {
      const village = villages.get(entry.coord);
      const editable = targetCoordRows.find((row) => row.coord === entry.coord);
      return {
        rowId: `target-${entry.coord}-${index}`,
        coord: entry.coord,
        playerName: village?.playerName ?? "Unbekannt",
        villageName: village?.villageName ?? entry.coord,
        count: editable?.count ?? targetDefaultCount,
        targetType: editable?.targetType ?? defaultTargetType,
        assignedAttacker: editable?.assignedAttacker ?? "__all__",
      };
    });
  }, [
    useRowBackedTargets,
    targetCoordRows,
    mergedTargets,
    villages,
    targetDefaultCount,
    defaultTargetType,
  ]);
  const showTargetFinalList = targetMode === "coords" || targetCoordRows.length > 0;
  const attackerAssignmentOptions = useMemo(() => {
    const names = Array.from(
      new Set(
        attackerRows
          .map((row) => row.playerName.trim())
          .filter((name) => name && name !== "Unbekannt")
      )
    ).sort((a, b) => a.localeCompare(b, "de"));
    return names;
  }, [attackerRows]);
  const timeTypeLabelMap: Record<TimeTypeFilter, string> = {
    all: "Alle",
    attack: "Angriff",
    fake: "Fake",
    ag: "AG",
    wallbreaker: "Wallbrecher",
  };
  const canResetAttackerFlow = showAttackerFinalList;
  const canResetTargetFlow = showTargetFinalList;

  const parsedWindows = useMemo(
    () =>
      arrivalWindows.map((window, index) => ({
        ...window,
        index,
        startDate: parseDateTime(window.start, tzMode),
        endDate: parseDateTime(window.end, tzMode),
      })),
    [arrivalWindows, tzMode]
  );

  const validWindows = useMemo(
    () =>
      parsedWindows.filter(
        (window) => window.startDate && window.endDate && window.endDate >= window.startDate
      ),
    [parsedWindows]
  );

  useEffect(() => {
    if (!generatedPlans) return;
    setGeneratedPlans(null);
    setPlanMetrics(null);
    setPlanTimingHint(null);
    setPlanTimingDetails([]);
  }, [
    attackerMode,
    targetMode,
    attackerPlayers,
    targetPlayers,
    attackerTribeInput,
    targetTribeInput,
    attackerExcludedPlayers,
    targetExcludedPlayers,
    attackerExcludedCoords,
    targetExcludedCoords,
    attackerTribeSelectedPlayers,
    targetTribeSelectedPlayers,
    attackerCoordRows,
    targetCoordRows,
    attackUnitCount,
    attackCommandType,
    targetDefaultCount,
    targetDefaultAllowAttack,
    targetDefaultAllowFake,
    targetDefaultAllowAg,
    targetDefaultAllowWallbreaker,
    targetDefaultAssignedAttacker,
    timeInputDate,
    timeInputFrom,
    timeInputTo,
    timeInputPlayer,
    timeInputType,
    sendTimeEntries,
    arrivalTimeEntries,
    arrivalWindows,
    maxPerAttacker,
    maxPerTarget,
    tzMode,
    selectedSlowUnit,
    unitInfoIncludesSpeed,
  ]);

  const windowErrors = useMemo(() => {
    const errors: string[] = [];
    for (const window of parsedWindows) {
      if (!window.startDate || !window.endDate) {
        errors.push(`Zeitfenster ${window.index + 1} ist unvollständig.`);
        continue;
      }
      if (window.endDate < window.startDate) {
        errors.push(`Zeitfenster ${window.index + 1} endet vor dem Start.`);
      }
    }
    return errors;
  }, [parsedWindows]);

  const hasAttackerSpeed = useMemo(
    () =>
      mergedAttackers.some((attacker) => {
        const row = attackerCoordSettings.get(attacker.coord);
        const unit = row?.unit || selectedSlowUnit;
        if (!unit) return false;
        const { seconds } = secondsPerField(unitSpeeds, [unit], effectiveConfig);
        return Boolean(seconds);
      }),
    [mergedAttackers, attackerCoordSettings, selectedSlowUnit, unitSpeeds, effectiveConfig]
  );

  const baseErrors = useMemo(() => {
    const errors: string[] = [];
    if (!plannerPlayerText) errors.push("player.txt fehlt.");
    if (!plannerVillageText) errors.push("village.txt fehlt.");
    if (!plannerAllyText) errors.push("ally.txt fehlt.");
    if (!plannerConfigText) errors.push("config.txt fehlt.");
    if (!plannerUnitInfoText) errors.push("unit_info.txt fehlt.");
    if (attackerMode === "coords" && mergedAttackers.length === 0) errors.push("Keine Angreifer-Dörfer.");
    if (attackerMode === "players" && filteredAttackerPlayers.length === 0) {
      errors.push("Keine Angreifer-Spieler ausgewählt.");
    }
    if (attackerMode === "tribe" && (!attackerTribe || filteredAttackerPlayers.length === 0)) {
      errors.push("Kein gültiger Angreifer-Stamm ausgewählt.");
    }
    if (targetMode === "coords" && mergedTargets.length === 0) errors.push("Keine Ziele.");
    if (targetMode === "players" && filteredTargetPlayers.length === 0) {
      errors.push("Keine Ziel-Spieler ausgewählt.");
    }
    if (targetMode === "tribe" && (!targetTribe || filteredTargetPlayers.length === 0)) {
      errors.push("Kein gültiger Ziel-Stamm ausgewählt.");
    }
    if (!hasAttackerSpeed) errors.push("Keine gültige Einheitengeschwindigkeit gefunden.");
    return errors;
  }, [
    plannerPlayerText,
    plannerVillageText,
    plannerAllyText,
    plannerConfigText,
    plannerUnitInfoText,
    mergedAttackers.length,
    mergedTargets.length,
    attackerMode,
    targetMode,
    filteredAttackerPlayers.length,
    filteredTargetPlayers.length,
    attackerTribe,
    targetTribe,
    hasAttackerSpeed,
  ]);

  const filteredRows = useMemo(() => {
    if (!generatedPlans) return [];
    const allRows = generatedPlans.flatMap((plan) => plan.rows);
    if (!filter.trim()) return allRows;
    const needle = filter.trim().toLowerCase();
    return allRows.filter((row) => {
      const fields = [
        row.attacker?.playerName,
        row.attacker?.villageName,
        row.attackerCoord,
        row.target?.playerName,
        row.target?.villageName,
        row.targetCoord,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return fields.includes(needle);
    });
  }, [generatedPlans, filter]);

  const sortedRows = useMemo(() => {
    const copy = [...filteredRows];
    copy.sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      switch (sortKey) {
        case "distance":
          return (a.distance - b.distance) * dir;
        case "travel":
          return (a.travelSeconds - b.travelSeconds) * dir;
        case "sendFrom":
          return (a.sendFrom.getTime() - b.sendFrom.getTime()) * dir;
        case "attackerPlayer":
          return compareString(a.attacker?.playerName, b.attacker?.playerName) * dir;
        case "attackerVillage":
          return compareString(a.attacker?.villageName, b.attacker?.villageName) * dir;
        case "attackerCoord":
          return compareString(a.attackerCoord, b.attackerCoord) * dir;
        case "targetPlayer":
          return compareString(a.target?.playerName, b.target?.playerName) * dir;
        case "targetVillage":
          return compareString(a.target?.villageName, b.target?.villageName) * dir;
        case "targetCoord":
          return compareString(a.targetCoord, b.targetCoord) * dir;
        default:
          return 0;
      }
    });
    return copy;
  }, [filteredRows, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  // Keep legacy plan-export helpers and diagnostics "used" while Zeiten UI is simplified.
  void setTzMode;
  void setFilter;
  void secondsField;
  void slowestUnit;
  void attackerErrors;
  void targetErrors;
  void windowErrors;
  void validWindows;
  void baseErrors;
  void sortedRows;
  void handleSort;
  void filterRows;
  void sortRows;
  void groupByPlayer;
  void parseTimeMinutes;
  void overlapsTimeOfDay;
  void limitArrivalSpread;
  void applyLimits;
  void downloadBbCode;
  void downloadDiscord;
  void renderAttackLink;

  function parseDateTimeRange(date: string, from: string, to: string) {
    if (!date || !from || !to) return null;
    const start = new Date(`${date}T${from}`);
    const end = new Date(`${date}T${to}`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
    if (end < start) return null;
    return { start, end };
  }

  function buildAttackSlots() {
    const slots: AttackSlot[] = [];
    for (const row of attackerCoordRows) {
      const village = villages.get(row.coord);
      const playerName = village?.playerName ?? "Unbekannt";
      const villageName = village?.villageName ?? row.coord;
      const unit = row.commandType === "ag" ? AG_UNIT : row.unit;
      const { seconds } = secondsPerField(unitSpeeds, unit ? [unit] : [], effectiveConfig);
      if (!seconds) continue;
      const travelSecondsByTarget = new Map<string, number>();
      for (const target of targetCoordRows) {
        const distance = Math.hypot(row.x - target.x, row.y - target.y);
        travelSecondsByTarget.set(target.coord, distance * seconds);
      }
      const amount = Math.max(1, row.count);
      for (let i = 0; i < amount; i += 1) {
        slots.push({
          slotId: `${row.id}-${row.commandType}-${row.unit}-${i + 1}`,
          sourceRowId: row.id,
          attackerCoord: row.coord,
          attackerPlayer: playerName,
          attackerVillage: villageName,
          attackerX: row.x,
          attackerY: row.y,
          type: row.commandType,
          unit,
          travelSecondsByTarget,
        });
      }
    }
    return slots;
  }

  function buildDefenseDemands() {
    const demands: DefenseDemand[] = [];
    for (const row of targetCoordRows) {
      const village = villages.get(row.coord);
      const playerName = village?.playerName ?? "Unbekannt";
      const villageName = village?.villageName ?? row.coord;
      const acceptedTypes = new Set<AttackCommandType>([row.targetType]);
      const allowedAttackerPlayers =
        row.assignedAttacker === "__all__" ? null : new Set<string>([row.assignedAttacker]);
      const amount = Math.max(1, row.count);
      for (let i = 0; i < amount; i += 1) {
        demands.push({
          demandId: `${row.id}-${row.targetType}-${row.assignedAttacker}-${i + 1}`,
          sourceRowId: row.id,
          targetCoord: row.coord,
          targetPlayer: playerName,
          targetVillage: villageName,
          targetX: row.x,
          targetY: row.y,
          acceptedTypes,
          allowedAttackerPlayers,
        });
      }
    }
    return demands;
  }

  function resolvePairTiming(
    slot: AttackSlot,
    travelSeconds: number,
    sendWindows: Array<{ start: Date; end: Date; player: string; type: TimeTypeFilter }>,
    arrivalWindowsResolved: Array<{ start: Date; end: Date; player: string; type: TimeTypeFilter }>
  ) {
    const TIME_TOLERANCE_MS = 1000;
    const sendApplicable = sendWindows.filter(
      (window) =>
        (window.player === "__all__" || window.player === slot.attackerPlayer) &&
        (window.type === "all" || window.type === slot.type)
    );
    const arrivalApplicable = arrivalWindowsResolved.filter(
      (window) =>
        (window.player === "__all__" || window.player === slot.attackerPlayer) &&
        (window.type === "all" || window.type === slot.type)
    );
    const useSend = sendWindows.length > 0;
    const useArrival = arrivalWindowsResolved.length > 0;
    if (useSend && sendApplicable.length === 0) return null;
    if (useArrival && arrivalApplicable.length === 0) return null;
    const now = new Date();

    if (useArrival) {
      let best: { sendAt: Date; arrivalAt: Date } | null = null;
      for (const arrival of arrivalApplicable) {
        const sendStart = new Date(arrival.start.getTime() - travelSeconds * 1000);
        const sendEnd = new Date(arrival.end.getTime() - travelSeconds * 1000);
        if (sendEnd < sendStart) continue;

        if (!useSend) {
          const sendAt = sendStart < now ? now : sendStart;
          if (sendAt > sendEnd) continue;
          const arrivalAtRaw = new Date(sendAt.getTime() + travelSeconds * 1000);
          if (
            arrivalAtRaw.getTime() < arrival.start.getTime() - TIME_TOLERANCE_MS ||
            arrivalAtRaw.getTime() > arrival.end.getTime() + TIME_TOLERANCE_MS
          ) {
            continue;
          }
          const isExactArrival = arrival.start.getTime() === arrival.end.getTime();
          const arrivalAt = isExactArrival ? new Date(arrival.start.getTime()) : arrivalAtRaw;
          const adjustedSendAt = isExactArrival
            ? new Date(arrivalAt.getTime() - travelSeconds * 1000)
            : sendAt;
          if (adjustedSendAt < now) continue;
          if (!best || adjustedSendAt < best.sendAt) {
            best = { sendAt: adjustedSendAt, arrivalAt };
          }
          continue;
        }

        for (const send of sendApplicable) {
          const overlapStart = new Date(Math.max(sendStart.getTime(), send.start.getTime()));
          const overlapEnd = new Date(Math.min(sendEnd.getTime(), send.end.getTime()));
          if (overlapEnd < overlapStart) continue;
          const sendAt = overlapStart < now ? now : overlapStart;
          if (sendAt > overlapEnd) continue;
          const arrivalAtRaw = new Date(sendAt.getTime() + travelSeconds * 1000);
          if (
            arrivalAtRaw.getTime() < arrival.start.getTime() - TIME_TOLERANCE_MS ||
            arrivalAtRaw.getTime() > arrival.end.getTime() + TIME_TOLERANCE_MS
          ) {
            continue;
          }
          const isExactArrival = arrival.start.getTime() === arrival.end.getTime();
          const arrivalAt = isExactArrival ? new Date(arrival.start.getTime()) : arrivalAtRaw;
          const adjustedSendAt = isExactArrival
            ? new Date(arrivalAt.getTime() - travelSeconds * 1000)
            : sendAt;
          if (
            adjustedSendAt.getTime() < send.start.getTime() - TIME_TOLERANCE_MS ||
            adjustedSendAt.getTime() > send.end.getTime() + TIME_TOLERANCE_MS
          ) {
            continue;
          }
          if (!best || adjustedSendAt < best.sendAt) best = { sendAt: adjustedSendAt, arrivalAt };
        }
      }
      return best;
    }

    if (useSend) {
      let best: { sendAt: Date; arrivalAt: Date } | null = null;
      for (const send of sendApplicable) {
        const sendAt = send.start < now ? now : send.start;
        if (sendAt > send.end) continue;
        const arrivalAt = new Date(sendAt.getTime() + travelSeconds * 1000);
        if (!best || sendAt < best.sendAt) best = { sendAt, arrivalAt };
      }
      return best;
    }

    const sendAt = now;
    const arrivalAt = new Date(sendAt.getTime() + travelSeconds * 1000);
    return { sendAt, arrivalAt };
  }

  function handleGeneratePlan() {
    const slots = buildAttackSlots();
    const demands = buildDefenseDemands();
    if (slots.length === 0 || demands.length === 0) {
      setGeneratedPlans([]);
      setPlanTimingHint(null);
      setPlanTimingDetails([]);
      setPlanMetrics({
        demandTotal: demands.length,
        demandFulfilled: 0,
        demandOpen: demands.length,
        slotsTotal: slots.length,
        slotsUsed: 0,
        slotsUnused: slots.length,
        unmetTypeMismatch: 0,
        unmetAttackerMismatch: 0,
        unmetTimeMismatch: 0,
        unmetNoSlots: 0,
      });
      return;
    }

    const sendWindows = sendTimeEntries
      .map((entry) => {
        const range = parseDateTimeRange(entry.date, entry.from, entry.to);
        if (!range) return null;
        return {
          ...range,
          player: entry.player,
          type: entry.type,
        };
      })
      .filter(
        (
          value
        ): value is { start: Date; end: Date; player: string; type: TimeTypeFilter } =>
          Boolean(value)
      );
    const arrivalWindowsResolved = arrivalTimeEntries
      .map((entry) => {
        const range = parseDateTimeRange(entry.date, entry.from, entry.to);
        if (!range) return null;
        return {
          ...range,
          player: entry.player,
          type: entry.type,
        };
      })
      .filter(
        (
          value
        ): value is { start: Date; end: Date; player: string; type: TimeTypeFilter } =>
          Boolean(value)
      );

    // Migration fallback for older persisted data that only had ds_arrival_windows.
    if (arrivalWindowsResolved.length === 0 && parsedWindows.length > 0) {
      for (const window of parsedWindows) {
        if (!window.startDate || !window.endDate) continue;
        if (window.endDate < window.startDate) continue;
        arrivalWindowsResolved.push({
          start: window.startDate,
          end: window.endDate,
          player: "__all__",
          type: "all",
        });
      }
    }

    const usedSlots = new Set<string>();
    const filledDemands = new Set<string>();
    const usedPerAttacker = new Map<string, number>();
    const usedPerTarget = new Map<string, number>();
    const maxAttacker = maxPerAttacker > 0 ? maxPerAttacker : Number.POSITIVE_INFINITY;
    const maxTarget = maxPerTarget > 0 ? maxPerTarget : Number.POSITIVE_INFINITY;

    const candidates: Array<{
      slot: AttackSlot;
      demand: DefenseDemand;
      sendAt: Date;
      arrivalAt: Date;
      travelSeconds: number;
      distance: number;
    }> = [];

    for (const slot of slots) {
      for (const demand of demands) {
        if (!demand.acceptedTypes.has(slot.type)) continue;
        if (demand.allowedAttackerPlayers && !demand.allowedAttackerPlayers.has(slot.attackerPlayer)) continue;
        const travelSeconds = slot.travelSecondsByTarget.get(demand.targetCoord);
        if (travelSeconds === undefined) continue;
        const timing = resolvePairTiming(slot, travelSeconds, sendWindows, arrivalWindowsResolved);
        if (!timing) continue;
        const distance = Math.hypot(slot.attackerX - demand.targetX, slot.attackerY - demand.targetY);
        candidates.push({
          slot,
          demand,
          sendAt: timing.sendAt,
          arrivalAt: timing.arrivalAt,
          travelSeconds,
          distance,
        });
      }
    }

    candidates.sort((left, right) => {
      const sendDiff = left.sendAt.getTime() - right.sendAt.getTime();
      if (sendDiff !== 0) return sendDiff;
      const travelDiff = left.travelSeconds - right.travelSeconds;
      if (travelDiff !== 0) return travelDiff;
      const distanceDiff = left.distance - right.distance;
      if (distanceDiff !== 0) return distanceDiff;
      const attackerDiff = left.slot.attackerPlayer.localeCompare(right.slot.attackerPlayer, "de");
      if (attackerDiff !== 0) return attackerDiff;
      const targetDiff = left.demand.targetPlayer.localeCompare(right.demand.targetPlayer, "de");
      if (targetDiff !== 0) return targetDiff;
      const slotDiff = left.slot.slotId.localeCompare(right.slot.slotId, "de");
      if (slotDiff !== 0) return slotDiff;
      return left.demand.demandId.localeCompare(right.demand.demandId, "de");
    });

    const assignedRows: AttackRow[] = [];
    for (const candidate of candidates) {
      if (usedSlots.has(candidate.slot.slotId)) continue;
      if (filledDemands.has(candidate.demand.demandId)) continue;

      const attUsed = usedPerAttacker.get(candidate.slot.attackerCoord) ?? 0;
      if (attUsed >= maxAttacker) continue;
      const tgtUsed = usedPerTarget.get(candidate.demand.targetCoord) ?? 0;
      if (tgtUsed >= maxTarget) continue;

      usedSlots.add(candidate.slot.slotId);
      filledDemands.add(candidate.demand.demandId);
      usedPerAttacker.set(candidate.slot.attackerCoord, attUsed + 1);
      usedPerTarget.set(candidate.demand.targetCoord, tgtUsed + 1);

      assignedRows.push({
        attacker: villages.get(candidate.slot.attackerCoord) ?? null,
        target: villages.get(candidate.demand.targetCoord) ?? null,
        attackerCoord: candidate.slot.attackerCoord,
        targetCoord: candidate.demand.targetCoord,
        commandType: candidate.slot.type,
        unit: candidate.slot.unit,
        distance: candidate.distance,
        travelSeconds: candidate.travelSeconds,
        sendFrom: candidate.sendAt,
        sendTo: candidate.sendAt,
        arrivalFrom: candidate.arrivalAt,
        arrivalTo: candidate.arrivalAt,
      });
    }

    let unmetTypeMismatch = 0;
    let unmetAttackerMismatch = 0;
    let unmetTimeMismatch = 0;
    let unmetNoSlots = 0;
    const timeMismatchDemands: DefenseDemand[] = [];
    const remainingDemands = demands.filter((demand) => !filledDemands.has(demand.demandId));
    const remainingSlots = slots.filter((slot) => !usedSlots.has(slot.slotId));
    for (const demand of remainingDemands) {
      const typed = remainingSlots.filter((slot) => demand.acceptedTypes.has(slot.type));
      if (typed.length === 0) {
        unmetTypeMismatch += 1;
        continue;
      }
      const playerMatched = typed.filter(
        (slot) => !demand.allowedAttackerPlayers || demand.allowedAttackerPlayers.has(slot.attackerPlayer)
      );
      if (playerMatched.length === 0) {
        unmetAttackerMismatch += 1;
        continue;
      }
      const timed = playerMatched.filter((slot) => {
        const travelSeconds = slot.travelSecondsByTarget.get(demand.targetCoord);
        if (travelSeconds === undefined) return false;
        return Boolean(resolvePairTiming(slot, travelSeconds, sendWindows, arrivalWindowsResolved));
      });
      if (timed.length === 0) {
        unmetTimeMismatch += 1;
        timeMismatchDemands.push(demand);
        continue;
      }
      unmetNoSlots += 1;
    }

    setPlanMetrics({
      demandTotal: demands.length,
      demandFulfilled: filledDemands.size,
      demandOpen: demands.length - filledDemands.size,
      slotsTotal: slots.length,
      slotsUsed: usedSlots.size,
      slotsUnused: slots.length - usedSlots.size,
      unmetTypeMismatch,
      unmetAttackerMismatch,
      unmetTimeMismatch,
      unmetNoSlots,
    });

    setPlanTimingHint(null);
    setPlanTimingDetails([]);
    if (unmetTimeMismatch > 0) {
      const now = new Date();
      const hasSendFilter = sendWindows.length > 0;
      const allSendWindowsInPast =
        hasSendFilter && sendWindows.every((window) => window.end.getTime() < now.getTime());
      const hasArrivalFilter = arrivalWindowsResolved.length > 0;
      const requestedArrivalMs = hasArrivalFilter
        ? Math.min(...arrivalWindowsResolved.map((window) => window.start.getTime()))
        : null;
      const hasExactArrivalTarget =
        hasArrivalFilter &&
        arrivalWindowsResolved.some(
          (window) => window.start.getTime() === window.end.getTime()
        );
      let hasArrivalFilterMatch = false;
      let hasSendFilterMatch = !hasSendFilter;

      let earliestTiming: { arrival: Date; unit: string } | null = null;
      const timingByAttacker = new Map<string, { player: string; village: string; arrival: Date; unit: string }>();
      for (const slot of remainingSlots) {
        for (const demand of timeMismatchDemands) {
          if (!demand.acceptedTypes.has(slot.type)) continue;
          if (demand.allowedAttackerPlayers && !demand.allowedAttackerPlayers.has(slot.attackerPlayer)) {
            continue;
          }
          const travelSeconds = slot.travelSecondsByTarget.get(demand.targetCoord);
          if (travelSeconds === undefined) continue;
          const sendApplicableForHint = sendWindows.filter(
            (window) =>
              (window.player === "__all__" || window.player === slot.attackerPlayer) &&
              (window.type === "all" || window.type === slot.type)
          );
          const arrivalApplicableForHint = arrivalWindowsResolved.filter(
            (window) =>
              (window.player === "__all__" || window.player === slot.attackerPlayer) &&
              (window.type === "all" || window.type === slot.type)
          );
          if (arrivalApplicableForHint.length > 0) hasArrivalFilterMatch = true;
          if (sendApplicableForHint.length > 0) hasSendFilterMatch = true;

          if (hasArrivalFilter && arrivalApplicableForHint.length === 0) continue;
          if (hasSendFilter) {
            for (const send of sendApplicableForHint) {
              const sendAt = new Date(Math.max(now.getTime(), send.start.getTime()));
              if (sendAt.getTime() > send.end.getTime()) continue;
              const arrival = new Date(sendAt.getTime() + travelSeconds * 1000);
              if (!earliestTiming || arrival.getTime() < earliestTiming.arrival.getTime()) {
                earliestTiming = { arrival, unit: slot.unit };
              }
              const prev = timingByAttacker.get(slot.attackerCoord);
              if (!prev || arrival.getTime() < prev.arrival.getTime()) {
                timingByAttacker.set(slot.attackerCoord, {
                  player: slot.attackerPlayer,
                  village: slot.attackerVillage,
                  arrival,
                  unit: slot.unit,
                });
              }
            }
            continue;
          }
          const arrival = new Date(now.getTime() + travelSeconds * 1000);
          if (!earliestTiming || arrival.getTime() < earliestTiming.arrival.getTime()) {
            earliestTiming = { arrival, unit: slot.unit };
          }
          const prev = timingByAttacker.get(slot.attackerCoord);
          if (!prev || arrival.getTime() < prev.arrival.getTime()) {
            timingByAttacker.set(slot.attackerCoord, {
              player: slot.attackerPlayer,
              village: slot.attackerVillage,
              arrival,
              unit: slot.unit,
            });
          }
        }
      }

      const detailLines = Array.from(timingByAttacker.entries())
        .sort((a, b) => a[1].arrival.getTime() - b[1].arrival.getTime())
        .map(([coord, info]) => {
          const unitLabel = getUnitLabelDe(info.unit);
          return `${info.player} - ${info.village} (${coord}): früheste Ankunft ${formatDate(info.arrival, tzMode)} (${unitLabel})`;
        });
      if (detailLines.length > 0) setPlanTimingDetails(detailLines);

      if (hasArrivalFilter && !hasArrivalFilterMatch) {
        setPlanTimingHint(
          "Kein passendes Ankunfts-Zeitfenster für die aktuellen Angreifer gefunden. Bitte Zeitfenster-Typ/Spieler prüfen (für AG: Typ AG oder Alle und Spieler Alle)."
        );
      } else if (hasSendFilter && !hasSendFilterMatch) {
        setPlanTimingHint(
          "Kein passendes Abschick-Zeitfenster für die aktuellen Angreifer gefunden. Bitte Zeitfenster-Typ/Spieler prüfen."
        );
      } else if (earliestTiming) {
        const unitLabel = getUnitLabelDe(earliestTiming.unit);
        if (hasArrivalFilter && !hasSendFilter) {
          const timingReason = hasExactArrivalTarget
            ? "Die gewünschte exakte Ankunftszeit ist mit den aktuellen Laufzeiten nicht mehr erreichbar."
            : "Das gewünschte Ankunftsfenster ist mit den aktuellen Laufzeiten nicht mehr erreichbar.";
          const requestedText =
            requestedArrivalMs != null
              ? ` Gewünschter Einschlag: ${formatDate(new Date(requestedArrivalMs), tzMode)}.`
              : "";
          setPlanTimingHint(
            `${timingReason}${requestedText} Offene Zeitziele: ${unmetTimeMismatch}. Empfehlung: Ankunftszeit auf ${formatDate(earliestTiming.arrival, tzMode)} oder später setzen (langsamste Einheit: ${unitLabel}).`
          );
        } else if (hasArrivalFilter && hasSendFilter) {
          const requestedText =
            requestedArrivalMs != null
              ? ` Gewünschte Ankunft: ${formatDate(new Date(requestedArrivalMs), tzMode)}.`
              : "";
          setPlanTimingHint(
            `Die Kombination aus Abschick- und Ankunftsfenster ist für ${unmetTimeMismatch} offene Ziele nicht erreichbar.${requestedText} Empfehlung: Entweder Abschickfenster erweitern oder Ankunft auf ${formatDate(earliestTiming.arrival, tzMode)} oder später setzen.`
          );
        } else {
          const prefix = allSendWindowsInPast
            ? "Gewähltes Abschickfenster ist bereits vorbei."
            : "Zeitfenster blockiert aktuell alle passenden Angriffe.";
          setPlanTimingHint(
            `${prefix} Empfehlung: Abschickzeitfenster nach hinten verschieben oder Ankunft auf mindestens ${formatDate(earliestTiming.arrival, tzMode)} planen.`
          );
        }
      }
    }

    setGeneratedPlans([
      {
        id: "main",
        label: "Plan",
        rows: assignedRows,
      },
    ]);
  }


  async function handleFileUpload(
    file: File | null,
    setter: (value: string) => void
  ) {
    if (!file) return;
    const text = await file.text();
    setter(text);
  }

  async function handleWorldLoad() {
    if (!worldCode.trim()) {
      setWorldLoadState("error");
      setWorldLoadMessage("Bitte Weltkürzel eingeben (z. B. de68).");
      return;
    }
    const base = worldBaseUrl.trim()
      ? sanitizeBase(worldBaseUrl.trim())
      : `https://${worldCode.trim()}.die-staemme.de`;
    setWorldLoadState("loading");
    setWorldLoadMessage("Lade Weltdaten ...");
    try {
      const [configRes, unitRes, playersRes, villagesRes] = await Promise.all([
        fetchTextViaProxy(`${base}/interface.php?func=get_config`),
        fetchTextViaProxy(`${base}/interface.php?func=get_unit_info`),
        fetchGzipViaProxy(`${base}/map/player.txt.gz`),
        fetchGzipViaProxy(`${base}/map/village.txt.gz`),
      ]);
      const alliesRes = await fetchGzipViaProxy(`${base}/map/ally.txt.gz`);
      setConfigText(configRes);
      setUnitInfoText(unitRes);
      setPlayerText(playersRes);
      setVillageText(villagesRes);
      setAllyText(alliesRes);
      setWorldLoadState("success");
      setWorldLoadMessage(`Weltdaten geladen von ${base}`);
      setWorldAutoLoaded(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unbekannter Fehler";
      setWorldLoadState("error");
      setWorldLoadMessage(message);
    }
  }

  async function handleDbWorldLoad() {
    if (!activeDbWorld.trim()) {
      setDbWorldLoadState("error");
      setDbWorldLoadMessage("Bitte Weltkürzel auswählen.");
      return;
    }
    await handleDbWorldLoadFor(activeDbWorld);
  }

  async function handleDbWorldLoadFor(world: string) {
    const base = dbWorldBaseInput.trim()
      ? sanitizeBase(dbWorldBaseInput.trim())
      : `https://${world.trim()}.die-staemme.de`;
    setDbWorldBaseInput(base);
    setDbWorldLoadState("loading");
    setDbWorldLoadMessage("Lade Weltdaten ...");
    try {
      const [configRes, unitRes, playersRes, villagesRes] = await Promise.all([
        fetchTextViaProxy(`${base}/interface.php?func=get_config`),
        fetchTextViaProxy(`${base}/interface.php?func=get_unit_info`),
        fetchGzipViaProxy(`${base}/map/player.txt.gz`),
        fetchGzipViaProxy(`${base}/map/village.txt.gz`),
      ]);
      const alliesRes = await fetchGzipViaProxy(`${base}/map/ally.txt.gz`);
      setDbConfigText(configRes);
      setDbUnitInfoText(unitRes);
      setDbPlayerText(playersRes);
      setDbVillageText(villagesRes);
      setDbAllyText(alliesRes);
      setDbWorldLoadState("success");
      setDbWorldLoadMessage(`Weltdaten geladen von ${base}`);
      const stamp = new Date().toISOString();
      setDbWorldLastLoaded(stamp);
      await saveWorldDataToBackend(world, {
        config: configRes,
        unit_info: unitRes,
        players: playersRes,
        villages: villagesRes,
        allies: alliesRes,
      });
      await saveDbWorldMeta(world, base, stamp);
      return playersRes;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unbekannter Fehler";
      setDbWorldLoadState("error");
      setDbWorldLoadMessage(message);
      return null;
    }
  }

  function hashString(value: string) {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  function normalizeSignatureValue(value: unknown) {
    if (value === null || value === undefined) return "";
    if (typeof value === "number") return String(value);
    if (typeof value === "string") return value.trim().replace(/\s+/g, " ");
    return String(value);
  }

  function normalizeBuildingKey(rawKey: string) {
    const normalized = String(rawKey ?? "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
    const map: Record<string, string> = {
      main: "main",
      barracks: "barracks",
      stable: "stable",
      garage: "garage",
      church: "church",
      church_f: "church_f",
      smith: "smith",
      place: "place",
      market: "market",
      wood: "wood",
      stone: "stone",
      iron: "iron",
      farm: "farm",
      storage: "storage",
      hide: "hide",
      wall: "wall",
      snob: "snob",
      watchtower: "watchtower",
      "hauptgebäude": "main",
      kaserne: "barracks",
      stall: "stable",
      werkstatt: "garage",
      kirche: "church",
      "erste kirche": "church_f",
      schmiede: "smith",
      versammlungsplatz: "place",
      marktplatz: "market",
      holzfaellerlager: "wood",
      "holzfällerlager": "wood",
      holzfaeller: "wood",
      "holzfäller": "wood",
      lehmgrube: "stone",
      eisenmine: "iron",
      bauernhof: "farm",
      speicher: "storage",
      versteck: "hide",
      akademie: "snob",
      wachturm: "watchtower",
    };
    return map[normalized] ?? normalized.replace(/\s+/g, "_");
  }

  function normalizeBuildingsRecord(
    raw: Record<string, unknown> | undefined | null
  ): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [key, value] of Object.entries(raw ?? {})) {
      const normalizedKey = normalizeBuildingKey(key);
      if (!normalizedKey) continue;
      const parsed = Number(value ?? 0);
      if (!Number.isFinite(parsed)) continue;
      result[normalizedKey] = Math.max(result[normalizedKey] ?? 0, parsed);
    }
    return result;
  }

  function normalizeReportDetailsForStorage(details: ReturnType<typeof extractReportDetails>) {
    const normalizedBuildings = normalizeBuildingsRecord(
      details?.buildings as Record<string, unknown> | undefined
    );
    return {
      ...details,
      buildings: normalizedBuildings,
    };
  }

  function serializeNumericRecord(record: Record<string, unknown> | undefined | null) {
    if (!record) return "";
    const entries = Object.entries(record)
      .map(([key, val]) => [key, Number(val) || 0] as const)
      .sort(([a], [b]) => a.localeCompare(b));
    return entries.map(([key, val]) => `${key}:${val}`).join("|");
  }

  function buildReportSignature(details: ReturnType<typeof extractReportDetails>) {
    if (!details || (!details.attacker && !details.defender && !details.subject)) return "";
    const parts = [
      normalizeSignatureValue(details.subject),
      normalizeSignatureValue(details.battleTime),
      normalizeSignatureValue(details.attacker),
      normalizeSignatureValue(details.defender),
      normalizeSignatureValue(details.origin),
      normalizeSignatureValue(details.target),
      normalizeSignatureValue(details.luck),
      normalizeSignatureValue(details.moral),
      normalizeSignatureValue(details.loyalty),
      normalizeSignatureValue(details.buildingDamage),
      serializeNumericRecord(details.attackerUnits as unknown as Record<string, unknown>),
      serializeNumericRecord(details.attackerLosses as unknown as Record<string, unknown>),
      serializeNumericRecord(details.defenderUnits as unknown as Record<string, unknown>),
      serializeNumericRecord(details.defenderLosses as unknown as Record<string, unknown>),
      serializeNumericRecord(details.buildings as unknown as Record<string, unknown>),
    ];
    return hashString(parts.join("||"));
  }

  function parseBattleTime(value?: string) {
    if (!value) return 0;
    const match = value.match(/(\d{2})\.(\d{2})\.(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
    if (!match) return 0;
    const [, dd, mm, yy, hh, min, ss] = match;
    const year = Number(yy) + 2000;
    const month = Number(mm) - 1;
    const day = Number(dd);
    const hour = Number(hh);
    const minute = Number(min);
    const second = Number(ss);
    const date = new Date(year, month, day, hour, minute, second);
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
  }

  async function loadDbWorldMeta(world: string) {
    try {
      const response = await fetch(`${DB_API}/api/worlds/${encodeURIComponent(world)}`);
      if (!response.ok) return;
      const payload = await response.json();
      const meta = payload?.world;
      if (meta?.baseUrl) setDbWorldBaseInput(meta.baseUrl);
      if (meta?.lastLoaded) setDbWorldLastLoaded(meta.lastLoaded);
      if (meta?.playerId) setDbSelectedPlayerId(meta.playerId);
      if (meta?.playerName) setDbSelectedPlayerName(meta.playerName);
      if (meta?.playerName) {
        setDbWorldMeta((prev) => ({
          ...prev,
          [world]: { playerName: meta.playerName },
        }));
      }
    } catch {
      // Ignore.
    }
  }

  async function saveDbWorldMeta(
    world: string,
    baseUrl?: string,
    lastLoaded?: string,
    playerId?: string,
    playerName?: string
  ) {
    try {
      await fetch(`${DB_API}/api/worlds/${encodeURIComponent(world)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl, lastLoaded, playerId, playerName }),
      });
    } catch {
      // Ignore.
    }
  }

  function findDbPlayerByName(name: string) {
    const needle = name.trim().toLowerCase();
    if (!needle) return null;
    for (const player of dbPlayers.values()) {
      if (player.playerName.trim().toLowerCase() === needle) return player;
    }
    return null;
  }

  function findPlayerInText(text: string, name: string) {
    const needle = name.trim().toLowerCase();
    if (!needle) return null;
    const map = parsePlayers(text);
    for (const player of map.values()) {
      if (player.playerName.trim().toLowerCase() === needle) return player;
    }
    return null;
  }

  async function loadWorldDataFromBackend(world: string) {
    try {
      const response = await fetch(`${DB_API}/api/worlds/${encodeURIComponent(world)}/data`);
      if (!response.ok) throw new Error("world data load failed");
      const payload = await response.json();
      const data = payload?.data ?? {};
      setDbPlayerText(typeof data.players === "string" ? data.players : "");
      setDbVillageText(typeof data.villages === "string" ? data.villages : "");
      setDbAllyText(typeof data.allies === "string" ? data.allies : "");
      setDbConfigText(typeof data.config === "string" ? data.config : "");
      setDbUnitInfoText(typeof data.unit_info === "string" ? data.unit_info : "");
    } catch {
      setDbPlayerText("");
      setDbVillageText("");
      setDbAllyText("");
      setDbConfigText("");
      setDbUnitInfoText("");
    }
  }

  async function saveWorldDataToBackend(world: string, data: Record<string, string>) {
    try {
      await fetch(`${DB_API}/api/worlds/${encodeURIComponent(world)}/data`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data }),
      });
    } catch {
      // Ignore.
    }
  }

  async function loadInsertsFromBackend(world: string) {
    insertsHydratingRef.current = true;
    try {
      const response = await fetch(`${DB_API}/api/worlds/${encodeURIComponent(world)}/inserts`);
      if (!response.ok) throw new Error("inserts load failed");
      const payload = await response.json();
      const data = payload?.data ?? {};
      setInsertSosText(typeof data.sos === "string" ? data.sos : "");
      setInsertForwardedText(typeof data.forwarded === "string" ? data.forwarded : "");
      setInsertUnitsText(typeof data.units === "string" ? data.units : "");
      setInsertBuildingsText(typeof data.buildings === "string" ? data.buildings : "");
      setInsertOutgoingText(typeof data.outgoing_attacks === "string" ? data.outgoing_attacks : "");
      try {
        const incomingRaw =
          typeof data.incoming_attacks === "string" ? data.incoming_attacks : "[]";
        const parsedIncoming = JSON.parse(incomingRaw);
        if (Array.isArray(parsedIncoming)) {
          setDbIncomingAttacks(
            parsedIncoming
              .filter((item) => item && typeof item === "object")
              .map((item) => ({
                id: String(item.id ?? ""),
                unitLabel: String(item.unitLabel ?? "Unbekannt"),
                attackerPlayer: String(item.attackerPlayer ?? "Unbekannt"),
                originName: String(item.originName ?? "Herkunft"),
                originCoord: String(item.originCoord ?? ""),
                targetName: String(item.targetName ?? "Ziel"),
                targetCoord: String(item.targetCoord ?? ""),
                distanceLabel: String(item.distanceLabel ?? "-"),
                sentAtLabel: String(item.sentAtLabel ?? "-"),
                returnAtLabel: String(item.returnAtLabel ?? "-"),
                arrivalAtIso: String(item.arrivalAtIso ?? ""),
                arrivalLabel: String(item.arrivalLabel ?? "-"),
                rawLine: String(item.rawLine ?? ""),
              }))
              .filter(
                (item) =>
                  item.originCoord &&
                  item.targetCoord &&
                  Number.isFinite(new Date(item.arrivalAtIso).getTime())
              )
              .sort(
                (a, b) =>
                  new Date(a.arrivalAtIso).getTime() - new Date(b.arrivalAtIso).getTime()
              )
          );
        } else {
          setDbIncomingAttacks([]);
        }
      } catch {
        setDbIncomingAttacks([]);
      }
    } catch {
      setInsertSosText("");
      setInsertForwardedText("");
      setInsertUnitsText("");
      setInsertBuildingsText("");
      setInsertOutgoingText("");
      setDbIncomingAttacks([]);
    } finally {
      window.setTimeout(() => {
        insertsHydratingRef.current = false;
      }, 0);
    }
  }

  async function saveInsertsToBackend(world: string, data: Record<string, string>) {
    try {
      await fetch(`${DB_API}/api/worlds/${encodeURIComponent(world)}/inserts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data }),
      });
    } catch {
      // Ignore.
    }
  }

  async function loadVillageEntriesFromBackend(world: string) {
    try {
      const response = await fetch(
        `${DB_API}/api/worlds/${encodeURIComponent(world)}/village_entries`
      );
      if (!response.ok) throw new Error("village entries load failed");
      const payload = await response.json();
      const raw = typeof payload?.value === "string" ? payload.value : "[]";
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setDbVillageEntries(
          parsed
            .filter(
              (item) =>
                item &&
                typeof item.player === "string" &&
                typeof item.coord === "string" &&
                typeof item.updatedAt === "string"
            )
            .map((item) => ({
              player: item.player,
              village: typeof item.village === "string" ? item.village : "",
              coord: item.coord,
              troops: item.troops && typeof item.troops === "object" ? item.troops : {},
              troopsOwn: item.troopsOwn && typeof item.troopsOwn === "object" ? item.troopsOwn : {},
              troopsInVillage:
                item.troopsInVillage && typeof item.troopsInVillage === "object"
                  ? item.troopsInVillage
                  : {},
              troopsOutwards:
                item.troopsOutwards && typeof item.troopsOutwards === "object"
                  ? item.troopsOutwards
                  : {},
              troopsMoving:
                item.troopsMoving && typeof item.troopsMoving === "object"
                  ? item.troopsMoving
                  : {},
              troopsTotal:
                item.troopsTotal && typeof item.troopsTotal === "object" ? item.troopsTotal : {},
              buildings: item.buildings && typeof item.buildings === "object" ? item.buildings : {},
              role: normalizeVillageRole(item.role),
              isBunker: Boolean(item.isBunker),
              updatedAt: item.updatedAt,
              sourceReportId: typeof item.sourceReportId === "string" ? item.sourceReportId : "",
            }))
        );
      } else {
        setDbVillageEntries([]);
      }
    } catch {
      setDbVillageEntries([]);
    }
  }

  async function saveVillageEntriesToBackend(world: string, entries: typeof dbVillageEntries) {
    try {
      await fetch(`${DB_API}/api/worlds/${encodeURIComponent(world)}/village_entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: JSON.stringify(entries) }),
      });
    } catch {
      // Ignore.
    }
  }

  async function loadReportsFromBackend(world: string) {
    setDbReportsStatus("loading");
    try {
      const response = await fetch(
        `${DB_API}/api/reports?world=${encodeURIComponent(world)}&limit=5000&offset=0`
      );
      if (!response.ok) throw new Error("Report-Load fehlgeschlagen");
      const payload = await response.json();
      const reports = Array.isArray(payload?.reports) ? payload.reports : [];
      const signatureUpdates: { id: string; signature: string }[] = [];
      const rewriteReports: {
        id: string;
        title: string;
        content: string;
        fetchedAt: string;
        details: ReturnType<typeof extractReportDetails>;
        signature?: string;
      }[] = [];
      const normalized = reports
        .map((item) => {
          if (!item || typeof item.id !== "string" || typeof item.fetchedAt !== "string") {
            return null;
          }
          const title = typeof item.title === "string" ? item.title : "";
          const signature = typeof item.signature === "string" ? item.signature : "";
          const detailsRaw =
            item.details && typeof item.details === "object"
              ? item.details
              : extractReportDetails("");
          const details = normalizeReportDetailsForStorage(
            detailsRaw as ReturnType<typeof extractReportDetails>
          );
          const rawBuildings = (detailsRaw as { buildings?: Record<string, unknown> } | null)?.buildings;
          const normalizedBuildings = details.buildings as Record<string, unknown> | undefined;
          const rawBuildingsSerialized = serializeNumericRecord(rawBuildings ?? {});
          const normalizedBuildingsSerialized = serializeNumericRecord(normalizedBuildings ?? {});
          const needsDetailsRewrite = rawBuildingsSerialized !== normalizedBuildingsSerialized;
          const displayTitle = title || details.subject || "";
          const computedSignature = buildReportSignature(details);
          const fallbackSignature = computedSignature || signature;
          if (computedSignature && signature !== computedSignature) {
            signatureUpdates.push({ id: item.id, signature: fallbackSignature });
          }
          if (needsDetailsRewrite) {
            rewriteReports.push({
              id: item.id,
              title: displayTitle,
              content: "",
              fetchedAt: item.fetchedAt,
              details,
              signature: fallbackSignature,
            });
          }
          return {
            id: item.id,
            signature: fallbackSignature,
            title: displayTitle,
            content: "",
            fetchedAt: item.fetchedAt,
            details,
          };
        })
        .filter(
          (item): item is {
            id: string;
            title: string;
            content: string;
            fetchedAt: string;
            details: ReturnType<typeof extractReportDetails>;
          } => Boolean(item)
        );
      const deduped = dedupeReports(normalized);
      setDbReports(deduped);
      savedReportIdsRef.current = new Set(deduped.map((item) => item.id));
      savedReportSignaturesRef.current = new Set(
        deduped.map((item) => item.signature).filter((sig): sig is string => Boolean(sig))
      );
      savedReportSignatureByIdRef.current = new Map(
        deduped
          .filter((item) => Boolean(item.signature))
          .map((item) => [item.id, item.signature as string])
      );
      if (signatureUpdates.length > 0) {
        try {
          await fetch(`${DB_API}/api/reports/signatures`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ world, updates: signatureUpdates }),
          });
        } catch {
          // Ignore.
        }
      }
      if (rewriteReports.length > 0) {
        await saveReportsToBackend(world, rewriteReports);
      }
      setDbReportsStatus("done");
    } catch {
      setDbReports([]);
      savedReportIdsRef.current = new Set();
      savedReportSignatureByIdRef.current = new Map();
      setDbReportsStatus("error");
    }
  }

  async function saveReportsToBackend(
    world: string,
    reports: { id: string; signature?: string; title: string; content: string; fetchedAt: string; details: ReturnType<typeof extractReportDetails> }[]
  ) {
    try {
      const payload = reports.map((report) => {
        const normalizedDetails = normalizeReportDetailsForStorage(report.details);
        return {
          id: report.id,
          signature: report.signature ?? buildReportSignature(normalizedDetails),
          title: report.title,
          fetchedAt: report.fetchedAt,
          details: normalizedDetails,
        };
      });
      const response = await fetch(`${DB_API}/api/reports/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ world, reports: payload }),
      });
      if (!response.ok) throw new Error("Report-Save fehlgeschlagen");
      for (const report of reports) {
        savedReportIdsRef.current.add(report.id);
        const signature =
          report.signature ??
          buildReportSignature(normalizeReportDetailsForStorage(report.details));
        if (signature) {
          savedReportSignaturesRef.current.add(signature);
          savedReportSignatureByIdRef.current.set(report.id, signature);
        }
      }
    } catch {
      setDbReportsStatus("error");
    }
  }

  async function loadForwardedReports(reportIds: string[]) {
    if (!activeDbWorld || reportIds.length === 0) return;
    const base = `https://${activeDbWorld.trim()}.die-staemme.de`;
    const unique = Array.from(new Set(reportIds));
    const toFetch = unique;
    if (toFetch.length === 0) {
      setDbReportsStatus("done");
      return;
    }
    setDbReportsLoading(true);
    try {
      const results = await Promise.allSettled(
        toFetch.map(async (id) => {
          const url = `${base}/public_report/${id}`;
          const html = await fetchTextViaProxy(url);
          const title = extractReportTitle(html);
          const text = extractReportText(html);
          const details = normalizeReportDetailsForStorage(extractReportDetails(html));
          if (!details.attacker && !details.defender) {
            return { id, title: "", content: "", fetchedAt: new Date().toISOString(), details };
          }
          const displayTitle = details.subject || title;
          return { id, title: displayTitle, content: text, fetchedAt: new Date().toISOString(), details };
        })
      );
      const loaded = results
        .filter((res): res is PromiseFulfilledResult<{ id: string; title: string; content: string; fetchedAt: string; details: ReturnType<typeof extractReportDetails> }> => res.status === "fulfilled")
        .map((res) => res.value);
      const valid = loaded
        .map((item) => {
          const signature = buildReportSignature(item.details);
          return { ...item, signature };
        })
        .filter((item) => item.details.attacker || item.details.defender);
      if (valid.length > 0) {
        setDbReports((prev) => {
          const previousById = new Map(prev.map((report) => [report.id, report]));
          const merged = valid.map((report) => {
            const existing = previousById.get(report.id);
            if (!existing) return report;
            const incomingBuildings = report.details?.buildings ?? {};
            const existingBuildings = existing.details?.buildings ?? {};
            const shouldKeepExistingBuildings =
              countMeaningfulBuildings(incomingBuildings) === 0 &&
              countMeaningfulBuildings(existingBuildings) > 0;
            if (!shouldKeepExistingBuildings) return report;
            return {
              ...report,
              details: {
                ...report.details,
                buildings: existingBuildings,
              },
            };
          });
          return dedupeReports([...merged, ...prev]);
        });
      }
      setDbReportsStatus("done");
      if (loaded.length === 0) {
        setDbReportsStatus("error");
      }
    } finally {
      setDbReportsLoading(false);
    }
  }

  async function clearReportsForActiveWorld() {
    if (!activeDbWorld) return;
    try {
      let response = await fetch(
        `${DB_API}/api/reports?world=${encodeURIComponent(activeDbWorld)}`,
        { method: "DELETE" }
      );
      if (response.status === 404 || response.status === 405) {
        response = await fetch(`${DB_API}/api/reports/clear`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ world: activeDbWorld }),
        });
      }
      if (!response.ok) throw new Error("Clear reports failed");
      setDbReports([]);
      savedReportIdsRef.current = new Set();
      savedReportSignaturesRef.current = new Set();
      savedReportSignatureByIdRef.current = new Map();
      setDbReportsStatus("done");
    } catch {
      setDbReportsStatus("error");
    }
  }

  async function importForwardedJsonFromText() {
    if (!activeDbWorld) {
      setDbReportsImportMessage("Bitte zuerst Welt auswählen.");
      return;
    }
    const raw = insertForwardedText.trim();
    if (!raw) {
      setDbReportsImportMessage("Bitte JSON in die Box einfügen.");
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      const asArray = Array.isArray(parsed)
        ? parsed
        : Array.isArray((parsed as { reports?: unknown[] })?.reports)
        ? (parsed as { reports: unknown[] }).reports
        : null;
      if (!asArray || asArray.length === 0) {
        setDbReportsImportMessage("JSON enthält keine Reports.");
        return;
      }
    } catch (error) {
      setDbReportsImportMessage(
        `Ungültiges JSON: ${error instanceof Error ? error.message : String(error)}`
      );
      return;
    }

    setDbReportsStatus("loading");
    setDbReportsImportMessage("Importiere JSON-Berichte ...");
    try {
      const response = await fetch(`${DB_API}/api/reports/import_forwarded_json`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          world: activeDbWorld,
          jsonText: raw,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || `HTTP ${response.status}`);
      }

      const imported = Number(data?.imported ?? 0);
      const failed = Number(data?.failed ?? 0);
      setDbReportsImportMessage(
        `JSON-Import abgeschlossen: ${imported} erfolgreich, ${failed} fehlgeschlagen.`
      );
      setInsertForwardedText("");
      await loadReportsFromBackend(activeDbWorld);
      setDbReportsStatus("done");
    } catch (error) {
      setDbReportsStatus("error");
      setDbReportsImportMessage(
        `JSON-Import fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async function importForwardedJsonFromDownloads(): Promise<"ok" | "no_file" | "error"> {
    if (!activeDbWorld) {
      setDbReportsImportMessage("Bitte zuerst Welt auswählen.");
      return "error";
    }
    setDbReportsStatus("loading");
    setDbReportsImportMessage("Importiere JSON aus Downloads ...");
    try {
      const response = await fetch(`${DB_API}/api/reports/import_forwarded_json_from_downloads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ world: activeDbWorld }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (data?.error === "no_matching_file") {
          setDbReportsStatus("idle");
          return "no_file";
        }
        throw new Error(data?.error || `HTTP ${response.status}`);
      }
      const imported = Number(data?.imported ?? 0);
      const failed = Number(data?.failed ?? 0);
      setDbReportsImportMessage(
        `JSON-Import abgeschlossen: ${imported} erfolgreich, ${failed} fehlgeschlagen.`
      );
      setInsertForwardedText("");
      await loadReportsFromBackend(activeDbWorld);
      setDbReportsStatus("done");
      return "ok";
    } catch (error) {
      setDbReportsStatus("error");
      setDbReportsImportMessage(
        `JSON-Import fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`
      );
      return "error";
    }
  }

  function renderBoxStatus(status: "idle" | "loading" | "done" | "error") {
    const label =
      status === "loading"
        ? "Lädt"
        : status === "done"
        ? "Geladen"
        : status === "error"
        ? "Fehler"
        : "Bereit";
    return <span className={`status-chip ${status}`}>{label}</span>;
  }

  function triggerStatus(
    key: string,
    setter: (value: "idle" | "done") => void
  ) {
    setter("done");
    const existing = resetTimersRef.current[key];
    if (existing) window.clearTimeout(existing);
    resetTimersRef.current[key] = window.setTimeout(() => {
      setter("idle");
    }, 3000);
  }

  function parseCoord(value: string) {
    const match = value.match(/(\d{1,3}\|\d{1,3})/);
    return match ? match[1] : "";
  }

  function parseVillageName(value: string) {
    return value
      .replace(/\(\d{1,3}\|\d{1,3}\)\s*K\d+/gi, "")
      .replace(/\(\d{1,3}\|\d{1,3}\)/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeVillageRole(value: unknown): VillageRole {
    if (typeof value !== "string") return "unknown";
    const normalized = value.trim().toLowerCase();
    if (normalized === "off") return "off";
    if (normalized === "deff" || normalized === "def") return "deff";
    if (
      normalized === "fake_dorf" ||
      normalized === "fake-dorf" ||
      normalized === "fakedorf" ||
      normalized === "lff"
    ) {
      return "fake_dorf";
    }
    return "unknown";
  }

  function villageRoleLabel(role: VillageRole) {
    if (role === "off") return "Off";
    if (role === "deff") return "Deff";
    if (role === "fake_dorf") return "Fake-Dorf";
    return "Unbekannt";
  }

  function isBunkerVillage(units: Record<string, number>) {
    const spear = Number(units?.spear ?? 0);
    const sword = Number(units?.sword ?? 0);
    const deffTotal = Object.entries(units).reduce((sum, [unit, count]) => {
      return sum + (DEFF_UNITS.has(unit) ? Math.max(0, Number(count ?? 0)) : 0);
    }, 0);
    return deffTotal >= 30000 || (spear >= 15000 && sword >= 15000);
  }

  function villageTypeLabel(role: VillageRole, bunker?: boolean) {
    const base = villageRoleLabel(role);
    if (bunker) {
      if (role === "unknown") return "Bunker";
      return `${base}, Bunker`;
    }
    return base;
  }

  function getVillageRoleUnits(entry: {
    troopsOwn?: Record<string, number>;
    troopsOutwards?: Record<string, number>;
    troopsMoving?: Record<string, number>;
    troopsTotal?: Record<string, number>;
    troops?: Record<string, number>;
  }) {
    const own = entry.troopsOwn ?? {};
    const outwards = entry.troopsOutwards ?? {};
    const moving = entry.troopsMoving ?? {};

    const roleUnits: Record<string, number> = {};
    const unitKeys = new Set([
      ...Object.keys(own),
      ...Object.keys(outwards),
      ...Object.keys(moving),
    ]);

    for (const unit of unitKeys) {
      const amount =
        Math.max(0, Number(own[unit] ?? 0)) +
        Math.max(0, Number(outwards[unit] ?? 0)) +
        Math.max(0, Number(moving[unit] ?? 0));
      if (amount > 0) roleUnits[unit] = amount;
    }

    if (Object.keys(roleUnits).length > 0) return roleUnits;
    if (entry.troopsTotal && Object.keys(entry.troopsTotal).length > 0) return entry.troopsTotal;
    if (entry.troops && Object.keys(entry.troops).length > 0) return entry.troops;
    return {};
  }

  function classifyVillage(units: Record<string, number>) {
    const off = Object.entries(units).reduce((sum, [unit, count]) => {
      return sum + (OFF_UNITS.has(unit) ? count : 0);
    }, 0);
    const deff = Object.entries(units).reduce((sum, [unit, count]) => {
      return sum + (DEFF_UNITS.has(unit) ? count : 0);
    }, 0);
    const fake = Object.entries(units).reduce((sum, [unit, count]) => {
      return sum + (unit === "spy" || unit === "ram" || unit === "catapult" || unit === "knight" ? count : 0);
    }, 0);
    if (off > deff) return "off";
    if (deff > off) return "deff";
    if (fake > 0) return "fake_dorf";
    return "unknown";
  }

  function parseOverviewNumbers(value: string) {
    const matches = value.match(/\d[\d.]*/g) ?? [];
    return matches
      .map((raw) => Number(raw.replace(/\./g, "")))
      .filter((num) => Number.isFinite(num));
  }

  function getFakeSpeedSeconds(unit: string) {
    const { seconds } = secondsPerField(dbUnitSpeeds, [unit], dbConfig);
    return seconds || 0;
  }

  function getSlowestFakeUnit(units: Record<string, number>) {
    const availableUnits = Object.entries(units)
      .filter(([, amount]) => Math.max(0, Number(amount ?? 0)) > 0)
      .map(([unit]) => unit);
    if (availableUnits.length === 0) return "catapult";

    let slowest = availableUnits[0];
    let slowestSeconds = getFakeSpeedSeconds(slowest);
    for (const [unit, amount] of Object.entries(units)) {
      if ((amount ?? 0) <= 0) continue;
      const seconds = getFakeSpeedSeconds(unit);
      if (seconds > slowestSeconds) {
        slowestSeconds = seconds;
        slowest = unit;
      }
    }
    return slowest;
  }

  function buildFakeManualUnits(village: FakeVillageState) {
    const unit = "catapult";
    const sendRaw = Number(fgManualUnitsToSend[unit] ?? 0);
    const keepRaw = Number(fgManualUnitsToKeep[unit] ?? 0);
    const available = Number(village.troops[unit] ?? 0);
    const keep = keepRaw < 0 ? 0 : keepRaw;
    const remaining = Math.max(0, available - keep);

    if (sendRaw === 0) return null;
    const payload: Record<string, number> = {};
    if (fgSendSpy) {
      const spies = Math.max(0, Number(village.troops.spy ?? 0));
      if (spies < 1) return null;
      payload.spy = 1;
    }

    if (sendRaw === -1) {
      if (remaining <= 0) return null;
      payload.catapult = remaining;
      return payload;
    }
    if (sendRaw < 0) return null;
    if (remaining < sendRaw) return null;
    payload.catapult = sendRaw;
    return payload;
  }

  function buildFakeDynamicUnits(village: FakeVillageState) {
    const payload: Record<string, number> = {};
    if (fgSendSpy) {
      const spies = Math.max(0, Number(village.troops.spy ?? 0));
      if (spies < 1) return null;
      payload.spy = 1;
    }

    const fakeLimitPercent = Math.max(0, Number(fgNightBonusConfig.fakeLimitPercent) || 0);
    const requiredPop =
      fakeLimitPercent > 0
        ? Math.max(1, Math.ceil((Math.max(0, village.points) * fakeLimitPercent) / 100))
        : 1;
    const catapultPop = TROOP_POP.catapult ?? 8;
    const neededCatapults = Math.max(1, Math.ceil(requiredPop / Math.max(1, catapultPop)));
    const availableCatapults = Math.max(
      0,
      Number(village.troops.catapult ?? 0) - Math.max(0, Number(fgKeepCatapults ?? 0))
    );
    if (availableCatapults < neededCatapults) return null;
    payload.catapult = neededCatapults;
    return payload;
  }

  function buildOffMixUnits(village: FakeVillageState) {
    const minAxe = 5000;
    const minLight = 1500;
    const minRam = 100;
    const availableAxe = Number(village.troops.axe ?? 0);
    const availableLight = Number(village.troops.light ?? 0);
    const availableRam = Number(village.troops.ram ?? 0);
    if (availableAxe < minAxe) return null;
    if (availableLight < minLight) return null;
    if (availableRam < minRam) return null;
    const payload: Record<string, number> = {};
    for (const unit of ["axe", "light", "ram", "catapult", "marcher"] as const) {
      const amount = Math.max(0, Number(village.troops[unit] ?? 0));
      if (amount > 0) payload[unit] = amount;
    }
    return payload;
  }

  function buildAgChainMiniUnits(village: FakeVillageState, preset: FakeAgChainPreset) {
    const availableSnob = Number(village.troops.snob ?? 0);
    if (availableSnob < 1) return null;
    if (preset === "light50_snob1") {
      const availableLight = Number(village.troops.light ?? 0);
      if (availableLight < 50) return null;
      return { light: 50, snob: 1 } as Record<string, number>;
    }
    const availableAxe = Number(village.troops.axe ?? 0);
    if (availableAxe < 100) return null;
    return { axe: 100, snob: 1 } as Record<string, number>;
  }

  function subtractFakeUnits(village: FakeVillageState, units: Record<string, number>) {
    for (const [unit, amount] of Object.entries(units)) {
      if ((amount ?? 0) <= 0) continue;
      village.troops[unit] = Math.max(0, Number(village.troops[unit] ?? 0) - amount);
    }
  }

  function isFakeArrivalInsideNightBonus(arrival: Date) {
    if (!fgAvoidNightBonus) return false;
    const hasNightData = fgNightBonusConfig.hasNightData;
    const effectiveActive = hasNightData ? fgNightBonusConfig.active : true;
    if (!effectiveActive) return false;
    const startHour = hasNightData ? fgNightBonusConfig.startHour : 0;
    const endHour = hasNightData ? fgNightBonusConfig.endHour : 8;
    const bufferMinutes = Math.max(0, fgNightBonusBuffer);
    const hourValue = arrival.getHours() * 60 + arrival.getMinutes();
    const startValue = (startHour * 60 - bufferMinutes + 24 * 60) % (24 * 60);
    const endValue = endHour * 60;
    if (startValue === endValue) return false;
    if (startValue < endValue) {
      return hourValue >= startValue && hourValue < endValue;
    }
    return hourValue >= startValue || hourValue < endValue;
  }

  function isFakeArrivalAllowed(arrival: Date, attackerPlayer: string, _type: TimeTypeFilter = "fake") {
    if (fgArrivalRanges.length > 0) {
      const inAnyWindow = fgArrivalRanges.some((window) => {
        if (arrival.getTime() < window.fromDate.getTime()) return false;
        if (arrival.getTime() > window.toDate.getTime()) return false;
        return true;
      });
      if (!inAnyWindow) return false;
    }
    if (isFakeArrivalInsideNightBonus(arrival)) return false;
    void attackerPlayer;
    return true;
  }

  function formatFakeArrivalWindowLabel(window: FakeArrivalWindow) {
    const from = new Date(window.from);
    const to = new Date(window.to);
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime())) return "-";
    return `${formatDate(from, "local")} - ${formatDate(to, "local")}`;
  }

  function getFakeVillagesForCalc() {
    return fgCurrentPlayerVillages.map((village) => ({
      ...village,
      troops: { ...village.troops },
      usedCount: 0,
    }));
  }

  function countPossibleAttacksForVillage(village: FakeVillageState) {
    let count = 0;
    while (true) {
      if (fgMaxAttacksPerVillage > 0 && count >= fgMaxAttacksPerVillage) break;
      const units =
        fgUnitSelectionType === "manual"
          ? buildFakeManualUnits(village)
          : buildFakeDynamicUnits(village);
      if (!units) break;
      subtractFakeUnits(village, units);
      count += 1;
    }
    return count;
  }

  function handleFakeCalculateTotalPossibleAttacks() {
    const villages = getFakeVillagesForCalc();
    const total = villages.reduce((sum, village) => sum + countPossibleAttacksForVillage(village), 0);
    setFgTotalPossibleAttacks(total);
    setFgStatusType("success");
    setFgStatusMessage(`Total possible attacks: ${total}`);
  }

  function buildFakeWbLine(
    originVillageId: string,
    targetVillageId: string,
    slowestUnit: string,
    arrivalAt: Date,
    units: Record<string, number>,
    attackType: "fake" | "off" | "ag"
  ) {
    const typeCode = attackType === "off" ? 8 : attackType === "ag" ? 11 : 14;
    const arrivalTimestamp = arrivalAt.getTime() + typeCode;
    const unitParts = dbOverviewUnitOrder
      .map((unit) => `${unit}=${btoa(String(Math.max(0, Number(units[unit] ?? 0))))}`)
      .join("/");
    return `${originVillageId}&${targetVillageId}&${slowestUnit}&${arrivalTimestamp}&${typeCode}&true&false&${unitParts}`;
  }

  function buildFakeSendLink(originVillageId: string, targetVillageId: string, units: Record<string, number>) {
    const base = `https://${(activeDbWorld || worldCode || "").trim()}.die-staemme.de/game.php`;
    const params = new URLSearchParams();
    params.set("village", originVillageId);
    params.set("screen", "place");
    params.set("target", targetVillageId);
    for (const unit of dbOverviewUnitOrder) {
      const amount = Math.max(0, Number(units[unit] ?? 0));
      if (amount > 0) {
        params.set(unit, String(amount));
      }
    }
    return `${base}?${params.toString()}`;
  }

  function handleFakeCalculate() {
    setFgResultRows([]);
    setFgUnusedCoords([]);
    setFgTotalPossibleAttacks(null);
    const worldCodeValue = (activeDbWorld || worldCode || "").trim();
    if (!worldCodeValue) {
      setFgStatusType("error");
      setFgStatusMessage("Select a world first.");
      return;
    }
    if (fgCurrentPlayerVillages.length === 0) {
      setFgStatusType("error");
      setFgStatusMessage("No own villages available. Import troop data first.");
      return;
    }
    if (fgTargetCoords.length === 0) {
      setFgStatusType("error");
      setFgStatusMessage("No valid target coordinates.");
      return;
    }

    const villages = getFakeVillagesForCalc();
    const now = new Date();
    const unused: string[] = [];
    const result: FakePlanRow[] = [];
    const selectedPlayerPoints = dbSelectedPlayerInfo?.points ?? 0;
    const ratioEnabled = fgFilterRatio && fgNightBonusConfig.ratio > 0 && selectedPlayerPoints > 0;
    let offMixedGenerated = 0;
    let agChainsGenerated = 0;

    if (fgMixOffEnabled) {
      const requestedOffCount = Math.max(0, fgMixOffCount);
      if (requestedOffCount > 0) {
        const usedOffOrigins = new Set<string>();
        for (let i = 0; i < requestedOffCount; i += 1) {
          const offTargetCoord = fgMixOffTargetCoords[i] || fgTargetCoords[0] || "";
          const offTargetVillage = dbVillages.get(offTargetCoord);
          if (!offTargetVillage) continue;
          const offCandidates: Array<{
            village: FakeVillageState;
            units: Record<string, number>;
            travelSeconds: number;
            distance: number;
            arrivalAt: Date;
          }> = [];
          for (const village of villages) {
            if (usedOffOrigins.has(village.coord)) continue;
            if (fgMaxAttacksPerVillage > 0 && village.usedCount >= fgMaxAttacksPerVillage) continue;
            const units = buildOffMixUnits(village);
            if (!units) continue;
            const speedSeconds = getFakeSpeedSeconds("ram");
            if (!speedSeconds) continue;
            const distance = Math.hypot(village.x - offTargetVillage.x, village.y - offTargetVillage.y);
            const travelSeconds = distance * speedSeconds;
            const arrivalAt = new Date(now.getTime() + travelSeconds * 1000);
            if (!isFakeArrivalAllowed(arrivalAt, village.playerName)) continue;
            offCandidates.push({
              village,
              units,
              travelSeconds,
              distance,
              arrivalAt,
            });
          }
          if (offCandidates.length === 0) break;
          offCandidates.sort((a, b) => {
            const catsA = Number(a.units.catapult ?? 0);
            const catsB = Number(b.units.catapult ?? 0);
            if (catsA !== catsB) return catsB - catsA;
            const usageDiff = a.village.usedCount - b.village.usedCount;
            if (usageDiff !== 0) return usageDiff;
            const travelDiff = a.travelSeconds - b.travelSeconds;
            if (travelDiff !== 0) return travelDiff;
            return a.village.coord.localeCompare(b.village.coord, "de");
          });
          const selectedOff = offCandidates[0];
          const sendAt = new Date(selectedOff.arrivalAt.getTime() - selectedOff.travelSeconds * 1000);
          const wbLine = buildFakeWbLine(
            selectedOff.village.villageId,
            offTargetVillage.villageId,
            "ram",
            selectedOff.arrivalAt,
            selectedOff.units,
            "off"
          );
          result.push({
            attackType: "off",
            originCoord: selectedOff.village.coord,
            originVillageId: selectedOff.village.villageId,
            targetCoord: offTargetCoord,
            targetVillageId: offTargetVillage.villageId,
            sendAt,
            arrivalAt: selectedOff.arrivalAt,
            unit: "ram",
            units: selectedOff.units,
            link: buildFakeSendLink(selectedOff.village.villageId, offTargetVillage.villageId, selectedOff.units),
            wbLine,
          });
          subtractFakeUnits(selectedOff.village, selectedOff.units);
          selectedOff.village.usedCount += 1;
          usedOffOrigins.add(selectedOff.village.coord);
          offMixedGenerated += 1;
        }
      }
    }

    if (fgAgChainsEnabled) {
      const requestedChains = Math.max(0, fgAgChainsCount);
      for (let chainIndex = 0; chainIndex < requestedChains; chainIndex += 1) {
        const targetCoord = fgTargetCoords[chainIndex % fgTargetCoords.length] ?? "";
        const targetVillage = dbVillages.get(targetCoord);
        if (!targetVillage) continue;
        if (ratioEnabled) {
          const targetPlayer = dbPlayers.get(targetVillage.playerId);
          const targetPoints = targetPlayer?.points ?? 0;
          if (targetPoints < selectedPlayerPoints / fgNightBonusConfig.ratio) continue;
        }

        const working = villages.map((village) => ({
          ...village,
          troops: { ...village.troops },
        }));
        const chainRows: FakePlanRow[] = [];

        const pickChainCandidate = (
          unitsBuilder: (village: FakeVillageState) => Record<string, number> | null,
          attackType: "off" | "ag",
          usedOrigins: Set<string>,
          minArrivalMs: number = 0
        ) => {
          const candidates: Array<{
            village: FakeVillageState;
            units: Record<string, number>;
            slowestUnit: string;
            travelSeconds: number;
            arrivalAt: Date;
          }> = [];
          for (const village of working) {
            if (usedOrigins.has(village.coord)) continue;
            if (fgMaxAttacksPerVillage > 0 && village.usedCount >= fgMaxAttacksPerVillage) continue;
            const units = unitsBuilder(village);
            if (!units) continue;
            const slowestUnit = getSlowestFakeUnit(units);
            const speedSeconds = getFakeSpeedSeconds(slowestUnit);
            if (!speedSeconds) continue;
            const distance = Math.hypot(village.x - targetVillage.x, village.y - targetVillage.y);
            const travelSeconds = distance * speedSeconds;
            const arrivalAt = new Date(now.getTime() + travelSeconds * 1000);
            if (arrivalAt.getTime() < minArrivalMs) continue;
            if (!isFakeArrivalAllowed(arrivalAt, village.playerName, attackType === "ag" ? "ag" : "attack")) continue;
            candidates.push({
              village,
              units,
              slowestUnit,
              travelSeconds,
              arrivalAt,
            });
          }
          if (candidates.length === 0) return null;
          candidates.sort((a, b) => {
            const usageDiff = a.village.usedCount - b.village.usedCount;
            if (usageDiff !== 0) return usageDiff;
            const travelDiff = a.travelSeconds - b.travelSeconds;
            if (travelDiff !== 0) return travelDiff;
            return a.village.coord.localeCompare(b.village.coord, "de");
          });
          return candidates[0];
        };

        const offUsedOrigins = new Set<string>();
        const offCandidate = pickChainCandidate(buildOffMixUnits, "off", offUsedOrigins);
        if (!offCandidate) continue;
        const offSendAt = new Date(offCandidate.arrivalAt.getTime() - offCandidate.travelSeconds * 1000);
        chainRows.push({
          attackType: "off",
          originCoord: offCandidate.village.coord,
          originVillageId: offCandidate.village.villageId,
          targetCoord,
          targetVillageId: targetVillage.villageId,
          sendAt: offSendAt,
          arrivalAt: offCandidate.arrivalAt,
          unit: offCandidate.slowestUnit,
          units: offCandidate.units,
          link: buildFakeSendLink(offCandidate.village.villageId, targetVillage.villageId, offCandidate.units),
          wbLine: buildFakeWbLine(
            offCandidate.village.villageId,
            targetVillage.villageId,
            offCandidate.slowestUnit,
            offCandidate.arrivalAt,
            offCandidate.units,
            "off"
          ),
        });
        subtractFakeUnits(offCandidate.village, offCandidate.units);
        offCandidate.village.usedCount += 1;
        const miniUsedOrigins = new Set<string>();
        const minAgArrivalMs = offCandidate.arrivalAt.getTime() + 1000;

        let miniCount = 0;
        while (miniCount < 4) {
          const miniCandidate = pickChainCandidate(
            (village) => buildAgChainMiniUnits(village, fgAgChainPreset),
            "ag",
            miniUsedOrigins,
            minAgArrivalMs
          );
          if (!miniCandidate) break;
          const miniSendAt = new Date(miniCandidate.arrivalAt.getTime() - miniCandidate.travelSeconds * 1000);
          chainRows.push({
            attackType: "ag",
            originCoord: miniCandidate.village.coord,
            originVillageId: miniCandidate.village.villageId,
            targetCoord,
            targetVillageId: targetVillage.villageId,
            sendAt: miniSendAt,
            arrivalAt: miniCandidate.arrivalAt,
            unit: miniCandidate.slowestUnit,
            units: miniCandidate.units,
            link: buildFakeSendLink(miniCandidate.village.villageId, targetVillage.villageId, miniCandidate.units),
            wbLine: buildFakeWbLine(
              miniCandidate.village.villageId,
              targetVillage.villageId,
              miniCandidate.slowestUnit,
              miniCandidate.arrivalAt,
              miniCandidate.units,
              "ag"
            ),
          });
          subtractFakeUnits(miniCandidate.village, miniCandidate.units);
          miniCandidate.village.usedCount += 1;
          miniUsedOrigins.add(miniCandidate.village.coord);
          miniCount += 1;
        }

        if (miniCount < 4) continue;

        for (const row of chainRows) {
          const originalVillage = villages.find((village) => village.coord === row.originCoord);
          const mutatedVillage = working.find((village) => village.coord === row.originCoord);
          if (!originalVillage || !mutatedVillage) continue;
          originalVillage.troops = { ...mutatedVillage.troops };
          originalVillage.usedCount = mutatedVillage.usedCount;
        }
        result.push(...chainRows);
        agChainsGenerated += 1;
      }
    }

    for (const targetCoord of fgTargetCoords) {
      const targetVillage = dbVillages.get(targetCoord);
      if (!targetVillage) {
        unused.push(targetCoord);
        continue;
      }
      if (ratioEnabled) {
        const targetPlayer = dbPlayers.get(targetVillage.playerId);
        const targetPoints = targetPlayer?.points ?? 0;
        if (targetPoints < selectedPlayerPoints / fgNightBonusConfig.ratio) {
          unused.push(targetCoord);
          continue;
        }
      }
      const candidates: Array<{
        village: FakeVillageState;
        units: Record<string, number>;
        slowestUnit: string;
        travelSeconds: number;
        distance: number;
        arrivalAt: Date;
      }> = [];
      for (const village of villages) {
        if (fgMaxAttacksPerVillage > 0 && village.usedCount >= fgMaxAttacksPerVillage) continue;
        const units =
          fgUnitSelectionType === "manual"
            ? buildFakeManualUnits(village)
            : buildFakeDynamicUnits(village);
        if (!units) continue;
        const slowestUnit = getSlowestFakeUnit(units);
        const speedSeconds = getFakeSpeedSeconds(slowestUnit);
        if (!speedSeconds) continue;
        const distance = Math.hypot(village.x - targetVillage.x, village.y - targetVillage.y);
        const travelSeconds = distance * speedSeconds;
        const arrivalAt = new Date(now.getTime() + travelSeconds * 1000);
        if (!isFakeArrivalAllowed(arrivalAt, village.playerName)) continue;
        candidates.push({
          village,
          units,
          slowestUnit,
          travelSeconds,
          distance,
          arrivalAt,
        });
      }
      if (candidates.length === 0) {
        unused.push(targetCoord);
        continue;
      }
      candidates.sort((a, b) => {
        const usageDiff = a.village.usedCount - b.village.usedCount;
        if (usageDiff !== 0) return usageDiff;
        const travelDiff = a.travelSeconds - b.travelSeconds;
        if (travelDiff !== 0) return travelDiff;
        return a.village.coord.localeCompare(b.village.coord, "de");
      });
      const selected = candidates[0];
      const sendAt = new Date(selected.arrivalAt.getTime() - selected.travelSeconds * 1000);
      const wbLine = buildFakeWbLine(
        selected.village.villageId,
        targetVillage.villageId,
        selected.slowestUnit,
        selected.arrivalAt,
        selected.units,
        "fake"
      );
      result.push({
        attackType: "fake",
        originCoord: selected.village.coord,
        originVillageId: selected.village.villageId,
        targetCoord,
        targetVillageId: targetVillage.villageId,
        sendAt,
        arrivalAt: selected.arrivalAt,
        unit: selected.slowestUnit,
        units: selected.units,
        link: buildFakeSendLink(selected.village.villageId, targetVillage.villageId, selected.units),
        wbLine,
      });
      subtractFakeUnits(selected.village, selected.units);
      selected.village.usedCount += 1;
    }

    setFgResultRows(result);
    setFgUnusedCoords(unused);
    if (result.length === 0) {
      setFgStatusType("error");
      setFgStatusMessage("No fake attacks possible with current settings.");
      return;
    }
    if (fgMixOffEnabled && fgMixOffCount > 0 && offMixedGenerated < fgMixOffCount) {
      setFgStatusType("success");
      setFgStatusMessage(
        `Calculated ${result.length} attacks. Off mixed: ${offMixedGenerated}/${fgMixOffCount}.`
      );
      return;
    }
    const fakeCount = result.filter((row) => row.attackType === "fake").length;
    const offCount = result.filter((row) => row.attackType === "off").length;
    const agCount = result.filter((row) => row.attackType === "ag").length;
    setFgStatusType("success");
    if (offCount > 0 || agCount > 0) {
      const chainInfo =
        fgAgChainsEnabled && fgAgChainsCount > 0
          ? ` | AG chains: ${agChainsGenerated}/${Math.max(0, fgAgChainsCount)}`
          : "";
      setFgStatusMessage(
        `Calculated ${fakeCount} fakes + ${offCount} off attacks + ${agCount} AG attacks.${chainInfo}`
      );
    } else {
      setFgStatusMessage(`Calculated ${fakeCount} fake attacks.`);
    }
  }

  function handleFakeOpenRange(start: number, end: number) {
    const delay = Math.max(0, fgOpenDelay);
    const subset = fgResultRows.slice(start, end);
    const openedWindows: Array<Window | null> = [];
    let blocked = 0;
    subset.forEach(() => {
      const opened = window.open("about:blank", "_blank");
      openedWindows.push(opened);
      if (!opened) blocked += 1;
    });
    openedWindows.forEach((opened, index) => {
      if (!opened) return;
      const row = subset[index];
      if (!row) return;
      window.setTimeout(() => {
        try {
          opened.location.href = row.link;
        } catch {
          // Ignore navigation failures for blocked/closed tabs.
        }
      }, index * delay);
    });
    if (blocked > 0) {
      setFgStatusType("error");
      setFgStatusMessage(
        `${blocked} tab(s) were blocked by your browser popup settings. Allow popups for this site.`
      );
    }
  }

  function handleFakeExportWb() {
    if (fgResultRows.length === 0) {
      setFgStatusType("error");
      setFgStatusMessage("No attacks to export.");
      return;
    }
    const payload = fgResultRows.map((row) => row.wbLine).join("\n");
    void navigator.clipboard.writeText(payload);
    setFgStatusType("success");
    setFgStatusMessage("Exported WB commands and copied to clipboard.");
  }

  function getSdSpeedSeconds(unit: string) {
    const { seconds } = secondsPerField(dbUnitSpeeds, [unit], dbConfig);
    return seconds || 0;
  }

  function buildStanddeffActionLink(
    sourceVillageId: string,
    targetVillageId: string,
    units: Record<string, number>
  ) {
    const base = getWorldBase(dbWorldBaseInput || worldBaseUrl, activeDbWorld || worldCode);
    if (!base) return "";
    const params = new URLSearchParams();
    params.set("village", sourceVillageId);
    params.set("screen", "place");
    params.set("target", targetVillageId);
    for (const unit of dbOverviewUnitOrder) {
      const amount = Math.max(0, Number(units[unit] ?? 0));
      if (amount > 0) params.set(unit, String(amount));
    }
    return `${base}/game.php?${params.toString()}`;
  }

  function buildStanddeffRanges(total: number) {
    const perButton = Math.max(1, sdOpenPerBatch);
    const ranges: Array<{ start: number; end: number }> = [];
    for (let start = 0; start < total; start += perButton) {
      ranges.push({ start, end: Math.min(total, start + perButton) });
    }
    return ranges;
  }

  function openStanddeffRange(rows: StanddeffTransferRow[], start: number, end: number) {
    const subset = rows.slice(start, end).filter((row) => Boolean(row.link));
    if (subset.length === 0) return;
    const delay = Math.max(0, sdOpenDelay);
    const openedWindows: Array<Window | null> = [];
    let blocked = 0;
    subset.forEach(() => {
      const opened = window.open("about:blank", "_blank");
      openedWindows.push(opened);
      if (!opened) blocked += 1;
    });
    openedWindows.forEach((opened, index) => {
      if (!opened) return;
      const row = subset[index];
      if (!row) return;
      window.setTimeout(() => {
        try {
          opened.location.href = row.link;
        } catch {
          // Ignore navigation failures for closed tabs.
        }
      }, index * delay);
    });
    if (blocked > 0) {
      setSdStatusType("error");
      setSdStatusMessage(
        `${blocked} tab(s) were blocked by your browser popup settings. Allow popups for this site.`
      );
    }
  }

  function parsePercentInput(value: string) {
    const num = Number(String(value).replace(/[^\d]/g, ""));
    if (!Number.isFinite(num)) return 0;
    return Math.max(0, Math.min(100, num));
  }

  function buildTabitRanges(total: number) {
    const perButton = Math.max(1, tabitOpenPerBatch);
    const ranges: Array<{ start: number; end: number }> = [];
    for (let start = 0; start < total; start += perButton) {
      ranges.push({ start, end: Math.min(total, start + perButton) });
    }
    return ranges;
  }

  function openTabitRange(rows: TabitResultRow[], start: number, end: number) {
    const subset = rows.slice(start, end).filter((row) => Boolean(row.link));
    if (subset.length === 0) return;
    const delay = Math.max(0, tabitOpenDelay);
    const openedWindows: Array<Window | null> = [];
    let blocked = 0;
    subset.forEach(() => {
      const opened = window.open("about:blank", "_blank");
      openedWindows.push(opened);
      if (!opened) blocked += 1;
    });
    openedWindows.forEach((opened, index) => {
      if (!opened) return;
      const row = subset[index];
      if (!row) return;
      window.setTimeout(() => {
        try {
          opened.location.href = row.link;
        } catch {
          // ignore
        }
      }, index * delay);
    });
    if (blocked > 0) {
      setTabitStatus(
        `${blocked} tab(s) were blocked by your browser popup settings. Allow popups for this site.`
      );
    }
  }

  function handleTabitCalculate() {
    setTabitResults([]);
    const selectedWorld = activeDbWorld || worldCode;
    if (!selectedWorld) {
      setTabitStatus("Please select a world first.");
      return;
    }
    if (sdOwnVillages.length === 0) {
      setTabitStatus("No own villages loaded. Please import your troop overview first.");
      return;
    }
    const resultLimit = Math.max(1, Number(tabitResultCount.replace(/[^\d]/g, "") || "10"));
    const requestedUnits: Record<string, number> = {};
    for (const unit of dbOverviewUnitOrder) {
      requestedUnits[unit] = Math.max(0, Number(tabitUnits[unit] ?? 0));
    }
    if (tabitSendAsSupport && tabitIgnorePaladin) {
      requestedUnits.knight = 0;
    }
    const requestedTotal = dbOverviewUnitOrder.reduce(
      (sum, unit) => sum + Math.max(0, Number(requestedUnits[unit] ?? 0)),
      0
    );
    if (requestedTotal <= 0) {
      setTabitStatus("Please enter at least one unit to send.");
      return;
    }

    const parsedSos = parseIncomingAttacksInsert(tabitSosRequest.trim());
    const attackRows = parsedSos.length > 0 ? parsedSos : dbIncomingAttacks;
    if (attackRows.length === 0) {
      setTabitStatus("No SOS attacks found. Paste a SoS request or import incoming attacks.");
      return;
    }

    const targetsByCoord = new Map<
      string,
      { targetCoord: string; targetName: string; arrivalIso: string; arrivalLabel: string; deadlineMs: number }
    >();
    for (const row of attackRows) {
      const deadlineMs = new Date(row.arrivalAtIso).getTime();
      if (!Number.isFinite(deadlineMs)) continue;
      const existing = targetsByCoord.get(row.targetCoord);
      if (!existing || deadlineMs < existing.deadlineMs) {
        targetsByCoord.set(row.targetCoord, {
          targetCoord: row.targetCoord,
          targetName: row.targetName || row.targetCoord,
          arrivalIso: row.arrivalAtIso,
          arrivalLabel: row.arrivalLabel,
          deadlineMs,
        });
      }
    }
    const targets = Array.from(targetsByCoord.values()).sort((a, b) => a.deadlineMs - b.deadlineMs);
    if (targets.length === 0) {
      setTabitStatus("No valid target arrival times found in SOS input.");
      return;
    }

    const speedPercent =
      parsePercentInput(tabitFriendshipBonus) + parsePercentInput(tabitUtBooster);
    const speedFactor = Math.max(0.1, 1 - speedPercent / 100);
    const slowestSecondsRaw = secondsPerField(
      dbUnitSpeeds,
      dbOverviewUnitOrder.filter((unit) => Number(requestedUnits[unit] ?? 0) > 0),
      dbConfig
    ).seconds;
    const slowestSeconds = Math.max(1, Math.round((slowestSecondsRaw || 0) * speedFactor));
    if (!slowestSeconds || slowestSeconds <= 0) {
      setTabitStatus("Unit speeds are missing. Please import world unit info first.");
      return;
    }

    const sourceState = sdOwnVillages.map((village) => ({
      ...village,
      troops: { ...village.troops },
    }));
    const nowMs = Date.now();
    const usedSources = new Set<string>();
    const results: TabitResultRow[] = [];
    let unresolved = 0;

    for (const target of targets) {
      if (results.length >= resultLimit) break;
      const targetVillage = dbVillages.get(target.targetCoord);
      const candidates = sourceState
        .map((source) => {
          if (tabitNoDuplicateTargets && usedSources.has(source.coord)) return null;
          for (const unit of dbOverviewUnitOrder) {
            const need = Math.max(0, Number(requestedUnits[unit] ?? 0));
            if (need <= 0) continue;
            const available = Math.max(0, Number(source.troops[unit] ?? 0));
            if (available < need) return null;
          }
          const distance = Math.hypot(source.x - (targetVillage?.x ?? source.x), source.y - (targetVillage?.y ?? source.y));
          const etaMs = nowMs + distance * slowestSeconds * 1000;
          if (etaMs > target.deadlineMs) return null;
          return { source, distance, etaMs };
        })
        .filter((item): item is { source: (typeof sourceState)[number]; distance: number; etaMs: number } => Boolean(item))
        .sort((a, b) => a.distance - b.distance);

      const selected = candidates[0];
      if (!selected) {
        unresolved += 1;
        continue;
      }

      for (const unit of dbOverviewUnitOrder) {
        const amount = Math.max(0, Number(requestedUnits[unit] ?? 0));
        if (amount <= 0) continue;
        selected.source.troops[unit] = Math.max(0, Number(selected.source.troops[unit] ?? 0) - amount);
      }

      const targetVillageId = targetVillage?.villageId ?? "";
      const sourceVillageId = selected.source.villageId;
      const link = targetVillageId
        ? buildStanddeffActionLink(sourceVillageId, targetVillageId, requestedUnits)
        : "";
      const sendMs = target.deadlineMs - selected.distance * slowestSeconds * 1000;
      results.push({
        id: createId(),
        sourceCoord: selected.source.coord,
        sourceName: selected.source.villageName,
        sourceVillageId,
        targetCoord: target.targetCoord,
        targetName: target.targetName,
        targetVillageId,
        arrivalIso: target.arrivalIso,
        arrivalLabel: target.arrivalLabel,
        etaSeconds: Math.max(0, Math.floor((target.deadlineMs - nowMs) / 1000)),
        sendIso: new Date(sendMs).toISOString(),
        sendLabel: new Date(sendMs).toLocaleString("de-DE"),
        unitPack: { ...requestedUnits },
        mode: tabitSendAsSupport ? "support" : "attack",
        link,
        bufferSeconds: Math.floor((target.deadlineMs - selected.etaMs) / 1000),
      });
      usedSources.add(selected.source.coord);
    }

    setTabitResults(results);
    if (results.length === 0) {
      setTabitStatus("No valid tabs found for current units/SOS/timing.");
      return;
    }
    setTabitStatus(
      `Calculated ${results.length} result(s)${unresolved > 0 ? `, ${unresolved} unresolved target(s)` : ""}.`
    );
  }

  function handleStanddeffStart() {
    setSdSupports([]);
    setSdDeffRelocations([]);
    setSdOffRelocations([]);
    setSdUnresolvedHints([]);
    setSdValidationRows([]);
    setSdCoverageStats(null);
    if (!activeDbWorld) {
      setSdStatusType("error");
      setSdStatusMessage("Select a world first.");
      return;
    }
    if (sdOwnVillages.length === 0) {
      setSdStatusType("error");
      setSdStatusMessage("No own villages available. Import own troop data first.");
      return;
    }
    if (sdThreatByTarget.size === 0) {
      setSdStatusType("success");
      setSdStatusMessage("No threatened villages (OFF/Fake/Unbekannt). Nothing to distribute.");
      setSdCoverageStats({
        threatenedVillages: 0,
        fullyCoveredVillages: 0,
        openNeeds: 0,
        unresolvedOffMoves: 0,
        unresolvedSurplusMoves: 0,
      });
      setSdValidationRows([
        {
          label: "Threat detection",
          ok: true,
          detail: "No threatened villages detected.",
        },
      ]);
      return;
    }

    const nowMs = Date.now();
    const standUnits = Array.from(
      new Set(
        [
          ...sdUnitOrder,
          ...Object.keys(sdTargetUnits ?? {}),
        ].filter((unit) => dbOverviewUnitOrder.includes(unit))
      )
    );
    const targetUnits: Record<string, number> = {};
    for (const unit of standUnits) {
      const raw = Number(sdTargetUnits[unit] ?? 0);
      targetUnits[unit] = Number.isFinite(raw) ? Math.max(0, raw) : 0;
    }

    const villageStates = sdOwnVillages.map((village) => ({
      ...village,
      troops: { ...village.troops },
    }));
    const villageEntryByCoord = new Map(dbVillageEntries.map((entry) => [entry.coord, entry]));
    const ownTroopsState = new Map<string, Record<string, number>>();
    const inVillageTroopsState = new Map<string, Record<string, number>>();
    for (const village of villageStates) {
      const entry = villageEntryByCoord.get(village.coord);
      const ownSource = entry?.troopsOwn ?? {};
      const inVillageSource = village.troops ?? {};
      const ownRecord: Record<string, number> = {};
      const inVillageRecord: Record<string, number> = {};
      for (const unit of dbOverviewUnitOrder) {
        ownRecord[unit] = Math.max(0, Number(ownSource[unit] ?? 0));
        inVillageRecord[unit] = Math.max(0, Number(inVillageSource[unit] ?? 0));
      }
      ownTroopsState.set(village.coord, ownRecord);
      inVillageTroopsState.set(village.coord, inVillageRecord);
    }
    const threatened = villageStates.filter((village) => sdThreatByTarget.has(village.coord));
    const safe = villageStates.filter((village) => !sdThreatByTarget.has(village.coord));

    const supportsMap = new Map<string, StanddeffTransferRow>();
    const deffOutMap = new Map<string, StanddeffTransferRow>();
    const offOutMap = new Map<string, StanddeffTransferRow>();
    const unresolvedHints: string[] = [];
    let unresolvedOffMoves = 0;
    let unresolvedSurplusMoves = 0;

    const upsertTransfer = (
      store: Map<string, StanddeffTransferRow>,
      sourceVillage: (typeof villageStates)[number],
      targetVillage: (typeof villageStates)[number],
      units: Record<string, number>,
      etaMs: number,
      deadlineMs: number,
      deadlineLabel: string,
      sourceOwnBefore?: number,
      sourceOwnAfter?: number,
      sourceInVillageBefore?: number,
      sourceInVillageAfter?: number
    ) => {
      const key = `${sourceVillage.coord}|${targetVillage.coord}`;
      const existing = store.get(key);
      const mergedUnits: Record<string, number> = existing ? { ...existing.units } : {};
      for (const [unit, amount] of Object.entries(units)) {
        if (amount <= 0) continue;
        mergedUnits[unit] = Math.max(0, Number(mergedUnits[unit] ?? 0) + amount);
      }
      const worstEtaMs = existing ? Math.max(new Date(existing.etaAtIso).getTime(), etaMs) : etaMs;
      const row: StanddeffTransferRow = {
        id: existing?.id ?? createId(),
        sourceVillageId: sourceVillage.villageId,
        targetVillageId: targetVillage.villageId,
        sourceCoord: sourceVillage.coord,
        sourceName: sourceVillage.villageName,
        targetCoord: targetVillage.coord,
        targetName: targetVillage.villageName,
        units: mergedUnits,
        etaAtIso: new Date(worstEtaMs).toISOString(),
        etaLabel: new Date(worstEtaMs).toLocaleString("de-DE"),
        deadlineIso: new Date(deadlineMs).toISOString(),
        deadlineLabel,
        bufferSeconds: Math.floor((deadlineMs - worstEtaMs) / 1000),
        link: buildStanddeffActionLink(sourceVillage.villageId, targetVillage.villageId, mergedUnits),
        sourceOwnBefore: existing?.sourceOwnBefore ?? sourceOwnBefore,
        sourceOwnAfter: sourceOwnAfter ?? existing?.sourceOwnAfter,
        sourceInVillageBefore: existing?.sourceInVillageBefore ?? sourceInVillageBefore,
        sourceInVillageAfter: sourceInVillageAfter ?? existing?.sourceInVillageAfter,
      };
      store.set(key, row);
    };
    const sumForUnits = (record: Record<string, number> | undefined, units: Record<string, number>) =>
      Object.keys(units).reduce(
        (sum, unit) => sum + Math.max(0, Number(record?.[unit] ?? 0)),
        0
      );

    const findNearestSafeCandidate = (
      sourceVillage: (typeof villageStates)[number],
      deadlineMs: number,
      units: Record<string, number>,
      enforceDeadline: boolean
    ) => {
      const involvedUnits = Object.keys(units).filter((unit) => Number(units[unit] ?? 0) > 0);
      if (involvedUnits.length === 0) return null;
      let slowestSeconds = 0;
      for (const unit of involvedUnits) {
        const speed = getSdSpeedSeconds(unit);
        if (speed > slowestSeconds) slowestSeconds = speed;
      }
      if (slowestSeconds <= 0) return null;
      const candidates = safe
        .map((targetVillage) => {
          const distance = Math.hypot(sourceVillage.x - targetVillage.x, sourceVillage.y - targetVillage.y);
          const etaMs = nowMs + distance * slowestSeconds * 1000;
          return { targetVillage, distance, etaMs };
        })
        .filter((item) => (enforceDeadline ? item.etaMs <= deadlineMs : true))
        .sort((a, b) => a.distance - b.distance);
      return candidates[0] ?? null;
    };

    // Step 1: Off relocation from threatened villages to safe villages.
    for (const sourceVillage of threatened) {
      const offUnits: Record<string, number> = {};
      for (const unit of dbOverviewUnitOrder) {
        if (!OFF_RELOCATE_UNITS.has(unit)) continue;
        const amount = Math.max(0, Number(sourceVillage.troops[unit] ?? 0));
        if (amount > 0) offUnits[unit] = amount;
      }
      if (Object.keys(offUnits).length === 0) continue;
      const threat = sdThreatByTarget.get(sourceVillage.coord);
      if (!threat) continue;
      const candidate = findNearestSafeCandidate(
        sourceVillage,
        threat.earliestArrivalMs,
        offUnits,
        false
      );
      if (!candidate) {
        unresolvedOffMoves += 1;
        unresolvedHints.push(
          `Off relocation not possible for ${sourceVillage.coord} (no valid safe target available).`
        );
        continue;
      }
      const sourceOwnBefore = sumForUnits(ownTroopsState.get(sourceVillage.coord), offUnits);
      const sourceInVillageBefore = sumForUnits(inVillageTroopsState.get(sourceVillage.coord), offUnits);
      for (const [unit, amount] of Object.entries(offUnits)) {
        sourceVillage.troops[unit] = Math.max(0, Number(sourceVillage.troops[unit] ?? 0) - amount);
        candidate.targetVillage.troops[unit] =
          Math.max(0, Number(candidate.targetVillage.troops[unit] ?? 0)) + amount;
        const sourceOwn = ownTroopsState.get(sourceVillage.coord);
        const sourceInVillage = inVillageTroopsState.get(sourceVillage.coord);
        const targetInVillage = inVillageTroopsState.get(candidate.targetVillage.coord);
        if (sourceInVillage) {
          sourceInVillage[unit] = Math.max(0, Number(sourceInVillage[unit] ?? 0) - amount);
        }
        if (sourceOwn) {
          const reducible = Math.min(Math.max(0, Number(sourceOwn[unit] ?? 0)), amount);
          sourceOwn[unit] = Math.max(0, Number(sourceOwn[unit] ?? 0) - reducible);
        }
        if (targetInVillage) {
          targetInVillage[unit] = Math.max(0, Number(targetInVillage[unit] ?? 0)) + amount;
        }
      }
      const sourceOwnAfter = sumForUnits(ownTroopsState.get(sourceVillage.coord), offUnits);
      const sourceInVillageAfter = sumForUnits(inVillageTroopsState.get(sourceVillage.coord), offUnits);
      upsertTransfer(
        offOutMap,
        sourceVillage,
        candidate.targetVillage,
        offUnits,
        candidate.etaMs,
        threat.earliestArrivalMs,
        threat.earliestArrivalLabel,
        sourceOwnBefore,
        sourceOwnAfter,
        sourceInVillageBefore,
        sourceInVillageAfter
      );
    }

    // Step 2: Deff surplus relocation from threatened villages to safe villages.
    for (const sourceVillage of threatened) {
      const threat = sdThreatByTarget.get(sourceVillage.coord);
      if (!threat) continue;
      const surplus: Record<string, number> = {};
      for (const unit of standUnits) {
        const current = Math.max(0, Number(sourceVillage.troops[unit] ?? 0));
        const target = Math.max(0, Number(targetUnits[unit] ?? 0));
        const extra = current - target;
        if (extra > 0) surplus[unit] = extra;
      }
      if (Object.keys(surplus).length === 0) continue;
      const candidate = findNearestSafeCandidate(
        sourceVillage,
        threat.earliestArrivalMs,
        surplus,
        false
      );
      if (!candidate) {
        unresolvedSurplusMoves += 1;
        unresolvedHints.push(
          `Surplus deff relocation not possible for ${sourceVillage.coord} (no valid safe target available).`
        );
        continue;
      }
      const movedSurplus: Record<string, number> = {};
      for (const [unit, amount] of Object.entries(surplus)) {
        const current = Math.max(0, Number(sourceVillage.troops[unit] ?? 0));
        const target = Math.max(0, Number(targetUnits[unit] ?? 0));
        const transferable = Math.max(0, current - target);
        const take = Math.min(Math.max(0, Number(amount ?? 0)), transferable);
        if (take <= 0) continue;
        sourceVillage.troops[unit] = Math.max(0, current - take);
        candidate.targetVillage.troops[unit] =
          Math.max(0, Number(candidate.targetVillage.troops[unit] ?? 0)) + take;
        movedSurplus[unit] = take;
      }
      if (Object.keys(movedSurplus).length === 0) continue;
      const sourceOwnBefore = sumForUnits(ownTroopsState.get(sourceVillage.coord), movedSurplus);
      const sourceInVillageBefore = sumForUnits(inVillageTroopsState.get(sourceVillage.coord), movedSurplus);
      for (const [unit, amount] of Object.entries(movedSurplus)) {
        const sourceOwn = ownTroopsState.get(sourceVillage.coord);
        const sourceInVillage = inVillageTroopsState.get(sourceVillage.coord);
        const targetInVillage = inVillageTroopsState.get(candidate.targetVillage.coord);
        if (sourceInVillage) {
          sourceInVillage[unit] = Math.max(0, Number(sourceInVillage[unit] ?? 0) - amount);
        }
        if (sourceOwn) {
          const reducible = Math.min(Math.max(0, Number(sourceOwn[unit] ?? 0)), amount);
          sourceOwn[unit] = Math.max(0, Number(sourceOwn[unit] ?? 0) - reducible);
        }
        if (targetInVillage) {
          targetInVillage[unit] = Math.max(0, Number(targetInVillage[unit] ?? 0)) + amount;
        }
      }
      const sourceOwnAfter = sumForUnits(ownTroopsState.get(sourceVillage.coord), movedSurplus);
      const sourceInVillageAfter = sumForUnits(inVillageTroopsState.get(sourceVillage.coord), movedSurplus);
      upsertTransfer(
        deffOutMap,
        sourceVillage,
        candidate.targetVillage,
        movedSurplus,
        candidate.etaMs,
        threat.earliestArrivalMs,
        threat.earliestArrivalLabel,
        sourceOwnBefore,
        sourceOwnAfter,
        sourceInVillageBefore,
        sourceInVillageAfter
      );
    }

    // Step 3: Fill standdeff needs from safe villages.
    const threatenedByDeadline = [...threatened].sort((a, b) => {
      const left = sdThreatByTarget.get(a.coord)?.earliestArrivalMs ?? Number.POSITIVE_INFINITY;
      const right = sdThreatByTarget.get(b.coord)?.earliestArrivalMs ?? Number.POSITIVE_INFINITY;
      return left - right;
    });

    for (const targetVillage of threatenedByDeadline) {
      const threat = sdThreatByTarget.get(targetVillage.coord);
      if (!threat) continue;
      for (const unit of standUnits) {
        const targetAmount = Math.max(0, Number(targetUnits[unit] ?? 0));
        let need = targetAmount - Math.max(0, Number(targetVillage.troops[unit] ?? 0));
        if (need <= 0) continue;
        const speedSeconds = getSdSpeedSeconds(unit);
        if (speedSeconds <= 0) {
          unresolvedHints.push(`Missing speed for ${unit}. Cannot fill ${targetVillage.coord}.`);
          continue;
        }
        const sources = [...safe]
          .map((sourceVillage) => {
            const available = Math.max(0, Number(sourceVillage.troops[unit] ?? 0));
            const distance = Math.hypot(sourceVillage.x - targetVillage.x, sourceVillage.y - targetVillage.y);
            const etaMs = nowMs + distance * speedSeconds * 1000;
            return { sourceVillage, available, distance, etaMs };
          })
          .filter((item) => item.available > 0 && item.etaMs <= threat.earliestArrivalMs)
          .sort((a, b) => a.distance - b.distance);

        for (const source of sources) {
          if (need <= 0) break;
          if (source.available <= 0) continue;
          const take = Math.min(need, source.available);
          if (take <= 0) continue;
          source.sourceVillage.troops[unit] =
            Math.max(0, Number(source.sourceVillage.troops[unit] ?? 0) - take);
          targetVillage.troops[unit] = Math.max(0, Number(targetVillage.troops[unit] ?? 0)) + take;
          const units = { [unit]: take };
          const sourceOwnBefore = sumForUnits(source.sourceVillage ? ownTroopsState.get(source.sourceVillage.coord) : undefined, units);
          const sourceInVillageBefore = sumForUnits(
            source.sourceVillage ? inVillageTroopsState.get(source.sourceVillage.coord) : undefined,
            units
          );
          const sourceOwn = ownTroopsState.get(source.sourceVillage.coord);
          const sourceInVillage = inVillageTroopsState.get(source.sourceVillage.coord);
          const targetInVillage = inVillageTroopsState.get(targetVillage.coord);
          if (sourceInVillage) {
            sourceInVillage[unit] = Math.max(0, Number(sourceInVillage[unit] ?? 0) - take);
          }
          if (sourceOwn) {
            const reducible = Math.min(Math.max(0, Number(sourceOwn[unit] ?? 0)), take);
            sourceOwn[unit] = Math.max(0, Number(sourceOwn[unit] ?? 0) - reducible);
          }
          if (targetInVillage) {
            targetInVillage[unit] = Math.max(0, Number(targetInVillage[unit] ?? 0)) + take;
          }
          const sourceOwnAfter = sumForUnits(ownTroopsState.get(source.sourceVillage.coord), units);
          const sourceInVillageAfter = sumForUnits(
            inVillageTroopsState.get(source.sourceVillage.coord),
            units
          );
          upsertTransfer(
            supportsMap,
            source.sourceVillage,
            targetVillage,
            units,
            source.etaMs,
            threat.earliestArrivalMs,
            threat.earliestArrivalLabel,
            sourceOwnBefore,
            sourceOwnAfter,
            sourceInVillageBefore,
            sourceInVillageAfter
          );
          need -= take;
        }

        if (need > 0) {
          unresolvedHints.push(
            `Not enough ${getUnitLabelDe(unit)} for ${targetVillage.coord}. Missing: ${need}.`
          );
        }
      }
    }

    const supports = [...supportsMap.values()].sort(
      (a, b) => new Date(a.deadlineIso).getTime() - new Date(b.deadlineIso).getTime()
    );
    const deffRelocations = [...deffOutMap.values()].sort(
      (a, b) => new Date(a.deadlineIso).getTime() - new Date(b.deadlineIso).getTime()
    );
    const offRelocations = [...offOutMap.values()].sort(
      (a, b) => new Date(a.deadlineIso).getTime() - new Date(b.deadlineIso).getTime()
    );

    const validationRows: StanddeffValidationRow[] = [];
    const missingByVillage: string[] = [];
    for (const village of threatened) {
      const missingUnits: string[] = [];
      for (const unit of standUnits) {
        const targetAmount = Math.max(0, Number(targetUnits[unit] ?? 0));
        const current = Math.max(0, Number(village.troops[unit] ?? 0));
        if (current < targetAmount) {
          missingUnits.push(`${getUnitLabelDe(unit)} ${current}/${targetAmount}`);
        }
      }
      if (missingUnits.length > 0) {
        missingByVillage.push(`${village.coord}: ${missingUnits.join(", ")}`);
      }
    }
    validationRows.push({
      label: "Standdeff target per threatened village",
      ok: missingByVillage.length === 0,
      detail:
        missingByVillage.length === 0
          ? "All threatened villages meet configured standdeff targets."
          : `Missing targets -> ${missingByVillage.join(" | ")}`,
    });

    const offLeft = threatened
      .map((village) => {
        const left = dbOverviewUnitOrder.reduce((sum, unit) => {
          if (!OFF_RELOCATE_UNITS.has(unit)) return sum;
          return sum + Math.max(0, Number(village.troops[unit] ?? 0));
        }, 0);
        return { coord: village.coord, left };
      })
      .filter((item) => item.left > 0);
    validationRows.push({
      label: "Off relocation from threatened villages",
      ok: offLeft.length === 0,
      detail:
        offLeft.length === 0
          ? "No off units remain in threatened villages."
          : `Remaining off in threatened villages -> ${offLeft
              .map((item) => `${item.coord}: ${item.left}`)
              .join(", ")}`,
    });

    const lateSupports = supports.filter((row) => row.bufferSeconds < 0);
    validationRows.push({
      label: "Standdeff support timing",
      ok: lateSupports.length === 0,
      detail:
        lateSupports.length === 0
          ? "All support ETAs are before deadline."
          : `Late supports -> ${lateSupports
              .map((row) => `${row.sourceCoord}->${row.targetCoord}`)
              .join(", ")}`,
    });

    const missingActionLinks = [...supports, ...deffRelocations, ...offRelocations].filter(
      (row) => !row.link
    );
    validationRows.push({
      label: "Action links",
      ok: missingActionLinks.length === 0,
      detail:
        missingActionLinks.length === 0
          ? "All generated rows have action links."
          : `${missingActionLinks.length} rows missing action link.`,
    });

    let openNeeds = 0;
    let fullyCoveredVillages = 0;
    for (const village of threatened) {
      let villageOpenNeeds = 0;
      for (const unit of standUnits) {
        const targetAmount = Math.max(0, Number(targetUnits[unit] ?? 0));
        const current = Math.max(0, Number(village.troops[unit] ?? 0));
        if (current < targetAmount) villageOpenNeeds += targetAmount - current;
      }
      openNeeds += villageOpenNeeds;
      if (villageOpenNeeds === 0) fullyCoveredVillages += 1;
    }

    setSdSupports(supports);
    setSdDeffRelocations(deffRelocations);
    setSdOffRelocations(offRelocations);
    setSdUnresolvedHints(unresolvedHints);
    setSdValidationRows(validationRows);
    setSdCoverageStats({
      threatenedVillages: threatened.length,
      fullyCoveredVillages,
      openNeeds,
      unresolvedOffMoves,
      unresolvedSurplusMoves,
    });
    if (openNeeds > 0 || unresolvedOffMoves > 0 || unresolvedSurplusMoves > 0) {
      setSdStatusType("error");
      setSdStatusMessage("Distribution finished with open issues. Check unresolved hints.");
      return;
    }
    setSdStatusType("success");
    setSdStatusMessage("Standdeff distribution complete. All threatened villages are covered.");
  }

  function getBuildingsOrder(count: number) {
    const base14 = [
      "main",
      "barracks",
      "stable",
      "garage",
      "smith",
      "place",
      "market",
      "wood",
      "stone",
      "iron",
      "farm",
      "storage",
      "hide",
      "wall",
    ];
    const withChurch = [
      "main",
      "barracks",
      "stable",
      "garage",
      "church",
      "smith",
      "place",
      "market",
      "wood",
      "stone",
      "iron",
      "farm",
      "storage",
      "hide",
      "wall",
    ];
    const withSnob = [
      "main",
      "barracks",
      "stable",
      "garage",
      "church",
      "smith",
      "place",
      "market",
      "wood",
      "stone",
      "iron",
      "farm",
      "storage",
      "hide",
      "wall",
      "snob",
    ];
    const withWatchtower = [
      "main",
      "barracks",
      "stable",
      "garage",
      "church",
      "smith",
      "place",
      "market",
      "wood",
      "stone",
      "iron",
      "farm",
      "storage",
      "hide",
      "wall",
      "watchtower",
    ];
    if (count === withSnob.length) return withSnob;
    if (count === withWatchtower.length) return withWatchtower;
    if (count === withChurch.length) return withChurch;
    if (count === base14.length) return base14;
    return count <= base14.length ? base14.slice(0, count) : withSnob.slice(0, count);
  }

  function mergeVillageEntries(
    current: typeof dbVillageEntries,
    incoming: {
      coord: string;
      village?: string;
      player?: string;
      troops?: Record<string, number>;
      troopsOwn?: Record<string, number>;
      troopsInVillage?: Record<string, number>;
      troopsOutwards?: Record<string, number>;
      troopsMoving?: Record<string, number>;
      troopsTotal?: Record<string, number>;
      buildings?: Record<string, number>;
      isBunker?: boolean;
    }[]
  ) {
    const map = new Map(current.map((entry) => [entry.coord, entry]));
    const selectedName = dbSelectedPlayerName.trim().toLowerCase();
    const isOwnVillage = (coord: string, fallbackPlayer?: string) => {
      const worldVillage = dbVillages.get(coord);
      if (worldVillage) {
        if (dbSelectedPlayerId) return worldVillage.playerId === dbSelectedPlayerId;
        return worldVillage.playerName.trim().toLowerCase() === selectedName;
      }
      if (!selectedName) return false;
      return (fallbackPlayer ?? "").trim().toLowerCase() === selectedName;
    };
    for (const entry of incoming) {
      if (!entry.coord) continue;
      const fromWorld = dbVillages.get(entry.coord);
      const candidatePlayer =
        fromWorld?.playerName ?? entry.player ?? map.get(entry.coord)?.player ?? "";
      if (!isOwnVillage(entry.coord, candidatePlayer)) continue;
      const existing = map.get(entry.coord);
      // Replace per imported category to avoid stale unit counts from older snapshots.
      const troopsOwn = entry.troopsOwn ? { ...entry.troopsOwn } : existing?.troopsOwn ?? {};
      const troopsInVillage = entry.troopsInVillage
        ? { ...entry.troopsInVillage }
        : existing?.troopsInVillage ?? {};
      const troopsOutwards = entry.troopsOutwards
        ? { ...entry.troopsOutwards }
        : existing?.troopsOutwards ?? {};
      const troopsMoving = entry.troopsMoving ? { ...entry.troopsMoving } : existing?.troopsMoving ?? {};
      const troopsTotal = entry.troopsTotal ? { ...entry.troopsTotal } : existing?.troopsTotal ?? {};
      const troopsFromEntry = entry.troops ? { ...entry.troops } : existing?.troops ?? {};
      const troops =
        Object.keys(troopsInVillage).length > 0
          ? troopsInVillage
          : Object.keys(troopsTotal).length > 0
          ? troopsTotal
          : Object.keys(troopsOwn).length > 0
          ? troopsOwn
          : troopsFromEntry;
      const buildings = entry.buildings
        ? { ...(existing?.buildings ?? {}), ...entry.buildings }
        : existing?.buildings ?? {};
      const roleUnits = getVillageRoleUnits({
        troopsOwn,
        troopsOutwards,
        troopsMoving,
        troopsTotal,
        troops,
      });
      const hasTroops = Object.keys(roleUnits).length > 0;
      const next = {
        player: fromWorld?.playerName ?? entry.player ?? existing?.player ?? dbSelectedPlayerName ?? "Unbekannt",
        village: fromWorld?.villageName ?? entry.village ?? existing?.village ?? "",
        coord: entry.coord,
        troops,
        troopsOwn,
        troopsInVillage,
        troopsOutwards,
        troopsMoving,
        troopsTotal,
        buildings,
        role: hasTroops ? classifyVillage(roleUnits) : normalizeVillageRole(existing?.role),
        isBunker: hasTroops ? isBunkerVillage(roleUnits) : Boolean(existing?.isBunker),
        updatedAt: new Date().toISOString(),
        sourceReportId: existing?.sourceReportId ?? "",
      };
      map.set(entry.coord, next);
    }
    return Array.from(map.values()).sort((a, b) => a.coord.localeCompare(b.coord, "de"));
  }

  function parseTroopsOverview(text: string, unitOrder: string[]) {
    const entries = new Map<
      string,
      {
        village?: string;
        ownPriority: number;
        troopsOwn?: Record<string, number>;
        troopsInVillage?: Record<string, number>;
        troopsOutwards?: Record<string, number>;
        troopsMoving?: Record<string, number>;
        troopsTotal?: Record<string, number>;
      }
    >();
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    let currentCoord = "";
    let currentVillage = "";
    const ownPriority = new Map([
      ["im dorf", 3],
      ["eigene", 2],
    ]);
    const shouldAccept = (label: string) =>
      ownPriority.has(label.toLowerCase()) ||
      label.toLowerCase() === "insgesamt" ||
      label.toLowerCase() === "auswärts" ||
      label.toLowerCase() === "unterwegs";
    const resolveUnitOrder = (count: number) => {
      const available = new Set(dbAvailableUnits);
      const ordered = OVERVIEW_UNIT_ORDER.filter((unit) => available.has(unit));
      if (count === ordered.length) return ordered;
      if (count < ordered.length) return ordered.slice(0, count);
      return ordered;
    };

    for (const line of lines) {
      const coordMatch = line.match(/(.+?)\s*\((\d{1,3}\|\d{1,3})\)\s*K\d+/i);
      if (coordMatch) {
        currentVillage = coordMatch[1].trim();
        currentCoord = coordMatch[2];
      }

      const typeMatch = line.match(/^(im dorf|eigene|insgesamt|ausw\u00e4rts|unterwegs)\b/i);
      const typeLabel = typeMatch?.[1]?.toLowerCase() ?? "";
      if (typeLabel && !shouldAccept(typeLabel)) continue;
      if (!currentCoord) continue;

      const sourceLine = coordMatch
        ? line.slice((coordMatch.index ?? 0) + coordMatch[0].length)
        : line;
      const numbers = parseOverviewNumbers(sourceLine);
      if (numbers.length === 0) continue;
      const effectiveOrder =
        numbers.length === unitOrder.length ? unitOrder : resolveUnitOrder(numbers.length);
      if (numbers.length < effectiveOrder.length) continue;
      const unitCounts = numbers.slice(0, effectiveOrder.length);
      const troops: Record<string, number> = {};
      effectiveOrder.forEach((unit, idx) => {
        troops[unit] = unitCounts[idx] ?? 0;
      });

      const entry = entries.get(currentCoord) ?? {
        village: currentVillage,
        ownPriority: 0,
        troopsOwn: undefined,
        troopsInVillage: undefined,
        troopsOutwards: undefined,
        troopsMoving: undefined,
        troopsTotal: undefined,
      };
      if (typeLabel === "insgesamt") {
        entry.troopsTotal = troops;
      } else if (typeLabel === "auswärts") {
        entry.troopsOutwards = troops;
      } else if (typeLabel === "unterwegs") {
        entry.troopsMoving = troops;
      } else {
        const nextPriority = ownPriority.get(typeLabel || "eigene") ?? 0;
        if (typeLabel === "im dorf") {
          entry.troopsInVillage = troops;
        }
        if (!entry.troopsOwn || nextPriority >= entry.ownPriority) {
          entry.troopsOwn = troops;
          entry.ownPriority = nextPriority;
        }
      }
      entry.village = currentVillage || entry.village;
      entries.set(currentCoord, entry);
    }

    return Array.from(entries.entries()).map(([coord, data]) => ({
      coord,
      village: data.village,
      troopsOwn: data.troopsOwn ?? {},
      troopsInVillage: data.troopsInVillage ?? {},
      troopsOutwards: data.troopsOutwards ?? {},
      troopsMoving: data.troopsMoving ?? {},
      troopsTotal: data.troopsTotal ?? {},
    }));
  }

  function parseBuildingsOverview(text: string) {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const entries: { coord: string; village?: string; buildings: Record<string, number> }[] = [];
    for (const line of lines) {
      const coordMatch = line.match(/(.+?)\s*\((\d{1,3}\|\d{1,3})\)\s*K\d+/i);
      if (!coordMatch) continue;
      const village = coordMatch[1].trim();
      const coord = coordMatch[2];
      const tail = line.slice((coordMatch.index ?? 0) + coordMatch[0].length);
      const rawTokens = tail.match(/\d[\d.]*/g) ?? [];
      let values = rawTokens.map((raw) => Number(raw.replace(/\./g, ""))).filter((num) => Number.isFinite(num));
      if (values.length === 0) continue;
      const hasPointsToken = rawTokens[0]?.includes(".") ?? false;
      if (hasPointsToken && values.length > 1) {
        values = values.slice(1);
      }
      const buildingsOrder = getBuildingsOrder(values.length);
      if (values.length > buildingsOrder.length) {
        values = values.slice(values.length - buildingsOrder.length);
      }
      if (values.length < buildingsOrder.length) continue;
      const buildings: Record<string, number> = {};
      buildingsOrder.forEach((name, idx) => {
        buildings[name] = values[idx] ?? 0;
      });
      entries.push({ coord, village, buildings });
    }
    return entries;
  }

  function parseBattleTime(value: string, fallback: string) {
    const match = value.match(/(\d{2})\.(\d{2})\.(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
    if (!match) return new Date(fallback);
    const year = 2000 + Number(match[3]);
    return new Date(year, Number(match[2]) - 1, Number(match[1]), Number(match[4]), Number(match[5]), Number(match[6]));
  }

  const UNIT_ORDER = [
    "spear",
    "sword",
    "axe",
    "archer",
    "spy",
    "light",
    "marcher",
    "heavy",
    "ram",
    "catapult",
    "snob",
    "knight",
  ];

  function renderUnitRow(units: Record<string, number>) {
    const available = new Set(dbAvailableUnits);
    const filteredOrder =
      dbAvailableUnits.length > 0
        ? UNIT_ORDER.filter((unit) => available.has(unit))
        : UNIT_ORDER;
    return (
      <div className="report-units-row">
        {filteredOrder.map((unit) => (
          <div key={unit} className="report-unit">
            <img
              src={`https://dsde.innogamescdn.com/asset/985df5a4/graphic/unit/unit_${unit}.webp`}
              alt={unit}
            />
            <span>{units?.[unit] ?? 0}</span>
          </div>
        ))}
      </div>
    );
  }

  function renderVillageUnitsRow(units: Record<string, number>) {
    const available = new Set(dbAvailableUnits);
    const filteredOrder =
      dbAvailableUnits.length > 0
        ? OVERVIEW_UNIT_ORDER.filter((unit) => available.has(unit))
        : OVERVIEW_UNIT_ORDER;
    return (
      <div className="village-units-row">
        {filteredOrder.map((unit) => (
          <div key={unit} className="village-unit">
            <img
              src={`https://dsde.innogamescdn.com/asset/985df5a4/graphic/unit/unit_${unit}.webp`}
              alt={unit}
            />
            <span>{units?.[unit] ?? 0}</span>
          </div>
        ))}
      </div>
    );
  }

  function renderRetimeUnitPack(units: Record<string, number>) {
    const available = new Set(dbAvailableUnits);
    const orderedUnits =
      dbAvailableUnits.length > 0
        ? OVERVIEW_UNIT_ORDER.filter((unit) => available.has(unit) && OFF_RELOCATE_UNITS.has(unit))
        : OVERVIEW_UNIT_ORDER.filter((unit) => OFF_RELOCATE_UNITS.has(unit));
    const present = orderedUnits.filter((unit) => Number(units?.[unit] ?? 0) > 0);
    if (present.length === 0) return <span className="muted">-</span>;
    return (
      <div className="retime-unit-pack">
        {present.map((unit) => (
          <span key={`retime-pack-${unit}`} className="retime-unit-chip" title={getUnitLabelDe(unit)}>
            <img
              src={`https://dsde.innogamescdn.com/asset/985df5a4/graphic/unit/unit_${unit}.webp`}
              alt={getUnitLabelDe(unit)}
            />
            <span>{Number(units[unit] ?? 0).toLocaleString("de-DE")}</span>
          </span>
        ))}
      </div>
    );
  }

  function renderVillageTroopsMatrix(entry: {
    troopsOwn?: Record<string, number>;
    troopsInVillage?: Record<string, number>;
    troopsOutwards?: Record<string, number>;
    troopsMoving?: Record<string, number>;
    troopsTotal?: Record<string, number>;
    troops?: Record<string, number>;
  }) {
    const available = new Set(dbAvailableUnits);
    const filteredOrder =
      dbAvailableUnits.length > 0
        ? OVERVIEW_UNIT_ORDER.filter((unit) => available.has(unit))
        : OVERVIEW_UNIT_ORDER;
    if (filteredOrder.length === 0) return "Unbekannt";

    const own = entry.troopsOwn ?? {};
    const inVillage = entry.troopsInVillage ?? {};
    const outwards = entry.troopsOutwards ?? {};
    const moving = entry.troopsMoving ?? {};
    const total =
      entry.troopsTotal ??
      entry.troops ??
      {};

    const hasAnyData =
      Object.keys(own).length > 0 ||
      Object.keys(inVillage).length > 0 ||
      Object.keys(outwards).length > 0 ||
      Object.keys(moving).length > 0 ||
      Object.keys(total).length > 0;
    if (!hasAnyData) return "Unbekannt";

    const rows = [
      { key: "own", label: "Eigene", units: own },
      { key: "in_village", label: "Im Dorf", units: inVillage },
      { key: "outwards", label: "Auswärts", units: outwards },
      { key: "moving", label: "Unterwegs", units: moving },
      { key: "total", label: "Insgesamt", units: total },
    ];

    return (
      <div className="village-troops-matrix-wrap">
        <table className="village-troops-matrix">
          <thead>
            <tr>
              <th className="village-troops-label-col"></th>
              {filteredOrder.map((unit) => (
                <th key={`head-${unit}`} className="village-troops-unit-col">
                  <img
                    src={`https://dsde.innogamescdn.com/asset/985df5a4/graphic/unit/unit_${unit}.webp`}
                    alt={unit}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className={row.key === "total" ? "village-troops-total-row" : ""}>
                <td className="village-troops-label-col">{row.label}</td>
                {filteredOrder.map((unit) => (
                  <td key={`${row.key}-${unit}`} className="village-troops-value-col">
                    {Number(row.units?.[unit] ?? 0)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  function renderVillageBuildingsRow(buildings: Record<string, number>) {
    const available = BUILDING_ICON_ORDER.filter((name) => name in buildings);
    const order = available.length > 0 ? available : BUILDING_ICON_ORDER;
    return (
      <div className="village-units-row">
        {order.map((name) => (
          <div key={name} className="village-unit">
            <img
              src={`https://dsde.innogamescdn.com/asset/985df5a4/graphic/buildings/${name}.webp`}
              alt={name}
            />
            <span>{buildings?.[name] ?? 0}</span>
          </div>
        ))}
      </div>
    );
  }

  function countMeaningfulBuildings(buildings: Record<string, unknown> | undefined | null) {
    return Object.values(buildings ?? {}).filter((value) => Number(value ?? 0) > 0).length;
  }

  function filterReportBuildingsForDisplay(buildings: Record<string, number> | undefined | null) {
    const result: Record<string, number> = {};
    for (const key of BUILDING_ICON_ORDER) {
      const raw = Number(buildings?.[key] ?? 0);
      if (Number.isFinite(raw) && raw > 0) {
        result[key] = raw;
      }
    }
    return result;
  }

  function hasUnit(units: Record<string, number>, unit: string) {
    return (units?.[unit] ?? 0) > 0;
  }

  function sumUnits(units: Record<string, number>) {
    return Object.values(units ?? {}).reduce((sum, value) => sum + (Number(value) || 0), 0);
  }

  function normalizeName(value: string) {
    return value.trim().toLowerCase();
  }

  function getWinnerName(headline: string) {
    const match = headline.match(/^(.+?)\s+hat\s+gewonnen/i);
    return match ? match[1].trim() : "";
  }

  function getReportOutcome(report: (typeof dbReports)[number]) {
    const details = report.details;
    const attacker = normalizeName(details?.attacker ?? "");
    const defender = normalizeName(details?.defender ?? "");
    const winner = normalizeName(getWinnerName(details?.headline ?? ""));
    const isDraw = /unentschieden/i.test(details?.headline ?? "");
    const attackerWon = winner && attacker ? winner === attacker : false;
    const attackerLost = winner && attacker ? winner !== attacker : false;
    const attackerLosses = sumUnits(details?.attackerLossesUnits ?? {});
    const defenderLosses = sumUnits(details?.defenderLossesUnits ?? {});
    const spyReport = Boolean(details?.spyReport);
    const buildingDamage = (details?.buildingDamage?.length ?? 0) > 0;

    return {
      attackerWon,
      attackerLost,
      isDraw,
      attackerLosses,
      defenderLosses,
      spyReport,
      buildingDamage,
    };
  }

  function getCommandSize(totalTroops: number) {
    if (totalTroops <= 0) return "unknown";
    if (totalTroops <= 1000) return "small";
    if (totalTroops <= 5000) return "medium";
    return "large";
  }

  function getOutcomeIcon(report: (typeof dbReports)[number]) {
    const details = report.details;
    const attackerUnits = details?.attackerUnits ?? {};
    const attackerLosses = details?.attackerLossesUnits ?? {};
    const defenderUnits = details?.defenderUnits ?? {};
    const defenderLosses = details?.defenderLossesUnits ?? {};
    const attackerTotal = sumUnits(attackerUnits);
    const attackerLossTotal = sumUnits(attackerLosses);
    const defenderTotal = sumUnits(defenderUnits);
    const defenderLossTotal = sumUnits(defenderLosses);
    const spyUnits = attackerUnits.spy ?? 0;
    const spyLosses = attackerLosses.spy ?? 0;
    const nonSpyUnits = attackerTotal - spyUnits;
    const nonSpyLosses = attackerLossTotal - spyLosses;
    const buildingDamage = (details?.buildingDamage?.length ?? 0) > 0;

    const coordFrom = parseCoord(details?.origin ?? "");
    const coordTo = parseCoord(details?.target ?? "");
    const fromVillage = coordFrom ? dbVillages.get(coordFrom) : undefined;
    const toVillage = coordTo ? dbVillages.get(coordTo) : undefined;
    const registeredId = dbSelectedPlayerId;
    const registeredName = dbSelectedPlayerName.trim().toLowerCase();
    const attackerIdMatch = registeredId && fromVillage?.playerId === registeredId;
    const defenderIdMatch = registeredId && toVillage?.playerId === registeredId;
    const attackerNameMatch = registeredName && (fromVillage?.playerName ?? details?.attacker ?? "").trim().toLowerCase() === registeredName;
    const defenderNameMatch = registeredName && (toVillage?.playerName ?? details?.defender ?? "").trim().toLowerCase() === registeredName;
    const registeredSide = attackerIdMatch || attackerNameMatch ? "attacker" : defenderIdMatch || defenderNameMatch ? "defender" : null;

    if (attackerTotal === 0) return "gray";
    if (registeredSide === "attacker" && nonSpyUnits === 0 && spyUnits > 0 && attackerLossTotal === 0)
      return "blue";
    if (
      registeredSide === "defender" &&
      attackerTotal > 0 &&
      attackerLossTotal === attackerTotal &&
      buildingDamage
    ) {
      return "red_yellow";
    }
    if (
      registeredSide === "attacker" &&
      nonSpyUnits > 0 &&
      nonSpyLosses === nonSpyUnits &&
      spyLosses < spyUnits
    )
      return "red_blue";

    if (registeredSide) {
      const regUnits = registeredSide === "attacker" ? attackerTotal : defenderTotal;
      const regLosses = registeredSide === "attacker" ? attackerLossTotal : defenderLossTotal;
      const oppUnits = registeredSide === "attacker" ? defenderTotal : attackerTotal;
      const oppLosses = registeredSide === "attacker" ? defenderLossTotal : attackerLossTotal;
      if (regUnits > 0 && regLosses === 0 && oppUnits > 0 && oppLosses === oppUnits) return "green";
      if (regUnits > 0 && regLosses === regUnits) return "red";
      if (regLosses > 0) return "yellow";
    }

    // Fallback when attacker/defender side cannot be mapped to selected account:
    // still derive a meaningful dot from absolute losses.
    if (nonSpyUnits === 0 && spyUnits > 0 && attackerLossTotal === 0) return "blue";
    if (attackerTotal > 0 && attackerLossTotal === 0 && defenderTotal > 0 && defenderLossTotal === defenderTotal)
      return "green";
    if (attackerTotal > 0 && attackerLossTotal === attackerTotal) return "red";
    if (attackerLossTotal > 0 || defenderLossTotal > 0) return "yellow";

    return "gray";
  }

  function dedupeReports(list: typeof dbReports) {
    const map = new Map<string, (typeof dbReports)[number]>();
    for (const report of list) {
      if (!report?.id) continue;
      const signature = report.signature || buildReportSignature(report.details);
      const key = report.id;
      if (!map.has(key)) {
        map.set(key, { ...report, signature });
        continue;
      }
      const existing = map.get(key)!;
      const existingBuildings = countMeaningfulBuildings(
        existing.details?.buildings as Record<string, unknown> | undefined
      );
      const incomingBuildings = countMeaningfulBuildings(
        report.details?.buildings as Record<string, unknown> | undefined
      );
      if (incomingBuildings > existingBuildings) {
        map.set(key, { ...report, signature });
      }
    }
    return Array.from(map.values());
  }

  function getCommandIcon(size: string) {
    if (size === "small") return "attack_small";
    if (size === "medium") return "attack_medium";
    if (size === "large") return "attack_large";
    return "";
  }

  function getReportOutcomeDotIcon(report: (typeof dbReports)[number]) {
    const parsed = String(report.details?.outcomeDotIcon ?? "")
      .trim()
      .toLowerCase();
    if (parsed) return parsed;
    return getOutcomeIcon(report);
  }

  function getReportCommandSize(report: (typeof dbReports)[number]): "small" | "medium" | "large" | "unknown" {
    const parsed = String(report.details?.commandIcon ?? "")
      .trim()
      .toLowerCase();
    if (parsed === "attack_small") return "small";
    if (parsed === "attack_medium") return "medium";
    if (parsed === "attack_large") return "large";
    const totalTroops = sumUnits(report.details?.attackerUnits ?? {});
    return getCommandSize(totalTroops);
  }

  function toggleReportFilter(key: string) {
    setReportResultFilters((prev) => {
      const next = new Set(prev);
      if (key === "all") {
        return new Set(["all"]);
      }
      next.delete("all");
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      if (next.size === 0) return new Set(["all"]);
      return next;
    });
  }

  function isReportFilterActive(key: string) {
    return reportResultFilters.has("all") ? key === "all" : reportResultFilters.has(key);
  }

  function toggleReportColumn(id: string) {
    setReportColumns((prev) => {
      if (prev.includes(id)) return prev.filter((item) => item !== id);
      return [...prev, id];
    });
  }

  function moveReportColumn(id: string, dir: "up" | "down") {
    setReportColumns((prev) => {
      const index = prev.indexOf(id);
      if (index === -1) return prev;
      const nextIndex = dir === "up" ? index - 1 : index + 1;
      if (nextIndex < 0 || nextIndex >= prev.length) return prev;
      const copy = [...prev];
      const [item] = copy.splice(index, 1);
      copy.splice(nextIndex, 0, item);
      return copy;
    });
  }

  function handleReportColumnsDragStart(event: React.MouseEvent<HTMLDivElement>) {
    if (!reportColumnsOpen) return;
    const rect = event.currentTarget.parentElement?.getBoundingClientRect();
    const originX = reportColumnsPos?.x ?? rect?.left ?? 0;
    const originY = reportColumnsPos?.y ?? rect?.top ?? 0;
    reportColumnsDragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX,
      originY,
    };
    const handleMove = (moveEvent: MouseEvent) => {
      if (!reportColumnsDragRef.current) return;
      const deltaX = moveEvent.clientX - reportColumnsDragRef.current.startX;
      const deltaY = moveEvent.clientY - reportColumnsDragRef.current.startY;
      setReportColumnsPos({
        x: reportColumnsDragRef.current.originX + deltaX,
        y: reportColumnsDragRef.current.originY + deltaY,
      });
    };
    const handleUp = () => {
      reportColumnsDragRef.current = null;
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  }

  const HOVER_WIDTH = 520;

  function showReportHover(reportId: string, target: HTMLElement, height: number) {
    if (hoverHideTimerRef.current) {
      window.clearTimeout(hoverHideTimerRef.current);
      hoverHideTimerRef.current = null;
    }
    const rect = target.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    if (!Number.isFinite(rect.left) || !Number.isFinite(rect.top)) return;
    const safeHeight = Number.isFinite(height) ? height : 520;
    const effectiveHeight = Math.min(safeHeight, Math.max(260, viewportHeight - 24));
    const preferredLeft = rect.right + 12;
    const fitsRight = preferredLeft + HOVER_WIDTH + 12 <= viewportWidth;
    const left = fitsRight ? preferredLeft : Math.max(12, rect.left - HOVER_WIDTH - 12);
    let top = rect.top + rect.height / 2 - effectiveHeight / 2;
    const nearBottomEdge = rect.bottom + 80 > viewportHeight;
    if (nearBottomEdge) {
      // When hovering near the lower viewport edge, move popup higher so all content stays reachable.
      top = rect.top + rect.height - effectiveHeight;
    }
    top = Math.min(Math.max(12, top), viewportHeight - effectiveHeight - 12);
    setHoverPos({ top, left });
    setHoverHeight(effectiveHeight);
    setHoveredReportId(reportId);
  }

  function scheduleHideHover() {
    if (hoverHideTimerRef.current) window.clearTimeout(hoverHideTimerRef.current);
    hoverHideTimerRef.current = window.setTimeout(() => {
      setHoveredReportId(null);
    }, 150);
  }

  async function openReportViewer(reportId: string) {
    setReportViewerError("");
    setHoveredReportId(null);
    if (hoverHideTimerRef.current) {
      window.clearTimeout(hoverHideTimerRef.current);
      hoverHideTimerRef.current = null;
    }
    const existing = dbReports.find((item) => item.id === reportId);
    if (existing) {
      setReportViewerId(reportId);
      return;
    }
    if (!activeDbWorld) {
      setReportViewerError("Kein Bericht gefunden.");
      return;
    }
    setReportViewerLoading(true);
    try {
      const response = await fetch(
        `${DB_API}/api/reports/${encodeURIComponent(reportId)}?world=${encodeURIComponent(
          activeDbWorld
        )}`
      );
      if (!response.ok) throw new Error("Report konnte nicht geladen werden.");
      const payload = await response.json();
      const rawDetails =
        payload?.details && typeof payload.details === "object"
          ? payload.details
          : extractReportDetails("");
      const normalizedDetails = normalizeReportDetailsForStorage(
        rawDetails as ReturnType<typeof extractReportDetails>
      );
      const normalized = {
        id: String(payload?.id ?? reportId),
        signature:
          typeof payload?.signature === "string" && payload.signature
            ? payload.signature
            : buildReportSignature(normalizedDetails),
        title:
          typeof payload?.title === "string" && payload.title
            ? payload.title
            : normalizedDetails.subject || `Report ${reportId}`,
        content: typeof payload?.rawHtml === "string" ? payload.rawHtml : "",
        fetchedAt:
          typeof payload?.fetchedAt === "string" ? payload.fetchedAt : new Date().toISOString(),
        details: normalizedDetails,
      };
      setDbReports((prev) => dedupeReports([normalized, ...prev]));
      setReportViewerId(normalized.id);
    } catch {
      setReportViewerError("Bericht konnte nicht geladen werden.");
    } finally {
      setReportViewerLoading(false);
    }
  }

  function getReportHoverHeight(
    report: { details?: ReturnType<typeof extractReportDetails> } | undefined,
    fallback: number
  ) {
    let height = Math.max(520, Number.isFinite(fallback) ? fallback : 520);
    if (!report?.details) return height;
    const details = report.details;
    if (details.loyalty) height += 44;
    const damageCount = details.buildingDamage?.length ?? 0;
    if (damageCount > 0) height += 56 + Math.min(140, damageCount * 20);
    const buildingCount = Object.keys(details.buildings ?? {}).length;
    if (buildingCount > 0) {
      height += 84;
      height += Math.min(260, Math.ceil(buildingCount / 8) * 46);
    }
    return Math.min(940, height);
  }

  function runPlayerSearch() {
    const account = searchAccountInput.trim();
    const tribe = searchTribeInput.trim();
    const coordX = searchCoordXInput.trim();
    const coordY = searchCoordYInput.trim();
    const hasAccount = account.length > 0;
    const hasTribe = tribe.length > 0;
    const hasAnyCoord = coordX.length > 0 || coordY.length > 0;
    const hasFullCoord = coordX.length > 0 && coordY.length > 0;
    const usedFields = [hasAccount, hasTribe, hasFullCoord].filter(Boolean).length;

    if (hasAnyCoord && !hasFullCoord) {
      setSearchValidationMessage("Koordinatensuche benötigt X und Y.");
      return;
    }
    if (usedFields !== 1) {
      setSearchValidationMessage(
        "Bitte nur ein Suchfeld nutzen: entweder Accountname oder Stamm oder Koordinaten."
      );
      return;
    }
    setSearchValidationMessage("");
    setSearchCriteria({
      account,
      tribe,
      coordX,
      coordY,
    });
    setSearchHasRun(true);
  }

  function runSearchByPlayer(playerName: string) {
    const name = playerName.trim();
    if (!name || name === "-") return;
    setSearchAccountInput(name);
    setSearchTribeInput("");
    setSearchCoordXInput("");
    setSearchCoordYInput("");
    setSearchAccountSuggestOpen(false);
    setSearchTribeSuggestOpen(false);
    setSearchValidationMessage("");
    setSearchCriteria({
      account: name,
      tribe: "",
      coordX: "",
      coordY: "",
    });
    setSearchHasRun(true);
  }

  function runSearchByTribe(tribe: string) {
    const value = tribe.trim();
    if (!value || value === "-") return;
    const normalized = value.startsWith("[") ? value : `[${value}]`;
    setSearchAccountInput("");
    setSearchTribeInput(normalized);
    setSearchCoordXInput("");
    setSearchCoordYInput("");
    setSearchAccountSuggestOpen(false);
    setSearchTribeSuggestOpen(false);
    setSearchValidationMessage("");
    setSearchCriteria({
      account: "",
      tribe: normalized,
      coordX: "",
      coordY: "",
    });
    setSearchHasRun(true);
  }

  function runSearchByCoord(coord: string) {
    const parsed = parseCoord(coord);
    if (!parsed) return;
    const [x, y] = parsed.split("|");
    if (!x || !y) return;
    setActiveDbTab("suche");
    setActiveSearchTab("suche");
    setSearchAccountInput("");
    setSearchTribeInput("");
    setSearchCoordXInput(x);
    setSearchCoordYInput(y);
    setSearchAccountSuggestOpen(false);
    setSearchTribeSuggestOpen(false);
    setSearchValidationMessage("");
    setSearchCriteria({
      account: "",
      tribe: "",
      coordX: x,
      coordY: y,
    });
    setSearchHasRun(true);
  }

  function applyVillageFilter() {
    setVillageFilterCriteria({
      player: villageFilterPlayerInput.trim(),
      tribe: villageFilterTribeInput.trim(),
      minX: villageFilterMinXInput.trim(),
      minY: villageFilterMinYInput.trim(),
      maxX: villageFilterMaxXInput.trim(),
      maxY: villageFilterMaxYInput.trim(),
      radius: villageFilterRadiusInput.trim(),
      centerX: villageFilterCenterXInput.trim(),
      centerY: villageFilterCenterYInput.trim(),
      minPoints: villageFilterMinPointsInput.trim(),
      maxPoints: villageFilterMaxPointsInput.trim(),
      type: villageFilterTypeInput,
    });
    setVillageFilterHasRun(true);
  }

  function exportVillageFilterRows() {
    const headers = ["Dorf", "Koordinate", "Typ", "Punkte"];
    const lines = villageFilterRows.map((row) =>
      [
        `"${(row.villageName || "").replace(/"/g, '""')}"`,
        `"${row.coord}"`,
        `"${(row.typeLabel || "").replace(/"/g, '""')}"`,
        String(row.points ?? 0),
      ].join(";")
    );
    const csv = [headers.join(";"), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    a.download = `dorffilter_${activeDbWorld || "world"}_${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="app">
      <div className="db">
        <header className="hero">
          <div>
            <p className="eyebrow">Die Stämme</p>
            <h1>Datenbank</h1>
            <p className="subtitle">
              Eingaben strukturieren, Daten durchsuchen und Berichte verwalten.
            </p>
          </div>
          <div className="db-dashboard">
            <div className="db-dashboard-grid">
              <div className="dashboard-card dashboard-card-user">
                <h3>Benutzer</h3>
                <p>
                  <strong>Name:</strong> {dbSelectedPlayerName || "-"}
                </p>
                <p>
                  <strong>Aktive Welt:</strong> {activeDbWorld || "-"}
                </p>
                <p>
                  <strong>Spielername:</strong> {dbSelectedPlayerName || "-"}
                </p>
                <p>
                  <strong>UV-Modus:</strong> Nein
                </p>
                <p>
                  <strong>Letzter Login:</strong>{" "}
                  {dbWorldLastLoaded ? new Date(dbWorldLastLoaded).toLocaleString("de") : "-"}
                </p>
              </div>
              <div className="dashboard-card dashboard-card-status">
                <h3>Spielerstatus</h3>
                <p>
                  <strong>Dörfer:</strong> {dbSelectedPlayerStats.villageCount}
                </p>
                <p>
                  <strong>Punkte:</strong> {dbSelectedPlayerPointsLabel}
                </p>
                <p>
                  <strong>Bashis Angriff:</strong>{" "}
                  {dbSelectedPlayerStats.offCount}
                </p>
                <p>
                  <strong>Bashis Verteidigung:</strong>{" "}
                  {dbSelectedPlayerStats.deffCount}
                </p>
                <p>
                  <strong>Fake-Dörfer:</strong>{" "}
                  {dbSelectedPlayerStats.fakeVillageCount}
                </p>
              </div>
              <div className="dashboard-card dashboard-card-activity">
                <h3>Aktivität</h3>
                <p>
                  <strong>Letzter Truppen-Upload:</strong>{" "}
                  {dbWorldLastLoaded ? new Date(dbWorldLastLoaded).toLocaleString("de") : "-"}
                </p>
                <p>
                  <strong>Erfasste Truppen:</strong> {dbVillageEntries.length} Dörfer
                </p>
                <p>
                  <strong>SOS-Meldungen:</strong>{" "}
                  {insertSosText.trim()
                    ? insertSosText.split(/\r?\n/).filter((line) => line.trim()).length
                    : 0}{" "}
                  aktiv
                </p>
              </div>
            </div>
          </div>
        </header>

        <section className="section db-world-section">
          <div className="section-header">
            <h2>Welten verwalten</h2>
            <span className="hint">Mehrere Datenbanken parallel pflegen.</span>
          </div>
          <div className="db-world-controls">
            <label>
              <span>Welt auswählen</span>
              <select
                value={activeDbWorld}
                onChange={(e) => setActiveDbWorld(e.target.value)}
              >
                <option value="">Keine Welt ausgewählt</option>
                {dbWorlds.map((world) => {
                  const playerLabel = dbWorldMeta[world]?.playerName;
                  const label = playerLabel ? `${world} | ${playerLabel}` : world;
                  return (
                    <option key={world} value={world}>
                      {label}
                    </option>
                  );
                })}
              </select>
            </label>
            <label>
              <span>Welt & Spieler</span>
              <div className="inline-input">
                <input
                  type="text"
                  placeholder="Welt (z. B. de246)"
                  value={dbWorldInput}
                  onChange={(e) => setDbWorldInput(e.target.value)}
                />
                <input
                  list="db-player-list"
                  type="text"
                  placeholder="Spielername"
                  value={dbWorldPlayerInput}
                  onChange={(e) => setDbWorldPlayerInput(e.target.value)}
                />
                <button
                  type="button"
                  className="ghost"
                  disabled={!dbWorldInput.trim() || !dbWorldPlayerInput.trim()}
                  onClick={async () => {
                    const next = dbWorldInput.trim();
                    const playerName = dbWorldPlayerInput.trim();
                    if (!next || !playerName) return;
                    try {
                      await fetch(`${DB_API}/api/worlds/${encodeURIComponent(next)}`, {
                        method: "DELETE",
                      });
                      await fetch(`${DB_API}/api/worlds`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ code: next }),
                      });
                    } catch {
                      // Ignore.
                    }
                    setDbWorlds((prev) => (prev.includes(next) ? prev : [...prev, next]));
                    setActiveDbWorld(next);
                    setDbSelectedPlayerId("");
                    setDbSelectedPlayerName("");
                    setDbPlayerSelectInput("");
                    setDbWorldMeta((prev) => ({
                      ...prev,
                      [next]: { playerName: undefined },
                    }));
                    setDbWorldSyncReady(false);
                    setDbPlayerText("");
                    setDbVillageText("");
                    setDbAllyText("");
                    setDbConfigText("");
                    setDbUnitInfoText("");
                    setDbReports([]);
                    setDbVillageEntries([]);
                    savedReportIdsRef.current = new Set();
                    savedReportSignaturesRef.current = new Set();
                    savedReportSignatureByIdRef.current = new Map();
                    const playersRes = await handleDbWorldLoadFor(next);
                    const player =
                      (playersRes ? findPlayerInText(playersRes, playerName) : null) ??
                      findDbPlayerByName(playerName);
                    if (!player) {
                      window.alert("Spieler nicht gefunden. Bitte exakten Namen auswählen.");
                      return;
                    }
                    const confirmed = window.confirm(
                      `Account "${player.playerName}" festlegen? Dieser kann später nicht geändert werden.`
                    );
                    if (!confirmed) return;
                    setDbSelectedPlayerId(player.playerId);
                    setDbSelectedPlayerName(player.playerName);
                    setDbWorldPlayerInput("");
                    setDbWorldMeta((prev) => ({
                      ...prev,
                      [next]: { playerName: player.playerName },
                    }));
                    await saveDbWorldMeta(
                      next,
                      undefined,
                      undefined,
                      player.playerId,
                      player.playerName
                    );
                    setDbWorldInput("");
                  }}
                >
                  Hinzufügen
                </button>
              </div>
            </label>
          </div>
          <div className="world-actions">
            <button
              type="button"
              onClick={handleDbWorldLoad}
              disabled={dbWorldLoadState === "loading" || !activeDbWorld}
            >
              {dbWorldLoadState === "loading" ? "Lädt ..." : "Weltdaten laden"}
            </button>
            <button
              type="button"
              className="ghost danger"
              disabled={!activeDbWorld}
              onClick={async () => {
                if (!activeDbWorld) return;
                const worldToDelete = activeDbWorld;
                const first = window.confirm(`Datenbank "${activeDbWorld}" wirklich löschen?`);
                if (!first) return;
                const second = window.confirm(
                  `Wirklich löschen? Alle Daten von "${activeDbWorld}" werden entfernt.`
                );
                if (!second) return;
                try {
                  await fetch(`${DB_API}/api/worlds/${encodeURIComponent(worldToDelete)}`, {
                    method: "DELETE",
                  });
                } catch {
                  // Ignore.
                }
                if (activeDbWorld === worldToDelete) {
                  setDbWorldSyncReady(false);
                  setDbReports([]);
                  setDbVillageEntries([]);
                  setInsertSosText("");
                  setInsertForwardedText("");
                  setInsertUnitsText("");
                  setInsertBuildingsText("");
                  setInsertOutgoingText("");
                  savedReportIdsRef.current = new Set();
                  savedReportSignaturesRef.current = new Set();
                  savedReportSignatureByIdRef.current = new Map();
                }
                setDbWorlds((prev) => prev.filter((world) => world !== worldToDelete));
                setDbWorldMeta((prev) => {
                  const next = { ...prev };
                  delete next[worldToDelete];
                  return next;
                });
                setActiveDbWorld((prev) => {
                  if (prev !== worldToDelete) return prev;
                  const remaining = dbWorlds.filter((world) => world !== worldToDelete);
                  return remaining[0] ?? "";
                });
                if (localStorage.getItem("db_active_world") === worldToDelete) {
                  localStorage.removeItem("db_active_world");
                }
              }}
            >
              Datenbank löschen
            </button>
            {dbSelectedPlayerName && (
              <span className="world-message success">
                Eingeloggt: {dbSelectedPlayerName}
              </span>
            )}
            {activeDbWorld && !dbSelectedPlayerId && (
              <span className="world-message error">
                Bitte Account auswählen, bevor du die Datenbank nutzt.
              </span>
            )}
            {dbWorldLastLoaded && (
              <span className="world-message success">
                Letztes Update: {new Date(dbWorldLastLoaded).toLocaleString("de")}
              </span>
            )}
            {dbWorldLoadMessage && (
              <span className={`world-message ${dbWorldLoadState}`}>{dbWorldLoadMessage}</span>
            )}
          </div>
        </section>

        <nav className="db-nav">
          <button
            type="button"
            className={`tab ${activeDbTab === "insert" ? "active" : ""}`}
            onClick={() => setActiveDbTab("insert")}
            disabled={!dbSelectedPlayerId}
          >
            Insert
          </button>
          <button
            type="button"
            className={`tab ${activeDbTab === "doerfer" ? "active" : ""}`}
            onClick={() => setActiveDbTab("doerfer")}
            disabled={!dbSelectedPlayerId}
          >
            Dörfer
          </button>
          <button
            type="button"
            className={`tab ${activeDbTab === "suche" ? "active" : ""}`}
            onClick={() => setActiveDbTab("suche")}
            disabled={!dbSelectedPlayerId}
          >
            Suche
          </button>
          <button
            type="button"
            className={`tab ${activeDbTab === "berichte" ? "active" : ""}`}
            onClick={() => setActiveDbTab("berichte")}
            disabled={!dbSelectedPlayerId}
          >
            Berichte
          </button>
          <button
            type="button"
            className={`tab ${activeDbTab === "angriffe" ? "active" : ""}`}
            onClick={() => setActiveDbTab("angriffe")}
            disabled={!dbSelectedPlayerId}
          >
            Angriffe
          </button>
          <div ref={toolsMenuRef} className={`tools-dropdown ${activeDbTab === "tools" ? "active" : ""}`}>
            <button
              type="button"
              className="tools-dropdown-trigger"
              disabled={!dbSelectedPlayerId}
              onClick={() => setToolsMenuOpen((prev) => !prev)}
            >
              Tools
              <span className="tools-dropdown-caret">▾</span>
            </button>
            {toolsMenuOpen && dbSelectedPlayerId && (
              <div className="tools-dropdown-menu">
                <button
                  type="button"
                  className={`tools-dropdown-item ${activeDbTool === "angriffsplaner" ? "active" : ""}`}
                  onClick={() => {
                    setActiveDbTool("angriffsplaner");
                    setActiveDbTab("tools");
                    setToolsMenuOpen(false);
                  }}
                >
                  Angriffsplaner
                </button>
                <button
                  type="button"
                  className={`tools-dropdown-item ${activeDbTool === "wb_dsu" ? "active" : ""}`}
                  onClick={() => {
                    setActiveDbTool("wb_dsu");
                    setActiveDbTab("tools");
                    setToolsMenuOpen(false);
                  }}
                >
                  Export plan to DS Ultimate
                </button>
                <button
                  type="button"
                  className={`tools-dropdown-item ${activeDbTool === "fake_generator" ? "active" : ""}`}
                  onClick={() => {
                    setActiveDbTool("fake_generator");
                    setActiveDbTab("tools");
                    setToolsMenuOpen(false);
                  }}
                >
                  Fake Generator
                </button>
                <button
                  type="button"
                  className={`tools-dropdown-item ${activeDbTool === "standdeff_verteiler" ? "active" : ""}`}
                  onClick={() => {
                    setActiveDbTool("standdeff_verteiler");
                    setActiveDbTab("tools");
                    setToolsMenuOpen(false);
                  }}
                >
                  Standdeff-Verteiler
                </button>
              </div>
            )}
          </div>
        </nav>

        {activeDbTab === "tools" && activeDbTool === "angriffsplaner" && (
          <>
            {worldLoadMessage && (
              <div className="world-actions">
                <span className={`world-message ${worldLoadState}`}>{worldLoadMessage}</span>
              </div>
            )}

            <div className="planner-shell">

            {attackPlannerTab === "angreifer" && (
              <>
      <section className="section">
        <div className="planner-tabs-row">
          <div className="planner-tabs">
            <button
              type="button"
              className={`tab ${attackPlannerTab === "angreifer" ? "active" : ""}`}
              onClick={() => setAttackPlannerTab("angreifer")}
            >
              Angreifer
            </button>
            <button
              type="button"
              className={`tab ${attackPlannerTab === "verteidiger" ? "active" : ""}`}
              onClick={() => setAttackPlannerTab("verteidiger")}
            >
              Verteidiger
            </button>
            <button
              type="button"
              className={`tab ${attackPlannerTab === "zeiten" ? "active" : ""}`}
              onClick={() => setAttackPlannerTab("zeiten")}
            >
              Zeiten
            </button>
          </div>
        </div>
        <h2 className="planner-section-title">Angreiferdörfer</h2>
        <div className="planner-attack-controls">
          <div className="planner-inputs">
            <label>
              <span>Einheit</span>
              <select
                value={selectedSlowUnit}
                onChange={(e) => setSelectedSlowUnit(e.target.value)}
              >
                {availableUnits.map((unit) => (
                  <option key={unit} value={unit}>
                    {getUnitLabelDe(unit)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Anzahl</span>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={attackUnitCount <= 0 ? "" : attackUnitCount}
                onChange={(e) => {
                  const digits = e.target.value.replace(/[^\d]/g, "");
                  if (!digits) {
                    setAttackUnitCount(0);
                    return;
                  }
                  setAttackUnitCount(Math.max(1, Number(digits)));
                }}
                onBlur={() => setAttackUnitCount((prev) => (prev <= 0 ? 1 : prev))}
              />
            </label>
          </div>
          <div className="planner-attack-types">
            <label className="radio">
              <input
                type="radio"
                name="attack-type"
                checked={attackCommandType === "attack"}
                onChange={() => setAttackCommandType("attack")}
              />
              <span>Angriff</span>
            </label>
            <label className="radio">
              <input
                type="radio"
                name="attack-type"
                checked={attackCommandType === "fake"}
                onChange={() => setAttackCommandType("fake")}
              />
              <span>Fake</span>
            </label>
            <label className="radio">
              <input
                type="radio"
                name="attack-type"
                checked={attackCommandType === "ag"}
                onChange={() => setAttackCommandType("ag")}
              />
              <span>AG</span>
            </label>
            <label className="radio">
              <input
                type="radio"
                name="attack-type"
                checked={attackCommandType === "wallbreaker"}
                onChange={() => setAttackCommandType("wallbreaker")}
              />
              <span>Wallbrecher</span>
            </label>
          </div>
        </div>
        <div className="mode-row">
          <label>
            <input
              type="radio"
              name="attacker-mode"
              checked={attackerMode === "coords"}
              onChange={() => setAttackerMode("coords")}
            />
            <span>Koordinaten</span>
          </label>
          <label>
            <input
              type="radio"
              name="attacker-mode"
              checked={attackerMode === "players"}
              onChange={() => setAttackerMode("players")}
            />
            <span>Spieler</span>
          </label>
          <label>
            <input
              type="radio"
              name="attacker-mode"
              checked={attackerMode === "tribe"}
              onChange={() => setAttackerMode("tribe")}
            />
            <span>Stamm</span>
          </label>
        </div>

        {attackerMode === "coords" && (
          <>
            <p className="hint">
              Koordinaten mit Leerzeichen trennen, z. B. 500|500 501|502. Du kannst auch die
              Truppenübersicht einfügen – Koordinaten werden automatisch extrahiert.
            </p>
            <textarea
              value={attackersText}
              onChange={(e) => setAttackersText(e.target.value)}
              onPaste={(e) => {
                const pasted = e.clipboardData.getData("text");
                if (!pasted) return;
                e.preventDefault();
                const combined = `${attackersText} ${pasted}`;
                const coords = extractCoords(combined);
                setAttackersText(coords.join(" "));
              }}
              placeholder="500|500 501|502"
            />
            <p className="hint">Eingetragene Dörfer: {attackerCoordRows.length}</p>
          </>
        )}

        {!attackerSelectionStepActive && showAttackerFinalList && (
        <>
        <div className="planner-list-toolbar">
          <label>
            <select
              value={attackerRowsPerPage}
              onChange={(e) => setAttackerRowsPerPage(Number(e.target.value))}
            >
              <option>10</option>
              <option>25</option>
              <option>50</option>
            </select>
            <span>Zeilen anzeigen</span>
          </label>
          <label className="planner-search">
            <span>Suche:</span>
            <input
              type="search"
              placeholder="Suchen..."
              value={attackerSearch}
              onChange={(e) => setAttackerSearch(e.target.value)}
            />
          </label>
          {attackerMode === "players" && (
            <button type="button" className="ghost" onClick={() => setAttackerPlayersStage("input")}>
              Spieler hinzufügen
            </button>
          )}
          {attackerMode === "tribe" && (
            <button type="button" className="ghost" onClick={() => setAttackerTribeStage("tribe")}>
              Stamm hinzufügen
            </button>
          )}
          {showAttackerFinalList && (
            <button
              type="button"
              className="ghost"
              onClick={() => setAttackerListEditMode((prev) => !prev)}
              disabled={attackerRows.length === 0}
            >
              {attackerListEditMode ? "Bearbeitung beenden" : "Liste bearbeiten"}
            </button>
          )}
          {canResetAttackerFlow && (
            <button
              type="button"
              className="ghost danger"
              onClick={() => {
                setAttackerCoordRows([]);
                setAttackerListEditMode(false);
                setAttackerExcludedCoords([]);
                setAttackerExcludedPlayers([]);
                setAttackerActivePlayer("");
                if (attackerMode === "players") {
                  setAttackerPlayers([]);
                  setAttackerPlayerInput("");
                  setAttackerPlayersStage("input");
                } else {
                  setAttackerTribeInput("");
                  setAttackerTribeSelectedPlayers([]);
                  setAttackerTribeStage("tribe");
                }
              }}
            >
              Liste zurücksetzen
            </button>
          )}
        </div>

        {(() => {
          const search = attackerSearch.trim().toLowerCase();
          const filtered = attackerRows.filter((row) => {
            if (!search) return true;
            return (
              row.playerName.toLowerCase().includes(search) ||
              row.villageName.toLowerCase().includes(search) ||
              row.coord.includes(search)
            );
          });
          const paged = filtered.slice(0, attackerRowsPerPage);
          const canEditRows = attackerListEditMode;
          return (
            <div className="planner-list">
              <table className="db-table planner-attackers-table">
                <colgroup>
                  <col className="col-player" />
                  <col className="col-village" />
                  <col className="col-unit" />
                  <col className="col-type" />
                  <col className="col-count" />
                  <col className="col-action" />
                </colgroup>
                <thead>
                  <tr>
                    <th>Spieler</th>
                    <th>Dorf</th>
                    <th>Einheit</th>
                    <th>Typ</th>
                    <th>Anzahl</th>
                    <th>Aktion</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.length === 0 && (
                    <tr>
                      <td colSpan={6} className="table-empty">
                        Keine Einträge vorhanden.
                      </td>
                    </tr>
                  )}
                  {paged.map((row) => (
                    <tr key={row.rowId}>
                      <td>{row.playerName}</td>
                      <td>
                        {row.villageName} ({row.coord})
                      </td>
                      <td>
                        {row.commandType === "ag" ? (
                          AG_UNIT
                        ) : canEditRows ? (
                          <select
                            value={row.unit}
                            onChange={(event) => {
                              const value = event.target.value;
                              setAttackerCoordRows((prev) =>
                                prev.map((item) =>
                                  item.id === row.rowId ? { ...item, unit: value } : item
                                )
                              );
                            }}
                          >
                            {availableUnits.map((unit) => (
                              <option key={unit} value={unit}>
                                {getUnitLabelDe(unit)}
                              </option>
                            ))}
                          </select>
                        ) : (
                          row.unit
                        )}
                      </td>
                      <td>
                        {canEditRows ? (
                          <select
                            value={row.commandType}
                            onChange={(event) => {
                              const value = event.target.value as AttackCommandType;
                              setAttackerCoordRows((prev) =>
                                prev.map((item) =>
                                  item.id === row.rowId
                                    ? {
                                        ...item,
                                        commandType: value,
                                        unit: value === "ag" ? agSlowUnit : item.unit,
                                      }
                                    : item
                                )
                              );
                            }}
                          >
                            <option value="attack">attack</option>
                            <option value="fake">fake</option>
                            <option value="ag">ag</option>
                            <option value="wallbreaker">wallbreaker</option>
                          </select>
                        ) : (
                          row.commandType
                        )}
                      </td>
                      <td>
                        {canEditRows ? (
                          <div className="row-count-editor">
                            <button
                              type="button"
                              className="ghost"
                              onClick={() =>
                                setAttackerCoordRows((prev) =>
                                  prev.map((item) =>
                                    item.id === row.rowId
                                      ? { ...item, count: Math.max(1, item.count - 1) }
                                      : item
                                  )
                                )
                              }
                            >
                              -
                            </button>
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              value={row.count <= 0 ? "" : row.count}
                              onChange={(event) => {
                                const digits = event.target.value.replace(/[^\d]/g, "");
                                const next = digits ? Math.max(1, Number(digits)) : 0;
                                setAttackerCoordRows((prev) =>
                                  prev.map((item) =>
                                    item.id === row.rowId ? { ...item, count: next } : item
                                  )
                                );
                              }}
                              onBlur={() => {
                                setAttackerCoordRows((prev) =>
                                  prev.map((item) =>
                                    item.id === row.rowId
                                      ? { ...item, count: item.count <= 0 ? 1 : item.count }
                                      : item
                                  )
                                );
                              }}
                            />
                            <button
                              type="button"
                              className="ghost"
                              onClick={() =>
                                setAttackerCoordRows((prev) =>
                                  prev.map((item) =>
                                    item.id === row.rowId
                                      ? { ...item, count: Math.max(1, item.count + 1) }
                                      : item
                                  )
                                )
                              }
                            >
                              +
                            </button>
                          </div>
                        ) : (
                          row.count
                        )}
                      </td>
                      <td>
                        {canEditRows ? (
                          <div className="row-actions">
                            <button
                              type="button"
                              className="ghost"
                              onClick={() =>
                                setAttackerCoordRows((prev) => {
                                  const index = prev.findIndex((item) => item.id === row.rowId);
                                  if (index < 0) return prev;
                                  const copy = { ...prev[index], id: createId() };
                                  return [...prev.slice(0, index + 1), copy, ...prev.slice(index + 1)];
                                })
                              }
                            >
                              Duplizieren
                            </button>
                            <button
                              type="button"
                              className="ghost"
                              onClick={() =>
                                setAttackerCoordRows((prev) =>
                                  prev.filter((item) => item.id !== row.rowId)
                                )
                              }
                            >
                              Entfernen
                            </button>
                          </div>
                        ) : (
                          <span className="action-placeholder" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="planner-list-count">
                {paged.length} von {filtered.length} Einträgen
              </div>
            </div>
          );
        })()}
        </>
        )}

        {attackerMode === "players" && (
          <>
            {attackerPlayersStage === "input" && (
              <>
                <div className="inline-input">
                  <input
                    list="player-list"
                    type="text"
                    placeholder="Spielername eingeben"
                    value={attackerPlayerInput}
                    onChange={(e) => setAttackerPlayerInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      e.preventDefault();
                      const next = resolvePlayerNamesByQuery(players, normalizeQueryList(attackerPlayerInput));
                      if (next.length === 0) return;
                      setAttackerPlayers((prev) => uniqueNames([...prev, ...next]));
                      setAttackerPlayerInput("");
                    }}
                  />
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      const next = resolvePlayerNamesByQuery(players, normalizeQueryList(attackerPlayerInput));
                      if (next.length === 0) return;
                      setAttackerPlayers((prev) => uniqueNames([...prev, ...next]));
                      setAttackerPlayerInput("");
                    }}
                  >
                    Hinzufügen
                  </button>
                </div>
                <div className="chip-row">
                  {attackerPlayerList.map((name) => (
                    <button
                      key={name}
                      type="button"
                      className="chip"
                      onClick={() => setAttackerPlayers((prev) => prev.filter((item) => item !== name))}
                    >
                      {name}
                      <span className="chip-remove">×</span>
                    </button>
                  ))}
                </div>
                <div className="result-toolbar">
                  <button
                    type="button"
                    onClick={() => {
                      setAttackerExcludedPlayers([]);
                      setAttackerExcludedCoords([]);
                      setAttackerPlayersStage("review");
                    }}
                    disabled={attackerPlayerList.length === 0}
                  >
                    Weiter
                  </button>
                </div>
              </>
            )}
            {attackerPlayersStage === "review" && (
              <>
                <div className="selector-grid">
                  <div className="selector-panel">
                    <h4>Spieler</h4>
                    <ul>
                      {filteredAttackerPlayers.map((name) => (
                        <li key={name}>
                          <button
                            type="button"
                            className={name === attackerActivePlayer ? "active" : ""}
                            onClick={() => setAttackerActivePlayer(name)}
                          >
                            {name}
                          </button>
                          <button
                            type="button"
                            className="ghost"
                            onClick={() =>
                              setAttackerPlayers((prev) => prev.filter((item) => item !== name))
                            }
                          >
                            Entfernen
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="selector-panel">
                    <h4>Dörfer</h4>
                    <ul>
                      {(villagesByPlayer.get(attackerActivePlayer) ?? [])
                        .filter((v) => !attackerExcludedCoords.includes(v.coord))
                        .map((village) => (
                          <li key={village.coord}>
                            <span>{village.name} ({village.coord})</span>
                            <button
                              type="button"
                              className="ghost"
                              onClick={() =>
                                setAttackerExcludedCoords((prev) => [...prev, village.coord])
                              }
                            >
                              Entfernen
                            </button>
                          </li>
                        ))}
                    </ul>
                  </div>
                </div>
                <div className="result-toolbar">
                  <button type="button" className="ghost" onClick={() => setAttackerPlayersStage("input")}>
                    Zurück
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAttackerCoordRows(attackersByPlayers.map((entry) => buildDefaultAttackerRow(entry)));
                      setAttackerPlayersStage("final");
                    }}
                  >
                    Auswahl bestätigen
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {attackerMode === "tribe" && (
          <>
            {attackerTribeStage === "tribe" && (
              <>
                <div className="inline-input">
                  <input
                    list="ally-list"
                    type="text"
                    placeholder="Stammname oder Tag"
                    value={attackerTribeInput}
                    onChange={(e) => setAttackerTribeInput(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!attackerTribe) return;
                      setAttackerTribeSelectedPlayers(attackerTribePlayers);
                      setAttackerTribeStage("players");
                    }}
                    disabled={!attackerTribe}
                  >
                    Stamm bestätigen
                  </button>
                </div>
                <p className="hint">
                  Ausgewählter Stamm:{" "}
                  {attackerTribe ? `${attackerTribe.allyTag} - ${attackerTribe.allyName}` : "-"}
                </p>
              </>
            )}
            {attackerTribeStage === "players" && (
              <>
                <div className="selector-panel">
                  <h4>Spieler auswählen</h4>
                  <ul>
                    {attackerTribePlayers.map((name) => {
                      const selected = attackerTribeSelectedPlayers.includes(name);
                      return (
                        <li key={name}>
                          <button
                            type="button"
                            className={selected ? "active" : ""}
                            onClick={() =>
                              setAttackerTribeSelectedPlayers((prev) =>
                                selected ? prev.filter((item) => item !== name) : [...prev, name]
                              )
                            }
                          >
                            {name}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
                <div className="result-toolbar">
                  <button type="button" className="ghost" onClick={() => setAttackerTribeStage("tribe")}>
                    Zurück
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAttackerExcludedPlayers([]);
                      setAttackerExcludedCoords([]);
                      setAttackerTribeStage("review");
                    }}
                    disabled={attackerTribeSelectedPlayers.length === 0}
                  >
                    Weiter
                  </button>
                </div>
              </>
            )}
            {attackerTribeStage === "review" && (
              <>
                <div className="selector-grid">
                  <div className="selector-panel">
                    <h4>Spieler</h4>
                    <ul>
                      {filteredAttackerPlayers.map((name) => (
                        <li key={name}>
                          <button
                            type="button"
                            className={name === attackerActivePlayer ? "active" : ""}
                            onClick={() => setAttackerActivePlayer(name)}
                          >
                            {name}
                          </button>
                          <button
                            type="button"
                            className="ghost"
                            onClick={() =>
                              setAttackerTribeSelectedPlayers((prev) =>
                                prev.filter((item) => item !== name)
                              )
                            }
                          >
                            Entfernen
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="selector-panel">
                    <h4>Dörfer</h4>
                    <ul>
                      {(villagesByPlayer.get(attackerActivePlayer) ?? [])
                        .filter((v) => !attackerExcludedCoords.includes(v.coord))
                        .map((village) => (
                          <li key={village.coord}>
                            <span>{village.name} ({village.coord})</span>
                            <button
                              type="button"
                              className="ghost"
                              onClick={() =>
                                setAttackerExcludedCoords((prev) => [...prev, village.coord])
                              }
                            >
                              Entfernen
                            </button>
                          </li>
                        ))}
                    </ul>
                  </div>
                </div>
                <div className="result-toolbar">
                  <button type="button" className="ghost" onClick={() => setAttackerTribeStage("players")}>
                    Zurück
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAttackerCoordRows(attackersByPlayers.map((entry) => buildDefaultAttackerRow(entry)));
                      setAttackerTribeStage("final");
                    }}
                  >
                    Auswahl bestätigen
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {attackerSelectionStepActive && showAttackerFinalList && (
        <>
        <div className="planner-list-toolbar">
          <label>
            <select
              value={attackerRowsPerPage}
              onChange={(e) => setAttackerRowsPerPage(Number(e.target.value))}
            >
              <option>10</option>
              <option>25</option>
              <option>50</option>
            </select>
            <span>Zeilen anzeigen</span>
          </label>
          <label className="planner-search">
            <span>Suche:</span>
            <input
              type="search"
              placeholder="Suchen..."
              value={attackerSearch}
              onChange={(e) => setAttackerSearch(e.target.value)}
            />
          </label>
          {attackerMode === "players" && (
            <button type="button" className="ghost" onClick={() => setAttackerPlayersStage("input")}>
              Spieler hinzufügen
            </button>
          )}
          {attackerMode === "tribe" && (
            <button type="button" className="ghost" onClick={() => setAttackerTribeStage("tribe")}>
              Stamm hinzufügen
            </button>
          )}
          {showAttackerFinalList && (
            <button
              type="button"
              className="ghost"
              onClick={() => setAttackerListEditMode((prev) => !prev)}
              disabled={attackerRows.length === 0}
            >
              {attackerListEditMode ? "Bearbeitung beenden" : "Liste bearbeiten"}
            </button>
          )}
          {canResetAttackerFlow && (
            <button
              type="button"
              className="ghost danger"
              onClick={() => {
                setAttackerCoordRows([]);
                setAttackerListEditMode(false);
                setAttackerExcludedCoords([]);
                setAttackerExcludedPlayers([]);
                setAttackerActivePlayer("");
                if (attackerMode === "players") {
                  setAttackerPlayers([]);
                  setAttackerPlayerInput("");
                  setAttackerPlayersStage("input");
                } else {
                  setAttackerTribeInput("");
                  setAttackerTribeSelectedPlayers([]);
                  setAttackerTribeStage("tribe");
                }
              }}
            >
              Liste zurücksetzen
            </button>
          )}
        </div>

        {(() => {
          const search = attackerSearch.trim().toLowerCase();
          const filtered = attackerRows.filter((row) => {
            if (!search) return true;
            return (
              row.playerName.toLowerCase().includes(search) ||
              row.villageName.toLowerCase().includes(search) ||
              row.coord.includes(search)
            );
          });
          const paged = filtered.slice(0, attackerRowsPerPage);
          const canEditRows = attackerListEditMode;
          return (
            <div className="planner-list">
              <table className="db-table planner-attackers-table">
                <colgroup>
                  <col className="col-player" />
                  <col className="col-village" />
                  <col className="col-unit" />
                  <col className="col-type" />
                  <col className="col-count" />
                  <col className="col-action" />
                </colgroup>
                <thead>
                  <tr>
                    <th>Spieler</th>
                    <th>Dorf</th>
                    <th>Einheit</th>
                    <th>Typ</th>
                    <th>Anzahl</th>
                    <th>Aktion</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.length === 0 && (
                    <tr>
                      <td colSpan={6} className="table-empty">
                        Keine Einträge vorhanden.
                      </td>
                    </tr>
                  )}
                  {paged.map((row) => (
                    <tr key={row.rowId}>
                      <td>{row.playerName}</td>
                      <td>
                        {row.villageName} ({row.coord})
                      </td>
                      <td>
                        {row.commandType === "ag" ? (
                          AG_UNIT
                        ) : canEditRows ? (
                          <select
                            value={row.unit}
                            onChange={(event) => {
                              const value = event.target.value;
                              setAttackerCoordRows((prev) =>
                                prev.map((item) =>
                                  item.id === row.rowId ? { ...item, unit: value } : item
                                )
                              );
                            }}
                          >
                            {availableUnits.map((unit) => (
                              <option key={unit} value={unit}>
                                {getUnitLabelDe(unit)}
                              </option>
                            ))}
                          </select>
                        ) : (
                          row.unit
                        )}
                      </td>
                      <td>
                        {canEditRows ? (
                          <select
                            value={row.commandType}
                            onChange={(event) => {
                              const value = event.target.value as AttackCommandType;
                              setAttackerCoordRows((prev) =>
                                prev.map((item) =>
                                  item.id === row.rowId
                                    ? {
                                        ...item,
                                        commandType: value,
                                        unit: value === "ag" ? agSlowUnit : item.unit,
                                      }
                                    : item
                                )
                              );
                            }}
                          >
                            <option value="attack">attack</option>
                            <option value="fake">fake</option>
                            <option value="ag">ag</option>
                            <option value="wallbreaker">wallbreaker</option>
                          </select>
                        ) : (
                          row.commandType
                        )}
                      </td>
                      <td>
                        {canEditRows ? (
                          <div className="row-count-editor">
                            <button
                              type="button"
                              className="ghost"
                              onClick={() =>
                                setAttackerCoordRows((prev) =>
                                  prev.map((item) =>
                                    item.id === row.rowId
                                      ? { ...item, count: Math.max(1, item.count - 1) }
                                      : item
                                  )
                                )
                              }
                            >
                              -
                            </button>
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              value={row.count <= 0 ? "" : row.count}
                              onChange={(event) => {
                                const digits = event.target.value.replace(/[^\d]/g, "");
                                const next = digits ? Math.max(1, Number(digits)) : 0;
                                setAttackerCoordRows((prev) =>
                                  prev.map((item) =>
                                    item.id === row.rowId ? { ...item, count: next } : item
                                  )
                                );
                              }}
                              onBlur={() => {
                                setAttackerCoordRows((prev) =>
                                  prev.map((item) =>
                                    item.id === row.rowId
                                      ? { ...item, count: item.count <= 0 ? 1 : item.count }
                                      : item
                                  )
                                );
                              }}
                            />
                            <button
                              type="button"
                              className="ghost"
                              onClick={() =>
                                setAttackerCoordRows((prev) =>
                                  prev.map((item) =>
                                    item.id === row.rowId
                                      ? { ...item, count: Math.max(1, item.count + 1) }
                                      : item
                                  )
                                )
                              }
                            >
                              +
                            </button>
                          </div>
                        ) : (
                          row.count
                        )}
                      </td>
                      <td>
                        {canEditRows ? (
                          <div className="row-actions">
                            <button
                              type="button"
                              className="ghost"
                              onClick={() =>
                                setAttackerCoordRows((prev) => {
                                  const index = prev.findIndex((item) => item.id === row.rowId);
                                  if (index < 0) return prev;
                                  const copy = { ...prev[index], id: createId() };
                                  return [...prev.slice(0, index + 1), copy, ...prev.slice(index + 1)];
                                })
                              }
                            >
                              Duplizieren
                            </button>
                            <button
                              type="button"
                              className="ghost"
                              onClick={() =>
                                setAttackerCoordRows((prev) =>
                                  prev.filter((item) => item.id !== row.rowId)
                                )
                              }
                            >
                              Entfernen
                            </button>
                          </div>
                        ) : (
                          <span className="action-placeholder" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="planner-list-count">
                {paged.length} von {filtered.length} Einträgen
              </div>
            </div>
          );
        })()}
        </>
        )}
      </section>

              </>
            )}

            {attackPlannerTab === "verteidiger" && (
              <>
      <section className="section">
        <div className="planner-tabs-row">
          <div className="planner-tabs">
            <button
              type="button"
              className={`tab ${attackPlannerTab === "angreifer" ? "active" : ""}`}
              onClick={() => setAttackPlannerTab("angreifer")}
            >
              Angreifer
            </button>
            <button
              type="button"
              className={`tab ${attackPlannerTab === "verteidiger" ? "active" : ""}`}
              onClick={() => setAttackPlannerTab("verteidiger")}
            >
              Verteidiger
            </button>
            <button
              type="button"
              className={`tab ${attackPlannerTab === "zeiten" ? "active" : ""}`}
              onClick={() => setAttackPlannerTab("zeiten")}
            >
              Zeiten
            </button>
          </div>
        </div>
        <h2 className="planner-section-title">Verteidigerdörfer</h2>
        <div className="planner-attack-controls">
          <div className="planner-inputs">
            <label>
              <span>Anzahl</span>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={targetDefaultCount <= 0 ? "" : targetDefaultCount}
                onChange={(e) => {
                  const digits = e.target.value.replace(/[^\d]/g, "");
                  if (!digits) {
                    setTargetDefaultCount(0);
                    return;
                  }
                  setTargetDefaultCount(Math.max(1, Number(digits)));
                }}
                onBlur={() => setTargetDefaultCount((prev) => (prev <= 0 ? 1 : prev))}
              />
            </label>
            <label>
              <span>Angreifer zuordnen</span>
              <select
                value={targetDefaultAssignedAttacker}
                onChange={(e) => setTargetDefaultAssignedAttacker(e.target.value)}
              >
                <option value="__all__">Alle</option>
                {attackerAssignmentOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="planner-attack-types">
            <label className="radio">
              <input
                type="checkbox"
                checked={targetDefaultAllowAttack}
                onChange={() => setSingleDefaultTargetType("attack")}
              />
              <span>Angriff</span>
            </label>
            <label className="radio">
              <input
                type="checkbox"
                checked={targetDefaultAllowFake}
                onChange={() => setSingleDefaultTargetType("fake")}
              />
              <span>Fake</span>
            </label>
            <label className="radio">
              <input
                type="checkbox"
                checked={targetDefaultAllowAg}
                onChange={() => setSingleDefaultTargetType("ag")}
              />
              <span>AG</span>
            </label>
            <label className="radio">
              <input
                type="checkbox"
                checked={targetDefaultAllowWallbreaker}
                onChange={() => setSingleDefaultTargetType("wallbreaker")}
              />
              <span>Wallbrecher</span>
            </label>
          </div>
        </div>
        <div className="mode-row">
          <label>
            <input
              type="radio"
              name="target-mode"
              checked={targetMode === "coords"}
              onChange={() => setTargetMode("coords")}
            />
            <span>Koordinaten</span>
          </label>
          <label>
            <input
              type="radio"
              name="target-mode"
              checked={targetMode === "players"}
              onChange={() => setTargetMode("players")}
            />
            <span>Spieler</span>
          </label>
          <label>
            <input
              type="radio"
              name="target-mode"
              checked={targetMode === "tribe"}
              onChange={() => setTargetMode("tribe")}
            />
            <span>Stamm</span>
          </label>
        </div>

        {targetMode === "coords" && (
          <>
            <p className="hint">
              Koordinaten mit Leerzeichen trennen, z. B. 510|490 515|488. Du kannst auch die
              Truppenübersicht einfügen – Koordinaten werden automatisch extrahiert.
            </p>
            <textarea
              value={targetsText}
              onChange={(e) => setTargetsText(e.target.value)}
              onPaste={(e) => {
                const pasted = e.clipboardData.getData("text");
                if (!pasted) return;
                e.preventDefault();
                const combined = `${targetsText} ${pasted}`;
                const coords = extractCoords(combined);
                setTargetsText(coords.join(" "));
              }}
              placeholder="510|490 515|488"
            />
            <p className="hint">Eingetragene Dörfer: {targetCoordRows.length}</p>
          </>
        )}

        {targetMode === "players" && (
          <>
            {targetPlayersStage === "input" && (
              <>
                <div className="inline-input">
                  <input
                    list="player-list"
                    type="text"
                    placeholder="Spielername eingeben"
                    value={targetPlayerInput}
                    onChange={(e) => setTargetPlayerInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      e.preventDefault();
                      const next = resolvePlayerNamesByQuery(players, normalizeQueryList(targetPlayerInput));
                      if (next.length === 0) return;
                      setTargetPlayers((prev) => uniqueNames([...prev, ...next]));
                      setTargetPlayerInput("");
                    }}
                  />
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      const next = resolvePlayerNamesByQuery(players, normalizeQueryList(targetPlayerInput));
                      if (next.length === 0) return;
                      setTargetPlayers((prev) => uniqueNames([...prev, ...next]));
                      setTargetPlayerInput("");
                    }}
                  >
                    Hinzufügen
                  </button>
                </div>
                <div className="chip-row">
                  {targetPlayerList.map((name) => (
                    <button
                      key={name}
                      type="button"
                      className="chip"
                      onClick={() => setTargetPlayers((prev) => prev.filter((item) => item !== name))}
                    >
                      {name}
                      <span className="chip-remove">×</span>
                    </button>
                  ))}
                </div>
                <div className="result-toolbar">
                  <button
                    type="button"
                    onClick={() => {
                      setTargetExcludedPlayers([]);
                      setTargetExcludedCoords([]);
                      setTargetPlayersStage("review");
                    }}
                    disabled={targetPlayerList.length === 0}
                  >
                    Weiter
                  </button>
                </div>
              </>
            )}
            {targetPlayersStage === "review" && (
              <>
                <div className="selector-grid">
                  <div className="selector-panel">
                    <h4>Spieler</h4>
                    <ul>
                      {filteredTargetPlayers.map((name) => (
                        <li key={name}>
                          <button
                            type="button"
                            className={name === targetActivePlayer ? "active" : ""}
                            onClick={() => setTargetActivePlayer(name)}
                          >
                            {name}
                          </button>
                          <button
                            type="button"
                            className="ghost"
                            onClick={() => setTargetPlayers((prev) => prev.filter((item) => item !== name))}
                          >
                            Entfernen
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="selector-panel">
                    <h4>Dörfer</h4>
                    <ul>
                      {(villagesByPlayer.get(targetActivePlayer) ?? [])
                        .filter((v) => !targetExcludedCoords.includes(v.coord))
                        .map((village) => (
                          <li key={village.coord}>
                            <span>{village.name} ({village.coord})</span>
                            <button
                              type="button"
                              className="ghost"
                              onClick={() => setTargetExcludedCoords((prev) => [...prev, village.coord])}
                            >
                              Entfernen
                            </button>
                          </li>
                        ))}
                    </ul>
                  </div>
                </div>
                <div className="result-toolbar">
                  <button type="button" className="ghost" onClick={() => setTargetPlayersStage("input")}>
                    Zurück
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTargetCoordRows(targetsByPlayers.map((entry) => buildDefaultTargetRow(entry)));
                      setTargetPlayersStage("final");
                    }}
                  >
                    Auswahl bestätigen
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {targetMode === "tribe" && (
          <>
            {targetTribeStage === "tribe" && (
              <>
                <div className="inline-input">
                  <input
                    list="ally-list"
                    type="text"
                    placeholder="Stammname oder Tag"
                    value={targetTribeInput}
                    onChange={(e) => setTargetTribeInput(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!targetTribe) return;
                      setTargetTribeSelectedPlayers(targetTribePlayers);
                      setTargetTribeStage("players");
                    }}
                    disabled={!targetTribe}
                  >
                    Stamm bestätigen
                  </button>
                </div>
                <p className="hint">
                  Ausgewählter Stamm:{" "}
                  {targetTribe ? `${targetTribe.allyTag} - ${targetTribe.allyName}` : "-"}
                </p>
              </>
            )}
            {targetTribeStage === "players" && (
              <>
                <div className="selector-panel">
                  <h4>Spieler auswählen</h4>
                  <ul>
                    {targetTribePlayers.map((name) => {
                      const selected = targetTribeSelectedPlayers.includes(name);
                      return (
                        <li key={name}>
                          <button
                            type="button"
                            className={selected ? "active" : ""}
                            onClick={() =>
                              setTargetTribeSelectedPlayers((prev) =>
                                selected ? prev.filter((item) => item !== name) : [...prev, name]
                              )
                            }
                          >
                            {name}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
                <div className="result-toolbar">
                  <button type="button" className="ghost" onClick={() => setTargetTribeStage("tribe")}>
                    Zurück
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTargetExcludedPlayers([]);
                      setTargetExcludedCoords([]);
                      setTargetTribeStage("review");
                    }}
                    disabled={targetTribeSelectedPlayers.length === 0}
                  >
                    Weiter
                  </button>
                </div>
              </>
            )}
            {targetTribeStage === "review" && (
              <>
                <div className="selector-grid">
                  <div className="selector-panel">
                    <h4>Spieler</h4>
                    <ul>
                      {filteredTargetPlayers.map((name) => (
                        <li key={name}>
                          <button
                            type="button"
                            className={name === targetActivePlayer ? "active" : ""}
                            onClick={() => setTargetActivePlayer(name)}
                          >
                            {name}
                          </button>
                          <button
                            type="button"
                            className="ghost"
                            onClick={() =>
                              setTargetTribeSelectedPlayers((prev) =>
                                prev.filter((item) => item !== name)
                              )
                            }
                          >
                            Entfernen
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="selector-panel">
                    <h4>Dörfer</h4>
                    <ul>
                      {(villagesByPlayer.get(targetActivePlayer) ?? [])
                        .filter((v) => !targetExcludedCoords.includes(v.coord))
                        .map((village) => (
                          <li key={village.coord}>
                            <span>{village.name} ({village.coord})</span>
                            <button
                              type="button"
                              className="ghost"
                              onClick={() => setTargetExcludedCoords((prev) => [...prev, village.coord])}
                            >
                              Entfernen
                            </button>
                          </li>
                        ))}
                    </ul>
                  </div>
                </div>
                <div className="result-toolbar">
                  <button type="button" className="ghost" onClick={() => setTargetTribeStage("players")}>
                    Zurück
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTargetCoordRows(targetsByPlayers.map((entry) => buildDefaultTargetRow(entry)));
                      setTargetTribeStage("final");
                    }}
                  >
                    Auswahl bestätigen
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {showTargetFinalList && (
          <>
            <div className="planner-list-toolbar">
              <label>
                <select
                  value={targetRowsPerPage}
                  onChange={(e) => setTargetRowsPerPage(Number(e.target.value))}
                >
                  <option>10</option>
                  <option>25</option>
                  <option>50</option>
                </select>
                <span>Zeilen anzeigen</span>
              </label>
              <label className="planner-search">
                <span>Suche:</span>
                <input
                  type="search"
                  placeholder="Suchen..."
                  value={targetSearch}
                  onChange={(e) => setTargetSearch(e.target.value)}
                />
              </label>
              {targetMode === "players" && (
                <button type="button" className="ghost" onClick={() => setTargetPlayersStage("input")}>
                  Spieler hinzufügen
                </button>
              )}
              {targetMode === "tribe" && (
                <button type="button" className="ghost" onClick={() => setTargetTribeStage("tribe")}>
                  Stamm hinzufügen
                </button>
              )}
              <button
                type="button"
                className="ghost"
                onClick={() => setTargetListEditMode((prev) => !prev)}
                disabled={targetRows.length === 0}
              >
                {targetListEditMode ? "Bearbeitung beenden" : "Liste bearbeiten"}
              </button>
              {canResetTargetFlow && (
                <button
                  type="button"
                  className="ghost danger"
                  onClick={() => {
                    setTargetCoordRows([]);
                    setTargetListEditMode(false);
                    setTargetExcludedCoords([]);
                    setTargetExcludedPlayers([]);
                    setTargetActivePlayer("");
                    if (targetMode === "coords") {
                      setTargetsText("");
                    } else if (targetMode === "players") {
                      setTargetPlayers([]);
                      setTargetPlayerInput("");
                      setTargetPlayersStage("input");
                    } else {
                      setTargetTribeInput("");
                      setTargetTribeSelectedPlayers([]);
                      setTargetTribeStage("tribe");
                    }
                  }}
                >
                  Liste zurücksetzen
                </button>
              )}
            </div>
            {(() => {
              const search = targetSearch.trim().toLowerCase();
              const filtered = targetRows.filter((row) => {
                if (!search) return true;
                return (
                  row.playerName.toLowerCase().includes(search) ||
                  row.villageName.toLowerCase().includes(search) ||
                  row.coord.includes(search)
                );
              });
              const paged = filtered.slice(0, targetRowsPerPage);
              const canEditRows = targetListEditMode;
              return (
                <div className="planner-list">
                  <table className="db-table planner-defenders-table">
                    <colgroup>
                      <col className="col-player" />
                      <col className="col-village" />
                      <col className="col-type" />
                      <col className="col-count" />
                      <col className="col-attacker" />
                      <col className="col-action" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>Spieler</th>
                        <th>Dorf</th>
                        <th>Typ</th>
                        <th>Anzahl</th>
                        <th>Angreifer</th>
                        <th>Aktion</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paged.length === 0 && (
                        <tr>
                          <td colSpan={6} className="table-empty">
                            Keine Einträge vorhanden.
                          </td>
                        </tr>
                      )}
                      {paged.map((row) => (
                        <tr key={row.rowId}>
                          <td>{row.playerName}</td>
                          <td>
                            {row.villageName} ({row.coord})
                          </td>
                          <td>
                            {canEditRows ? (
                              <select
                                value={row.targetType}
                                onChange={(e) => {
                                  const next = e.target.value as DefenderTargetType;
                                  setTargetCoordRows((prev) =>
                                    prev.map((item) =>
                                      item.id === row.rowId ? { ...item, targetType: next } : item
                                    )
                                  );
                                }}
                              >
                                {editableTargetTypeOptions.map((type) => (
                                  <option key={type} value={type}>
                                    {type}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              row.targetType
                            )}
                          </td>
                          <td>
                            {canEditRows ? (
                              <div className="row-count-editor">
                                <button
                                  type="button"
                                  className="ghost"
                                  onClick={() =>
                                    setTargetCoordRows((prev) =>
                                      prev.map((item) =>
                                        item.id === row.rowId
                                          ? { ...item, count: Math.max(1, item.count - 1) }
                                          : item
                                      )
                                    )
                                  }
                                >
                                  -
                                </button>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  pattern="[0-9]*"
                                  value={row.count <= 0 ? "" : row.count}
                                  onChange={(event) => {
                                    const digits = event.target.value.replace(/[^\d]/g, "");
                                    const next = digits ? Math.max(1, Number(digits)) : 0;
                                    setTargetCoordRows((prev) =>
                                      prev.map((item) =>
                                        item.id === row.rowId ? { ...item, count: next } : item
                                      )
                                    );
                                  }}
                                  onBlur={() => {
                                    setTargetCoordRows((prev) =>
                                      prev.map((item) =>
                                        item.id === row.rowId
                                          ? { ...item, count: item.count <= 0 ? 1 : item.count }
                                          : item
                                      )
                                    );
                                  }}
                                />
                                <button
                                  type="button"
                                  className="ghost"
                                  onClick={() =>
                                    setTargetCoordRows((prev) =>
                                      prev.map((item) =>
                                        item.id === row.rowId
                                          ? { ...item, count: Math.max(1, item.count + 1) }
                                          : item
                                      )
                                    )
                                  }
                                >
                                  +
                                </button>
                              </div>
                            ) : (
                              row.count
                            )}
                          </td>
                          <td>
                            {canEditRows ? (
                              <select
                                value={row.assignedAttacker}
                                onChange={(e) => {
                                  const next = e.target.value || "__all__";
                                  setTargetCoordRows((prev) =>
                                    prev.map((item) =>
                                      item.id === row.rowId
                                        ? { ...item, assignedAttacker: next }
                                        : item
                                    )
                                  );
                                }}
                              >
                                <option value="__all__">Alle</option>
                                {attackerAssignmentOptions.map((name) => (
                                  <option key={name} value={name}>
                                    {name}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              row.assignedAttacker === "__all__"
                                ? "Alle"
                                : row.assignedAttacker
                            )}
                          </td>
                          <td>
                            {canEditRows ? (
                              <div className="row-actions">
                                <button
                                  type="button"
                                  className="ghost"
                                  onClick={() =>
                                    setTargetCoordRows((prev) => {
                                      const index = prev.findIndex((item) => item.id === row.rowId);
                                      if (index < 0) return prev;
                                      const copy = { ...prev[index], id: createId() };
                                      return [...prev.slice(0, index + 1), copy, ...prev.slice(index + 1)];
                                    })
                                  }
                                >
                                  Duplizieren
                                </button>
                                <button
                                  type="button"
                                  className="ghost"
                                  onClick={() =>
                                    setTargetCoordRows((prev) =>
                                      prev.filter((item) => item.id !== row.rowId)
                                    )
                                  }
                                >
                                  Entfernen
                                </button>
                              </div>
                            ) : (
                              <span className="action-placeholder" />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="planner-list-count">
                    {paged.length} von {filtered.length} Einträgen
                  </div>
                </div>
              );
            })()}
          </>
        )}
      </section>
              </>
            )}

            {attackPlannerTab === "zeiten" && (
              <>
                <section className="section">
                  <div className="planner-tabs-row">
                    <div className="planner-tabs">
                      <button
                        type="button"
                        className={`tab ${attackPlannerTab === "angreifer" ? "active" : ""}`}
                        onClick={() => setAttackPlannerTab("angreifer")}
                      >
                        Angreifer
                      </button>
                      <button
                        type="button"
                        className={`tab ${attackPlannerTab === "verteidiger" ? "active" : ""}`}
                        onClick={() => setAttackPlannerTab("verteidiger")}
                      >
                        Verteidiger
                      </button>
                      <button
                        type="button"
                        className={`tab ${attackPlannerTab === "zeiten" ? "active" : ""}`}
                        onClick={() => setAttackPlannerTab("zeiten")}
                      >
                        Zeiten
                      </button>
                    </div>
                  </div>
                  <div className="zeiten-layout">
                    <div className="zeiten-headline">
                      <h2 className="planner-section-title">Zeitfenster</h2>
                      <span className="zeiten-help">?</span>
                    </div>

                    <div className="zeiten-input-grid">
                      <label>
                        <span>Datum</span>
                        <input
                          type="date"
                          value={timeInputDate}
                          onChange={(e) => setTimeInputDate(e.target.value)}
                        />
                      </label>
                      <label>
                        <span>Von</span>
                        <input
                          type="time"
                          step={1}
                          value={timeInputFrom}
                          onChange={(e) => setTimeInputFrom(e.target.value)}
                        />
                      </label>
                      <label>
                        <span>Bis</span>
                        <input
                          type="time"
                          step={1}
                          value={timeInputTo}
                          onChange={(e) => setTimeInputTo(e.target.value)}
                        />
                      </label>
                      <label className="zeiten-player-select">
                        <span>Spieler</span>
                        <select
                          value={timeInputPlayer}
                          onChange={(e) => setTimeInputPlayer(e.target.value)}
                        >
                          <option value="__all__">Alle</option>
                          {attackerAssignmentOptions.map((name) => (
                            <option key={name} value={name}>
                              {name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <div className="zeiten-type-row">
                      {(["all", "attack", "fake", "ag", "wallbreaker"] as TimeTypeFilter[]).map(
                        (type) => (
                          <label key={type} className="radio">
                            <input
                              type="radio"
                              name="zeiten-type"
                              checked={timeInputType === type}
                              onChange={() => setTimeInputType(type)}
                            />
                            <span>{timeTypeLabelMap[type]}</span>
                          </label>
                        )
                      )}
                    </div>

                    <div className="zeiten-actions">
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => {
                          if (!timeInputDate || !timeInputFrom || !timeInputTo) return;
                          setSendTimeEntries((prev) => [
                            ...prev,
                            {
                              id: createId(),
                              date: timeInputDate,
                              from: timeInputFrom,
                              to: timeInputTo,
                              player: timeInputPlayer,
                              type: timeInputType,
                            },
                          ]);
                        }}
                      >
                        Abschickzeit hinzufügen
                      </button>
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => {
                          if (!timeInputDate || !timeInputFrom || !timeInputTo) return;
                          const nextEntry: PlannerTimeEntry = {
                            id: createId(),
                            date: timeInputDate,
                            from: timeInputFrom,
                            to: timeInputTo,
                            player: timeInputPlayer,
                            type: timeInputType,
                          };
                          setArrivalTimeEntries((prev) => [...prev, nextEntry]);
                          setArrivalWindows((prev) => [
                            ...prev,
                            {
                              id: nextEntry.id,
                              start: `${nextEntry.date}T${nextEntry.from}`,
                              end: `${nextEntry.date}T${nextEntry.to}`,
                            },
                          ]);
                        }}
                      >
                        Ankunftszeit hinzufügen
                      </button>
                    </div>

                    <div className="zeiten-table-block">
                      <h3>Abschickzeiten</h3>
                      <div className="planner-list">
                        <table className="db-table zeiten-table">
                          <thead>
                            <tr>
                              <th>Datum</th>
                              <th>Spieler</th>
                              <th>Von</th>
                              <th>Bis</th>
                              <th>Typ</th>
                              <th>Löschen</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sendTimeEntries.length === 0 && (
                              <tr>
                                <td colSpan={6} className="table-empty" />
                              </tr>
                            )}
                            {sendTimeEntries.map((row) => (
                              <tr key={row.id}>
                                <td>
                                  {row.date
                                    ? row.date.split("-").reverse().join(".")
                                    : ""}
                                </td>
                                <td>{row.player === "__all__" ? "Alle" : row.player}</td>
                                <td>{row.from}</td>
                                <td>{row.to}</td>
                                <td>{timeTypeLabelMap[row.type]}</td>
                                <td>
                                  <button
                                    type="button"
                                    className="ghost"
                                    onClick={() =>
                                      setSendTimeEntries((prev) =>
                                        prev.filter((item) => item.id !== row.id)
                                      )
                                    }
                                  >
                                    Löschen
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="zeiten-table-block">
                      <h3>Ankunftszeiten</h3>
                      <div className="planner-list">
                        <table className="db-table zeiten-table">
                          <thead>
                            <tr>
                              <th>Datum</th>
                              <th>Spieler</th>
                              <th>Von</th>
                              <th>Bis</th>
                              <th>Typ</th>
                              <th>Löschen</th>
                            </tr>
                          </thead>
                          <tbody>
                            {arrivalTimeEntries.length === 0 && (
                              <tr>
                                <td colSpan={6} className="table-empty" />
                              </tr>
                            )}
                            {arrivalTimeEntries.map((row) => (
                              <tr key={row.id}>
                                <td>
                                  {row.date
                                    ? row.date.split("-").reverse().join(".")
                                    : ""}
                                </td>
                                <td>{row.player === "__all__" ? "Alle" : row.player}</td>
                                <td>{row.from}</td>
                                <td>{row.to}</td>
                                <td>{timeTypeLabelMap[row.type]}</td>
                                <td>
                                  <button
                                    type="button"
                                    className="ghost"
                                    onClick={() => {
                                      setArrivalTimeEntries((prev) =>
                                        prev.filter((item) => item.id !== row.id)
                                      );
                                      setArrivalWindows((prev) =>
                                        prev.filter((item) => item.id !== row.id)
                                      );
                                    }}
                                  >
                                    Löschen
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="zeiten-submit">
                      <button type="button" onClick={handleGeneratePlan}>
                        Plan erstellen
                      </button>
                    </div>

                    {generatedPlans && (
                      <div className="zeiten-table-block">
                        <h3>Angriffsplan</h3>
                        {planMetrics && (
                          <>
                            <div className="result-meta">
                              Bedarf gesamt: {planMetrics.demandTotal} | Bedarf erfüllt: {planMetrics.demandFulfilled} | Bedarf offen: {planMetrics.demandOpen}
                            </div>
                            <div className="result-meta">
                              Angreifer-Slots gesamt: {planMetrics.slotsTotal} | Slots verwendet: {planMetrics.slotsUsed} | Slots ungenutzt: {planMetrics.slotsUnused}
                            </div>
                            {planTimingHint && (
                              <div className="panel warning">
                                <strong>{planTimingHint}</strong>
                                {planTimingDetails.length > 0 && (
                                  <ul>
                                    {planTimingDetails.map((line) => (
                                      <li key={line}>{line}</li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            )}
                            {(planMetrics.unmetTypeMismatch > 0 ||
                              planMetrics.unmetAttackerMismatch > 0 ||
                              planMetrics.unmetTimeMismatch > 0 ||
                              planMetrics.unmetNoSlots > 0) && (
                              <div className="panel warning">
                                <h3>Nicht erfüllt</h3>
                                <ul>
                                  <li>Kein passender Typ: {planMetrics.unmetTypeMismatch}</li>
                                  <li>Kein erlaubter Angreifer-Spieler: {planMetrics.unmetAttackerMismatch}</li>
                                  <li>Kein passendes Zeitfenster: {planMetrics.unmetTimeMismatch}</li>
                                  <li>Keine Slots mehr verfügbar: {planMetrics.unmetNoSlots}</li>
                                </ul>
                              </div>
                            )}
                          </>
                        )}
                        <div className="table-wrapper">
                          <table className="db-table zeiten-plan-table">
                            <thead>
                              <tr>
                                <th>Typ</th>
                                <th>Einheit</th>
                                <th>Angreifer</th>
                                <th>Verteidiger</th>
                                <th>Abschickzeit</th>
                                <th>Abschicken in</th>
                                <th>Ankunftzeit</th>
                                <th>Versammlungsplatz</th>
                              </tr>
                            </thead>
                            <tbody>
                              {sortedRows.length === 0 && (
                                <tr>
                                  <td colSpan={8} className="table-empty">
                                    Keine berechneten Angriffe vorhanden.
                                  </td>
                                </tr>
                              )}
                              {sortedRows.map((row, index) => (
                                <tr key={`${row.attackerCoord}-${row.targetCoord}-${index}`}>
                                  <td>
                                    {row.commandType ?? "-"}
                                  </td>
                                  <td>{row.unit ? getUnitLabelDe(row.unit) : "-"}</td>
                                  <td>
                                    {(row.attacker?.playerName ?? "Unbekannt")} - {(row.attacker?.villageName ?? "Unbekannt")} ({row.attackerCoord})
                                  </td>
                                  <td>
                                    {(row.target?.playerName ?? "Unbekannt")} - {(row.target?.villageName ?? "Unbekannt")} ({row.targetCoord})
                                  </td>
                                  <td>{renderDateTimeTwoLine(formatDate(row.sendFrom, tzMode))}</td>
                                  <td>{formatSendCountdown(row.sendFrom, plannerNow)}</td>
                                  <td>{renderDateTimeTwoLine(formatDate(row.arrivalFrom, tzMode))}</td>
                                  <td>{renderAttackLink(row, worldBaseUrl, worldCode)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="panel">
                          <h3>DS Ultimate Export</h3>
                          <textarea
                            readOnly
                            value={sortedRows.map((row) => buildDsUltimateLine(row)).join("\n")}
                            placeholder="Kein Export verfügbar."
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              </>
            )}
            </div>
          </>
        )}

        {activeDbTab === "tools" && activeDbTool === "wb_dsu" && (
          <section className="section wb-dsu-page">
            <h2>DS-Ultimate: Workbench übertragen</h2>

            <label className="wb-dsu-label">
              <span>Workbench-Befehle</span>
              <textarea
                className="wb-dsu-textarea"
                placeholder="Workbench-Befehle einfügen"
                value={wbDsuCommands}
                onChange={(e) => setWbDsuCommands(e.target.value)}
              />
            </label>

            <label className="checkbox">
              <input
                type="checkbox"
                checked={wbDsuUvPlan}
                onChange={(e) => setWbDsuUvPlan(e.target.checked)}
              />
              <span>Als UV-Plan erstellen</span>
            </label>

            <label className="checkbox">
              <input
                type="checkbox"
                checked={wbDsuGroupByPlayer}
                onChange={(e) => setWbDsuGroupByPlayer(e.target.checked)}
              />
              <span>Nach Spieler gruppieren</span>
            </label>

            <div className="wb-dsu-actions">
              <button
                type="button"
                onClick={async () => {
                  const hasPlannerRows = sortedRows.length > 0;
                  const hasWorkbenchCommands = wbDsuCommands.trim().length > 0;
                  if (!hasPlannerRows && !hasWorkbenchCommands) {
                    setWbDsuTransferState("error");
                    setWbDsuTransferMessage("Please fill Workbench commands or generate a planner result first.");
                    setWbDsuGeneratedLinks([]);
                    return;
                  }
                  const plannerCommands = hasPlannerRows
                    ? sortedRows.map((row) => buildDsUltimateLine(row)).join("\n")
                    : "";
                  const totalCommands = hasWorkbenchCommands
                    ? wbDsuCommands.trim()
                    : plannerCommands.trim();
                  if (!totalCommands) {
                    setWbDsuTransferState("error");
                    setWbDsuTransferMessage("No commands available.");
                    setWbDsuGeneratedLinks([]);
                    return;
                  }
                  const worldCandidate = (activeDbWorld || worldCode || "").trim().toLowerCase();
                  if (!/^([a-z]+)(\d+)$/.test(worldCandidate)) {
                    setWbDsuTransferState("error");
                    setWbDsuTransferMessage("World code missing. Select a world like de246 first.");
                    setWbDsuGeneratedLinks([]);
                    return;
                  }
                  try {
                    type DsuRowPayload = {
                      attackerCoord: string;
                      targetCoord: string;
                      arrivalAt: string;
                      unit: string;
                      commandType: "attack" | "fake" | "ag" | "wallbreaker";
                    };

                    const createLink = async (
                      label: string,
                      commands: string,
                      rowsPayload?: DsuRowPayload[]
                    ) => {
                      const response = await fetch(`${DB_API}/api/dsu/create_plan_from_wb`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          worldCode: worldCandidate,
                          commands,
                          rows: rowsPayload,
                          uvPlan: wbDsuUvPlan,
                          groupByPlayer: false,
                        }),
                      });
                      const body = await response.json().catch(() => ({}));
                      if (!response.ok || !body?.ok || !body?.editUrl) {
                        if (response.status === 404) {
                          throw new Error(
                            "Endpoint not found. Please restart DB server with `npm run db`."
                          );
                        }
                        throw new Error(body?.error || `Transfer failed for ${label}.`);
                      }
                      return { label, url: String(body.editUrl) };
                    };

                    const links: { label: string; url: string }[] = [];
                    const totalRowsPayload: DsuRowPayload[] =
                      hasWorkbenchCommands
                        ? parseDsUltimateCommandsToRows(totalCommands, villageIdToCoord)
                        : sortedRows.map((row) => ({
                            attackerCoord: row.attackerCoord,
                            targetCoord: row.targetCoord,
                            arrivalAt: row.arrivalFrom.toISOString(),
                            unit: (row.unit ?? "ram").toLowerCase(),
                            commandType: (row.commandType ?? "attack") as
                              | "attack"
                              | "fake"
                              | "ag"
                              | "wallbreaker",
                          }));
                    if (hasWorkbenchCommands && totalRowsPayload.length === 0) {
                      throw new Error(
                        "Could not map WB commands to villages. Load world data first or use planner-generated plan rows."
                      );
                    }
                    links.push(await createLink("Total plan", totalCommands, totalRowsPayload));

                    if (wbDsuGroupByPlayer && totalRowsPayload.length > 0) {
                      const byPlayer = new Map<string, DsuRowPayload[]>();
                      if (hasPlannerRows) {
                        for (let index = 0; index < sortedRows.length; index += 1) {
                          const plannerRow = sortedRows[index];
                          const payloadRow = totalRowsPayload[index];
                          if (!payloadRow) continue;
                          const player = (plannerRow.attacker?.playerName ?? "Unknown").trim() || "Unknown";
                          if (!byPlayer.has(player)) byPlayer.set(player, []);
                          byPlayer.get(player)!.push(payloadRow);
                        }
                      } else {
                        for (const payloadRow of totalRowsPayload) {
                          const village = villages.get(payloadRow.attackerCoord);
                          const player = (village?.playerName ?? "Unknown").trim() || "Unknown";
                          if (!byPlayer.has(player)) byPlayer.set(player, []);
                          byPlayer.get(player)!.push(payloadRow);
                        }
                      }
                      const playerNames = Array.from(byPlayer.keys()).sort((a, b) =>
                        a.localeCompare(b, "de")
                      );
                      for (const playerName of playerNames) {
                        const playerRowsPayload = byPlayer.get(playerName) ?? [];
                        if (playerRowsPayload.length === 0) continue;
                        const playerCommands = hasPlannerRows
                          ? sortedRows
                              .filter((row) => ((row.attacker?.playerName ?? "Unknown").trim() || "Unknown") === playerName)
                              .map((row) => buildDsUltimateLine(row))
                              .join("\n")
                          : "";
                        links.push(await createLink(playerName, playerCommands, playerRowsPayload));
                      }
                    }

                    setWbDsuTransferState("success");
                    setWbDsuTransferMessage("Links generated successfully.");
                    setWbDsuGeneratedLinks(links);
                  } catch (error) {
                    setWbDsuTransferState("error");
                    setWbDsuTransferMessage(
                      error instanceof Error ? error.message : "Transfer failed."
                    );
                    setWbDsuGeneratedLinks([]);
                  }
                }}
              >
                Generate DS-Ultimate Links
              </button>
            </div>

            {wbDsuTransferState === "success" && (
              <div className="panel wb-dsu-success">
                <strong>{wbDsuTransferMessage || "Links generated."}</strong>
              </div>
            )}
            {wbDsuTransferState === "error" && (
              <div className="panel error">
                <strong>{wbDsuTransferMessage || "Transfer failed."}</strong>
              </div>
            )}

            {wbDsuGeneratedLinks.length > 0 && (
              <div className="wb-dsu-links-list">
                {wbDsuGeneratedLinks.map((item) => (
                  <div className="wb-dsu-link-row" key={`${item.label}-${item.url}`}>
                    <span>{item.label}</span>
                    <input type="text" value={item.url} readOnly />
                    <div className="wb-dsu-link-actions">
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => void navigator.clipboard.writeText(item.url)}
                      >
                        Copy
                      </button>
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => window.open(item.url, "_blank", "noopener,noreferrer")}
                      >
                        Open
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {activeDbTab === "tools" && activeDbTool === "fake_generator" && (
          <section className="section fake-generator-page">
            <h2>Fake Generator</h2>

            <div className="fake-generator-grid fake-generator-grid-3">
              <label>
                <span>Group</span>
                <select
                  value={fgGroupFilter}
                  onChange={(e) => setFgGroupFilter(e.target.value as FakeGroupFilter)}
                >
                  <option value="all">All</option>
                  <option value="off">Off</option>
                  <option value="deff">Deff</option>
                  <option value="fake_dorf">Fake-Dorf</option>
                  <option value="unknown">Unknown</option>
                </select>
              </label>
              <label>
                <span>Attacks per button</span>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={fgAttacksPerButton <= 0 ? "" : String(fgAttacksPerButton)}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/[^\d]/g, "");
                    if (!digits) {
                      setFgAttacksPerButton(0);
                      return;
                    }
                    setFgAttacksPerButton(Math.max(1, Number(digits)));
                  }}
                  onBlur={() => setFgAttacksPerButton((prev) => (prev <= 0 ? 1 : prev))}
                />
              </label>
              <label>
                <span>Delay opening tabs (ms)</span>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={fgOpenDelay <= 0 ? "" : String(fgOpenDelay)}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/[^\d]/g, "");
                    if (!digits) {
                      setFgOpenDelay(0);
                      return;
                    }
                    setFgOpenDelay(Number(digits));
                  }}
                  onBlur={() => setFgOpenDelay((prev) => (prev < 200 ? 200 : prev))}
                />
              </label>
            </div>

            <div className="fake-generator-grid fake-generator-grid-2">
              <label>
                <span>Unit selection</span>
                <select
                  value={fgUnitSelectionType}
                  onChange={(e) => setFgUnitSelectionType(e.target.value as FakeUnitSelectionType)}
                >
                  <option value="dynamic">Dynamic</option>
                  <option value="manual">Manual</option>
                </select>
              </label>
              <label>
                <span>Max attacks per village (0 = unlimited)</span>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={fgMaxAttacksPerVillage <= 0 ? "" : String(fgMaxAttacksPerVillage)}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/[^\d]/g, "");
                    if (!digits) {
                      setFgMaxAttacksPerVillage(0);
                      return;
                    }
                    setFgMaxAttacksPerVillage(Math.max(0, Number(digits)));
                  }}
                />
              </label>
            </div>

            <div className="fake-generator-grid fake-generator-grid-3">
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={fgMixOffEnabled}
                  onChange={(e) => setFgMixOffEnabled(e.target.checked)}
                />
                <span>Mix full off attacks into fakes</span>
              </label>
              <label>
                <span>Off attacks count</span>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={fgMixOffCount <= 0 ? "" : String(fgMixOffCount)}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/[^\d]/g, "");
                    if (!digits) {
                      setFgMixOffCount(0);
                      return;
                    }
                    setFgMixOffCount(Math.max(0, Number(digits)));
                  }}
                  disabled={!fgMixOffEnabled}
                />
              </label>
              <div className="fake-off-targets">
                <span>Off target villages</span>
                {fgMixOffEnabled && (
                  <div className="hint">
                    Anzahl an verfügbaren Off&apos;s: {fgAvailableOffVillageCount}
                  </div>
                )}
                {fgMixOffEnabled && fgTargetCoords.length > 0 && (
                  <div className="hint" style={{ marginBottom: "6px" }}>
                    Vorschläge (Berichtsanalyse: viel Off, wenig Deff):
                    {fgOffTargetSuggestions.slice(0, 3).map((item, index) => (
                      <div key={`fg-off-suggestion-${item.coord}`}>
                        {index + 1}. {item.coord} | Off ~{Math.round(item.offScore)} | Deff ~
                        {Math.round(item.deffScore)} | Reports ~{Math.round(item.samples)}
                      </div>
                    ))}
                  </div>
                )}
                {fgMixOffEnabled && fgMixOffCount > 0 && fgTargetCoords.length > 0 && (
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      const suggested = fgOffTargetSuggestions.map((item) => item.coord);
                      const fallback = suggested[0] || fgTargetCoords[0] || "";
                      setFgMixOffTargetCoords((prev) =>
                        Array.from({ length: fgMixOffCount }).map(
                          (_, index) => suggested[index] || prev[index] || fallback
                        )
                      );
                    }}
                  >
                    Vorschläge übernehmen
                  </button>
                )}
                {fgMixOffEnabled && fgMixOffCount > 0 ? (
                  <div className="fake-off-targets-list">
                    {Array.from({ length: fgMixOffCount }).map((_, index) => (
                      <label key={`off-target-${index}`}>
                        <span>{`Off ${index + 1}`}</span>
                        <select
                          value={fgMixOffTargetCoords[index] ?? ""}
                          onChange={(e) =>
                            setFgMixOffTargetCoords((prev) => {
                              const next = [...prev];
                              next[index] = e.target.value;
                              return next;
                            })
                          }
                          disabled={fgTargetCoords.length === 0}
                        >
                          {fgTargetCoords.length === 0 && (
                            <option value="">No target coordinates</option>
                          )}
                          {fgTargetCoords.map((coord) => (
                            <option key={`${coord}-${index}`} value={coord}>
                              {coord}{" "}
                              {dbVillages.get(coord)?.villageName
                                ? `- ${dbVillages.get(coord)?.villageName}`
                                : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                ) : (
                  <div className="hint">Enable Off mix and set count &gt; 0.</div>
                )}
              </div>
            </div>

            <div className="fake-generator-grid fake-generator-grid-3">
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={fgAgChainsEnabled}
                  onChange={(e) => setFgAgChainsEnabled(e.target.checked)}
                />
                <span>Start AG chains (1 off + 4 AG)</span>
              </label>
              <label>
                <span>AG chains count</span>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={fgAgChainsCount <= 0 ? "" : String(fgAgChainsCount)}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/[^\d]/g, "");
                    if (!digits) {
                      setFgAgChainsCount(0);
                      return;
                    }
                    setFgAgChainsCount(Math.max(0, Number(digits)));
                  }}
                  disabled={!fgAgChainsEnabled}
                />
              </label>
              <div className="fake-off-targets">
                <span>AG chain status</span>
                {fgAgChainsEnabled ? (
                  <div className="hint">Mögliche AG-Ketten aktuell: {fgAvailableAgChainsCount}</div>
                ) : (
                  <div className="hint">AG-Ketten deaktiviert.</div>
                )}
                {fgAgChainsEnabled && fgTargetCoords.length > 0 && fgAgTargetSuggestions.length > 0 && (
                  <>
                    <div className="hint" style={{ marginTop: "6px" }}>
                      AG Ziel-Empfehlung:
                      <div>
                        1. {fgAgTargetSuggestions[0].coord} | Deff ~
                        {Math.round(fgAgTargetSuggestions[0].avgDeffScore)} | Eigene Angriffe:{" "}
                        {fgAgTargetSuggestions[0].myAttacks} | Wipes:{" "}
                        {fgAgTargetSuggestions[0].myWipes}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => {
                        const best = fgAgTargetSuggestions[0]?.coord;
                        if (!best) return;
                        const ordered = [best, ...fgTargetCoords.filter((coord) => coord !== best)];
                        setFgTargetCoordsInput(ordered.join("\n"));
                      }}
                    >
                      Bestes AG-Ziel priorisieren
                    </button>
                  </>
                )}
              </div>
              <label>
                <span>AG mini attack preset</span>
                <select
                  value={fgAgChainPreset}
                  onChange={(e) => setFgAgChainPreset(e.target.value as FakeAgChainPreset)}
                  disabled={!fgAgChainsEnabled}
                >
                  <option value="light50_snob1">50 LK + 1 AG</option>
                  <option value="axe100_snob1">100 Axe + 1 AG</option>
                </select>
              </label>
            </div>

            {fgUnitSelectionType === "dynamic" && (
              <div className="fake-generator-grid fake-generator-grid-2">
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={fgSendSpy}
                    onChange={(e) => setFgSendSpy(e.target.checked)}
                  />
                  <span>Send spy</span>
                </label>
                <label>
                  <span>Keep catapults</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={fgKeepCatapults <= 0 ? "" : String(fgKeepCatapults)}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/[^\d]/g, "");
                      if (!digits) {
                        setFgKeepCatapults(0);
                        return;
                      }
                      setFgKeepCatapults(Math.max(0, Number(digits)));
                    }}
                  />
                </label>
              </div>
            )}

            {fgUnitSelectionType === "manual" && (
              <div className="fake-generator-manual">
                <div>
                  <h3>Units to send (-1 = all)</h3>
                  <div className="fake-generator-units-grid">
                    {dbOverviewUnitOrder.map((unit) => (
                      <label key={`send-${unit}`}>
                        <span>{getUnitLabelDe(unit)}</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="-?[0-9]*"
                          value={
                            Number(fgManualUnitsToSend[unit] ?? 0) === 0
                              ? ""
                              : String(fgManualUnitsToSend[unit] ?? "")
                          }
                          onChange={(e) => {
                            const raw = e.target.value.trim();
                            if (!raw) {
                              setFgManualUnitsToSend((prev) => ({ ...prev, [unit]: 0 }));
                              return;
                            }
                            if (!/^-?\d+$/.test(raw)) return;
                            setFgManualUnitsToSend((prev) => ({
                              ...prev,
                              [unit]: Number(raw),
                            }));
                          }}
                        />
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <h3>Units to keep (-1 = all)</h3>
                  <div className="fake-generator-units-grid">
                    {dbOverviewUnitOrder.map((unit) => (
                      <label key={`keep-${unit}`}>
                        <span>{getUnitLabelDe(unit)}</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="-?[0-9]*"
                          value={
                            Number(fgManualUnitsToKeep[unit] ?? 0) === 0
                              ? ""
                              : String(fgManualUnitsToKeep[unit] ?? "")
                          }
                          onChange={(e) => {
                            const raw = e.target.value.trim();
                            if (!raw) {
                              setFgManualUnitsToKeep((prev) => ({ ...prev, [unit]: 0 }));
                              return;
                            }
                            if (!/^-?\d+$/.test(raw)) return;
                            setFgManualUnitsToKeep((prev) => ({
                              ...prev,
                              [unit]: Number(raw),
                            }));
                          }}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="fake-generator-grid fake-generator-grid-4">
              <button
                type="button"
                className="ghost"
                onClick={handleFakeCalculateTotalPossibleAttacks}
              >
                Calculate total possible attacks
              </button>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={fgFilterRatio}
                  onChange={(e) => setFgFilterRatio(e.target.checked)}
                />
                <span>Filter by newbie ratio</span>
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={fgAvoidNightBonus}
                  onChange={(e) => setFgAvoidNightBonus(e.target.checked)}
                />
                <span>Avoid night bonus</span>
              </label>
              <label>
                <span>Night bonus buffer (min)</span>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={fgNightBonusBuffer <= 0 ? "" : String(fgNightBonusBuffer)}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/[^\d]/g, "");
                    if (!digits) {
                      setFgNightBonusBuffer(0);
                      return;
                    }
                    setFgNightBonusBuffer(Math.max(0, Number(digits)));
                  }}
                />
              </label>
            </div>

            <div className="fake-generator-arrivals">
              <h3>Arrival windows</h3>
              <div className="fake-generator-grid fake-generator-grid-4">
                <label>
                  <span>From</span>
                  <input
                    type="datetime-local"
                    value={fgArrivalFromInput}
                    onChange={(e) => setFgArrivalFromInput(e.target.value)}
                  />
                </label>
                <label>
                  <span>To</span>
                  <input
                    type="datetime-local"
                    value={fgArrivalToInput}
                    onChange={(e) => setFgArrivalToInput(e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    if (!fgArrivalFromInput || !fgArrivalToInput) return;
                    const fromDate = new Date(fgArrivalFromInput);
                    const toDate = new Date(fgArrivalToInput);
                    if (!Number.isFinite(fromDate.getTime()) || !Number.isFinite(toDate.getTime())) return;
                    if (toDate.getTime() < fromDate.getTime()) return;
                    const duplicate = fgArrivalWindows.some(
                      (window) => window.from === fgArrivalFromInput && window.to === fgArrivalToInput
                    );
                    if (duplicate) return;
                    setFgArrivalWindows((prev) => [
                      ...prev,
                      { id: createId(), from: fgArrivalFromInput, to: fgArrivalToInput },
                    ]);
                  }}
                >
                  Add
                </button>
                <button
                  type="button"
                  className="ghost danger"
                  onClick={() => setFgArrivalWindows([])}
                >
                  Delete all
                </button>
              </div>
              {fgArrivalWindows.length > 0 && (
                <div className="fake-generator-arrival-list">
                  {fgArrivalWindows.map((window) => (
                    <div key={window.id} className="fake-generator-arrival-row">
                      <span>{formatFakeArrivalWindowLabel(window)}</span>
                      <button
                        type="button"
                        className="ghost danger"
                        onClick={() =>
                          setFgArrivalWindows((prev) => prev.filter((item) => item.id !== window.id))
                        }
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <label className="wb-dsu-label">
              <span>Target coordinates</span>
              <textarea
                className="wb-dsu-textarea"
                placeholder="Insert target coordinates here"
                value={fgTargetCoordsInput}
                onChange={(e) => setFgTargetCoordsInput(e.target.value)}
                onPaste={(e) => {
                  e.preventDefault();
                  const pasted = e.clipboardData?.getData("text") ?? "";
                  const coords = extractCoords(pasted);
                  if (coords.length === 0) return;
                  const existing = extractCoords(fgTargetCoordsInput);
                  const merged = extractCoords(`${existing.join(" ")} ${coords.join(" ")}`);
                  setFgTargetCoordsInput(merged.join(" "));
                }}
              />
            </label>

            <label className="wb-dsu-label">
              <span>Oder Spieler (alle Dörfer als Ziele)</span>
              <input
                type="text"
                list="db-player-list"
                placeholder="Spielername eingeben"
                value={fgTargetPlayerInput}
                onChange={(e) => setFgTargetPlayerInput(e.target.value)}
              />
            </label>

            <div className="wb-dsu-actions fake-generator-actions">
              <button type="button" onClick={handleFakeCalculate}>
                Calculate fakes
              </button>
              <button type="button" className="ghost" onClick={handleFakeExportWb}>
                Export WB
              </button>
            </div>

            {fgStatusType === "success" && (
              <div className="panel wb-dsu-success">
                <strong>{fgStatusMessage}</strong>
                {fgTotalPossibleAttacks != null && (
                  <div>Total possible attacks: {fgTotalPossibleAttacks}</div>
                )}
              </div>
            )}
            {fgStatusType === "error" && (
              <div className="panel error">
                <strong>{fgStatusMessage}</strong>
              </div>
            )}

            {fgUnusedCoords.length > 0 && (
              <div className="panel warning">
                <strong>Unused target coordinates: {fgUnusedCoords.length}</strong>
                <div>{fgUnusedCoords.join(" ")}</div>
              </div>
            )}

            {fgResultRows.length > 0 && (
              <>
                <div className="fake-generator-open-buttons">
                  {fgOpenButtonRanges.map((range) => (
                    <button
                      key={`${range.start}-${range.end}`}
                      type="button"
                      className="ghost"
                      onClick={() => handleFakeOpenRange(range.start, range.end)}
                    >
                      Open tabs [{range.start + 1}-{range.end}]
                    </button>
                  ))}
                </div>
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th>Start</th>
                        <th>Target</th>
                        <th>Unit</th>
                        <th>Send</th>
                        <th>Arrival</th>
                        <th>Open</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fgResultRows.map((row, index) => (
                        <tr key={`${row.originVillageId}-${row.targetVillageId}-${index}`}>
                          <td>{row.attackType === "ag" ? "ag-chain" : row.attackType}</td>
                          <td>{row.originCoord}</td>
                          <td>{row.targetCoord}</td>
                          <td>{getUnitLabelDe(row.unit)}</td>
                          <td>{formatDate(row.sendAt, "local")}</td>
                          <td>{formatDate(row.arrivalAt, "local")}</td>
                          <td>
                            <button
                              type="button"
                              className="ghost"
                              onClick={() => window.open(row.link, "_blank", "noopener,noreferrer")}
                            >
                              Open
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        )}

        {activeDbTab === "tools" && activeDbTool === "standdeff_verteiler" && (
          <section className="section standdeff-page">
            <h2>Standdeff-Verteiler</h2>

            <div className="standdeff-form-grid">
              {sdUnitOrder.map((unit) => (
                <label key={`sd-target-${unit}`}>
                  <span>{getUnitLabelDe(unit)}</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={Number(sdTargetUnits[unit] ?? 0) <= 0 ? "" : String(sdTargetUnits[unit])}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/[^\d]/g, "");
                      setSdTargetUnits((prev) => ({
                        ...prev,
                        [unit]: digits ? Math.max(0, Number(digits)) : 0,
                      }));
                    }}
                  />
                </label>
              ))}
            </div>

            <div className="standdeff-batch-controls">
              <label>
                <span>Actions per batch</span>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={sdOpenPerBatch <= 0 ? "" : String(sdOpenPerBatch)}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/[^\d]/g, "");
                    if (!digits) {
                      setSdOpenPerBatch(0);
                      return;
                    }
                    setSdOpenPerBatch(Math.max(1, Number(digits)));
                  }}
                  onBlur={() => setSdOpenPerBatch((prev) => (prev <= 0 ? 1 : prev))}
                />
              </label>
              <label>
                <span>Delay opening tabs (ms)</span>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={sdOpenDelay <= 0 ? "" : String(sdOpenDelay)}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/[^\d]/g, "");
                    if (!digits) {
                      setSdOpenDelay(0);
                      return;
                    }
                    setSdOpenDelay(Math.max(0, Number(digits)));
                  }}
                />
              </label>
              <button type="button" onClick={handleStanddeffStart}>
                Start
              </button>
            </div>

            <div className="panel">
              <div>Threatened villages (OFF/Fake/Unbekannt): {sdThreatenedCount}</div>
              {sdCoverageStats && (
                <div className="standdeff-status-grid">
                  <span>Covered: {sdCoverageStats.fullyCoveredVillages}/{sdCoverageStats.threatenedVillages}</span>
                  <span>Open unit needs: {sdCoverageStats.openNeeds}</span>
                  <span>Unresolved off moves: {sdCoverageStats.unresolvedOffMoves}</span>
                  <span>Unresolved deff surplus moves: {sdCoverageStats.unresolvedSurplusMoves}</span>
                </div>
              )}
              {sdStatusType !== "idle" && (
                <div className={`world-message ${sdStatusType}`}>{sdStatusMessage}</div>
              )}
            </div>

            {sdUnresolvedHints.length > 0 && (
              <div className="panel warning">
                <h3>Unresolved</h3>
                <ul>
                  {sdUnresolvedHints.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            )}

            {sdValidationRows.length > 0 && (
              <div className="panel">
                <h3>Standdeff Validation</h3>
                <ul>
                  {sdValidationRows.map((row) => (
                    <li key={row.label}>
                      <strong>{row.ok ? "OK" : "Fehler"} - {row.label}:</strong> {row.detail}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {[
              {
                title: "Standdeff Supports",
                rows: sdSupports,
              },
              {
                title: "Off+Deff-Auslagerungen",
                rows: sdCombinedRelocations,
              },
            ].map((section) => (
              <div className="panel standdeff-list-panel" key={section.title}>
                <h3>{section.title}</h3>
                {section.rows.length > 0 && (
                  <div className="fake-generator-open-buttons">
                    {buildStanddeffRanges(section.rows.length).map((range) => (
                      <button
                        key={`${section.title}-${range.start}-${range.end}`}
                        type="button"
                        className="ghost"
                        onClick={() => openStanddeffRange(section.rows, range.start, range.end)}
                      >
                        Open tabs [{range.start + 1}-{range.end}]
                      </button>
                    ))}
                  </div>
                )}
                <div className="table-wrapper">
                  <table className="db-table">
                    <thead>
                      <tr>
                        <th>Quelle</th>
                        <th>Ziel</th>
                        <th>Einheiten</th>
                        <th>ETA</th>
                        <th>Deadline</th>
                        <th>Puffer</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {section.rows.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="table-empty">
                            No entries.
                          </td>
                        </tr>
                      ) : (
                        section.rows.map((row) => (
                          <tr key={row.id}>
                            <td>
                              {row.sourceName} ({row.sourceCoord})
                            </td>
                            <td>
                              {row.targetName} ({row.targetCoord})
                            </td>
                            <td>
                              {dbOverviewUnitOrder
                                .filter((unit) => Number(row.units[unit] ?? 0) > 0)
                                .map((unit) => `${getUnitLabelDe(unit)}: ${Number(row.units[unit] ?? 0)}`)
                                .join(" | ")}
                              {(Number.isFinite(row.sourceOwnBefore) ||
                                Number.isFinite(row.sourceInVillageBefore)) && (
                                <div className="standdeff-source-delta">
                                  {Number.isFinite(row.sourceOwnBefore) &&
                                    Number.isFinite(row.sourceOwnAfter) && (
                                      <span>
                                        Eigene (Quelle): {Number(row.sourceOwnBefore)} {"->"}{" "}
                                        {Number(row.sourceOwnAfter)}
                                      </span>
                                    )}
                                  {Number.isFinite(row.sourceInVillageBefore) &&
                                    Number.isFinite(row.sourceInVillageAfter) && (
                                      <span>
                                        Im Dorf (Quelle): {Number(row.sourceInVillageBefore)} {"->"}{" "}
                                        {Number(row.sourceInVillageAfter)}
                                      </span>
                                    )}
                                </div>
                              )}
                            </td>
                            <td>{row.etaLabel}</td>
                            <td>{row.deadlineLabel}</td>
                            <td>{formatDuration(Math.max(0, row.bufferSeconds))}</td>
                            <td>
                              {row.link ? (
                                <a className="play-link" href={row.link} target="_blank" rel="noreferrer">
                                  ▶
                                </a>
                              ) : (
                                <span className="muted">-</span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </section>
        )}

      <datalist id="player-list">
        {Array.from(players.values()).map((player) => (
          <option key={player.playerId} value={player.playerName} />
        ))}
      </datalist>
      <datalist id="ally-list">
        {Array.from(allies.values()).map((ally) => (
          <option key={ally.allyId} value={ally.allyTag || ally.allyName} />
        ))}
      </datalist>
      <datalist id="db-player-list">
        {Array.from(dbPlayers.values()).map((player) => (
          <option key={player.playerId} value={player.playerName} />
        ))}
      </datalist>

          {activeDbTab === "insert" && (
            <section className="section">
              <h2>Eingaben einfügen</h2>
              <p className="hint">
                Daten werden später ausgewertet. Jede Kategorie hat eine eigene Box.
              </p>
              <div className="db-insert-grid">
                <div className="db-card">
                  <div className="card-header">
                    <h3>SOS Anfragen</h3>
                    {renderBoxStatus(insertSosStatus)}
                  </div>
                  <textarea
                    placeholder="SOS Anfragen einfügen"
                    value={insertSosText}
                    onChange={(e) => {
                      setInsertSosText(e.target.value);
                    }}
                  />
                  <p className="hint">
                    Daten werden später ausgewertet. Eingelesene eingehende Angriffe:{" "}
                    {dbIncomingAttacks.length}
                  </p>
                </div>
                <div className="db-card">
                  <div className="card-header">
                    <h3>Weitergeleitete Berichte</h3>
                    {renderBoxStatus(dbReportsStatus)}
                  </div>
                  <textarea
                    placeholder="Report ids einfpgen oder Handlunsanleitung befolgen."
                    value={insertForwardedText}
                    onChange={(e) => setInsertForwardedText(e.target.value)}
                  />
                  <details className="forwarded-guide">
                    <summary>Anleitung (JSON-Export)</summary>
                    <div className="forwarded-guide-body">
                      <div className="forwarded-guide-header">
                        <strong>Schritte</strong>
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => void navigator.clipboard.writeText(FORWARDED_EXPORT_CONSOLE_SNIPPET)}
                        >
                          Konsolenbefehl kopieren
                        </button>
                      </div>
                      <ol>
                        <li>
                          Im Spiel auf Berichte gehen und im Filter alle relevanten Optionen aktivieren
                          (Kampfergebnis + Befehls-Icon wie im Screenshot), damit wirklich alle gewünschten
                          Berichte exportiert werden.
                        </li>
                        <li>Browser-Konsole öffnen und den Befehl ausführen.</li>
                        <li>
                          Es wird eine Datei <code>forwarded_reports_json_*.json</code> in Downloads gespeichert.
                        </li>
                        <li>
                          Beim Klick auf <code>Forwarded JSON importieren</code> wird zuerst automatisch die neueste
                          <code> forwarded_reports_json_*.json </code> aus Downloads genommen, in den Projektordner als
                          <code> forwarded_reports_json_&lt;welt&gt;.json </code> gespeichert und dabei überschrieben.
                        </li>
                        <li>
                          Falls keine Datei in Downloads gefunden wird, nutzt der Button den JSON-Inhalt aus dieser Box.
                        </li>
                      </ol>
                    </div>
                  </details>
                  <div className="db-card-actions">
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => {
                        void (async () => {
                          const result = await importForwardedJsonFromDownloads();
                          if (result === "no_file" && insertForwardedText.trim()) {
                            await importForwardedJsonFromText();
                            return;
                          }
                          if (result === "no_file" && !insertForwardedText.trim()) {
                            setDbReportsImportMessage(
                              "Keine JSON-Datei in Downloads gefunden. Bitte Datei exportieren oder JSON in die Box einfügen."
                            );
                          }
                        })();
                      }}
                      disabled={dbReportsStatus === "loading"}
                    >
                      Forwarded JSON importieren
                    </button>
                  </div>
                  {dbReportsImportMessage && <p className="hint">{dbReportsImportMessage}</p>}
                </div>
                <div className="db-card">
                  <div className="card-header">
                    <h3>Truppen</h3>
                    {renderBoxStatus(insertUnitsStatus)}
                  </div>
                  <textarea
                    placeholder="Truppenübersicht einfügen"
                    value={insertUnitsText}
                    onChange={(e) => {
                      setInsertUnitsText(e.target.value);
                    }}
                  />
                  <p className="hint">Daten werden später ausgewertet.</p>
                </div>
                <div className="db-card">
                  <div className="card-header">
                    <h3>Gebäude</h3>
                    {renderBoxStatus(insertBuildingsStatus)}
                  </div>
                  <textarea
                    placeholder="Gebäudeübersicht einfügen"
                    value={insertBuildingsText}
                    onChange={(e) => {
                      setInsertBuildingsText(e.target.value);
                    }}
                  />
                  <p className="hint">Daten werden später ausgewertet.</p>
                </div>
                <div className="db-card">
                  <div className="card-header">
                    <h3>Ausgehende Angriffe</h3>
                    {renderBoxStatus(insertOutgoingStatus)}
                  </div>
                  <textarea
                    placeholder="Angriffsübersicht einfügen"
                    value={insertOutgoingText}
                    onChange={(e) => {
                      setInsertOutgoingText(e.target.value);
                    }}
                  />
                  <p className="hint">Daten werden später ausgewertet.</p>
                </div>
              </div>
            </section>
          )}

          {activeDbTab === "doerfer" && (
            <section className="section">
              <div className="section-header">
                <h2>Dörfer</h2>
                <div className="subtabs">
                  <button
                    type="button"
                    className={`tab ${activeVillagesTab === "truppen" ? "active" : ""}`}
                    onClick={() => setActiveVillagesTab("truppen")}
                  >
                    Truppen
                  </button>
                  <button
                    type="button"
                    className={`tab ${activeVillagesTab === "gebaeude" ? "active" : ""}`}
                    onClick={() => setActiveVillagesTab("gebaeude")}
                  >
                    Gebäude
                  </button>
                </div>
              </div>
              <div className="filter-bar">
                <input
                  type="search"
                  placeholder="Dorf, Spieler oder Koords suchen"
                  value={dbVillageFilter}
                  onChange={(e) => setDbVillageFilter(e.target.value)}
                />
              </div>
              <div className="table-wrapper">
                <table className="db-table">
                  <thead>
                    <tr>
                      <th
                        className="sortable"
                        onClick={() => {
                          setDbVillageSortKey("dorf");
                          setDbVillageSortDir((prev) =>
                            dbVillageSortKey === "dorf" ? (prev === "asc" ? "desc" : "asc") : "asc"
                          );
                        }}
                      >
                        Dorf{" "}
                        {dbVillageSortKey === "dorf" ? (dbVillageSortDir === "asc" ? "▲" : "▼") : ""}
                      </th>
                      <th className="no-sort">Spieler</th>
                      <th className="no-sort">Koords</th>
                      <th className="no-sort village-units-header">
                        {activeVillagesTab === "truppen" ? "Truppen" : "Gebäude"}
                      </th>
                      {activeVillagesTab === "truppen" && (
                        <th
                          className="sortable"
                          onClick={() => {
                            setDbVillageSortKey("typ");
                            setDbVillageSortDir((prev) =>
                              dbVillageSortKey === "typ" ? (prev === "asc" ? "desc" : "asc") : "asc"
                            );
                          }}
                        >
                          Typ{" "}
                          {dbVillageSortKey === "typ" ? (dbVillageSortDir === "asc" ? "▲" : "▼") : ""}
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const entryMap = new Map(
                        dbVillageEntries.map((entry) => [entry.coord, entry])
                      );
                      const fallbackEntries = dbSelectedPlayerId
                        ? Array.from(dbVillages.values())
                            .filter((village) => village.playerId === dbSelectedPlayerId)
                            .map((village) => {
                              const coord = `${village.x}|${village.y}`;
                              const existing = entryMap.get(coord);
                              if (existing) return existing;
                              return {
                                player: village.playerName,
                                village: village.villageName,
                                coord,
                                troops: {},
                                troopsOwn: {},
                                troopsInVillage: {},
                                troopsOutwards: {},
                                troopsMoving: {},
                                troopsTotal: {},
                                buildings: {},
                                role: "unknown" as const,
                                updatedAt: "",
                                sourceReportId: "",
                              };
                            })
                        : dbVillageEntries;
                      const needle = dbVillageFilter.trim().toLowerCase();
                      const filtered = fallbackEntries.filter((entry) => {
                        if (!needle) return true;
                        const hay = `${entry.village} ${entry.player} ${entry.coord}`.toLowerCase();
                        return hay.includes(needle);
                      });
                      const sorted = [...filtered].sort((a, b) => {
                        const dir = dbVillageSortDir === "asc" ? 1 : -1;
                        if (dbVillageSortKey === "typ" && activeVillagesTab === "truppen") {
                          const roleUnitsA = getVillageRoleUnits({
                            troopsOwn: a.troopsOwn,
                            troopsOutwards: a.troopsOutwards,
                            troopsMoving: a.troopsMoving,
                            troopsTotal: a.troopsTotal,
                            troops: a.troops,
                          });
                          const roleUnitsB = getVillageRoleUnits({
                            troopsOwn: b.troopsOwn,
                            troopsOutwards: b.troopsOutwards,
                            troopsMoving: b.troopsMoving,
                            troopsTotal: b.troopsTotal,
                            troops: b.troops,
                          });
                          const typeA = villageTypeLabel(
                            Object.keys(roleUnitsA).length > 0
                              ? classifyVillage(roleUnitsA)
                              : normalizeVillageRole(a.role),
                            Object.keys(roleUnitsA).length > 0
                              ? isBunkerVillage(roleUnitsA)
                              : Boolean(a.isBunker)
                          ).toLowerCase();
                          const typeB = villageTypeLabel(
                            Object.keys(roleUnitsB).length > 0
                              ? classifyVillage(roleUnitsB)
                              : normalizeVillageRole(b.role),
                            Object.keys(roleUnitsB).length > 0
                              ? isBunkerVillage(roleUnitsB)
                              : Boolean(b.isBunker)
                          ).toLowerCase();
                          const cmpType = typeA.localeCompare(typeB, "de", { sensitivity: "base" });
                          if (cmpType !== 0) return cmpType * dir;
                        }
                        const villageA = (a.village || "").toLowerCase();
                        const villageB = (b.village || "").toLowerCase();
                        const cmpVillage = villageA.localeCompare(villageB, "de", {
                          sensitivity: "base",
                        });
                        if (cmpVillage !== 0) return cmpVillage * dir;
                        return a.coord.localeCompare(b.coord, "de", { sensitivity: "base" }) * dir;
                      });
                      if (sorted.length === 0) {
                        return (
                          <tr>
                            <td colSpan={activeVillagesTab === "truppen" ? 5 : 4} className="table-empty">
                              Keine Daten vorhanden. Bitte Daten einfügen.
                            </td>
                          </tr>
                        );
                      }
                      return sorted.map((entry) => {
                        const buildingText = Object.entries(entry.buildings)
                          .map(([name, level]) => `${name}: ${level}`)
                          .join(", ");
                        const roleUnits = getVillageRoleUnits({
                          troopsOwn: entry.troopsOwn,
                          troopsOutwards: entry.troopsOutwards,
                          troopsMoving: entry.troopsMoving,
                          troopsTotal: entry.troopsTotal,
                          troops: entry.troops,
                        });
                        const computedRole =
                          Object.keys(roleUnits).length > 0
                            ? classifyVillage(roleUnits)
                            : normalizeVillageRole(entry.role);
                        const computedBunker =
                          Object.keys(roleUnits).length > 0
                            ? isBunkerVillage(roleUnits)
                            : Boolean(entry.isBunker);
                        return (
                          <tr key={`${entry.player}-${entry.coord}`}>
                            <td>{entry.village || "-"}</td>
                            <td>{entry.player}</td>
                            <td>{entry.coord}</td>
                            <td className={activeVillagesTab === "truppen" ? "village-troops-cell" : undefined}>
                              {activeVillagesTab === "truppen" ? (
                                renderVillageTroopsMatrix(entry)
                              ) : buildingText ? (
                                renderVillageBuildingsRow(entry.buildings)
                              ) : (
                                "Unbekannt"
                              )}
                            </td>
                            {activeVillagesTab === "truppen" && (
                              <td>{villageTypeLabel(computedRole, computedBunker)}</td>
                            )}
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {activeDbTab === "suche" && (
            <section className="section">
              <div className="section-header">
                <h2>Suche</h2>
                <div className="subtabs">
                  <button
                    type="button"
                    className={`tab ${activeSearchTab === "suche" ? "active" : ""}`}
                    onClick={() => setActiveSearchTab("suche")}
                  >
                    Suche
                  </button>
                  <button
                    type="button"
                    className={`tab ${activeSearchTab === "dorffilter" ? "active" : ""}`}
                    onClick={() => setActiveSearchTab("dorffilter")}
                  >
                    Dorffilter
                  </button>
                </div>
              </div>

              {activeSearchTab === "suche" && (
                <>
                  {searchDisplayMode === "none" && (
                    <>
                      <div className="search-form-row">
                        <label className="search-field">
                          <span>Accountname</span>
                          <div className="search-autocomplete" ref={searchAccountSuggestRef}>
                            <input
                              type="text"
                              placeholder="z. B. DarkLord"
                              value={searchAccountInput}
                              onChange={(e) => {
                                setSearchAccountInput(e.target.value);
                                setSearchValidationMessage("");
                                setSearchAccountSuggestOpen(true);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  setSearchAccountSuggestOpen(false);
                                  runPlayerSearch();
                                }
                              }}
                            />
                            {searchAccountSuggestOpen && searchAccountSuggestions.length > 0 && (
                              <div className="search-suggestions">
                                {searchAccountSuggestions.map((name) => (
                                  <button
                                    type="button"
                                    key={name}
                                    onClick={() => {
                                      setSearchAccountInput(name);
                                      setSearchAccountSuggestOpen(false);
                                    }}
                                  >
                                    {name}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </label>
                        <label className="search-field">
                          <span>Stamm</span>
                          <div className="search-autocomplete" ref={searchTribeSuggestRef}>
                            <input
                              type="text"
                              placeholder="z. B. [DKB]"
                              value={searchTribeInput}
                              onChange={(e) => {
                                setSearchTribeInput(e.target.value);
                                setSearchValidationMessage("");
                                setSearchTribeSuggestOpen(true);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  setSearchTribeSuggestOpen(false);
                                  runPlayerSearch();
                                }
                              }}
                            />
                            {searchTribeSuggestOpen && searchTribeSuggestions.length > 0 && (
                              <div className="search-suggestions">
                                {searchTribeSuggestions.map((item) => (
                                  <button
                                    type="button"
                                    key={`${item.tag}-${item.name}`}
                                    onClick={() => {
                                      setSearchTribeInput(item.value);
                                      setSearchTribeSuggestOpen(false);
                                    }}
                                  >
                                    <span className="search-suggestion-title">{item.value}</span>
                                    <span className="search-suggestion-sub">{item.name}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </label>
                        <label className="search-field search-coords-field">
                          <span>Koordinaten</span>
                          <div className="search-coords-inputs">
                            <input
                              ref={searchCoordXRef}
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              placeholder="500"
                              value={searchCoordXInput}
                              onChange={(e) => {
                                const digits = e.target.value.replace(/[^\d]/g, "").slice(0, 3);
                                setSearchCoordXInput(digits);
                                setSearchValidationMessage("");
                                if (digits.length >= 3) {
                                  searchCoordYRef.current?.focus();
                                  searchCoordYRef.current?.select();
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") runPlayerSearch();
                              }}
                            />
                            <input
                              ref={searchCoordYRef}
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              placeholder="500"
                              value={searchCoordYInput}
                              onChange={(e) => {
                                const digits = e.target.value.replace(/[^\d]/g, "").slice(0, 3);
                                setSearchCoordYInput(digits);
                                setSearchValidationMessage("");
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") runPlayerSearch();
                              }}
                            />
                          </div>
                        </label>
                      </div>
                      <div className="search-submit-row">
                        <button type="button" onClick={runPlayerSearch}>
                          Suchen
                        </button>
                      </div>
                      {searchValidationMessage && (
                        <div className="search-validation-message">{searchValidationMessage}</div>
                      )}
                    </>
                  )}
                  {searchHasRun && searchDisplayMode === "none" && !searchCoordVillageResult && (
                    <div className="panel">
                      <h3>Ergebnisse</h3>
                      <p className="table-empty">Kein Spieler oder Stamm gefunden.</p>
                    </div>
                  )}
                  {searchCoordVillageResult && (
                    <div className="search-village-wrap">
                      <div className="search-back-row">
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => {
                            setSearchHasRun(false);
                            setSearchValidationMessage("");
                            setSearchCriteria({
                              account: "",
                              tribe: "",
                              coordX: "",
                              coordY: "",
                            });
                          }}
                        >
                          Zurück zur Suche
                        </button>
                      </div>
                      <div className="search-player-grid">
                        <div className="panel search-player-card">
                          <h3 className="search-player-name-title">
                            <button
                              type="button"
                              className="search-inline-link search-title-link"
                              onClick={() => runSearchByCoord(searchCoordVillageResult.coord)}
                            >
                              {searchCoordVillageResult.villageName} ({searchCoordVillageResult.coord})
                            </button>
                          </h3>
                          <div className="search-kv-list">
                            <div className="search-kv-row">
                              <span className="search-kv-key">Spieler</span>
                              <span className="search-kv-value">
                                <button
                                  type="button"
                                  className="search-inline-link"
                                  onClick={() => runSearchByPlayer(searchCoordVillageResult.playerName)}
                                >
                                  {searchCoordVillageResult.playerName}
                                </button>
                              </span>
                            </div>
                            <div className="search-kv-row">
                              <span className="search-kv-key">Stamm</span>
                              <span className="search-kv-value">
                                {searchCoordVillageResult.tribeTag && searchCoordVillageResult.tribeTag !== "-" ? (
                                  <button
                                    type="button"
                                    className="search-inline-link"
                                    onClick={() => runSearchByTribe(searchCoordVillageResult.tribeTag)}
                                  >
                                    {searchCoordVillageResult.tribeTag}
                                  </button>
                                ) : (
                                  "-"
                                )}
                              </span>
                            </div>
                            <div className="search-kv-row">
                              <span className="search-kv-key">Punkte</span>
                              <span className="search-kv-value">{searchCoordVillageResult.points.toLocaleString("de-DE")}</span>
                            </div>
                            <div className="search-kv-row">
                              <span className="search-kv-key">Dorf-Typ</span>
                              <span className="search-kv-value">
                                {villageTypeLabel(searchCoordVillageResult.role, searchCoordVillageResult.isBunker)}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="panel search-player-card">
                          <h3 className="search-player-card-title">Truppeninformationen</h3>
                          {Object.keys(searchCoordVillageResult.troopsTotal).length > 0 ? (
                            <div className="search-village-block search-troops-row">
                              {renderVillageUnitsRow(searchCoordVillageResult.troopsTotal)}
                            </div>
                          ) : Object.keys(searchCoordVillageResult.troopsOwn).length > 0 ? (
                            <div className="search-village-block search-troops-row">
                              {renderVillageUnitsRow(searchCoordVillageResult.troopsOwn)}
                            </div>
                          ) : Object.keys(searchCoordVillageResult.troopsMerged).length > 0 ? (
                            <div className="search-village-block search-troops-row">
                              {renderVillageUnitsRow(searchCoordVillageResult.troopsMerged)}
                            </div>
                          ) : (
                            <p className="table-empty">Keine Truppeninformationen vorhanden.</p>
                          )}
                          {searchCoordVillageResult.troopsSourceReport && activeDbWorld && (
                            <div className="search-troops-source">
                              {(() => {
                                const source = searchCoordVillageResult.troopsSourceReport;
                                if (!source) return null;
                                return (
                              <span
                                className="search-troops-source-link"
                                title={source.title}
                                onMouseEnter={(event) =>
                                  showReportHover(source.id, event.currentTarget, 520)
                                }
                                onMouseLeave={scheduleHideHover}
                              >
                                Bericht vom {source.battleTime}
                              </span>
                                );
                              })()}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="panel search-metrics-panel">
                        <div className="search-metrics-head">Gebäude</div>
                        <div className="search-metrics-body">
                          {Object.keys(searchCoordVillageResult.buildings).length > 0 ? (
                            <div className="search-buildings-row">
                              {renderVillageBuildingsRow(searchCoordVillageResult.buildings)}
                            </div>
                          ) : (
                            <p className="table-empty">Keine Gebäudeinformationen vorhanden.</p>
                          )}
                          {searchCoordVillageResult.buildingsSourceReport && activeDbWorld && (
                            <div className="search-troops-source">
                              {(() => {
                                const source = searchCoordVillageResult.buildingsSourceReport;
                                if (!source) return null;
                                return (
                                  <button
                                    type="button"
                                    className="report-link report-link-button search-troops-source-link"
                                    title={source.title}
                                    onClick={() => {
                                      void openReportViewer(source.id);
                                    }}
                                    onMouseEnter={(event) =>
                                      showReportHover(source.id, event.currentTarget, 520)
                                    }
                                    onMouseLeave={scheduleHideHover}
                                  >
                                    Bericht vom {source.battleTime}
                                  </button>
                                );
                              })()}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="panel search-metrics-panel">
                        <div className="search-metrics-head">Punkteentwicklung</div>
                        <div className="search-metrics-body">
                          <div className={`search-points-chart ${searchVillagePointsLoading ? "loading" : ""}`}>
                            {(() => {
                              const series = searchVillagePointsSeries;
                              const width = 1000;
                              const height = 280;
                              const padL = 56;
                              const padR = 10;
                              const padT = 12;
                              const padB = 16;
                              const min = Math.min(...series.map((item) => item.points));
                              const max = Math.max(...series.map((item) => item.points));
                              const span = Math.max(1, max - min);
                              const formatTimeLabel = (iso: string) => {
                                const d = new Date(iso);
                                if (Number.isNaN(d.getTime())) return "";
                                const day = String(d.getDate()).padStart(2, "0");
                                const month = String(d.getMonth() + 1).padStart(2, "0");
                                const hour = String(d.getHours()).padStart(2, "0");
                                const minute = String(d.getMinutes()).padStart(2, "0");
                                return `${day}.${month} ${hour}:${minute}`;
                              };
                              const xFor = (idx: number) =>
                                padL +
                                (series.length <= 1
                                  ? 0
                                  : (idx / (series.length - 1)) * (width - padL - padR));
                              const yFor = (val: number) =>
                                padT + ((max - val) / span) * (height - padT - padB);
                              const line = series
                                .map((item, idx) => `${xFor(idx)},${yFor(item.points)}`)
                                .join(" ");
                              const area =
                                series.length > 0
                                  ? `${xFor(0)},${height - padB} ${line} ${xFor(series.length - 1)},${
                                      height - padB
                                    }`
                                  : "";
                              const dots = series.map((item, idx) => ({
                                x: xFor(idx),
                                y: yFor(item.points),
                              }));
                              return (
                                <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
                                  <rect x="0" y="0" width={width} height={height} fill="rgba(16, 22, 34, 0.65)" />
                                  {[0, 1, 2, 3, 4].map((n) => {
                                    const y = padT + (n / 4) * (height - padT - padB);
                                    const value = Math.round(max - (n / 4) * span).toLocaleString("de-DE");
                                    return (
                                      <g key={`grid-${n}`}>
                                        <line
                                          x1={padL}
                                          y1={y}
                                          x2={width - padR}
                                          y2={y}
                                          stroke="rgba(255,255,255,0.08)"
                                          strokeWidth="1"
                                        />
                                        <text
                                          x={padL - 6}
                                          y={y + 4}
                                          textAnchor="end"
                                          fontSize="13"
                                          fontWeight="600"
                                          fill="rgba(244,248,255,0.98)"
                                          stroke="rgba(8,12,18,0.6)"
                                          strokeWidth="0.8"
                                        >
                                          {value}
                                        </text>
                                      </g>
                                    );
                                  })}
                                  <line
                                    x1={padL}
                                    y1={height - padB}
                                    x2={width - padR}
                                    y2={height - padB}
                                    stroke="rgba(255,255,255,0.2)"
                                    strokeWidth="1"
                                  />
                                  <line
                                    x1={padL}
                                    y1={padT}
                                    x2={padL}
                                    y2={height - padB}
                                    stroke="rgba(255,255,255,0.2)"
                                    strokeWidth="1"
                                  />
                                  {series.length >= 2 && (
                                    <>
                                      <polygon points={area} fill="rgba(22, 130, 255, 0.18)" />
                                      <polyline
                                        points={line}
                                        fill="none"
                                        stroke="#22b7ff"
                                        strokeWidth="2.2"
                                        strokeLinejoin="round"
                                        strokeLinecap="round"
                                      />
                                    </>
                                  )}
                                  {dots.map((dot, idx) => (
                                    <circle key={`dot-${idx}`} cx={dot.x} cy={dot.y} r="2.3" fill="#b6ecff" />
                                  ))}
                                  {series.length > 0 && (
                                    <>
                                      <text
                                        x={padL}
                                        y={height - 2}
                                        textAnchor="start"
                                        fontSize="12"
                                        fill="rgba(220,230,245,0.86)"
                                      >
                                        {formatTimeLabel(series[0].snapshotAt)}
                                      </text>
                                      <text
                                        x={(padL + width - padR) / 2}
                                        y={height - 2}
                                        textAnchor="middle"
                                        fontSize="12"
                                        fill="rgba(220,230,245,0.86)"
                                      >
                                        {formatTimeLabel(
                                          series[Math.max(0, Math.floor((series.length - 1) / 2))].snapshotAt
                                        )}
                                      </text>
                                      <text
                                        x={width - padR}
                                        y={height - 2}
                                        textAnchor="end"
                                        fontSize="12"
                                        fill="rgba(220,230,245,0.86)"
                                      >
                                        {formatTimeLabel(series[series.length - 1].snapshotAt)}
                                      </text>
                                    </>
                                  )}
                                </svg>
                              );
                            })()}
                          </div>
                        </div>
                      </div>

                      <div className="panel search-metrics-panel">
                        <div className="search-metrics-head">Berichtsquellen zu diesem Dorf</div>
                        <div className="search-metrics-body">
                          {(() => {
                            const columnRenderers = {
                              attacker: (report: (typeof dbReports)[number]) =>
                                report.details?.attacker || "-",
                              defender: (report: (typeof dbReports)[number]) =>
                                report.details?.defender || "-",
                              origin: (report: (typeof dbReports)[number]) =>
                                report.details?.origin || "-",
                              target: (report: (typeof dbReports)[number]) =>
                                report.details?.target || "-",
                              battleTime: (report: (typeof dbReports)[number]) =>
                                report.details?.battleTime || "-",
                              uploaded: (report: (typeof dbReports)[number]) =>
                                new Date(report.fetchedAt).toLocaleString("de"),
                              command: (report: (typeof dbReports)[number]) => {
                                const size = getReportCommandSize(report);
                                const outcomeIcon = getReportOutcomeDotIcon(report);
                                const commandIcon = getCommandIcon(size);
                                const outcomeSrc =
                                  outcomeIcon === "gray"
                                    ? "/icons/dots/gray.svg"
                                    : `https://dsde.innogamescdn.com/asset/985df5a4/graphic/dots/${outcomeIcon}.webp`;
                                return (
                                  <span className="command-icons">
                                    <img src={outcomeSrc} alt="" />
                                    {commandIcon && (
                                      <img
                                        src={`https://dsde.innogamescdn.com/asset/985df5a4/graphic/command/${commandIcon}.webp`}
                                        alt=""
                                      />
                                    )}
                                  </span>
                                );
                              },
                              report: (report: (typeof dbReports)[number]) => (
                                <div className="report-link-wrap">
                                  <button
                                    type="button"
                                    className="report-link"
                                    onClick={() => {
                                      void openReportViewer(report.id);
                                    }}
                                    onMouseEnter={(e) =>
                                      showReportHover(
                                        report.id,
                                        e.currentTarget,
                                        report.details?.loyalty ? 600 : 520
                                      )
                                    }
                                    onMouseLeave={scheduleHideHover}
                                  >
                                    {report.title || `Report ${report.id}`}
                                  </button>
                                </div>
                              ),
                            } as const;
                            const columnLabels = {
                              attacker: "Angreifer",
                              defender: "Verteidiger",
                              origin: "Angreiferdorf",
                              target: "Zieldorf",
                              battleTime: "Angriffszeit",
                              uploaded: "Hochgeladen am",
                              command: "Befehl",
                              report: "Bericht",
                            } as const;
                            const villageReports = dbReports.filter((report) => {
                              const origin = parseCoord(report.details?.origin ?? "");
                              const target = parseCoord(report.details?.target ?? "");
                              return (
                                origin === searchCoordVillageResult.coord ||
                                target === searchCoordVillageResult.coord
                              );
                            });
                            const sortedVillageReports = [...villageReports].sort((a, b) => {
                              if (!reportSortKey) return 0;
                              const getValue = (report: (typeof dbReports)[number]) => {
                                const coordFrom = parseCoord(report.details?.origin ?? "");
                                const coordTo = parseCoord(report.details?.target ?? "");
                                const fromVillage = coordFrom ? dbVillages.get(coordFrom) : undefined;
                                const toVillage = coordTo ? dbVillages.get(coordTo) : undefined;
                                switch (reportSortKey) {
                                  case "attacker":
                                    return (fromVillage?.playerName ?? report.details?.attacker ?? "").toLowerCase();
                                  case "defender":
                                    return (toVillage?.playerName ?? report.details?.defender ?? "").toLowerCase();
                                  case "origin":
                                    return report.details?.origin ?? "";
                                  case "target":
                                    return report.details?.target ?? "";
                                  case "battleTime":
                                    return parseBattleTime(report.details?.battleTime);
                                  case "uploaded":
                                    return new Date(report.fetchedAt).getTime();
                                  case "command":
                                    return getReportCommandSize(report);
                                  case "report":
                                    return (report.title || "").toLowerCase();
                                  default:
                                    return "";
                                }
                              };
                              const aVal = getValue(a);
                              const bVal = getValue(b);
                              if (typeof aVal === "number" && typeof bVal === "number") {
                                const diff = reportSortDir === "asc" ? aVal - bVal : bVal - aVal;
                                if (diff !== 0) return diff;
                                return new Date(b.fetchedAt).getTime() - new Date(a.fetchedAt).getTime();
                              }
                              const aStr = String(aVal);
                              const bStr = String(bVal);
                              if (aStr === bStr) return 0;
                              const cmp =
                                reportSortDir === "asc"
                                  ? aStr.localeCompare(bStr, "de", { numeric: true, sensitivity: "base" })
                                  : bStr.localeCompare(aStr, "de", { numeric: true, sensitivity: "base" });
                              if (cmp !== 0) return cmp;
                              return new Date(b.fetchedAt).getTime() - new Date(a.fetchedAt).getTime();
                            });
                            const activeColumns = reportColumns.filter((col) => col in columnRenderers);
                            if (sortedVillageReports.length === 0) {
                              return (
                                <p className="table-empty">
                                  Keine Berichte mit diesem Dorf als Quelle/Ziel vorhanden.
                                </p>
                              );
                            }
                            return (
                              <div className="table-wrapper reports-table-wrapper">
                                <table className="db-table reports-table">
                                  <thead>
                                    <tr>
                                      {activeColumns.map((col) => {
                                        const isActive = reportSortKey === col;
                                        return (
                                          <th key={col}>
                                            <button
                                              type="button"
                                              className={`reports-sort-button ${isActive ? "active" : ""}`}
                                              onClick={() => {
                                                if (reportSortKey === col) {
                                                  setReportSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
                                                } else {
                                                  setReportSortKey(col);
                                                  setReportSortDir("asc");
                                                }
                                              }}
                                            >
                                              {columnLabels[col as keyof typeof columnLabels]}
                                              <span className="reports-sort-indicator">
                                                {isActive ? (reportSortDir === "asc" ? "↑" : "↓") : "↕"}
                                              </span>
                                            </button>
                                          </th>
                                        );
                                      })}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {sortedVillageReports.map((report) => (
                                      <tr key={report.id} className="report-row">
                                        {activeColumns.map((col) => (
                                          <td key={`${report.id}-${col}`}>
                                            {columnRenderers[col as keyof typeof columnRenderers](report)}
                                          </td>
                                        ))}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  )}
                  {searchDisplayMode !== "none" && !searchCoordVillageResult && (
                    <>
                      <div className="search-back-row">
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => {
                            setSearchHasRun(false);
                            setSearchValidationMessage("");
                            setSearchCriteria({
                              account: "",
                              tribe: "",
                              coordX: "",
                              coordY: "",
                            });
                          }}
                        >
                          Zurück zur Suche
                        </button>
                      </div>
                      {searchDisplayMode === "player" && searchPrimaryResult && (
                        <>
                          <div className="search-player-grid">
                            <div className="panel search-player-card">
                              <h3 className="search-player-name-title">
                                <button
                                  type="button"
                                  className="search-inline-link search-title-link"
                                  onClick={() => runSearchByPlayer(searchPrimaryResult.playerName)}
                                >
                                  {searchPrimaryResult.playerName}
                                </button>
                              </h3>
                              <div className="search-kv-list">
                                <div className="search-kv-row">
                                  <span className="search-kv-key">Punkte</span>
                                  <span className="search-kv-value">{searchPrimaryResult.points.toLocaleString("de-DE")}</span>
                                </div>
                                <div className="search-kv-row">
                                  <span className="search-kv-key">Rang</span>
                                  <span className="search-kv-value">{searchPrimaryResult.rank || "-"}</span>
                                </div>
                                <div className="search-kv-row">
                                  <span className="search-kv-key">Stamm</span>
                                  <span className="search-kv-value">
                                    {searchPrimaryResult.tribeTag && searchPrimaryResult.tribeTag !== "-" ? (
                                      <button
                                        type="button"
                                        className="search-inline-link"
                                        onClick={() => runSearchByTribe(searchPrimaryResult.tribeTag)}
                                      >
                                        {searchPrimaryResult.tribeTag}
                                      </button>
                                    ) : (
                                      "-"
                                    )}
                                  </span>
                                </div>
                                <div className="search-kv-row">
                                  <span className="search-kv-key">Dörfer</span>
                                  <span className="search-kv-value">{searchPrimaryResult.villages}</span>
                                </div>
                                <div className="search-kv-row">
                                  <span className="search-kv-key">Ø Punkte je Dorf</span>
                                  <span className="search-kv-value">
                                    {Math.round(searchPrimaryResult.avgPointsPerVillage).toLocaleString("de-DE")}
                                  </span>
                                </div>
                                <div className="search-kv-row">
                                  <span className="search-kv-key">Bester Rang</span>
                                  <span className="search-kv-value">
                                    {searchPrimaryResult.bestRank || "-"} ({new Date().toLocaleDateString("de-DE")})
                                  </span>
                                </div>
                                <div className="search-kv-row">
                                  <span className="search-kv-key">Gesamt Bashis</span>
                                  <span className="search-kv-value">{searchPrimaryResult.totalBashis.toLocaleString("de-DE")}</span>
                                </div>
                                <div className="search-kv-row">
                                  <span className="search-kv-key">Angreifer Bashis</span>
                                  <span className="search-kv-value">{searchPrimaryResult.attackerBashis.toLocaleString("de-DE")}</span>
                                </div>
                                <div className="search-kv-row">
                                  <span className="search-kv-key">Verteidiger Bashis</span>
                                  <span className="search-kv-value">{searchPrimaryResult.defenderBashis.toLocaleString("de-DE")}</span>
                                </div>
                                <div className="search-kv-row">
                                  <span className="search-kv-key">Unterstützer Bashis</span>
                                  <span className="search-kv-value">{searchPrimaryResult.supporterBashis.toLocaleString("de-DE")}</span>
                                </div>
                              </div>
                            </div>
                            <div className="panel search-player-card">
                              <div className="search-kv-list">
                                <div className="search-kv-row">
                                  <span className="search-kv-key">Berichte</span>
                                  <span className="search-kv-value">{searchPrimaryResult.reportsCount.toLocaleString("de-DE")}</span>
                                </div>
                                <div className="search-kv-row">
                                  <span className="search-kv-key">UT-Berichte</span>
                                  <span className="search-kv-value">{searchPrimaryResult.utReportsCount.toLocaleString("de-DE")}</span>
                                </div>
                                <div className="search-kv-row">
                                  <span className="search-kv-key">Off-Dörfer</span>
                                  <span className="search-kv-value">{searchPrimaryResult.offVillages}</span>
                                </div>
                                <div className="search-kv-row">
                                  <span className="search-kv-key">Deff-Dörfer</span>
                                  <span className="search-kv-value">{searchPrimaryResult.deffVillages}</span>
                                </div>
                                <div className="search-kv-row">
                                  <span className="search-kv-key">Wachtürme</span>
                                  <span className="search-kv-value">{searchPrimaryResult.watchtowers}</span>
                                </div>
                                <div className="search-kv-row">
                                  <span className="search-kv-key">Kirchen</span>
                                  <span className="search-kv-value">{searchPrimaryResult.churches}</span>
                                </div>
                                <div className="search-kv-row">
                                  <span className="search-kv-key">Stammeswechsel</span>
                                  <span className="search-kv-value">0</span>
                                </div>
                                <div className="search-kv-row">
                                  <span className="search-kv-key">Eroberungen</span>
                                  <span className="search-kv-value">Gesamt: 0 / Selbst: 0 / Verloren: 0</span>
                                </div>
                                <div className="search-kv-row">
                                  <span className="search-kv-key">Intern</span>
                                  <span className="search-kv-value">0</span>
                                </div>
                                <div className="search-kv-row">
                                  <span className="search-kv-key">Babaadelungen</span>
                                  <span className="search-kv-value">{searchPrimaryResult.babaNobles}</span>
                                </div>
                                <div className="search-kv-row">
                                  <span className="search-kv-key">Max Dörfer</span>
                                  <span className="search-kv-value">
                                    {searchPrimaryResult.maxVillages} ({new Date().toLocaleDateString("de-DE")})
                                  </span>
                                </div>
                                <div className="search-kv-row">
                                  <span className="search-kv-key">Max Punkte</span>
                                  <span className="search-kv-value">
                                    {searchPrimaryResult.maxPoints.toLocaleString("de-DE")} ({new Date().toLocaleDateString("de-DE")})
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="panel search-analysis-panel">
                            <div className="search-analysis-head">◷</div>
                            <div className="search-analysis-title">Spieleranalyse</div>
                            <button type="button">Spieler genau analysieren</button>
                          </div>
                          <div className="panel search-metrics-panel">
                            <div className="search-metrics-head">Durchschnittswerte</div>
                            <div className="search-metrics-body">
                              <p className="search-metrics-label">Ø Off:</p>
                              <p>{searchPrimaryResult.avgOffLine}</p>
                              <p className="search-metrics-label">Ø Fake:</p>
                              <p>{searchPrimaryResult.avgFakeLine}</p>
                              <p className="search-metrics-label">Ø Deff (Tab):</p>
                              <p>{searchPrimaryResult.avgDeffTabLine}</p>
                              <p className="search-metrics-label">Ø Deff (Groß):</p>
                              <p>{searchPrimaryResult.avgDeffGrossLine}</p>
                            </div>
                          </div>
                          <div className="panel search-metrics-panel">
                            <div className="search-metrics-head">Abschickzeiten</div>
                            <div className="search-metrics-body">
                              <p>Ø Zeit: {searchPrimaryResult.avgSendTime}</p>
                              <p>Früheste Zeit: {searchPrimaryResult.earliestSendTime}</p>
                              <p>Späteste Zeit: {searchPrimaryResult.latestSendTime}</p>
                            </div>
                          </div>
                          <div className="panel search-map-panel">
                            <div className="search-map-head">Spielerkarte</div>
                            <div className="search-map-body">
                              <canvas ref={searchMapCanvasRef} />
                            </div>
                          </div>
                        </>
                      )}
                      {searchDisplayMode === "tribe" && searchTribeResult && (
                        <>
                          <div className="search-player-grid">
                            <div className="panel search-player-card">
                              <h3 className="search-player-name-title">
                                <button
                                  type="button"
                                  className="search-inline-link search-title-link"
                                  onClick={() => runSearchByTribe(searchTribeResult.allyTag || searchTribeResult.allyName)}
                                >
                                  [{searchTribeResult.allyTag}] - {searchTribeResult.allyName}
                                </button>
                              </h3>
                              <div className="search-kv-list">
                                <div className="search-kv-row">
                                  <span className="search-kv-key">Rang</span>
                                  <span className="search-kv-value">{searchTribeResult.rank || "-"}</span>
                                </div>
                                <div className="search-kv-row">
                                  <span className="search-kv-key">Punkte</span>
                                  <span className="search-kv-value">{searchTribeResult.points.toLocaleString("de-DE")}</span>
                                </div>
                                <div className="search-kv-row">
                                  <span className="search-kv-key">Mitglieder</span>
                                  <span className="search-kv-value">{searchTribeResult.members.toLocaleString("de-DE")}</span>
                                </div>
                                <div className="search-kv-row">
                                  <span className="search-kv-key">Dörfer</span>
                                  <span className="search-kv-value">{searchTribeResult.villages.toLocaleString("de-DE")}</span>
                                </div>
                                <div className="search-kv-row">
                                  <span className="search-kv-key">Ø Punkte/Spieler</span>
                                  <span className="search-kv-value">
                                    {Math.round(searchTribeResult.avgPointsPerPlayer).toLocaleString("de-DE")}
                                  </span>
                                </div>
                                <div className="search-kv-row">
                                  <span className="search-kv-key">Ø Punkte/Dorf</span>
                                  <span className="search-kv-value">
                                    {Math.round(searchTribeResult.avgPointsPerVillage).toLocaleString("de-DE")}
                                  </span>
                                </div>
                                <div className="search-kv-row">
                                  <span className="search-kv-key">Beste Platzierung</span>
                                  <span className="search-kv-value">
                                    {searchTribeResult.rank || "-"} ({new Date().toLocaleDateString("de-DE")})
                                  </span>
                                </div>
                                <div className="search-kv-row">
                                  <span className="search-kv-key">Max. Dörfer</span>
                                  <span className="search-kv-value">
                                    {searchTribeResult.maxVillages.toLocaleString("de-DE")} ({new Date().toLocaleDateString("de-DE")})
                                  </span>
                                </div>
                                <div className="search-kv-row">
                                  <span className="search-kv-key">Max. Punkte</span>
                                  <span className="search-kv-value">
                                    {searchTribeResult.maxPoints.toLocaleString("de-DE")} ({new Date().toLocaleDateString("de-DE")})
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="panel search-player-card">
                              <div className="search-kv-list">
                                <div className="search-kv-row">
                                  <span className="search-kv-key">Gesamt Kills</span>
                                  <span className="search-kv-value">{searchTribeResult.totalKills.toLocaleString("de-DE")}</span>
                                </div>
                                <div className="search-kv-row">
                                  <span className="search-kv-key">Angreifer Kills</span>
                                  <span className="search-kv-value">{searchTribeResult.attackerKills.toLocaleString("de-DE")}</span>
                                </div>
                                <div className="search-kv-row">
                                  <span className="search-kv-key">Verteidiger Kills</span>
                                  <span className="search-kv-value">{searchTribeResult.defenderKills.toLocaleString("de-DE")}</span>
                                </div>
                                <div className="search-kv-row">
                                  <span className="search-kv-key">Off-Dörfer</span>
                                  <span className="search-kv-value">{searchTribeResult.offVillages.toLocaleString("de-DE")}</span>
                                </div>
                                <div className="search-kv-row">
                                  <span className="search-kv-key">Deff-Dörfer</span>
                                  <span className="search-kv-value">{searchTribeResult.deffVillages.toLocaleString("de-DE")}</span>
                                </div>
                                <div className="search-kv-row">
                                  <span className="search-kv-key">Eroberungen</span>
                                  <span className="search-kv-value">Gesamt: 0 / Verloren: 0</span>
                                </div>
                                <div className="search-kv-row">
                                  <span className="search-kv-key">Intern</span>
                                  <span className="search-kv-value">0</span>
                                </div>
                                <div className="search-kv-row">
                                  <span className="search-kv-key">Babaadelungen</span>
                                  <span className="search-kv-value">0</span>
                                </div>
                                <div className="search-kv-row">
                                  <span className="search-kv-key">Selbst</span>
                                  <span className="search-kv-value">0</span>
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="panel search-metrics-panel">
                            <div className="search-metrics-head">👥 Durchschnittswerte</div>
                            <div className="search-metrics-body">
                              <p>Ø Dörfer je Spieler: {searchTribeResult.members > 0 ? Math.round(searchTribeResult.villages / searchTribeResult.members) : 0}</p>
                              <p>Ø Punkte je Spieler: {Math.round(searchTribeResult.avgPointsPerPlayer).toLocaleString("de-DE")}</p>
                              <p>Ø Punkte je Dorf: {Math.round(searchTribeResult.avgPointsPerVillage).toLocaleString("de-DE")}</p>
                              <p>Kill-Ratio Angreifer/Verteidiger: {searchTribeResult.killRatio}</p>
                            </div>
                          </div>
                          <div className="panel search-map-panel">
                            <div className="search-map-head">Stammeskarte</div>
                            <div className="search-map-body">
                              <canvas ref={searchMapCanvasRef} />
                            </div>
                          </div>
                        </>
                      )}
                    </>
                  )}
                </>
              )}

              {activeSearchTab === "dorffilter" && (
                <>
                  <h3 className="dorffilter-title">Dorffilter</h3>
                  <div className="dorffilter-grid dorffilter-grid-top">
                    <label className="dorffilter-field">
                      <div className="search-autocomplete" ref={villageFilterPlayerSuggestRef}>
                        <input
                          type="text"
                          placeholder="Spielername"
                          value={villageFilterPlayerInput}
                          onChange={(e) => {
                            setVillageFilterPlayerInput(e.target.value);
                            setVillageFilterPlayerSuggestOpen(true);
                          }}
                          onFocus={() => {
                            if (villageFilterPlayerInput.trim().length >= 2) {
                              setVillageFilterPlayerSuggestOpen(true);
                            }
                          }}
                        />
                        {villageFilterPlayerSuggestOpen && villageFilterPlayerSuggestions.length > 0 && (
                          <div className="search-suggestions">
                            {villageFilterPlayerSuggestions.map((name) => (
                              <button
                                type="button"
                                key={name}
                                onClick={() => {
                                  setVillageFilterPlayerInput(name);
                                  setVillageFilterPlayerSuggestOpen(false);
                                }}
                              >
                                {name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </label>
                    <label className="dorffilter-field">
                      <div className="search-autocomplete" ref={villageFilterTribeSuggestRef}>
                        <input
                          type="text"
                          placeholder="Stammes-Tag"
                          value={villageFilterTribeInput}
                          onChange={(e) => {
                            setVillageFilterTribeInput(e.target.value);
                            setVillageFilterTribeSuggestOpen(true);
                          }}
                          onFocus={() => {
                            if (villageFilterTribeInput.trim().length >= 2) {
                              setVillageFilterTribeSuggestOpen(true);
                            }
                          }}
                        />
                        {villageFilterTribeSuggestOpen && villageFilterTribeSuggestions.length > 0 && (
                          <div className="search-suggestions">
                            {villageFilterTribeSuggestions.map((item) => (
                              <button
                                type="button"
                                key={`${item.tag}-${item.name}-${item.value}`}
                                onClick={() => {
                                  setVillageFilterTribeInput(item.value);
                                  setVillageFilterTribeSuggestOpen(false);
                                }}
                              >
                                <span className="search-suggestion-title">{item.value}</span>
                                <span className="search-suggestion-sub">{item.name}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </label>
                  </div>
                  <div className="dorffilter-grid dorffilter-grid-xy">
                    <div className="dorffilter-field dorffilter-field-group">
                      <span className="dorffilter-prefix">X/Y Min</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        placeholder="X"
                        value={villageFilterMinXInput}
                        onChange={(e) => setVillageFilterMinXInput(e.target.value.replace(/[^\d]/g, "").slice(0, 3))}
                      />
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        placeholder="Y"
                        value={villageFilterMinYInput}
                        onChange={(e) => setVillageFilterMinYInput(e.target.value.replace(/[^\d]/g, "").slice(0, 3))}
                      />
                    </div>
                    <div className="dorffilter-field dorffilter-field-group">
                      <span className="dorffilter-prefix">X/Y Max</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        placeholder="X"
                        value={villageFilterMaxXInput}
                        onChange={(e) => setVillageFilterMaxXInput(e.target.value.replace(/[^\d]/g, "").slice(0, 3))}
                      />
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        placeholder="Y"
                        value={villageFilterMaxYInput}
                        onChange={(e) => setVillageFilterMaxYInput(e.target.value.replace(/[^\d]/g, "").slice(0, 3))}
                      />
                    </div>
                  </div>
                  <div className="dorffilter-grid dorffilter-grid-radius">
                    <div className="dorffilter-field dorffilter-field-group">
                      <span className="dorffilter-prefix">Radius um</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        placeholder="Radius"
                        value={villageFilterRadiusInput}
                        onChange={(e) => setVillageFilterRadiusInput(e.target.value.replace(/[^\d]/g, ""))}
                      />
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        placeholder="X"
                        value={villageFilterCenterXInput}
                        onChange={(e) =>
                          setVillageFilterCenterXInput(e.target.value.replace(/[^\d]/g, "").slice(0, 3))
                        }
                      />
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        placeholder="Y"
                        value={villageFilterCenterYInput}
                        onChange={(e) =>
                          setVillageFilterCenterYInput(e.target.value.replace(/[^\d]/g, "").slice(0, 3))
                        }
                      />
                    </div>
                  </div>
                  <div className="dorffilter-actions">
                    <label className="dorffilter-field">
                      <select
                        value={villageFilterTypeInput}
                        onChange={(e) =>
                          setVillageFilterTypeInput(
                            e.target.value as "all" | "off" | "deff" | "bunker" | "unknown"
                          )
                        }
                      >
                        <option value="all">Alle Typen</option>
                        <option value="off">OFF</option>
                        <option value="deff">Deff</option>
                        <option value="bunker">Bunker</option>
                        <option value="unknown">Unbekannt</option>
                      </select>
                    </label>
                    <button type="button" onClick={applyVillageFilter}>
                      Filtern
                    </button>
                  </div>
                  <div className="dorffilter-range-row">
                    <label className="dorffilter-field">
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        placeholder="8000"
                        value={villageFilterMinPointsInput}
                        onChange={(e) =>
                          setVillageFilterMinPointsInput(e.target.value.replace(/[^\d]/g, ""))
                        }
                      />
                    </label>
                    <label className="dorffilter-field">
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        placeholder="10000"
                        value={villageFilterMaxPointsInput}
                        onChange={(e) =>
                          setVillageFilterMaxPointsInput(e.target.value.replace(/[^\d]/g, ""))
                        }
                      />
                    </label>
                    <button type="button" className="dorffilter-apply-btn" onClick={applyVillageFilter}>
                      Anwenden
                    </button>
                    <button type="button" className="dorffilter-export-btn" onClick={exportVillageFilterRows}>
                      Export
                    </button>
                  </div>
                  {villageFilterHasRun && (
                  <div className="accordion">
                    <details className="accordion-item">
                      <summary>Alle ({villageFilterSections.all.length})</summary>
                      {villageFilterSections.all.length === 0 ? (
                        <p className="table-empty">Keine Einträge.</p>
                      ) : (
                        <div className="table-wrapper">
                          <table className="db-table">
                            <thead>
                              <tr>
                                <th>Dorf - Punkte</th>
                                <th>Typ</th>
                                <th>Anzahl Berichte</th>
                              </tr>
                            </thead>
                            <tbody>
                              {villageFilterSections.all.map((row) => (
                                <tr key={`df-all-${row.coord}`}>
                                  <td>
                                    <button
                                      type="button"
                                      className="search-inline-link"
                                      onClick={() => runSearchByCoord(row.coord)}
                                    >
                                      {row.villageName} ({row.coord}) - {Number(row.points ?? 0).toLocaleString("de-DE")}
                                    </button>
                                  </td>
                                  <td>{row.typeLabel}</td>
                                  <td>{villageReportCountByCoord.get(row.coord) ?? 0}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </details>
                    <details className="accordion-item">
                      <summary>Off Dörfer ({villageFilterSections.off.length})</summary>
                      {villageFilterSections.off.length === 0 ? (
                        <p className="table-empty">Keine Einträge.</p>
                      ) : (
                        <div className="dorffilter-result-list">
                          {villageFilterSections.off.map((row) => (
                            <div key={`df-off-${row.coord}`}>
                              <button
                                type="button"
                                className="search-inline-link"
                                onClick={() => runSearchByCoord(row.coord)}
                              >
                                {row.villageName} ({row.coord}) - {Number(row.points ?? 0).toLocaleString("de-DE")}
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </details>
                    <details className="accordion-item">
                      <summary>Deff Dörfer ({villageFilterSections.deff.length})</summary>
                      {villageFilterSections.deff.length === 0 ? (
                        <p className="table-empty">Keine Einträge.</p>
                      ) : (
                        <div className="dorffilter-result-list">
                          {villageFilterSections.deff.map((row) => (
                            <div key={`df-deff-${row.coord}`}>
                              <button
                                type="button"
                                className="search-inline-link"
                                onClick={() => runSearchByCoord(row.coord)}
                              >
                                {row.villageName} ({row.coord}) - {Number(row.points ?? 0).toLocaleString("de-DE")}
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </details>
                    <details className="accordion-item">
                      <summary>Bunker ({villageFilterSections.bunker.length})</summary>
                      {villageFilterSections.bunker.length === 0 ? (
                        <p className="table-empty">Keine Einträge.</p>
                      ) : (
                        <div className="dorffilter-result-list">
                          {villageFilterSections.bunker.map((row) => (
                            <div key={`df-bunker-${row.coord}`}>
                              <button
                                type="button"
                                className="search-inline-link"
                                onClick={() => runSearchByCoord(row.coord)}
                              >
                                {row.villageName} ({row.coord}) - {Number(row.points ?? 0).toLocaleString("de-DE")}
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </details>
                    <details className="accordion-item">
                      <summary>Unbekannt ({villageFilterSections.unknown.length})</summary>
                      {villageFilterSections.unknown.length === 0 ? (
                        <p className="table-empty">Keine Einträge.</p>
                      ) : (
                        <div className="dorffilter-result-list">
                          {villageFilterSections.unknown.map((row) => (
                            <div key={`df-unknown-${row.coord}`}>
                              <button
                                type="button"
                                className="search-inline-link"
                                onClick={() => runSearchByCoord(row.coord)}
                              >
                                {row.villageName} ({row.coord})
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </details>
                  </div>
                  )}
                </>
              )}
            </section>
          )}

          {activeDbTab === "berichte" && (
            <section className="section reports-page">
              <h2 className="reports-title">Berichte durchsuchen</h2>
              <div className="reports-top">
                <label>
                  <span>Accountname</span>
                  <input
                    type="text"
                    placeholder="Account eingeben"
                    value={reportsAccountFilter}
                    onChange={(e) => setReportsAccountFilter(e.target.value)}
                  />
                </label>
                <label>
                  <span>Stamm (Tag)</span>
                  <input
                    type="text"
                    placeholder="Stamm eingeben"
                    value={reportsTribeFilter}
                    onChange={(e) => setReportsTribeFilter(e.target.value)}
                  />
                </label>
                <label>
                  <span>Koordinaten</span>
                  <div className="coords-inputs">
                    <input
                      type="text"
                      placeholder="500"
                      value={reportsCoordX}
                      onChange={(e) => setReportsCoordX(e.target.value)}
                    />
                    <input
                      type="text"
                      placeholder="500"
                      value={reportsCoordY}
                      onChange={(e) => setReportsCoordY(e.target.value)}
                    />
                  </div>
                </label>
              </div>

              <button
                type="button"
                className={`expand-button ${reportsExpanded ? "open" : ""}`}
                onClick={() => setReportsExpanded((prev) => !prev)}
              >
                Erweiterte Suche
              </button>

              {reportsExpanded && (
                <div className="reports-filters">
                  <div className="filter-panel">
                    <h3>Nach Kampfergebnis filtern</h3>
                    <label className="radio">
                      <input type="checkbox" checked={isReportFilterActive("all")} onChange={() => toggleReportFilter("all")} />
                      <span>Alle Typen</span>
                    </label>
                    <label className="radio">
                      <input type="checkbox" checked={isReportFilterActive("spied")} onChange={() => toggleReportFilter("spied")} />
                      <span className="option-with-icon">
                        <img src="https://dsde.innogamescdn.com/asset/985df5a4/graphic/dots/blue.webp" alt="" />
                        Erspäht
                      </span>
                    </label>
                    <label className="radio">
                      <input type="checkbox" checked={isReportFilterActive("full_win")} onChange={() => toggleReportFilter("full_win")} />
                      <span className="option-with-icon">
                        <img src="https://dsde.innogamescdn.com/asset/985df5a4/graphic/dots/green.webp" alt="" />
                        Vollständiger Sieg
                      </span>
                    </label>
                    <label className="radio">
                      <input type="checkbox" checked={isReportFilterActive("losses")} onChange={() => toggleReportFilter("losses")} />
                      <span className="option-with-icon">
                        <img src="https://dsde.innogamescdn.com/asset/985df5a4/graphic/dots/yellow.webp" alt="" />
                        Verluste
                      </span>
                    </label>
                    <label className="radio">
                      <input type="checkbox" checked={isReportFilterActive("defeated_buildings")} onChange={() => toggleReportFilter("defeated_buildings")} />
                      <span className="option-with-icon">
                        <img src="https://dsde.innogamescdn.com/asset/985df5a4/graphic/dots/red_yellow.webp" alt="" />
                        Besiegt, aber Gebäude beschädigt
                      </span>
                    </label>
                    <label className="radio">
                      <input type="checkbox" checked={isReportFilterActive("defeated_spied")} onChange={() => toggleReportFilter("defeated_spied")} />
                      <span className="option-with-icon">
                        <img src="https://dsde.innogamescdn.com/asset/985df5a4/graphic/dots/red_blue.webp" alt="" />
                        Besiegt, aber erspäht
                      </span>
                    </label>
                    <label className="radio">
                      <input type="checkbox" checked={isReportFilterActive("defeated")} onChange={() => toggleReportFilter("defeated")} />
                      <span className="option-with-icon">
                        <img src="https://dsde.innogamescdn.com/asset/985df5a4/graphic/dots/red.webp" alt="" />
                        Besiegt
                      </span>
                    </label>
                  </div>

                  <div className="filter-panel">
                    <h3>Nach Befehlstyp (Größe) filtern</h3>
                    <label className="radio">
                      <input
                        type="radio"
                        name="command-filter"
                        checked={reportCommandFilter === "all"}
                        onChange={() => setReportCommandFilter("all")}
                      />
                      <span>Alle Typen</span>
                    </label>
                    <label className="radio">
                      <input
                        type="radio"
                        name="command-filter"
                        checked={reportCommandFilter === "small"}
                        onChange={() => setReportCommandFilter("small")}
                      />
                      <span className="option-with-icon">
                        <img src="https://dsde.innogamescdn.com/asset/985df5a4/graphic/command/attack_small.webp" alt="" />
                        Kleiner Angriff (1–1000 Truppen)
                      </span>
                    </label>
                    <label className="radio">
                      <input
                        type="radio"
                        name="command-filter"
                        checked={reportCommandFilter === "medium"}
                        onChange={() => setReportCommandFilter("medium")}
                      />
                      <span className="option-with-icon">
                        <img src="https://dsde.innogamescdn.com/asset/985df5a4/graphic/command/attack_medium.webp" alt="" />
                        Mittlerer Angriff (1001–5000 Truppen)
                      </span>
                    </label>
                    <label className="radio">
                      <input
                        type="radio"
                        name="command-filter"
                        checked={reportCommandFilter === "large"}
                        onChange={() => setReportCommandFilter("large")}
                      />
                      <span className="option-with-icon">
                        <img src="https://dsde.innogamescdn.com/asset/985df5a4/graphic/command/attack_large.webp" alt="" />
                        Großer Angriff (5000+ Truppen)
                      </span>
                    </label>

                    <h3>Enthält Truppentyp</h3>
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={reportUnitFilter === "snob"}
                        onChange={() =>
                          setReportUnitFilter((prev) => (prev === "snob" ? null : "snob"))
                        }
                      />
                      <span className="option-with-icon">
                        <img src="https://dsde.innogamescdn.com/asset/985df5a4/graphic/unit/unit_snob.webp" alt="" />
                        Adelsgeschlecht
                      </span>
                    </label>
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={reportUnitFilter === "spy"}
                        onChange={() =>
                          setReportUnitFilter((prev) => (prev === "spy" ? null : "spy"))
                        }
                      />
                      <span className="option-with-icon">
                        <img src="https://dsde.innogamescdn.com/asset/985df5a4/graphic/unit/unit_spy.webp" alt="" />
                        Späher
                      </span>
                    </label>
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={reportUnitFilter === "knight"}
                        onChange={() =>
                          setReportUnitFilter((prev) => (prev === "knight" ? null : "knight"))
                        }
                      />
                      <span className="option-with-icon">
                        <img src="https://dsde.innogamescdn.com/asset/985df5a4/graphic/unit/unit_knight.webp" alt="" />
                        Paladin
                      </span>
                    </label>
                  </div>
                </div>
              )}

              <div className="reports-table-toolbar">
                <label>
                  <select
                    value={reportsRowsPerPage}
                    onChange={(e) => setReportsRowsPerPage(Number(e.target.value))}
                  >
                    <option>10</option>
                    <option>25</option>
                    <option>50</option>
                  </select>
                  <span>Zeilen anzeigen</span>
                </label>
                <button
                  type="button"
                  className="ghost danger"
                  disabled={!activeDbWorld || dbReports.length === 0}
                  onClick={() => {
                    void clearReportsForActiveWorld();
                  }}
                >
                  Berichte löschen
                </button>
                <div className="reports-columns">
                  <button
                    type="button"
                    className="ghost reports-filter-button"
                    ref={reportColumnsButtonRef}
                    onClick={() => {
                      setReportColumnsOpen((prev) => {
                        const next = !prev;
                        if (next && !reportColumnsPos && reportColumnsButtonRef.current) {
                          const rect = reportColumnsButtonRef.current.getBoundingClientRect();
                          setReportColumnsPos({ x: rect.left, y: rect.bottom + 8 });
                        }
                        return next;
                      });
                    }}
                  >
                    <span className="reports-filter-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none">
                        <path
                          d="M3 5h18l-7 8v5l-4 2v-7L3 5z"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                    Spaltenfilter
                  </button>
                  {reportColumnsOpen && (
                    <div
                      className="reports-columns-popover"
                      style={
                        reportColumnsPos
                          ? { left: reportColumnsPos.x, top: reportColumnsPos.y }
                          : undefined
                      }
                    >
                      <div className="reports-columns-header">
                        <div
                          className="reports-columns-title drag-handle"
                          onMouseDown={handleReportColumnsDragStart}
                        >
                          Spalten
                        </div>
                        <button
                          type="button"
                          className="ghost reports-columns-close"
                          onMouseDown={(event) => event.stopPropagation()}
                          onClick={() => setReportColumnsOpen(false)}
                        >
                          ×
                        </button>
                      </div>
                      <div className="reports-columns-grid">
                        {[
                          { id: "attacker", label: "Angreifer" },
                          { id: "defender", label: "Verteidiger" },
                          { id: "origin", label: "Angreiferdorf" },
                          { id: "target", label: "Zieldorf" },
                          { id: "battleTime", label: "Angriffszeit" },
                          { id: "uploaded", label: "Hochgeladen am" },
                          { id: "command", label: "Befehl" },
                          { id: "report", label: "Bericht" },
                        ]
                          .slice()
                          .sort((a, b) => {
                            const aIndex = reportColumns.indexOf(a.id);
                            const bIndex = reportColumns.indexOf(b.id);
                            const aPos = aIndex === -1 ? Number.POSITIVE_INFINITY : aIndex;
                            const bPos = bIndex === -1 ? Number.POSITIVE_INFINITY : bIndex;
                            return aPos - bPos;
                          })
                          .map((col) => {
                          const active = reportColumns.includes(col.id);
                          return (
                            <div key={col.id} className="reports-column-item">
                              <label className="checkbox">
                                <input
                                  type="checkbox"
                                  checked={active}
                                  onChange={() => toggleReportColumn(col.id)}
                                />
                                <span>{col.label}</span>
                              </label>
                              <div className="reports-column-actions">
                                <button
                                  type="button"
                                  className="ghost"
                                  onClick={() => moveReportColumn(col.id, "up")}
                                  disabled={!active || reportColumns.indexOf(col.id) === 0}
                                >
                                  ↑
                                </button>
                                <button
                                  type="button"
                                  className="ghost"
                                  onClick={() => moveReportColumn(col.id, "down")}
                                  disabled={
                                    !active || reportColumns.indexOf(col.id) === reportColumns.length - 1
                                  }
                                >
                                  ↓
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {(() => {
                const columnRenderers = {
                  attacker: (report: (typeof dbReports)[number]) =>
                    report.details?.attacker || "-",
                  defender: (report: (typeof dbReports)[number]) =>
                    report.details?.defender || "-",
                  origin: (report: (typeof dbReports)[number]) =>
                    report.details?.origin || "-",
                  target: (report: (typeof dbReports)[number]) =>
                    report.details?.target || "-",
                  battleTime: (report: (typeof dbReports)[number]) =>
                    report.details?.battleTime || "-",
                  uploaded: (report: (typeof dbReports)[number]) =>
                    new Date(report.fetchedAt).toLocaleString("de"),
                  command: (report: (typeof dbReports)[number]) => {
                    const size = getReportCommandSize(report);
                    const outcomeIcon = getReportOutcomeDotIcon(report);
                    const commandIcon = getCommandIcon(size);
                    const outcomeSrc =
                      outcomeIcon === "gray"
                        ? "/icons/dots/gray.svg"
                        : `https://dsde.innogamescdn.com/asset/985df5a4/graphic/dots/${outcomeIcon}.webp`;
                    return (
                      <span className="command-icons">
                        <img src={outcomeSrc} alt="" />
                        {commandIcon && (
                          <img
                            src={`https://dsde.innogamescdn.com/asset/985df5a4/graphic/command/${commandIcon}.webp`}
                            alt=""
                          />
                        )}
                      </span>
                    );
                  },
                  report: (report: (typeof dbReports)[number]) => (
                    <div className="report-link-wrap">
                      <button
                        type="button"
                        className="report-link"
                        onClick={() => {
                          void openReportViewer(report.id);
                        }}
                        onMouseEnter={(e) =>
                          showReportHover(
                            report.id,
                            e.currentTarget,
                            report.details?.loyalty ? 600 : 520
                          )
                        }
                        onMouseLeave={scheduleHideHover}
                      >
                        {report.title || `Report ${report.id}`}
                      </button>
                    </div>
                  ),
                } as const;
                const columnLabels = {
                  attacker: "Angreifer",
                  defender: "Verteidiger",
                  origin: "Angreiferdorf",
                  target: "Zieldorf",
                  battleTime: "Angriffszeit",
                  uploaded: "Hochgeladen am",
                  command: "Befehl",
                  report: "Bericht",
                } as const;
                const filteredReports = dbReports.filter((report) => {
                  const coordFrom = parseCoord(report.details?.origin ?? "");
                  const coordTo = parseCoord(report.details?.target ?? "");
                  const fromVillage = coordFrom ? dbVillages.get(coordFrom) : undefined;
                  const toVillage = coordTo ? dbVillages.get(coordTo) : undefined;
                  const attackerName = (fromVillage?.playerName ?? report.details?.attacker ?? "").toLowerCase();
                  const defenderName = (toVillage?.playerName ?? report.details?.defender ?? "").toLowerCase();
                  const attackerTag = (fromVillage?.allyTag ?? "").toLowerCase();
                  const defenderTag = (toVillage?.allyTag ?? "").toLowerCase();
                  const accountNeedle = debouncedReportsAccountFilter.toLowerCase();
                  if (accountNeedle) {
                    if (!attackerName.includes(accountNeedle) && !defenderName.includes(accountNeedle)) {
                      return false;
                    }
                  }
                  const tribeNeedle = debouncedReportsTribeFilter.toLowerCase();
                  if (tribeNeedle) {
                    if (!attackerTag.includes(tribeNeedle) && !defenderTag.includes(tribeNeedle)) {
                      return false;
                    }
                  }
                  const coordX = debouncedReportsCoordX;
                  const coordY = debouncedReportsCoordY;
                  if (coordX || coordY) {
                    const matchesFrom =
                      (!coordX || coordFrom.startsWith(`${coordX}|`)) &&
                      (!coordY || coordFrom.endsWith(`|${coordY}`));
                    const matchesTo =
                      (!coordX || coordTo.startsWith(`${coordX}|`)) &&
                      (!coordY || coordTo.endsWith(`|${coordY}`));
                    if (!matchesFrom && !matchesTo) {
                      return false;
                    }
                  }
                  const icon = getReportOutcomeDotIcon(report);
                  const matches: boolean[] = [];
                  if (reportResultFilters.has("spied")) matches.push(icon === "blue");
                  if (reportResultFilters.has("full_win")) matches.push(icon === "green");
                  if (reportResultFilters.has("losses")) matches.push(icon === "yellow");
                  if (reportResultFilters.has("defeated_buildings")) matches.push(icon === "red_yellow");
                  if (reportResultFilters.has("defeated_spied")) matches.push(icon === "red_blue");
                  if (reportResultFilters.has("defeated")) matches.push(icon === "red");
                  const resultMatch = reportResultFilters.has("all") ? true : matches.some(Boolean);
                  if (!resultMatch) return false;
                  if (reportCommandFilter !== "all") {
                    const size = getReportCommandSize(report);
                    if (size !== reportCommandFilter) return false;
                  }
                  if (reportUnitFilter) {
                    const units = report.details?.attackerUnits ?? {};
                    if ((units[reportUnitFilter] ?? 0) <= 0) return false;
                  }

                  if (!dbSelectedPlayerId && !dbSelectedPlayerName) {
                    return true;
                  }
                  return true;
                });
                const sortedReports = [...filteredReports].sort((a, b) => {
                  if (!reportSortKey) return 0;
                  const getValue = (report: (typeof dbReports)[number]) => {
                    const coordFrom = parseCoord(report.details?.origin ?? "");
                    const coordTo = parseCoord(report.details?.target ?? "");
                    const fromVillage = coordFrom ? dbVillages.get(coordFrom) : undefined;
                    const toVillage = coordTo ? dbVillages.get(coordTo) : undefined;
                    switch (reportSortKey) {
                      case "attacker":
                        return (fromVillage?.playerName ?? report.details?.attacker ?? "").toLowerCase();
                      case "defender":
                        return (toVillage?.playerName ?? report.details?.defender ?? "").toLowerCase();
                      case "origin":
                        return report.details?.origin ?? "";
                      case "target":
                        return report.details?.target ?? "";
                      case "battleTime":
                        return parseBattleTime(report.details?.battleTime);
                      case "uploaded":
                        return new Date(report.fetchedAt).getTime();
                      case "command":
                        return getReportCommandSize(report);
                      case "report":
                        return (report.title || "").toLowerCase();
                      default:
                        return "";
                    }
                  };
                  const aVal = getValue(a);
                  const bVal = getValue(b);
                  if (typeof aVal === "number" && typeof bVal === "number") {
                    const diff = reportSortDir === "asc" ? aVal - bVal : bVal - aVal;
                    if (diff !== 0) return diff;
                    return new Date(b.fetchedAt).getTime() - new Date(a.fetchedAt).getTime();
                  }
                  const aStr = String(aVal);
                  const bStr = String(bVal);
                  if (aStr === bStr) return 0;
                  const cmp =
                    reportSortDir === "asc"
                      ? aStr.localeCompare(bStr, "de", { numeric: true, sensitivity: "base" })
                      : bStr.localeCompare(aStr, "de", { numeric: true, sensitivity: "base" });
                  if (cmp !== 0) return cmp;
                  return new Date(b.fetchedAt).getTime() - new Date(a.fetchedAt).getTime();
                });
                const pagedReports = sortedReports.slice(0, reportsRowsPerPage);
                const activeColumns = reportColumns.filter((col) => col in columnRenderers);
                return (
                  <>
                    <div className="table-wrapper reports-table-wrapper">
                      <table className="db-table reports-table">
                  <thead>
                    <tr>
                      {activeColumns.map((col) => {
                        const isActive = reportSortKey === col;
                        return (
                          <th key={col}>
                            <button
                              type="button"
                              className={`reports-sort-button ${isActive ? "active" : ""}`}
                              onClick={() => {
                                if (reportSortKey === col) {
                                  setReportSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
                                } else {
                                  setReportSortKey(col);
                                  setReportSortDir("asc");
                                }
                              }}
                            >
                              {columnLabels[col as keyof typeof columnLabels]}
                              <span className="reports-sort-indicator">
                                {isActive ? (reportSortDir === "asc" ? "↑" : "↓") : "↕"}
                              </span>
                            </button>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredReports.length === 0 && (
                      <tr>
                        <td colSpan={activeColumns.length || 1} className="table-empty">
                          Keine Berichte vorhanden.
                        </td>
                      </tr>
                    )}
                    {pagedReports.map((report) => (
                      <tr key={report.id} className="report-row">
                        {activeColumns.map((col) => (
                          <td key={`${report.id}-${col}`}>
                            {columnRenderers[col as keyof typeof columnRenderers](report)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                      </table>
                    </div>
                    <div className="reports-count">
                      {pagedReports.length} von {filteredReports.length} Berichten (gesamt {dbReports.length})
                    </div>
                  </>
                );
              })()}
          {reportViewerId && (
            <div className="report-viewer-overlay">
              <div className="report-viewer-panel">
                <div className="report-viewer-header">
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      setReportViewerId(null);
                      setReportViewerError("");
                    }}
                  >
                    Zurück
                  </button>
                  <h3>Berichtdetails</h3>
                </div>
                {reportViewerLoading && (
                  <div className="table-empty">Bericht wird geladen...</div>
                )}
                {!reportViewerLoading && reportViewerError && (
                  <div className="table-empty">{reportViewerError}</div>
                )}
                {!reportViewerLoading && !reportViewerError && !reportViewerReport && (
                  <div className="table-empty">Bericht nicht gefunden.</div>
                )}
                {!reportViewerLoading && !reportViewerError && reportViewerReport && (
                  <div className="report-viewer-content">
                    <div className="report-hover-card">
                      <div className="report-hover-title">
                        {reportViewerReport.title || `Report ${reportViewerReport.id}`}
                      </div>
                      <div className="report-hover-time">
                        {reportViewerReport.details?.battleTime || "-"}
                      </div>
                      {reportViewerReport.details?.headline && (
                        <div className="report-hover-headline">
                          {reportViewerReport.details.headline}
                        </div>
                      )}
                      <div className="report-hover-luck">
                        <span>Angreiferglück:</span>
                        <span className="luck-value">
                          {reportViewerReport.details?.attackerLuck || "0%"}
                        </span>
                      </div>
                      {reportViewerReport.details?.moral && (
                        <div className="report-hover-moral">{reportViewerReport.details.moral}</div>
                      )}

                      <div className="report-side">
                        <div className="report-side-title">
                          Angreifer: {reportViewerReport.details?.attacker || "---"}
                        </div>
                        <div className="report-side-sub">
                          Herkunft: {reportViewerReport.details?.origin || "-"}
                        </div>
                        {renderUnitRow(reportViewerReport.details?.attackerUnits ?? {})}
                        <div className="report-losses">Verluste</div>
                        {renderUnitRow(reportViewerReport.details?.attackerLossesUnits ?? {})}
                      </div>

                      <div className="report-side">
                        <div className="report-side-title">
                          Verteidiger: {reportViewerReport.details?.defender || "---"}
                        </div>
                        <div className="report-side-sub">
                          Ziel: {reportViewerReport.details?.target || "-"}
                        </div>
                        {renderUnitRow(reportViewerReport.details?.defenderUnits ?? {})}
                        <div className="report-losses">Verluste</div>
                        {renderUnitRow(reportViewerReport.details?.defenderLossesUnits ?? {})}
                      </div>

                      {(hasUnit(reportViewerReport.details?.attackerUnits ?? {}, "snob") ||
                        hasUnit(reportViewerReport.details?.defenderUnits ?? {}, "snob")) &&
                        reportViewerReport.details?.loyalty && (
                          <div className="report-extra">
                            <strong>Zustimmung:</strong> {reportViewerReport.details.loyalty}
                          </div>
                        )}

                      {(hasUnit(reportViewerReport.details?.attackerUnits ?? {}, "ram") ||
                        hasUnit(reportViewerReport.details?.attackerUnits ?? {}, "catapult") ||
                        hasUnit(reportViewerReport.details?.defenderUnits ?? {}, "ram") ||
                        hasUnit(reportViewerReport.details?.defenderUnits ?? {}, "catapult")) &&
                        reportViewerReport.details?.buildingDamage?.length > 0 && (
                          <div className="report-extra">
                            <strong>Gebäudeschaden:</strong>
                            <div className="report-extra-list">
                              {reportViewerReport.details.buildingDamage.map((line) => (
                                <div key={line}>{line}</div>
                              ))}
                            </div>
                          </div>
                        )}

                      {(() => {
                        const buildings = filterReportBuildingsForDisplay(
                          reportViewerReport.details?.buildings
                        );
                        if (Object.keys(buildings).length === 0) return null;
                        return (
                          <div className="report-side">
                            <div className="report-side-title">Gebäude</div>
                            <div className="report-side-sub">Aus Spionagebericht</div>
                            {renderVillageBuildingsRow(buildings)}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          {hoveredReportId && (
            <div
              className="report-hover-floating"
              style={{
                top: hoverPos.top,
                left: hoverPos.left,
                height: getReportHoverHeight(
                  dbReports.find((item) => item.id === hoveredReportId),
                  hoverHeight
                ),
              }}
              onMouseEnter={() => {
                if (hoverHideTimerRef.current) {
                  window.clearTimeout(hoverHideTimerRef.current);
                  hoverHideTimerRef.current = null;
                }
              }}
              onMouseLeave={scheduleHideHover}
            >
              {(() => {
                const report = dbReports.find((item) => item.id === hoveredReportId);
                if (!report) return null;
                return (
                  <div className="report-hover-card">
                    <div className="report-hover-title">Bericht</div>
                    <div className="report-hover-time">{report.details?.battleTime || "-"}</div>
                    {report.details?.headline && (
                      <div className="report-hover-headline">{report.details.headline}</div>
                    )}
                    <div className="report-hover-luck">
                      <span>Angreiferglück:</span>
                      <span className="luck-value">{report.details?.attackerLuck || "0%"}</span>
                    </div>
                    {report.details?.moral && (
                      <div className="report-hover-moral">{report.details.moral}</div>
                    )}

                    <div className="report-side">
                      <div className="report-side-title">
                        Angreifer: {report.details?.attacker || "---"}
                      </div>
                      <div className="report-side-sub">
                        Herkunft: {report.details?.origin || "-"}
                      </div>
                      {renderUnitRow(report.details?.attackerUnits ?? {})}
                      <div className="report-losses">Verluste</div>
                      {renderUnitRow(report.details?.attackerLossesUnits ?? {})}
                    </div>

                    <div className="report-side">
                      <div className="report-side-title">
                        Verteidiger: {report.details?.defender || "---"}
                      </div>
                      <div className="report-side-sub">
                        Ziel: {report.details?.target || "-"}
                      </div>
                      {renderUnitRow(report.details?.defenderUnits ?? {})}
                      <div className="report-losses">Verluste</div>
                      {renderUnitRow(report.details?.defenderLossesUnits ?? {})}
                    </div>

                    {(hasUnit(report.details?.attackerUnits ?? {}, "snob") ||
                      hasUnit(report.details?.defenderUnits ?? {}, "snob")) &&
                      report.details?.loyalty && (
                        <div className="report-extra">
                          <strong>Zustimmung:</strong> {report.details.loyalty}
                        </div>
                      )}

                    {(hasUnit(report.details?.attackerUnits ?? {}, "ram") ||
                      hasUnit(report.details?.attackerUnits ?? {}, "catapult") ||
                      hasUnit(report.details?.defenderUnits ?? {}, "ram") ||
                      hasUnit(report.details?.defenderUnits ?? {}, "catapult")) &&
                      report.details?.buildingDamage?.length > 0 && (
                        <div className="report-extra">
                          <strong>Gebäudeschaden:</strong>
                          <div className="report-extra-list">
                            {report.details.buildingDamage.map((line) => (
                              <div key={line}>{line}</div>
                            ))}
                          </div>
                        </div>
                      )}

                    {(() => {
                      const buildings = filterReportBuildingsForDisplay(report.details?.buildings);
                      if (Object.keys(buildings).length === 0) return null;
                      return (
                        <div className="report-side">
                          <div className="report-side-title">Gebäude</div>
                          <div className="report-side-sub">Aus Spionagebericht</div>
                          {renderVillageBuildingsRow(buildings)}
                        </div>
                      );
                    })()}
                  </div>
                );
              })()}
            </div>
          )}
        </section>
          )}

          {activeDbTab !== "berichte" && hoveredReportId && (
            <div
              className="report-hover-floating"
              style={{
                top: hoverPos.top,
                left: hoverPos.left,
                height: getReportHoverHeight(
                  dbReports.find((item) => item.id === hoveredReportId),
                  hoverHeight
                ),
              }}
              onMouseEnter={() => {
                if (hoverHideTimerRef.current) {
                  window.clearTimeout(hoverHideTimerRef.current);
                  hoverHideTimerRef.current = null;
                }
              }}
              onMouseLeave={scheduleHideHover}
            >
              {(() => {
                const report = dbReports.find((item) => item.id === hoveredReportId);
                if (!report) return null;
                return (
                  <div className="report-hover-card">
                    <div className="report-hover-title">Bericht</div>
                    <div className="report-hover-time">{report.details?.battleTime || "-"}</div>
                    {report.details?.headline && (
                      <div className="report-hover-headline">{report.details.headline}</div>
                    )}
                    <div className="report-hover-luck">
                      <span>Angreiferglück:</span>
                      <span className="luck-value">{report.details?.attackerLuck || "0%"}</span>
                    </div>
                    {report.details?.moral && (
                      <div className="report-hover-moral">{report.details.moral}</div>
                    )}

                    <div className="report-side">
                      <div className="report-side-title">
                        Angreifer: {report.details?.attacker || "---"}
                      </div>
                      <div className="report-side-sub">
                        Herkunft: {report.details?.origin || "-"}
                      </div>
                      {renderUnitRow(report.details?.attackerUnits ?? {})}
                      <div className="report-losses">Verluste</div>
                      {renderUnitRow(report.details?.attackerLossesUnits ?? {})}
                    </div>

                    <div className="report-side">
                      <div className="report-side-title">
                        Verteidiger: {report.details?.defender || "---"}
                      </div>
                      <div className="report-side-sub">
                        Ziel: {report.details?.target || "-"}
                      </div>
                      {renderUnitRow(report.details?.defenderUnits ?? {})}
                      <div className="report-losses">Verluste</div>
                      {renderUnitRow(report.details?.defenderLossesUnits ?? {})}
                    </div>

                    {(hasUnit(report.details?.attackerUnits ?? {}, "snob") ||
                      hasUnit(report.details?.defenderUnits ?? {}, "snob")) &&
                      report.details?.loyalty && (
                        <div className="report-extra">
                          <strong>Zustimmung:</strong> {report.details.loyalty}
                        </div>
                      )}

                    {(hasUnit(report.details?.attackerUnits ?? {}, "ram") ||
                      hasUnit(report.details?.attackerUnits ?? {}, "catapult") ||
                      hasUnit(report.details?.defenderUnits ?? {}, "ram") ||
                      hasUnit(report.details?.defenderUnits ?? {}, "catapult")) &&
                      report.details?.buildingDamage?.length > 0 && (
                        <div className="report-extra">
                          <strong>Gebäudeschaden:</strong>
                          <div className="report-extra-list">
                            {report.details.buildingDamage.map((line) => (
                              <div key={line}>{line}</div>
                            ))}
                          </div>
                        </div>
                      )}

                    {(() => {
                      const buildings = filterReportBuildingsForDisplay(report.details?.buildings);
                      if (Object.keys(buildings).length === 0) return null;
                      return (
                        <div className="report-side">
                          <div className="report-side-title">Gebäude</div>
                          <div className="report-side-sub">Aus Spionagebericht</div>
                          {renderVillageBuildingsRow(buildings)}
                        </div>
                      );
                    })()}
                  </div>
                );
              })()}
            </div>
          )}
          {attackTypeHover && (
            <div
              className="attack-type-hover-popup"
              style={{ top: attackTypeHover.top, left: attackTypeHover.left }}
              onMouseEnter={() => {
                // keep open while hovering popup
              }}
              onMouseLeave={() => setAttackTypeHover(null)}
            >
              <div className="attack-type-hover-title">{attackTypeHover.title}</div>
              {attackTypeHover.lines.map((line) => (
                <div key={line} className="attack-type-hover-line">
                  {line}
                </div>
              ))}
            </div>
          )}

          {activeDbTab === "angriffe" && (
            <section className="section">
              <div className="section-header">
                <h2>Angriffe</h2>
                <div className="subtabs">
                  <button
                    type="button"
                    className={`tab ${activeAttacksTab === "eigene" ? "active" : ""}`}
                    onClick={() => setActiveAttacksTab("eigene")}
                  >
                    Eigene Angriffe
                  </button>
                  <button
                    type="button"
                    className={`tab ${activeAttacksTab === "alle" ? "active" : ""}`}
                    onClick={() => setActiveAttacksTab("alle")}
                  >
                    Eingehende Angriffe
                  </button>
                  <button
                    type="button"
                    className={`tab ${activeAttacksTab === "tabit" ? "active" : ""}`}
                    onClick={() => setActiveAttacksTab("tabit")}
                  >
                    Tab it
                  </button>
                  <button
                    type="button"
                    className={`tab ${activeAttacksTab === "retimes" ? "active" : ""}`}
                    onClick={() => setActiveAttacksTab("retimes")}
                  >
                    Aktuelle Retimes
                  </button>
                </div>
              </div>

              {activeAttacksTab === "eigene" && (
                <>
                  <div className="filter-bar">
                    <input
                      type="text"
                      placeholder="Angreifer"
                      value={ownAttackFilterPlayer}
                      onChange={(e) => setOwnAttackFilterPlayer(e.target.value)}
                    />
                    <input
                      type="text"
                      placeholder="Koordinaten"
                      value={ownAttackFilterCoord}
                      onChange={(e) => setOwnAttackFilterCoord(e.target.value)}
                    />
                    <select
                      value={ownAttackFilterType}
                      onChange={(e) =>
                        setOwnAttackFilterType(
                          (e.target.value as "all" | "attack" | "support" | "return") || "all"
                        )
                      }
                    >
                      <option value="all">Typ</option>
                      <option value="attack">Angriff</option>
                      <option value="support">Unterstützung</option>
                      <option value="return">Rückkehr</option>
                    </select>
                    <input
                      type="date"
                      value={ownAttackFilterDate}
                      onChange={(e) => setOwnAttackFilterDate(e.target.value)}
                    />
                  </div>
                  <div className="table-wrapper">
                    <table className="db-table">
                      <thead>
                        <tr>
                          <th>Typ</th>
                          <th>Angreifer</th>
                          <th>Herkunft</th>
                          <th>Ziel</th>
                          <th>Report</th>
                          <th>Grund</th>
                          <th>Ankunft</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredOwnOutgoingAttacks.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="table-empty">
                              Keine laufenden Angriffe.
                            </td>
                          </tr>
                        ) : (
                          filteredOwnOutgoingAttacks.map((row) => (
                            <tr key={row.id}>
                              <td>
                                {row.commandType === "attack"
                                  ? "Angriff"
                                  : row.commandType === "support"
                                  ? "Unterstützung"
                                  : "Rückkehr"}
                              </td>
                              <td>{dbSelectedPlayerName || "-"}</td>
                              <td>
                                {row.originName} ({row.originCoord})
                              </td>
                              <td>
                                {row.targetName} ({row.targetCoord})
                              </td>
                              <td>-</td>
                              <td>{row.commandLabel}</td>
                              <td>{renderDateTimeTwoLine(row.arrivalLabel)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {activeAttacksTab === "alle" && (
                <>
                  <div className="table-wrapper">
                    <table className="db-table">
                      <thead>
                        <tr>
                          <th>Spieler</th>
                          <th>Herkunft</th>
                          <th>Einheit</th>
                          <th>Ziel</th>
                          <th>Ankunft</th>
                          <th>Typ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allAttackRows.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="table-empty">
                              Keine eingelesenen Angriffe vorhanden.
                            </td>
                          </tr>
                        ) : (
                          allAttackRows.map((row) => (
                            <tr key={row.id}>
                              <td>{row.playerName}</td>
                              <td>
                                {row.originName} ({row.originCoord})
                              </td>
                              <td>{row.unitLabel}</td>
                              <td>
                                {row.targetName} ({row.targetCoord})
                              </td>
                              <td>{renderDateTimeTwoLine(row.arrivalLabel)}</td>
                              <td>
                                <span
                                  className="attack-type-badge"
                                  onMouseEnter={(event) => {
                                    const rect = event.currentTarget.getBoundingClientRect();
                                    const width = 320;
                                    const preferredLeft = rect.right + 12;
                                    const fitsRight = preferredLeft + width + 12 <= window.innerWidth;
                                    const left = fitsRight
                                      ? preferredLeft
                                      : Math.max(12, rect.left - width - 12);
                                    const top = Math.max(
                                      12,
                                      Math.min(rect.top + rect.height / 2 - 90, window.innerHeight - 220)
                                    );
                                    setAttackTypeHover({
                                      top,
                                      left,
                                      title: `Typ: ${row.predictedType.label}`,
                                      lines: row.predictedType.reasonLines,
                                    });
                                  }}
                                  onMouseLeave={() => setAttackTypeHover(null)}
                                >
                                  {row.predictedType.label}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {activeAttacksTab === "tabit" && (
                <div className="tabit-page">
                  <h3 className="tabit-title">Tab It</h3>
                  <p className="tabit-intro">
                    Bevor ihr dieses Tool benutzt, müsst ihr eure Truppen eingelesen haben!
                  </p>
                  <p className="tabit-intro">
                    Gib anschließend die Truppen ein, mit denen du taben möchtest, und trage die
                    SoS-Anfrage ein, auf die du reagieren willst - egal ob als Angriff oder Unterstützung.
                  </p>

                  <div className="tabit-units-grid">
                    {dbOverviewUnitOrder.map((unit) => (
                      <label key={`tabit-unit-${unit}`} className="tabit-unit-field">
                        <span className="tabit-unit-icon">
                          <img
                            src={`https://dsde.innogamescdn.com/asset/985df5a4/graphic/unit/unit_${unit}.webp`}
                            alt={getUnitLabelDe(unit)}
                          />
                        </span>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={Number(tabitUnits[unit] ?? 0) <= 0 ? "0" : String(tabitUnits[unit])}
                          onChange={(e) => {
                            const digits = e.target.value.replace(/[^\d]/g, "");
                            setTabitUnits((prev) => ({
                              ...prev,
                              [unit]: digits ? Math.max(0, Number(digits)) : 0,
                            }));
                          }}
                        />
                      </label>
                    ))}
                  </div>

                  <div className="tabit-options-grid">
                    <label>
                      <span>Freundschaftsbonus</span>
                      <select
                        value={tabitFriendshipBonus}
                        onChange={(e) => setTabitFriendshipBonus(e.target.value)}
                      >
                        <option value="0%">0%</option>
                        <option value="5%">5%</option>
                        <option value="10%">10%</option>
                        <option value="15%">15%</option>
                        <option value="20%">20%</option>
                        <option value="25%">25%</option>
                      </select>
                    </label>
                    <label>
                      <span>UT-Booster</span>
                      <select value={tabitUtBooster} onChange={(e) => setTabitUtBooster(e.target.value)}>
                        <option value="0%">0%</option>
                        <option value="5%">5%</option>
                        <option value="10%">10%</option>
                        <option value="15%">15%</option>
                        <option value="20%">20%</option>
                        <option value="25%">25%</option>
                      </select>
                    </label>
                    <label>
                      <span>Anzahl Ergebnisse</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={tabitResultCount}
                        onChange={(e) =>
                          setTabitResultCount(e.target.value.replace(/[^\d]/g, "").slice(0, 3))
                        }
                      />
                    </label>
                  </div>

                  <div className="tabit-toggles">
                    <label className="tabit-toggle">
                      <input
                        type="checkbox"
                        checked={tabitIgnorePaladin}
                        onChange={(e) => setTabitIgnorePaladin(e.target.checked)}
                      />
                      <span>Paladin ignorieren bei Unterstützung</span>
                    </label>
                    <label className="tabit-toggle">
                      <input
                        type="checkbox"
                        checked={tabitNoDuplicateTargets}
                        onChange={(e) => setTabitNoDuplicateTargets(e.target.checked)}
                      />
                      <span>Keine doppelten Herkunftsdörfer erlauben</span>
                    </label>
                    <label className="tabit-toggle">
                      <input
                        type="checkbox"
                        checked={tabitSendAsSupport}
                        onChange={(e) => setTabitSendAsSupport(e.target.checked)}
                      />
                      <span>Als Unterstützung senden</span>
                    </label>
                  </div>

                  <label className="tabit-sos">
                    <span>SoS-Anfrage</span>
                    <textarea
                      placeholder="Kopiere hier deine SoS-Anfrage hinein..."
                      value={tabitSosRequest}
                      onChange={(e) => setTabitSosRequest(e.target.value)}
                    />
                  </label>

                  <div className="tabit-actions">
                    <button
                      type="button"
                      onClick={handleTabitCalculate}
                    >
                      Angriffe berechnen
                    </button>
                  </div>
                  {tabitStatus && <div className="world-message">{tabitStatus}</div>}

                  {tabitResults.length > 0 && (
                    <>
                      <div className="tabit-batch-controls">
                        <label>
                          <span>Actions per batch</span>
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={tabitOpenPerBatch <= 0 ? "" : String(tabitOpenPerBatch)}
                            onChange={(e) => {
                              const digits = e.target.value.replace(/[^\d]/g, "");
                              if (!digits) {
                                setTabitOpenPerBatch(0);
                                return;
                              }
                              setTabitOpenPerBatch(Math.max(1, Number(digits)));
                            }}
                            onBlur={() => setTabitOpenPerBatch((prev) => (prev <= 0 ? 1 : prev))}
                          />
                        </label>
                        <label>
                          <span>Delay opening tabs (ms)</span>
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={tabitOpenDelay <= 0 ? "" : String(tabitOpenDelay)}
                            onChange={(e) => {
                              const digits = e.target.value.replace(/[^\d]/g, "");
                              if (!digits) {
                                setTabitOpenDelay(0);
                                return;
                              }
                              setTabitOpenDelay(Math.max(0, Number(digits)));
                            }}
                          />
                        </label>
                      </div>

                      <div className="fake-generator-open-buttons">
                        {buildTabitRanges(tabitResults.length).map((range) => (
                          <button
                            key={`tabit-open-${range.start}-${range.end}`}
                            type="button"
                            className="ghost"
                            onClick={() => openTabitRange(tabitResults, range.start, range.end)}
                          >
                            Open tabs [{range.start + 1}-{range.end}]
                          </button>
                        ))}
                      </div>

                      <div className="table-wrapper">
                        <table className="db-table">
                          <thead>
                            <tr>
                              <th>Herkunftsdorf</th>
                              <th>Ziel</th>
                              <th>Modus</th>
                              <th>Abschicken</th>
                              <th>Ankunft</th>
                              <th>Zeit bis zum Abschicken</th>
                              <th>Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {tabitResults.map((row) => (
                              <tr key={row.id}>
                                <td>
                                  {row.sourceName} ({row.sourceCoord})
                                </td>
                                <td>
                                  {row.targetName} ({row.targetCoord})
                                </td>
                                <td>{row.mode === "support" ? "Unterstützung" : "Angriff"}</td>
                                <td>{renderDateTimeTwoLine(row.sendLabel)}</td>
                                <td>{renderDateTimeTwoLine(row.arrivalLabel)}</td>
                                <td>{formatSendCountdown(new Date(row.sendIso), plannerNow)}</td>
                                <td>
                                  {row.link ? (
                                    <a className="play-link" href={row.link} target="_blank" rel="noreferrer">
                                      ▶
                                    </a>
                                  ) : (
                                    <span className="muted">-</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <label className="wb-dsu-label">
                        <span>DS Ultimate Export</span>
                        <textarea
                          className="wb-dsu-textarea"
                          value={tabitExportText}
                          readOnly
                        />
                      </label>
                      <div className="wb-dsu-actions">
                        <button
                          type="button"
                          onClick={() => {
                            if (!tabitExportText.trim()) {
                              setTabitStatus("No DS Ultimate export rows available.");
                              return;
                            }
                            void navigator.clipboard.writeText(tabitExportText);
                            setTabitStatus("DS Ultimate export copied to clipboard.");
                          }}
                        >
                          Copy Export
                        </button>
                      </div>

                      <label className="wb-dsu-label">
                        <span>BB Code Export</span>
                        <textarea
                          className="wb-dsu-textarea"
                          value={tabitBbCodeText}
                          readOnly
                        />
                      </label>
                      <div className="wb-dsu-actions">
                        <button
                          type="button"
                          onClick={() => {
                            if (!tabitBbCodeText.trim()) {
                              setTabitStatus("No BB code rows available.");
                              return;
                            }
                            void navigator.clipboard.writeText(tabitBbCodeText);
                            setTabitStatus("BB code copied to clipboard.");
                          }}
                        >
                          Copy BB Code
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {activeAttacksTab === "retimes" && (
                <div className="panel">
                  <h3>Aktuelle Retimes</h3>
                  <div className="filter-bar">
                    <label>
                      <span>Max. Ergebnisse</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={retimeMaxResults}
                        onChange={(e) =>
                          setRetimeMaxResults(e.target.value.replace(/[^\d]/g, "").slice(0, 4))
                        }
                      />
                    </label>
                    <label className="tabit-toggle">
                      <input
                        type="checkbox"
                        checked={retimeSendAsSupport}
                        onChange={(e) => setRetimeSendAsSupport(e.target.checked)}
                      />
                      <span>Als Unterstützung senden</span>
                    </label>
                  </div>
                  <div className="table-wrapper">
                    <table className="db-table">
                      <thead>
                        <tr>
                          <th>Herkunftsdorf</th>
                          <th>Off-Truppen</th>
                          <th>Spieler</th>
                          <th>Zieldorf</th>
                          <th>Abschickzeit</th>
                          <th>Ankunftszeit</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {retimeRows.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="table-empty">
                              Keine möglichen Retimes gefunden (prüfe Off-Dörfer, Truppen und Zeiten).
                            </td>
                          </tr>
                        ) : (
                          retimeRows.map((row) => (
                            <tr key={row.id}>
                              <td>
                                {row.sourceName} ({row.sourceCoord})
                              </td>
                              <td>{renderRetimeUnitPack(row.unitPack)}</td>
                              <td>{row.attackerPlayer}</td>
                              <td>
                                {row.targetName} ({row.targetCoord})
                              </td>
                              <td>{renderDateTimeTwoLine(row.sendAtLabel)}</td>
                              <td>{renderDateTimeTwoLine(row.arrivalAtLabel)}</td>
                              <td>
                                {row.link ? (
                                  <a className="play-link" href={row.link} target="_blank" rel="noreferrer">
                                    ▶
                                  </a>
                                ) : (
                                  <span className="muted">-</span>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
    </div>
  );
}

function compareString(a?: string | null, b?: string | null): number {
  const left = a ?? "";
  const right = b ?? "";
  return left.localeCompare(right, "de", { sensitivity: "base" });
}

function splitDateTimeLabel(value: string): { date: string; time: string } {
  const raw = (value || "").trim();
  if (!raw || raw === "-") return { date: "-", time: "" };
  const normalized = raw.replace(/\s+/g, " ").trim();
  let match = normalized.match(/^([^,]+),\s*(\d{1,2}:\d{2}:\d{2}(?:\.\d+)?)$/);
  if (match) return { date: match[1].trim(), time: match[2].trim() };
  match = normalized.match(/^([0-3]?\d\.[01]?\d\.\d{2,4})\s+(\d{1,2}:\d{2}:\d{2}(?:\.\d+)?)$/);
  if (match) return { date: match[1].trim(), time: match[2].trim() };
  match = normalized.match(/^(heute|morgen|gestern)\s+um\s+(\d{1,2}:\d{2}:\d{2})$/i);
  if (match) return { date: match[1].trim(), time: match[2].trim() };
  return { date: normalized, time: "" };
}

function renderDateTimeTwoLine(value: string) {
  const { date, time } = splitDateTimeLabel(value);
  return (
    <span className="dt-two-line">
      <span>{date}</span>
      <span>{time || "\u00a0"}</span>
    </span>
  );
}

function formatSendCountdown(sendAt: Date, nowMs: number) {
  const diffSeconds = Math.floor((sendAt.getTime() - nowMs) / 1000);
  if (diffSeconds <= 0) return "sofort";
  return formatDuration(diffSeconds);
}

function buildDsUltimateLine(row: AttackRow) {
  const attackerVillageId = row.attacker?.villageId ?? "0";
  const targetVillageId = row.target?.villageId ?? "0";
  const unit = (row.unit ?? "ram").toLowerCase();
  const arrivalTimestampMs = row.arrivalFrom.getTime();
  const typeCodeMap: Record<AttackCommandType, number> = {
    attack: 8,
    ag: 11,
    fake: 14,
    wallbreaker: 45,
  };
  const typeCode = row.commandType ? typeCodeMap[row.commandType] : 8;
  return `${attackerVillageId}&${targetVillageId}&${unit}&${arrivalTimestampMs}&${typeCode}&false&false&spear=/sword=/axe=/archer=/spy=/light=/marcher=/heavy=/ram=/catapult=/knight=/snob=/militia=MA==`;
}

function parseDsUltimateCommandsToRows(
  commands: string,
  villageIdToCoord: Map<string, string>
): Array<{
  attackerCoord: string;
  targetCoord: string;
  arrivalAt: string;
  unit: string;
  commandType: "attack" | "fake" | "ag" | "wallbreaker";
}> {
  const rows: Array<{
    attackerCoord: string;
    targetCoord: string;
    arrivalAt: string;
    unit: string;
    commandType: "attack" | "fake" | "ag" | "wallbreaker";
  }> = [];
  const lines = commands
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (const line of lines) {
    const parts = line.split("&");
    if (parts.length < 5) continue;
    const attackerId = parts[0]?.trim();
    const targetId = parts[1]?.trim();
    const unit = (parts[2] || "ram").trim().toLowerCase();
    const timestampMs = Number(parts[3]);
    const typeCode = Number(parts[4]);
    const attackerCoord = villageIdToCoord.get(attackerId);
    const targetCoord = villageIdToCoord.get(targetId);
    if (!attackerCoord || !targetCoord) continue;
    if (!Number.isFinite(timestampMs)) continue;
    rows.push({
      attackerCoord,
      targetCoord,
      arrivalAt: new Date(timestampMs).toISOString(),
      unit,
      commandType: dsuTypeCodeToCommandType(typeCode),
    });
  }
  return rows;
}

function dsuTypeCodeToCommandType(code: number): "attack" | "fake" | "ag" | "wallbreaker" {
  if (code === 11) return "ag";
  if (code === 14) return "fake";
  if (code === 45) return "wallbreaker";
  return "attack";
}

function getUnitLabelDe(unit: string) {
  return UNIT_LABELS_DE[unit] ?? unit;
}

function serializeGeneratedPlans(plans: PlanSection[]) {
  return JSON.stringify(
    plans.map((section) => ({
      id: section.id,
      label: section.label,
      rows: section.rows.map((row) => ({
        ...row,
        sendFrom: row.sendFrom.toISOString(),
        sendTo: row.sendTo.toISOString(),
        arrivalFrom: row.arrivalFrom.toISOString(),
        arrivalTo: row.arrivalTo.toISOString(),
      })),
    }))
  );
}

function deserializeGeneratedPlans(raw: string): PlanSection[] | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed
      .filter((section: any) => section && typeof section === "object")
      .map((section: any) => ({
        id: typeof section?.id === "string" ? section.id : createId(),
        label: typeof section?.label === "string" ? section.label : "Plan",
        rows: Array.isArray(section?.rows)
          ? section.rows
              .filter((row: any) => row && typeof row === "object")
              .map((row: any) => ({
                ...row,
                sendFrom: new Date(row?.sendFrom),
                sendTo: new Date(row?.sendTo),
                arrivalFrom: new Date(row?.arrivalFrom),
                arrivalTo: new Date(row?.arrivalTo),
              }))
          : [],
      }));
  } catch {
    return null;
  }
}

function filterRows(rows: AttackRow[], filter: string) {
  if (!filter.trim()) return rows;
  const needle = filter.trim().toLowerCase();
  return rows.filter((row) => {
    const fields = [
      row.attacker?.playerName,
      row.attacker?.villageName,
      row.attackerCoord,
      row.target?.playerName,
      row.target?.villageName,
      row.targetCoord,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return fields.includes(needle);
  });
}

function sortRows(rows: AttackRow[], _sortKey: SortKey, _sortDir: SortDir) {
  const copy = [...rows];
  copy.sort((a, b) => {
    const sendDiff = a.sendFrom.getTime() - b.sendFrom.getTime();
    if (sendDiff !== 0) return sendDiff;
    return a.distance - b.distance;
  });
  return copy;
}

function groupByPlayer(rows: AttackRow[]) {
  const groups = new Map<string, AttackRow[]>();
  for (const row of rows) {
    const key = row.attacker?.playerName ?? "Unbekannt";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }
  return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0], "de"));
}

function createId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function parseTimeMinutes(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function overlapsTimeOfDay(sendFrom: Date, sendTo: Date, blockStart: number, blockEnd: number) {
  const intervals = splitIntoDayMinutes(sendFrom, sendTo);
  for (const [start, end] of intervals) {
    if (blockStart <= blockEnd) {
      if (start <= blockEnd && end >= blockStart) return true;
    } else {
      if (end >= blockStart || start <= blockEnd) return true;
    }
  }
  return false;
}

function splitIntoDayMinutes(start: Date, end: Date): Array<[number, number]> {
  if (end < start) return [];
  const startMinutes = start.getHours() * 60 + start.getMinutes();
  const endMinutes = end.getHours() * 60 + end.getMinutes();
  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const dayDiff = Math.round((endDay.getTime() - startDay.getTime()) / (24 * 60 * 60 * 1000));
  if (dayDiff <= 0) {
    return [[startMinutes, endMinutes]];
  }
  const intervals: Array<[number, number]> = [];
  intervals.push([startMinutes, 24 * 60 - 1]);
  for (let i = 1; i < dayDiff; i += 1) {
    intervals.push([0, 24 * 60 - 1]);
  }
  intervals.push([0, endMinutes]);
  return intervals;
}

function limitArrivalSpread(rows: AttackRow[], maxMinutes: number) {
  if (rows.length === 0) return rows;
  const sorted = [...rows].sort((a, b) => a.arrivalFrom.getTime() - b.arrivalFrom.getTime());
  const start = sorted[0].arrivalFrom.getTime();
  const maxMs = maxMinutes * 60 * 1000;
  return sorted.filter((row) => row.arrivalFrom.getTime() - start <= maxMs);
}

function groupByAttackerPlayer(rows: AttackRow[]) {
  const groups = new Map<string, AttackRow[]>();
  for (const row of rows) {
    const key = row.attacker?.playerName ?? "Unbekannt";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }
  for (const list of groups.values()) {
    list.sort((a, b) => {
      const sendDiff = a.sendFrom.getTime() - b.sendFrom.getTime();
      if (sendDiff !== 0) return sendDiff;
      return a.distance - b.distance;
    });
  }
  return groups;
}

function uniqueNames(names: string[]) {
  const set = new Set<string>();
  const result: string[] = [];
  for (const name of names) {
    const trimmed = name.trim();
    if (!trimmed) continue;
    if (set.has(trimmed)) continue;
    set.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function resolveAllyByQuery(allies: Map<string, { allyId: string; allyName: string; allyTag: string }>, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return null;
  for (const ally of allies.values()) {
    if (ally.allyTag.toLowerCase() === needle || ally.allyName.toLowerCase() === needle) {
      return ally;
    }
  }
  for (const ally of allies.values()) {
    if (ally.allyTag.toLowerCase().includes(needle) || ally.allyName.toLowerCase().includes(needle)) {
      return ally;
    }
  }
  return null;
}

function resolvePlayerNamesByQuery(
  players: Map<string, { playerName: string; allyId: string }>,
  queries: string[]
) {
  const allNames = Array.from(players.values()).map((player) => player.playerName);
  const result: string[] = [];
  const seen = new Set<string>();

  const add = (name: string) => {
    if (seen.has(name)) return;
    seen.add(name);
    result.push(name);
  };

  for (const query of queries) {
    const needle = query.trim().toLowerCase();
    if (!needle) continue;
    const exact = allNames.find((name) => name.toLowerCase() === needle);
    if (exact) {
      add(exact);
      continue;
    }
    const prefixMatches = allNames.filter((name) => name.toLowerCase().startsWith(needle));
    if (prefixMatches.length > 0) {
      for (const name of prefixMatches) add(name);
      continue;
    }
    const partialMatches = allNames.filter((name) => name.toLowerCase().includes(needle));
    if (partialMatches.length > 0) {
      for (const name of partialMatches) add(name);
      continue;
    }
    add(query.trim());
  }
  return result;
}

function collectPlayersByAlly(players: Map<string, { playerName: string; allyId: string }>, allyId: string) {
  if (!allyId) return [];
  const result: string[] = [];
  for (const player of players.values()) {
    if (player.allyId === allyId) result.push(player.playerName);
  }
  return result.sort((a, b) => a.localeCompare(b, "de"));
}

function collectCoordsFromPlayers(
  villagesByPlayer: Map<string, { coord: string; x: number; y: number; name: string }[]>,
  playerNames: string[],
  excludedCoords: string[]
) {
  const exclude = new Set(excludedCoords);
  const result: { coord: string; x: number; y: number }[] = [];
  for (const name of playerNames) {
    const villages = villagesByPlayer.get(name) ?? [];
    for (const village of villages) {
      if (exclude.has(village.coord)) continue;
      result.push(village);
    }
  }
  return result;
}

function applyLimits(rows: AttackRow[], maxPerAttacker: number, maxPerTarget: number) {
  const limitAttacker = maxPerAttacker > 0 ? maxPerAttacker : Number.POSITIVE_INFINITY;
  const limitTarget = maxPerTarget > 0 ? maxPerTarget : Number.POSITIVE_INFINITY;
  if (!Number.isFinite(limitAttacker) && !Number.isFinite(limitTarget)) return rows;

  const groups = groupByAttackerPlayer(rows);
  const attackerCount = new Map<string, number>();
  const targetCount = new Map<string, number>();
  const result: AttackRow[] = [];

  const playerNames = Array.from(groups.keys());
  const indices = new Map<string, number>(playerNames.map((name) => [name, 0]));

  let madeProgress = true;
  while (madeProgress) {
    madeProgress = false;
    for (const player of playerNames) {
      const list = groups.get(player)!;
      let idx = indices.get(player) ?? 0;
      while (idx < list.length) {
        const row = list[idx];
        idx += 1;
        const attKey = row.attackerCoord;
        const tgtKey = row.targetCoord;
        const attUsed = attackerCount.get(attKey) ?? 0;
        const tgtUsed = targetCount.get(tgtKey) ?? 0;
        if (attUsed >= limitAttacker) continue;
        if (tgtUsed >= limitTarget) continue;
        attackerCount.set(attKey, attUsed + 1);
        targetCount.set(tgtKey, tgtUsed + 1);
        result.push(row);
        madeProgress = true;
        break;
      }
      indices.set(player, idx);
    }
  }

  return result;
}

function downloadBbCode(
  rows: AttackRow[],
  _player: string,
  tzMode: "local" | "utc",
  worldBaseUrl: string,
  worldCode: string
) {
  const header = [
    "Zielspieler",
    "Ziel-Dorf",
    "Ziel-Koord",
    "Angreifer",
    "Angr.-Dorf",
    "Angr.-Koord",
    "Distanz",
    "Laufzeit",
    "Sendezeit von",
    "Sendezeit bis",
    "Ankunft von",
    "Ankunft bis",
    "Play-Link",
  ];
  const lines: string[] = [];
  lines.push("[table]");
  lines.push(`[**]${header.map((item) => `[b]${escapeBbText(item)}[/b]`).join("[||]")}[/**]`);
  for (const row of rows) {
    const link = buildAttackLink(row, worldBaseUrl, worldCode) ?? "";
    const targetPlayer = row.target?.playerName ?? "Unbekannt";
    const attackerPlayer = row.attacker?.playerName ?? "Unbekannt";
    const targetVillageName = row.target?.villageName ?? "Unbekannt";
    const attackerVillageName = row.attacker?.villageName ?? "Unbekannt";
    const values = [
      bbPlayer(targetPlayer),
      bbVillageCell(targetVillageName, row.targetCoord),
      bbCoord(row.targetCoord),
      bbPlayer(attackerPlayer),
      bbVillageCell(attackerVillageName, row.attackerCoord),
      bbCoord(row.attackerCoord),
      escapeBbText(row.distance.toFixed(2)),
      escapeBbText(formatDuration(row.travelSeconds)),
      escapeBbText(formatDate(row.sendFrom, tzMode)),
      escapeBbText(formatDate(row.sendTo, tzMode)),
      escapeBbText(formatDate(row.arrivalFrom, tzMode)),
      escapeBbText(formatDate(row.arrivalTo, tzMode)),
      link ? `[url=${link}]Play[/url]` : "-",
    ];
    lines.push(`[**]${values.join("[||]")}[/**]`);
  }
  lines.push("[/table]");
  const text = lines.join("\n");
  void navigator.clipboard.writeText(text);
}

function escapeBbText(value: string) {
  return value.replace(/\[/g, "(").replace(/\]/g, ")");
}

function downloadDiscord(rows: AttackRow[], tzMode: "local" | "utc", worldBaseUrl: string, worldCode: string) {
  const header = [
    "Ziel",
    "Angreifer",
    "Distanz",
    "Sendezeit",
    "Ankunft",
    "Link",
  ];
  const lines: string[] = [];
  lines.push(`**Angriffsplan**`);
  lines.push("```");
  lines.push(header.join(" | "));
  lines.push("-".repeat(80));
  for (const row of rows) {
    const link = buildAttackLink(row, worldBaseUrl, worldCode) ?? "";
    const values = [
      `${row.targetCoord}`,
      `${row.attackerCoord}`,
      row.distance.toFixed(2),
      `${formatDate(row.sendFrom, tzMode)} – ${formatDate(row.sendTo, tzMode)}`,
      `${formatDate(row.arrivalFrom, tzMode)} – ${formatDate(row.arrivalTo, tzMode)}`,
      link ? link : "-",
    ];
    lines.push(values.join(" | "));
  }
  lines.push("```");
  void navigator.clipboard.writeText(lines.join("\n"));
}

function bbPlayer(name: string) {
  return `[player]${escapeBbText(name)}[/player]`;
}

function bbCoord(coord: string) {
  return `[coord]${escapeBbText(coord)}[/coord]`;
}

function bbVillageCell(_name: string, coord: string) {
  return `[village]${escapeBbText(coord)}[/village]`;
}

function buildAttackLink(row: AttackRow, worldBaseUrl: string, worldCode: string) {
  const base = getWorldBase(worldBaseUrl, worldCode);
  if (!base) return null;
  const attackerId = row.attacker?.villageId;
  const targetId = row.target?.villageId;
  if (!attackerId || !targetId) return null;
  return `${base}/game.php?village=${encodeURIComponent(attackerId)}&screen=place&target=${encodeURIComponent(
    targetId
  )}`;
}

function renderAttackLink(row: AttackRow, worldBaseUrl: string, worldCode: string) {
  const link = buildAttackLink(row, worldBaseUrl, worldCode);
  if (!link) return <span className="muted">-</span>;
  return (
    <a className="play-link" href={link} target="_blank" rel="noreferrer">
      ▶
    </a>
  );
}

function getWorldBase(worldBaseUrl: string, worldCode: string) {
  if (worldBaseUrl?.trim()) return worldBaseUrl.trim().replace(/\/$/, "");
  if (worldCode?.trim()) return `https://${worldCode.trim()}.die-staemme.de`;
  return "";
}

async function fetchTextViaProxy(url: string): Promise<string> {
  const res = await fetch(`/proxy?url=${encodeURIComponent(url)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} für ${url}`);
  return res.text();
}

async function fetchGzipViaProxy(url: string): Promise<string> {
  const res = await fetch(`/proxy?url=${encodeURIComponent(url)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} für ${url}`);
  const buffer = await res.arrayBuffer();
  const data = new Uint8Array(buffer);
  const decoded = pako.ungzip(data, { to: "string" }) as string;
  return decoded;
}

function sanitizeBase(value: string): string {
  if (value.endsWith("/")) return value.slice(0, -1);
  return value;
}

function parseOutgoingAttacksInsert(raw: string): OutgoingInsertAttack[] {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const serverNow = parseServerNowFromOutgoing(raw);
  const result: OutgoingInsertAttack[] = [];
  let idx = 0;
  for (const line of lines) {
    const looksLikeCommand = /(Angriff|Unterstützung|Rückkehr)/i.test(line);
    if (!looksLikeCommand) continue;
    const coords = Array.from(line.matchAll(/(\d{1,3}\|\d{1,3})/g)).map((m) => m[1]);
    if (coords.length < 2) continue;
    const pairMatches = Array.from(line.matchAll(/([^()\t\r\n]+?)\s*\((\d{1,3}\|\d{1,3})\)/g));
    const targetPair = pairMatches[0];
    const originPair = pairMatches[1];
    const targetCoord = coords[0];
    const originCoord = coords[1];
    const cleanName = (value: string) =>
      value
        .replace(/\s+/g, " ")
        .replace(/^\s*(Angriff|Unterstützung|Rückkehr)\s+auf\s+/i, "")
        .trim();
    const targetName = cleanName(targetPair?.[1] ?? "Ziel");
    const originName = cleanName(originPair?.[1] ?? "Herkunft");

    const lower = line.toLowerCase();
    let commandType: "attack" | "support" | "return" = "attack";
    if (lower.includes("unterstützung")) commandType = "support";
    if (lower.includes("rückkehr")) commandType = "return";
    const commandLabel =
      commandType === "attack"
        ? "Angriff"
        : commandType === "support"
        ? "Unterstützung"
        : "Rückkehr";

    const arrival = parseOutgoingArrival(line, serverNow);
    result.push({
      id: `out-${idx += 1}-${originCoord}-${targetCoord}-${arrival.iso}`,
      commandType,
      commandLabel,
      originName,
      originCoord,
      targetName,
      targetCoord,
      arrivalAtIso: arrival.iso,
      arrivalLabel: arrival.label,
      rawLine: line,
    });
  }
  return result;
}

function parseServerNowFromOutgoing(raw: string): Date {
  const m = raw.match(
    /Serverzeit:\s*(\d{1,2}):(\d{2}):(\d{2})\s+(\d{1,2})[./](\d{1,2})[./](\d{2,4})/i
  );
  if (!m) return new Date();
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  const second = Number(m[3]);
  const day = Number(m[4]);
  const month = Number(m[5]) - 1;
  let year = Number(m[6]);
  if (year < 100) year += 2000;
  const date = new Date(year, month, day, hour, minute, second);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function parseOutgoingArrival(
  line: string,
  serverNow: Date
): { iso: string; label: string } {
  const rel = line.match(/(heute|morgen|gestern)\s+um\s+(\d{1,2}:\d{2}:\d{2})/i);
  if (rel) {
    const marker = rel[1].toLowerCase();
    const [h, m, s] = rel[2].split(":").map((v) => Number(v));
    const date = new Date(serverNow);
    date.setHours(h, m, s, 0);
    if (marker === "morgen") date.setDate(date.getDate() + 1);
    if (marker === "gestern") date.setDate(date.getDate() - 1);
    return { iso: date.toISOString(), label: date.toLocaleString("de-DE") };
  }
  const abs = line.match(
    /(\d{1,2})[./](\d{1,2})[./](\d{2,4})\s*(?:um)?\s*(\d{1,2}:\d{2}:\d{2})/i
  );
  if (abs) {
    const day = Number(abs[1]);
    const month = Number(abs[2]) - 1;
    let year = Number(abs[3]);
    if (year < 100) year += 2000;
    const [h, m, s] = abs[4].split(":").map((v) => Number(v));
    const date = new Date(year, month, day, h, m, s, 0);
    if (!Number.isNaN(date.getTime())) {
      return { iso: date.toISOString(), label: date.toLocaleString("de-DE") };
    }
  }
  return { iso: serverNow.toISOString(), label: "Unbekannt" };
}

function parseIncomingAttacksInsert(raw: string): IncomingInsertAttack[] {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];
  const serverNow = parseServerNowFromOutgoing(raw);
  const importNonce = Date.now().toString(36);
  const result: IncomingInsertAttack[] = [];
  let currentTargetCoord = "";
  let currentTargetName = "Ziel";
  let idx = 0;
  for (const line of lines) {
    const blockTargetMatch = line.match(
      /\[b\]\s*Dorf:\s*\[\/b\].*?\[coord\](\d{1,3}\|\d{1,3})\[\/coord\]/i
    );
    if (blockTargetMatch) {
      currentTargetCoord = blockTargetMatch[1];
      currentTargetName = currentTargetCoord;
      continue;
    }

    const sosCommandMatch = line.match(/\[command\]\s*attack\s*\[\/command\]/i);
    if (sosCommandMatch) {
      const originCoordMatch = line.match(/\[coord\](\d{1,3}\|\d{1,3})\[\/coord\]/i);
      const arrivalMatch = line.match(
        /Ankunftszeit:\s*([0-3]?\d\.[01]?\d\.\d{2,4}\s+\d{1,2}:\d{2}:\d{2})/i
      );
      if (!originCoordMatch || !arrivalMatch || !currentTargetCoord) continue;
      const unitLabel =
        stripBbTags(
          line.match(/\[command\][^\[]+\[\/command\]\s*([^\[]+?)\s*\[coord\]/i)?.[1] ?? ""
        ) || "Unbekannt";
      const attackerPlayer =
        stripBbTags(line.match(/\[player\]([^\[]+)\[\/player\]/i)?.[1] ?? "") || "Unbekannt";
      const arrival = parseIncomingArrival(arrivalMatch[1], serverNow);
      result.push({
        id: `in-${importNonce}-${idx += 1}-${originCoordMatch[1]}-${currentTargetCoord}-${arrival.iso}`,
        unitLabel,
        attackerPlayer,
        originName: originCoordMatch[1],
        originCoord: originCoordMatch[1],
        targetName: currentTargetName || currentTargetCoord,
        targetCoord: currentTargetCoord,
        distanceLabel: "-",
        sentAtLabel: "-",
        returnAtLabel: "-",
        arrivalAtIso: arrival.iso,
        arrivalLabel: arrival.label,
        rawLine: line,
      });
      continue;
    }

    // Full "Eintreffend" table row format (tab separated).
    // Example: "Ramme<TAB>Zieldorf (x|y)<TAB>Herkunft (x|y)<TAB>Spieler<TAB>Dist<TAB>heute um HH:MM:SS"
    const tabColumns = line
      .split(/\t+/)
      .map((part) => stripBbTags(part.trim()))
      .filter(Boolean);
    if (tabColumns.length >= 6) {
      const unitLabel = tabColumns[0] || "Unbekannt";
      const targetCell = tabColumns[1] || "";
      const originCell = tabColumns[2] || "";
      const attackerPlayer = tabColumns[3] || "Unbekannt";
      const distanceLabel = tabColumns[4] || "-";
      const arrivalRaw = tabColumns[5] || "";
      const targetParsed = parseVillageCell(targetCell);
      const originParsed = parseVillageCell(originCell);
      if (targetParsed && originParsed && arrivalRaw) {
        const arrival = parseIncomingArrival(arrivalRaw, serverNow);
        result.push({
          id: `in-${importNonce}-${idx += 1}-${originParsed.coord}-${targetParsed.coord}-${arrival.iso}`,
          unitLabel,
          attackerPlayer,
          originName: originParsed.name || originParsed.coord,
          originCoord: originParsed.coord,
          targetName: targetParsed.name || targetParsed.coord,
          targetCoord: targetParsed.coord,
          distanceLabel,
          sentAtLabel: "-",
          returnAtLabel: "-",
          arrivalAtIso: arrival.iso,
          arrivalLabel: arrival.label,
          rawLine: line,
        });
        continue;
      }
    }

    const hasPipeFormat =
      /\|\s*(?:player|spieler)\s+/i.test(line) &&
      /\b(?:origin|herkunft)\b/i.test(line) &&
      /\b(?:destination|ziel)\b/i.test(line);

    if (hasPipeFormat) {
      const unitMatch = line.match(/^\s*(?:\[[^\]]+\][^\[]*\[\/[^\]]+\]\s*)?([^|]+)\|/);
      const playerMatch = line.match(/\|\s*(?:player|spieler)\s+([^|]+)\|/i);
      const sentMatch = line.match(/\|\s*sent\s+([^|]+)\|/i);
      const returnMatch = line.match(/\|\s*return\s+([^|]+)\|/i);
      const arrivalMatch = line.match(/\|\s*arrival\s+([^|]+)\|/i);
      const explicitArrivalMatch = line.match(
        /Ankunftszeit:\s*([0-3]?\d\.[01]?\d\.\d{2,4}\s+\d{1,2}:\d{2}:\d{2})/i
      );
      const originMatch = line.match(
        /\|\s*(?:origin|herkunft)\s+(.+?)\s*\((\d{1,3}\|\d{1,3})\)(?:\s*K\d+)?\s*\|/i
      );
      const destinationMatch = line.match(
        /\|\s*(?:destination|ziel)\s+(.+?)\s*\((\d{1,3}\|\d{1,3})\)(?:\s*K\d+)?/i
      );
      if (!originMatch || !destinationMatch) continue;

      const distanceMatch = line.match(
        /\t(\d+(?:\.\d+)?)\t(?:heute|morgen|gestern|\d{1,2}[./]\d{1,2})/i
      );
      const unitLabel = stripBbTags((unitMatch?.[1] ?? "").trim()) || "Unbekannt";
      const attackerPlayer = (playerMatch?.[1] ?? "").trim() || "Unbekannt";
      const sentAtLabel = (sentMatch?.[1] ?? "").trim() || "-";
      const returnAtLabel = (returnMatch?.[1] ?? "").trim() || "-";
      const arrivalRaw = (explicitArrivalMatch?.[1] ?? arrivalMatch?.[1] ?? "").trim();
      const arrival = parseIncomingArrival(arrivalRaw, serverNow);

      result.push({
        id: `in-${importNonce}-${idx += 1}-${originMatch[2]}-${destinationMatch[2]}-${arrival.iso}`,
        unitLabel,
        attackerPlayer,
        originName: stripBbTags(originMatch[1].trim()),
        originCoord: originMatch[2],
        targetName: stripBbTags(destinationMatch[1].trim()),
        targetCoord: destinationMatch[2],
        distanceLabel: (distanceMatch?.[1] ?? "-").trim(),
        sentAtLabel,
        returnAtLabel,
        arrivalAtIso: arrival.iso,
        arrivalLabel: arrival.label,
        rawLine: line,
      });
      continue;
    }

    // Fallback for plain incoming overview rows (tab-separated list format).
    const coords = Array.from(line.matchAll(/(\d{1,3}\|\d{1,3})/g)).map((m) => m[1]);
    if (coords.length < 2) continue;
    const arrivalRawMatch = line.match(
      /(heute|morgen|gestern)\s+um\s+\d{1,2}:\d{2}:\d{2}|[0-3]?\d[./][01]?\d(?:[./]\d{2,4})?\s+\d{1,2}:\d{2}:\d{2}/i
    );
    if (!arrivalRawMatch) continue;
    const pairMatches = Array.from(
      line.matchAll(/([^()\t\r\n]+?)\s*\((\d{1,3}\|\d{1,3})\)(?:\s*K\d+)?/g)
    );
    const targetCoord = coords[0];
    const originCoord = coords[1];
    const targetPair = pairMatches.find((pair) => pair[2] === targetCoord);
    const originPair = pairMatches.find((pair) => pair[2] === originCoord);
    const targetName = stripBbTags((targetPair?.[1] ?? "Ziel").trim());
    const originName = stripBbTags((originPair?.[1] ?? "Herkunft").trim());
    const lineParts = line.split(/\t+/).map((part) => stripBbTags(part.trim())).filter(Boolean);
    const playerCandidate =
      lineParts.find(
        (part) =>
          !part.includes("|") &&
          !part.includes(targetCoord) &&
          !part.includes(originCoord) &&
          !/(heute|morgen|gestern|\d{1,2}[./]\d{1,2})/i.test(part) &&
          /^[^\d].+/.test(part)
      ) ?? "Unbekannt";
    const unitCandidate =
      stripBbTags(
        (line.match(/^\s*(?:\[[^\]]+\][^\[]*\[\/[^\]]+\]\s*)?([^|\t]+)\|/)?.[1] ??
          line.match(/^\s*([^\t]+?)\s+(?:auf|on)\b/i)?.[1] ??
          "")
      ).trim() || "Unbekannt";
    const distanceLabel = (line.match(/\t(\d+(?:\.\d+)?)\t/)?.[1] ?? "-").trim();
    const arrival = parseIncomingArrival(arrivalRawMatch[0], serverNow);

    result.push({
      id: `in-${importNonce}-${idx += 1}-${originCoord}-${targetCoord}-${arrival.iso}`,
      unitLabel: unitCandidate,
      attackerPlayer: playerCandidate,
      originName,
      originCoord,
      targetName,
      targetCoord,
      distanceLabel,
      sentAtLabel: "-",
      returnAtLabel: "-",
      arrivalAtIso: arrival.iso,
      arrivalLabel: arrival.label,
      rawLine: line,
    });
  }
  return result;
}

function classifyReportAttackKind(
  units: Record<string, number> | undefined
): "off" | "fake" | "ag" | "unknown" {
  const snob = Number(units?.snob ?? 0);
  if (snob > 0) return "ag";
  const axe = Number(units?.axe ?? 0);
  const light = Number(units?.light ?? 0);
  const ram = Number(units?.ram ?? 0);
  const catapult = Number(units?.catapult ?? 0);
  const marcher = Number(units?.marcher ?? 0);
  const spy = Number(units?.spy ?? 0);
  const knight = Number(units?.knight ?? 0);
  const offScore = axe + light + ram + catapult + marcher;
  const fakeScore = spy + ram + catapult + knight;
  const isHardOff = axe >= 5000 || light >= 1500 || ram >= 150;
  if (isHardOff || (offScore > 0 && offScore > fakeScore * 1.8)) return "off";
  if (fakeScore > 0) return "fake";
  return "unknown";
}

function predictIncomingType(
  originCoord: string,
  unitLabel: string,
  stats: { off: number; fake: number; ag: number; total: number } | undefined
): { label: "OFF" | "Fake" | "AG" | "Unbekannt"; reasonLines: string[] } {
  const normalizedUnit = unitLabel.trim().toLowerCase();
  const unitSuggestAg = normalizedUnit.includes("adel") || normalizedUnit.includes("snob");
  const unitSuggestFake =
    normalizedUnit.includes("ram") ||
    normalizedUnit.includes("kat") ||
    normalizedUnit.includes("späh") ||
    normalizedUnit.includes("spy");
  if (!stats || stats.total === 0) {
    return {
      label: "Unbekannt",
      reasonLines: [
        "Keine Berichts-Historie für Herkunftsdorf vorhanden.",
        `Herkunft: ${originCoord}`,
        `Einheit: ${unitLabel || "Unbekannt"}`,
      ],
    };
  }

  const pairs: Array<{ key: "off" | "fake" | "ag"; value: number; label: "OFF" | "Fake" | "AG" }> = [
    { key: "off", value: stats.off, label: "OFF" },
    { key: "fake", value: stats.fake, label: "Fake" },
    { key: "ag", value: stats.ag, label: "AG" },
  ];
  pairs.sort((a, b) => b.value - a.value);
  let winner = pairs[0];
  const tie = pairs.filter((item) => item.value === winner.value && item.value > 0);
  if (tie.length > 1) {
    if (unitSuggestAg) {
      const ag = tie.find((item) => item.key === "ag");
      if (ag) winner = ag;
    } else if (unitSuggestFake) {
      const fake = tie.find((item) => item.key === "fake");
      if (fake) winner = fake;
    }
  }
  const share = stats.total > 0 ? Math.round((winner.value / stats.total) * 100) : 0;
  return {
    label: winner.label,
    reasonLines: [
      `Herkunftsdorf: ${originCoord}`,
      `Berichte gesamt: ${stats.total}`,
      `Verteilung: Fake ${stats.fake}, OFF ${stats.off}, AG ${stats.ag}`,
      `Gewählt: ${winner.label} (${share}% Anteil)`,
    ],
  };
}

function parseIncomingArrival(
  value: string,
  serverNow: Date
): { iso: string; label: string } {
  const rel = value.match(/(heute|morgen|gestern)\s+um\s+(\d{1,2}:\d{2}:\d{2})/i);
  if (rel) {
    const marker = rel[1].toLowerCase();
    const [h, m, s] = rel[2].split(":").map((v) => Number(v));
    const date = new Date(serverNow);
    date.setHours(h, m, s, 0);
    if (marker === "morgen") date.setDate(date.getDate() + 1);
    if (marker === "gestern") date.setDate(date.getDate() - 1);
    return { iso: date.toISOString(), label: date.toLocaleString("de-DE") };
  }
  const abs = value.match(/(\d{1,2})[./](\d{1,2})[./](\d{2,4})\s+(\d{1,2}:\d{2}:\d{2})/i);
  if (abs) {
    const day = Number(abs[1]);
    const month = Number(abs[2]) - 1;
    let year = Number(abs[3]);
    if (year < 100) year += 2000;
    const [h, m, s] = abs[4].split(":").map((v) => Number(v));
    const date = new Date(year, month, day, h, m, s, 0);
    if (!Number.isNaN(date.getTime())) {
      return { iso: date.toISOString(), label: date.toLocaleString("de-DE") };
    }
  }
  const absNoYear = value.match(/(\d{1,2})[./](\d{1,2})\s+(\d{1,2}:\d{2}:\d{2})/i);
  if (absNoYear) {
    const day = Number(absNoYear[1]);
    const month = Number(absNoYear[2]) - 1;
    const [h, m, s] = absNoYear[3].split(":").map((v) => Number(v));
    let year = serverNow.getFullYear();
    let date = new Date(year, month, day, h, m, s, 0);
    // Around year boundaries, DS often omits the year in list views.
    // If parsed date is clearly in the past, assume next year.
    if (date.getTime() < serverNow.getTime() - 12 * 60 * 60 * 1000) {
      year += 1;
      date = new Date(year, month, day, h, m, s, 0);
    }
    if (!Number.isNaN(date.getTime())) {
      return { iso: date.toISOString(), label: date.toLocaleString("de-DE") };
    }
  }
  return { iso: serverNow.toISOString(), label: value || "Unbekannt" };
}

function stripBbTags(value: string): string {
  return value.replace(/\[[^\]]+\]/g, "").replace(/\s+/g, " ").trim();
}

function parseVillageCell(value: string): { name: string; coord: string } | null {
  const cleaned = stripBbTags(value);
  const match = cleaned.match(/(.+?)\s*\((\d{1,3}\|\d{1,3})\)/);
  if (!match) return null;
  return {
    name: match[1].trim(),
    coord: match[2],
  };
}

function buildIncomingAttackSignature(row: IncomingInsertAttack): string {
  return [
    row.originCoord.trim().toLowerCase(),
    row.targetCoord.trim().toLowerCase(),
    row.attackerPlayer.trim().toLowerCase(),
    row.unitLabel.trim().toLowerCase(),
    row.arrivalAtIso,
  ].join("|");
}

function resolveIncomingUnitKey(unitLabel: string): string {
  const value = (unitLabel || "").trim().toLowerCase();
  if (!value) return "";
  if (value.includes("adel") || value.includes("snob")) return "snob";
  if (value.includes("ram")) return "ram";
  if (value.includes("kat") || value.includes("catapult")) return "catapult";
  if (value.includes("späh") || value.includes("spaeh") || value.includes("spy")) return "spy";
  if (value.includes("schwert") || value.includes("sword")) return "sword";
  if (value.includes("speer") || value.includes("spear")) return "spear";
  if (value.includes("axt") || value.includes("axe")) return "axe";
  if (value.includes("leicht") || value.includes("lkav") || value.includes("light")) return "light";
  if (value.includes("schwer") || value.includes("skav") || value.includes("heavy")) return "heavy";
  if (value.includes("beritten") || value.includes("marcher")) return "marcher";
  if (value.includes("bogen") || value.includes("archer")) return "archer";
  if (value.includes("paladin") || value.includes("ritter") || value.includes("knight")) return "knight";
  return "";
}

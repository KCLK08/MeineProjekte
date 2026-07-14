export type PlayerInfo = {
  playerId: string;
  playerName: string;
  allyId: string;
  villageCount?: number;
  points?: number;
  rank?: number;
};

export type PlayerMap = Map<string, PlayerInfo>;

export type AllyInfo = {
  allyId: string;
  allyName: string;
  allyTag: string;
};

export type AllyMap = Map<string, AllyInfo>;

export type VillageInfo = {
  villageId: string;
  villageName: string;
  playerId: string;
  playerName: string;
  allyId: string;
  allyName: string;
  allyTag: string;
  x: number;
  y: number;
  points?: number;
};

export type VillageMap = Map<string, VillageInfo>;

export type WorldConfig = {
  speed: number;
  unitSpeed: number;
};

export type UnitSpeedMap = Map<string, number>; // minutes per field

export type ParsedInput = {
  attackers: InputVillage[];
  targets: InputVillage[];
  errors: string[];
};

export type InputVillage = {
  coord: string;
  x: number;
  y: number;
  label?: string;
};

export type AttackRow = {
  attacker: VillageInfo | null;
  target: VillageInfo | null;
  attackerCoord: string;
  targetCoord: string;
  commandType?: "attack" | "fake" | "ag" | "wallbreaker";
  unit?: string;
  distance: number;
  travelSeconds: number;
  sendFrom: Date;
  sendTo: Date;
  arrivalFrom: Date;
  arrivalTo: Date;
};

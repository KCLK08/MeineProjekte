export const PARAMETER_GROUPS = [
  "general",
  "members",
  "contributions",
  "personal",
  "fund",
  "loans",
  "demand",
  "approval",
  "allocation",
  "repayment",
  "defaults",
  "recovery",
  "exits",
  "liquidity",
  "admin",
  "crisis",
  "monteCarlo",
  "advanced",
] as const;

export type ParameterGroup = (typeof PARAMETER_GROUPS)[number];

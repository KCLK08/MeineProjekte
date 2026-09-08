import type { Cents } from "./money";

export const ENGINE_VERSION = "1.1.0";
export const PARAMETER_VERSION = 2;

export type PopulationMode = "fixed" | "dynamic";
export type GrowthType = "none" | "constant" | "percent" | "timeseries";
export type ExitRateMode = "percent" | "fixedCount";
export type ExitAllocation = "proportional" | "oldestFirst";
export type PayoutRule = "immediate" | "afterMonths" | "fixedDeadline" | "installments";
export type FeeMode = "fixed" | "schedule" | "tiered";
export type LoanLimitMethod =
  | "fixed"
  | "tenure"
  | "solidarityMultiple"
  | "personalMultiple"
  | "combined";
export type DemandModel = "fixed" | "perMember" | "byClass" | "timeseries" | "percentOfMembers";
export type AmountCapPolicy = "capToLimit" | "reject";
export type PrioritizationStrategy =
  | "score"
  | "need"
  | "tenure"
  | "fifo"
  | "weighted"
  | "hybrid"
  | "emergency"
  | "proportional";
export type DefaultModel =
  | "constant"
  | "byClass"
  | "byTenure"
  | "byMonth"
  | "byRemainingTerm"
  | "random";
export type DefaultTiming = "immediate" | "afterMonths" | "nearEnd" | "random";
export type DefaultRateBasis = "annual" | "monthly";
export type RecoveryModel = "fixed" | "byClass" | "byCollateral" | "byTime" | "random";
export type RepaymentModel = "linear" | "flexible" | "grace" | "custom";
export type ApplicationStatus =
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "ELIGIBLE"
  | "APPROVED"
  | "WAITLISTED"
  | "PARTIALLY_FUNDED"
  | "FUNDED"
  | "REJECTED"
  | "EXPIRED"
  | "CANCELLED";

export type UtilizationBase = "fundAssets" | "solidarityCash" | "averageFundAssets";
export type WaitlistMergePolicy = "behind" | "reprioritize" | "agingBonus";
export type MaxWaitAction = "expire" | "reReview" | "boost" | "keep";
export type DemandPressureBand = "normal" | "border" | "high" | "extreme";
export type MemberStatus = "ACTIVE" | "PENDING" | "EXIT_REQUESTED" | "EXITED";
export type LoanStatus =
  | "APPLICATION"
  | "APPROVED"
  | "REJECTED"
  | "ACTIVE"
  | "COMPLETED"
  | "DELINQUENT"
  | "DEFAULTED"
  | "RECOVERED"
  | "LOSS";

export type NeedPurpose =
  | "medical"
  | "repair"
  | "education"
  | "professional"
  | "housing"
  | "emergency"
  | "permitted_other"
  | "consumption"
  | "other";

export type AdminCostId =
  | "personnel"
  | "it"
  | "server"
  | "hosting"
  | "software"
  | "accounting"
  | "taxAdvice"
  | "legal"
  | "compliance"
  | "shariahAdvice"
  | "insurance"
  | "office"
  | "payments"
  | "customerService"
  | "marketing"
  | "other";

export type LedgerAccount =
  | "CASH_PERSONAL"
  | "CASH_SOLIDARITY"
  | "CASH_ADMIN"
  | "PERSONAL_LIABILITY"
  | "WITHDRAWAL_PAYABLE"
  | "LOAN_RECEIVABLE"
  | "CONTRA_CONTRIBUTION"
  | "CONTRA_FEE"
  | "CONTRA_COST"
  | "LOAN_LOSS"
  | "LOAN_RECOVERY"
  | "LOAN_COMMITMENT";

export type LedgerEventType =
  | "MEMBERSHIP_CONTRIBUTION"
  | "PERSONAL_BALANCE"
  | "SOLIDARITY_FUND"
  | "ADMIN_FEE"
  | "ADMIN_COST"
  | "LOAN_DISBURSEMENT"
  | "LOAN_RECEIVABLE"
  | "LOAN_REPAYMENT"
  | "LOAN_DEFAULT"
  | "LOAN_LOSS"
  | "LOAN_RECOVERY"
  | "PERSONAL_WITHDRAWAL"
  | "WITHDRAWAL_ACCRUAL"
  | "LOAN_COMMITMENT"
  | "LOAN_COMMITMENT_RELEASE"
  | "OTHER";

export type WarningLevel = "green" | "yellow" | "orange" | "red" | "critical";

export type CreditScoreFactor =
  | "membership"
  | "personalBalance"
  | "income"
  | "repaymentHistory"
  | "existingDebt"
  | "delinquency"
  | "dti"
  | "collateral";

export type ApprovalFactor =
  | "membershipDuration"
  | "personalBalance"
  | "solidarityContributions"
  | "income"
  | "expenses"
  | "existingLoans"
  | "outstandingDebt"
  | "repaymentHistory"
  | "arrears"
  | "defaultHistory"
  | "requestedAmount"
  | "dti"
  | "guarantor"
  | "collateral"
  | "creditClass";

export type MonthPoint = {
  month: number;
  value: number;
};

export type AmountPoint = {
  month: number;
  applications: number;
  averageAmountCents: Cents;
};

export type SeasonalMultiplier = {
  monthOfYear: number;
  multiplier: number;
};

export type TenureLimit = {
  minMonths: number;
  maxCents: Cents;
};

export type CreditClassConfig = {
  id: string;
  label: string;
  minCents: Cents;
  maxCents: Cents;
  minMembershipMonths: number;
  defaultTermMonths: number;
  defaultRate: number;
  recoveryRate: number;
};

export type NeedClassConfig = {
  id: NeedPurpose;
  label: string;
  priority: number;
  share: number;
};

export type AdminCostCategory = {
  id: AdminCostId;
  label: string;
  enabled: boolean;
  fixedMonthlyCents: Cents;
  perMemberCents: Cents;
  growthPercentPerMonth: number;
  annualCents: Cents;
  annualChargeMonth: number;
  oneOff: { month: number; amountCents: Cents }[];
  tiers: { minMembers: number; extraMonthlyCents: Cents }[];
};

export type FeeTier = {
  minMembers: number;
  maxMembers: number;
  feeCents: Cents;
};

export type TimeSeriesNewMembers = {
  month: number;
  newMembers: number;
};

export type GrowthEvent = {
  id: string;
  name: string;
  startMonth: number;
  durationMonths: number;
  extraMembersPerMonth: number;
};

export type CrisisEventEffects = {
  defaultRateDelta: number;
  exitRateMultiplier: number;
  demandMultiplier: number;
  newMembersMultiplier: number;
  recoveryDelta: number;
  adminCostMultiplier: number;
  personalLiquidityOutflowRate: number;
};

export type CrisisEvent = {
  id: string;
  name: string;
  enabled: boolean;
  startMonth: number;
  durationMonths: number;
  effects: CrisisEventEffects;
};

export type ShockConfig = {
  enabled: boolean;
  month: number;
  memberDropRate: number;
  defaultShareOfOutstanding: number;
  personalPayoutRate: number;
  demandMultiplier: number;
  adminCostMultiplier: number;
};

export type SimulationParameters = {
  meta: {
    name: string;
    description: string;
    isDemo: boolean;
    notes: string;
  };
  seed: number;
  time: {
    startDate: string;
    horizonMonths: number;
    loanOriginationStartMonth: number;
  };
  population: {
    mode: PopulationMode;
    initialMembers: number;
    maxMembers: number;
    minMembershipMonthsForLoan: number;
    minMembershipMonthsBeforeExit: number;
    fixedModeReplacesExits: boolean;
    growth: {
      type: GrowthType;
      constantPerMonth: number;
      percentPerMonth: number;
      timeseries: TimeSeriesNewMembers[];
    };
    seasonalGrowth: SeasonalMultiplier[];
    monthlyNoiseStdev: number;
    joinWave: { enabled: boolean; month: number; extraMembers: number };
    memberDrop: { enabled: boolean; month: number; membersLost: number };
    growthEvents: GrowthEvent[];
  };
  withdrawals: {
    rateMode: ExitRateMode;
    monthlyExitRate: number;
    monthlyExitCount: number;
    seasonalExits: SeasonalMultiplier[];
    allocation: ExitAllocation;
    shock: { enabled: boolean; month: number; percentOfMembers: number };
    payoutRule: PayoutRule;
    payoutDelayMonths: number;
    payoutDeadlineMonths: number;
    installmentMonths: number;
    exitsContributeInExitMonth: boolean;
  };
  contributions: {
    monthlyContributionCents: Cents;
    personalSavingsShareCents: Cents;
    solidarityShareCents: Cents;
  };
  administration: {
    feeMode: FeeMode;
    feePerMemberCents: Cents;
    feeChangeMonth: number;
    feeAfterChangeCents: Cents;
    tiers: FeeTier[];
    initialCashCents: Cents;
    costs: AdminCostCategory[];
  };
  fund: {
    initialCashCents: Cents;
    maximumLoanUtilization: number;
    minimumFundReserve: number;
    utilizationBase: UtilizationBase;
  };
  loans: {
    limitMethod: LoanLimitMethod;
    maxProductCents: Cents;
    tenureLimits: TenureLimit[];
    solidarityMultiplier: number;
    personalMultiplier: number;
    incomeLimitEnabled: boolean;
    incomeMultiple: number;
    classes: CreditClassConfig[];
    allowedTerms: number[];
    defaultTermMonths: number;
    repaymentModel: RepaymentModel;
    graceMonths: number;
    alternativeRepaymentEnabled: boolean;
    amountCapPolicy: AmountCapPolicy;
    maxActiveLoansPerMember: number;
  };
  creditDemand: {
    model: DemandModel;
    applicationsPerMonth: number;
    applicationsPerThousandMembers: number;
    applicationsPercentOfMembers: number;
    averageAmountCents: Cents;
    minAmountCents: Cents;
    maxAmountCents: Cents;
    demandGrowthPerMonth: number;
    amountNoiseStdev: number;
    classMix: { classId: string; share: number }[];
    timeseries: AmountPoint[];
    demandShockEnabled: boolean;
    demandShockStartMonth: number;
    demandShockDuration: number;
    demandShockPercent: number;
    scriptedApplications: ScriptedApplication[];
  };
  needClasses: NeedClassConfig[];
  creditApproval: {
    enabledFactors: Record<ApprovalFactor, boolean>;
    minCreditScore: number;
    maxOutstandingToIncome: number;
    rejectIfDefaultHistory: boolean;
    requireGuarantorForPremium: boolean;
  };
  creditScore: {
    enabledFactors: Record<CreditScoreFactor, boolean>;
    membershipMax: number;
    membershipRefMonths: number;
    personalBalanceMax: number;
    personalBalanceRefCents: Cents;
    incomeMax: number;
    incomeRefCents: Cents;
    repaymentHistoryMax: number;
    existingDebtMin: number;
    existingDebtMax: number;
    existingDebtRefCents: Cents;
    delinquencyMin: number;
    delinquencyMax: number;
    dtiMin: number;
    dtiMax: number;
    dtiRef: number;
    collateralMax: number;
  };
  prioritization: {
    strategy: PrioritizationStrategy;
    weightScore: number;
    weightNeed: number;
    weightTenure: number;
    weightFifo: number;
  };
  defaults: {
    model: DefaultModel;
    rateBasis: DefaultRateBasis;
    constantRate: number;
    timing: DefaultTiming;
    timingAfterMonths: number;
    nearEndMonths: number;
    byClass: { classId: string; rate: number }[];
    byTenure: { minMonths: number; rate: number }[];
    byMonth: MonthPoint[];
    byRemainingTerm: { maxRemainingMonths: number; rate: number }[];
  };
  delinquency: {
    enabled: boolean;
    latePaymentRate: number;
    monthsUntilDefault: number;
  };
  recovery: {
    model: RecoveryModel;
    fixedRate: number;
    lagMonths: number;
    byClass: { classId: string; rate: number }[];
    byTime: { monthsSinceDefault: number; rate: number }[];
    collateralRecoveryRate: number;
    randomStdev: number;
  };
  income: {
    averageMonthlyIncomeCents: Cents;
    averageMonthlyExpensesCents: Cents;
    collateralShare: number;
  };
  liquidity: {
    warningReserveRatio: number;
    minimumReserveRatio: number;
    minAbsoluteSolidarityCashCents: Cents;
    coverageMonthsTarget: number;
  };
  health: {
    weightLiquidity: number;
    weightFund: number;
    weightCredit: number;
    weightMembers: number;
    weightAdmin: number;
    weightDemand: number;
    weightWaitlist: number;
    weightFunding: number;
  };
  monteCarlo: {
    runs: number;
    seed: number;
    defaultRateVariation: number;
    exitRateVariation: number;
    growthVariation: number;
    demandVariation: number;
    recoveryVariation: number;
    liquidityOutflowVariation: number;
  };
  maxApplicationsMaterialized: number;
  maxSampleLoans: number;
  maxSampleMembers: number;
  events: CrisisEvent[];
  shocks: ShockConfig;
  allocation: AllocationPolicy;
};

export type ScriptedApplication = {
  month: number;
  requestedAmountCents: Cents;
  purpose?: NeedPurpose;
  classId?: string;
  memberId?: string;
  tenureMonths?: number;
  creditScore?: number;
  incomeCents?: Cents;
  personalBalanceCents?: Cents;
  solidarityPaidCents?: Cents;
  existingDebtCents?: Cents;
  hasDefaultHistory?: boolean;
  collateral?: boolean;
  partialFundingAllowed?: boolean;
};

export type LoanApplication = {
  id: string;
  memberId: string;
  applicationDate: number;
  requestedAmountCents: Cents;
  approvedAmountCents: Cents;
  fundedAmountCents: Cents;
  remainingAmountCents: Cents;
  purpose: NeedPurpose;
  priorityCategory: NeedPurpose;
  creditClass: string;
  creditScore: number;
  needScore: number;
  membershipScore: number;
  incomeScore: number;
  repaymentScore: number;
  priorityScore: number;
  status: ApplicationStatus;
  queuePosition: number;
  waitlistDate: number | null;
  expectedFundingDate: number | null;
  actualFundingDate: number | null;
  expirationDate: number | null;
  partialFundingAllowed: boolean;
  rejectionReason: string;
  tenureMonths: number;
  scale: number;
  termMonths: number;
  personalBalanceCents: Cents;
  solidarityPaidCents: Cents;
  incomeCents: Cents;
  existingDebtCents: Cents;
  hasDefaultHistory: boolean;
  collateral: boolean;
};

export type AllocationPolicy = {
  utilizationBase: UtilizationBase;
  averageFundLookbackMonths: number;
  minimumLiquidityReservePercent: number;
  minimumLiquidityReserveAmountCents: Cents;
  minimumOperatingExpenseMonths: number;
  personalBalanceReservePercent: number;
  expectedMonthlyMemberExitRate: number;
  expectedMemberExitAmountCents: Cents;
  enforceMinimumLiquidity: boolean;
  maxMonthlyLoanDisbursementCents: Cents;
  maxMemberExposureCents: Cents;
  maxClassExposureShare: { classId: string; maxShare: number }[];
  maxPurposeExposureShare: { purpose: NeedPurpose; maxShare: number }[];
  allowPartialFunding: boolean;
  waitlistMerge: WaitlistMergePolicy;
  ageBonusPerMonth: number;
  maxWaitMonths: number;
  maxWaitAction: MaxWaitAction;
  commitWaitlisted: boolean;
  disbursementLagMonths: number;
  pressureNormal: number;
  pressureBorder: number;
  pressureHigh: number;
  pressureExtreme: number;
  targetFundingRate: number;
  structuralShortageMonths: number;
};

export type CapacityInput = {
  solidarityCashCents: Cents;
  outstandingLoanBalanceCents: Cents;
  committedLoanAmountCents: Cents;
  personalLiabilitiesCents: Cents;
  expectedAdminCostCents: Cents;
  averageFundAssetsCents: Cents;
  outstandingByClass: Record<string, Cents>;
  outstandingByPurpose: Record<string, Cents>;
  disbursedThisMonthCents: Cents;
};

export type CapacityBreakdown = {
  utilizationBaseCents: Cents;
  maxOutstandingLoansCents: Cents;
  minimumLiquidityReserveCents: Cents;
  personalBalanceReserveCents: Cents;
  expectedExitReserveCents: Cents;
  operatingReserveCents: Cents;
  availableFromUtilizationCents: Cents;
  availableFromLiquidityCents: Cents;
  availableFromMonthlyCapCents: Cents;
  availableLoanCapacityCents: Cents;
  constraints: string[];
};

export type Member = {
  id: string;
  joinDateMonth: number;
  status: MemberStatus;
  personalBalanceCents: Cents;
  solidarityContributionsCents: Cents;
  creditScore: number;
  incomeCents: Cents;
  expensesCents: Cents;
  activeLoans: number;
  totalBorrowedCents: Cents;
  totalRepaidCents: Cents;
  defaultHistory: number;
};

export type Loan = {
  id: string;
  memberId: string;
  applicationDate: number;
  approvalDate: number;
  disbursementDate: number;
  principalCents: Cents;
  termMonths: number;
  monthlyPaymentCents: Cents;
  remainingPrincipalCents: Cents;
  amountRepaidCents: Cents;
  status: LoanStatus;
  defaultDate: number | null;
  recoveryAmountCents: Cents;
  lossAmountCents: Cents;
  creditClass: string;
  purpose: NeedPurpose;
};

export type LedgerEntry = {
  id: string;
  month: number;
  date: string;
  type: LedgerEventType;
  account: LedgerAccount;
  debitCents: Cents;
  creditCents: Cents;
  memo: string;
  count: number;
};

export type FormulaLine = {
  label: string;
  cents: Cents;
  sign: "+" | "-" | "=" | "info";
};

export type MonthlySnapshot = {
  month: number;
  date: string;
  members: number;
  newMembers: number;
  exits: number;
  contributionsCents: Cents;
  personalContributionCents: Cents;
  solidarityContributionCents: Cents;
  adminFeeCents: Cents;
  newLoanCount: number;
  newLoanPrincipalCents: Cents;
  repaymentsCents: Cents;
  defaultsCents: Cents;
  recoveryCents: Cents;
  netLossCents: Cents;
  loanDisbursementsCents: Cents;
  personalWithdrawalsCents: Cents;
  adminCostCents: Cents;
  solidarityCashCents: Cents;
  personalLiabilitiesCents: Cents;
  withdrawalPayablesCents: Cents;
  adminCashCents: Cents;
  outstandingLoansCents: Cents;
  fundAssetsCents: Cents;
  liquidityCents: Cents;
  reserveRatio: number;
  utilization: number;
  creditDemandCount: number;
  creditDemandCents: Cents;
  approvedCount: number;
  approvedCents: Cents;
  rejectedCount: number;
  rejectedCents: Cents;
  unmetDemandCount: number;
  unmetDemandCents: Cents;
  eligibleDemandCents: Cents;
  eligibleDemandCount: number;
  waitlistedAmountCents: Cents;
  waitlistedCount: number;
  committedLoansCents: Cents;
  fundingRate: number;
  demandPressure: number;
  demandPressureBand: DemandPressureBand;
  waitlistRate: number;
  rejectionRate: number;
  averageWaitMonths: number;
  medianWaitMonths: number;
  maxWaitMonthsObserved: number;
  oldestApplicationAgeMonths: number;
  queueClearanceMonths: number;
  averageWaitlistAmountCents: Cents;
  capacityAtAllocationCents: Cents;
  liquidityReserveCents: Cents;
  structuralShortage: boolean;
  fulfillmentRatio: number;
  availableLoanCapacityCents: Cents;
  theoreticalCapacityCents: Cents;
  defaultRateRealized: number;
  adminIncomeCents: Cents;
  adminSurplusCents: Cents;
  cumulativeAdminCents: Cents;
  cumulativeNetLossCents: Cents;
  personalCashCents: Cents;
  shortfallPersonalCents: Cents;
  shortfallSolidarityCents: Cents;
  solidarityInflowsCents: Cents;
  solidarityOutflowsCents: Cents;
  fundBreakdown: FormulaLine[];
  personalBreakdown: FormulaLine[];
  adminBreakdown: FormulaLine[];
  liquidityBreakdown: FormulaLine[];
};

export type Warning = {
  level: WarningLevel;
  code: string;
  title: string;
  detail: string;
};

export type SystemHealth = {
  score: number;
  liquidity: number;
  fund: number;
  credit: number;
  members: number;
  admin: number;
  demand: number;
  waitlist: number;
  funding: number;
  label: string;
  disclaimer: string;
};

export type RiskMetrics = {
  maxOutstandingLoansCents: Cents;
  maxFundUtilization: number;
  avgFundUtilization: number;
  maxMonthlyDemandCents: Cents;
  totalUnmetDemandCents: Cents;
  totalDefaultedCents: Cents;
  totalRecoveryCents: Cents;
  totalNetLossCents: Cents;
  maxLiquidityStressCents: Cents;
  minCashCents: Cents;
  minSolidarityCashCents: Cents;
  monthsBelowMinReserve: number;
  liquidityCrisisCount: number;
  maxWithdrawalOutflowCents: Cents;
  maxPersonalLiabilitiesCents: Cents;
  finalAdminBalanceCents: Cents;
  liquidityHorizonMonths: number;
  avgFundingRate: number;
  maxWaitlistCents: Cents;
  maxDemandPressure: number;
  avgWaitMonths: number;
  structuralShortageMonths: number;
};

export type AggregatedKpis = {
  members: number;
  personalLiabilitiesCents: Cents;
  solidarityCashCents: Cents;
  outstandingLoansCents: Cents;
  liquidityCents: Cents;
  creditDemandCents: Cents;
  unmetDemandCents: Cents;
  defaultRate: number;
  netLossCents: Cents;
  adminBalanceCents: Cents;
  utilization: number;
  fulfillmentRatio: number;
  theoreticalCapacityCents: Cents;
  availableCapacityCents: Cents;
  eligibleDemandCents: Cents;
  waitlistedAmountCents: Cents;
  committedLoansCents: Cents;
  fundingRate: number;
  demandPressure: number;
  averageWaitMonths: number;
  queueClearanceMonths: number;
};

export type SimulationLogEntry = {
  atMs: number;
  message: string;
};

export type InvariantViolation = {
  month: number;
  rule: string;
  detail: string;
};

export type SimulationResult = {
  meta: {
    simulationId: string;
    createdAt: string;
    engineVersion: string;
    parameterVersion: number;
    seed: number;
    startDate: string;
    endDate: string;
    scenarioName: string;
    durationMs: number;
    demo: boolean;
  };
  parameters: SimulationParameters;
  log: SimulationLogEntry[];
  months: MonthlySnapshot[];
  kpis: AggregatedKpis;
  risk: RiskMetrics;
  warnings: Warning[];
  health: SystemHealth;
  ledger: LedgerEntry[];
  sampleLoans: Loan[];
  sampleMembers: Member[];
  waitlist: LoanApplication[];
  sampleApplications: LoanApplication[];
  invariants: InvariantViolation[];
  lastMonth: MonthlySnapshot | null;
  recommendations: string[];
};

export type PercentileSet = {
  mean: number;
  min: number;
  max: number;
  p5: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
};

export type MonteCarloResult = {
  runs: number;
  seed: number;
  durationMs: number;
  metrics: Record<string, PercentileSet>;
};

export type SensitivityCell = {
  defaultRate: number;
  exitRate: number;
  fundCents: Cents;
  liquidityCents: Cents;
  lossCents: Cents;
  unmetCents: Cents;
};

export type BreakEvenResult = {
  membersToCoverAdmin: number | null;
  maxDefaultRateBeforeCritical: number | null;
  solidarityShareForTargetOrigination: Cents | null;
  reserveForExitRate: Cents | null;
  maxDemandBeforeUnmet: number | null;
};

export type ReverseSimulationResult = {
  targetMembers: number;
  targetMonthlyOriginationCents: Cents;
  requiredFundCents: Cents;
  requiredSolidarityShareCents: Cents;
  requiredReserveCents: Cents;
  requiredMembers: number;
  maxBearableDefaultRate: number;
  maxMonthlyDemandCents: Cents;
  notes: string[];
};

export type RequiredFundResult = {
  targetFundingRate: number;
  requiredFundCents: Cents;
  requiredMembers: number;
  requiredSolidarityShareCents: Cents;
  achievedFundingRate: number;
  achievedMaxWaitMonths: number;
  notes: string[];
};

export type GoalSeekResult = {
  found: boolean;
  paramPath: string;
  value: number;
  metric: number;
  iterations: number;
};

export type StoredScenario = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  parameters: SimulationParameters;
};

export type StoredSimulation = {
  id: string;
  savedAt: string;
  result: SimulationResult;
};

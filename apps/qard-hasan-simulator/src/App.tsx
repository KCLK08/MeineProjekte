import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { DashboardPage } from "./pages/DashboardPage";
import { SimulationPage } from "./pages/SimulationPage";
import {
  AdminPage,
  BalancePage,
  BreakEvenPage,
  CashflowPage,
  ComparePage,
  ExportPage,
  FundPage,
  GoalSeekPage,
  LedgerPage,
  LiquidityPage,
  LoansPage,
  MembersPage,
  MonteCarloPage,
  PersonalPage,
  RiskPage,
  ScenariosPage,
  SensitivityPage,
  SettingsPage,
  SimulationsPage,
  StressPage,
  WhatIfPage,
} from "./pages/MorePages";

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/simulation" element={<SimulationPage />} />
          <Route path="/scenarios" element={<ScenariosPage />} />
          <Route path="/compare" element={<ComparePage />} />
          <Route path="/stress" element={<StressPage />} />
          <Route path="/monte-carlo" element={<MonteCarloPage />} />
          <Route path="/what-if" element={<WhatIfPage />} />
          <Route path="/goal-seek" element={<GoalSeekPage />} />
          <Route path="/members" element={<MembersPage />} />
          <Route path="/fund" element={<FundPage />} />
          <Route path="/personal" element={<PersonalPage />} />
          <Route path="/loans" element={<LoansPage />} />
          <Route path="/liquidity" element={<LiquidityPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/cashflow" element={<CashflowPage />} />
          <Route path="/balance" element={<BalancePage />} />
          <Route path="/risk" element={<RiskPage />} />
          <Route path="/sensitivity" element={<SensitivityPage />} />
          <Route path="/break-even" element={<BreakEvenPage />} />
          <Route path="/ledger" element={<LedgerPage />} />
          <Route path="/simulations" element={<SimulationsPage />} />
          <Route path="/export" element={<ExportPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}

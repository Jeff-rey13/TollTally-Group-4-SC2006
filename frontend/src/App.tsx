import { lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { AuthProvider, RequireAuth } from './auth/AuthContext';
import { Shell } from './components/Shell';
import { Landing } from './pages/Landing';
import { NotFound } from './pages/NotFound';
import { Overview } from './pages/Overview';
import { ForgotPassword } from './pages/ForgotPassword';
import { Privacy } from './pages/Privacy';
import { ResetPassword } from './pages/ResetPassword';
import { Register } from './pages/Register';
import { SignIn } from './pages/SignIn';
import { VehicleForm } from './pages/VehicleForm';
import { Vehicles } from './pages/Vehicles';

// Screens with maps, charts or admin tables load on first visit, so the start page opens quickly.
const AdminOverview = lazy(() =>
  import('./pages/admin/Overview').then((m) => ({ default: m.AdminOverview })),
);
const Efficiency = lazy(() =>
  import('./pages/admin/Efficiency').then((m) => ({ default: m.Efficiency })),
);
const ErpRates = lazy(() =>
  import('./pages/admin/ErpRates').then((m) => ({ default: m.ErpRates })),
);
const FuelPrices = lazy(() =>
  import('./pages/admin/FuelPrices').then((m) => ({ default: m.FuelPrices })),
);
const Compare = lazy(() => import('./pages/Compare').then((m) => ({ default: m.Compare })));
const Estimate = lazy(() => import('./pages/Estimate').then((m) => ({ default: m.Estimate })));
const History = lazy(() => import('./pages/History').then((m) => ({ default: m.History })));
const LogCosts = lazy(() => import('./pages/LogCosts').then((m) => ({ default: m.LogCosts })));
const Optimise = lazy(() => import('./pages/Optimise').then((m) => ({ default: m.Optimise })));
const PlanTrip = lazy(() => import('./pages/PlanTrip').then((m) => ({ default: m.PlanTrip })));
const TopUp = lazy(() => import('./pages/TopUp').then((m) => ({ default: m.TopUp })));

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<Landing />} />
          <Route path="/sign-in" element={<SignIn />} />
          <Route path="/register" element={<Register />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route element={<RequireAuth />}>
            <Route path="/app" element={<Overview />} />
            <Route path="/app/vehicles" element={<Vehicles />} />
            <Route path="/app/vehicles/new" element={<VehicleForm />} />
            <Route path="/app/vehicles/:id" element={<VehicleForm />} />
            <Route path="/app/plan" element={<PlanTrip />} />
            <Route path="/app/trips/:id" element={<Estimate />} />
            <Route path="/app/trips/:id/compare" element={<Compare />} />
            <Route path="/app/trips/:id/optimise" element={<Optimise />} />
            <Route path="/app/trips/:id/top-up" element={<TopUp />} />
            <Route path="/app/history" element={<History />} />
            <Route path="/app/history/:id/log" element={<LogCosts />} />
          </Route>
          <Route element={<RequireAuth role="ADMINISTRATOR" />}>
            <Route path="/admin" element={<Navigate to="/admin/overview" replace />} />
            <Route path="/admin/overview" element={<AdminOverview />} />
            <Route path="/admin/fuel-prices" element={<FuelPrices />} />
            <Route path="/admin/erp-rates" element={<ErpRates />} />
            <Route path="/admin/efficiency" element={<Efficiency />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { SyncStatus } from "./components/abl/SyncStatus";
import { SyncStatusListener } from "./components/abl/SyncStatusListener";
import { lazy, Suspense, useEffect } from "react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import AppLayout from "./components/AppLayout";
import Dashboard from "./pages/Dashboard";

const CDBPage = lazy(() => import("./pages/CDBPage"));
const PurchaseBookPage = lazy(() => import("./pages/PurchaseBookPage"));
const SalesBookPage = lazy(() => import("./pages/SalesBookPage"));
const CashReceiptsPage = lazy(() => import("./pages/CashReceiptsPage"));
const GeneralLedger = lazy(() => import("./pages/GeneralLedger"));
const TrialBalance = lazy(() => import("./pages/TrialBalance"));
const Maintenance = lazy(() => import("./pages/Maintenance"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));

const queryClient = new QueryClient();

const PageFallback = () => (
  <div style={{ background: "#0a1628", minHeight: "100vh" }} />
);

const App = () => {
  useEffect(() => {
    import("sonner").then(({ toast }) => {
      toast.success("Welcome back, Adrian!", {
        description: "Your financial dashboard is ready.",
        duration: 5000,
      });
    });
  }, []);

  return (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <SyncStatus />
      <SyncStatusListener />
      <Toaster />
      <Sonner richColors position="top-right" />
      <BrowserRouter>
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/cdb" element={<CDBPage />} />
              <Route path="/purchase-book" element={<PurchaseBookPage />} />
              <Route path="/sales-book" element={<SalesBookPage />} />
              <Route path="/cash-receipts" element={<CashReceiptsPage />} />
              <Route path="/general-ledger" element={<GeneralLedger />} />
              <Route path="/trial-balance" element={<TrialBalance />} />
              <Route path="/maintenance" element={<Maintenance />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  );
};

export default App;

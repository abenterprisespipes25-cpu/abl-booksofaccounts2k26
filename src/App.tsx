import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
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
const JournalEntries = lazy(() => import("./pages/JournalEntries"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));

const queryClient = new QueryClient();

const PageFallback = () => (
  <div className="min-h-screen bg-[#0a1628] flex items-center justify-center p-6">
    <div className="w-full max-w-5xl space-y-8 animate-pulse">
      <div className="h-12 bg-white/5 rounded-lg w-1/3 mx-auto"></div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 sm:gap-8">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-48 bg-white/5 rounded-xl"></div>
        ))}
      </div>
    </div>
  </div>
);

const App = () => {

  return (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
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
              <Route path="/journal-entries" element={<JournalEntries />} />
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

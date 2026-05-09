import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { handleApiError } from "@/lib/errorHandler";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download, Upload, Trash2, AlertTriangle, Loader2, Building2, Save } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const ALL_TABLES = [
  "uploaded_files", "cdb_entries", "purchase_book_entries",
  "sales_book_entries", "cash_receipts_entries", "gl_entries",
] as const;

const MODULE_TO_TABLE: Record<string, string> = {
  CDB: "cdb_entries", PB: "purchase_book_entries",
  SB: "sales_book_entries", CR: "cash_receipts_entries",
};

export default function Maintenance() {
  const queryClient = useQueryClient();
  const [uploads, setUploads] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [clearText, setClearText] = useState("");
  const [showClear, setShowClear] = useState(false);
  const [restoreData, setRestoreData] = useState<any | null>(null);
  const [restoreConfirm, setRestoreConfirm] = useState("");
  const restoreRef = useRef<HTMLInputElement>(null);

  // Company settings
  const [company, setCompany] = useState({ company_name: "", address: "", tin_no: "", contact_no: "" });
  const [companyId, setCompanyId] = useState<string | null>(null);

  const { isLoading: isLoadingCompany, error: companyError } = useQuery({
    queryKey: ["company_settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("company_settings").select("*").limit(1).maybeSingle();
      if (error) throw error;
      if (data) {
        setCompanyId(data.id);
        setCompany({
          company_name: data.company_name || "",
          address: data.address || "",
          tin_no: data.tin_no || "",
          contact_no: data.contact_no || "",
        });
      }
      return data;
    },
    retry: 3,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (companyError) handleApiError(companyError, "loading company settings");
  }, [companyError]);

  const saveCompanyMutation = useMutation({
    mutationFn: async (payload: any) => {
      if (companyId) {
        const { error } = await supabase.from("company_settings").update(payload).eq("id", companyId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("company_settings").insert(payload).select().single();
        if (error) throw error;
        if (data) setCompanyId(data.id);
        return data;
      }
    },
    retry: 2,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company_settings"] });
      toast.success("Company settings saved.");
    },
    onError: (error) => handleApiError(error, "saving company settings")
  });

  function saveCompany() {
    if (!company.company_name) {
      toast.error("Company Name is required");
      return;
    }
    const payload = { ...company, updated_at: new Date().toISOString() };
    saveCompanyMutation.mutate(payload);
  }

  const savingCompany = saveCompanyMutation.isPending;

  async function loadUploads() {
    const { data } = await supabase.from("uploaded_files").select("*").order("uploaded_at", { ascending: false });
    setUploads(data ?? []);
  }
  useEffect(() => { loadUploads(); }, []);

  async function backup() {
    setBusy(true);
    try {
      const result: Record<string, any[]> = {};
      for (const t of ALL_TABLES) {
        const { data, error } = await supabase.from(t).select("*");
        if (error) throw error;
        result[t] = data ?? [];
      }
      const blob = new Blob([JSON.stringify({ version: "2.1", tables: result, created_at: new Date().toISOString() }, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      a.href = url; a.download = `ABL_Backup_${ts}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Backup downloaded.");
    } catch (e: any) {
      toast.error(`Backup failed: ${e.message || e}`);
    } finally { setBusy(false); }
  }

  async function handleRestoreFile(f: File) {
    try {
      const text = await f.text();
      const parsed = JSON.parse(text);
      if (!parsed.tables) throw new Error("Invalid backup file.");
      setRestoreData(parsed);
      setRestoreConfirm("");
    } catch (e: any) { toast.error(`Cannot read backup: ${e.message}`); }
    if (restoreRef.current) restoreRef.current.value = "";
  }

  async function doRestore() {
    if (!restoreData || restoreConfirm !== "CONFIRM") return;
    setBusy(true);
    try {
      // Wipe
      for (const t of ALL_TABLES) await supabase.from(t).delete().neq("id", "00000000-0000-0000-0000-000000000000");
      // Insert
      for (const t of ALL_TABLES) {
        const arr = restoreData.tables[t] ?? [];
        if (!arr.length) continue;
        const BATCH = 200;
        for (let i = 0; i < arr.length; i += BATCH) {
          const { error } = await supabase.from(t).insert(arr.slice(i, i + BATCH));
          if (error) throw error;
        }
      }
      toast.success("Restore complete. Refreshing...");
      await loadUploads();
      setRestoreData(null);
      setRestoreConfirm("");
    } catch (e: any) {
      toast.error(`Restore failed: ${e.message || e}`);
    } finally { setBusy(false); }
  }

  async function deleteUpload(u: any) {
    if (!confirm(`Delete ${u.module} — ${u.month_year}? This also removes the GL entries for this month.`)) return;
    setBusy(true);
    try {
      const table = MODULE_TO_TABLE[u.module];
      if (table) await supabase.from(table as any).delete().eq("month_year", u.month_year);
      await supabase.from("gl_entries").delete()
        .eq("source_module", u.module).eq("month_year", u.month_year);
      await supabase.from("uploaded_files").delete().eq("id", u.id);
      toast.success("Deleted.");
      await loadUploads();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }

  async function clearAll() {
    if (clearText !== "DELETE ALL") return;
    setBusy(true);
    try {
      for (const t of ALL_TABLES) await supabase.from(t).delete().neq("id", "00000000-0000-0000-0000-000000000000");
      toast.success("All data cleared.");
      setShowClear(false); setClearText("");
      await loadUploads();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-primary">Maintenance</h2>
        <p className="text-xs text-muted-foreground">Backup, restore, and manage uploaded data.</p>
      </div>

      <Card className="p-5">
        <h3 className="font-semibold text-sm mb-3 text-primary flex items-center gap-2">
          <Building2 className="h-4 w-4" /> Company Settings
        </h3>
        <p className="text-xs text-muted-foreground mb-4">
          Used as the header for all Excel and PDF exports across every module.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs">Company Name</Label>
            <Input
              value={company.company_name}
              onChange={(e) => setCompany({ ...company, company_name: e.target.value })}
              placeholder="ABL Books of Accounts"
            />
          </div>
          <div>
            <Label className="text-xs">TIN No.</Label>
            <Input
              value={company.tin_no}
              onChange={(e) => setCompany({ ...company, tin_no: e.target.value })}
              placeholder="000-000-000-000"
            />
          </div>
          <div className="md:col-span-2">
            <Label className="text-xs">Address</Label>
            <Input
              value={company.address}
              onChange={(e) => setCompany({ ...company, address: e.target.value })}
              placeholder="Street, City, Province"
            />
          </div>
          <div>
            <Label className="text-xs">Contact No.</Label>
            <Input
              value={company.contact_no}
              onChange={(e) => setCompany({ ...company, contact_no: e.target.value })}
              placeholder="+63 ..."
            />
          </div>
        </div>
        <div className="mt-4">
          <Button onClick={saveCompany} disabled={savingCompany}>
            {savingCompany ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Company Settings
          </Button>
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="font-semibold text-sm mb-3 text-primary">Backup & Restore</h3>
        <div className="flex flex-wrap gap-3">
          <Button onClick={backup} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Backup All Data
          </Button>
          <input ref={restoreRef} type="file" accept=".json" className="hidden"
            onChange={(e) => e.target.files?.[0] && handleRestoreFile(e.target.files[0])} />
          <Button variant="outline" onClick={() => restoreRef.current?.click()} disabled={busy}>
            <Upload className="h-4 w-4" /> Restore from Backup
          </Button>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-muted/40">
          <h3 className="font-semibold text-sm text-primary">Uploaded Files Log</h3>
        </div>
        {uploads.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No uploads yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-primary text-primary-foreground text-xs uppercase">
              <tr>
                <th className="px-4 py-2 text-left">Module</th>
                <th className="px-4 py-2 text-left">Month Year</th>
                <th className="px-4 py-2 text-left">File Name</th>
                <th className="px-4 py-2 text-right">Rows</th>
                <th className="px-4 py-2 text-left">Uploaded</th>
                <th className="px-4 py-2 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {uploads.map((u) => (
                <tr key={u.id} className="border-t border-border">
                  <td className="px-4 py-2 font-semibold">{u.module}</td>
                  <td className="px-4 py-2">{u.month_year}</td>
                  <td className="px-4 py-2 text-muted-foreground truncate max-w-xs">{u.file_name}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{u.row_count}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(u.uploaded_at), { addSuffix: true })}
                  </td>
                  <td className="px-4 py-2">
                    <Button variant="ghost" size="sm" onClick={() => deleteUpload(u)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card className="p-5 border-destructive/40 bg-destructive/5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-semibold text-sm text-destructive">Danger Zone</h3>
            <p className="text-xs text-muted-foreground mt-1 mb-3">
              Permanently clear all data from all tables. This cannot be undone.
            </p>
            <Button variant="destructive" onClick={() => setShowClear(true)}>
              <Trash2 className="h-4 w-4" /> Clear All Data
            </Button>
          </div>
        </div>
      </Card>

      {/* Clear All dialog */}
      <AlertDialog open={showClear} onOpenChange={setShowClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear ALL data?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete everything from every table. Type <strong>DELETE ALL</strong> to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input value={clearText} onChange={(e) => setClearText(e.target.value)} placeholder="DELETE ALL" />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={clearText !== "DELETE ALL" || busy} onClick={clearAll}>
              Clear Everything
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Restore dialog */}
      <AlertDialog open={!!restoreData} onOpenChange={(o) => !o && setRestoreData(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore from backup?</AlertDialogTitle>
            <AlertDialogDescription>
              This will REPLACE ALL existing data. Type <strong>CONFIRM</strong> to proceed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input value={restoreConfirm} onChange={(e) => setRestoreConfirm(e.target.value)} placeholder="CONFIRM" />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={restoreConfirm !== "CONFIRM" || busy} onClick={doRestore}>
              Restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

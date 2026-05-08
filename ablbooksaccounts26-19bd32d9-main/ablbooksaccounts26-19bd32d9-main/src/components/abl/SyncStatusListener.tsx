import { useEffect, useState } from "react";
import { toast } from "sonner";

export function SyncStatusListener() {
  const [lastSync, setLastSync] = useState<string | null>(null);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/sync-status.json?t=" + Date.now());
        if (!res.ok) return;
        const data = await res.json();
        
        if (data.lastSync !== lastSync) {
          if (data.status === "synced" && lastSync !== null) {
            toast.success(data.message || "Changes synced successfully to Lovable.");
          } else if (data.status === "error") {
            toast.error(data.message || "Sync failed - retrying...");
          }
          setLastSync(data.lastSync);
        }
      } catch (e) {
        // Ignore fetch errors (server might be restarting)
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [lastSync]);

  return null;
}

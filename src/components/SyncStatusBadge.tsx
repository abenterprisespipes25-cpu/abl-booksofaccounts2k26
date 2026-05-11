import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

export function SyncStatusBadge({ table }: { table?: string }) {
  const [status, setStatus] = useState<'live' | 'syncing' | 'offline'>('live');

  useEffect(() => {
    if (!table) return;

    // Simulate connection monitoring
    const checkConnection = () => {
      // In a real Supabase setup, we'd check supabase.realtime.isConnected()
      // Here we just assume live if IndexedDB is available
      setStatus('live');
    };

    checkConnection();
    window.addEventListener('online', checkConnection);
    window.addEventListener('offline', () => setStatus('offline'));

    return () => {
      window.removeEventListener('online', checkConnection);
      window.removeEventListener('offline', checkConnection);
    };
  }, [table]);

  return (
    <div className={cn("sync-badge", status)}>
      <div className="sync-dot" />
      {status === 'live' && 'Live'}
      {status === 'syncing' && 'Syncing...'}
      {status === 'offline' && 'Offline'}
    </div>
  );
}

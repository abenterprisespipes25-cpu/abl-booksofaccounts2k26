// src/services/db.ts
// IndexedDB wrapper that mimics the Supabase client query builder API.
// All components using `supabase.from(table)...` work unchanged.

import { openDB, IDBPDatabase } from 'idb';

const DB_NAME = 'abl_books_db';
const DB_VERSION = 1;

const STORES = [
  'cash_receipts_entries',
  'cdb_entries',
  'cdb_sundries',
  'company_settings',
  'gl_entries',
  'journal_entries',
  'journal_entry_lines',
  'purchase_book_entries',
  'pb_sundries',
  'sales_book_entries',
  'uploaded_files',
] as const;

type StoreName = typeof STORES[number];

let _db: IDBPDatabase | null = null;

async function getDB(): Promise<IDBPDatabase> {
  if (!_db) {
    _db = await openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        for (const store of STORES) {
          if (!db.objectStoreNames.contains(store)) {
            db.createObjectStore(store, { keyPath: 'id' });
          }
        }
      },
    });
  }
  return _db;
}

type Filter =
  | { type: 'eq'; field: string; value: any }
  | { type: 'neq'; field: string; value: any }
  | { type: 'in'; field: string; values: any[] };

type OperationType = 'select' | 'insert' | 'update' | 'delete';

class QueryBuilder implements PromiseLike<{ data: any; error: any }> {
  private _table: string;
  private _operation: OperationType = 'select';
  private _filters: Filter[] = [];
  private _orderBy: { field: string; ascending: boolean } | null = null;
  private _limitCount: number | null = null;
  private _selectFields: string = '*';
  private _insertData: any = null;
  private _updateData: any = null;
  private _isSingle = false;
  private _isMaybeSingle = false;

  constructor(table: string) {
    this._table = table;
  }

  select(fields: string = '*'): this {
    // Handle: .insert(data).select().single() pattern — do NOT override operation
    if (this._operation !== 'insert') {
      this._operation = 'select';
    }
    this._selectFields = fields;
    return this;
  }

  insert(data: any | any[]): this {
    this._operation = 'insert';
    this._insertData = data;
    return this;
  }

  update(data: any): this {
    this._operation = 'update';
    this._updateData = data;
    return this;
  }

  delete(): this {
    this._operation = 'delete';
    return this;
  }

  eq(field: string, value: any): this {
    this._filters.push({ type: 'eq', field, value });
    return this;
  }

  neq(field: string, value: any): this {
    this._filters.push({ type: 'neq', field, value });
    return this;
  }

  in(field: string, values: any[]): this {
    this._filters.push({ type: 'in', field, values });
    return this;
  }

  order(field: string, options?: { ascending?: boolean }): this {
    this._orderBy = { field, ascending: options?.ascending ?? true };
    return this;
  }

  limit(n: number): this {
    this._limitCount = n;
    return this;
  }

  single(): Promise<{ data: any; error: any }> {
    this._isSingle = true;
    return this._execute();
  }

  maybeSingle(): Promise<{ data: any; error: any }> {
    this._isMaybeSingle = true;
    return this._execute();
  }

  then<T>(
    resolve: (value: { data: any; error: any }) => T,
    reject?: (reason: any) => T
  ): Promise<T> {
    return this._execute().then(resolve, reject);
  }

  private _applyFilters(rows: any[]): any[] {
    return rows.filter(row =>
      this._filters.every(f => {
        if (f.type === 'eq') return row[f.field] === f.value;
        if (f.type === 'neq') return row[f.field] !== f.value;
        if (f.type === 'in') return f.values.includes(row[f.field]);
        return true;
      })
    );
  }

  private _applyOrder(rows: any[]): any[] {
    if (!this._orderBy) return rows;
    const { field, ascending } = this._orderBy;
    return [...rows].sort((a, b) => {
      const av = a[field] ?? '';
      const bv = b[field] ?? '';
      if (av < bv) return ascending ? -1 : 1;
      if (av > bv) return ascending ? 1 : -1;
      return 0;
    });
  }

  private _projectFields(rows: any[]): any[] {
    if (this._selectFields === '*') return rows;
    const fields = this._selectFields.split(',').map(f => f.trim()).filter(Boolean);
    return rows.map(row => {
      const result: any = {};
      for (const f of fields) result[f] = row[f];
      return result;
    });
  }

  private async _execute(): Promise<{ data: any; error: any }> {
    try {
      const db = await getDB();

      // ─── SELECT ────────────────────────────────────────────────────────────
      if (this._operation === 'select') {
        let all: any[] = await db.getAll(this._table);
        all = this._applyFilters(all);
        all = this._applyOrder(all);
        if (this._limitCount !== null) all = all.slice(0, this._limitCount);
        const projected = this._projectFields(all);
        if (this._isSingle) {
          return {
            data: projected[0] ?? null,
            error: projected.length === 0 ? { message: 'Row not found' } : null,
          };
        }
        if (this._isMaybeSingle) {
          return { data: projected[0] ?? null, error: null };
        }
        return { data: projected, error: null };
      }

      // ─── INSERT ────────────────────────────────────────────────────────────
      if (this._operation === 'insert') {
        const items = Array.isArray(this._insertData)
          ? this._insertData
          : [this._insertData];
        const inserted: any[] = [];
        const tx = db.transaction(this._table as StoreName, 'readwrite');
        for (const item of items) {
          const row = {
            ...item,
            id: item.id || crypto.randomUUID(),
            created_at: item.created_at || new Date().toISOString(),
          };
          await tx.store.put(row);
          inserted.push(row);
        }
        await tx.done;
        
        // Notify subscribers
        for (const row of inserted) {
          notifySubscribers(this._table, 'INSERT', row);
        }

        if (this._isSingle) return { data: inserted[0] ?? null, error: null };
        if (this._isMaybeSingle) return { data: inserted[0] ?? null, error: null };
        return { data: inserted, error: null };
      }

      // ─── UPDATE ────────────────────────────────────────────────────────────
      if (this._operation === 'update') {
        const all: any[] = await db.getAll(this._table);
        const toUpdate = this._applyFilters(all);
        const updatedRows: any[] = [];
        const tx = db.transaction(this._table as StoreName, 'readwrite');
        for (const row of toUpdate) {
          const updated = { ...row, ...this._updateData };
          await tx.store.put(updated);
          updatedRows.push({ old: row, new: updated });
        }
        await tx.done;

        // Notify subscribers
        for (const u of updatedRows) {
          notifySubscribers(this._table, 'UPDATE', u.new, u.old);
        }

        return { data: null, error: null };
      }

      // ─── DELETE ────────────────────────────────────────────────────────────
      if (this._operation === 'delete') {
        const all: any[] = await db.getAll(this._table);
        const toDelete = this._applyFilters(all);
        const tx = db.transaction(this._table as StoreName, 'readwrite');
        for (const row of toDelete) {
          await tx.store.delete(row.id);
        }
        await tx.done;

        // Notify subscribers
        for (const row of toDelete) {
          notifySubscribers(this._table, 'DELETE', null, row);
        }

        return { data: null, error: null };
      }

      return { data: null, error: { message: 'Unknown operation' } };
    } catch (e: any) {
      console.error('[DB Error]', e);
      return { data: null, error: { message: e?.message || String(e) } };
    }
  }
}

// ─── REALTIME ───────────────────────────────────────────────────────────────

type RealtimeCallback = (payload: {
  event: string;
  schema: string;
  table: string;
  new: any;
  old: any;
}) => void;

class RealtimeChannel {
  private _name: string;
  private _callbacks: Array<{
    event: string;
    schema: string;
    table: string;
    callback: RealtimeCallback;
  }> = [];

  constructor(name: string) {
    this._name = name;
  }

  on(event: string, filter: { schema: string; table: string }, callback: RealtimeCallback): this {
    this._callbacks.push({ event, ...filter, callback });
    return this;
  }

  subscribe(): this {
    _channels.add(this);
    // Simulate async subscription success
    setTimeout(() => {
      // Potentially trigger a 'SUBSCRIBED' event if the client expects it
    }, 0);
    return this;
  }

  unsubscribe() {
    _channels.delete(this);
  }

  emit(table: string, event: string, payload: any) {
    for (const cb of this._callbacks) {
      if ((cb.event === '*' || cb.event === event || (cb.event === 'postgres_changes' && (event === 'INSERT' || event === 'UPDATE' || event === 'DELETE'))) && cb.table === table) {
        cb.callback(payload);
      }
    }
  }
}

const _channels = new Set<RealtimeChannel>();

function notifySubscribers(table: string, event: string, newData: any, oldData: any = null) {
  const payload = { event, schema: 'public', table, new: newData, old: oldData };
  for (const channel of _channels) {
    channel.emit(table, event, payload);
  }
}

// Drop-in replacement for the Supabase client API
export const db = {
  from: (table: string) => new QueryBuilder(table),
  channel: (name: string) => new RealtimeChannel(name),
  removeChannel: (channel: RealtimeChannel) => channel.unsubscribe(),
};

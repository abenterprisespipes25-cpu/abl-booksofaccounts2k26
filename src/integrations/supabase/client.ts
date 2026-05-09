// Supabase has been replaced with a local IndexedDB layer.
// All components import { supabase } from here and continue to work unchanged.
import { db } from '@/services/db';

export const supabase = db;
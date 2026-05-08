// Fetch company settings for export headers (cached for one session run)
import { supabase } from "@/integrations/supabase/client";

export interface CompanySettings {
  company_name: string;
  address: string;
  tin_no: string;
  contact_no: string;
}

const DEFAULT: CompanySettings = {
  company_name: "ABL Books of Accounts",
  address: "",
  tin_no: "",
  contact_no: "",
};

export async function getCompanySettings(): Promise<CompanySettings> {
  try {
    const { data } = await supabase
      .from("company_settings")
      .select("company_name,address,tin_no,contact_no")
      .limit(1)
      .maybeSingle();
    if (!data) return DEFAULT;
    return {
      company_name: data.company_name || DEFAULT.company_name,
      address: data.address || "",
      tin_no: data.tin_no || "",
      contact_no: data.contact_no || "",
    };
  } catch {
    return DEFAULT;
  }
}

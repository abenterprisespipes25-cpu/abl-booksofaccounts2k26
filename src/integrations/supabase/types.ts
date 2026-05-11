export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      cash_receipts_entries: {
        Row: {
          account: string | null
          amount: number | null
          created_at: string | null
          customers: string | null
          entry_date: string
          id: string
          month_year: string
          or_pr_no: string | null
          reference: string | null
        }
        Insert: {
          account?: string | null
          amount?: number | null
          created_at?: string | null
          customers?: string | null
          entry_date: string
          id?: string
          month_year: string
          or_pr_no?: string | null
          reference?: string | null
        }
        Update: {
          account?: string | null
          amount?: number | null
          created_at?: string | null
          customers?: string | null
          entry_date?: string
          id?: string
          month_year?: string
          or_pr_no?: string | null
          reference?: string | null
        }
        Relationships: []
      }
      cdb_entries: {
        Row: {
          accounts_payable_trade: number | null
          advances_officers_emp: number | null
          cash_amount: number | null
          check_no: string | null
          check_voucher_no: string | null
          comm_light_water_admin: number | null
          comm_light_water_plant: number | null
          comm_light_water_sales: number | null
          created_at: string | null
          delivery_expenses: number | null
          direct_labor_basic: number | null
          entry_date: string
          fund: string | null
          id: string
          itw_at_source: number | null
          itw_compensation: number | null
          itw_top_10k_corp: number | null
          month_year: string
          outside_services_construction: number | null
          overhead_labor_basic: number | null
          particulars: string | null
          payee: string | null
          petty_cash_voucher: string | null
          sales_comm_3rd_party: number | null
          sss_hdmf_loan: number | null
          sss_phic_hdmf_prem: number | null
          sundries_acct_title: string | null
          sundries_cr: number | null
          sundries_dr: number | null
          sundry_parent_id: string | null
          allSplitRows_json: string | null
          travel_admin: number | null
          travel_construction: number | null
          travel_sales: number | null
          travel_water: number | null
          vat_input_tax: number | null
        }
        Insert: {
          accounts_payable_trade?: number | null
          advances_officers_emp?: number | null
          cash_amount?: number | null
          check_no?: string | null
          check_voucher_no?: string | null
          comm_light_water_admin?: number | null
          comm_light_water_plant?: number | null
          comm_light_water_sales?: number | null
          created_at?: string | null
          delivery_expenses?: number | null
          direct_labor_basic?: number | null
          entry_date: string
          fund?: string | null
          id?: string
          itw_at_source?: number | null
          itw_compensation?: number | null
          itw_top_10k_corp?: number | null
          month_year: string
          outside_services_construction?: number | null
          overhead_labor_basic?: number | null
          particulars?: string | null
          payee?: string | null
          petty_cash_voucher?: string | null
          sales_comm_3rd_party?: number | null
          sss_hdmf_loan?: number | null
          sss_phic_hdmf_prem?: number | null
          sundries_acct_title?: string | null
          sundries_cr?: number | null
          sundries_dr?: number | null
          sundry_parent_id?: string | null
          allSplitRows_json?: string | null
          travel_admin?: number | null
          travel_construction?: number | null
          travel_sales?: number | null
          travel_water?: number | null
          vat_input_tax?: number | null
        }
        Update: {
          accounts_payable_trade?: number | null
          advances_officers_emp?: number | null
          cash_amount?: number | null
          check_no?: string | null
          check_voucher_no?: string | null
          comm_light_water_admin?: number | null
          comm_light_water_plant?: number | null
          comm_light_water_sales?: number | null
          created_at?: string | null
          delivery_expenses?: number | null
          direct_labor_basic?: number | null
          entry_date?: string
          fund?: string | null
          id?: string
          itw_at_source?: number | null
          itw_compensation?: number | null
          itw_top_10k_corp?: number | null
          month_year?: string
          outside_services_construction?: number | null
          overhead_labor_basic?: number | null
          particulars?: string | null
          payee?: string | null
          petty_cash_voucher?: string | null
          sales_comm_3rd_party?: number | null
          sss_hdmf_loan?: number | null
          sss_phic_hdmf_prem?: number | null
          sundries_acct_title?: string | null
          sundries_cr?: number | null
          sundries_dr?: number | null
          sundry_parent_id?: string | null
          allSplitRows_json?: string | null
          travel_admin?: number | null
          travel_construction?: number | null
          travel_sales?: number | null
          travel_water?: number | null
          vat_input_tax?: number | null
        }
        Relationships: []
      }
      company_settings: {
        Row: {
          address: string | null
          company_name: string
          contact_no: string | null
          id: string
          tin_no: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          company_name?: string
          contact_no?: string | null
          id?: string
          tin_no?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          company_name?: string
          contact_no?: string | null
          id?: string
          tin_no?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      gl_entries: {
        Row: {
          account_code: string | null
          account_name: string
          created_at: string | null
          credit: number | null
          debit: number | null
          entry_date: string
          folio: string | null
          id: string
          month_year: string
          particulars: string | null
          source_module: string
          source_ref: string | null
        }
        Insert: {
          account_code?: string | null
          account_name: string
          created_at?: string | null
          credit?: number | null
          debit?: number | null
          entry_date: string
          folio?: string | null
          id?: string
          month_year: string
          particulars?: string | null
          source_module: string
          source_ref?: string | null
        }
        Update: {
          account_code?: string | null
          account_name?: string
          created_at?: string | null
          credit?: number | null
          debit?: number | null
          entry_date?: string
          folio?: string | null
          id?: string
          month_year?: string
          particulars?: string | null
          source_module?: string
          source_ref?: string | null
        }
        Relationships: []
      }
      journal_entries: {
        Row: {
          approved_by: string | null
          created_at: string
          entry_date: string
          id: string
          journal_no: string
          month_year: string
          prepared_by: string | null
          reference_no: string | null
          remarks: string | null
          updated_at: string
        }
        Insert: {
          approved_by?: string | null
          created_at?: string
          entry_date: string
          id?: string
          journal_no: string
          month_year: string
          prepared_by?: string | null
          reference_no?: string | null
          remarks?: string | null
          updated_at?: string
        }
        Update: {
          approved_by?: string | null
          created_at?: string
          entry_date?: string
          id?: string
          journal_no?: string
          month_year?: string
          prepared_by?: string | null
          reference_no?: string | null
          remarks?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      journal_entry_lines: {
        Row: {
          account_code: string | null
          account_name: string
          created_at: string
          credit: number
          debit: number
          description: string | null
          id: string
          journal_id: string
          line_order: number
        }
        Insert: {
          account_code?: string | null
          account_name: string
          created_at?: string
          credit?: number
          debit?: number
          description?: string | null
          id?: string
          journal_id: string
          line_order?: number
        }
        Update: {
          account_code?: string | null
          account_name?: string
          created_at?: string
          credit?: number
          debit?: number
          description?: string | null
          id?: string
          journal_id?: string
          line_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "journal_entry_lines_journal_id_fkey"
            columns: ["journal_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_book_entries: {
        Row: {
          ap_trade_cr: number | null
          created_at: string | null
          entry_date: string
          fuel_admin: number | null
          fuel_construction: number | null
          fuel_plant: number | null
          fuel_sales: number | null
          id: string
          input_tax: number | null
          invoice_no: string | null
          itw_top_10t: number | null
          month_year: string
          repairs_admin: number | null
          repairs_plant: number | null
          repairs_sales: number | null
          sundries_acct_title: string | null
          sundries_amount: number | null
          supplier: string | null
        }
        Insert: {
          ap_trade_cr?: number | null
          created_at?: string | null
          entry_date: string
          fuel_admin?: number | null
          fuel_construction?: number | null
          fuel_plant?: number | null
          fuel_sales?: number | null
          id?: string
          input_tax?: number | null
          invoice_no?: string | null
          itw_top_10t?: number | null
          month_year: string
          repairs_admin?: number | null
          repairs_plant?: number | null
          repairs_sales?: number | null
          sundries_acct_title?: string | null
          sundries_amount?: number | null
          supplier?: string | null
        }
        Update: {
          ap_trade_cr?: number | null
          created_at?: string | null
          entry_date?: string
          fuel_admin?: number | null
          fuel_construction?: number | null
          fuel_plant?: number | null
          fuel_sales?: number | null
          id?: string
          input_tax?: number | null
          invoice_no?: string | null
          itw_top_10t?: number | null
          month_year?: string
          repairs_admin?: number | null
          repairs_plant?: number | null
          repairs_sales?: number | null
          sundries_acct_title?: string | null
          sundries_amount?: number | null
          supplier?: string | null
        }
        Relationships: []
      }
      sales_book_entries: {
        Row: {
          account_type: string | null
          ar_credit_note: number | null
          ar_trade: number | null
          c_deposits: number | null
          cash_amount: number | null
          created_at: string | null
          customer_name: string | null
          entry_date: string
          gross_sales: number | null
          id: string
          invoice_no: string | null
          month_year: string
          net_sales: number | null
          output_tax: number | null
          output_tax_reversal: number | null
          sales_return: number | null
          tax_name: string | null
          transaction_type: string | null
        }
        Insert: {
          account_type?: string | null
          ar_credit_note?: number | null
          ar_trade?: number | null
          c_deposits?: number | null
          cash_amount?: number | null
          created_at?: string | null
          customer_name?: string | null
          entry_date: string
          gross_sales?: number | null
          id?: string
          invoice_no?: string | null
          month_year: string
          net_sales?: number | null
          output_tax?: number | null
          output_tax_reversal?: number | null
          sales_return?: number | null
          tax_name?: string | null
          transaction_type?: string | null
        }
        Update: {
          account_type?: string | null
          ar_credit_note?: number | null
          ar_trade?: number | null
          c_deposits?: number | null
          cash_amount?: number | null
          created_at?: string | null
          customer_name?: string | null
          entry_date?: string
          gross_sales?: number | null
          id?: string
          invoice_no?: string | null
          month_year?: string
          net_sales?: number | null
          output_tax?: number | null
          output_tax_reversal?: number | null
          sales_return?: number | null
          tax_name?: string | null
          transaction_type?: string | null
        }
        Relationships: []
      }
      uploaded_files: {
        Row: {
          file_name: string
          id: string
          module: string
          month_year: string
          row_count: number | null
          uploaded_at: string | null
        }
        Insert: {
          file_name: string
          id?: string
          module: string
          month_year: string
          row_count?: number | null
          uploaded_at?: string | null
        }
        Update: {
          file_name?: string
          id?: string
          module?: string
          month_year?: string
          row_count?: number | null
          uploaded_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

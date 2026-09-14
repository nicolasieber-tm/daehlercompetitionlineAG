export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      follow_up_rules: {
        Row: {
          active: boolean
          body: string
          created_at: string
          days_after_reply: number
          id: string
          max_count: number
          name: string
          sort: number
          subject: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          body: string
          created_at?: string
          days_after_reply: number
          id?: string
          max_count?: number
          name: string
          sort?: number
          subject: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          body?: string
          created_at?: string
          days_after_reply?: number
          id?: string
          max_count?: number
          name?: string
          sort?: number
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      follow_ups: {
        Row: {
          cancelled_at: string | null
          created_at: string
          id: string
          inquiry_id: string
          outbound_email_id: string | null
          rule_id: string | null
          scheduled_for: string
          sent_at: string | null
          updated_at: string
        }
        Insert: {
          cancelled_at?: string | null
          created_at?: string
          id?: string
          inquiry_id: string
          outbound_email_id?: string | null
          rule_id?: string | null
          scheduled_for: string
          sent_at?: string | null
          updated_at?: string
        }
        Update: {
          cancelled_at?: string | null
          created_at?: string
          id?: string
          inquiry_id?: string
          outbound_email_id?: string | null
          rule_id?: string | null
          scheduled_for?: string
          sent_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "follow_ups_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: false
            referencedRelation: "inquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_outbound_email_id_fkey"
            columns: ["outbound_email_id"]
            isOneToOne: false
            referencedRelation: "outbound_emails"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "follow_up_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      inquiries: {
        Row: {
          ai_extraction: Json | null
          answer_received_at: string | null
          been_here: boolean
          categories: string[]
          channel: string | null
          character: string | null
          checks: Json
          city: string | null
          consulting: boolean
          created_at: string
          draft_reply: string | null
          draft_subject: string | null
          email: string | null
          estimated_total: number | null
          family_id: string | null
          first_name: string | null
          follow_up_answers: Json
          id: string
          last_name: string | null
          locale: string
          message: string | null
          model_id: string | null
          number: string
          phone: string | null
          raw_text: string | null
          replied_at: string | null
          selections: Json
          share_token: string
          source: string
          status: string
          timing: string | null
          updated_at: string
          vehicle_text: string | null
          year: string | null
        }
        Insert: {
          ai_extraction?: Json | null
          answer_received_at?: string | null
          been_here?: boolean
          categories?: string[]
          channel?: string | null
          character?: string | null
          checks?: Json
          city?: string | null
          consulting?: boolean
          created_at?: string
          draft_reply?: string | null
          draft_subject?: string | null
          email?: string | null
          estimated_total?: number | null
          family_id?: string | null
          first_name?: string | null
          follow_up_answers?: Json
          id?: string
          last_name?: string | null
          locale?: string
          message?: string | null
          model_id?: string | null
          number: string
          phone?: string | null
          raw_text?: string | null
          replied_at?: string | null
          selections?: Json
          share_token: string
          source?: string
          status?: string
          timing?: string | null
          updated_at?: string
          vehicle_text?: string | null
          year?: string | null
        }
        Update: {
          ai_extraction?: Json | null
          answer_received_at?: string | null
          been_here?: boolean
          categories?: string[]
          channel?: string | null
          character?: string | null
          checks?: Json
          city?: string | null
          consulting?: boolean
          created_at?: string
          draft_reply?: string | null
          draft_subject?: string | null
          email?: string | null
          estimated_total?: number | null
          family_id?: string | null
          first_name?: string | null
          follow_up_answers?: Json
          id?: string
          last_name?: string | null
          locale?: string
          message?: string | null
          model_id?: string | null
          number?: string
          phone?: string | null
          raw_text?: string | null
          replied_at?: string | null
          selections?: Json
          share_token?: string
          source?: string
          status?: string
          timing?: string | null
          updated_at?: string
          vehicle_text?: string | null
          year?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inquiries_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "model_families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiries_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "models"
            referencedColumns: ["id"]
          },
        ]
      }
      inquiry_counters: {
        Row: {
          created_at: string
          last: number
          year: number
        }
        Insert: {
          created_at?: string
          last?: number
          year: number
        }
        Update: {
          created_at?: string
          last?: number
          year?: number
        }
        Relationships: []
      }
      model_families: {
        Row: {
          active: boolean
          brand: string
          codes: string[]
          created_at: string
          has_pricelist: boolean
          id: string
          name: string
          photo_url: string | null
          pricelist_no: string | null
          short_text: string | null
          slug: string
          sort: number
          source_file: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          brand: string
          codes?: string[]
          created_at?: string
          has_pricelist?: boolean
          id?: string
          name: string
          photo_url?: string | null
          pricelist_no?: string | null
          short_text?: string | null
          slug: string
          sort?: number
          source_file?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          brand?: string
          codes?: string[]
          created_at?: string
          has_pricelist?: boolean
          id?: string
          name?: string
          photo_url?: string | null
          pricelist_no?: string | null
          short_text?: string | null
          slug?: string
          sort?: number
          source_file?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      models: {
        Row: {
          active: boolean
          created_at: string
          family_id: string
          fuel: string | null
          id: string
          name: string
          photo_url: string | null
          series_nm: number | null
          series_ps: number | null
          series_ps_suggested: number[]
          slug: string
          sort: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          family_id: string
          fuel?: string | null
          id?: string
          name: string
          photo_url?: string | null
          series_nm?: number | null
          series_ps?: number | null
          series_ps_suggested?: number[]
          slug: string
          sort?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          family_id?: string
          fuel?: string | null
          id?: string
          name?: string
          photo_url?: string | null
          series_nm?: number | null
          series_ps?: number | null
          series_ps_suggested?: number[]
          slug?: string
          sort?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "models_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "model_families"
            referencedColumns: ["id"]
          },
        ]
      }
      outbound_emails: {
        Row: {
          body_text: string | null
          created_at: string
          error: string | null
          id: string
          inquiry_id: string
          resend_id: string | null
          sent_at: string | null
          status: string
          subject: string | null
          to_email: string
          type: string
          updated_at: string
        }
        Insert: {
          body_text?: string | null
          created_at?: string
          error?: string | null
          id?: string
          inquiry_id: string
          resend_id?: string | null
          sent_at?: string | null
          status?: string
          subject?: string | null
          to_email: string
          type: string
          updated_at?: string
        }
        Update: {
          body_text?: string | null
          created_at?: string
          error?: string | null
          id?: string
          inquiry_id?: string
          resend_id?: string | null
          sent_at?: string | null
          status?: string
          subject?: string | null
          to_email?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outbound_emails_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: false
            referencedRelation: "inquiries"
            referencedColumns: ["id"]
          },
        ]
      }
      pricelist_imports: {
        Row: {
          applied_at: string | null
          created_at: string
          created_by: string | null
          diff: Json | null
          filenames: string[]
          id: string
          status: string
          summary: Json | null
          updated_at: string
        }
        Insert: {
          applied_at?: string | null
          created_at?: string
          created_by?: string | null
          diff?: Json | null
          filenames?: string[]
          id?: string
          status?: string
          summary?: Json | null
          updated_at?: string
        }
        Update: {
          applied_at?: string | null
          created_at?: string
          created_by?: string | null
          diff?: Json | null
          filenames?: string[]
          id?: string
          status?: string
          summary?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      pricelist_notes: {
        Row: {
          category: string | null
          created_at: string
          family_id: string
          id: string
          sort: number
          text: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          family_id: string
          id?: string
          sort?: number
          text: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          family_id?: string
          id?: string
          sort?: number
          text?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pricelist_notes_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "model_families"
            referencedColumns: ["id"]
          },
        ]
      }
      product_fitment: {
        Row: {
          created_at: string
          model_id: string
          product_id: string
        }
        Insert: {
          created_at?: string
          model_id: string
          product_id: string
        }
        Update: {
          created_at?: string
          model_id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_fitment_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_fitment_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          article_no: string | null
          category: string
          content_hash: string | null
          created_at: string
          description: string | null
          family_id: string
          fits_all: boolean
          group_label: string | null
          id: string
          name: string
          nm_to: number | null
          price_approval: number | null
          price_install: number | null
          price_note: string | null
          price_parts: number | null
          price_status: string
          price_total: number | null
          ps_base: number[]
          ps_to: number | null
          rc: string | null
          sort: number
          source_category: string | null
          source_row: number | null
          updated_at: string
          variant_group: string | null
        }
        Insert: {
          active?: boolean
          article_no?: string | null
          category: string
          content_hash?: string | null
          created_at?: string
          description?: string | null
          family_id: string
          fits_all?: boolean
          group_label?: string | null
          id?: string
          name: string
          nm_to?: number | null
          price_approval?: number | null
          price_install?: number | null
          price_note?: string | null
          price_parts?: number | null
          price_status?: string
          price_total?: number | null
          ps_base?: number[]
          ps_to?: number | null
          rc?: string | null
          sort?: number
          source_category?: string | null
          source_row?: number | null
          updated_at?: string
          variant_group?: string | null
        }
        Update: {
          active?: boolean
          article_no?: string | null
          category?: string
          content_hash?: string | null
          created_at?: string
          description?: string | null
          family_id?: string
          fits_all?: boolean
          group_label?: string | null
          id?: string
          name?: string
          nm_to?: number | null
          price_approval?: number | null
          price_install?: number | null
          price_note?: string | null
          price_parts?: number | null
          price_status?: string
          price_total?: number | null
          ps_base?: number[]
          ps_to?: number | null
          rc?: string | null
          sort?: number
          source_category?: string | null
          source_row?: number | null
          updated_at?: string
          variant_group?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "model_families"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          created_at: string
          key: string
          updated_at: string
          value: string | null
        }
        Insert: {
          created_at?: string
          key: string
          updated_at?: string
          value?: string | null
        }
        Update: {
          created_at?: string
          key?: string
          updated_at?: string
          value?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_share_token: { Args: never; Returns: string }
      next_inquiry_number: { Args: never; Returns: string }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const


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
      audit_logs: {
        Row: {
          action: string
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          metadata: Json | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      business_settings: {
        Row: {
          address: string | null
          business_name: string
          created_at: string
          currency: string
          email: string | null
          google_link: string | null
          hours: Json | null
          id: string
          instagram: string | null
          logo_url: string | null
          phone: string | null
          receipt_footer: string | null
          refund_policy: string | null
          tax_rate: number
          timezone: string
          tip_presets: number[]
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          business_name: string
          created_at?: string
          currency?: string
          email?: string | null
          google_link?: string | null
          hours?: Json | null
          id?: string
          instagram?: string | null
          logo_url?: string | null
          phone?: string | null
          receipt_footer?: string | null
          refund_policy?: string | null
          tax_rate?: number
          timezone?: string
          tip_presets?: number[]
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          business_name?: string
          created_at?: string
          currency?: string
          email?: string | null
          google_link?: string | null
          hours?: Json | null
          id?: string
          instagram?: string | null
          logo_url?: string | null
          phone?: string | null
          receipt_footer?: string | null
          refund_policy?: string | null
          tax_rate?: number
          timezone?: string
          tip_presets?: number[]
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      customers: {
        Row: {
          allergies: string | null
          birthday: string | null
          created_at: string
          created_by: string | null
          email: string | null
          full_name: string
          id: string
          last_visit_at: string | null
          marketing_opt_in: boolean
          no_show_count: number
          notes: string | null
          phone: string | null
          preferred_staff_id: string | null
          total_spend: number
          updated_at: string
          visit_count: number
        }
        Insert: {
          allergies?: string | null
          birthday?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name: string
          id?: string
          last_visit_at?: string | null
          marketing_opt_in?: boolean
          no_show_count?: number
          notes?: string | null
          phone?: string | null
          preferred_staff_id?: string | null
          total_spend?: number
          updated_at?: string
          visit_count?: number
        }
        Update: {
          allergies?: string | null
          birthday?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name?: string
          id?: string
          last_visit_at?: string | null
          marketing_opt_in?: boolean
          no_show_count?: number
          notes?: string | null
          phone?: string | null
          preferred_staff_id?: string | null
          total_spend?: number
          updated_at?: string
          visit_count?: number
        }
        Relationships: []
      }
      loyalty_accounts: {
        Row: {
          created_at: string
          customer_id: string
          eyebrow_threading_count: number
          free_eyebrow_credits: number
          id: string
          lifetime_points: number
          points_balance: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          eyebrow_threading_count?: number
          free_eyebrow_credits?: number
          id?: string
          lifetime_points?: number
          points_balance?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          eyebrow_threading_count?: number
          free_eyebrow_credits?: number
          id?: string
          lifetime_points?: number
          points_balance?: number
          updated_at?: string
        }
        Relationships: []
      }
      loyalty_transactions: {
        Row: {
          created_at: string
          customer_id: string
          free_credits_delta: number
          id: string
          order_id: string | null
          points_delta: number
          reason: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          free_credits_delta?: number
          id?: string
          order_id?: string | null
          points_delta?: number
          reason: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          free_credits_delta?: number
          id?: string
          order_id?: string | null
          points_delta?: number
          reason?: string
        }
        Relationships: []
      }
      order_items: {
        Row: {
          created_at: string
          discount: number
          id: string
          notes: string | null
          order_id: string
          quantity: number
          service_id: string | null
          service_name: string
          staff_id: string | null
          taxable: boolean
          unit_price: number
        }
        Insert: {
          created_at?: string
          discount?: number
          id?: string
          notes?: string | null
          order_id: string
          quantity?: number
          service_id?: string | null
          service_name: string
          staff_id?: string | null
          taxable?: boolean
          unit_price: number
        }
        Update: {
          created_at?: string
          discount?: number
          id?: string
          notes?: string | null
          order_id?: string
          quantity?: number
          service_id?: string | null
          service_name?: string
          staff_id?: string | null
          taxable?: boolean
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          cashier_id: string | null
          completed_at: string | null
          created_at: string
          customer_id: string | null
          customer_paid_confirmed: boolean
          customer_payment_method: string | null
          customer_tip_amount: number
          discount_total: number
          id: string
          notes: string | null
          order_number: number
          register_session_id: string | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          tax_total: number
          tip_total: number
          total: number
          updated_at: string
        }
        Insert: {
          cashier_id?: string | null
          completed_at?: string | null
          created_at?: string
          customer_id?: string | null
          customer_paid_confirmed?: boolean
          customer_payment_method?: string | null
          customer_tip_amount?: number
          discount_total?: number
          id?: string
          notes?: string | null
          order_number?: number
          register_session_id?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          tax_total?: number
          tip_total?: number
          total?: number
          updated_at?: string
        }
        Update: {
          cashier_id?: string | null
          completed_at?: string | null
          created_at?: string
          customer_id?: string | null
          customer_paid_confirmed?: boolean
          customer_payment_method?: string | null
          customer_tip_amount?: number
          discount_total?: number
          id?: string
          notes?: string | null
          order_number?: number
          register_session_id?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          tax_total?: number
          tip_total?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_register_session_id_fkey"
            columns: ["register_session_id"]
            isOneToOne: false
            referencedRelation: "register_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          card_brand: string | null
          card_last4: string | null
          charge_id: string | null
          created_at: string
          created_by: string | null
          external_reference: string | null
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          order_id: string
          payment_intent_id: string | null
          status: Database["public"]["Enums"]["payment_status"]
        }
        Insert: {
          amount: number
          card_brand?: string | null
          card_last4?: string | null
          charge_id?: string | null
          created_at?: string
          created_by?: string | null
          external_reference?: string | null
          id?: string
          method: Database["public"]["Enums"]["payment_method"]
          order_id: string
          payment_intent_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
        }
        Update: {
          amount?: number
          card_brand?: string | null
          card_last4?: string | null
          charge_id?: string | null
          created_at?: string
          created_by?: string | null
          external_reference?: string | null
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          order_id?: string
          payment_intent_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
        }
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      register_sessions: {
        Row: {
          active_order_id: string | null
          code: string
          created_at: string
          id: string
          last_seen_at: string
          live_cart: Json
          paired_at: string | null
          register_name: string
          updated_at: string
        }
        Insert: {
          active_order_id?: string | null
          code: string
          created_at?: string
          id?: string
          last_seen_at?: string
          live_cart?: Json
          paired_at?: string | null
          register_name?: string
          updated_at?: string
        }
        Update: {
          active_order_id?: string | null
          code?: string
          created_at?: string
          id?: string
          last_seen_at?: string
          live_cart?: Json
          paired_at?: string | null
          register_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      service_categories: {
        Row: {
          active: boolean
          created_at: string
          icon: string | null
          id: string
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          icon?: string | null
          id?: string
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          icon?: string | null
          id?: string
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      services: {
        Row: {
          active: boolean
          category_id: string
          commission_eligible: boolean
          created_at: string
          description: string | null
          duration_minutes: number | null
          id: string
          image_url: string | null
          name: string
          price: number
          sort_order: number
          starts_at: boolean
          taxable: boolean
          updated_at: string
        }
        Insert: {
          active?: boolean
          category_id: string
          commission_eligible?: boolean
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          id?: string
          image_url?: string | null
          name: string
          price?: number
          sort_order?: number
          starts_at?: boolean
          taxable?: boolean
          updated_at?: string
        }
        Update: {
          active?: boolean
          category_id?: string
          commission_eligible?: boolean
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          id?: string
          image_url?: string | null
          name?: string
          price?: number
          sort_order?: number
          starts_at?: boolean
          taxable?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_any_role: {
        Args: {
          _roles: Database["public"]["Enums"]["app_role"][]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "super_admin" | "admin" | "manager" | "cashier" | "staff"
      order_status:
        | "open"
        | "completed"
        | "voided"
        | "refunded"
        | "partially_refunded"
        | "awaiting_customer"
        | "awaiting_confirmation"
      payment_method: "cash" | "card" | "gift_card" | "other" | "split"
      payment_status:
        | "pending"
        | "processing"
        | "succeeded"
        | "failed"
        | "cancelled"
        | "refunded"
        | "partially_refunded"
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
    Enums: {
      app_role: ["super_admin", "admin", "manager", "cashier", "staff"],
      order_status: [
        "open",
        "completed",
        "voided",
        "refunded",
        "partially_refunded",
        "awaiting_customer",
        "awaiting_confirmation",
      ],
      payment_method: ["cash", "card", "gift_card", "other", "split"],
      payment_status: [
        "pending",
        "processing",
        "succeeded",
        "failed",
        "cancelled",
        "refunded",
        "partially_refunded",
      ],
    },
  },
} as const

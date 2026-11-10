export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      families: {
        Row: {
          created_at: string;
          created_by: string;
          id: string;
          name: string;
          treasury_address: string | null;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          id?: string;
          name: string;
          treasury_address?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          id?: string;
          name?: string;
          treasury_address?: string | null;
        };
        Relationships: [];
      };
      family_invites: {
        Row: {
          code: string;
          created_at: string;
          family_id: string;
          member_id: string;
        };
        Insert: {
          code: string;
          created_at?: string;
          family_id: string;
          member_id: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          family_id?: string;
          member_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "family_invites_family_id_fkey";
            columns: ["family_id"];
            isOneToOne: false;
            referencedRelation: "families";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "family_invites_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: true;
            referencedRelation: "family_members";
            referencedColumns: ["id"];
          },
        ];
      };
      family_members: {
        Row: {
          age: number;
          created_at: string;
          display_name: string;
          family_id: string;
          id: string;
          joined_at: string | null;
          role: string;
          user_id: string | null;
          wallet_address: string | null;
        };
        Insert: {
          age?: number;
          created_at?: string;
          display_name: string;
          family_id: string;
          id?: string;
          joined_at?: string | null;
          role: string;
          user_id?: string | null;
          wallet_address?: string | null;
        };
        Update: {
          age?: number;
          created_at?: string;
          display_name?: string;
          family_id?: string;
          id?: string;
          joined_at?: string | null;
          role?: string;
          user_id?: string | null;
          wallet_address?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "family_members_family_id_fkey";
            columns: ["family_id"];
            isOneToOne: false;
            referencedRelation: "families";
            referencedColumns: ["id"];
          },
        ];
      };
      onchain_transactions: {
        Row: {
          amount: number;
          block_number: number | null;
          created_at: string;
          family_id: string;
          kind: string;
          member_id: string | null;
          token_address: string;
          tx_hash: string;
        };
        Insert: {
          amount: number;
          block_number?: number | null;
          created_at?: string;
          family_id: string;
          kind: string;
          member_id?: string | null;
          token_address: string;
          tx_hash: string;
        };
        Update: {
          amount?: number;
          block_number?: number | null;
          created_at?: string;
          family_id?: string;
          kind?: string;
          member_id?: string | null;
          token_address?: string;
          tx_hash?: string;
        };
        Relationships: [
          {
            foreignKeyName: "onchain_transactions_family_id_fkey";
            columns: ["family_id"];
            isOneToOne: false;
            referencedRelation: "families";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "onchain_transactions_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "family_members";
            referencedColumns: ["id"];
          },
        ];
      };
      vault_ledgers: {
        Row: {
          family_id: string;
          state: Json;
          updated_at: string;
          version: number;
        };
        Insert: {
          family_id: string;
          state: Json;
          updated_at?: string;
          version?: number;
        };
        Update: {
          family_id?: string;
          state?: Json;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "vault_ledgers_family_id_fkey";
            columns: ["family_id"];
            isOneToOne: true;
            referencedRelation: "families";
            referencedColumns: ["id"];
          },
        ];
      };
      wallet_login_nonces: {
        Row: {
          address: string;
          created_at: string;
          nonce: string;
        };
        Insert: {
          address: string;
          created_at?: string;
          nonce: string;
        };
        Update: {
          address?: string;
          created_at?: string;
          nonce?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      is_family_guardian: { Args: { _family_id: string }; Returns: boolean };
      is_family_member: { Args: { _family_id: string }; Returns: boolean };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;

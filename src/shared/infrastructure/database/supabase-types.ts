export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instanciate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.4";
  };
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          operationName?: string;
          query?: string;
          variables?: Json;
          extensions?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      daily_selection_entries: {
        Row: {
          completed_flag: boolean;
          created_at: string;
          date: string;
          deleted_at: string | null;
          device_id: string | null;
          id: string;
          sync_version: number;
          task_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          completed_flag?: boolean;
          created_at?: string;
          date: string;
          deleted_at?: string | null;
          device_id?: string | null;
          id: string;
          sync_version?: number;
          task_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          completed_flag?: boolean;
          created_at?: string;
          date?: string;
          deleted_at?: string | null;
          device_id?: string | null;
          id?: string;
          sync_version?: number;
          task_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "daily_selection_entries_task_id_fkey";
            columns: ["task_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
        ];
      };
      sync_metadata: {
        Row: {
          created_at: string;
          device_id: string;
          id: string;
          last_sync_at: string;
          metadata: Json | null;
          sync_token: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          device_id: string;
          id?: string;
          last_sync_at?: string;
          metadata?: Json | null;
          sync_token?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          device_id?: string;
          id?: string;
          last_sync_at?: string;
          metadata?: Json | null;
          sync_token?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      task_logs: {
        Row: {
          action: string;
          details: Json | null;
          device_id: string | null;
          id: string;
          sync_version: number;
          task_id: string | null;
          timestamp: string;
          user_id: string;
        };
        Insert: {
          action: string;
          details?: Json | null;
          device_id?: string | null;
          id: string;
          sync_version?: number;
          task_id?: string | null;
          timestamp?: string;
          user_id: string;
        };
        Update: {
          action?: string;
          details?: Json | null;
          device_id?: string | null;
          id?: string;
          sync_version?: number;
          task_id?: string | null;
          timestamp?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "task_logs_task_id_fkey";
            columns: ["task_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
        ];
      };
      tasks: {
        Row: {
          category: Database["public"]["Enums"]["task_category"];
          created_at: string;
          deferred_until: string | null;
          deleted_at: string | null;
          device_id: string | null;
          id: string;
          inbox_entered_at: string | null;
          order: number;
          original_category:
            | Database["public"]["Enums"]["task_category"]
            | null;
          status: Database["public"]["Enums"]["task_status"];
          sync_version: number;
          title: string;
          updated_at: string;
          user_id: string;
          thumbhash: string | null;
        };
        Insert: {
          category?: Database["public"]["Enums"]["task_category"];
          created_at?: string;
          deferred_until?: string | null;
          deleted_at?: string | null;
          device_id?: string | null;
          id: string;
          inbox_entered_at?: string | null;
          order?: number;
          original_category?:
            | Database["public"]["Enums"]["task_category"]
            | null;
          status?: Database["public"]["Enums"]["task_status"];
          sync_version?: number;
          title: string;
          updated_at?: string;
          user_id: string;
          thumbhash?: string | null;
        };
        Update: {
          category?: Database["public"]["Enums"]["task_category"];
          created_at?: string;
          deferred_until?: string | null;
          deleted_at?: string | null;
          device_id?: string | null;
          id?: string;
          inbox_entered_at?: string | null;
          order?: number;
          original_category?:
            | Database["public"]["Enums"]["task_category"]
            | null;
          status?: Database["public"]["Enums"]["task_status"];
          sync_version?: number;
          title?: string;
          updated_at?: string;
          user_id?: string;
          thumbhash?: string | null;
        };
        Relationships: [];
      };
      user_settings: {
        Row: {
          created_at: string;
          device_id: string | null;
          id: string;
          settings: Json;
          sync_version: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          device_id?: string | null;
          id: string;
          settings?: Json;
          sync_version?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          device_id?: string | null;
          id?: string;
          settings?: Json;
          sync_version?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      cleanup_old_logs: {
        Args: { days_to_keep?: number };
        Returns: number;
      };
      generate_ulid_like_id: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
    };
    Enums: {
      task_category: "SIMPLE" | "FOCUS" | "INBOX" | "DEFERRED";
      task_status: "ACTIVE" | "COMPLETED";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      task_category: ["SIMPLE", "FOCUS", "INBOX", "DEFERRED"],
      task_status: ["ACTIVE", "COMPLETED"],
    },
  },
} as const;

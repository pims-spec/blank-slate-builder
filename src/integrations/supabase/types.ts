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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      ai_gebruik: {
        Row: {
          created_at: string
          dag: string
          id: number
          soort: string
          user_id: string
        }
        Insert: {
          created_at?: string
          dag?: string
          id?: never
          soort: string
          user_id: string
        }
        Update: {
          created_at?: string
          dag?: string
          id?: never
          soort?: string
          user_id?: string
        }
        Relationships: []
      }
      bloxs_objecten: {
        Row: {
          adres_id: string | null
          bloxs_ref: string
          id: string
          laatst_gezien_op: string
          portefeuille_id: string
          soort: string
          sync_id: string
        }
        Insert: {
          adres_id?: string | null
          bloxs_ref: string
          id?: string
          laatst_gezien_op?: string
          portefeuille_id: string
          soort: string
          sync_id: string
        }
        Update: {
          adres_id?: string | null
          bloxs_ref?: string
          id?: string
          laatst_gezien_op?: string
          portefeuille_id?: string
          soort?: string
          sync_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bloxs_objecten_adres_id_portefeuille_id_fkey"
            columns: ["adres_id", "portefeuille_id"]
            isOneToOne: false
            referencedRelation: "portefeuille_adressen"
            referencedColumns: ["id", "portefeuille_id"]
          },
          {
            foreignKeyName: "bloxs_objecten_portefeuille_id_fkey"
            columns: ["portefeuille_id"]
            isOneToOne: false
            referencedRelation: "portefeuilles"
            referencedColumns: ["id"]
          },
        ]
      }
      instellingen: {
        Row: {
          data: Json
          key: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          data: Json
          key: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          data?: Json
          key?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "instellingen_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      klanten: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          naam: string
          pve: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          naam: string
          pve?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          naam?: string
          pve?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "klanten_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      label_resultaten: {
        Row: {
          adres_id: string
          energie_index: number | null
          energieklasse: string | null
          gebouwtype: string | null
          geldig_tot: string | null
          opgehaald_door: string | null
          opgehaald_op: string
          opnamedatum: string | null
          portefeuille_id: string
          registratiedatum: string | null
          status: string
        }
        Insert: {
          adres_id: string
          energie_index?: number | null
          energieklasse?: string | null
          gebouwtype?: string | null
          geldig_tot?: string | null
          opgehaald_door?: string | null
          opgehaald_op?: string
          opnamedatum?: string | null
          portefeuille_id: string
          registratiedatum?: string | null
          status: string
        }
        Update: {
          adres_id?: string
          energie_index?: number | null
          energieklasse?: string | null
          gebouwtype?: string | null
          geldig_tot?: string | null
          opgehaald_door?: string | null
          opgehaald_op?: string
          opnamedatum?: string | null
          portefeuille_id?: string
          registratiedatum?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "label_resultaten_adres_id_portefeuille_id_fkey"
            columns: ["adres_id", "portefeuille_id"]
            isOneToOne: false
            referencedRelation: "portefeuille_adressen"
            referencedColumns: ["id", "portefeuille_id"]
          },
          {
            foreignKeyName: "label_resultaten_opgehaald_door_fkey"
            columns: ["opgehaald_door"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      portefeuille_adressen: {
        Row: {
          bag_id: string | null
          bloks_object_id: string | null
          created_at: string
          huisletter: string
          huisnummer: number
          id: string
          niet_in_bloxs_sinds: string | null
          portefeuille_id: string
          postcode: string
          straat: string | null
          toevoeging: string
          woonplaats: string | null
        }
        Insert: {
          bag_id?: string | null
          bloks_object_id?: string | null
          created_at?: string
          huisletter?: string
          huisnummer: number
          id?: string
          niet_in_bloxs_sinds?: string | null
          portefeuille_id: string
          postcode: string
          straat?: string | null
          toevoeging?: string
          woonplaats?: string | null
        }
        Update: {
          bag_id?: string | null
          bloks_object_id?: string | null
          created_at?: string
          huisletter?: string
          huisnummer?: number
          id?: string
          niet_in_bloxs_sinds?: string | null
          portefeuille_id?: string
          postcode?: string
          straat?: string | null
          toevoeging?: string
          woonplaats?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portefeuille_adressen_portefeuille_id_fkey"
            columns: ["portefeuille_id"]
            isOneToOne: false
            referencedRelation: "portefeuilles"
            referencedColumns: ["id"]
          },
        ]
      }
      portefeuille_analyses: {
        Row: {
          aantal_adressen: number
          analyse_datum: string
          ep_opgehaald_tot: string | null
          ep_opgehaald_van: string | null
          gemaakt_door: string | null
          gemaakt_op: string
          id: string
          instellingen: Json
          portefeuille_id: string
          resultaat: Json
          venster_maanden: number
        }
        Insert: {
          aantal_adressen: number
          analyse_datum: string
          ep_opgehaald_tot?: string | null
          ep_opgehaald_van?: string | null
          gemaakt_door?: string | null
          gemaakt_op?: string
          id?: string
          instellingen: Json
          portefeuille_id: string
          resultaat: Json
          venster_maanden?: number
        }
        Update: {
          aantal_adressen?: number
          analyse_datum?: string
          ep_opgehaald_tot?: string | null
          ep_opgehaald_van?: string | null
          gemaakt_door?: string | null
          gemaakt_op?: string
          id?: string
          instellingen?: Json
          portefeuille_id?: string
          resultaat?: Json
          venster_maanden?: number
        }
        Relationships: [
          {
            foreignKeyName: "portefeuille_analyses_gemaakt_door_fkey"
            columns: ["gemaakt_door"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portefeuille_analyses_portefeuille_id_fkey"
            columns: ["portefeuille_id"]
            isOneToOne: false
            referencedRelation: "portefeuilles"
            referencedColumns: ["id"]
          },
        ]
      }
      portefeuilles: {
        Row: {
          bloks_id: string | null
          bloxs_complex_ref: string | null
          bloxs_eigenaar_ref: string | null
          bloxs_gesynchroniseerd_op: string | null
          bron: string
          created_at: string
          created_by: string | null
          id: string
          klant_id: string | null
          naam: string
          updated_at: string
        }
        Insert: {
          bloks_id?: string | null
          bloxs_complex_ref?: string | null
          bloxs_eigenaar_ref?: string | null
          bloxs_gesynchroniseerd_op?: string | null
          bron?: string
          created_at?: string
          created_by?: string | null
          id?: string
          klant_id?: string | null
          naam: string
          updated_at?: string
        }
        Update: {
          bloks_id?: string | null
          bloxs_complex_ref?: string | null
          bloxs_eigenaar_ref?: string | null
          bloxs_gesynchroniseerd_op?: string | null
          bron?: string
          created_at?: string
          created_by?: string | null
          id?: string
          klant_id?: string | null
          naam?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portefeuilles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portefeuilles_klant_id_fkey"
            columns: ["klant_id"]
            isOneToOne: false
            referencedRelation: "klanten"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      telling_shares: {
        Row: {
          created_at: string
          gedeeld_door: string | null
          telling_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          gedeeld_door?: string | null
          telling_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          gedeeld_door?: string | null
          telling_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "telling_shares_gedeeld_door_fkey"
            columns: ["gedeeld_door"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telling_shares_telling_id_fkey"
            columns: ["telling_id"]
            isOneToOne: false
            referencedRelation: "tellingen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telling_shares_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      telling_versies: {
        Row: {
          created_at: string
          data: Json
          id: string
          nr: number
          telling_id: string
        }
        Insert: {
          created_at?: string
          data?: Json
          id: string
          nr: number
          telling_id: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          nr?: number
          telling_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "telling_versies_telling_id_fkey"
            columns: ["telling_id"]
            isOneToOne: false
            referencedRelation: "tellingen"
            referencedColumns: ["id"]
          },
        ]
      }
      tellingen: {
        Row: {
          created_at: string
          data: Json
          id: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          data?: Json
          id?: string
          owner_id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tellingen_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
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
      ai_gebruik_boeken: { Args: { _soort: string }; Returns: Json }
      bloxs_sync_afronden: {
        Args: { p_portefeuille: string; p_sync: string }
        Returns: {
          gemarkeerd: number
          teruggekeerd: number
          vervallen_objecten: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      heeft_een_rol: { Args: { _user_id: string }; Returns: boolean }
      heeft_schrijfrol: { Args: { _user_id: string }; Returns: boolean }
      is_gedeeld_met_mij: { Args: { _telling_id: string }; Returns: boolean }
      mag_telling_bewerken: { Args: { _telling_id: string }; Returns: boolean }
      mag_telling_zien: { Args: { _telling_id: string }; Returns: boolean }
      telling_id_uit_pad: { Args: { _naam: string }; Returns: string }
    }
    Enums: {
      app_role: "admin" | "member" | "viewer"
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
  public: {
    Enums: {
      app_role: ["admin", "member", "viewer"],
    },
  },
} as const

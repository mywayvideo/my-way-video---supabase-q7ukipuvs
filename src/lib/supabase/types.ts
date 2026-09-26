// AVOID UPDATING THIS FILE DIRECTLY. It is automatically generated.
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
      ai_agent_settings: {
        Row: {
          confidence_threshold_for_whatsapp: string | null
          created_at: string
          id: string
          max_web_search_attempts: number | null
          proactivity_level: number | null
          system_prompt: string | null
          updated_at: string
          whatsapp_trigger_expensive_product: boolean | null
          whatsapp_trigger_keywords: string[] | null
          whatsapp_trigger_low_confidence: boolean | null
          whatsapp_trigger_project_keywords: string[] | null
          whatsapp_trigger_purchase_keywords: string[] | null
        }
        Insert: {
          confidence_threshold_for_whatsapp?: string | null
          created_at?: string
          id?: string
          max_web_search_attempts?: number | null
          proactivity_level?: number | null
          system_prompt?: string | null
          updated_at?: string
          whatsapp_trigger_expensive_product?: boolean | null
          whatsapp_trigger_keywords?: string[] | null
          whatsapp_trigger_low_confidence?: boolean | null
          whatsapp_trigger_project_keywords?: string[] | null
          whatsapp_trigger_purchase_keywords?: string[] | null
        }
        Update: {
          confidence_threshold_for_whatsapp?: string | null
          created_at?: string
          id?: string
          max_web_search_attempts?: number | null
          proactivity_level?: number | null
          system_prompt?: string | null
          updated_at?: string
          whatsapp_trigger_expensive_product?: boolean | null
          whatsapp_trigger_keywords?: string[] | null
          whatsapp_trigger_low_confidence?: boolean | null
          whatsapp_trigger_project_keywords?: string[] | null
          whatsapp_trigger_purchase_keywords?: string[] | null
        }
        Relationships: []
      }
      ai_providers: {
        Row: {
          api_key_secret_name: string | null
          created_at: string
          custom_endpoint: string | null
          id: string
          is_active: boolean
          last_validated_at: string | null
          model_id: string | null
          priority: number | null
          priority_order: number | null
          provider_name: string
          provider_type: string | null
          updated_at: string
          validation_error: string | null
          validation_status: string | null
        }
        Insert: {
          api_key_secret_name?: string | null
          created_at?: string
          custom_endpoint?: string | null
          id?: string
          is_active?: boolean
          last_validated_at?: string | null
          model_id?: string | null
          priority?: number | null
          priority_order?: number | null
          provider_name: string
          provider_type?: string | null
          updated_at?: string
          validation_error?: string | null
          validation_status?: string | null
        }
        Update: {
          api_key_secret_name?: string | null
          created_at?: string
          custom_endpoint?: string | null
          id?: string
          is_active?: boolean
          last_validated_at?: string | null
          model_id?: string | null
          priority?: number | null
          priority_order?: number | null
          provider_name?: string
          provider_type?: string | null
          updated_at?: string
          validation_error?: string | null
          validation_status?: string | null
        }
        Relationships: []
      }
      ai_rate_limits: {
        Row: {
          created_at: string
          id: number
          identifier: string
        }
        Insert: {
          created_at: string
          id?: number
          identifier: string
        }
        Update: {
          created_at?: string
          id?: number
          identifier?: string
        }
        Relationships: []
      }
      ai_settings: {
        Row: {
          cache_expiration_days: number | null
          created_at: string
          custom_stop_words: string[] | null
          id: string
          ignore_stock_count: boolean | null
          intent_mapping: Json | null
          logistics_rules_prompt: string | null
          price_threshold_usd: number | null
          product_page_prompt: string | null
          result_component_config: Json | null
          search_algorithm_sql: string | null
          system_prompt_template: string | null
          technical_bridge: Json | null
          updated_at: string
        }
        Insert: {
          cache_expiration_days?: number | null
          created_at?: string
          custom_stop_words?: string[] | null
          id?: string
          ignore_stock_count?: boolean | null
          intent_mapping?: Json | null
          logistics_rules_prompt?: string | null
          price_threshold_usd?: number | null
          product_page_prompt?: string | null
          result_component_config?: Json | null
          search_algorithm_sql?: string | null
          system_prompt_template?: string | null
          technical_bridge?: Json | null
          updated_at?: string
        }
        Update: {
          cache_expiration_days?: number | null
          created_at?: string
          custom_stop_words?: string[] | null
          id?: string
          ignore_stock_count?: boolean | null
          intent_mapping?: Json | null
          logistics_rules_prompt?: string | null
          price_threshold_usd?: number | null
          product_page_prompt?: string | null
          result_component_config?: Json | null
          search_algorithm_sql?: string | null
          system_prompt_template?: string | null
          technical_bridge?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          id: string
          setting_key: string
          setting_value: string | null
          setting_value_numeric: number | null
          updated_at: string
          updated_by_user_id: string | null
        }
        Insert: {
          id?: string
          setting_key: string
          setting_value?: string | null
          setting_value_numeric?: number | null
          updated_at?: string
          updated_by_user_id?: string | null
        }
        Update: {
          id?: string
          setting_key?: string
          setting_value?: string | null
          setting_value_numeric?: number | null
          updated_at?: string
          updated_by_user_id?: string | null
        }
        Relationships: []
      }
      avpro_keywords: {
        Row: {
          added_by: string | null
          category: string | null
          is_blocking: boolean | null
          keyword: string
          updated_at: string
          weight: number | null
        }
        Insert: {
          added_by?: string | null
          category?: string | null
          is_blocking?: boolean | null
          keyword: string
          updated_at?: string
          weight?: number | null
        }
        Update: {
          added_by?: string | null
          category?: string | null
          is_blocking?: boolean | null
          keyword?: string
          updated_at?: string
          weight?: number | null
        }
        Relationships: []
      }
      cache_settings: {
        Row: {
          id: string
          mi_expiration_days: number | null
          product_cache_expiration_days: number | null
          product_search_cache_expiration_days: number | null
          updated_at: string
        }
        Insert: {
          id?: string
          mi_expiration_days?: number | null
          product_cache_expiration_days?: number | null
          product_search_cache_expiration_days?: number | null
          updated_at?: string
        }
        Update: {
          id?: string
          mi_expiration_days?: number | null
          product_cache_expiration_days?: number | null
          product_search_cache_expiration_days?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      cart_items: {
        Row: {
          added_at: string | null
          cart_id: string | null
          id: string
          product_id: string
          quantity: number
          user_id: string | null
        }
        Insert: {
          added_at?: string | null
          cart_id?: string | null
          id?: string
          product_id: string
          quantity: number
          user_id?: string | null
        }
        Update: {
          added_at?: string | null
          cart_id?: string | null
          id?: string
          product_id?: string
          quantity?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          message: string
          role: string
          session_id: string
          type: string | null
          user_id: string | null
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          message: string
          role: string
          session_id: string
          type?: string | null
          user_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          message?: string
          role?: string
          session_id?: string
          type?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      company_info: {
        Row: {
          content: string
          id: string
          type: string
          updated_at: string
        }
        Insert: {
          content: string
          id?: string
          type?: string
          updated_at?: string
        }
        Update: {
          content?: string
          id?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      conversation_history: {
        Row: {
          created_at: string | null
          id: string
          query: string
          response: string
          session_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id: string
          query: string
          response: string
          session_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          query?: string
          response?: string
          session_id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      coupon_usage: {
        Row: {
          coupon_id: string
          customer_id: string
          id: string
          order_id: string | null
          used_at: string | null
        }
        Insert: {
          coupon_id: string
          customer_id: string
          id: string
          order_id?: string | null
          used_at?: string | null
        }
        Update: {
          coupon_id?: string
          customer_id?: string
          id?: string
          order_id?: string | null
          used_at?: string | null
        }
        Relationships: []
      }
      customer_addresses: {
        Row: {
          address_type: string
          city: string
          complement: string | null
          country: string
          created_at: string
          customer_id: string
          id: string
          is_default: boolean
          latitude: number | null
          longitude: number | null
          neighborhood: string
          number: string
          state: string
          street: string
          updated_at: string
          zip_code: string
        }
        Insert: {
          address_type: string
          city: string
          complement?: string | null
          country: string
          created_at?: string
          customer_id: string
          id?: string
          is_default: boolean
          latitude?: number | null
          longitude?: number | null
          neighborhood: string
          number: string
          state: string
          street: string
          updated_at?: string
          zip_code: string
        }
        Update: {
          address_type?: string
          city?: string
          complement?: string | null
          country?: string
          created_at?: string
          customer_id?: string
          id?: string
          is_default?: boolean
          latitude?: number | null
          longitude?: number | null
          neighborhood?: string
          number?: string
          state?: string
          street?: string
          updated_at?: string
          zip_code?: string
        }
        Relationships: []
      }
      customer_favorites: {
        Row: {
          created_at: string | null
          customer_id: string
          id: string
          product_id: string
        }
        Insert: {
          created_at?: string | null
          customer_id: string
          id: string
          product_id: string
        }
        Update: {
          created_at?: string | null
          customer_id?: string
          id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_favorites_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_payment_methods: {
        Row: {
          card_brand: string | null
          card_expiry_month: number | null
          card_expiry_year: number | null
          card_last_four: string | null
          created_at: string | null
          customer_id: string
          id: string
          is_default: boolean | null
          stripe_payment_method_id: string | null
        }
        Insert: {
          card_brand?: string | null
          card_expiry_month?: number | null
          card_expiry_year?: number | null
          card_last_four?: string | null
          created_at?: string | null
          customer_id: string
          id: string
          is_default?: boolean | null
          stripe_payment_method_id?: string | null
        }
        Update: {
          card_brand?: string | null
          card_expiry_month?: number | null
          card_expiry_year?: number | null
          card_last_four?: string | null
          created_at?: string | null
          customer_id?: string
          id?: string
          is_default?: boolean | null
          stripe_payment_method_id?: string | null
        }
        Relationships: []
      }
      customers: {
        Row: {
          billing_address: Json | null
          bio: string | null
          company_name: string | null
          cpf: string | null
          created_at: string
          date_of_birth: string | null
          email: string | null
          full_name: string | null
          gender: string | null
          has_migrated: boolean | null
          id: string
          is_imported: boolean | null
          last_login: string | null
          phone: string | null
          profile_photo_url: string | null
          role: string | null
          shipping_address: Json | null
          status: string | null
          two_factor_enabled: boolean | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          billing_address?: Json | null
          bio?: string | null
          company_name?: string | null
          cpf?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          full_name?: string | null
          gender?: string | null
          has_migrated?: boolean | null
          id?: string
          is_imported?: boolean | null
          last_login?: string | null
          phone?: string | null
          profile_photo_url?: string | null
          role?: string | null
          shipping_address?: Json | null
          status?: string | null
          two_factor_enabled?: boolean | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          billing_address?: Json | null
          bio?: string | null
          company_name?: string | null
          cpf?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          full_name?: string | null
          gender?: string | null
          has_migrated?: boolean | null
          id?: string
          is_imported?: boolean | null
          last_login?: string | null
          phone?: string | null
          profile_photo_url?: string | null
          role?: string | null
          shipping_address?: Json | null
          status?: string | null
          two_factor_enabled?: boolean | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      customers_staging: {
        Row: {
          billing_address: Json | null
          bio: string | null
          company_name: string | null
          cpf: string | null
          created_at: string | null
          date_of_birth: string | null
          email: string | null
          full_name: string | null
          gender: string | null
          has_migrated: boolean | null
          id: string | null
          is_imported: boolean | null
          last_login: string | null
          phone: string | null
          profile_photo_url: string | null
          removal_reason: string | null
          role: string | null
          shipping_address: Json | null
          status: string | null
          two_factor_enabled: boolean | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          billing_address?: Json | null
          bio?: string | null
          company_name?: string | null
          cpf?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          email?: string | null
          full_name?: string | null
          gender?: string | null
          has_migrated?: boolean | null
          id?: string | null
          is_imported?: boolean | null
          last_login?: string | null
          phone?: string | null
          profile_photo_url?: string | null
          removal_reason?: string | null
          role?: string | null
          shipping_address?: Json | null
          status?: string | null
          two_factor_enabled?: boolean | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          billing_address?: Json | null
          bio?: string | null
          company_name?: string | null
          cpf?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          email?: string | null
          full_name?: string | null
          gender?: string | null
          has_migrated?: boolean | null
          id?: string | null
          is_imported?: boolean | null
          last_login?: string | null
          phone?: string | null
          profile_photo_url?: string | null
          removal_reason?: string | null
          role?: string | null
          shipping_address?: Json | null
          status?: string | null
          two_factor_enabled?: boolean | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      discount_coupons: {
        Row: {
          code: string | null
          created_at: string | null
          created_by_user_id: string
          discount_amount: number | null
          id: string
          is_used: boolean | null
          max_profit_margin: number | null
          order_id: string | null
          status: string | null
          used_at: string | null
          used_on_order_id: string | null
          valid_until: string
        }
        Insert: {
          code?: string | null
          created_at?: string | null
          created_by_user_id: string
          discount_amount?: number | null
          id: string
          is_used?: boolean | null
          max_profit_margin?: number | null
          order_id?: string | null
          status?: string | null
          used_at?: string | null
          used_on_order_id?: string | null
          valid_until: string
        }
        Update: {
          code?: string | null
          created_at?: string | null
          created_by_user_id?: string
          discount_amount?: number | null
          id?: string
          is_used?: boolean | null
          max_profit_margin?: number | null
          order_id?: string | null
          status?: string | null
          used_at?: string | null
          used_on_order_id?: string | null
          valid_until?: string
        }
        Relationships: []
      }
      discount_rule_categories: {
        Row: {
          category: string | null
          discount_rule_id: string
          id: string
        }
        Insert: {
          category?: string | null
          discount_rule_id: string
          id: string
        }
        Update: {
          category?: string | null
          discount_rule_id?: string
          id?: string
        }
        Relationships: []
      }
      discount_rule_customers: {
        Row: {
          created_at: string | null
          customer_id: string
          discount_rule_id: string
          id: string
        }
        Insert: {
          created_at?: string | null
          customer_id: string
          discount_rule_id: string
          id: string
        }
        Update: {
          created_at?: string | null
          customer_id?: string
          discount_rule_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "discount_rule_customers_discount_rule_id_fkey"
            columns: ["discount_rule_id"]
            isOneToOne: false
            referencedRelation: "discount_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      discount_rule_exclusions: {
        Row: {
          created_at: string | null
          discount_rule_id: string
          id: string
          is_active: boolean | null
          product_id: string
          reason: string | null
        }
        Insert: {
          created_at?: string | null
          discount_rule_id: string
          id: string
          is_active?: boolean | null
          product_id: string
          reason?: string | null
        }
        Update: {
          created_at?: string | null
          discount_rule_id?: string
          id?: string
          is_active?: boolean | null
          product_id?: string
          reason?: string | null
        }
        Relationships: []
      }
      discount_rule_manufacturers: {
        Row: {
          discount_rule_id: string
          id: string
          manufacturer_id: string
        }
        Insert: {
          discount_rule_id: string
          id: string
          manufacturer_id: string
        }
        Update: {
          discount_rule_id?: string
          id?: string
          manufacturer_id?: string
        }
        Relationships: []
      }
      discount_rule_products: {
        Row: {
          discount_rule_id: string
          id: string
          product_id: string
        }
        Insert: {
          discount_rule_id: string
          id: string
          product_id: string
        }
        Update: {
          discount_rule_id?: string
          id?: string
          product_id?: string
        }
        Relationships: []
      }
      discount_rules: {
        Row: {
          application_type: string | null
          created_at: string
          customers: string[] | null
          discount_calculation_type: string | null
          discount_value: number
          end_date: string | null
          id: string
          is_active: boolean
          role: string | null
          rule_name: string
          rule_type: string
          scope_data: Json | null
          scope_type: string | null
          start_date: string | null
          updated_at: string
        }
        Insert: {
          application_type?: string | null
          created_at?: string
          customers?: string[] | null
          discount_calculation_type?: string | null
          discount_value: number
          end_date?: string | null
          id?: string
          is_active?: boolean
          role?: string | null
          rule_name: string
          rule_type: string
          scope_data?: Json | null
          scope_type?: string | null
          start_date?: string | null
          updated_at?: string
        }
        Update: {
          application_type?: string | null
          created_at?: string
          customers?: string[] | null
          discount_calculation_type?: string | null
          discount_value?: number
          end_date?: string | null
          id?: string
          is_active?: boolean
          role?: string | null
          rule_name?: string
          rule_type?: string
          scope_data?: Json | null
          scope_type?: string | null
          start_date?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      discounts: {
        Row: {
          category_id: string | null
          category_ids: string[] | null
          created_at: string | null
          customer_application_type: string | null
          customer_role: string | null
          customers: string[] | null
          description: string | null
          discount_type: string
          discount_value: number | null
          end_date: string | null
          excluded_products: string[] | null
          id: string
          is_active: boolean | null
          manufacturer_id: string | null
          manufacturer_ids: string[] | null
          max_purchase: number | null
          min_purchase: number | null
          name: string
          product_selection: Json | null
          start_date: string | null
          target_type: string | null
          updated_at: string | null
        }
        Insert: {
          category_id?: string | null
          category_ids?: string[] | null
          created_at?: string | null
          customer_application_type?: string | null
          customer_role?: string | null
          customers?: string[] | null
          description?: string | null
          discount_type: string
          discount_value?: number | null
          end_date?: string | null
          excluded_products?: string[] | null
          id: string
          is_active?: boolean | null
          manufacturer_id?: string | null
          manufacturer_ids?: string[] | null
          max_purchase?: number | null
          min_purchase?: number | null
          name: string
          product_selection?: Json | null
          start_date?: string | null
          target_type?: string | null
          updated_at?: string | null
        }
        Update: {
          category_id?: string | null
          category_ids?: string[] | null
          created_at?: string | null
          customer_application_type?: string | null
          customer_role?: string | null
          customers?: string[] | null
          description?: string | null
          discount_type?: string
          discount_value?: number | null
          end_date?: string | null
          excluded_products?: string[] | null
          id?: string
          is_active?: boolean | null
          manufacturer_id?: string | null
          manufacturer_ids?: string[] | null
          max_purchase?: number | null
          min_purchase?: number | null
          name?: string
          product_selection?: Json | null
          start_date?: string | null
          target_type?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      exchange_rate: {
        Row: {
          created_at: string
          id: string
          last_updated: string
          spread_percentage: number
          spread_type: string | null
          updated_by: string | null
          usd_to_brl: number
        }
        Insert: {
          created_at?: string
          id?: string
          last_updated?: string
          spread_percentage?: number
          spread_type?: string | null
          updated_by?: string | null
          usd_to_brl: number
        }
        Update: {
          created_at?: string
          id?: string
          last_updated?: string
          spread_percentage?: number
          spread_type?: string | null
          updated_by?: string | null
          usd_to_brl?: number
        }
        Relationships: []
      }
      favorites: {
        Row: {
          created_at: string
          id: string
          product_id: string
          user_id: string
        }
        Insert: {
          created_at: string
          id?: string
          product_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      image_migration_failures: {
        Row: {
          attempt_count: number
          created_at: string
          error_message: string | null
          external_url: string
          id: string
          product_id: string | null
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          error_message?: string | null
          external_url: string
          id?: string
          product_id?: string | null
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          created_at?: string
          error_message?: string | null
          external_url?: string
          id?: string
          product_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "image_migration_failures_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      imp_sim_air_freight_config: {
        Row: {
          adicional_cubagem_container_kg: number
          adicional_pallet_kg: number
          created_at: string
          id: string
          peso_limite_tarifa_minima_kg: number
          screening_por_kg_usd: number
          tarifa_minima_usd: number
          tarifa_por_kg_usd: number
          taxa_aes_usd: number
          taxa_atf_usd: number
          taxa_e_container_usd: number
          taxa_e_pallet_usd: number
          taxa_hawb_usd: number
          taxa_whse_usd: number
          updated_at: string
        }
        Insert: {
          adicional_cubagem_container_kg?: number
          adicional_pallet_kg?: number
          created_at?: string
          id?: string
          peso_limite_tarifa_minima_kg?: number
          screening_por_kg_usd?: number
          tarifa_minima_usd?: number
          tarifa_por_kg_usd?: number
          taxa_aes_usd?: number
          taxa_atf_usd?: number
          taxa_e_container_usd?: number
          taxa_e_pallet_usd?: number
          taxa_hawb_usd?: number
          taxa_whse_usd?: number
          updated_at?: string
        }
        Update: {
          adicional_cubagem_container_kg?: number
          adicional_pallet_kg?: number
          created_at?: string
          id?: string
          peso_limite_tarifa_minima_kg?: number
          screening_por_kg_usd?: number
          tarifa_minima_usd?: number
          tarifa_por_kg_usd?: number
          taxa_aes_usd?: number
          taxa_atf_usd?: number
          taxa_e_container_usd?: number
          taxa_e_pallet_usd?: number
          taxa_hawb_usd?: number
          taxa_whse_usd?: number
          updated_at?: string
        }
        Relationships: []
      }
      imp_sim_attachments: {
        Row: {
          context_id: string
          context_type: string
          created_at: string
          description: string | null
          file_name: string
          file_path: string
          file_size: number
          id: string
          mime_type: string
          user_id: string | null
        }
        Insert: {
          context_id: string
          context_type: string
          created_at?: string
          description?: string | null
          file_name: string
          file_path: string
          file_size: number
          id?: string
          mime_type: string
          user_id?: string | null
        }
        Update: {
          context_id?: string
          context_type?: string
          created_at?: string
          description?: string | null
          file_name?: string
          file_path?: string
          file_size?: number
          id?: string
          mime_type?: string
          user_id?: string | null
        }
        Relationships: []
      }
      imp_sim_client_quote_items: {
        Row: {
          description: string | null
          direct_sale_price: number | null
          icms_credit_rate: number | null
          icms_credit_value: number | null
          id: string
          image_url: string | null
          markup_basis: string
          markup_pct: number
          ncm: string | null
          origin: string
          pricing_mode: string
          product_id: string | null
          quantity: number
          quote_id: string
          reference_opposite_mode: string | null
          sku: string | null
          sort_order: number
          tax_breakdown: Json | null
          total_cost_brl: number
          total_cost_usd: number | null
          total_delivered_priority_brl: number | null
          total_delivered_priority_usd: number | null
          total_final_brl: number
          total_final_usd: number | null
          total_freight_delivery_usd: number | null
          total_freight_origin_usd: number | null
          total_profit_brl: number
          total_reference_opposite_brl: number | null
          total_reference_opposite_usd: number | null
          total_sale_usd: number | null
          total_tax_usd: number | null
          total_taxes_brl: number
          unit_cost_brl: number
          unit_cost_usd: number | null
          unit_delivered_priority_brl: number | null
          unit_delivered_priority_usd: number | null
          unit_final_brl: number
          unit_final_usd: number | null
          unit_freight_delivery_usd: number | null
          unit_freight_origin_usd: number | null
          unit_markup_usd: number | null
          unit_profit_brl: number
          unit_reference_opposite_brl: number | null
          unit_reference_opposite_usd: number | null
          unit_sale_usd: number | null
          unit_tax_usd: number | null
          unit_taxes_brl: number
          website_url: string | null
          weight_kg: number | null
        }
        Insert: {
          description?: string | null
          direct_sale_price?: number | null
          icms_credit_rate?: number | null
          icms_credit_value?: number | null
          id?: string
          image_url?: string | null
          markup_basis?: string
          markup_pct?: number
          ncm?: string | null
          origin: string
          pricing_mode?: string
          product_id?: string | null
          quantity?: number
          quote_id: string
          reference_opposite_mode?: string | null
          sku?: string | null
          sort_order?: number
          tax_breakdown?: Json | null
          total_cost_brl?: number
          total_cost_usd?: number | null
          total_delivered_priority_brl?: number | null
          total_delivered_priority_usd?: number | null
          total_final_brl?: number
          total_final_usd?: number | null
          total_freight_delivery_usd?: number | null
          total_freight_origin_usd?: number | null
          total_profit_brl?: number
          total_reference_opposite_brl?: number | null
          total_reference_opposite_usd?: number | null
          total_sale_usd?: number | null
          total_tax_usd?: number | null
          total_taxes_brl?: number
          unit_cost_brl?: number
          unit_cost_usd?: number | null
          unit_delivered_priority_brl?: number | null
          unit_delivered_priority_usd?: number | null
          unit_final_brl?: number
          unit_final_usd?: number | null
          unit_freight_delivery_usd?: number | null
          unit_freight_origin_usd?: number | null
          unit_markup_usd?: number | null
          unit_profit_brl?: number
          unit_reference_opposite_brl?: number | null
          unit_reference_opposite_usd?: number | null
          unit_sale_usd?: number | null
          unit_tax_usd?: number | null
          unit_taxes_brl?: number
          website_url?: string | null
          weight_kg?: number | null
        }
        Update: {
          description?: string | null
          direct_sale_price?: number | null
          icms_credit_rate?: number | null
          icms_credit_value?: number | null
          id?: string
          image_url?: string | null
          markup_basis?: string
          markup_pct?: number
          ncm?: string | null
          origin?: string
          pricing_mode?: string
          product_id?: string | null
          quantity?: number
          quote_id?: string
          reference_opposite_mode?: string | null
          sku?: string | null
          sort_order?: number
          tax_breakdown?: Json | null
          total_cost_brl?: number
          total_cost_usd?: number | null
          total_delivered_priority_brl?: number | null
          total_delivered_priority_usd?: number | null
          total_final_brl?: number
          total_final_usd?: number | null
          total_freight_delivery_usd?: number | null
          total_freight_origin_usd?: number | null
          total_profit_brl?: number
          total_reference_opposite_brl?: number | null
          total_reference_opposite_usd?: number | null
          total_sale_usd?: number | null
          total_tax_usd?: number | null
          total_taxes_brl?: number
          unit_cost_brl?: number
          unit_cost_usd?: number | null
          unit_delivered_priority_brl?: number | null
          unit_delivered_priority_usd?: number | null
          unit_final_brl?: number
          unit_final_usd?: number | null
          unit_freight_delivery_usd?: number | null
          unit_freight_origin_usd?: number | null
          unit_markup_usd?: number | null
          unit_profit_brl?: number
          unit_reference_opposite_brl?: number | null
          unit_reference_opposite_usd?: number | null
          unit_sale_usd?: number | null
          unit_tax_usd?: number | null
          unit_taxes_brl?: number
          website_url?: string | null
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "imp_sim_client_quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "imp_sim_client_quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      imp_sim_client_quotes: {
        Row: {
          company_regime: string | null
          created_at: string
          currency: string
          customer_id: string | null
          customer_name: string
          default_markup: number | null
          delivery_address: string | null
          delivery_destination: string
          delivery_freight_allocation: string | null
          discount_brl: number | null
          discount_pct: number | null
          exchange_rate: number | null
          freight_doral_client_usd: number | null
          freight_origin_allocation: string | null
          freight_origin_doral_usd: number | null
          freight_subtotal_brl: number | null
          icms_venda_pct: number | null
          id: string
          is_locked: boolean
          issuer_company_id: string | null
          item_count: number
          priority_config: Json | null
          priority_exchange_rate: number | null
          proposal_currency: string
          public_token: string | null
          quote_type: string
          sales_tax_include_freight: boolean | null
          sales_tax_pct: number | null
          simples_aliquota_efetiva: number | null
          simulation_id: string | null
          total_cost_brl: number
          total_cost_usd: number | null
          total_final_brl: number
          total_final_usd: number | null
          total_freight_usd: number | null
          total_markup_usd: number | null
          total_profit_brl: number
          total_tax_usd: number | null
          total_taxes_brl: number
          user_id: string | null
          validity_days: number
        }
        Insert: {
          company_regime?: string | null
          created_at?: string
          currency?: string
          customer_id?: string | null
          customer_name: string
          default_markup?: number | null
          delivery_address?: string | null
          delivery_destination?: string
          delivery_freight_allocation?: string | null
          discount_brl?: number | null
          discount_pct?: number | null
          exchange_rate?: number | null
          freight_doral_client_usd?: number | null
          freight_origin_allocation?: string | null
          freight_origin_doral_usd?: number | null
          freight_subtotal_brl?: number | null
          icms_venda_pct?: number | null
          id?: string
          is_locked?: boolean
          issuer_company_id?: string | null
          item_count?: number
          priority_config?: Json | null
          priority_exchange_rate?: number | null
          proposal_currency?: string
          public_token?: string | null
          quote_type?: string
          sales_tax_include_freight?: boolean | null
          sales_tax_pct?: number | null
          simples_aliquota_efetiva?: number | null
          simulation_id?: string | null
          total_cost_brl?: number
          total_cost_usd?: number | null
          total_final_brl?: number
          total_final_usd?: number | null
          total_freight_usd?: number | null
          total_markup_usd?: number | null
          total_profit_brl?: number
          total_tax_usd?: number | null
          total_taxes_brl?: number
          user_id?: string | null
          validity_days?: number
        }
        Update: {
          company_regime?: string | null
          created_at?: string
          currency?: string
          customer_id?: string | null
          customer_name?: string
          default_markup?: number | null
          delivery_address?: string | null
          delivery_destination?: string
          delivery_freight_allocation?: string | null
          discount_brl?: number | null
          discount_pct?: number | null
          exchange_rate?: number | null
          freight_doral_client_usd?: number | null
          freight_origin_allocation?: string | null
          freight_origin_doral_usd?: number | null
          freight_subtotal_brl?: number | null
          icms_venda_pct?: number | null
          id?: string
          is_locked?: boolean
          issuer_company_id?: string | null
          item_count?: number
          priority_config?: Json | null
          priority_exchange_rate?: number | null
          proposal_currency?: string
          public_token?: string | null
          quote_type?: string
          sales_tax_include_freight?: boolean | null
          sales_tax_pct?: number | null
          simples_aliquota_efetiva?: number | null
          simulation_id?: string | null
          total_cost_brl?: number
          total_cost_usd?: number | null
          total_final_brl?: number
          total_final_usd?: number | null
          total_freight_usd?: number | null
          total_markup_usd?: number | null
          total_profit_brl?: number
          total_tax_usd?: number | null
          total_taxes_brl?: number
          user_id?: string | null
          validity_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "imp_sim_client_quotes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "imp_sim_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imp_sim_client_quotes_simulation_id_fkey"
            columns: ["simulation_id"]
            isOneToOne: false
            referencedRelation: "simulations"
            referencedColumns: ["id"]
          },
        ]
      }
      imp_sim_currency_rates: {
        Row: {
          currency: string
          id: string
          rate_to_usd: number
          source: string
          updated_at: string
        }
        Insert: {
          currency: string
          id?: string
          rate_to_usd?: number
          source?: string
          updated_at?: string
        }
        Update: {
          currency?: string
          id?: string
          rate_to_usd?: number
          source?: string
          updated_at?: string
        }
        Relationships: []
      }
      imp_sim_customer_credit_allocations: {
        Row: {
          allocation_date: string
          amount_allocated: number
          amount_allocated_brl: number
          created_at: string
          currency: string
          customer_id: string
          deposit_payment_id: string | null
          exchange_rate: number | null
          id: string
          installment_id: string | null
          notes: string | null
          order_id: string
        }
        Insert: {
          allocation_date?: string
          amount_allocated: number
          amount_allocated_brl?: number
          created_at?: string
          currency?: string
          customer_id: string
          deposit_payment_id?: string | null
          exchange_rate?: number | null
          id?: string
          installment_id?: string | null
          notes?: string | null
          order_id: string
        }
        Update: {
          allocation_date?: string
          amount_allocated?: number
          amount_allocated_brl?: number
          created_at?: string
          currency?: string
          customer_id?: string
          deposit_payment_id?: string | null
          exchange_rate?: number | null
          id?: string
          installment_id?: string | null
          notes?: string | null
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "imp_sim_customer_credit_allocations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "imp_sim_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imp_sim_customer_credit_allocations_deposit_payment_id_fkey"
            columns: ["deposit_payment_id"]
            isOneToOne: false
            referencedRelation: "imp_sim_sales_order_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imp_sim_customer_credit_allocations_installment_id_fkey"
            columns: ["installment_id"]
            isOneToOne: false
            referencedRelation: "imp_sim_sales_order_installments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imp_sim_customer_credit_allocations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "imp_sim_sales_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      imp_sim_customers: {
        Row: {
          company_name: string | null
          cpf: string | null
          created_at: string
          delivery_address: string | null
          email: string | null
          has_checking_account: boolean
          id: string
          name: string
          phone: string | null
          source_site_customer_id: string | null
          updated_at: string
        }
        Insert: {
          company_name?: string | null
          cpf?: string | null
          created_at?: string
          delivery_address?: string | null
          email?: string | null
          has_checking_account?: boolean
          id?: string
          name: string
          phone?: string | null
          source_site_customer_id?: string | null
          updated_at?: string
        }
        Update: {
          company_name?: string | null
          cpf?: string | null
          created_at?: string
          delivery_address?: string | null
          email?: string | null
          has_checking_account?: boolean
          id?: string
          name?: string
          phone?: string | null
          source_site_customer_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      imp_sim_manufacturers: {
        Row: {
          created_at: string
          id: string
          name: string
          source_site_manufacturer_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          source_site_manufacturer_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          source_site_manufacturer_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      imp_sim_priority_config: {
        Row: {
          created_at: string
          freight_per_kg_usd: number
          id: string
          markup_divisor: number
          spread_priority_pct: number
          weight_adjustment_kg: number
        }
        Insert: {
          created_at?: string
          freight_per_kg_usd?: number
          id?: string
          markup_divisor?: number
          spread_priority_pct?: number
          weight_adjustment_kg?: number
        }
        Update: {
          created_at?: string
          freight_per_kg_usd?: number
          id?: string
          markup_divisor?: number
          spread_priority_pct?: number
          weight_adjustment_kg?: number
        }
        Relationships: []
      }
      imp_sim_product_prices: {
        Row: {
          created_at: string
          currency: string
          fob_value: number
          id: string
          is_default: boolean
          product_id: string
          quote_date: string
          supplier_id: string
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          created_at?: string
          currency?: string
          fob_value?: number
          id?: string
          is_default?: boolean
          product_id: string
          quote_date?: string
          supplier_id: string
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          created_at?: string
          currency?: string
          fob_value?: number
          id?: string
          is_default?: boolean
          product_id?: string
          quote_date?: string
          supplier_id?: string
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "imp_sim_product_prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "imp_sim_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imp_sim_product_prices_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "imp_sim_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      imp_sim_products: {
        Row: {
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          manufacturer_id: string | null
          name: string
          ncm: string | null
          price_nationalized_cost: number | null
          price_nationalized_currency: string | null
          sku: string | null
          source_site_product_id: string | null
          updated_at: string
          value: number | null
          website_url: string | null
          weight: number | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          manufacturer_id?: string | null
          name: string
          ncm?: string | null
          price_nationalized_cost?: number | null
          price_nationalized_currency?: string | null
          sku?: string | null
          source_site_product_id?: string | null
          updated_at?: string
          value?: number | null
          website_url?: string | null
          weight?: number | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          manufacturer_id?: string | null
          name?: string
          ncm?: string | null
          price_nationalized_cost?: number | null
          price_nationalized_currency?: string | null
          sku?: string | null
          source_site_product_id?: string | null
          updated_at?: string
          value?: number | null
          website_url?: string | null
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "imp_sim_products_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "imp_sim_manufacturers"
            referencedColumns: ["id"]
          },
        ]
      }
      imp_sim_purchase_order_installments: {
        Row: {
          amount: number
          created_at: string
          due_date: string
          id: string
          installment_number: number
          notes: string | null
          order_id: string
          status: string
          total_installments: number
        }
        Insert: {
          amount?: number
          created_at?: string
          due_date: string
          id?: string
          installment_number: number
          notes?: string | null
          order_id: string
          status?: string
          total_installments: number
        }
        Update: {
          amount?: number
          created_at?: string
          due_date?: string
          id?: string
          installment_number?: number
          notes?: string | null
          order_id?: string
          status?: string
          total_installments?: number
        }
        Relationships: [
          {
            foreignKeyName: "imp_sim_purchase_order_installments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "imp_sim_purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      imp_sim_purchase_order_items: {
        Row: {
          created_at: string
          description: string
          id: string
          image_url: string | null
          ncm: string | null
          order_id: string
          product_id: string | null
          quantity: number
          sku: string | null
          sort_order: number
          total_cost: number
          unit_cost: number
          website_url: string | null
          weight_kg: number
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          image_url?: string | null
          ncm?: string | null
          order_id: string
          product_id?: string | null
          quantity?: number
          sku?: string | null
          sort_order?: number
          total_cost?: number
          unit_cost?: number
          website_url?: string | null
          weight_kg?: number
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          image_url?: string | null
          ncm?: string | null
          order_id?: string
          product_id?: string | null
          quantity?: number
          sku?: string | null
          sort_order?: number
          total_cost?: number
          unit_cost?: number
          website_url?: string | null
          weight_kg?: number
        }
        Relationships: [
          {
            foreignKeyName: "imp_sim_purchase_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "imp_sim_purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imp_sim_purchase_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "imp_sim_products"
            referencedColumns: ["id"]
          },
        ]
      }
      imp_sim_purchase_order_payments: {
        Row: {
          amount: number
          amount_brl: number | null
          created_at: string
          currency: string
          exchange_rate: number | null
          id: string
          installment_id: string | null
          notes: string | null
          order_id: string | null
          payment_account: string | null
          payment_date: string
          payment_method: string
          payment_reference: string | null
          payment_type: string
          supplier_id: string | null
          supplier_name: string | null
          user_id: string | null
        }
        Insert: {
          amount: number
          amount_brl?: number | null
          created_at?: string
          currency?: string
          exchange_rate?: number | null
          id?: string
          installment_id?: string | null
          notes?: string | null
          order_id?: string | null
          payment_account?: string | null
          payment_date?: string
          payment_method?: string
          payment_reference?: string | null
          payment_type?: string
          supplier_id?: string | null
          supplier_name?: string | null
          user_id?: string | null
        }
        Update: {
          amount?: number
          amount_brl?: number | null
          created_at?: string
          currency?: string
          exchange_rate?: number | null
          id?: string
          installment_id?: string | null
          notes?: string | null
          order_id?: string | null
          payment_account?: string | null
          payment_date?: string
          payment_method?: string
          payment_reference?: string | null
          payment_type?: string
          supplier_id?: string | null
          supplier_name?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "imp_sim_purchase_order_payments_installment_id_fkey"
            columns: ["installment_id"]
            isOneToOne: false
            referencedRelation: "imp_sim_purchase_order_installments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imp_sim_purchase_order_payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "imp_sim_purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imp_sim_purchase_order_payments_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "imp_sim_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      imp_sim_purchase_orders: {
        Row: {
          billing_currency: string | null
          billing_date: string | null
          billing_exchange_rate: number | null
          billing_total_brl: number | null
          created_at: string
          currency: string
          delivery_address: string | null
          delivery_location: string | null
          discount_amount: number
          exchange_rate: number
          expected_date: string | null
          freight_amount: number
          freight_terms: string | null
          id: string
          issuer_company_id: string
          item_count: number
          notes: string | null
          order_number: string
          order_seq: number
          order_year: number
          payment_terms_notes: string | null
          public_token: string | null
          source_supplier_quote_id: string | null
          status: string
          subtotal_products: number
          supplier_contact: string | null
          supplier_id: string | null
          supplier_name: string
          total_order: number
          total_order_brl: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          billing_currency?: string | null
          billing_date?: string | null
          billing_exchange_rate?: number | null
          billing_total_brl?: number | null
          created_at?: string
          currency?: string
          delivery_address?: string | null
          delivery_location?: string | null
          discount_amount?: number
          exchange_rate?: number
          expected_date?: string | null
          freight_amount?: number
          freight_terms?: string | null
          id?: string
          issuer_company_id?: string
          item_count?: number
          notes?: string | null
          order_number: string
          order_seq: number
          order_year: number
          payment_terms_notes?: string | null
          public_token?: string | null
          source_supplier_quote_id?: string | null
          status?: string
          subtotal_products?: number
          supplier_contact?: string | null
          supplier_id?: string | null
          supplier_name: string
          total_order?: number
          total_order_brl?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          billing_currency?: string | null
          billing_date?: string | null
          billing_exchange_rate?: number | null
          billing_total_brl?: number | null
          created_at?: string
          currency?: string
          delivery_address?: string | null
          delivery_location?: string | null
          discount_amount?: number
          exchange_rate?: number
          expected_date?: string | null
          freight_amount?: number
          freight_terms?: string | null
          id?: string
          issuer_company_id?: string
          item_count?: number
          notes?: string | null
          order_number?: string
          order_seq?: number
          order_year?: number
          payment_terms_notes?: string | null
          public_token?: string | null
          source_supplier_quote_id?: string | null
          status?: string
          subtotal_products?: number
          supplier_contact?: string | null
          supplier_id?: string | null
          supplier_name?: string
          total_order?: number
          total_order_brl?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "imp_sim_purchase_orders_source_supplier_quote_id_fkey"
            columns: ["source_supplier_quote_id"]
            isOneToOne: false
            referencedRelation: "imp_sim_supplier_quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imp_sim_purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "imp_sim_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      imp_sim_quote_items: {
        Row: {
          cif_usd: number | null
          cofins_rate: number | null
          cofins_val: number | null
          custom_val_brl: number | null
          description: string
          fob_usd: number | null
          gross_weight: number | null
          has_st: boolean | null
          icms_base: number | null
          icms_rate: number | null
          icms_val: number | null
          id: string
          ii_rate: number | null
          ii_val: number | null
          ipi_rate: number | null
          ipi_val: number | null
          mva_rate: number | null
          ncm: string | null
          net_weight: number | null
          pis_rate: number | null
          pis_val: number | null
          proportional_cost: number | null
          quantity: number | null
          quote_id: string
          sales_price: number | null
          siscomex_fee: number | null
          st_val: number | null
          storage_capatazia_share_brl: number | null
          total_item_cost: number | null
          unit: string | null
          unit_item_cost: number | null
        }
        Insert: {
          cif_usd?: number | null
          cofins_rate?: number | null
          cofins_val?: number | null
          custom_val_brl?: number | null
          description: string
          fob_usd?: number | null
          gross_weight?: number | null
          has_st?: boolean | null
          icms_base?: number | null
          icms_rate?: number | null
          icms_val?: number | null
          id?: string
          ii_rate?: number | null
          ii_val?: number | null
          ipi_rate?: number | null
          ipi_val?: number | null
          mva_rate?: number | null
          ncm?: string | null
          net_weight?: number | null
          pis_rate?: number | null
          pis_val?: number | null
          proportional_cost?: number | null
          quantity?: number | null
          quote_id: string
          sales_price?: number | null
          siscomex_fee?: number | null
          st_val?: number | null
          storage_capatazia_share_brl?: number | null
          total_item_cost?: number | null
          unit?: string | null
          unit_item_cost?: number | null
        }
        Update: {
          cif_usd?: number | null
          cofins_rate?: number | null
          cofins_val?: number | null
          custom_val_brl?: number | null
          description?: string
          fob_usd?: number | null
          gross_weight?: number | null
          has_st?: boolean | null
          icms_base?: number | null
          icms_rate?: number | null
          icms_val?: number | null
          id?: string
          ii_rate?: number | null
          ii_val?: number | null
          ipi_rate?: number | null
          ipi_val?: number | null
          mva_rate?: number | null
          ncm?: string | null
          net_weight?: number | null
          pis_rate?: number | null
          pis_val?: number | null
          proportional_cost?: number | null
          quantity?: number | null
          quote_id?: string
          sales_price?: number | null
          siscomex_fee?: number | null
          st_val?: number | null
          storage_capatazia_share_brl?: number | null
          total_item_cost?: number | null
          unit?: string | null
          unit_item_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "imp_sim_quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "imp_sim_quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      imp_sim_quotes: {
        Row: {
          additions_count: number | null
          capatazia_amount_brl: number | null
          created_at: string
          customer_id: string | null
          customer_name: string
          dispatcher_fee: number | null
          exchange_rate: number
          high_value_amount_brl: number | null
          icms_rate: number
          id: string
          is_high_value: boolean | null
          markup_rate: number
          origin_expenses: number | null
          priority_exchange_rate: number | null
          storage_amount_brl: number | null
          storage_period: number | null
          total_cost: number
          total_sales_value: number
          total_storage_capatazia_brl: number | null
          total_taxes: number
          user_id: string | null
        }
        Insert: {
          additions_count?: number | null
          capatazia_amount_brl?: number | null
          created_at?: string
          customer_id?: string | null
          customer_name: string
          dispatcher_fee?: number | null
          exchange_rate?: number
          high_value_amount_brl?: number | null
          icms_rate?: number
          id?: string
          is_high_value?: boolean | null
          markup_rate?: number
          origin_expenses?: number | null
          priority_exchange_rate?: number | null
          storage_amount_brl?: number | null
          storage_period?: number | null
          total_cost?: number
          total_sales_value?: number
          total_storage_capatazia_brl?: number | null
          total_taxes?: number
          user_id?: string | null
        }
        Update: {
          additions_count?: number | null
          capatazia_amount_brl?: number | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string
          dispatcher_fee?: number | null
          exchange_rate?: number
          high_value_amount_brl?: number | null
          icms_rate?: number
          id?: string
          is_high_value?: boolean | null
          markup_rate?: number
          origin_expenses?: number | null
          priority_exchange_rate?: number | null
          storage_amount_brl?: number | null
          storage_period?: number | null
          total_cost?: number
          total_sales_value?: number
          total_storage_capatazia_brl?: number | null
          total_taxes?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "imp_sim_quotes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "imp_sim_customers"
            referencedColumns: ["id"]
          },
        ]
      }
      imp_sim_sales_order_installments: {
        Row: {
          amount: number
          created_at: string
          due_date: string
          id: string
          installment_number: number
          notes: string | null
          order_id: string
          payment_method: string | null
          status: string
          total_installments: number
        }
        Insert: {
          amount?: number
          created_at?: string
          due_date: string
          id?: string
          installment_number: number
          notes?: string | null
          order_id: string
          payment_method?: string | null
          status?: string
          total_installments: number
        }
        Update: {
          amount?: number
          created_at?: string
          due_date?: string
          id?: string
          installment_number?: number
          notes?: string | null
          order_id?: string
          payment_method?: string | null
          status?: string
          total_installments?: number
        }
        Relationships: [
          {
            foreignKeyName: "imp_sim_sales_order_installments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "imp_sim_sales_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      imp_sim_sales_order_items: {
        Row: {
          created_at: string
          description: string
          id: string
          image_url: string | null
          ncm: string | null
          order_id: string
          product_id: string | null
          quantity: number
          sku: string | null
          sort_order: number
          total_price: number
          unit_price: number
          website_url: string | null
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          image_url?: string | null
          ncm?: string | null
          order_id: string
          product_id?: string | null
          quantity?: number
          sku?: string | null
          sort_order?: number
          total_price?: number
          unit_price?: number
          website_url?: string | null
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          image_url?: string | null
          ncm?: string | null
          order_id?: string
          product_id?: string | null
          quantity?: number
          sku?: string | null
          sort_order?: number
          total_price?: number
          unit_price?: number
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "imp_sim_sales_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "imp_sim_sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imp_sim_sales_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "imp_sim_products"
            referencedColumns: ["id"]
          },
        ]
      }
      imp_sim_sales_order_payments: {
        Row: {
          amount: number
          amount_brl: number
          created_at: string
          currency: string
          customer_id: string | null
          exchange_rate: number | null
          id: string
          installment_id: string | null
          notes: string | null
          order_id: string | null
          payment_account: string | null
          payment_date: string
          payment_method: string
          payment_reference: string | null
          payment_type: string
          user_id: string | null
        }
        Insert: {
          amount: number
          amount_brl?: number
          created_at?: string
          currency?: string
          customer_id?: string | null
          exchange_rate?: number | null
          id?: string
          installment_id?: string | null
          notes?: string | null
          order_id?: string | null
          payment_account?: string | null
          payment_date?: string
          payment_method?: string
          payment_reference?: string | null
          payment_type?: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          amount_brl?: number
          created_at?: string
          currency?: string
          customer_id?: string | null
          exchange_rate?: number | null
          id?: string
          installment_id?: string | null
          notes?: string | null
          order_id?: string | null
          payment_account?: string | null
          payment_date?: string
          payment_method?: string
          payment_reference?: string | null
          payment_type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "imp_sim_sales_order_payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "imp_sim_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imp_sim_sales_order_payments_installment_id_fkey"
            columns: ["installment_id"]
            isOneToOne: false
            referencedRelation: "imp_sim_sales_order_installments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imp_sim_sales_order_payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "imp_sim_sales_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      imp_sim_sales_orders: {
        Row: {
          balance_due: number
          balance_due_brl: number | null
          billing_date: string | null
          billing_exchange_rate: number | null
          created_at: string
          currency: string
          customer_cpf_cnpj: string | null
          customer_email: string | null
          customer_id: string | null
          customer_name: string
          customer_phone: string | null
          delivery_address: string | null
          destination: string
          discount_amount: number
          down_payment: number
          down_payment_brl: number | null
          down_payment_conversion_mode: string | null
          down_payment_currency: string | null
          down_payment_date: string | null
          down_payment_exchange_rate: number | null
          fiscal_doc_issued_at: string | null
          fiscal_doc_number: string | null
          fiscal_doc_seq: number | null
          fiscal_doc_type: string | null
          fiscal_doc_year: number | null
          freight_amount: number
          id: string
          installments_count: number
          issuer_company_id: string
          item_count: number
          order_number: string
          order_seq: number
          order_year: number
          payment_card_brand: string | null
          payment_method: string
          payment_terms_notes: string | null
          public_token: string | null
          source_quote_code: string | null
          source_quote_id: string | null
          source_quote_type: string | null
          status: string
          subtotal_products: number
          tax_amount: number
          total_order: number
          total_order_brl: number | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          balance_due?: number
          balance_due_brl?: number | null
          billing_date?: string | null
          billing_exchange_rate?: number | null
          created_at?: string
          currency?: string
          customer_cpf_cnpj?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_name: string
          customer_phone?: string | null
          delivery_address?: string | null
          destination?: string
          discount_amount?: number
          down_payment?: number
          down_payment_brl?: number | null
          down_payment_conversion_mode?: string | null
          down_payment_currency?: string | null
          down_payment_date?: string | null
          down_payment_exchange_rate?: number | null
          fiscal_doc_issued_at?: string | null
          fiscal_doc_number?: string | null
          fiscal_doc_seq?: number | null
          fiscal_doc_type?: string | null
          fiscal_doc_year?: number | null
          freight_amount?: number
          id?: string
          installments_count?: number
          issuer_company_id?: string
          item_count?: number
          order_number: string
          order_seq: number
          order_year: number
          payment_card_brand?: string | null
          payment_method?: string
          payment_terms_notes?: string | null
          public_token?: string | null
          source_quote_code?: string | null
          source_quote_id?: string | null
          source_quote_type?: string | null
          status?: string
          subtotal_products?: number
          tax_amount?: number
          total_order?: number
          total_order_brl?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          balance_due?: number
          balance_due_brl?: number | null
          billing_date?: string | null
          billing_exchange_rate?: number | null
          created_at?: string
          currency?: string
          customer_cpf_cnpj?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string
          customer_phone?: string | null
          delivery_address?: string | null
          destination?: string
          discount_amount?: number
          down_payment?: number
          down_payment_brl?: number | null
          down_payment_conversion_mode?: string | null
          down_payment_currency?: string | null
          down_payment_date?: string | null
          down_payment_exchange_rate?: number | null
          fiscal_doc_issued_at?: string | null
          fiscal_doc_number?: string | null
          fiscal_doc_seq?: number | null
          fiscal_doc_type?: string | null
          fiscal_doc_year?: number | null
          freight_amount?: number
          id?: string
          installments_count?: number
          issuer_company_id?: string
          item_count?: number
          order_number?: string
          order_seq?: number
          order_year?: number
          payment_card_brand?: string | null
          payment_method?: string
          payment_terms_notes?: string | null
          public_token?: string | null
          source_quote_code?: string | null
          source_quote_id?: string | null
          source_quote_type?: string | null
          status?: string
          subtotal_products?: number
          tax_amount?: number
          total_order?: number
          total_order_brl?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "imp_sim_sales_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "imp_sim_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imp_sim_sales_orders_source_quote_id_fkey"
            columns: ["source_quote_id"]
            isOneToOne: false
            referencedRelation: "imp_sim_client_quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      imp_sim_simulation_item_products: {
        Row: {
          created_at: string
          id: string
          item_id: string
          product_id: string | null
          product_name: string | null
          product_ncm: string | null
          product_sku: string | null
          simulation_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          product_id?: string | null
          product_name?: string | null
          product_ncm?: string | null
          product_sku?: string | null
          simulation_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          product_id?: string | null
          product_name?: string | null
          product_ncm?: string | null
          product_sku?: string | null
          simulation_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "imp_sim_simulation_item_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "imp_sim_products"
            referencedColumns: ["id"]
          },
        ]
      }
      imp_sim_siscomex_fees: {
        Row: {
          created_at: string
          fee_value_brl: number
          id: string
          legal_basis: string
          max_additions: number | null
          min_additions: number
          source: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          fee_value_brl: number
          id?: string
          legal_basis?: string
          max_additions?: number | null
          min_additions: number
          source?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          fee_value_brl?: number
          id?: string
          legal_basis?: string
          max_additions?: number | null
          min_additions?: number
          source?: string
          updated_at?: string
        }
        Relationships: []
      }
      imp_sim_storage_fees: {
        Row: {
          created_at: string
          fee_type: string
          id: string
          incremental_days: number | null
          max_days: number | null
          max_value_per_kg: number | null
          min_days: number | null
          min_value_per_kg: number | null
          minimum_charge: number | null
          percentage: number | null
          rate_per_kg: number | null
          updated_at: string
          weight_basis: string | null
        }
        Insert: {
          created_at?: string
          fee_type: string
          id?: string
          incremental_days?: number | null
          max_days?: number | null
          max_value_per_kg?: number | null
          min_days?: number | null
          min_value_per_kg?: number | null
          minimum_charge?: number | null
          percentage?: number | null
          rate_per_kg?: number | null
          updated_at?: string
          weight_basis?: string | null
        }
        Update: {
          created_at?: string
          fee_type?: string
          id?: string
          incremental_days?: number | null
          max_days?: number | null
          max_value_per_kg?: number | null
          min_days?: number | null
          min_value_per_kg?: number | null
          minimum_charge?: number | null
          percentage?: number | null
          rate_per_kg?: number | null
          updated_at?: string
          weight_basis?: string | null
        }
        Relationships: []
      }
      imp_sim_supplier_quote_items: {
        Row: {
          created_at: string
          id: string
          price: number
          product_id: string
          quote_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          price?: number
          product_id: string
          quote_id: string
        }
        Update: {
          created_at?: string
          id?: string
          price?: number
          product_id?: string
          quote_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "imp_sim_supplier_quote_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "imp_sim_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imp_sim_supplier_quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "imp_sim_supplier_quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      imp_sim_supplier_quotes: {
        Row: {
          created_at: string
          currency: string
          freight_included: boolean
          id: string
          notes: string | null
          origin_location: string | null
          quote_date: string
          supplier_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          freight_included?: boolean
          id?: string
          notes?: string | null
          origin_location?: string | null
          quote_date?: string
          supplier_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          freight_included?: boolean
          id?: string
          notes?: string | null
          origin_location?: string | null
          quote_date?: string
          supplier_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "imp_sim_supplier_quotes_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "imp_sim_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      imp_sim_suppliers: {
        Row: {
          contact_person: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      imp_sim_tax_rates: {
        Row: {
          cofins_rate: number | null
          created_at: string
          ex: string | null
          ex_data_fim: string | null
          ex_data_inicio: string | null
          ex_descricao: string | null
          ex_regime: string | null
          ex_resolucao: string | null
          has_ex_tarifario: boolean | null
          id: string
          ii_base: number
          ii_ex: number | null
          ii_rate: number | null
          ipi_base: number | null
          ipi_ex: number | null
          ipi_ex_codigo: string | null
          ipi_ex_data_fim: string | null
          ipi_ex_data_inicio: string | null
          ipi_ex_descricao: string | null
          ipi_ex_regime: string | null
          ipi_ex_resolucao: string | null
          ipi_rate: number | null
          last_updated_at: string
          legal_basis: Json | null
          ncm: string
          ncm_descricao: string | null
          pis_rate: number | null
          source: string | null
          updated_by_user_id: string | null
        }
        Insert: {
          cofins_rate?: number | null
          created_at?: string
          ex?: string | null
          ex_data_fim?: string | null
          ex_data_inicio?: string | null
          ex_descricao?: string | null
          ex_regime?: string | null
          ex_resolucao?: string | null
          has_ex_tarifario?: boolean | null
          id?: string
          ii_base?: number
          ii_ex?: number | null
          ii_rate?: number | null
          ipi_base?: number | null
          ipi_ex?: number | null
          ipi_ex_codigo?: string | null
          ipi_ex_data_fim?: string | null
          ipi_ex_data_inicio?: string | null
          ipi_ex_descricao?: string | null
          ipi_ex_regime?: string | null
          ipi_ex_resolucao?: string | null
          ipi_rate?: number | null
          last_updated_at?: string
          legal_basis?: Json | null
          ncm: string
          ncm_descricao?: string | null
          pis_rate?: number | null
          source?: string | null
          updated_by_user_id?: string | null
        }
        Update: {
          cofins_rate?: number | null
          created_at?: string
          ex?: string | null
          ex_data_fim?: string | null
          ex_data_inicio?: string | null
          ex_descricao?: string | null
          ex_regime?: string | null
          ex_resolucao?: string | null
          has_ex_tarifario?: boolean | null
          id?: string
          ii_base?: number
          ii_ex?: number | null
          ii_rate?: number | null
          ipi_base?: number | null
          ipi_ex?: number | null
          ipi_ex_codigo?: string | null
          ipi_ex_data_fim?: string | null
          ipi_ex_data_inicio?: string | null
          ipi_ex_descricao?: string | null
          ipi_ex_regime?: string | null
          ipi_ex_resolucao?: string | null
          ipi_rate?: number | null
          last_updated_at?: string
          legal_basis?: Json | null
          ncm?: string
          ncm_descricao?: string | null
          pis_rate?: number | null
          source?: string | null
          updated_by_user_id?: string | null
        }
        Relationships: []
      }
      manufacturers: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      market_intelligence: {
        Row: {
          ai_summary: string | null
          created_at: string
          event_name: string | null
          expires_at: string | null
          id: string
          manufacturer_id: string | null
          metadata: Json | null
          raw_content: string | null
          referenced_product_ids: string[] | null
          source_url: string | null
          status: string | null
          title: string
        }
        Insert: {
          ai_summary?: string | null
          created_at?: string
          event_name?: string | null
          expires_at?: string | null
          id?: string
          manufacturer_id?: string | null
          metadata?: Json | null
          raw_content?: string | null
          referenced_product_ids?: string[] | null
          source_url?: string | null
          status?: string | null
          title: string
        }
        Update: {
          ai_summary?: string | null
          created_at?: string
          event_name?: string | null
          expires_at?: string | null
          id?: string
          manufacturer_id?: string | null
          metadata?: Json | null
          raw_content?: string | null
          referenced_product_ids?: string[] | null
          source_url?: string | null
          status?: string | null
          title?: string
        }
        Relationships: []
      }
      nab_market: {
        Row: {
          content: string | null
          created_at: string
          id: string
          title: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          id?: string
          title: string
        }
        Update: {
          content?: string | null
          created_at?: string
          id?: string
          title?: string
        }
        Relationships: []
      }
      order_items: {
        Row: {
          id: string
          order_id: string
          product_id: string
          quantity: number
          total_price: number | null
          unit_price: number | null
        }
        Insert: {
          id?: string
          order_id: string
          product_id: string
          quantity: number
          total_price?: number | null
          unit_price?: number | null
        }
        Update: {
          id?: string
          order_id?: string
          product_id?: string
          quantity?: number
          total_price?: number | null
          unit_price?: number | null
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
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      order_refunds: {
        Row: {
          amount: number
          bank_account_number: string
          bank_holder_name: string
          bank_name: string
          bank_routing_number: string
          created_at: string
          id: string
          order_id: string
          reason: string
        }
        Insert: {
          amount: number
          bank_account_number: string
          bank_holder_name: string
          bank_name: string
          bank_routing_number: string
          created_at: string
          id: string
          order_id: string
          reason: string
        }
        Update: {
          amount?: number
          bank_account_number?: string
          bank_holder_name?: string
          bank_name?: string
          bank_routing_number?: string
          created_at?: string
          id?: string
          order_id?: string
          reason?: string
        }
        Relationships: []
      }
      order_returns: {
        Row: {
          completed_at: string | null
          id: string
          order_id: string
          order_item_id: string
          reason: string | null
          requested_at: string | null
          status: string | null
        }
        Insert: {
          completed_at?: string | null
          id: string
          order_id: string
          order_item_id: string
          reason?: string | null
          requested_at?: string | null
          status?: string | null
        }
        Update: {
          completed_at?: string | null
          id?: string
          order_id?: string
          order_item_id?: string
          reason?: string | null
          requested_at?: string | null
          status?: string | null
        }
        Relationships: []
      }
      order_status_history: {
        Row: {
          changed_at: string | null
          changed_by: string | null
          id: string
          new_status: string | null
          old_status: string | null
          order_id: string
        }
        Insert: {
          changed_at?: string | null
          changed_by?: string | null
          id: string
          new_status?: string | null
          old_status?: string | null
          order_id: string
        }
        Update: {
          changed_at?: string | null
          changed_by?: string | null
          id?: string
          new_status?: string | null
          old_status?: string | null
          order_id?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          billing_address_id: string | null
          created_at: string | null
          customer_id: string
          discount_amount: number | null
          estimated_delivery_date: string | null
          id: string
          notes: string | null
          order_number: string | null
          payment_data: Json | null
          payment_method_id: string | null
          payment_method_type: string | null
          shipping_address_id: string | null
          shipping_cost: number | null
          shipping_method: string | null
          status: string | null
          subtotal: number | null
          tax_amount: number | null
          total: number | null
          tracking_number: string | null
          updated_at: string | null
        }
        Insert: {
          billing_address_id?: string | null
          created_at?: string | null
          customer_id: string
          discount_amount?: number | null
          estimated_delivery_date?: string | null
          id?: string
          notes?: string | null
          order_number?: string | null
          payment_data?: Json | null
          payment_method_id?: string | null
          payment_method_type?: string | null
          shipping_address_id?: string | null
          shipping_cost?: number | null
          shipping_method?: string | null
          status?: string | null
          subtotal?: number | null
          tax_amount?: number | null
          total?: number | null
          tracking_number?: string | null
          updated_at?: string | null
        }
        Update: {
          billing_address_id?: string | null
          created_at?: string | null
          customer_id?: string
          discount_amount?: number | null
          estimated_delivery_date?: string | null
          id?: string
          notes?: string | null
          order_number?: string | null
          payment_data?: Json | null
          payment_method_id?: string | null
          payment_method_type?: string | null
          shipping_address_id?: string | null
          shipping_cost?: number | null
          shipping_method?: string | null
          status?: string | null
          subtotal?: number | null
          tax_amount?: number | null
          total?: number | null
          tracking_number?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_billing_address_id_fkey"
            columns: ["billing_address_id"]
            isOneToOne: false
            referencedRelation: "customer_addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_shipping_address_id_fkey"
            columns: ["shipping_address_id"]
            isOneToOne: false
            referencedRelation: "customer_addresses"
            referencedColumns: ["id"]
          },
        ]
      }
      page_visits: {
        Row: {
          device_type: string | null
          id: string
          page_path: string | null
          timestamp: string | null
          user_id: string | null
        }
        Insert: {
          device_type?: string | null
          id: string
          page_path?: string | null
          timestamp?: string | null
          user_id?: string | null
        }
        Update: {
          device_type?: string | null
          id?: string
          page_path?: string | null
          timestamp?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      payment_tokens: {
        Row: {
          created_at: string | null
          id: string
          is_used: boolean | null
          order_id: string
          token: string
          used_at: string | null
          user_id: string
          valid_until: string
        }
        Insert: {
          created_at?: string | null
          id: string
          is_used?: boolean | null
          order_id: string
          token: string
          used_at?: string | null
          user_id: string
          valid_until: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_used?: boolean | null
          order_id?: string
          token?: string
          used_at?: string | null
          user_id?: string
          valid_until?: string
        }
        Relationships: []
      }
      price_settings: {
        Row: {
          exchange_rate: number
          exchange_spread: number
          freight_per_kg_usd: number
          id: string
          markup: number
          updated_at: string
          updated_by: string | null
          weight_margin: number
        }
        Insert: {
          exchange_rate?: number
          exchange_spread?: number
          freight_per_kg_usd?: number
          id?: string
          markup?: number
          updated_at?: string
          updated_by?: string | null
          weight_margin?: number
        }
        Update: {
          exchange_rate?: number
          exchange_spread?: number
          freight_per_kg_usd?: number
          id?: string
          markup?: number
          updated_at?: string
          updated_by?: string | null
          weight_margin?: number
        }
        Relationships: []
      }
      pricing_settings: {
        Row: {
          exchange_rate: number | null
          id: string
          spread_type: string
          spread_value: number
          updated_at: string
        }
        Insert: {
          exchange_rate?: number | null
          id?: string
          spread_type?: string
          spread_value?: number
          updated_at?: string
        }
        Update: {
          exchange_rate?: number | null
          id?: string
          spread_type?: string
          spread_value?: number
          updated_at?: string
        }
        Relationships: []
      }
      product_cache: {
        Row: {
          cached_at: string | null
          confidence: number | null
          created_at: string | null
          expires_at: string | null
          id: string
          metadata: Json | null
          product_id: string
          source: string | null
          spec_key: string | null
          spec_value: string
          updated_at: string | null
        }
        Insert: {
          cached_at?: string | null
          confidence?: number | null
          created_at?: string | null
          expires_at?: string | null
          id: string
          metadata?: Json | null
          product_id: string
          source?: string | null
          spec_key?: string | null
          spec_value: string
          updated_at?: string | null
        }
        Update: {
          cached_at?: string | null
          confidence?: number | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          metadata?: Json | null
          product_id?: string
          source?: string | null
          spec_key?: string | null
          spec_value?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      product_search_cache: {
        Row: {
          created_at: string
          created_by_admin: boolean
          expires_at: string | null
          id: string
          product_currency: string | null
          product_description: string | null
          product_image_url: string | null
          product_name: string | null
          product_price: number | null
          product_specs: Json | null
          search_query: string
          source: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by_admin?: boolean
          expires_at?: string | null
          id?: string
          product_currency?: string | null
          product_description?: string | null
          product_image_url?: string | null
          product_name?: string | null
          product_price?: number | null
          product_specs?: Json | null
          search_query: string
          source?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by_admin?: boolean
          expires_at?: string | null
          id?: string
          product_currency?: string | null
          product_description?: string | null
          product_image_url?: string | null
          product_name?: string | null
          product_price?: number | null
          product_specs?: Json | null
          search_query?: string
          source?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          ai_related_ids: string[] | null
          category: string | null
          category_id: string | null
          created_at: string
          date_rebate: string | null
          description: string | null
          dimensions: string | null
          fts_vector: unknown
          id: string
          image_url: string | null
          is_discontinued: boolean
          is_special: boolean
          manual_related_ids: string[] | null
          manufacturer_id: string | null
          name: string
          ncm: string | null
          price_brl: number | null
          price_cost: number | null
          price_cost_rebate: number | null
          price_nationalized_cost: number | null
          price_nationalized_currency: string
          price_nationalized_sales: number | null
          price_usa_rebate: number | null
          price_usd: number | null
          rejected_related_ids: string[] | null
          search_text: string | null
          search_vector: unknown
          sku: string | null
          stock: number | null
          technical_info: string | null
          website_url: string | null
          weight: number | null
        }
        Insert: {
          ai_related_ids?: string[] | null
          category?: string | null
          category_id?: string | null
          created_at?: string
          date_rebate?: string | null
          description?: string | null
          dimensions?: string | null
          fts_vector?: unknown
          id?: string
          image_url?: string | null
          is_discontinued: boolean
          is_special: boolean
          manual_related_ids?: string[] | null
          manufacturer_id?: string | null
          name: string
          ncm?: string | null
          price_brl?: number | null
          price_cost?: number | null
          price_cost_rebate?: number | null
          price_nationalized_cost?: number | null
          price_nationalized_currency: string
          price_nationalized_sales?: number | null
          price_usa_rebate?: number | null
          price_usd?: number | null
          rejected_related_ids?: string[] | null
          search_text?: string | null
          search_vector?: unknown
          sku?: string | null
          stock?: number | null
          technical_info?: string | null
          website_url?: string | null
          weight?: number | null
        }
        Update: {
          ai_related_ids?: string[] | null
          category?: string | null
          category_id?: string | null
          created_at?: string
          date_rebate?: string | null
          description?: string | null
          dimensions?: string | null
          fts_vector?: unknown
          id?: string
          image_url?: string | null
          is_discontinued?: boolean
          is_special?: boolean
          manual_related_ids?: string[] | null
          manufacturer_id?: string | null
          name?: string
          ncm?: string | null
          price_brl?: number | null
          price_cost?: number | null
          price_cost_rebate?: number | null
          price_nationalized_cost?: number | null
          price_nationalized_currency?: string
          price_nationalized_sales?: number | null
          price_usa_rebate?: number | null
          price_usd?: number | null
          rejected_related_ids?: string[] | null
          search_text?: string | null
          search_vector?: unknown
          sku?: string | null
          stock?: number | null
          technical_info?: string | null
          website_url?: string | null
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_products_manufacturer"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "manufacturers"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          bucket: string
          created_at: string
          endpoint: string
          ip: string
          request_count: number
        }
        Insert: {
          bucket: string
          created_at: string
          endpoint: string
          ip: string
          request_count: number
        }
        Update: {
          bucket?: string
          created_at?: string
          endpoint?: string
          ip?: string
          request_count?: number
        }
        Relationships: []
      }
      sales_metrics: {
        Row: {
          conversion_rate: number | null
          created_at: string
          date: string
          id: string
          total_orders: number
          total_revenue: number
        }
        Insert: {
          conversion_rate?: number | null
          created_at?: string
          date: string
          id?: string
          total_orders?: number
          total_revenue?: number
        }
        Update: {
          conversion_rate?: number | null
          created_at?: string
          date?: string
          id?: string
          total_orders?: number
          total_revenue?: number
        }
        Relationships: []
      }
      settings: {
        Row: {
          created_at: string
          description: string | null
          id: string
          key: string
          updated_at: string
          value: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          key: string
          updated_at?: string
          value?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          key?: string
          updated_at?: string
          value?: string | null
        }
        Relationships: []
      }
      shipping_configs: {
        Row: {
          created_at: string
          exchange_rate: number
          fixed_import_fee: number
          id: string
          spread_percentage: number
          updated_at: string
          weight_factor: number
        }
        Insert: {
          created_at?: string
          exchange_rate?: number
          fixed_import_fee?: number
          id?: string
          spread_percentage?: number
          updated_at?: string
          weight_factor?: number
        }
        Update: {
          created_at?: string
          exchange_rate?: number
          fixed_import_fee?: number
          id?: string
          spread_percentage?: number
          updated_at?: string
          weight_factor?: number
        }
        Relationships: []
      }
      shopping_carts: {
        Row: {
          created_at: string | null
          customer_id: string
          id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          customer_id: string
          id?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          customer_id?: string
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      simulations: {
        Row: {
          budget_items: Json
          created_at: string
          description: string | null
          id: string
          is_locked: boolean | null
          is_preset: boolean | null
          items: Json
          name: string
          parameters: Json
          priority_items: Json
          updated_at: string
          user_id: string | null
        }
        Insert: {
          budget_items?: Json
          created_at?: string
          description?: string | null
          id?: string
          is_locked?: boolean | null
          is_preset?: boolean | null
          items?: Json
          name: string
          parameters?: Json
          priority_items?: Json
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          budget_items?: Json
          created_at?: string
          description?: string | null
          id?: string
          is_locked?: boolean | null
          is_preset?: boolean | null
          items?: Json
          name?: string
          parameters?: Json
          priority_items?: Json
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      user_sessions: {
        Row: {
          created_at: string
          id: string
          ip_address: string | null
          login_timestamp: string
          logout_timestamp: string | null
          page_viewed: string | null
          session_id: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          ip_address?: string | null
          login_timestamp?: string
          logout_timestamp?: string | null
          page_viewed?: string | null
          session_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          ip_address?: string | null
          login_timestamp?: string
          logout_timestamp?: string | null
          page_viewed?: string | null
          session_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      imp_sim_tax_rates_effective: {
        Row: {
          cofins_rate: number | null
          created_at: string | null
          ex: string | null
          ex_data_fim: string | null
          ex_data_inicio: string | null
          ex_descricao: string | null
          ex_regime: string | null
          ex_resolucao: string | null
          has_ex_tarifario: boolean | null
          id: string | null
          ii_base: number | null
          ii_efetivo: number | null
          ii_ex: number | null
          ii_rate: number | null
          ipi_rate: number | null
          last_updated_at: string | null
          legal_basis: Json | null
          ncm: string | null
          pis_rate: number | null
          source: string | null
          updated_by_user_id: string | null
        }
        Insert: {
          cofins_rate?: number | null
          created_at?: string | null
          ex?: string | null
          ex_data_fim?: string | null
          ex_data_inicio?: string | null
          ex_descricao?: string | null
          ex_regime?: string | null
          ex_resolucao?: string | null
          has_ex_tarifario?: boolean | null
          id?: string | null
          ii_base?: number | null
          ii_efetivo?: never
          ii_ex?: number | null
          ii_rate?: number | null
          ipi_rate?: number | null
          last_updated_at?: string | null
          legal_basis?: Json | null
          ncm?: string | null
          pis_rate?: number | null
          source?: string | null
          updated_by_user_id?: string | null
        }
        Update: {
          cofins_rate?: number | null
          created_at?: string | null
          ex?: string | null
          ex_data_fim?: string | null
          ex_data_inicio?: string | null
          ex_descricao?: string | null
          ex_regime?: string | null
          ex_resolucao?: string | null
          has_ex_tarifario?: boolean | null
          id?: string | null
          ii_base?: number | null
          ii_efetivo?: never
          ii_ex?: number | null
          ii_rate?: number | null
          ipi_rate?: number | null
          last_updated_at?: string | null
          legal_basis?: Json | null
          ncm?: string | null
          pis_rate?: number | null
          source?: string | null
          updated_by_user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      batch_recalculate_price_brl: {
        Args: {
          p_all?: boolean
          p_category_ids?: string[]
          p_manufacturer_ids?: string[]
          p_product_ids?: string[]
        }
        Returns: number
      }
      check_is_admin: { Args: never; Returns: boolean }
      check_legacy_user: {
        Args: { email_input: string }
        Returns: {
          billing_address: Json
          cpf: string
          created_at: string
          email: string
          found: boolean
          full_name: string
          has_migrated: boolean
          id: string
          is_imported: boolean
          phone: string
          role: string
          status: string
          updated_at: string
          user_id: string
        }[]
      }
      check_spam_email: {
        Args: { p_email: string }
        Returns: {
          is_borderline: boolean
          is_spam: boolean
          reason: string
        }[]
      }
      check_spam_name: {
        Args: { p_name: string }
        Returns: {
          is_spam: boolean
          reason: string
        }[]
      }
      cleanup_spam_customers: { Args: never; Returns: Json }
      execute_ai_search_v3: { Args: { search_term: string }; Returns: Json }
      generate_next_purchase_order_number: {
        Args: { p_year?: number }
        Returns: {
          next_order_number: string
          next_seq: number
          next_year: number
        }[]
      }
      generate_next_sales_order_fiscal_number: {
        Args: { p_type: string; p_year?: number }
        Returns: {
          next_doc_number: string
          next_seq: number
          next_year: number
        }[]
      }
      generate_next_sales_order_number: {
        Args: { p_year?: number }
        Returns: {
          next_order_number: string
          next_seq: number
          next_year: number
        }[]
      }
      get_current_customer_id: { Args: never; Returns: string }
      get_current_user_admin_info: {
        Args: never
        Returns: {
          email: string
          full_name: string
          is_admin: boolean
          role: string
        }[]
      }
      get_public_purchase_order_by_token: {
        Args: { p_token: string }
        Returns: Json
      }
      get_public_quote_by_token: { Args: { p_token: string }; Returns: Json }
      get_public_sales_order_by_token: {
        Args: { p_token: string }
        Returns: Json
      }
      is_admin: { Args: never; Returns: boolean }
      search_market_intelligence: {
        Args: { keywords: string[] }
        Returns: Json
      }
      search_products_v2: {
        Args: { boost_multiplier?: number; search_term: string }
        Returns: {
          ai_related_ids: string[] | null
          category: string | null
          category_id: string | null
          created_at: string
          date_rebate: string | null
          description: string | null
          dimensions: string | null
          fts_vector: unknown
          id: string
          image_url: string | null
          is_discontinued: boolean
          is_special: boolean
          manual_related_ids: string[] | null
          manufacturer_id: string | null
          name: string
          ncm: string | null
          price_brl: number | null
          price_cost: number | null
          price_cost_rebate: number | null
          price_nationalized_cost: number | null
          price_nationalized_currency: string
          price_nationalized_sales: number | null
          price_usa_rebate: number | null
          price_usd: number | null
          rejected_related_ids: string[] | null
          search_text: string | null
          search_vector: unknown
          sku: string | null
          stock: number | null
          technical_info: string | null
          website_url: string | null
          weight: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "products"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      sync_current_user_profile: { Args: never; Returns: string }
      trigger_exchange_rate_update: { Args: never; Returns: undefined }
      trigger_migrate_product_images: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: number
      }
      trigger_retry_image_migration: { Args: never; Returns: undefined }
      update_tax_rates_from_payload: {
        Args: { p_chapters: string[]; p_records: Json }
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
    Enums: {},
  },
} as const


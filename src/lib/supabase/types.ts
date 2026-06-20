// AVOID UPDATING THIS FILE DIRECTLY. It is automatically generated.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.5'
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
          whatsapp_trigger_project_keywords: boolean[] | null
          whatsapp_trigger_purchase_keywords: boolean[] | null
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
          whatsapp_trigger_project_keywords?: boolean[] | null
          whatsapp_trigger_purchase_keywords?: boolean[] | null
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
          whatsapp_trigger_project_keywords?: boolean[] | null
          whatsapp_trigger_purchase_keywords?: boolean[] | null
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
          id: string
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
            foreignKeyName: 'cart_items_product_id_fkey'
            columns: ['product_id']
            isOneToOne: false
            referencedRelation: 'products'
            referencedColumns: ['id']
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
          user_id: string | null
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          message: string
          role: string
          session_id: string
          user_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          message?: string
          role?: string
          session_id?: string
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
          created_at: string
          customer_id: string
          id: string
          is_default: boolean
          latitude?: number | null
          longitude?: number | null
          neighborhood: string
          number: string
          state: string
          street: string
          updated_at: string
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
        Relationships: []
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
        Relationships: []
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
          id: string
          product_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          user_id?: string
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
          source_url: string | null
          status: string | null
          title: string
        }
        Insert: {
          ai_summary?: string | null
          created_at: string
          event_name?: string | null
          expires_at?: string | null
          id: string
          manufacturer_id?: string | null
          metadata?: Json | null
          raw_content?: string | null
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
          id: string
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
        Relationships: []
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
          id: string
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
        Relationships: []
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
          weight: number | null
        }
        Insert: {
          ai_related_ids?: string[] | null
          category?: string | null
          category_id?: string | null
          created_at: string
          date_rebate?: string | null
          description?: string | null
          dimensions?: string | null
          fts_vector?: unknown
          id: string
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
          weight?: number | null
        }
        Relationships: []
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
      [_ in never]: never
    }
    Functions: {
      get_current_customer_id: { Args: never; Returns: string }
      is_admin: { Args: never; Returns: boolean }
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
          weight: number | null
        }[]
        SetofOptions: {
          from: '*'
          to: 'products'
          isOneToOne: false
          isSetofReturn: true
        }
      }
      sync_current_user_profile: { Args: never; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

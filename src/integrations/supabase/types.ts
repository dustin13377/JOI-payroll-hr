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
      _legacy_time_off_requests: {
        Row: {
          created_at: string | null
          employee_id: string
          end_date: string
          id: string
          notes: string | null
          reason: string
          reviewed_at: string | null
          reviewed_by: string | null
          start_date: string
          status: string
        }
        Insert: {
          created_at?: string | null
          employee_id: string
          end_date: string
          id?: string
          notes?: string | null
          reason: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date: string
          status?: string
        }
        Update: {
          created_at?: string | null
          employee_id?: string
          end_date?: string
          id?: string
          notes?: string | null
          reason?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_off_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_off_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_client_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_off_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_no_pay"
            referencedColumns: ["id"]
          },
        ]
      }
      actas_administrativas: {
        Row: {
          company_legal_address_snapshot: string | null
          company_legal_name_snapshot: string | null
          created_at: string
          created_by: string
          doc_ref: string | null
          employee_id: string
          horario_snapshot: string | null
          id: string
          incident_date: string
          incident_date_long_snapshot: string | null
          narrative: string | null
          pdf_path: string | null
          puesto_snapshot: string | null
          reincidencia_prior_carta_id: string | null
          request_id: string | null
          signed_at: string | null
          signed_scan_path: string | null
          supervisor_name_snapshot: string | null
          trabajador_name_snapshot: string | null
          updated_at: string
          witnesses: Json
        }
        Insert: {
          company_legal_address_snapshot?: string | null
          company_legal_name_snapshot?: string | null
          created_at?: string
          created_by: string
          doc_ref?: string | null
          employee_id: string
          horario_snapshot?: string | null
          id?: string
          incident_date: string
          incident_date_long_snapshot?: string | null
          narrative?: string | null
          pdf_path?: string | null
          puesto_snapshot?: string | null
          reincidencia_prior_carta_id?: string | null
          request_id?: string | null
          signed_at?: string | null
          signed_scan_path?: string | null
          supervisor_name_snapshot?: string | null
          trabajador_name_snapshot?: string | null
          updated_at?: string
          witnesses?: Json
        }
        Update: {
          company_legal_address_snapshot?: string | null
          company_legal_name_snapshot?: string | null
          created_at?: string
          created_by?: string
          doc_ref?: string | null
          employee_id?: string
          horario_snapshot?: string | null
          id?: string
          incident_date?: string
          incident_date_long_snapshot?: string | null
          narrative?: string | null
          pdf_path?: string | null
          puesto_snapshot?: string | null
          reincidencia_prior_carta_id?: string | null
          request_id?: string | null
          signed_at?: string | null
          signed_scan_path?: string | null
          supervisor_name_snapshot?: string | null
          trabajador_name_snapshot?: string | null
          updated_at?: string
          witnesses?: Json
        }
        Relationships: [
          {
            foreignKeyName: "actas_administrativas_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actas_administrativas_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees_client_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actas_administrativas_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees_no_pay"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actas_administrativas_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actas_administrativas_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_client_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actas_administrativas_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_no_pay"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actas_administrativas_reincidencia_prior_carta_id_fkey"
            columns: ["reincidencia_prior_carta_id"]
            isOneToOne: false
            referencedRelation: "cartas_compromiso"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_actas_request_id"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "hr_document_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_coaching_notes: {
        Row: {
          agent_id: string
          author_id: string
          campaign_id: string
          created_at: string
          entry_type: string
          id: string
          note: string
          updated_at: string
          visible_to_agent: boolean
        }
        Insert: {
          agent_id: string
          author_id: string
          campaign_id: string
          created_at?: string
          entry_type?: string
          id?: string
          note: string
          updated_at?: string
          visible_to_agent?: boolean
        }
        Update: {
          agent_id?: string
          author_id?: string
          campaign_id?: string
          created_at?: string
          entry_type?: string
          id?: string
          note?: string
          updated_at?: string
          visible_to_agent?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "agent_coaching_notes_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_coaching_notes_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "employees_client_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_coaching_notes_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "employees_no_pay"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_coaching_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_coaching_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "employees_client_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_coaching_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "employees_no_pay"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_coaching_notes_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_review_notifications_sent: {
        Row: {
          id: string
          notification_type: Database["public"]["Enums"]["review_notification_type"]
          recipient_email: string
          recipient_employee_id: string
          review_id: string
          send_date: string
          sent_at: string
        }
        Insert: {
          id?: string
          notification_type: Database["public"]["Enums"]["review_notification_type"]
          recipient_email: string
          recipient_employee_id: string
          review_id: string
          send_date: string
          sent_at?: string
        }
        Update: {
          id?: string
          notification_type?: Database["public"]["Enums"]["review_notification_type"]
          recipient_email?: string
          recipient_employee_id?: string
          review_id?: string
          send_date?: string
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_review_notifications_sent_recipient_employee_id_fkey"
            columns: ["recipient_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_review_notifications_sent_recipient_employee_id_fkey"
            columns: ["recipient_employee_id"]
            isOneToOne: false
            referencedRelation: "employees_client_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_review_notifications_sent_recipient_employee_id_fkey"
            columns: ["recipient_employee_id"]
            isOneToOne: false
            referencedRelation: "employees_no_pay"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_review_notifications_sent_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "agent_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_reviews: {
        Row: {
          attendance_score: number | null
          attitude_score: number | null
          campaign_id: string
          completed_at: string | null
          created_at: string
          decision: Database["public"]["Enums"]["review_decision"] | null
          decision_reason: string | null
          due_date: string
          employee_id: string
          extension_days: number | null
          hr_decided_at: string | null
          hr_decided_by: string | null
          hr_decision_notes: string | null
          id: string
          kpi_score: number | null
          notes: string | null
          reviewed_by: string | null
          termination_status:
            | Database["public"]["Enums"]["review_termination_status"]
            | null
          updated_at: string
          week_number: number
        }
        Insert: {
          attendance_score?: number | null
          attitude_score?: number | null
          campaign_id: string
          completed_at?: string | null
          created_at?: string
          decision?: Database["public"]["Enums"]["review_decision"] | null
          decision_reason?: string | null
          due_date: string
          employee_id: string
          extension_days?: number | null
          hr_decided_at?: string | null
          hr_decided_by?: string | null
          hr_decision_notes?: string | null
          id?: string
          kpi_score?: number | null
          notes?: string | null
          reviewed_by?: string | null
          termination_status?:
            | Database["public"]["Enums"]["review_termination_status"]
            | null
          updated_at?: string
          week_number: number
        }
        Update: {
          attendance_score?: number | null
          attitude_score?: number | null
          campaign_id?: string
          completed_at?: string | null
          created_at?: string
          decision?: Database["public"]["Enums"]["review_decision"] | null
          decision_reason?: string | null
          due_date?: string
          employee_id?: string
          extension_days?: number | null
          hr_decided_at?: string | null
          hr_decided_by?: string | null
          hr_decision_notes?: string | null
          id?: string
          kpi_score?: number | null
          notes?: string | null
          reviewed_by?: string | null
          termination_status?:
            | Database["public"]["Enums"]["review_termination_status"]
            | null
          updated_at?: string
          week_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "agent_reviews_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_reviews_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_reviews_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_client_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_reviews_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_no_pay"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_reviews_hr_decided_by_fkey"
            columns: ["hr_decided_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_reviews_hr_decided_by_fkey"
            columns: ["hr_decided_by"]
            isOneToOne: false
            referencedRelation: "employees_client_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_reviews_hr_decided_by_fkey"
            columns: ["hr_decided_by"]
            isOneToOne: false
            referencedRelation: "employees_no_pay"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_reviews_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_reviews_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "employees_client_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_reviews_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "employees_no_pay"
            referencedColumns: ["id"]
          },
        ]
      }
      app_config: {
        Row: {
          key: string
          value: string
        }
        Insert: {
          key: string
          value: string
        }
        Update: {
          key?: string
          value?: string
        }
        Relationships: []
      }
      attendance_incidents: {
        Row: {
          created_at: string
          created_by: string | null
          date: string
          employee_id: string
          id: string
          incident_type: string
          notes: string | null
          source: string
          supporting_doc_path: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          date: string
          employee_id: string
          id?: string
          incident_type: string
          notes?: string | null
          source?: string
          supporting_doc_path?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          date?: string
          employee_id?: string
          id?: string
          incident_type?: string
          notes?: string | null
          source?: string
          supporting_doc_path?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_incidents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_incidents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees_client_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_incidents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees_no_pay"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_incidents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_incidents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_client_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_incidents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_no_pay"
            referencedColumns: ["id"]
          },
        ]
      }
      bulletin_acks: {
        Row: {
          acked_at: string
          employee_id: string
          id: string
          post_id: string
        }
        Insert: {
          acked_at?: string
          employee_id: string
          id?: string
          post_id: string
        }
        Update: {
          acked_at?: string
          employee_id?: string
          id?: string
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bulletin_acks_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bulletin_acks_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_client_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bulletin_acks_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_no_pay"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bulletin_acks_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "bulletin_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      bulletin_posts: {
        Row: {
          author_id: string | null
          body: string
          campaign_id: string | null
          created_at: string
          expires_at: string | null
          id: string
          is_published: boolean
          organization_id: string
          published_at: string | null
          recognized_employee_id: string | null
          requires_ack: boolean
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          body?: string
          campaign_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          is_published?: boolean
          organization_id?: string
          published_at?: string | null
          recognized_employee_id?: string | null
          requires_ack?: boolean
          title: string
          type?: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          body?: string
          campaign_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          is_published?: boolean
          organization_id?: string
          published_at?: string | null
          recognized_employee_id?: string | null
          requires_ack?: boolean
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bulletin_posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bulletin_posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "employees_client_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bulletin_posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "employees_no_pay"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bulletin_posts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bulletin_posts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bulletin_posts_recognized_employee_id_fkey"
            columns: ["recognized_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bulletin_posts_recognized_employee_id_fkey"
            columns: ["recognized_employee_id"]
            isOneToOne: false
            referencedRelation: "employees_client_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bulletin_posts_recognized_employee_id_fkey"
            columns: ["recognized_employee_id"]
            isOneToOne: false
            referencedRelation: "employees_no_pay"
            referencedColumns: ["id"]
          },
        ]
      }
      bulletin_questions: {
        Row: {
          created_at: string
          id: string
          options: Json | null
          post_id: string
          question_text: string
          sort_order: number
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          options?: Json | null
          post_id: string
          question_text: string
          sort_order?: number
          type?: string
        }
        Update: {
          created_at?: string
          id?: string
          options?: Json | null
          post_id?: string
          question_text?: string
          sort_order?: number
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "bulletin_questions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "bulletin_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      bulletin_responses: {
        Row: {
          answer_option: string | null
          answer_text: string | null
          created_at: string
          id: string
          post_id: string
          question_id: string
          respondent_id: string
        }
        Insert: {
          answer_option?: string | null
          answer_text?: string | null
          created_at?: string
          id?: string
          post_id: string
          question_id: string
          respondent_id: string
        }
        Update: {
          answer_option?: string | null
          answer_text?: string | null
          created_at?: string
          id?: string
          post_id?: string
          question_id?: string
          respondent_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bulletin_responses_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "bulletin_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bulletin_responses_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "bulletin_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bulletin_responses_respondent_id_fkey"
            columns: ["respondent_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bulletin_responses_respondent_id_fkey"
            columns: ["respondent_id"]
            isOneToOne: false
            referencedRelation: "employees_client_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bulletin_responses_respondent_id_fkey"
            columns: ["respondent_id"]
            isOneToOne: false
            referencedRelation: "employees_no_pay"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_eod_recipients: {
        Row: {
          active: boolean
          campaign_id: string
          created_at: string
          email: string
          id: string
          role_label: string
        }
        Insert: {
          active?: boolean
          campaign_id: string
          created_at?: string
          email: string
          id?: string
          role_label: string
        }
        Update: {
          active?: boolean
          campaign_id?: string
          created_at?: string
          email?: string
          id?: string
          role_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_eod_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_eod_tl_notes: {
        Row: {
          campaign_id: string
          created_at: string
          date: string
          id: string
          note: string | null
          updated_at: string
          written_by: string | null
        }
        Insert: {
          campaign_id: string
          created_at?: string
          date: string
          id?: string
          note?: string | null
          updated_at?: string
          written_by?: string | null
        }
        Update: {
          campaign_id?: string
          created_at?: string
          date?: string
          id?: string
          note?: string | null
          updated_at?: string
          written_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_eod_tl_notes_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_eod_tl_notes_written_by_fkey"
            columns: ["written_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_eod_tl_notes_written_by_fkey"
            columns: ["written_by"]
            isOneToOne: false
            referencedRelation: "employees_client_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_eod_tl_notes_written_by_fkey"
            columns: ["written_by"]
            isOneToOne: false
            referencedRelation: "employees_no_pay"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_kpi_config: {
        Row: {
          campaign_id: string
          display_order: number | null
          dropdown_options: string[] | null
          field_label: string
          field_name: string
          field_type: string
          flag_independent: boolean
          flag_threshold: number | null
          id: string
          is_active: boolean | null
          is_required: boolean | null
          min_target: number | null
        }
        Insert: {
          campaign_id: string
          display_order?: number | null
          dropdown_options?: string[] | null
          field_label: string
          field_name: string
          field_type?: string
          flag_independent?: boolean
          flag_threshold?: number | null
          id?: string
          is_active?: boolean | null
          is_required?: boolean | null
          min_target?: number | null
        }
        Update: {
          campaign_id?: string
          display_order?: number | null
          dropdown_options?: string[] | null
          field_label?: string
          field_name?: string
          field_type?: string
          flag_independent?: boolean
          flag_threshold?: number | null
          id?: string
          is_active?: boolean | null
          is_required?: boolean | null
          min_target?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_kpi_config_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          client_id: string
          clock_in_alert_enabled: boolean
          created_at: string | null
          early_release_criteria: string | null
          early_release_enabled: boolean
          eod_digest_cutoff_time: string | null
          eod_digest_enabled: boolean
          eod_digest_timezone: string
          eod_morning_bundle_time: string | null
          eod_reply_to_email: string | null
          id: string
          include_agents_in_eod_digest: boolean
          is_active: boolean
          name: string
          organization_id: string
          requires_holiday_coverage: boolean
          team_lead_id: string | null
        }
        Insert: {
          client_id: string
          clock_in_alert_enabled?: boolean
          created_at?: string | null
          early_release_criteria?: string | null
          early_release_enabled?: boolean
          eod_digest_cutoff_time?: string | null
          eod_digest_enabled?: boolean
          eod_digest_timezone?: string
          eod_morning_bundle_time?: string | null
          eod_reply_to_email?: string | null
          id?: string
          include_agents_in_eod_digest?: boolean
          is_active?: boolean
          name: string
          organization_id?: string
          requires_holiday_coverage?: boolean
          team_lead_id?: string | null
        }
        Update: {
          client_id?: string
          clock_in_alert_enabled?: boolean
          created_at?: string | null
          early_release_criteria?: string | null
          early_release_enabled?: boolean
          eod_digest_cutoff_time?: string | null
          eod_digest_enabled?: boolean
          eod_digest_timezone?: string
          eod_morning_bundle_time?: string | null
          eod_reply_to_email?: string | null
          id?: string
          include_agents_in_eod_digest?: boolean
          is_active?: boolean
          name?: string
          organization_id?: string
          requires_holiday_coverage?: boolean
          team_lead_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_team_lead_id_fkey"
            columns: ["team_lead_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_team_lead_id_fkey"
            columns: ["team_lead_id"]
            isOneToOne: false
            referencedRelation: "employees_client_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_team_lead_id_fkey"
            columns: ["team_lead_id"]
            isOneToOne: false
            referencedRelation: "employees_no_pay"
            referencedColumns: ["id"]
          },
        ]
      }
      cartas_compromiso: {
        Row: {
          company_legal_address_snapshot: string | null
          company_legal_name_snapshot: string | null
          created_at: string
          created_by: string
          doc_ref: string | null
          employee_id: string
          horario_snapshot: string | null
          id: string
          incident_date: string
          incident_date_long_snapshot: string | null
          kpi_table: Json
          narrative: string | null
          pdf_path: string | null
          puesto_snapshot: string | null
          request_id: string | null
          signed_at: string | null
          signed_scan_path: string | null
          supervisor_name_snapshot: string | null
          trabajador_name_snapshot: string | null
          updated_at: string
        }
        Insert: {
          company_legal_address_snapshot?: string | null
          company_legal_name_snapshot?: string | null
          created_at?: string
          created_by: string
          doc_ref?: string | null
          employee_id: string
          horario_snapshot?: string | null
          id?: string
          incident_date: string
          incident_date_long_snapshot?: string | null
          kpi_table?: Json
          narrative?: string | null
          pdf_path?: string | null
          puesto_snapshot?: string | null
          request_id?: string | null
          signed_at?: string | null
          signed_scan_path?: string | null
          supervisor_name_snapshot?: string | null
          trabajador_name_snapshot?: string | null
          updated_at?: string
        }
        Update: {
          company_legal_address_snapshot?: string | null
          company_legal_name_snapshot?: string | null
          created_at?: string
          created_by?: string
          doc_ref?: string | null
          employee_id?: string
          horario_snapshot?: string | null
          id?: string
          incident_date?: string
          incident_date_long_snapshot?: string | null
          kpi_table?: Json
          narrative?: string | null
          pdf_path?: string | null
          puesto_snapshot?: string | null
          request_id?: string | null
          signed_at?: string | null
          signed_scan_path?: string | null
          supervisor_name_snapshot?: string | null
          trabajador_name_snapshot?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cartas_compromiso_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cartas_compromiso_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees_client_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cartas_compromiso_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees_no_pay"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cartas_compromiso_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cartas_compromiso_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_client_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cartas_compromiso_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_no_pay"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_cartas_request_id"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "hr_document_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      client_holidays: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          date: string
          id: string
          name: string
          organization_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          date: string
          id?: string
          name: string
          organization_id?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          date?: string
          id?: string
          name?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_holidays_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_recurring_deductions: {
        Row: {
          client_id: string
          created_at: string
          id: string
          is_active: boolean
          label_prefix: string
          next_counter_start: number
          notes: string | null
          organization_id: string
          prepaid_amount: number
          total_amount: number
          weekly_amount: number
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          label_prefix: string
          next_counter_start?: number
          notes?: string | null
          organization_id: string
          prepaid_amount?: number
          total_amount: number
          weekly_amount: number
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          label_prefix?: string
          next_counter_start?: number
          notes?: string | null
          organization_id?: string
          prepaid_amount?: number
          total_amount?: number
          weekly_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "client_recurring_deductions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          aliases: string[]
          bill_to_address: string | null
          bill_to_name: string | null
          created_at: string | null
          id: string
          is_active: boolean
          is_billable: boolean
          name: string
          organization_id: string
          prefix: string
          subtitle: string | null
        }
        Insert: {
          aliases?: string[]
          bill_to_address?: string | null
          bill_to_name?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean
          is_billable?: boolean
          name: string
          organization_id?: string
          prefix: string
          subtitle?: string | null
        }
        Update: {
          aliases?: string[]
          bill_to_address?: string | null
          bill_to_name?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean
          is_billable?: boolean
          name?: string
          organization_id?: string
          prefix?: string
          subtitle?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      clock_in_alert_log: {
        Row: {
          alert_date: string
          campaign_id: string
          dry_run: boolean
          error: string | null
          id: string
          missing_agents: Json | null
          missing_count: number
          recipient_count: number
          sent_at: string
          smtp_message_id: string | null
          stage: string
        }
        Insert: {
          alert_date: string
          campaign_id: string
          dry_run?: boolean
          error?: string | null
          id?: string
          missing_agents?: Json | null
          missing_count?: number
          recipient_count?: number
          sent_at?: string
          smtp_message_id?: string | null
          stage: string
        }
        Update: {
          alert_date?: string
          campaign_id?: string
          dry_run?: boolean
          error?: string | null
          id?: string
          missing_agents?: Json | null
          missing_count?: number
          recipient_count?: number
          sent_at?: string
          smtp_message_id?: string | null
          stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "clock_in_alert_log_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      company_holidays: {
        Row: {
          created_at: string
          created_by: string | null
          date: string
          id: string
          is_statutory: boolean
          name: string
          organization_id: string
          requires_request: boolean
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          date: string
          id?: string
          is_statutory?: boolean
          name: string
          organization_id?: string
          requires_request?: boolean
        }
        Update: {
          created_at?: string
          created_by?: string | null
          date?: string
          id?: string
          is_statutory?: boolean
          name?: string
          organization_id?: string
          requires_request?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "company_holidays_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_notifications_sent: {
        Row: {
          employee_id: string
          id: string
          notification_type: string
          related_document_id: string | null
          sent_at: string
        }
        Insert: {
          employee_id: string
          id?: string
          notification_type: string
          related_document_id?: string | null
          sent_at?: string
        }
        Update: {
          employee_id?: string
          id?: string
          notification_type?: string
          related_document_id?: string | null
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "compliance_notifications_sent_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_notifications_sent_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_client_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_notifications_sent_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_no_pay"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_notifications_sent_related_document_id_fkey"
            columns: ["related_document_id"]
            isOneToOne: false
            referencedRelation: "employee_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          organization_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          organization_id?: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_campaign_assignments: {
        Row: {
          campaign_id: string
          changed_by: string | null
          created_at: string
          employee_id: string
          end_date: string | null
          id: string
          organization_id: string
          reason: string | null
          start_date: string
        }
        Insert: {
          campaign_id: string
          changed_by?: string | null
          created_at?: string
          employee_id: string
          end_date?: string | null
          id?: string
          organization_id?: string
          reason?: string | null
          start_date: string
        }
        Update: {
          campaign_id?: string
          changed_by?: string | null
          created_at?: string
          employee_id?: string
          end_date?: string | null
          id?: string
          organization_id?: string
          reason?: string | null
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_campaign_assignments_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_campaign_assignments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_campaign_assignments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_client_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_campaign_assignments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_no_pay"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_documents: {
        Row: {
          document_type_id: string
          employee_id: string
          file_name: string
          file_path: string
          file_size_bytes: number
          id: string
          mime_type: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
          uploaded_at: string
          uploaded_by: string
        }
        Insert: {
          document_type_id: string
          employee_id: string
          file_name: string
          file_path: string
          file_size_bytes: number
          id?: string
          mime_type: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          uploaded_at?: string
          uploaded_by: string
        }
        Update: {
          document_type_id?: string
          employee_id?: string
          file_name?: string
          file_path?: string
          file_size_bytes?: number
          id?: string
          mime_type?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          uploaded_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_documents_document_type_id_fkey"
            columns: ["document_type_id"]
            isOneToOne: false
            referencedRelation: "required_document_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_documents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_documents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_client_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_documents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_no_pay"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          address: string | null
          bank_clabe: string | null
          bank_name: string | null
          campaign_id: string | null
          compliance_grace_until: string | null
          created_at: string | null
          curp: string | null
          cv_url: string | null
          daily_bill_rate: number | null
          daily_discount_rate: number | null
          daily_salary: number | null
          date_of_birth: string | null
          department_id: string | null
          email: string | null
          emergency_contact: string | null
          employee_id: string
          employment_status: Database["public"]["Enums"]["employment_status"]
          flat_bill_client_id: string | null
          flat_weekly_bill_amount: number | null
          full_name: string
          goal_prompt_dismissed: boolean
          goal_set_at: string | null
          goal_visible_to_tl: boolean
          hire_date: string | null
          id: string
          intro_recording_url: string | null
          invited_at: string | null
          is_active: boolean | null
          is_system_user: boolean
          kpi_bonus_amount: number | null
          last_worked_day: string | null
          marital_status: string | null
          monthly_base_salary: number | null
          nss: string | null
          organization_id: string
          overtime_day_pay: number | null
          personal_email: string | null
          personal_goal: string | null
          phone: string | null
          recruited_from_candidate_id: string | null
          rehire_eligible: boolean | null
          reports_to: string | null
          rfc: string | null
          shift_type: string | null
          sunday_bonus_amount: number | null
          terminated_at: string | null
          terminated_by: string | null
          termination_notes: string | null
          termination_reason: string | null
          title: string
          vacation_days_entitled: number | null
          vacation_premium_pct: number | null
          weekly_base_salary: number | null
          work_name: string | null
        }
        Insert: {
          address?: string | null
          bank_clabe?: string | null
          bank_name?: string | null
          campaign_id?: string | null
          compliance_grace_until?: string | null
          created_at?: string | null
          curp?: string | null
          cv_url?: string | null
          daily_bill_rate?: number | null
          daily_discount_rate?: number | null
          daily_salary?: number | null
          date_of_birth?: string | null
          department_id?: string | null
          email?: string | null
          emergency_contact?: string | null
          employee_id: string
          employment_status?: Database["public"]["Enums"]["employment_status"]
          flat_bill_client_id?: string | null
          flat_weekly_bill_amount?: number | null
          full_name: string
          goal_prompt_dismissed?: boolean
          goal_set_at?: string | null
          goal_visible_to_tl?: boolean
          hire_date?: string | null
          id?: string
          intro_recording_url?: string | null
          invited_at?: string | null
          is_active?: boolean | null
          is_system_user?: boolean
          kpi_bonus_amount?: number | null
          last_worked_day?: string | null
          marital_status?: string | null
          monthly_base_salary?: number | null
          nss?: string | null
          organization_id?: string
          overtime_day_pay?: number | null
          personal_email?: string | null
          personal_goal?: string | null
          phone?: string | null
          recruited_from_candidate_id?: string | null
          rehire_eligible?: boolean | null
          reports_to?: string | null
          rfc?: string | null
          shift_type?: string | null
          sunday_bonus_amount?: number | null
          terminated_at?: string | null
          terminated_by?: string | null
          termination_notes?: string | null
          termination_reason?: string | null
          title?: string
          vacation_days_entitled?: number | null
          vacation_premium_pct?: number | null
          weekly_base_salary?: number | null
          work_name?: string | null
        }
        Update: {
          address?: string | null
          bank_clabe?: string | null
          bank_name?: string | null
          campaign_id?: string | null
          compliance_grace_until?: string | null
          created_at?: string | null
          curp?: string | null
          cv_url?: string | null
          daily_bill_rate?: number | null
          daily_discount_rate?: number | null
          daily_salary?: number | null
          date_of_birth?: string | null
          department_id?: string | null
          email?: string | null
          emergency_contact?: string | null
          employee_id?: string
          employment_status?: Database["public"]["Enums"]["employment_status"]
          flat_bill_client_id?: string | null
          flat_weekly_bill_amount?: number | null
          full_name?: string
          goal_prompt_dismissed?: boolean
          goal_set_at?: string | null
          goal_visible_to_tl?: boolean
          hire_date?: string | null
          id?: string
          intro_recording_url?: string | null
          invited_at?: string | null
          is_active?: boolean | null
          is_system_user?: boolean
          kpi_bonus_amount?: number | null
          last_worked_day?: string | null
          marital_status?: string | null
          monthly_base_salary?: number | null
          nss?: string | null
          organization_id?: string
          overtime_day_pay?: number | null
          personal_email?: string | null
          personal_goal?: string | null
          phone?: string | null
          recruited_from_candidate_id?: string | null
          rehire_eligible?: boolean | null
          reports_to?: string | null
          rfc?: string | null
          shift_type?: string | null
          sunday_bonus_amount?: number | null
          terminated_at?: string | null
          terminated_by?: string | null
          termination_notes?: string | null
          termination_reason?: string | null
          title?: string
          vacation_days_entitled?: number | null
          vacation_premium_pct?: number | null
          weekly_base_salary?: number | null
          work_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_flat_bill_client_id_fkey"
            columns: ["flat_bill_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_recruited_from_candidate_id_fkey"
            columns: ["recruited_from_candidate_id"]
            isOneToOne: false
            referencedRelation: "recruiting_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_reports_to_fkey"
            columns: ["reports_to"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_reports_to_fkey"
            columns: ["reports_to"]
            isOneToOne: false
            referencedRelation: "employees_client_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_reports_to_fkey"
            columns: ["reports_to"]
            isOneToOne: false
            referencedRelation: "employees_no_pay"
            referencedColumns: ["id"]
          },
        ]
      }
      employment_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          employee_id: string
          from_status: Database["public"]["Enums"]["employment_status"] | null
          id: string
          last_worked_day: string | null
          notes: string | null
          reason: string | null
          rehire_eligible: boolean | null
          to_status: Database["public"]["Enums"]["employment_status"]
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          employee_id: string
          from_status?: Database["public"]["Enums"]["employment_status"] | null
          id?: string
          last_worked_day?: string | null
          notes?: string | null
          reason?: string | null
          rehire_eligible?: boolean | null
          to_status: Database["public"]["Enums"]["employment_status"]
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          employee_id?: string
          from_status?: Database["public"]["Enums"]["employment_status"] | null
          id?: string
          last_worked_day?: string | null
          notes?: string | null
          reason?: string | null
          rehire_eligible?: boolean | null
          to_status?: Database["public"]["Enums"]["employment_status"]
        }
        Relationships: [
          {
            foreignKeyName: "employment_history_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employment_history_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_client_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employment_history_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_no_pay"
            referencedColumns: ["id"]
          },
        ]
      }
      eod_digest_log: {
        Row: {
          agent_missing_count: number
          agent_submission_count: number
          campaign_id: string
          digest_date: string
          digest_type: string
          dry_run: boolean
          error: string | null
          id: string
          missing_agents: Json | null
          recipient_count: number
          sent_at: string
          smtp_message_id: string | null
        }
        Insert: {
          agent_missing_count?: number
          agent_submission_count?: number
          campaign_id: string
          digest_date: string
          digest_type: string
          dry_run?: boolean
          error?: string | null
          id?: string
          missing_agents?: Json | null
          recipient_count?: number
          sent_at?: string
          smtp_message_id?: string | null
        }
        Update: {
          agent_missing_count?: number
          agent_submission_count?: number
          campaign_id?: string
          digest_date?: string
          digest_type?: string
          dry_run?: boolean
          error?: string | null
          id?: string
          missing_agents?: Json | null
          recipient_count?: number
          sent_at?: string
          smtp_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "eod_digest_log_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      eod_logs: {
        Row: {
          campaign_id: string
          created_at: string | null
          date: string
          edit_count: number
          employee_id: string
          id: string
          last_edited_at: string | null
          metrics: Json
          notes: string | null
          released_at: string | null
          submitted_by_user_id: string | null
        }
        Insert: {
          campaign_id: string
          created_at?: string | null
          date: string
          edit_count?: number
          employee_id: string
          id?: string
          last_edited_at?: string | null
          metrics: Json
          notes?: string | null
          released_at?: string | null
          submitted_by_user_id?: string | null
        }
        Update: {
          campaign_id?: string
          created_at?: string | null
          date?: string
          edit_count?: number
          employee_id?: string
          id?: string
          last_edited_at?: string | null
          metrics?: Json
          notes?: string | null
          released_at?: string | null
          submitted_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "eod_logs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eod_logs_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eod_logs_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_client_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eod_logs_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_no_pay"
            referencedColumns: ["id"]
          },
        ]
      }
      eod_logs_audit: {
        Row: {
          action: string
          after_state: Json
          before_state: Json | null
          date: string
          edited_at: string
          edited_by: string
          employee_id: string
          eod_log_id: string | null
          id: string
          organization_id: string
          reason: string
        }
        Insert: {
          action: string
          after_state: Json
          before_state?: Json | null
          date: string
          edited_at?: string
          edited_by: string
          employee_id: string
          eod_log_id?: string | null
          id?: string
          organization_id?: string
          reason: string
        }
        Update: {
          action?: string
          after_state?: Json
          before_state?: Json | null
          date?: string
          edited_at?: string
          edited_by?: string
          employee_id?: string
          eod_log_id?: string | null
          id?: string
          organization_id?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "eod_logs_audit_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eod_logs_audit_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_client_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eod_logs_audit_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_no_pay"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eod_logs_audit_eod_log_id_fkey"
            columns: ["eod_log_id"]
            isOneToOne: false
            referencedRelation: "eod_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eod_logs_audit_eod_log_id_fkey"
            columns: ["eod_log_id"]
            isOneToOne: false
            referencedRelation: "eod_logs_client_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eod_logs_audit_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      holiday_notification_sent: {
        Row: {
          campaign_id: string
          days_before: number
          holiday_date: string
          id: string
          sent_at: string
        }
        Insert: {
          campaign_id: string
          days_before: number
          holiday_date: string
          id?: string
          sent_at?: string
        }
        Update: {
          campaign_id?: string
          days_before?: number
          holiday_date?: string
          id?: string
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "holiday_notification_sent_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      holiday_requests: {
        Row: {
          campaign_id: string
          employee_id: string
          holiday_date: string
          holiday_name: string
          id: string
          requested_at: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["holiday_request_status"]
        }
        Insert: {
          campaign_id: string
          employee_id: string
          holiday_date: string
          holiday_name: string
          id?: string
          requested_at?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["holiday_request_status"]
        }
        Update: {
          campaign_id?: string
          employee_id?: string
          holiday_date?: string
          holiday_name?: string
          id?: string
          requested_at?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["holiday_request_status"]
        }
        Relationships: [
          {
            foreignKeyName: "holiday_requests_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holiday_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holiday_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_client_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holiday_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_no_pay"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_document_requests: {
        Row: {
          canceled_reason: string | null
          created_at: string
          employee_id: string
          filed_at: string
          filed_by: string
          fulfilled_acta_id: string | null
          fulfilled_carta_id: string | null
          fulfilled_renuncia_id: string | null
          fulfilled_rescision_desempeno_id: string | null
          fulfilled_rescision_id: string | null
          id: string
          incident_date: string
          reason: string | null
          request_type: string
          status: string
          tl_narrative: string
          updated_at: string
        }
        Insert: {
          canceled_reason?: string | null
          created_at?: string
          employee_id: string
          filed_at?: string
          filed_by: string
          fulfilled_acta_id?: string | null
          fulfilled_carta_id?: string | null
          fulfilled_renuncia_id?: string | null
          fulfilled_rescision_desempeno_id?: string | null
          fulfilled_rescision_id?: string | null
          id?: string
          incident_date: string
          reason?: string | null
          request_type: string
          status?: string
          tl_narrative: string
          updated_at?: string
        }
        Update: {
          canceled_reason?: string | null
          created_at?: string
          employee_id?: string
          filed_at?: string
          filed_by?: string
          fulfilled_acta_id?: string | null
          fulfilled_carta_id?: string | null
          fulfilled_renuncia_id?: string | null
          fulfilled_rescision_desempeno_id?: string | null
          fulfilled_rescision_id?: string | null
          id?: string
          incident_date?: string
          reason?: string | null
          request_type?: string
          status?: string
          tl_narrative?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_document_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_document_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_client_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_document_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_no_pay"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_document_requests_filed_by_fkey"
            columns: ["filed_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_document_requests_filed_by_fkey"
            columns: ["filed_by"]
            isOneToOne: false
            referencedRelation: "employees_client_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_document_requests_filed_by_fkey"
            columns: ["filed_by"]
            isOneToOne: false
            referencedRelation: "employees_no_pay"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_document_requests_fulfilled_acta_id_fkey"
            columns: ["fulfilled_acta_id"]
            isOneToOne: false
            referencedRelation: "actas_administrativas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_document_requests_fulfilled_carta_id_fkey"
            columns: ["fulfilled_carta_id"]
            isOneToOne: false
            referencedRelation: "cartas_compromiso"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_document_requests_fulfilled_renuncia_id_fkey"
            columns: ["fulfilled_renuncia_id"]
            isOneToOne: false
            referencedRelation: "resignation_packets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_document_requests_fulfilled_rescision_desempeno_id_fkey"
            columns: ["fulfilled_rescision_desempeno_id"]
            isOneToOne: false
            referencedRelation: "rescision_desempeno_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_document_requests_fulfilled_rescision_id_fkey"
            columns: ["fulfilled_rescision_id"]
            isOneToOne: false
            referencedRelation: "rescision_prueba_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_lines: {
        Row: {
          agent_name: string
          campaign_name: string | null
          days_worked: number | null
          employee_id: string | null
          holiday_days: number | null
          id: string
          invoice_id: string
          is_flat_total: boolean | null
          spiffs: number | null
          total: number | null
          total_price: number | null
          unit_price: number | null
        }
        Insert: {
          agent_name: string
          campaign_name?: string | null
          days_worked?: number | null
          employee_id?: string | null
          holiday_days?: number | null
          id?: string
          invoice_id: string
          is_flat_total?: boolean | null
          spiffs?: number | null
          total?: number | null
          total_price?: number | null
          unit_price?: number | null
        }
        Update: {
          agent_name?: string
          campaign_name?: string | null
          days_worked?: number | null
          employee_id?: string | null
          holiday_days?: number | null
          id?: string
          invoice_id?: string
          is_flat_total?: boolean | null
          spiffs?: number | null
          total?: number | null
          total_price?: number | null
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_lines_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_client_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_no_pay"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          client_id: string
          created_at: string | null
          due_date: string
          id: string
          invoice_number: string
          notes: string | null
          project_name: string | null
          status: string
          submitted_on: string | null
          week_end: string
          week_number: number
          week_start: string
        }
        Insert: {
          client_id: string
          created_at?: string | null
          due_date: string
          id?: string
          invoice_number: string
          notes?: string | null
          project_name?: string | null
          status?: string
          submitted_on?: string | null
          week_end: string
          week_number: number
          week_start: string
        }
        Update: {
          client_id?: string
          created_at?: string | null
          due_date?: string
          id?: string
          invoice_number?: string
          notes?: string | null
          project_name?: string | null
          status?: string
          submitted_on?: string | null
          week_end?: string
          week_number?: number
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      mexican_holidays: {
        Row: {
          date: string
          name: string
          name_en: string | null
          name_es: string | null
          pays_premium: boolean
          type: string | null
        }
        Insert: {
          date: string
          name: string
          name_en?: string | null
          name_es?: string | null
          pays_premium?: boolean
          type?: string | null
        }
        Update: {
          date?: string
          name?: string
          name_en?: string | null
          name_es?: string | null
          pays_premium?: boolean
          type?: string | null
        }
        Relationships: []
      }
      organizations: {
        Row: {
          created_at: string
          employee_id_prefix: string
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          employee_id_prefix?: string
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          employee_id_prefix?: string
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      payroll_archive: {
        Row: {
          agent_name: string | null
          commission: number | null
          employee_id: string | null
          extra_bonus: number
          holiday_days: number
          holiday_pay: number | null
          id: string
          imported_at: string
          include_in_payroll: boolean
          joe_period_code: string | null
          joe_status: string | null
          kpi_achieved: boolean
          kpi_bonus: number | null
          legacy_agent_id: number | null
          missed_days: number
          missed_deduction: number | null
          organization_id: string
          overtime_days: number
          overtime_pay: number | null
          paid_at: string | null
          partial_week_days: number | null
          period_code: string
          rule_key: string | null
          source: string
          status: string
          sunday_pay: number | null
          sundays_worked: number
          total_pay: number | null
          vacation_days: number
          vacation_pay: number | null
          week_end: string | null
          week_label: string | null
          week_month: string | null
          week_start: string | null
          weekly_base: number | null
        }
        Insert: {
          agent_name?: string | null
          commission?: number | null
          employee_id?: string | null
          extra_bonus?: number
          holiday_days?: number
          holiday_pay?: number | null
          id?: string
          imported_at?: string
          include_in_payroll?: boolean
          joe_period_code?: string | null
          joe_status?: string | null
          kpi_achieved?: boolean
          kpi_bonus?: number | null
          legacy_agent_id?: number | null
          missed_days?: number
          missed_deduction?: number | null
          organization_id?: string
          overtime_days?: number
          overtime_pay?: number | null
          paid_at?: string | null
          partial_week_days?: number | null
          period_code: string
          rule_key?: string | null
          source?: string
          status?: string
          sunday_pay?: number | null
          sundays_worked?: number
          total_pay?: number | null
          vacation_days?: number
          vacation_pay?: number | null
          week_end?: string | null
          week_label?: string | null
          week_month?: string | null
          week_start?: string | null
          weekly_base?: number | null
        }
        Update: {
          agent_name?: string | null
          commission?: number | null
          employee_id?: string | null
          extra_bonus?: number
          holiday_days?: number
          holiday_pay?: number | null
          id?: string
          imported_at?: string
          include_in_payroll?: boolean
          joe_period_code?: string | null
          joe_status?: string | null
          kpi_achieved?: boolean
          kpi_bonus?: number | null
          legacy_agent_id?: number | null
          missed_days?: number
          missed_deduction?: number | null
          organization_id?: string
          overtime_days?: number
          overtime_pay?: number | null
          paid_at?: string | null
          partial_week_days?: number | null
          period_code?: string
          rule_key?: string | null
          source?: string
          status?: string
          sunday_pay?: number | null
          sundays_worked?: number
          total_pay?: number | null
          vacation_days?: number
          vacation_pay?: number | null
          week_end?: string | null
          week_label?: string | null
          week_month?: string | null
          week_start?: string | null
          weekly_base?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "payroll_archive_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_archive_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_client_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_archive_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_no_pay"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_archive_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_audit_log: {
        Row: {
          action: string
          actor: string | null
          after: Json | null
          at: string
          before: Json | null
          id: string
          organization_id: string
          record_id: string | null
        }
        Insert: {
          action: string
          actor?: string | null
          after?: Json | null
          at?: string
          before?: Json | null
          id?: string
          organization_id?: string
          record_id?: string | null
        }
        Update: {
          action?: string
          actor?: string | null
          after?: Json | null
          at?: string
          before?: Json | null
          id?: string
          organization_id?: string
          record_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payroll_audit_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_periods: {
        Row: {
          created_at: string
          end_date: string
          half: string
          id: string
          locked_at: string | null
          locked_by: string | null
          month: number
          organization_id: string
          period_code: string
          period_type: string
          start_date: string
          status: string
          year: number
        }
        Insert: {
          created_at?: string
          end_date: string
          half: string
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          month: number
          organization_id?: string
          period_code: string
          period_type?: string
          start_date: string
          status?: string
          year: number
        }
        Update: {
          created_at?: string
          end_date?: string
          half?: string
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          month?: number
          organization_id?: string
          period_code?: string
          period_type?: string
          start_date?: string
          status?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "payroll_periods_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_records: {
        Row: {
          auto_derived: Json | null
          campaign_id: string | null
          commission: number
          commission_flag: string | null
          created_at: string
          custom_deduction: number | null
          employee_id: string
          extra_bonus: number
          holiday_days: number
          holiday_pay: number | null
          id: string
          include_in_payroll: boolean
          kpi_achieved: boolean
          kpi_bonus: number | null
          memo: string | null
          missed_days: number
          missed_deduction: number | null
          organization_id: string
          overtime_days: number
          overtime_pay: number | null
          partial_week_days: number | null
          status: string
          sunday_pay: number | null
          sundays_worked: number
          total_pay: number | null
          updated_at: string
          vacation_days: number
          vacation_pay: number | null
          week_id: string
          weekly_base: number | null
        }
        Insert: {
          auto_derived?: Json | null
          campaign_id?: string | null
          commission?: number
          commission_flag?: string | null
          created_at?: string
          custom_deduction?: number | null
          employee_id: string
          extra_bonus?: number
          holiday_days?: number
          holiday_pay?: number | null
          id?: string
          include_in_payroll?: boolean
          kpi_achieved?: boolean
          kpi_bonus?: number | null
          memo?: string | null
          missed_days?: number
          missed_deduction?: number | null
          organization_id?: string
          overtime_days?: number
          overtime_pay?: number | null
          partial_week_days?: number | null
          status?: string
          sunday_pay?: number | null
          sundays_worked?: number
          total_pay?: number | null
          updated_at?: string
          vacation_days?: number
          vacation_pay?: number | null
          week_id: string
          weekly_base?: number | null
        }
        Update: {
          auto_derived?: Json | null
          campaign_id?: string | null
          commission?: number
          commission_flag?: string | null
          created_at?: string
          custom_deduction?: number | null
          employee_id?: string
          extra_bonus?: number
          holiday_days?: number
          holiday_pay?: number | null
          id?: string
          include_in_payroll?: boolean
          kpi_achieved?: boolean
          kpi_bonus?: number | null
          memo?: string | null
          missed_days?: number
          missed_deduction?: number | null
          organization_id?: string
          overtime_days?: number
          overtime_pay?: number | null
          partial_week_days?: number | null
          status?: string
          sunday_pay?: number | null
          sundays_worked?: number
          total_pay?: number | null
          updated_at?: string
          vacation_days?: number
          vacation_pay?: number | null
          week_id?: string
          weekly_base?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "payroll_records_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_client_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_records_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_no_pay"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_records_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_records_week_id_fkey"
            columns: ["week_id"]
            isOneToOne: false
            referencedRelation: "payroll_weeks"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_validation_runs: {
        Row: {
          diverge_count: number
          diverge_detail: Json | null
          gate_passed: boolean
          id: string
          match_count: number
          match_rate_pct: number
          notes: string | null
          replay_eligible: number
          run_at: string
          run_by: string | null
          skip_count: number
          total_archive_rows: number
        }
        Insert: {
          diverge_count: number
          diverge_detail?: Json | null
          gate_passed: boolean
          id?: string
          match_count: number
          match_rate_pct: number
          notes?: string | null
          replay_eligible: number
          run_at?: string
          run_by?: string | null
          skip_count: number
          total_archive_rows: number
        }
        Update: {
          diverge_count?: number
          diverge_detail?: Json | null
          gate_passed?: boolean
          id?: string
          match_count?: number
          match_rate_pct?: number
          notes?: string | null
          replay_eligible?: number
          run_at?: string
          run_by?: string | null
          skip_count?: number
          total_archive_rows?: number
        }
        Relationships: []
      }
      payroll_weeks: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          period_id: string
          status: string
          status_changed_at: string | null
          status_changed_by: string | null
          week_end: string
          week_number: number
          week_start: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id?: string
          period_id: string
          status?: string
          status_changed_at?: string | null
          status_changed_by?: string | null
          week_end: string
          week_number: number
          week_start: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          period_id?: string
          status?: string
          status_changed_at?: string | null
          status_changed_by?: string | null
          week_end?: string
          week_number?: number
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_weeks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_weeks_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "payroll_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      policy_acknowledgments: {
        Row: {
          acknowledged_at: string
          employee_id: string
          id: string
          policy_document_version_id: string
        }
        Insert: {
          acknowledged_at?: string
          employee_id: string
          id?: string
          policy_document_version_id: string
        }
        Update: {
          acknowledged_at?: string
          employee_id?: string
          id?: string
          policy_document_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "policy_acknowledgments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policy_acknowledgments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_client_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policy_acknowledgments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_no_pay"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policy_acknowledgments_policy_document_version_id_fkey"
            columns: ["policy_document_version_id"]
            isOneToOne: false
            referencedRelation: "policy_document_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      policy_document_versions: {
        Row: {
          change_notes: string | null
          created_at: string
          file_name: string
          file_path: string
          file_size_bytes: number
          id: string
          mime_type: string
          policy_document_id: string
          published_at: string
          uploaded_by: string
          version_number: number
        }
        Insert: {
          change_notes?: string | null
          created_at?: string
          file_name: string
          file_path: string
          file_size_bytes: number
          id?: string
          mime_type: string
          policy_document_id: string
          published_at?: string
          uploaded_by: string
          version_number: number
        }
        Update: {
          change_notes?: string | null
          created_at?: string
          file_name?: string
          file_path?: string
          file_size_bytes?: number
          id?: string
          mime_type?: string
          policy_document_id?: string
          published_at?: string
          uploaded_by?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "policy_document_versions_policy_document_id_fkey"
            columns: ["policy_document_id"]
            isOneToOne: false
            referencedRelation: "policy_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policy_document_versions_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policy_document_versions_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "employees_client_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policy_document_versions_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "employees_no_pay"
            referencedColumns: ["id"]
          },
        ]
      }
      policy_documents: {
        Row: {
          applicable_roles: string[] | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_global: boolean
          organization_id: string
          scoped_campaign_ids: string[] | null
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          applicable_roles?: string[] | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_global?: boolean
          organization_id?: string
          scoped_campaign_ids?: string[] | null
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          applicable_roles?: string[] | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_global?: boolean
          organization_id?: string
          scoped_campaign_ids?: string[] | null
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "policy_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      recruiting_candidates: {
        Row: {
          applicant_notes: string | null
          assigned_to: string | null
          city: string | null
          created_at: string
          curp: string | null
          cv_url: string | null
          email: string | null
          english_level_assessed: string | null
          english_level_self: string
          final_status: string | null
          full_name: string | null
          geo_qualified: boolean | null
          hired_at: string | null
          hired_for_role: string | null
          id: string
          last_contacted_at: string | null
          needs_manual_review: boolean
          next_followup_at: string | null
          pass_reason: string | null
          phone: string | null
          position_fits: string[]
          presentation_url: string | null
          qualified_for_roles: string[]
          raw_email_body: string | null
          raw_email_received_at: string | null
          recruiter_notes: string | null
          referral_source: string | null
          role_interest: string | null
          source: string
          stage: string
          stage_changed_at: string
          updated_at: string
        }
        Insert: {
          applicant_notes?: string | null
          assigned_to?: string | null
          city?: string | null
          created_at?: string
          curp?: string | null
          cv_url?: string | null
          email?: string | null
          english_level_assessed?: string | null
          english_level_self?: string
          final_status?: string | null
          full_name?: string | null
          geo_qualified?: boolean | null
          hired_at?: string | null
          hired_for_role?: string | null
          id?: string
          last_contacted_at?: string | null
          needs_manual_review?: boolean
          next_followup_at?: string | null
          pass_reason?: string | null
          phone?: string | null
          position_fits?: string[]
          presentation_url?: string | null
          qualified_for_roles?: string[]
          raw_email_body?: string | null
          raw_email_received_at?: string | null
          recruiter_notes?: string | null
          referral_source?: string | null
          role_interest?: string | null
          source?: string
          stage?: string
          stage_changed_at?: string
          updated_at?: string
        }
        Update: {
          applicant_notes?: string | null
          assigned_to?: string | null
          city?: string | null
          created_at?: string
          curp?: string | null
          cv_url?: string | null
          email?: string | null
          english_level_assessed?: string | null
          english_level_self?: string
          final_status?: string | null
          full_name?: string | null
          geo_qualified?: boolean | null
          hired_at?: string | null
          hired_for_role?: string | null
          id?: string
          last_contacted_at?: string | null
          needs_manual_review?: boolean
          next_followup_at?: string | null
          pass_reason?: string | null
          phone?: string | null
          position_fits?: string[]
          presentation_url?: string | null
          qualified_for_roles?: string[]
          raw_email_body?: string | null
          raw_email_received_at?: string | null
          recruiter_notes?: string | null
          referral_source?: string | null
          role_interest?: string | null
          source?: string
          stage?: string
          stage_changed_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      recruiting_interviews: {
        Row: {
          candidate_id: string
          coachability_score: number | null
          communication_score: number | null
          conducted_at: string
          conducted_by: string | null
          english_score: number | null
          event_key: string | null
          id: string
          interview_type: string
          notes: string | null
          outcome: string | null
          overall_score: number | null
          recommendation: string | null
          scheduled_at: string | null
        }
        Insert: {
          candidate_id: string
          coachability_score?: number | null
          communication_score?: number | null
          conducted_at?: string
          conducted_by?: string | null
          english_score?: number | null
          event_key?: string | null
          id?: string
          interview_type?: string
          notes?: string | null
          outcome?: string | null
          overall_score?: number | null
          recommendation?: string | null
          scheduled_at?: string | null
        }
        Update: {
          candidate_id?: string
          coachability_score?: number | null
          communication_score?: number | null
          conducted_at?: string
          conducted_by?: string | null
          english_score?: number | null
          event_key?: string | null
          id?: string
          interview_type?: string
          notes?: string | null
          outcome?: string | null
          overall_score?: number | null
          recommendation?: string | null
          scheduled_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recruiting_interviews_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "recruiting_candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      recruiting_messages: {
        Row: {
          body: string
          candidate_id: string
          channel: string
          created_at: string
          direction: string
          id: string
          sent_by: string | null
          status: string
          subject: string | null
          template_key: string | null
        }
        Insert: {
          body: string
          candidate_id: string
          channel: string
          created_at?: string
          direction: string
          id?: string
          sent_by?: string | null
          status?: string
          subject?: string | null
          template_key?: string | null
        }
        Update: {
          body?: string
          candidate_id?: string
          channel?: string
          created_at?: string
          direction?: string
          id?: string
          sent_by?: string | null
          status?: string
          subject?: string | null
          template_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recruiting_messages_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "recruiting_candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      recruiting_positions: {
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
      required_document_types: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      rescision_desempeno_documents: {
        Row: {
          aguinaldo_monto: number | null
          company_legal_address_snapshot: string | null
          company_legal_name_snapshot: string | null
          contract_signing_date: string | null
          created_at: string
          created_by: string
          curp_snapshot: string | null
          doc_ref: string | null
          employee_id: string
          hire_date_snapshot: string | null
          horario_snapshot: string | null
          id: string
          incident_date_long_snapshot: string | null
          kpi_table: Json
          narrative: string | null
          pdf_path: string | null
          prima_vacacional_monto: number | null
          puesto_snapshot: string | null
          request_id: string | null
          rfc_snapshot: string | null
          salario_diario_snapshot: number | null
          salarios_devengados_monto: number | null
          signed_at: string | null
          signed_scan_path: string | null
          supervisor_name_snapshot: string | null
          termination_effective_date: string
          total_en_letras: string | null
          total_monto: number | null
          trabajador_name_snapshot: string | null
          updated_at: string
          vacaciones_monto: number | null
        }
        Insert: {
          aguinaldo_monto?: number | null
          company_legal_address_snapshot?: string | null
          company_legal_name_snapshot?: string | null
          contract_signing_date?: string | null
          created_at?: string
          created_by: string
          curp_snapshot?: string | null
          doc_ref?: string | null
          employee_id: string
          hire_date_snapshot?: string | null
          horario_snapshot?: string | null
          id?: string
          incident_date_long_snapshot?: string | null
          kpi_table?: Json
          narrative?: string | null
          pdf_path?: string | null
          prima_vacacional_monto?: number | null
          puesto_snapshot?: string | null
          request_id?: string | null
          rfc_snapshot?: string | null
          salario_diario_snapshot?: number | null
          salarios_devengados_monto?: number | null
          signed_at?: string | null
          signed_scan_path?: string | null
          supervisor_name_snapshot?: string | null
          termination_effective_date: string
          total_en_letras?: string | null
          total_monto?: number | null
          trabajador_name_snapshot?: string | null
          updated_at?: string
          vacaciones_monto?: number | null
        }
        Update: {
          aguinaldo_monto?: number | null
          company_legal_address_snapshot?: string | null
          company_legal_name_snapshot?: string | null
          contract_signing_date?: string | null
          created_at?: string
          created_by?: string
          curp_snapshot?: string | null
          doc_ref?: string | null
          employee_id?: string
          hire_date_snapshot?: string | null
          horario_snapshot?: string | null
          id?: string
          incident_date_long_snapshot?: string | null
          kpi_table?: Json
          narrative?: string | null
          pdf_path?: string | null
          prima_vacacional_monto?: number | null
          puesto_snapshot?: string | null
          request_id?: string | null
          rfc_snapshot?: string | null
          salario_diario_snapshot?: number | null
          salarios_devengados_monto?: number | null
          signed_at?: string | null
          signed_scan_path?: string | null
          supervisor_name_snapshot?: string | null
          termination_effective_date?: string
          total_en_letras?: string | null
          total_monto?: number | null
          trabajador_name_snapshot?: string | null
          updated_at?: string
          vacaciones_monto?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rescision_desempeno_documents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rescision_desempeno_documents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees_client_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rescision_desempeno_documents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees_no_pay"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rescision_desempeno_documents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rescision_desempeno_documents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_client_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rescision_desempeno_documents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_no_pay"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rescision_desempeno_documents_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "hr_document_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      rescision_prueba_documents: {
        Row: {
          aguinaldo_monto: number | null
          company_legal_address_snapshot: string | null
          company_legal_name_snapshot: string | null
          contract_signing_date: string | null
          created_at: string
          created_by: string
          curp_snapshot: string | null
          doc_ref: string | null
          employee_id: string
          hire_date_snapshot: string | null
          horario_snapshot: string | null
          id: string
          incident_date_long_snapshot: string | null
          kpi_table: Json
          narrative: string | null
          pdf_path: string | null
          prima_vacacional_monto: number | null
          puesto_snapshot: string | null
          request_id: string | null
          rfc_snapshot: string | null
          salario_diario_snapshot: number | null
          salarios_devengados_monto: number | null
          signed_at: string | null
          signed_scan_path: string | null
          supervisor_name_snapshot: string | null
          termination_effective_date: string
          total_en_letras: string | null
          total_monto: number | null
          trabajador_name_snapshot: string | null
          updated_at: string
          vacaciones_monto: number | null
        }
        Insert: {
          aguinaldo_monto?: number | null
          company_legal_address_snapshot?: string | null
          company_legal_name_snapshot?: string | null
          contract_signing_date?: string | null
          created_at?: string
          created_by: string
          curp_snapshot?: string | null
          doc_ref?: string | null
          employee_id: string
          hire_date_snapshot?: string | null
          horario_snapshot?: string | null
          id?: string
          incident_date_long_snapshot?: string | null
          kpi_table?: Json
          narrative?: string | null
          pdf_path?: string | null
          prima_vacacional_monto?: number | null
          puesto_snapshot?: string | null
          request_id?: string | null
          rfc_snapshot?: string | null
          salario_diario_snapshot?: number | null
          salarios_devengados_monto?: number | null
          signed_at?: string | null
          signed_scan_path?: string | null
          supervisor_name_snapshot?: string | null
          termination_effective_date: string
          total_en_letras?: string | null
          total_monto?: number | null
          trabajador_name_snapshot?: string | null
          updated_at?: string
          vacaciones_monto?: number | null
        }
        Update: {
          aguinaldo_monto?: number | null
          company_legal_address_snapshot?: string | null
          company_legal_name_snapshot?: string | null
          contract_signing_date?: string | null
          created_at?: string
          created_by?: string
          curp_snapshot?: string | null
          doc_ref?: string | null
          employee_id?: string
          hire_date_snapshot?: string | null
          horario_snapshot?: string | null
          id?: string
          incident_date_long_snapshot?: string | null
          kpi_table?: Json
          narrative?: string | null
          pdf_path?: string | null
          prima_vacacional_monto?: number | null
          puesto_snapshot?: string | null
          request_id?: string | null
          rfc_snapshot?: string | null
          salario_diario_snapshot?: number | null
          salarios_devengados_monto?: number | null
          signed_at?: string | null
          signed_scan_path?: string | null
          supervisor_name_snapshot?: string | null
          termination_effective_date?: string
          total_en_letras?: string | null
          total_monto?: number | null
          trabajador_name_snapshot?: string | null
          updated_at?: string
          vacaciones_monto?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rescision_prueba_documents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rescision_prueba_documents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees_client_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rescision_prueba_documents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees_no_pay"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rescision_prueba_documents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rescision_prueba_documents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_client_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rescision_prueba_documents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_no_pay"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rescision_prueba_documents_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "hr_document_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      resignation_packets: {
        Row: {
          aguinaldo_monto: number | null
          clave_elector: string | null
          company_legal_address_snapshot: string | null
          company_legal_name_snapshot: string | null
          created_at: string
          created_by: string
          curp_snapshot: string | null
          doc_ref: string | null
          effective_date: string
          employee_id: string
          hire_date_snapshot: string | null
          horario_snapshot: string | null
          id: string
          narrative: string | null
          pdf_path: string | null
          prima_vacacional_monto: number | null
          puesto_snapshot: string | null
          request_id: string | null
          rfc_snapshot: string | null
          salario_diario_snapshot: number | null
          salarios_devengados_monto: number | null
          signed_at: string | null
          signed_scan_path: string | null
          total_en_letras: string | null
          total_monto: number | null
          trabajador_name_snapshot: string | null
          updated_at: string
          vacaciones_monto: number | null
        }
        Insert: {
          aguinaldo_monto?: number | null
          clave_elector?: string | null
          company_legal_address_snapshot?: string | null
          company_legal_name_snapshot?: string | null
          created_at?: string
          created_by: string
          curp_snapshot?: string | null
          doc_ref?: string | null
          effective_date: string
          employee_id: string
          hire_date_snapshot?: string | null
          horario_snapshot?: string | null
          id?: string
          narrative?: string | null
          pdf_path?: string | null
          prima_vacacional_monto?: number | null
          puesto_snapshot?: string | null
          request_id?: string | null
          rfc_snapshot?: string | null
          salario_diario_snapshot?: number | null
          salarios_devengados_monto?: number | null
          signed_at?: string | null
          signed_scan_path?: string | null
          total_en_letras?: string | null
          total_monto?: number | null
          trabajador_name_snapshot?: string | null
          updated_at?: string
          vacaciones_monto?: number | null
        }
        Update: {
          aguinaldo_monto?: number | null
          clave_elector?: string | null
          company_legal_address_snapshot?: string | null
          company_legal_name_snapshot?: string | null
          created_at?: string
          created_by?: string
          curp_snapshot?: string | null
          doc_ref?: string | null
          effective_date?: string
          employee_id?: string
          hire_date_snapshot?: string | null
          horario_snapshot?: string | null
          id?: string
          narrative?: string | null
          pdf_path?: string | null
          prima_vacacional_monto?: number | null
          puesto_snapshot?: string | null
          request_id?: string | null
          rfc_snapshot?: string | null
          salario_diario_snapshot?: number | null
          salarios_devengados_monto?: number | null
          signed_at?: string | null
          signed_scan_path?: string | null
          total_en_letras?: string | null
          total_monto?: number | null
          trabajador_name_snapshot?: string | null
          updated_at?: string
          vacaciones_monto?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "resignation_packets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resignation_packets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees_client_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resignation_packets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees_no_pay"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resignation_packets_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resignation_packets_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_client_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resignation_packets_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_no_pay"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resignation_packets_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "hr_document_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      sensitive_data_acknowledgments: {
        Row: {
          acknowledged_at: string
          acknowledged_by: string
          acknowledged_by_user_id: string | null
          acknowledgment_text: string
          context: string
          hr_document_request_id: string | null
          id: string
          organization_id: string
          subject_employee_id: string | null
        }
        Insert: {
          acknowledged_at?: string
          acknowledged_by: string
          acknowledged_by_user_id?: string | null
          acknowledgment_text: string
          context: string
          hr_document_request_id?: string | null
          id?: string
          organization_id: string
          subject_employee_id?: string | null
        }
        Update: {
          acknowledged_at?: string
          acknowledged_by?: string
          acknowledged_by_user_id?: string | null
          acknowledgment_text?: string
          context?: string
          hr_document_request_id?: string | null
          id?: string
          organization_id?: string
          subject_employee_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sensitive_data_acknowledgments_acknowledged_by_fkey"
            columns: ["acknowledged_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sensitive_data_acknowledgments_acknowledged_by_fkey"
            columns: ["acknowledged_by"]
            isOneToOne: false
            referencedRelation: "employees_client_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sensitive_data_acknowledgments_acknowledged_by_fkey"
            columns: ["acknowledged_by"]
            isOneToOne: false
            referencedRelation: "employees_no_pay"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sensitive_data_acknowledgments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sensitive_data_acknowledgments_subject_employee_id_fkey"
            columns: ["subject_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sensitive_data_acknowledgments_subject_employee_id_fkey"
            columns: ["subject_employee_id"]
            isOneToOne: false
            referencedRelation: "employees_client_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sensitive_data_acknowledgments_subject_employee_id_fkey"
            columns: ["subject_employee_id"]
            isOneToOne: false
            referencedRelation: "employees_no_pay"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_settings: {
        Row: {
          break_grace_minutes: number
          campaign_id: string
          days_of_week: number[] | null
          end_time: string
          grace_minutes: number | null
          id: string
          shift_name: string
          start_time: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          break_grace_minutes?: number
          campaign_id: string
          days_of_week?: number[] | null
          end_time: string
          grace_minutes?: number | null
          id?: string
          shift_name: string
          start_time: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          break_grace_minutes?: number
          campaign_id?: string
          days_of_week?: number[] | null
          end_time?: string
          grace_minutes?: number | null
          id?: string
          shift_name?: string
          start_time?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shift_settings_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_settings_audit: {
        Row: {
          action: string
          campaign_id: string | null
          changed_at: string
          changed_by: string | null
          changed_by_email: string | null
          changes: Json | null
          id: string
          shift_setting_id: string | null
        }
        Insert: {
          action: string
          campaign_id?: string | null
          changed_at?: string
          changed_by?: string | null
          changed_by_email?: string | null
          changes?: Json | null
          id?: string
          shift_setting_id?: string | null
        }
        Update: {
          action?: string
          campaign_id?: string | null
          changed_at?: string
          changed_by?: string | null
          changed_by_email?: string | null
          changes?: Json | null
          id?: string
          shift_setting_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shift_settings_audit_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      spiff_import_log: {
        Row: {
          amount: number
          applied_at: string
          id: string
          invoice_id: string
          invoice_line_id: string
          raw_row: Json | null
          signature: string
          source: string
        }
        Insert: {
          amount: number
          applied_at?: string
          id?: string
          invoice_id: string
          invoice_line_id: string
          raw_row?: Json | null
          signature: string
          source?: string
        }
        Update: {
          amount?: number
          applied_at?: string
          id?: string
          invoice_id?: string
          invoice_line_id?: string
          raw_row?: Json | null
          signature?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "spiff_import_log_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spiff_import_log_invoice_line_id_fkey"
            columns: ["invoice_line_id"]
            isOneToOne: false
            referencedRelation: "invoice_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      spiffs: {
        Row: {
          amount_usd: number
          billed_at: string | null
          client_id: string
          created_at: string
          created_by: string | null
          employee_id: string
          id: string
          invoice_line_id: string | null
          organization_id: string
          reason: string
          source: string
          spiff_date: string
          status: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          amount_usd: number
          billed_at?: string | null
          client_id: string
          created_at?: string
          created_by?: string | null
          employee_id: string
          id?: string
          invoice_line_id?: string | null
          organization_id?: string
          reason: string
          source?: string
          spiff_date: string
          status?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          amount_usd?: number
          billed_at?: string | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          employee_id?: string
          id?: string
          invoice_line_id?: string | null
          organization_id?: string
          reason?: string
          source?: string
          spiff_date?: string
          status?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "spiffs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spiffs_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spiffs_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_client_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spiffs_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_no_pay"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spiffs_invoice_line_id_fkey"
            columns: ["invoice_line_id"]
            isOneToOne: false
            referencedRelation: "invoice_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spiffs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      team_lead_campaigns: {
        Row: {
          campaign_id: string
          created_at: string
          created_by: string | null
          team_lead_id: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          created_by?: string | null
          team_lead_id: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          created_by?: string | null
          team_lead_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_lead_campaigns_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_lead_campaigns_team_lead_id_fkey"
            columns: ["team_lead_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_lead_campaigns_team_lead_id_fkey"
            columns: ["team_lead_id"]
            isOneToOne: false
            referencedRelation: "employees_client_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_lead_campaigns_team_lead_id_fkey"
            columns: ["team_lead_id"]
            isOneToOne: false
            referencedRelation: "employees_no_pay"
            referencedColumns: ["id"]
          },
        ]
      }
      time_clock: {
        Row: {
          auto_clocked_out: boolean
          break1_end: string | null
          break1_late_reason: string | null
          break1_start: string | null
          break2_end: string | null
          break2_late_reason: string | null
          break2_start: string | null
          clock_in: string
          clock_out: string | null
          created_at: string | null
          date: string
          early_release: boolean
          employee_id: string
          eod_completed: boolean
          id: string
          is_late: boolean | null
          late_minutes: number | null
          lunch_end: string | null
          lunch_late_reason: string | null
          lunch_start: string | null
          shift_end_expected: string | null
          total_hours: number | null
        }
        Insert: {
          auto_clocked_out?: boolean
          break1_end?: string | null
          break1_late_reason?: string | null
          break1_start?: string | null
          break2_end?: string | null
          break2_late_reason?: string | null
          break2_start?: string | null
          clock_in: string
          clock_out?: string | null
          created_at?: string | null
          date: string
          early_release?: boolean
          employee_id: string
          eod_completed?: boolean
          id?: string
          is_late?: boolean | null
          late_minutes?: number | null
          lunch_end?: string | null
          lunch_late_reason?: string | null
          lunch_start?: string | null
          shift_end_expected?: string | null
          total_hours?: number | null
        }
        Update: {
          auto_clocked_out?: boolean
          break1_end?: string | null
          break1_late_reason?: string | null
          break1_start?: string | null
          break2_end?: string | null
          break2_late_reason?: string | null
          break2_start?: string | null
          clock_in?: string
          clock_out?: string | null
          created_at?: string | null
          date?: string
          early_release?: boolean
          employee_id?: string
          eod_completed?: boolean
          id?: string
          is_late?: boolean | null
          late_minutes?: number | null
          lunch_end?: string | null
          lunch_late_reason?: string | null
          lunch_start?: string | null
          shift_end_expected?: string | null
          total_hours?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "time_clock_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_clock_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_client_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_clock_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_no_pay"
            referencedColumns: ["id"]
          },
        ]
      }
      time_clock_audit: {
        Row: {
          action: string
          after_state: Json
          before_state: Json | null
          date: string
          edited_at: string
          edited_by: string
          employee_id: string
          id: string
          organization_id: string
          reason: string
          time_clock_id: string | null
        }
        Insert: {
          action: string
          after_state: Json
          before_state?: Json | null
          date: string
          edited_at?: string
          edited_by: string
          employee_id: string
          id?: string
          organization_id?: string
          reason: string
          time_clock_id?: string | null
        }
        Update: {
          action?: string
          after_state?: Json
          before_state?: Json | null
          date?: string
          edited_at?: string
          edited_by?: string
          employee_id?: string
          id?: string
          organization_id?: string
          reason?: string
          time_clock_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "time_clock_audit_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_clock_audit_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_client_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_clock_audit_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_no_pay"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_clock_audit_time_clock_id_fkey"
            columns: ["time_clock_id"]
            isOneToOne: false
            referencedRelation: "time_clock"
            referencedColumns: ["id"]
          },
        ]
      }
      tl_nudges: {
        Row: {
          date: string
          employee_id: string
          nudged_at: string
          nudged_by: string
        }
        Insert: {
          date?: string
          employee_id: string
          nudged_at?: string
          nudged_by: string
        }
        Update: {
          date?: string
          employee_id?: string
          nudged_at?: string
          nudged_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "tl_nudges_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tl_nudges_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_client_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tl_nudges_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_no_pay"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tl_nudges_nudged_by_fkey"
            columns: ["nudged_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tl_nudges_nudged_by_fkey"
            columns: ["nudged_by"]
            isOneToOne: false
            referencedRelation: "employees_client_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tl_nudges_nudged_by_fkey"
            columns: ["nudged_by"]
            isOneToOne: false
            referencedRelation: "employees_no_pay"
            referencedColumns: ["id"]
          },
        ]
      }
      uptraining_documents: {
        Row: {
          created_at: string
          employee_id: string
          file_path: string
          id: string
          note: string | null
          organization_id: string
          original_filename: string | null
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          employee_id: string
          file_path: string
          id?: string
          note?: string | null
          organization_id?: string
          original_filename?: string | null
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          employee_id?: string
          file_path?: string
          id?: string
          note?: string | null
          organization_id?: string
          original_filename?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "uptraining_documents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uptraining_documents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_client_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uptraining_documents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_no_pay"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uptraining_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uptraining_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "employees_client_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uptraining_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "employees_no_pay"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          client_id: string | null
          created_at: string | null
          employee_id: string | null
          id: string
          organization_id: string
          role: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string | null
          employee_id?: string | null
          id: string
          organization_id?: string
          role: string
        }
        Update: {
          client_id?: string | null
          created_at?: string | null
          employee_id?: string | null
          id?: string
          organization_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_profiles_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_profiles_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_client_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_profiles_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_no_pay"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      vacation_requests: {
        Row: {
          campaign_id: string
          created_at: string
          days_requested: number
          denial_reason: string | null
          employee_id: string
          end_date: string
          hr_reviewed_at: string | null
          hr_reviewed_by: string | null
          id: string
          is_paid: boolean
          notes: string | null
          request_type: string
          start_date: string
          status: string
          tl_reviewed_at: string | null
          tl_reviewed_by: string | null
        }
        Insert: {
          campaign_id: string
          created_at?: string
          days_requested: number
          denial_reason?: string | null
          employee_id: string
          end_date: string
          hr_reviewed_at?: string | null
          hr_reviewed_by?: string | null
          id?: string
          is_paid?: boolean
          notes?: string | null
          request_type?: string
          start_date: string
          status?: string
          tl_reviewed_at?: string | null
          tl_reviewed_by?: string | null
        }
        Update: {
          campaign_id?: string
          created_at?: string
          days_requested?: number
          denial_reason?: string | null
          employee_id?: string
          end_date?: string
          hr_reviewed_at?: string | null
          hr_reviewed_by?: string | null
          id?: string
          is_paid?: boolean
          notes?: string | null
          request_type?: string
          start_date?: string
          status?: string
          tl_reviewed_at?: string | null
          tl_reviewed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vacation_requests_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vacation_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vacation_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_client_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vacation_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_no_pay"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      employees_client_view: {
        Row: {
          campaign_id: string | null
          display_name: string | null
          id: string | null
          is_active: boolean | null
          title: string | null
        }
        Insert: {
          campaign_id?: string | null
          display_name?: never
          id?: string | null
          is_active?: boolean | null
          title?: string | null
        }
        Update: {
          campaign_id?: string | null
          display_name?: never
          id?: string | null
          is_active?: boolean | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      employees_no_pay: {
        Row: {
          campaign_id: string | null
          created_at: string | null
          email: string | null
          employee_id: string | null
          full_name: string | null
          id: string | null
          is_active: boolean | null
          reports_to: string | null
          title: string | null
          work_name: string | null
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string | null
          email?: string | null
          employee_id?: string | null
          full_name?: string | null
          id?: string | null
          is_active?: boolean | null
          reports_to?: string | null
          title?: string | null
          work_name?: string | null
        }
        Update: {
          campaign_id?: string | null
          created_at?: string | null
          email?: string | null
          employee_id?: string | null
          full_name?: string | null
          id?: string | null
          is_active?: boolean | null
          reports_to?: string | null
          title?: string | null
          work_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_reports_to_fkey"
            columns: ["reports_to"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_reports_to_fkey"
            columns: ["reports_to"]
            isOneToOne: false
            referencedRelation: "employees_client_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_reports_to_fkey"
            columns: ["reports_to"]
            isOneToOne: false
            referencedRelation: "employees_no_pay"
            referencedColumns: ["id"]
          },
        ]
      }
      eod_logs_client_view: {
        Row: {
          campaign_id: string | null
          date: string | null
          employee_id: string | null
          id: string | null
          metrics: Json | null
        }
        Insert: {
          campaign_id?: string | null
          date?: string | null
          employee_id?: string | null
          id?: string | null
          metrics?: Json | null
        }
        Update: {
          campaign_id?: string | null
          date?: string | null
          employee_id?: string | null
          id?: string | null
          metrics?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "eod_logs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eod_logs_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eod_logs_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_client_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eod_logs_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_no_pay"
            referencedColumns: ["id"]
          },
        ]
      }
      v_latest_validation_run: {
        Row: {
          diverge_count: number | null
          gate_passed: boolean | null
          id: string | null
          match_count: number | null
          match_rate_pct: number | null
          notes: string | null
          replay_eligible: number | null
          run_at: string | null
          skip_count: number | null
          total_archive_rows: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      _calc_pay_components: {
        Args: {
          e: Database["public"]["Tables"]["employees"]["Row"]
          r: Database["public"]["Tables"]["payroll_records"]["Row"]
        }
        Returns: Database["public"]["CompositeTypes"]["pay_components"]
        SetofOptions: {
          from: "*"
          to: "pay_components"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      _derive_inputs_for_employee_week: {
        Args: {
          p_employee_id: string
          p_week_end: string
          p_week_start: string
        }
        Returns: Json
      }
      _scheduled_days_for_shift: {
        Args: { p_shift_type: string }
        Returns: number[]
      }
      amend_eod_log: {
        Args: { p_log_id: string; p_metrics: Json; p_notes: string }
        Returns: undefined
      }
      app_config_value: { Args: { p_key: string }; Returns: string }
      auto_clockout_overdue: {
        Args: never
        Returns: {
          closed_id: string
          employee_id: string
          scheduled_end: string
        }[]
      }
      campaigns_clock_in_alert_times: {
        Args: never
        Returns: {
          campaign_id: string
          campaign_name: string
          earliest_shift_start: string
          escalation_fire_time: string
          grace_minutes: number
          initial_fire_time: string
          tz: string
        }[]
      }
      campaigns_digest_fire_times: {
        Args: never
        Returns: {
          campaign_id: string
          campaign_name: string
          digest_fire_time: string
          eod_digest_timezone: string
          eod_morning_bundle_time: string
        }[]
      }
      change_employee_role: {
        Args: { p_employee_id: string; p_new_title: string }
        Returns: Json
      }
      check_commission_flag: {
        Args: { p_amount: number; p_employee_id: string; p_exclude_id?: string }
        Returns: string
      }
      check_rehire: {
        Args: {
          p_curp?: string
          p_date_of_birth?: string
          p_full_name?: string
        }
        Returns: {
          curp: string
          date_of_birth: string
          employee_id: string
          employment_status: Database["public"]["Enums"]["employment_status"]
          full_name: string
          id: string
          match_type: string
          rehire_eligible: boolean
          terminated_at: string
          termination_notes: string
          termination_reason: string
        }[]
      }
      complete_agent_review: {
        Args: {
          p_attendance_score: number
          p_attitude_score: number
          p_decision?: Database["public"]["Enums"]["review_decision"]
          p_decision_reason?: string
          p_extension_days?: number
          p_kpi_score: number
          p_notes?: string
          p_review_id: string
        }
        Returns: undefined
      }
      confirm_review_termination: {
        Args: { p_confirm: boolean; p_hr_notes?: string; p_review_id: string }
        Returns: undefined
      }
      detect_holiday_no_shows: { Args: { p_date: string }; Returns: number }
      employees_without_login: {
        Args: { p_campaign_id: string }
        Returns: {
          employee_id: string
        }[]
      }
      eod_before_cutoff: {
        Args: { p_campaign_id: string; p_date: string }
        Returns: boolean
      }
      extend_agent_review: {
        Args: { p_employee_id: string; p_extra_days?: number }
        Returns: string
      }
      find_pending_escalation_emails: {
        Args: { p_send_date: string }
        Returns: {
          campaign_id: string
          campaign_name: string
          completed_weeks: number
          due_date: string
          employee_id: string
          employee_name: string
          prior_attendance_avg: number
          prior_attitude_avg: number
          prior_kpi_avg: number
          recipient_email: string
          recipient_id: string
          recipient_name: string
          recipient_title: string
          review_id: string
          tl_id: string
          tl_name: string
        }[]
      }
      find_pending_tl_review_emails: {
        Args: { p_send_date: string }
        Returns: {
          campaign_id: string
          campaign_name: string
          days_overdue: number
          due_date: string
          employee_id: string
          employee_name: string
          employee_work_name: string
          review_id: string
          tl_email: string
          tl_id: string
          tl_name: string
          week_number: number
        }[]
      }
      generate_weekly_invoices: {
        Args: { p_monday: string; p_sunday: string }
        Returns: {
          client_id: string
          invoice_id: string
          invoice_number: string
          line_count: number
          total_amount: number
        }[]
      }
      get_campaign_holiday_capacities: {
        Args: { p_campaign_id: string }
        Returns: {
          approved_count: number
          cap: number
          holiday_date: string
        }[]
      }
      get_client_holiday_summary: {
        Args: { p_campaign_id: string }
        Returns: {
          approved_off: number
          holiday_date: string
          holiday_name: string
          requires_coverage: boolean
          total_headcount: number
        }[]
      }
      get_vacation_balance: {
        Args: { p_employee_id: string; p_year?: number }
        Returns: {
          available_days: number
          entitlement_days: number
          next_entitlement_date: string
          used_days: number
          years_of_service: number
        }[]
      }
      hr_create_finalization_draft: {
        Args: { p_created_by: string; p_request_id: string }
        Returns: Json
      }
      hr_mark_finalization_signed: {
        Args: {
          p_finalization_id: string
          p_signed_scan_path: string
          p_type: string
        }
        Returns: Json
      }
      insert_policy_version: {
        Args: {
          p_change_notes: string
          p_file_name: string
          p_file_path: string
          p_file_size_bytes: number
          p_mime_type: string
          p_policy_id: string
          p_uploaded_by: string
        }
        Returns: {
          change_notes: string | null
          created_at: string
          file_name: string
          file_path: string
          file_size_bytes: number
          id: string
          mime_type: string
          policy_document_id: string
          published_at: string
          uploaded_by: string
          version_number: number
        }
        SetofOptions: {
          from: "*"
          to: "policy_document_versions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      is_client: { Args: never; Returns: boolean }
      is_leadership: { Args: never; Returns: boolean }
      is_owner: { Args: never; Returns: boolean }
      is_owner_or_admin: { Args: never; Returns: boolean }
      is_team_lead: { Args: never; Returns: boolean }
      mark_review_notification_sent: {
        Args: {
          p_notification_type: Database["public"]["Enums"]["review_notification_type"]
          p_recipient_email: string
          p_recipient_employee_id: string
          p_review_id: string
          p_send_date: string
        }
        Returns: string
      }
      my_client_campaign_ids: { Args: never; Returns: string[] }
      my_client_id: { Args: never; Returns: string }
      my_employee_id: { Args: never; Returns: string }
      my_manager_info: { Args: never; Returns: Json }
      my_org_id: { Args: never; Returns: string }
      my_team_member_ids: { Args: never; Returns: string[] }
      my_tl_campaign_ids: { Args: never; Returns: string[] }
      next_invoice_number: { Args: { p_client_id: string }; Returns: string }
      pay_calc_record: { Args: { p_record_id: string }; Returns: undefined }
      pay_derive_week: { Args: { p_week_id: string }; Returns: Json }
      pay_redrive_week: {
        Args: { p_confirm: boolean; p_week_id: string }
        Returns: Json
      }
      pay_unlock_period: {
        Args: { p_period_id: string; p_reason: string }
        Returns: Json
      }
      pay_validate_archive_all: { Args: { p_notes?: string }; Returns: string }
      request_holiday_off: {
        Args: {
          p_campaign_id: string
          p_holiday_date: string
          p_holiday_name: string
        }
        Returns: Database["public"]["Enums"]["holiday_request_status"]
      }
      request_vacation_off:
        | {
            Args: {
              p_campaign_id: string
              p_employee_id: string
              p_end_date: string
              p_notes?: string
              p_start_date: string
            }
            Returns: {
              campaign_id: string
              created_at: string
              days_requested: number
              denial_reason: string | null
              employee_id: string
              end_date: string
              hr_reviewed_at: string | null
              hr_reviewed_by: string | null
              id: string
              is_paid: boolean
              notes: string | null
              request_type: string
              start_date: string
              status: string
              tl_reviewed_at: string | null
              tl_reviewed_by: string | null
            }
            SetofOptions: {
              from: "*"
              to: "vacation_requests"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: {
              p_campaign_id: string
              p_employee_id: string
              p_end_date: string
              p_notes?: string
              p_request_type?: string
              p_start_date: string
            }
            Returns: {
              campaign_id: string
              created_at: string
              days_requested: number
              denial_reason: string | null
              employee_id: string
              end_date: string
              hr_reviewed_at: string | null
              hr_reviewed_by: string | null
              id: string
              is_paid: boolean
              notes: string | null
              request_type: string
              start_date: string
              status: string
              tl_reviewed_at: string | null
              tl_reviewed_by: string | null
            }
            SetofOptions: {
              from: "*"
              to: "vacation_requests"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      tl_employee_on_my_team: {
        Args: { p_employee_id: string }
        Returns: boolean
      }
      unaccent: { Args: { "": string }; Returns: string }
      update_employee_personal_info: {
        Args: {
          p_address?: string
          p_emergency_contact?: string
          p_employee_uuid: string
          p_personal_email?: string
          p_phone?: string
          p_work_name?: string
        }
        Returns: undefined
      }
      update_my_goal: {
        Args: {
          p_clear_goal?: boolean
          p_dismiss?: boolean
          p_goal_visible_to_tl?: boolean
          p_personal_goal?: string
        }
        Returns: undefined
      }
      weekly_invoice_preview: {
        Args: { p_monday: string; p_sunday: string }
        Returns: {
          campaign_id: string
          campaign_name: string
          client_id: string
          client_name: string
          client_prefix: string
          daily_bill_rate: number
          days_worked: number
          employee_code: string
          employee_id: string
          employee_name: string
          existing_invoice_id: string
          flat_amount: number
          is_flat_bill: boolean
        }[]
      }
    }
    Enums: {
      employment_status: "active" | "terminated" | "resigned" | "on_leave"
      holiday_request_status: "approved" | "pending_tl" | "denied" | "cancelled"
      review_decision: "keep" | "let_go" | "extend"
      review_notification_type: "tl_due" | "escalation_day29"
      review_termination_status: "pending" | "confirmed" | "denied"
    }
    CompositeTypes: {
      pay_components: {
        weekly_base: number | null
        kpi_bonus: number | null
        missed_deduction: number | null
        overtime_pay: number | null
        sunday_pay: number | null
        vacation_pay: number | null
        holiday_pay: number | null
        total_pay: number | null
        commission: number | null
      }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      employment_status: ["active", "terminated", "resigned", "on_leave"],
      holiday_request_status: ["approved", "pending_tl", "denied", "cancelled"],
      review_decision: ["keep", "let_go", "extend"],
      review_notification_type: ["tl_due", "escalation_day29"],
      review_termination_status: ["pending", "confirmed", "denied"],
    },
  },
} as const

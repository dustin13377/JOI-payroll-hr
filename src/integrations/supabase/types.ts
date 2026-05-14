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
          created_at: string | null
          eod_digest_cutoff_time: string | null
          eod_digest_timezone: string
          eod_morning_bundle_time: string | null
          eod_reply_to_email: string | null
          id: string
          name: string
          requires_holiday_coverage: boolean
          team_lead_id: string | null
        }
        Insert: {
          client_id: string
          created_at?: string | null
          eod_digest_cutoff_time?: string | null
          eod_digest_timezone?: string
          eod_morning_bundle_time?: string | null
          eod_reply_to_email?: string | null
          id?: string
          name: string
          requires_holiday_coverage?: boolean
          team_lead_id?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string | null
          eod_digest_cutoff_time?: string | null
          eod_digest_timezone?: string
          eod_morning_bundle_time?: string | null
          eod_reply_to_email?: string | null
          id?: string
          name?: string
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
      clients: {
        Row: {
          bill_to_address: string | null
          bill_to_name: string | null
          created_at: string | null
          id: string
          name: string
          prefix: string
          subtitle: string | null
        }
        Insert: {
          bill_to_address?: string | null
          bill_to_name?: string | null
          created_at?: string | null
          id?: string
          name: string
          prefix: string
          subtitle?: string | null
        }
        Update: {
          bill_to_address?: string | null
          bill_to_name?: string | null
          created_at?: string | null
          id?: string
          name?: string
          prefix?: string
          subtitle?: string | null
        }
        Relationships: []
      }
      company_holidays: {
        Row: {
          created_at: string
          created_by: string | null
          date: string
          id: string
          is_statutory: boolean
          name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          date: string
          id?: string
          is_statutory?: boolean
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          date?: string
          id?: string
          is_statutory?: boolean
          name?: string
        }
        Relationships: []
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
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
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
      employment_history: {
        Row: {
          id: string
          employee_id: string
          from_status: "active" | "terminated" | "resigned" | "on_leave" | null
          to_status: "active" | "terminated" | "resigned" | "on_leave"
          reason: string | null
          notes: string | null
          rehire_eligible: boolean | null
          last_worked_day: string | null
          changed_by: string | null
          changed_at: string
        }
        Insert: {
          id?: string
          employee_id: string
          from_status?: "active" | "terminated" | "resigned" | "on_leave" | null
          to_status: "active" | "terminated" | "resigned" | "on_leave"
          reason?: string | null
          notes?: string | null
          rehire_eligible?: boolean | null
          last_worked_day?: string | null
          changed_by?: string | null
          changed_at?: string
        }
        Update: {
          id?: string
          employee_id?: string
          from_status?: "active" | "terminated" | "resigned" | "on_leave" | null
          to_status?: "active" | "terminated" | "resigned" | "on_leave"
          reason?: string | null
          notes?: string | null
          rehire_eligible?: boolean | null
          last_worked_day?: string | null
          changed_by?: string | null
          changed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employment_history_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
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
          daily_discount_rate: number | null
          date_of_birth: string | null
          department_id: string | null
          email: string | null
          emergency_contact: string | null
          employee_id: string
          employment_status: "active" | "terminated" | "resigned" | "on_leave"
          full_name: string
          hire_date: string | null
          id: string
          is_active: boolean | null
          kpi_bonus_amount: number | null
          last_worked_day: string | null
          marital_status: string | null
          monthly_base_salary: number | null
          nss: string | null
          personal_email: string | null
          phone: string | null
          rehire_eligible: boolean | null
          reports_to: string | null
          rfc: string | null
          shift_type: string | null
          terminated_at: string | null
          terminated_by: string | null
          termination_notes: string | null
          termination_reason: string | null
          title: string
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
          daily_discount_rate?: number | null
          date_of_birth?: string | null
          department_id?: string | null
          email?: string | null
          emergency_contact?: string | null
          employee_id: string
          employment_status?: "active" | "terminated" | "resigned" | "on_leave"
          full_name: string
          hire_date?: string | null
          id?: string
          is_active?: boolean | null
          kpi_bonus_amount?: number | null
          last_worked_day?: string | null
          marital_status?: string | null
          monthly_base_salary?: number | null
          nss?: string | null
          personal_email?: string | null
          phone?: string | null
          rehire_eligible?: boolean | null
          reports_to?: string | null
          rfc?: string | null
          shift_type?: string | null
          terminated_at?: string | null
          terminated_by?: string | null
          termination_notes?: string | null
          termination_reason?: string | null
          title?: string
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
          daily_discount_rate?: number | null
          date_of_birth?: string | null
          department_id?: string | null
          email?: string | null
          emergency_contact?: string | null
          employee_id?: string
          employment_status?: "active" | "terminated" | "resigned" | "on_leave"
          full_name?: string
          hire_date?: string | null
          id?: string
          is_active?: boolean | null
          kpi_bonus_amount?: number | null
          last_worked_day?: string | null
          marital_status?: string | null
          monthly_base_salary?: number | null
          nss?: string | null
          personal_email?: string | null
          phone?: string | null
          rehire_eligible?: boolean | null
          reports_to?: string | null
          rfc?: string | null
          shift_type?: string | null
          terminated_at?: string | null
          terminated_by?: string | null
          termination_notes?: string | null
          termination_reason?: string | null
          title?: string
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
        ]
      }
      invoice_lines: {
        Row: {
          agent_name: string
          days_worked: number | null
          id: string
          invoice_id: string
          spiffs: number | null
          total: number | null
          total_price: number | null
          unit_price: number | null
        }
        Insert: {
          agent_name: string
          days_worked?: number | null
          id?: string
          invoice_id: string
          spiffs?: number | null
          total?: number | null
          total_price?: number | null
          unit_price?: number | null
        }
        Update: {
          agent_name?: string
          days_worked?: number | null
          id?: string
          invoice_id?: string
          spiffs?: number | null
          total?: number | null
          total_price?: number | null
          unit_price?: number | null
        }
        Relationships: [
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
          status: string
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
          status?: string
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
          status?: string
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
        }
        Insert: {
          date: string
          name: string
        }
        Update: {
          date?: string
          name?: string
        }
        Relationships: []
      }
      payroll_periods: {
        Row: {
          created_at: string | null
          end_date: string
          id: string
          period_type: string
          start_date: string
          status: string | null
        }
        Insert: {
          created_at?: string | null
          end_date: string
          id?: string
          period_type: string
          start_date: string
          status?: string | null
        }
        Update: {
          created_at?: string | null
          end_date?: string
          id?: string
          period_type?: string
          start_date?: string
          status?: string | null
        }
        Relationships: []
      }
      payroll_records: {
        Row: {
          additional_bonuses: number | null
          calculated_net_pay: number | null
          days_absent: number | null
          employee_id: string
          extra_days_count: number | null
          holiday_worked: boolean | null
          id: string
          kpi_achieved: boolean | null
          overrides_json: Json | null
          period_id: string
          sunday_premium_applied: boolean | null
          updated_at: string | null
        }
        Insert: {
          additional_bonuses?: number | null
          calculated_net_pay?: number | null
          days_absent?: number | null
          employee_id: string
          extra_days_count?: number | null
          holiday_worked?: boolean | null
          id?: string
          kpi_achieved?: boolean | null
          overrides_json?: Json | null
          period_id: string
          sunday_premium_applied?: boolean | null
          updated_at?: string | null
        }
        Update: {
          additional_bonuses?: number | null
          calculated_net_pay?: number | null
          days_absent?: number | null
          employee_id?: string
          extra_days_count?: number | null
          holiday_worked?: boolean | null
          id?: string
          kpi_achieved?: boolean | null
          overrides_json?: Json | null
          period_id?: string
          sunday_premium_applied?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
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
            foreignKeyName: "payroll_records_period_id_fkey"
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
          scoped_campaign_ids?: string[] | null
          sort_order?: number
          title?: string
          updated_at?: string
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
      shift_settings: {
        Row: {
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
      time_clock: {
        Row: {
          auto_clocked_out: boolean
          break1_end: string | null
          break1_start: string | null
          break2_end: string | null
          break2_start: string | null
          clock_in: string
          clock_out: string | null
          created_at: string | null
          date: string
          employee_id: string
          eod_completed: boolean
          id: string
          is_late: boolean | null
          late_minutes: number | null
          lunch_end: string | null
          lunch_start: string | null
          shift_end_expected: string | null
          total_hours: number | null
        }
        Insert: {
          auto_clocked_out?: boolean
          break1_end?: string | null
          break1_start?: string | null
          break2_end?: string | null
          break2_start?: string | null
          clock_in: string
          clock_out?: string | null
          created_at?: string | null
          date: string
          employee_id: string
          eod_completed?: boolean
          id?: string
          is_late?: boolean | null
          late_minutes?: number | null
          lunch_end?: string | null
          lunch_start?: string | null
          shift_end_expected?: string | null
          total_hours?: number | null
        }
        Update: {
          auto_clocked_out?: boolean
          break1_end?: string | null
          break1_start?: string | null
          break2_end?: string | null
          break2_start?: string | null
          clock_in?: string
          clock_out?: string | null
          created_at?: string | null
          date?: string
          employee_id?: string
          eod_completed?: boolean
          id?: string
          is_late?: boolean | null
          late_minutes?: number | null
          lunch_end?: string | null
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
      time_off_requests: {
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
      user_profiles: {
        Row: {
          client_id: string | null
          created_at: string | null
          employee_id: string | null
          id: string
          role: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string | null
          employee_id?: string | null
          id: string
          role: string
        }
        Update: {
          client_id?: string | null
          created_at?: string | null
          employee_id?: string | null
          id?: string
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
          notes: string | null
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
          notes?: string | null
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
          notes?: string | null
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
    }
    Functions: {
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
      check_rehire: {
        Args: {
          p_curp?: string | null
          p_full_name?: string | null
          p_date_of_birth?: string | null
        }
        Returns: {
          id: string
          employee_id: string
          full_name: string
          curp: string | null
          date_of_birth: string | null
          employment_status: "active" | "terminated" | "resigned" | "on_leave"
          termination_reason: string | null
          termination_notes: string | null
          rehire_eligible: boolean | null
          terminated_at: string | null
          match_type: string
        }[]
      }
      detect_holiday_no_shows: { Args: { p_date: string }; Returns: number }
      eod_before_cutoff: {
        Args: { p_campaign_id: string; p_date: string }
        Returns: boolean
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
      is_team_lead: { Args: never; Returns: boolean }
      my_client_campaign_ids: { Args: never; Returns: string[] }
      my_client_id: { Args: never; Returns: string }
      my_employee_id: { Args: never; Returns: string }
      my_team_member_ids: { Args: never; Returns: string[] }
      my_tl_campaign_ids: { Args: never; Returns: string[] }
      request_holiday_off: {
        Args: {
          p_campaign_id: string
          p_holiday_date: string
          p_holiday_name: string
        }
        Returns: Database["public"]["Enums"]["holiday_request_status"]
      }
      tl_employee_on_my_team: {
        Args: { p_employee_id: string }
        Returns: boolean
      }
    }
    Enums: {
      holiday_request_status: "approved" | "pending_tl" | "denied" | "cancelled"
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
      holiday_request_status: ["approved", "pending_tl", "denied", "cancelled"],
    },
  },
} as const

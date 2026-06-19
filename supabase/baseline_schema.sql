


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "unaccent" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."employment_status" AS ENUM (
    'active',
    'terminated',
    'resigned',
    'on_leave'
);


ALTER TYPE "public"."employment_status" OWNER TO "postgres";


CREATE TYPE "public"."holiday_request_status" AS ENUM (
    'approved',
    'pending_tl',
    'denied',
    'cancelled'
);


ALTER TYPE "public"."holiday_request_status" OWNER TO "postgres";


CREATE TYPE "public"."pay_components" AS (
	"weekly_base" numeric(12,2),
	"kpi_bonus" numeric(12,2),
	"missed_deduction" numeric(12,2),
	"overtime_pay" numeric(12,2),
	"sunday_pay" numeric(12,2),
	"vacation_pay" numeric(12,2),
	"holiday_pay" numeric(12,2),
	"total_pay" numeric(12,2),
	"commission" numeric
);


ALTER TYPE "public"."pay_components" OWNER TO "postgres";


CREATE TYPE "public"."review_decision" AS ENUM (
    'keep',
    'let_go',
    'extend'
);


ALTER TYPE "public"."review_decision" OWNER TO "postgres";


CREATE TYPE "public"."review_notification_type" AS ENUM (
    'tl_due',
    'escalation_day29'
);


ALTER TYPE "public"."review_notification_type" OWNER TO "postgres";


CREATE TYPE "public"."review_termination_status" AS ENUM (
    'pending',
    'confirmed',
    'denied'
);


ALTER TYPE "public"."review_termination_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."my_org_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT organization_id
  FROM public.user_profiles
  WHERE id = auth.uid()
$$;


ALTER FUNCTION "public"."my_org_id"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."employees" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "employee_id" "text" NOT NULL,
    "full_name" "text" NOT NULL,
    "shift_type" "text",
    "monthly_base_salary" numeric(12,2) DEFAULT 0,
    "daily_discount_rate" numeric(12,2) DEFAULT 0,
    "kpi_bonus_amount" numeric(12,2) DEFAULT 0,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "title" "text" DEFAULT 'agent'::"text" NOT NULL,
    "reports_to" "uuid",
    "campaign_id" "uuid",
    "email" "text",
    "curp" "text",
    "rfc" "text",
    "address" "text",
    "phone" "text",
    "bank_clabe" "text",
    "compliance_grace_until" "date",
    "work_name" "text",
    "personal_email" "text",
    "hire_date" "date",
    "emergency_contact" "text",
    "bank_name" "text",
    "date_of_birth" "date",
    "marital_status" "text",
    "nss" "text",
    "last_worked_day" "date",
    "department_id" "uuid",
    "organization_id" "uuid" DEFAULT "public"."my_org_id"() NOT NULL,
    "employment_status" "public"."employment_status" DEFAULT 'active'::"public"."employment_status" NOT NULL,
    "termination_reason" "text",
    "termination_notes" "text",
    "rehire_eligible" boolean,
    "terminated_at" timestamp with time zone,
    "terminated_by" "uuid",
    "is_system_user" boolean DEFAULT false NOT NULL,
    "invited_at" timestamp with time zone,
    "personal_goal" "text",
    "goal_set_at" timestamp with time zone,
    "goal_visible_to_tl" boolean DEFAULT false NOT NULL,
    "goal_prompt_dismissed" boolean DEFAULT false NOT NULL,
    "weekly_base_salary" numeric(12,2),
    "daily_salary" numeric(12,2),
    "overtime_day_pay" numeric(12,2) DEFAULT 0,
    "sunday_bonus_amount" numeric(12,2) DEFAULT 0,
    "vacation_premium_pct" numeric(5,4) DEFAULT 0.25,
    "vacation_days_entitled" integer DEFAULT 0,
    "daily_bill_rate" numeric DEFAULT 0,
    "flat_weekly_bill_amount" numeric DEFAULT 0,
    "flat_bill_client_id" "uuid",
    "cv_url" "text",
    "intro_recording_url" "text",
    "recruited_from_candidate_id" "uuid",
    CONSTRAINT "employees_shift_type_check" CHECK (("shift_type" = ANY (ARRAY['L-J'::"text", 'L-V'::"text", 'V-D'::"text", 'V-L'::"text"]))),
    CONSTRAINT "employees_system_user_title_check" CHECK ((("is_system_user" = false) OR ("title" = ANY (ARRAY['owner'::"text", 'admin'::"text"])))),
    CONSTRAINT "employees_title_check" CHECK (("title" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text", 'team_lead'::"text", 'agent'::"text"]))),
    CONSTRAINT "employees_vacation_premium_pct_check" CHECK (("vacation_premium_pct" >= 0.25))
);


ALTER TABLE "public"."employees" OWNER TO "postgres";


COMMENT ON COLUMN "public"."employees"."compliance_grace_until" IS 'Compliance grace deadline. NULL = no enforcement. Past date + missing docs = clock-in locked.';



COMMENT ON COLUMN "public"."employees"."work_name" IS 'Preferred name used at work (may differ from full_name).';



COMMENT ON COLUMN "public"."employees"."personal_email" IS 'Personal email (not the auth/login email).';



COMMENT ON COLUMN "public"."employees"."hire_date" IS 'Date the employee was hired.';



COMMENT ON COLUMN "public"."employees"."emergency_contact" IS 'Free-text: name + relationship + phone.';



COMMENT ON COLUMN "public"."employees"."bank_name" IS 'Name of the bank (complements bank_clabe).';



COMMENT ON COLUMN "public"."employees"."date_of_birth" IS 'Date of birth.';



COMMENT ON COLUMN "public"."employees"."marital_status" IS 'Free-text to cover edge cases (e.g. "Casado (Separado)").';



COMMENT ON COLUMN "public"."employees"."nss" IS 'Mexican IMSS number (10-11 digits).';



COMMENT ON COLUMN "public"."employees"."last_worked_day" IS 'Last day the employee worked (for terminations).';



COMMENT ON COLUMN "public"."employees"."department_id" IS 'FK to departments. Nullable now; NOT NULL in a follow-up after backfill.';



COMMENT ON COLUMN "public"."employees"."employment_status" IS 'Lifecycle: active / terminated / resigned / on_leave. Source of truth — is_active mirrors this.';



COMMENT ON COLUMN "public"."employees"."rehire_eligible" IS 'Do-Not-Rehire flag. TRUE = ok to rehire, FALSE = blocked, NULL = needs decision.';



COMMENT ON COLUMN "public"."employees"."is_system_user" IS 'TRUE = non-payroll login (partners, auditors, accountants). Hidden from employee/payroll/attendance views. Managed only on the Owner-only system-users page.';



COMMENT ON COLUMN "public"."employees"."invited_at" IS 'Timestamp of when the welcome/invite email was last sent to this employee. NULL = never invited. Used to avoid double-sending bulk invites and to support resends.';



COMMENT ON COLUMN "public"."employees"."personal_goal" IS 'Free-text: what the agent is working toward (house, trip, savings, etc.). Set by the agent themselves. Optional. Surface only at meaningful moments (first login, 30/60/90 day milestones), not daily.';



COMMENT ON COLUMN "public"."employees"."goal_visible_to_tl" IS 'Privacy toggle. Default false. When true, the TL/manager/admin can read the goal text (e.g. for 30-day review context). When false, only the agent + HR with elevated review can see it.';



COMMENT ON COLUMN "public"."employees"."goal_prompt_dismissed" IS 'Set to true once the agent either fills the goal or explicitly dismisses the first-login prompt. Prevents the dialog from re-firing every session.';



COMMENT ON COLUMN "public"."employees"."vacation_days_entitled" IS 'LFT Art. 76 vacation entitlement. Backfilled from hire_date but editable per-employee. Used vs. remaining is computed live from payroll_records.vacation_days.';



COMMENT ON COLUMN "public"."employees"."cv_url" IS 'Copied from recruiting_candidates.cv_url at hire time. PDF/DOCX upload URL.';



COMMENT ON COLUMN "public"."employees"."intro_recording_url" IS 'Copied from recruiting_candidates.presentation_url at hire time. Audio or video.';



COMMENT ON COLUMN "public"."employees"."recruited_from_candidate_id" IS 'Traceability — which candidate application produced this employee.';



CREATE TABLE IF NOT EXISTS "public"."payroll_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "week_id" "uuid" NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "campaign_id" "uuid",
    "organization_id" "uuid" DEFAULT "public"."my_org_id"() NOT NULL,
    "include_in_payroll" boolean DEFAULT true NOT NULL,
    "missed_days" integer DEFAULT 0 NOT NULL,
    "overtime_days" integer DEFAULT 0 NOT NULL,
    "sundays_worked" integer DEFAULT 0 NOT NULL,
    "vacation_days" integer DEFAULT 0 NOT NULL,
    "holiday_days" integer DEFAULT 0 NOT NULL,
    "kpi_achieved" boolean DEFAULT true NOT NULL,
    "extra_bonus" numeric(12,2) DEFAULT 0 NOT NULL,
    "partial_week_days" integer,
    "weekly_base" numeric(12,2),
    "kpi_bonus" numeric(12,2),
    "missed_deduction" numeric(12,2),
    "overtime_pay" numeric(12,2),
    "sunday_pay" numeric(12,2),
    "vacation_pay" numeric(12,2),
    "holiday_pay" numeric(12,2),
    "total_pay" numeric(12,2),
    "status" "text" DEFAULT 'UNPAID'::"text" NOT NULL,
    "memo" "text",
    "auto_derived" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "commission" numeric(10,2) DEFAULT 0 NOT NULL,
    "commission_flag" "text",
    "custom_deduction" numeric(12,2) DEFAULT 0,
    CONSTRAINT "payroll_records_status_check" CHECK (("status" = ANY (ARRAY['UNPAID'::"text", 'COMPLETE'::"text", 'PAID'::"text"])))
);


ALTER TABLE "public"."payroll_records" OWNER TO "postgres";


COMMENT ON COLUMN "public"."payroll_records"."commission" IS 'Manually entered variable pay: TL commissions, production bonuses, etc. Added to total_pay. Checked for anomalies on save.';



COMMENT ON COLUMN "public"."payroll_records"."commission_flag" IS 'Non-null when commission looks out of norm. Set automatically by trigger. Values: HIGH_VS_HISTORY, LOW_VS_HISTORY (normally earns but entered 0), HIGH_VS_BASE, FIRST_ENTRY_HIGH. Owner must review before locking to PAID.';



COMMENT ON COLUMN "public"."payroll_records"."custom_deduction" IS 'Manager-entered custom deduction in MXN, subtracted from total_pay. Use for partial-day misses, advance repayments, fines, etc. Distinct from missed_deduction which is auto-computed from missed_days × daily.';



CREATE OR REPLACE FUNCTION "public"."_calc_pay_components"("e" "public"."employees", "r" "public"."payroll_records") RETURNS "public"."pay_components"
    LANGUAGE "plpgsql" STABLE
    AS $$
DECLARE
  c     public.pay_components;
  daily numeric;
BEGIN
  -- Branch B: not included in payroll
  IF NOT r.include_in_payroll THEN
    c.weekly_base := 0; c.kpi_bonus := 0; c.missed_deduction := 0;
    c.overtime_pay := 0; c.sunday_pay := 0; c.vacation_pay := 0;
    c.holiday_pay := 0; c.commission := 0; c.total_pay := 0;
    RETURN c;
  END IF;

  -- Derive daily from monthly. Source of truth = employees.monthly_base_salary
  -- (LFT convention: monthly / 30). If unset, the agent has no rate
  -- configured and everything below returns 0.
  daily := COALESCE(e.monthly_base_salary, 0) / 30.0;

  -- Components common to both partial-week and full-week branches
  c.kpi_bonus    := CASE WHEN r.kpi_achieved THEN COALESCE(e.kpi_bonus_amount, 0) ELSE 0::numeric END;
  c.overtime_pay := 0;                                                              -- Phase 4b: OT handled via extra_bonus
  c.sunday_pay   := round((r.sundays_worked * daily * 0.25)::numeric, 2);           -- LFT Art. 79
  c.holiday_pay  := round((r.holiday_days   * daily * 2)::numeric,    2);           -- LFT Art. 75
  c.commission   := COALESCE(r.commission, 0);
  c.vacation_pay := 0;                                                              -- Phase 4b: deferred to new-entity work

  -- Branch C: partial week (mid-week hire)
  IF r.partial_week_days IS NOT NULL AND r.partial_week_days > 0 THEN
    c.weekly_base      := round((daily * r.partial_week_days)::numeric, 2);
    c.missed_deduction := 0;
    c.total_pay        := round(
      (c.weekly_base + c.kpi_bonus + c.overtime_pay
       + c.sunday_pay + c.holiday_pay
       + r.extra_bonus + c.commission
       - COALESCE(r.custom_deduction, 0))::numeric,
      2
    );
    RETURN c;
  END IF;

  -- Branch D: full week
  c.weekly_base      := round((COALESCE(e.monthly_base_salary, 0) / 4.0)::numeric, 2);
  c.missed_deduction := round((r.missed_days * daily)::numeric, 2);
  c.total_pay := round(
    (c.weekly_base - c.missed_deduction - COALESCE(r.custom_deduction, 0)
     + c.kpi_bonus + c.overtime_pay + c.sunday_pay
     + c.vacation_pay + c.holiday_pay
     + r.extra_bonus + c.commission)::numeric,
    2
  );
  RETURN c;
END;
$$;


ALTER FUNCTION "public"."_calc_pay_components"("e" "public"."employees", "r" "public"."payroll_records") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."_calc_pay_components"("e" "public"."employees", "r" "public"."payroll_records") IS 'Pay formula matching Joe''s calcAgentPay_. sunday_pay   = sundays_worked × (monthly_base/30) × 0.25. daily_salary = daily_discount_rate = monthly_base_salary / 30. weekly_base  = monthly_base_salary / 4. commission   = manually entered variable pay (TL bonus, production commission). Source of truth: monthly_base_salary on employees table.';



CREATE OR REPLACE FUNCTION "public"."_derive_inputs_for_employee_week"("p_employee_id" "uuid", "p_week_start" "date", "p_week_end" "date") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_emp           employees%ROWTYPE;
  v_dow           int[];
  v_eff_start     date;
  v_eff_end       date;
  v_sched_days    int     := 0;
  v_missed_days   int     := 0;
  v_overtime_days int     := 0;
  v_sundays       int     := 0;
  v_holidays      int     := 0;
  v_partial       int;
  v_notes         text[]  := '{}';
  v_d             date;
BEGIN
  SELECT * INTO v_emp FROM employees WHERE id = p_employee_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'EMPLOYEE_NOT_FOUND');
  END IF;

  v_dow := _scheduled_days_for_shift(v_emp.shift_type);
  IF array_length(v_dow, 1) IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'NO_SHIFT_TYPE', 'shift_type', v_emp.shift_type,
      'scheduled_days', 0, 'missed_days', 0, 'overtime_days', 0,
      'sundays_worked', 0, 'holiday_days', 0, 'partial_week_days', NULL,
      'kpi_achieved', NULL, 'notes', '["no_shift_type"]'::jsonb
    );
  END IF;

  v_eff_start := GREATEST(p_week_start, COALESCE(v_emp.hire_date, p_week_start));
  v_eff_end   := LEAST  (p_week_end,   COALESCE(v_emp.last_worked_day, p_week_end));

  v_d := v_eff_start;
  WHILE v_d <= v_eff_end LOOP
    IF extract(dow from v_d)::int = ANY(v_dow) THEN
      v_sched_days := v_sched_days + 1;
    END IF;
    v_d := v_d + 1;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM time_clock
    WHERE employee_id = p_employee_id
      AND date BETWEEN p_week_start AND p_week_end
      AND clock_in IS NOT NULL
  ) THEN
    RETURN jsonb_build_object(
      'status', 'NO_DATA', 'scheduled_days', v_sched_days,
      'missed_days', 0, 'overtime_days', 0, 'sundays_worked', 0,
      'holiday_days', 0, 'partial_week_days', NULL,
      'kpi_achieved', NULL, 'notes', '["no_clock_data"]'::jsonb
    );
  END IF;

  -- ── Missed days ─────────────────────────────────────────────────────────
  -- Excludes:
  --   1. days the agent actually punched
  --   2. LFT statutory holidays (everyone)
  --   3. Client holidays for the campaign the agent was assigned to ON THAT
  --      DAY (historical lookup via employee_campaign_assignments). Handles
  --      mid-week campaign moves so the right client's holidays apply.
  SELECT COUNT(*) INTO v_missed_days
  FROM (
    SELECT generate_series(v_eff_start, p_week_end, '1 day'::interval)::date AS d
  ) g
  WHERE extract(dow from g.d)::int = ANY(v_dow)
    AND g.d NOT IN (
      SELECT date FROM time_clock
      WHERE employee_id = p_employee_id
        AND date BETWEEN p_week_start AND p_week_end
        AND clock_in IS NOT NULL
    )
    AND g.d NOT IN (SELECT date FROM mexican_holidays)
    AND NOT EXISTS (
      SELECT 1
      FROM employee_campaign_assignments eca
      JOIN campaigns c       ON c.id = eca.campaign_id
      JOIN client_holidays ch ON ch.client_id = c.client_id AND ch.date = g.d
      WHERE eca.employee_id = p_employee_id
        AND eca.start_date <= g.d
        AND (eca.end_date IS NULL OR eca.end_date >= g.d)
    );

  SELECT COUNT(*) INTO v_overtime_days
  FROM time_clock
  WHERE employee_id = p_employee_id
    AND date BETWEEN p_week_start AND p_week_end
    AND clock_in  IS NOT NULL
    AND clock_out IS NOT NULL
    AND (
      extract(epoch FROM (
        (clock_out - clock_in)
        - COALESCE(lunch_end   - lunch_start,  '0 seconds'::interval)
        - COALESCE(break1_end  - break1_start, '0 seconds'::interval)
        - COALESCE(break2_end  - break2_start, '0 seconds'::interval)
      )) / 3600.0
    ) > 9;

  SELECT COUNT(*) INTO v_sundays
  FROM time_clock
  WHERE employee_id = p_employee_id
    AND date BETWEEN p_week_start AND p_week_end
    AND clock_in IS NOT NULL
    AND extract(dow from date) = 0;

  SELECT COUNT(*) INTO v_holidays
  FROM time_clock tc
  JOIN mexican_holidays mh
    ON mh.date = tc.date AND mh.pays_premium = true
  WHERE tc.employee_id = p_employee_id
    AND tc.date BETWEEN p_week_start AND p_week_end
    AND tc.clock_in IS NOT NULL;

  v_partial := NULL;
  IF v_emp.hire_date IS NOT NULL
     AND v_emp.hire_date > p_week_start
     AND v_emp.hire_date <= p_week_end
  THEN
    v_partial := 0;
    v_d := v_emp.hire_date;
    WHILE v_d <= p_week_end LOOP
      IF extract(dow from v_d)::int = ANY(v_dow) THEN
        v_partial := v_partial + 1;
      END IF;
      v_d := v_d + 1;
    END LOOP;
    v_notes := v_notes || ARRAY['mid_week_hire'];
  END IF;

  IF v_emp.last_worked_day IS NOT NULL
     AND v_emp.last_worked_day >= p_week_start
     AND v_emp.last_worked_day <  p_week_end
  THEN
    v_notes := v_notes || ARRAY['mid_week_termination'];
  END IF;

  RETURN jsonb_build_object(
    'status',            'DERIVED',
    'scheduled_days',    v_sched_days,
    'missed_days',       v_missed_days,
    'overtime_days',     v_overtime_days,
    'sundays_worked',    v_sundays,
    'holiday_days',      v_holidays,
    'partial_week_days', v_partial,
    'kpi_achieved',      NULL,
    'notes',             to_jsonb(v_notes)
  );
END;
$$;


ALTER FUNCTION "public"."_derive_inputs_for_employee_week"("p_employee_id" "uuid", "p_week_start" "date", "p_week_end" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_scheduled_days_for_shift"("p_shift_type" "text") RETURNS integer[]
    LANGUAGE "sql" IMMUTABLE STRICT
    SET "search_path" TO 'public'
    AS $$
  SELECT CASE p_shift_type
    WHEN 'L-J' THEN ARRAY[1,2,3,4]
    WHEN 'L-V' THEN ARRAY[1,2,3,4,5]
    WHEN 'V-D' THEN ARRAY[5,6,0]
    WHEN 'V-L' THEN ARRAY[5,6,0,1]
    ELSE ARRAY[]::int[]
  END;
$$;


ALTER FUNCTION "public"."_scheduled_days_for_shift"("p_shift_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."agent_coaching_notes_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."agent_coaching_notes_set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."amend_eod_log"("p_log_id" "uuid", "p_metrics" "jsonb", "p_notes" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  UPDATE public.eod_logs
  SET metrics = p_metrics,
      notes = p_notes,
      last_edited_at = now(),
      edit_count = edit_count + 1
  WHERE id = p_log_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'EOD log not found or not editable';
  END IF;
END;
$$;


ALTER FUNCTION "public"."amend_eod_log"("p_log_id" "uuid", "p_metrics" "jsonb", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."app_config_value"("p_key" "text") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT value FROM public.app_config WHERE key = p_key;
$$;


ALTER FUNCTION "public"."app_config_value"("p_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assign_employee_id"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_prefix text;
BEGIN
  IF NEW.employee_id IS NULL OR NEW.employee_id = '' THEN
    SELECT employee_id_prefix INTO v_prefix
    FROM public.organizations
    WHERE id = NEW.organization_id;

    NEW.employee_id :=
      COALESCE(v_prefix, 'EMP') || '-' ||
      lpad(nextval('public.employee_id_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."assign_employee_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auto_clockout_overdue"() RETURNS TABLE("closed_id" "uuid", "employee_id" "uuid", "scheduled_end" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  grace_min int := 30;
BEGIN
  RETURN QUERY
  WITH to_close AS (
    SELECT
      tc.id AS tc_id,
      tc.employee_id AS tc_eid,
      tc.clock_in,
      tc.shift_end_expected,
      COALESCE(EXTRACT(EPOCH FROM (tc.lunch_end - tc.lunch_start)) / 60.0, 0) AS lunch_minutes
    FROM public.time_clock tc
    WHERE tc.clock_out IS NULL
      AND tc.shift_end_expected IS NOT NULL
      AND tc.shift_end_expected < (now() - (grace_min || ' minutes')::interval)
  ),
  updated AS (
    UPDATE public.time_clock tc
       SET clock_out = c.shift_end_expected,
           auto_clocked_out = true,
           total_hours = ROUND(
             (EXTRACT(EPOCH FROM (c.shift_end_expected - c.clock_in)) / 3600.0
              - (c.lunch_minutes / 60.0))::numeric,
             2
           )
      FROM to_close c
     WHERE tc.id = c.tc_id
    RETURNING tc.id AS upd_id, tc.employee_id AS upd_eid, tc.shift_end_expected AS upd_end
  )
  SELECT upd_id, upd_eid, upd_end FROM updated;
END;
$$;


ALTER FUNCTION "public"."auto_clockout_overdue"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."auto_clockout_overdue"() IS 'Closes open time_clock entries whose shift_end_expected passed > 30 min ago. Sets auto_clocked_out=true. Returns closed row info for downstream notifiers. Renamed inner aliases 2026-05-28 to avoid Postgres 17 ambiguous-column error.';



CREATE OR REPLACE FUNCTION "public"."campaigns_digest_fire_times"() RETURNS TABLE("campaign_id" "uuid", "campaign_name" "text", "eod_digest_timezone" "text", "eod_morning_bundle_time" time without time zone, "digest_fire_time" time without time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT
    c.id, c.name,
    COALESCE(c.eod_digest_timezone, 'America/Denver'),
    c.eod_morning_bundle_time,
    (MAX(ss.end_time + make_interval(mins => COALESCE(ss.grace_minutes, 10)))
     + interval '5 minutes')::time
  FROM campaigns c
  JOIN shift_settings ss ON ss.campaign_id = c.id
  WHERE c.eod_digest_enabled = true
    AND c.is_active = true
    AND EXTRACT(DOW FROM (now() AT TIME ZONE COALESCE(c.eod_digest_timezone, 'America/Denver')))::int
        = ANY(ss.days_of_week)
  GROUP BY c.id, c.name, c.eod_digest_timezone, c.eod_morning_bundle_time;
$$;


ALTER FUNCTION "public"."campaigns_digest_fire_times"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cascade_campaign_tl_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF new.team_lead_id IS DISTINCT FROM old.team_lead_id THEN
    UPDATE public.employees
    SET reports_to = new.team_lead_id
    WHERE campaign_id = new.id
      AND (new.team_lead_id IS NULL OR id != new.team_lead_id);
  END IF;
  RETURN new;
END;
$$;


ALTER FUNCTION "public"."cascade_campaign_tl_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."change_employee_role"("p_employee_id" "uuid", "p_new_title" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  caller_role text;
  caller_org uuid;
  target_org uuid;
  target_auth_uid uuid;
  old_title text;
BEGIN
  -- Whitelist allowed titles
  IF p_new_title NOT IN ('agent','team_lead','manager','admin','owner') THEN
    RAISE EXCEPTION 'Invalid title: %', p_new_title USING ERRCODE = '22023';
  END IF;

  -- Caller must be leadership in some org
  SELECT role, organization_id INTO caller_role, caller_org
  FROM public.user_profiles
  WHERE id = auth.uid();

  IF caller_role IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF caller_role NOT IN ('owner','admin','manager') THEN
    RAISE EXCEPTION 'Forbidden: only owner/admin/manager can change roles' USING ERRCODE = '42501';
  END IF;

  -- Look up target
  SELECT organization_id, title INTO target_org, old_title
  FROM public.employees
  WHERE id = p_employee_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employee not found' USING ERRCODE = '02000';
  END IF;
  IF target_org <> caller_org THEN
    RAISE EXCEPTION 'Cross-org role change blocked' USING ERRCODE = '42501';
  END IF;

  -- Only owner can change someone to 'owner'
  IF p_new_title = 'owner' AND caller_role <> 'owner' THEN
    RAISE EXCEPTION 'Only the owner can promote someone to owner' USING ERRCODE = '42501';
  END IF;

  -- Step 1: update employees.title (source of truth)
  UPDATE public.employees
  SET title = p_new_title
  WHERE id = p_employee_id;

  -- Step 2: nudge user_profiles so sync_user_profile_role trigger pulls the new role.
  -- We touch a non-role column (employee_id = employee_id) to fire BEFORE UPDATE
  -- without tripping the guard_user_profile_role check.
  SELECT id INTO target_auth_uid
  FROM public.user_profiles
  WHERE employee_id = p_employee_id;

  IF target_auth_uid IS NOT NULL THEN
    UPDATE public.user_profiles
    SET employee_id = employee_id
    WHERE id = target_auth_uid;
  END IF;

  RETURN jsonb_build_object(
    'employee_id', p_employee_id,
    'old_title', old_title,
    'new_title', p_new_title,
    'auth_user_synced', target_auth_uid IS NOT NULL
  );
END;
$$;


ALTER FUNCTION "public"."change_employee_role"("p_employee_id" "uuid", "p_new_title" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."change_employee_role"("p_employee_id" "uuid", "p_new_title" "text") IS 'Atomic role change: UPDATE employees.title + nudge user_profiles so sync trigger picks up new role. Caller must be owner/admin/manager in same org.';



CREATE OR REPLACE FUNCTION "public"."check_commission_flag"("p_employee_id" "uuid", "p_amount" numeric, "p_exclude_id" "uuid" DEFAULT NULL::"uuid") RETURNS "text"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  v_avg       numeric;
  v_stddev    numeric;
  v_count     int;
  v_weekly    numeric;
  v_msg       text := NULL;
BEGIN
  -- Fetch employee weekly base for relative threshold
  SELECT weekly_base_salary INTO v_weekly
  FROM public.employees
  WHERE id = p_employee_id;

  -- Historical stats: last 12 completed weeks, same employee
  SELECT
    COUNT(*),
    AVG(commission),
    STDDEV(commission)
  INTO v_count, v_avg, v_stddev
  FROM public.payroll_records
  WHERE employee_id  = p_employee_id
    AND commission   IS NOT NULL
    AND status       != 'VOID'
    AND (p_exclude_id IS NULL OR id != p_exclude_id)
  ORDER BY created_at DESC
  LIMIT 12;

  -- No history yet — flag large first entries
  IF v_count = 0 OR v_avg IS NULL THEN
    IF p_amount > 0 AND v_weekly IS NOT NULL AND p_amount > v_weekly * 0.5 THEN
      RETURN format('FIRST_ENTRY_HIGH: $%s commission with no prior history (>50%% of weekly base $%s)',
                    p_amount, v_weekly);
    END IF;
    RETURN NULL;
  END IF;

  -- Normally earns commission but entered 0
  IF v_avg > 100 AND p_amount = 0 THEN
    RETURN format('LOW_VS_HISTORY: employee normally earns commission (avg $%s over %s weeks) — entered $0',
                  round(v_avg, 0), v_count);
  END IF;

  -- More than 3× historical average (and avg > 0)
  IF v_avg > 0 AND p_amount > v_avg * 3 THEN
    RETURN format('HIGH_VS_HISTORY: $%s is %.1f× above %s-week average ($%s)',
                  p_amount,
                  round(p_amount / v_avg, 1),
                  v_count,
                  round(v_avg, 0));
  END IF;

  -- Absolute ceiling: more than 2× weekly base salary
  IF v_weekly IS NOT NULL AND p_amount > v_weekly * 2 THEN
    RETURN format('HIGH_VS_BASE: $%s commission exceeds 2× weekly base ($%s)',
                  p_amount, v_weekly);
  END IF;

  -- Less than 30% of normal when employee always earns commission
  -- (catches cases where someone accidentally enters a too-low number)
  IF v_avg > 100 AND v_stddev IS NOT NULL
     AND p_amount > 0 AND p_amount < v_avg * 0.3 THEN
    RETURN format('LOW_VS_HISTORY: $%s is unusually low vs %s-week average ($%s)',
                  p_amount, v_count, round(v_avg, 0));
  END IF;

  RETURN NULL;
END;
$_$;


ALTER FUNCTION "public"."check_commission_flag"("p_employee_id" "uuid", "p_amount" numeric, "p_exclude_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."check_commission_flag"("p_employee_id" "uuid", "p_amount" numeric, "p_exclude_id" "uuid") IS 'Returns a flag message when commission looks out of norm vs employee history. NULL = no flag (looks normal). Called automatically by the payroll recalc trigger. Flags: HIGH_VS_HISTORY (>3× avg), LOW_VS_HISTORY (0 when normally earns, or <30% avg), HIGH_VS_BASE (>2× weekly base), FIRST_ENTRY_HIGH (large first-time entry).';



CREATE OR REPLACE FUNCTION "public"."check_rehire"("p_curp" "text" DEFAULT NULL::"text", "p_full_name" "text" DEFAULT NULL::"text", "p_date_of_birth" "date" DEFAULT NULL::"date") RETURNS TABLE("id" "uuid", "employee_id" "text", "full_name" "text", "curp" "text", "date_of_birth" "date", "employment_status" "public"."employment_status", "termination_reason" "text", "termination_notes" "text", "rehire_eligible" boolean, "terminated_at" timestamp with time zone, "match_type" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT e.id, e.employee_id, e.full_name, e.curp, e.date_of_birth,
         e.employment_status, e.termination_reason, e.termination_notes,
         e.rehire_eligible, e.terminated_at, 'curp'::text AS match_type
    FROM public.employees e
   WHERE public.is_leadership()
     AND e.organization_id = public.my_org_id()
     AND e.employment_status <> 'active'
     AND p_curp IS NOT NULL
     AND e.curp IS NOT NULL
     AND upper(trim(e.curp)) = upper(trim(p_curp))

  UNION

  SELECT e.id, e.employee_id, e.full_name, e.curp, e.date_of_birth,
         e.employment_status, e.termination_reason, e.termination_notes,
         e.rehire_eligible, e.terminated_at, 'name_dob'::text AS match_type
    FROM public.employees e
   WHERE public.is_leadership()
     AND e.organization_id = public.my_org_id()
     AND e.employment_status <> 'active'
     AND p_full_name IS NOT NULL
     AND p_date_of_birth IS NOT NULL
     AND lower(trim(e.full_name)) = lower(trim(p_full_name))
     AND e.date_of_birth = p_date_of_birth
$$;


ALTER FUNCTION "public"."check_rehire"("p_curp" "text", "p_full_name" "text", "p_date_of_birth" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."clear_compliance_dedupe_on_grace_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  DELETE FROM public.compliance_notifications_sent
   WHERE employee_id = NEW.id
     AND notification_type IN ('reminder_7d', 'reminder_3d', 'reminder_1d', 'lock');

  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."clear_compliance_dedupe_on_grace_change"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."clear_compliance_dedupe_on_grace_change"() IS 'AFTER UPDATE trigger on employees. Clears grace-driven dedupe rows (reminder_7d, reminder_3d, reminder_1d, lock) in compliance_notifications_sent when compliance_grace_until changes. Does NOT clear rejection rows. See docs/hr-roadmap.md § old-B-05.';



CREATE OR REPLACE FUNCTION "public"."clear_compliance_dedupe_on_rerejection"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  DELETE FROM public.compliance_notifications_sent
   WHERE related_document_id = NEW.id;

  RETURN NULL; -- AFTER trigger, return value ignored
END;
$$;


ALTER FUNCTION "public"."clear_compliance_dedupe_on_rerejection"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."clear_compliance_dedupe_on_rerejection"() IS 'AFTER UPDATE trigger on employee_documents. Clears the rejection dedupe row in compliance_notifications_sent when a document status transitions away from rejected (e.g. agent re-uploads → pending_review). See docs/hr-roadmap.md § A3b.';



CREATE OR REPLACE FUNCTION "public"."complete_agent_review"("p_review_id" "uuid", "p_attendance_score" smallint, "p_kpi_score" smallint, "p_attitude_score" smallint, "p_notes" "text" DEFAULT NULL::"text", "p_decision" "public"."review_decision" DEFAULT NULL::"public"."review_decision", "p_decision_reason" "text" DEFAULT NULL::"text", "p_extension_days" smallint DEFAULT NULL::smallint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_employee_id uuid;
  v_week        int;
  v_reviewer    uuid;
BEGIN
  SELECT employee_id, week_number INTO v_employee_id, v_week
    FROM public.agent_reviews WHERE id = p_review_id;
  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'review not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT (public.is_leadership() OR public.tl_employee_on_my_team(v_employee_id)) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  IF p_decision IS NOT NULL AND v_week < 4 THEN
    RAISE EXCEPTION 'decision only allowed on final review (week 4+)' USING ERRCODE = 'P0001';
  END IF;
  IF p_decision = 'extend' AND (p_extension_days IS NULL OR p_extension_days < 1 OR p_extension_days > 60) THEN
    RAISE EXCEPTION 'extension requires p_extension_days between 1 and 60' USING ERRCODE = 'P0001';
  END IF;
  v_reviewer := public.my_employee_id();
  UPDATE public.agent_reviews
     SET attendance_score   = p_attendance_score,
         kpi_score          = p_kpi_score,
         attitude_score     = p_attitude_score,
         notes              = p_notes,
         decision           = p_decision,
         decision_reason    = p_decision_reason,
         extension_days     = CASE WHEN p_decision = 'extend' THEN p_extension_days END,
         termination_status = CASE WHEN p_decision = 'let_go' THEN 'pending'::public.review_termination_status END,
         reviewed_by        = v_reviewer,
         completed_at       = now()
   WHERE id = p_review_id;
  IF p_decision = 'extend' THEN
    PERFORM public.extend_agent_review(v_employee_id, p_extension_days::int);
  END IF;
END;
$$;


ALTER FUNCTION "public"."complete_agent_review"("p_review_id" "uuid", "p_attendance_score" smallint, "p_kpi_score" smallint, "p_attitude_score" smallint, "p_notes" "text", "p_decision" "public"."review_decision", "p_decision_reason" "text", "p_extension_days" smallint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."confirm_review_termination"("p_review_id" "uuid", "p_confirm" boolean, "p_hr_notes" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_employee_id  uuid;
  v_decision     public.review_decision;
  v_status       public.review_termination_status;
  v_reason       text;
  v_review_notes text;
BEGIN
  IF NOT public.is_leadership() THEN
    RAISE EXCEPTION 'only HR / leadership can confirm terminations' USING ERRCODE = '42501';
  END IF;
  SELECT employee_id, decision, termination_status, decision_reason, notes
    INTO v_employee_id, v_decision, v_status, v_reason, v_review_notes
    FROM public.agent_reviews WHERE id = p_review_id;
  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'review not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_decision <> 'let_go' THEN
    RAISE EXCEPTION 'review decision is not let_go - nothing to confirm' USING ERRCODE = 'P0001';
  END IF;
  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'termination already %', v_status USING ERRCODE = 'P0003';
  END IF;
  UPDATE public.agent_reviews
     SET termination_status = CASE WHEN p_confirm THEN 'confirmed'::public.review_termination_status
                                                   ELSE 'denied'::public.review_termination_status END,
         hr_decided_by      = public.my_employee_id(),
         hr_decided_at      = now(),
         hr_decision_notes  = p_hr_notes
   WHERE id = p_review_id;
  IF p_confirm THEN
    UPDATE public.employees
       SET employment_status  = 'terminated',
           termination_reason = 'failed_30_day_review',
           termination_notes  = COALESCE(p_hr_notes, v_reason, v_review_notes)
     WHERE id = v_employee_id;
  END IF;
END;
$$;


ALTER FUNCTION "public"."confirm_review_termination"("p_review_id" "uuid", "p_confirm" boolean, "p_hr_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."detect_holiday_no_shows"("p_date" "date") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_is_holiday boolean;
  v_inserted   int := 0;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM company_holidays
    WHERE date = p_date AND is_statutory = true
  ) INTO v_is_holiday;

  IF NOT v_is_holiday THEN
    RETURN 0;
  END IF;

  WITH noshow_agents AS (
    SELECT e.id AS employee_id
    FROM employees e
    JOIN campaigns c ON c.id = e.campaign_id
    WHERE e.is_active = true
      AND c.requires_holiday_coverage = true
      AND NOT EXISTS (
        SELECT 1 FROM holiday_requests hr
        WHERE hr.employee_id = e.id
          AND hr.campaign_id = e.campaign_id
          AND hr.holiday_date = p_date
          AND hr.status = 'approved'
      )
      AND NOT EXISTS (
        SELECT 1 FROM time_clock tc
        WHERE tc.employee_id = e.id
          AND tc.clock_in::date = p_date
      )
  )
  INSERT INTO attendance_incidents
    (employee_id, date, incident_type, notes, source, created_by)
  SELECT
    employee_id,
    p_date,
    'no_call_no_show',
    'Auto-detected: agent did not clock in on a statutory holiday and had no approved time-off request.',
    'auto_detection',
    NULL
  FROM noshow_agents
  ON CONFLICT (employee_id, date) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;


ALTER FUNCTION "public"."detect_holiday_no_shows"("p_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."employees_without_login"("p_campaign_id" "uuid") RETURNS TABLE("employee_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_caller_role text;
  v_caller_emp uuid;
  v_authorized boolean := false;
BEGIN
  SELECT role, user_profiles.employee_id
    INTO v_caller_role, v_caller_emp
  FROM public.user_profiles
  WHERE id = auth.uid();

  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'No user_profile for caller';
  END IF;

  IF v_caller_role IN ('owner', 'admin', 'manager') THEN
    v_authorized := true;
  ELSIF v_caller_role = 'team_lead' THEN
    IF EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = v_caller_emp AND e.campaign_id = p_campaign_id
    ) OR EXISTS (
      SELECT 1 FROM public.team_lead_campaigns tlc
      WHERE tlc.team_lead_id = v_caller_emp AND tlc.campaign_id = p_campaign_id
    ) THEN
      v_authorized := true;
    END IF;
  END IF;

  IF NOT v_authorized THEN
    RAISE EXCEPTION 'Not authorized for this campaign';
  END IF;

  RETURN QUERY
    SELECT e.id
    FROM public.employees e
    LEFT JOIN public.user_profiles up ON up.employee_id = e.id
    WHERE e.campaign_id = p_campaign_id
      AND e.is_active = true
      AND up.id IS NULL;
END;
$$;


ALTER FUNCTION "public"."employees_without_login"("p_campaign_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_clock_in_compliance"() RETURNS "trigger"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_grace date;
  v_missing_count int;
BEGIN
  -- 1. Fetch the employee's compliance grace deadline
  SELECT compliance_grace_until
    INTO v_grace
    FROM public.employees
   WHERE id = NEW.employee_id;

  -- 2. If NULL or still in grace period → allow
  IF v_grace IS NULL OR v_grace >= CURRENT_DATE THEN
    RETURN NEW;
  END IF;

  -- 3. Past grace — check for any active required doc type that is NOT approved
  SELECT count(*)
    INTO v_missing_count
    FROM public.required_document_types rdt
   WHERE rdt.is_active = true
     AND NOT EXISTS (
       SELECT 1
         FROM public.employee_documents ed
        WHERE ed.employee_id = NEW.employee_id
          AND ed.document_type_id = rdt.id
          AND ed.status = 'approved'
     );

  IF v_missing_count > 0 THEN
    RAISE EXCEPTION
      'Clock-in blocked: employee % is past compliance grace period and has unapproved or missing required documents.',
      NEW.employee_id
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_clock_in_compliance"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."enforce_clock_in_compliance"() IS 'BEFORE INSERT trigger on time_clock. Rejects clock-in for employees past compliance_grace_until with unapproved/missing required documents. See docs/hr-roadmap.md § A3a.';



CREATE OR REPLACE FUNCTION "public"."eod_before_cutoff"("p_campaign_id" "uuid", "p_date" "date") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT
    p_date = (now() AT TIME ZONE COALESCE(c.eod_digest_timezone, 'America/Denver'))::date
    AND (now() AT TIME ZONE COALESCE(c.eod_digest_timezone, 'America/Denver'))::time
        < c.eod_digest_cutoff_time
  FROM public.campaigns c
  WHERE c.id = p_campaign_id
    AND c.eod_digest_cutoff_time IS NOT NULL;
$$;


ALTER FUNCTION "public"."eod_before_cutoff"("p_campaign_id" "uuid", "p_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."extend_agent_review"("p_employee_id" "uuid", "p_extra_days" integer DEFAULT 15) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_campaign_id uuid;
  v_max_week    int;
  v_last_due    date;
  v_new_id      uuid;
BEGIN
  IF p_extra_days <= 0 OR p_extra_days > 60 THEN
    RAISE EXCEPTION 'p_extra_days must be 1-60' USING ERRCODE = 'P0001';
  END IF;
  IF NOT (public.is_leadership() OR public.tl_employee_on_my_team(p_employee_id)) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  SELECT MAX(week_number), MAX(due_date)
    INTO v_max_week, v_last_due
    FROM public.agent_reviews
   WHERE employee_id = p_employee_id;
  IF v_max_week IS NULL THEN
    RAISE EXCEPTION 'no existing reviews to extend' USING ERRCODE = 'P0002';
  END IF;
  IF v_max_week >= 8 THEN
    RAISE EXCEPTION 'already extended the maximum number of times' USING ERRCODE = 'P0003';
  END IF;
  SELECT campaign_id INTO v_campaign_id FROM public.employees WHERE id = p_employee_id;
  INSERT INTO public.agent_reviews (employee_id, campaign_id, week_number, due_date)
  VALUES (p_employee_id, v_campaign_id, v_max_week + 1, v_last_due + p_extra_days)
  RETURNING id INTO v_new_id;
  RETURN v_new_id;
END;
$$;


ALTER FUNCTION "public"."extend_agent_review"("p_employee_id" "uuid", "p_extra_days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."find_pending_escalation_emails"("p_send_date" "date") RETURNS TABLE("review_id" "uuid", "employee_id" "uuid", "employee_name" "text", "due_date" "date", "campaign_id" "uuid", "campaign_name" "text", "tl_id" "uuid", "tl_name" "text", "recipient_id" "uuid", "recipient_name" "text", "recipient_title" "text", "recipient_email" "text", "prior_attendance_avg" numeric, "prior_kpi_avg" numeric, "prior_attitude_avg" numeric, "completed_weeks" integer)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  WITH prior_scores AS (
    SELECT employee_id,
           AVG(attendance_score)::numeric(3,1) AS att_avg,
           AVG(kpi_score)::numeric(3,1)        AS kpi_avg,
           AVG(attitude_score)::numeric(3,1)   AS atd_avg,
           COUNT(*)                            AS done_count
      FROM public.agent_reviews
     WHERE completed_at IS NOT NULL
     GROUP BY employee_id
  )
  SELECT
    r.id,
    e.id,
    e.full_name,
    r.due_date,
    c.id,
    c.name,
    tl.id,
    tl.full_name,
    rec.id,
    rec.full_name,
    rec.title,
    rec.email,
    ps.att_avg,
    ps.kpi_avg,
    ps.atd_avg,
    COALESCE(ps.done_count, 0)::int
  FROM public.agent_reviews r
  JOIN public.employees e   ON r.employee_id = e.id
  JOIN public.campaigns c   ON r.campaign_id = c.id
  LEFT JOIN public.employees tl ON c.team_lead_id = tl.id
  CROSS JOIN LATERAL (
    SELECT id, full_name, title, email
      FROM public.employees
     WHERE title IN ('owner', 'admin', 'manager')
       AND email IS NOT NULL
       AND employment_status = 'active'
       AND is_system_user = false   -- NEW: don't notify business partners/auditors
  ) rec
  LEFT JOIN prior_scores ps ON ps.employee_id = e.id
  WHERE r.week_number = 4
    AND r.completed_at IS NULL
    AND r.due_date <= p_send_date
    AND e.employment_status = 'active'
    AND NOT EXISTS (
      SELECT 1 FROM public.agent_review_notifications_sent s
       WHERE s.review_id = r.id
         AND s.notification_type = 'escalation_day29'
         AND s.recipient_employee_id = rec.id
    )
  ORDER BY r.due_date, e.full_name, rec.title;
$$;


ALTER FUNCTION "public"."find_pending_escalation_emails"("p_send_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."find_pending_tl_review_emails"("p_send_date" "date") RETURNS TABLE("review_id" "uuid", "employee_id" "uuid", "employee_name" "text", "employee_work_name" "text", "week_number" smallint, "due_date" "date", "days_overdue" integer, "campaign_id" "uuid", "campaign_name" "text", "tl_id" "uuid", "tl_name" "text", "tl_email" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  WITH campaign_tls AS (
    SELECT c.id AS campaign_id, c.team_lead_id AS tl_id
      FROM public.campaigns c
     WHERE c.team_lead_id IS NOT NULL
    UNION
    SELECT tlc.campaign_id, tlc.team_lead_id
      FROM public.team_lead_campaigns tlc
  )
  SELECT
    r.id,
    e.id,
    e.full_name,
    e.work_name,
    r.week_number,
    r.due_date,
    GREATEST(0, p_send_date - r.due_date),
    c.id,
    c.name,
    tl.id,
    tl.full_name,
    tl.email
  FROM public.agent_reviews r
  JOIN public.employees e ON r.employee_id = e.id
  JOIN public.campaigns c ON r.campaign_id = c.id
  JOIN campaign_tls ct ON ct.campaign_id = c.id
  JOIN public.employees tl ON ct.tl_id = tl.id
  WHERE r.completed_at IS NULL
    AND r.due_date <= p_send_date
    AND tl.email IS NOT NULL
    AND tl.employment_status = 'active'
    AND tl.is_system_user = false   -- NEW: don't ping system users as TLs
    AND e.employment_status = 'active'
    AND NOT EXISTS (
      SELECT 1 FROM public.agent_review_notifications_sent s
       WHERE s.review_id = r.id
         AND s.notification_type = 'tl_due'
         AND s.recipient_employee_id = tl.id
         AND s.send_date = p_send_date
    )
  ORDER BY tl.id, r.due_date;
$$;


ALTER FUNCTION "public"."find_pending_tl_review_emails"("p_send_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_weekly_invoices"("p_monday" "date", "p_sunday" "date") RETURNS TABLE("invoice_id" "uuid", "client_id" "uuid", "invoice_number" "text", "line_count" integer, "total_amount" numeric)
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_client_rec record;
  v_invoice_id uuid;
  v_invoice_number text;
  v_line_count int;
  v_total numeric;
  v_iso_week int;
  v_ded record;
  v_ded_paid numeric;
  v_ded_count int;
  v_remaining numeric;
  v_amt numeric;
BEGIN
  v_iso_week := EXTRACT(WEEK FROM p_monday)::int;

  FOR v_client_rec IN
    SELECT DISTINCT cl.id AS cid, cl.name AS cname
    FROM clients cl
    WHERE cl.is_billable = true
      AND NOT EXISTS (
        SELECT 1 FROM invoices i
        WHERE i.client_id = cl.id AND i.week_start = p_monday AND i.week_end = p_sunday
      )
      AND (
        EXISTS (
          SELECT 1 FROM employees e
          JOIN employee_campaign_assignments eca ON eca.employee_id = e.id
          JOIN campaigns c ON c.id = eca.campaign_id
          WHERE c.client_id = cl.id
            AND e.is_system_user = false
            AND eca.start_date <= p_sunday
            AND (eca.end_date IS NULL OR eca.end_date >= p_monday)
            AND (
              e.is_active = true
              OR EXISTS (
                SELECT 1 FROM time_clock tc
                WHERE tc.employee_id = e.id
                  AND tc.date BETWEEN p_monday AND p_sunday
                  AND tc.date >= eca.start_date
                  AND tc.date <= COALESCE(eca.end_date, '9999-12-31'::date)
              )
            )
        )
        OR EXISTS (
          SELECT 1 FROM employees e
          WHERE e.flat_bill_client_id = cl.id AND e.flat_weekly_bill_amount > 0
            AND e.is_active = true AND e.is_system_user = false
        )
      )
  LOOP
    v_invoice_number := next_invoice_number(v_client_rec.cid);

    INSERT INTO invoices (
      client_id, invoice_number, week_number, week_start, week_end,
      due_date, status, submitted_on, project_name
    ) VALUES (
      v_client_rec.cid, v_invoice_number, v_iso_week, p_monday, p_sunday,
      p_sunday + INTERVAL '4 days', 'draft', CURRENT_DATE, v_client_rec.cname
    )
    RETURNING id INTO v_invoice_id;

    WITH per_day AS (
      INSERT INTO invoice_lines (
        invoice_id, employee_id, agent_name, campaign_name,
        days_worked, holiday_days, unit_price, total, spiffs, total_price, is_flat_total
      )
      SELECT
        v_invoice_id, e.id, e.full_name, c.name,
        COALESCE((
          SELECT count(DISTINCT tc.date)::numeric FROM time_clock tc
          WHERE tc.employee_id = e.id
            AND tc.date BETWEEN p_monday AND p_sunday
            AND tc.date >= eca.start_date
            AND tc.date <= COALESCE(eca.end_date, '9999-12-31'::date)
        ), 0),
        0, e.daily_bill_rate,
        COALESCE((
          SELECT count(DISTINCT tc.date)::numeric FROM time_clock tc
          WHERE tc.employee_id = e.id
            AND tc.date BETWEEN p_monday AND p_sunday
            AND tc.date >= eca.start_date
            AND tc.date <= COALESCE(eca.end_date, '9999-12-31'::date)
        ), 0) * e.daily_bill_rate,
        0,
        COALESCE((
          SELECT count(DISTINCT tc.date)::numeric FROM time_clock tc
          WHERE tc.employee_id = e.id
            AND tc.date BETWEEN p_monday AND p_sunday
            AND tc.date >= eca.start_date
            AND tc.date <= COALESCE(eca.end_date, '9999-12-31'::date)
        ), 0) * e.daily_bill_rate,
        false
      FROM employees e
      JOIN employee_campaign_assignments eca ON eca.employee_id = e.id
      JOIN campaigns c ON c.id = eca.campaign_id
      WHERE c.client_id = v_client_rec.cid
        AND e.is_system_user = false
        AND eca.start_date <= p_sunday
        AND (eca.end_date IS NULL OR eca.end_date >= p_monday)
        AND (
          (
            e.is_active = true
            AND (e.hire_date IS NULL OR e.hire_date <= p_sunday)
            AND (e.last_worked_day IS NULL OR e.last_worked_day >= p_monday)
          )
          OR EXISTS (
            SELECT 1 FROM time_clock tc
            WHERE tc.employee_id = e.id
              AND tc.date BETWEEN p_monday AND p_sunday
              AND tc.date >= eca.start_date
              AND tc.date <= COALESCE(eca.end_date, '9999-12-31'::date)
          )
        )
      RETURNING total_price
    ),
    flat_billed AS (
      INSERT INTO invoice_lines (
        invoice_id, employee_id, agent_name, campaign_name,
        days_worked, holiday_days, unit_price, total, spiffs, total_price, is_flat_total
      )
      SELECT
        v_invoice_id, e.id, e.full_name, '— flat bill —',
        7, 0, 0, 0, 0, e.flat_weekly_bill_amount, true
      FROM employees e
      WHERE e.flat_bill_client_id = v_client_rec.cid
        AND e.is_active = true AND e.is_system_user = false
        AND e.flat_weekly_bill_amount > 0
        AND (e.hire_date IS NULL OR e.hire_date <= p_sunday)
        AND (e.last_worked_day IS NULL OR e.last_worked_day >= p_monday)
      RETURNING total_price
    )
    SELECT
      ((SELECT count(*) FROM per_day) + (SELECT count(*) FROM flat_billed))::int,
      COALESCE((SELECT SUM(total_price) FROM per_day), 0) + COALESCE((SELECT SUM(total_price) FROM flat_billed), 0)
    INTO v_line_count, v_total;

    -- Recurring deductions (e.g. Tax Loan repayment): negative line per invoice
    -- until total_amount is repaid. Repaid-so-far is derived from existing
    -- "<prefix> #N" lines on OTHER invoices of this client + prepaid_amount.
    FOR v_ded IN
      SELECT * FROM client_recurring_deductions d
      WHERE d.client_id = v_client_rec.cid AND d.is_active = true
    LOOP
      SELECT COALESCE(SUM(-il.total_price), 0), COUNT(*)
        INTO v_ded_paid, v_ded_count
      FROM invoice_lines il
      JOIN invoices i2 ON i2.id = il.invoice_id
      WHERE i2.client_id = v_client_rec.cid
        AND il.agent_name LIKE v_ded.label_prefix || ' #%'
        AND i2.id <> v_invoice_id;

      v_remaining := v_ded.total_amount - v_ded.prepaid_amount - v_ded_paid;

      IF v_remaining > 0 THEN
        v_amt := LEAST(v_ded.weekly_amount, v_remaining);
        INSERT INTO invoice_lines (
          invoice_id, employee_id, agent_name, campaign_name,
          days_worked, holiday_days, unit_price, total, spiffs, total_price, is_flat_total
        ) VALUES (
          v_invoice_id, NULL,
          v_ded.label_prefix || ' #' || (v_ded.next_counter_start + v_ded_count),
          '— deduction —', 0, 0, 0, 0, 0, -v_amt, true
        );
        v_line_count := v_line_count + 1;
        v_total := v_total - v_amt;
      END IF;
    END LOOP;

    invoice_id := v_invoice_id;
    client_id := v_client_rec.cid;
    invoice_number := v_invoice_number;
    line_count := v_line_count;
    total_amount := v_total;
    RETURN NEXT;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."generate_weekly_invoices"("p_monday" "date", "p_sunday" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_campaign_holiday_capacities"("p_campaign_id" "uuid") RETURNS TABLE("holiday_date" "date", "approved_count" integer, "cap" integer)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT
    ch.date                                                     AS holiday_date,
    COUNT(hr.id) FILTER (WHERE hr.status = 'approved')::int    AS approved_count,
    GREATEST(1, FLOOR(
      (SELECT COUNT(*) FROM public.employees
       WHERE campaign_id = p_campaign_id AND is_active = true)
      * 0.20
    ))::int                                                     AS cap
  FROM public.company_holidays ch
  LEFT JOIN public.holiday_requests hr
    ON hr.holiday_date = ch.date AND hr.campaign_id = p_campaign_id
  WHERE ch.date > CURRENT_DATE
  GROUP BY ch.date
  ORDER BY ch.date;
$$;


ALTER FUNCTION "public"."get_campaign_holiday_capacities"("p_campaign_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_client_holiday_summary"("p_campaign_id" "uuid") RETURNS TABLE("holiday_date" "date", "holiday_name" "text", "requires_coverage" boolean, "approved_off" integer, "total_headcount" integer)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT
    ch.date,
    ch.name,
    c.requires_holiday_coverage,
    (SELECT COUNT(*)::int FROM public.holiday_requests hr
       WHERE hr.holiday_date = ch.date
         AND hr.campaign_id = p_campaign_id
         AND hr.status = 'approved')                AS approved_off,
    (SELECT COUNT(*)::int FROM public.employees e
       WHERE e.campaign_id = p_campaign_id
         AND e.is_active = true)                    AS total_headcount
  FROM public.company_holidays ch
  CROSS JOIN public.campaigns c
  WHERE ch.date > CURRENT_DATE
    AND c.id = p_campaign_id
    AND p_campaign_id IN (SELECT public.my_client_campaign_ids())
  ORDER BY ch.date
  LIMIT 1;
$$;


ALTER FUNCTION "public"."get_client_holiday_summary"("p_campaign_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_vacation_balance"("p_employee_id" "uuid", "p_year" integer DEFAULT (EXTRACT(year FROM CURRENT_DATE))::integer) RETURNS TABLE("entitlement_days" integer, "used_days" integer, "available_days" integer, "years_of_service" integer, "next_entitlement_date" "date")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_hire_date   date;
  v_completed   integer;
  v_entitlement integer;
  v_used        integer;
  v_next_date   date;
  v_as_of       date;
BEGIN
  SELECT hire_date INTO v_hire_date FROM public.employees WHERE id = p_employee_id;
  IF v_hire_date IS NULL THEN
    RETURN QUERY SELECT 0, 0, 0, 0, NULL::date;
    RETURN;
  END IF;

  -- Anchor tenure to today for the current year; freeze at Dec 31 for past years.
  v_as_of := LEAST(CURRENT_DATE, make_date(p_year, 12, 31));
  v_completed := DATE_PART('year', AGE(v_as_of, v_hire_date))::integer;

  IF v_completed < 1 THEN
    v_entitlement := 0;
    v_next_date   := (v_hire_date + INTERVAL '1 year')::date;
  ELSIF v_completed <= 4 THEN
    v_entitlement := 10 + v_completed * 2;
    v_next_date   := NULL;
  ELSE
    v_entitlement := 20 + (FLOOR((v_completed - 5) / 5.0) * 2)::integer;
    v_next_date   := NULL;
  END IF;

  SELECT COALESCE(SUM(days_requested), 0) INTO v_used
  FROM public.vacation_requests
  WHERE employee_id = p_employee_id
    AND status = 'approved'
    AND EXTRACT(YEAR FROM start_date) = p_year;

  RETURN QUERY SELECT
    v_entitlement,
    v_used,
    GREATEST(0, v_entitlement - v_used),
    v_completed,
    v_next_date;
END;
$$;


ALTER FUNCTION "public"."get_vacation_balance"("p_employee_id" "uuid", "p_year" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_user_profile_role"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    IF OLD.role = 'client' OR NEW.role = 'client' THEN
      RETURN NEW;
    END IF;
    IF OLD.employee_id IS NOT DISTINCT FROM NEW.employee_id THEN
      RAISE EXCEPTION 'Direct role changes are not allowed. Update employees.title instead.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."guard_user_profile_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_auth_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
DECLARE
  v_employee_id uuid;
  v_role text;
  v_organization_id uuid;
  v_client_id uuid;
BEGIN
  v_employee_id     := (NEW.raw_user_meta_data ->> 'employee_id')::uuid;
  v_client_id       := (NEW.raw_user_meta_data ->> 'client_id')::uuid;
  v_role            :=  NEW.raw_user_meta_data ->> 'role';
  v_organization_id := (NEW.raw_user_meta_data ->> 'organization_id')::uuid;

  -- Employee path: derive role + org from the employees table
  IF v_employee_id IS NOT NULL THEN
    SELECT title, organization_id
      INTO v_role, v_organization_id
      FROM public.employees
     WHERE id = v_employee_id;

    IF v_role IS NULL THEN
      RETURN NEW;  -- employee_id was bogus, bail silently
    END IF;

  -- Client portal path: needs role='client' + client_id + organization_id
  ELSIF v_client_id IS NOT NULL
        AND v_role = 'client'
        AND v_organization_id IS NOT NULL THEN
    NULL;  -- all values came from metadata, good to insert

  ELSE
    RETURN NEW;  -- no metadata -> skip (preserves existing test-account behavior)
  END IF;

  INSERT INTO public.user_profiles (id, employee_id, role, organization_id, client_id)
  VALUES (NEW.id, v_employee_id, v_role, v_organization_id, v_client_id)
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_auth_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."hr_create_finalization_draft"("p_request_id" "uuid", "p_created_by" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_request    record;
  v_doc_ref    text;
  v_new_id     uuid;
  v_type       text;
  v_default_kpis jsonb;
BEGIN
  IF NOT public.is_leadership() THEN
    RAISE EXCEPTION 'Forbidden: only leadership may create finalization drafts'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_request
    FROM public.hr_document_requests
   WHERE id = p_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_request.fulfilled_carta_id     IS NOT NULL
     OR v_request.fulfilled_acta_id   IS NOT NULL
     OR v_request.fulfilled_renuncia_id IS NOT NULL
     OR v_request.fulfilled_rescision_id IS NOT NULL
     OR v_request.fulfilled_rescision_desempeno_id IS NOT NULL THEN
    RAISE EXCEPTION 'Request already has a finalization row'
      USING ERRCODE = 'P0001';
  END IF;

  v_type := v_request.request_type;

  IF v_type = 'carta' THEN
    v_doc_ref := 'CC' || to_char(
      now() AT TIME ZONE 'America/Mexico_City', 'YYYYMMDD-HH24MI'
    );
    INSERT INTO public.cartas_compromiso (
      employee_id, request_id, doc_ref, incident_date, kpi_table, created_by
    ) VALUES (
      v_request.employee_id, p_request_id, v_doc_ref,
      v_request.incident_date, '[]'::jsonb, p_created_by
    ) RETURNING id INTO v_new_id;

    UPDATE public.hr_document_requests
       SET fulfilled_carta_id = v_new_id,
           status = CASE WHEN status = 'pending' THEN 'in_progress'
                         ELSE status END
     WHERE id = p_request_id;

  ELSIF v_type = 'acta' THEN
    v_doc_ref := to_char(
      now() AT TIME ZONE 'America/Mexico_City', 'YYYYMMDD-HH24MI'
    );
    INSERT INTO public.actas_administrativas (
      employee_id, request_id, doc_ref, incident_date, witnesses, created_by
    ) VALUES (
      v_request.employee_id, p_request_id, v_doc_ref,
      v_request.incident_date, '[]'::jsonb, p_created_by
    ) RETURNING id INTO v_new_id;

    UPDATE public.hr_document_requests
       SET fulfilled_acta_id = v_new_id,
           status = CASE WHEN status = 'pending' THEN 'in_progress'
                         ELSE status END
     WHERE id = p_request_id;

  ELSIF v_type = 'renuncia' THEN
    v_doc_ref := 'RN' || to_char(
      now() AT TIME ZONE 'America/Mexico_City', 'YYYYMMDD-HH24MI'
    );
    INSERT INTO public.resignation_packets (
      employee_id, request_id, doc_ref, effective_date, created_by
    ) VALUES (
      v_request.employee_id, p_request_id, v_doc_ref,
      v_request.incident_date, p_created_by
    ) RETURNING id INTO v_new_id;

    UPDATE public.hr_document_requests
       SET fulfilled_renuncia_id = v_new_id,
           status = CASE WHEN status = 'pending' THEN 'in_progress'
                         ELSE status END
     WHERE id = p_request_id;

  ELSIF v_type = 'rescision_prueba' THEN
    v_doc_ref := 'RP' || to_char(
      now() AT TIME ZONE 'America/Mexico_City', 'YYYYMMDD-HH24MI'
    );
    v_default_kpis := jsonb_build_array(
      jsonb_build_object('kpi', 'Llamadas diarias',                  'required', '350 llamadas', 'recorded', '', 'met', ''),
      jsonb_build_object('kpi', 'Talk Time diario',                  'required', '3 h / día',    'recorded', '', 'met', ''),
      jsonb_build_object('kpi', 'Package Back / Credit Pull',        'required', '7 / día',      'recorded', '', 'met', ''),
      jsonb_build_object('kpi', 'Citas agendadas (Google Calendar)', 'required', '6 / día',      'recorded', '', 'met', ''),
      jsonb_build_object('kpi', 'Calidad de llamada (auditoría)',    'required', '≥ 90 %',       'recorded', '', 'met', '')
    );
    INSERT INTO public.rescision_prueba_documents (
      employee_id, request_id, doc_ref,
      termination_effective_date, kpi_table, created_by
    ) VALUES (
      v_request.employee_id, p_request_id, v_doc_ref,
      v_request.incident_date, v_default_kpis, p_created_by
    ) RETURNING id INTO v_new_id;

    UPDATE public.hr_document_requests
       SET fulfilled_rescision_id = v_new_id,
           status = CASE WHEN status = 'pending' THEN 'in_progress'
                         ELSE status END
     WHERE id = p_request_id;

  ELSIF v_type = 'rescision_desempeno' THEN
    v_doc_ref := 'RD' || to_char(
      now() AT TIME ZONE 'America/Mexico_City', 'YYYYMMDD-HH24MI'
    );
    v_default_kpis := jsonb_build_array(
      jsonb_build_object('kpi', 'Llamadas diarias',                  'required', '350 llamadas', 'recorded', '', 'met', ''),
      jsonb_build_object('kpi', 'Talk Time diario',                  'required', '3 h / día',    'recorded', '', 'met', ''),
      jsonb_build_object('kpi', 'Package Back / Credit Pull',        'required', '7 / día',      'recorded', '', 'met', ''),
      jsonb_build_object('kpi', 'Citas agendadas (Google Calendar)', 'required', '6 / día',      'recorded', '', 'met', ''),
      jsonb_build_object('kpi', 'Calidad de llamada (auditoría)',    'required', '≥ 90 %',       'recorded', '', 'met', '')
    );
    INSERT INTO public.rescision_desempeno_documents (
      employee_id, request_id, doc_ref,
      termination_effective_date, kpi_table, created_by
    ) VALUES (
      v_request.employee_id, p_request_id, v_doc_ref,
      v_request.incident_date, v_default_kpis, p_created_by
    ) RETURNING id INTO v_new_id;

    UPDATE public.hr_document_requests
       SET fulfilled_rescision_desempeno_id = v_new_id,
           status = CASE WHEN status = 'pending' THEN 'in_progress'
                         ELSE status END
     WHERE id = p_request_id;

  ELSE
    RAISE EXCEPTION 'Unknown request_type: %', v_type;
  END IF;

  RETURN jsonb_build_object('id', v_new_id, 'type', v_type, 'doc_ref', v_doc_ref);
END;
$$;


ALTER FUNCTION "public"."hr_create_finalization_draft"("p_request_id" "uuid", "p_created_by" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."hr_create_finalization_draft"("p_request_id" "uuid", "p_created_by" "uuid") IS 'Atomically creates a carta_compromiso or acta_administrativa draft row and links it to the hr_document_request. Auto-generates doc_ref with MX timestamp. Transitions pending requests to in_progress.';



CREATE OR REPLACE FUNCTION "public"."hr_mark_finalization_signed"("p_finalization_id" "uuid", "p_type" "text", "p_signed_scan_path" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_request_id uuid;
BEGIN
  IF NOT public.is_leadership() THEN
    RAISE EXCEPTION 'Forbidden: only leadership may mark docs as signed'
      USING ERRCODE = '42501';
  END IF;

  IF p_type NOT IN ('carta', 'acta', 'renuncia', 'rescision_prueba', 'rescision_desempeno') THEN
    RAISE EXCEPTION 'Unknown type: %', p_type USING ERRCODE = '22023';
  END IF;

  IF p_type = 'carta' THEN
    UPDATE public.cartas_compromiso
       SET signed_at = now(),
           signed_scan_path = p_signed_scan_path
     WHERE id = p_finalization_id
    RETURNING request_id INTO v_request_id;
  ELSIF p_type = 'acta' THEN
    UPDATE public.actas_administrativas
       SET signed_at = now(),
           signed_scan_path = p_signed_scan_path
     WHERE id = p_finalization_id
    RETURNING request_id INTO v_request_id;
  ELSIF p_type = 'renuncia' THEN
    UPDATE public.resignation_packets
       SET signed_at = now(),
           signed_scan_path = p_signed_scan_path
     WHERE id = p_finalization_id
    RETURNING request_id INTO v_request_id;
  ELSIF p_type = 'rescision_prueba' THEN
    UPDATE public.rescision_prueba_documents
       SET signed_at = now(),
           signed_scan_path = p_signed_scan_path
     WHERE id = p_finalization_id
    RETURNING request_id INTO v_request_id;
  ELSE
    UPDATE public.rescision_desempeno_documents
       SET signed_at = now(),
           signed_scan_path = p_signed_scan_path
     WHERE id = p_finalization_id
    RETURNING request_id INTO v_request_id;
  END IF;

  IF v_request_id IS NULL THEN
    RAISE EXCEPTION 'Finalization row not found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.hr_document_requests
     SET status = 'fulfilled',
         canceled_reason = NULL
   WHERE id = v_request_id
     AND status <> 'fulfilled';

  RETURN jsonb_build_object(
    'request_id', v_request_id,
    'finalization_id', p_finalization_id,
    'status', 'fulfilled'
  );
END;
$$;


ALTER FUNCTION "public"."hr_mark_finalization_signed"("p_finalization_id" "uuid", "p_type" "text", "p_signed_scan_path" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."hr_mark_finalization_signed"("p_finalization_id" "uuid", "p_type" "text", "p_signed_scan_path" "text") IS 'Atomically marks a carta/acta as signed (sets signed_at + signed_scan_path) and transitions the request to fulfilled status. Idempotent — re-upload of a replacement scan updates both fields and re-asserts fulfilled status.';



CREATE TABLE IF NOT EXISTS "public"."policy_document_versions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "policy_document_id" "uuid" NOT NULL,
    "version_number" integer NOT NULL,
    "file_path" "text" NOT NULL,
    "file_name" "text" NOT NULL,
    "mime_type" "text" NOT NULL,
    "file_size_bytes" bigint NOT NULL,
    "uploaded_by" "uuid" NOT NULL,
    "published_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "change_notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."policy_document_versions" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."insert_policy_version"("p_policy_id" "uuid", "p_file_path" "text", "p_file_name" "text", "p_mime_type" "text", "p_file_size_bytes" bigint, "p_uploaded_by" "uuid", "p_change_notes" "text") RETURNS "public"."policy_document_versions"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  new_row public.policy_document_versions;
BEGIN
  IF NOT public.is_leadership() THEN
    RAISE EXCEPTION 'Only leadership can publish policy versions';
  END IF;

  INSERT INTO public.policy_document_versions (
    policy_document_id, version_number, file_path, file_name,
    mime_type, file_size_bytes, uploaded_by, change_notes
  )
  SELECT
    p_policy_id,
    COALESCE(MAX(version_number), 0) + 1,
    p_file_path, p_file_name, p_mime_type, p_file_size_bytes,
    p_uploaded_by, p_change_notes
  FROM public.policy_document_versions
  WHERE policy_document_id = p_policy_id
  RETURNING * INTO new_row;

  RETURN new_row;
END;
$$;


ALTER FUNCTION "public"."insert_policy_version"("p_policy_id" "uuid", "p_file_path" "text", "p_file_name" "text", "p_mime_type" "text", "p_file_size_bytes" bigint, "p_uploaded_by" "uuid", "p_change_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_client"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'client'
  );
$$;


ALTER FUNCTION "public"."is_client"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_leadership"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_profiles up
    JOIN public.employees e ON up.employee_id = e.id
    WHERE up.id = auth.uid()
      AND e.organization_id = public.my_org_id()
      AND e.title IN ('owner', 'admin', 'manager')
  );
$$;


ALTER FUNCTION "public"."is_leadership"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_owner"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_profiles up
    JOIN public.employees     e  ON up.employee_id = e.id
    WHERE up.id = auth.uid()
      AND e.organization_id = public.my_org_id()
      AND e.title = 'owner'
  );
$$;


ALTER FUNCTION "public"."is_owner"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_owner_or_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.user_profiles up
    join public.employees e on up.employee_id = e.id
    where up.id = auth.uid()
      and e.organization_id = public.my_org_id()
      and e.title in ('owner', 'admin')
  );
$$;


ALTER FUNCTION "public"."is_owner_or_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_team_lead"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_profiles up
    JOIN public.employees e ON up.employee_id = e.id
    WHERE up.id = auth.uid()
      AND e.organization_id = public.my_org_id()
      AND e.title = 'team_lead'
  );
$$;


ALTER FUNCTION "public"."is_team_lead"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_employment_status_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_from public.employment_status;
  v_to   public.employment_status;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_from := NULL;
    v_to   := NEW.employment_status;
  ELSE
    IF NEW.employment_status IS NOT DISTINCT FROM OLD.employment_status THEN
      RETURN NEW;
    END IF;
    v_from := OLD.employment_status;
    v_to   := NEW.employment_status;
  END IF;

  INSERT INTO public.employment_history (
    employee_id, from_status, to_status,
    reason, notes, rehire_eligible, last_worked_day,
    changed_by, changed_at
  ) VALUES (
    NEW.id, v_from, v_to,
    NEW.termination_reason, NEW.termination_notes, NEW.rehire_eligible, NEW.last_worked_day,
    COALESCE(NEW.terminated_by, auth.uid()),
    COALESCE(NEW.terminated_at, NOW())
  );

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."log_employment_status_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_shift_settings_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  actor_email text;
begin
  select email into actor_email from auth.users where id = auth.uid();

  if tg_op = 'INSERT' then
    insert into public.shift_settings_audit(shift_setting_id, campaign_id, action, changed_by, changed_by_email, changes)
      values (new.id, new.campaign_id, 'insert', auth.uid(), actor_email, to_jsonb(new));
    return new;
  elsif tg_op = 'UPDATE' then
    insert into public.shift_settings_audit(shift_setting_id, campaign_id, action, changed_by, changed_by_email, changes)
      values (new.id, new.campaign_id, 'update', auth.uid(), actor_email,
        jsonb_build_object('before', to_jsonb(old), 'after', to_jsonb(new)));
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.shift_settings_audit(shift_setting_id, campaign_id, action, changed_by, changed_by_email, changes)
      values (old.id, old.campaign_id, 'delete', auth.uid(), actor_email, to_jsonb(old));
    return old;
  end if;
  return null;
end;
$$;


ALTER FUNCTION "public"."log_shift_settings_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_review_notification_sent"("p_review_id" "uuid", "p_notification_type" "public"."review_notification_type", "p_recipient_employee_id" "uuid", "p_recipient_email" "text", "p_send_date" "date") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.agent_review_notifications_sent
    (review_id, notification_type, recipient_employee_id, recipient_email, send_date)
  VALUES (p_review_id, p_notification_type, p_recipient_employee_id, p_recipient_email, p_send_date)
  ON CONFLICT (review_id, notification_type, recipient_employee_id, send_date) DO NOTHING
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;


ALTER FUNCTION "public"."mark_review_notification_sent"("p_review_id" "uuid", "p_notification_type" "public"."review_notification_type", "p_recipient_employee_id" "uuid", "p_recipient_email" "text", "p_send_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."my_client_campaign_ids"() RETURNS SETOF "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT id
  FROM public.campaigns
  WHERE client_id = public.my_client_id()
    AND organization_id = public.my_org_id();
$$;


ALTER FUNCTION "public"."my_client_campaign_ids"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."my_client_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT client_id FROM public.user_profiles WHERE id = auth.uid();
$$;


ALTER FUNCTION "public"."my_client_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."my_employee_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT up.employee_id
  FROM public.user_profiles up
  WHERE up.id = auth.uid();
$$;


ALTER FUNCTION "public"."my_employee_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."my_manager_info"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_my_emp     employees%ROWTYPE;
  v_supervisor employees%ROWTYPE;
  v_role       text;
BEGIN
  -- Find my employee row via user_profiles
  SELECT e.* INTO v_my_emp
  FROM employees e
  JOIN user_profiles up ON up.employee_id = e.id
  WHERE up.id = auth.uid();

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Management roles don't need a "manager" field shown
  IF v_my_emp.title IN ('manager', 'admin', 'owner') THEN
    RETURN NULL;
  END IF;

  -- Fallback role label
  v_role := CASE
    WHEN v_my_emp.title = 'agent'     THEN 'Team Lead'
    WHEN v_my_emp.title = 'team_lead' THEN 'Manager'
    ELSE 'Supervisor'
  END;

  -- If reports_to is set, get the supervisor's display info
  IF v_my_emp.reports_to IS NOT NULL THEN
    SELECT * INTO v_supervisor FROM employees WHERE id = v_my_emp.reports_to;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'name',       COALESCE(NULLIF(trim(v_supervisor.work_name), ''), v_supervisor.full_name),
        'title',      v_supervisor.title,
        'role_label', v_role,
        'assigned',   true
      );
    END IF;
  END IF;

  -- No supervisor on file — return the role label as placeholder
  RETURN jsonb_build_object(
    'name',       NULL,
    'title',      NULL,
    'role_label', v_role,
    'assigned',   false
  );
END;
$$;


ALTER FUNCTION "public"."my_manager_info"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."my_team_member_ids"() RETURNS SETOF "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT e.id
  FROM public.employees e
  WHERE e.reports_to = public.my_employee_id()
    AND e.organization_id = public.my_org_id()

  UNION

  SELECT e.id
  FROM public.employees e
  WHERE e.campaign_id IN (SELECT public.my_tl_campaign_ids())
    AND e.organization_id = public.my_org_id()
    AND e.title = 'agent';
$$;


ALTER FUNCTION "public"."my_team_member_ids"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."my_tl_campaign_ids"() RETURNS SETOF "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT c.id
  FROM public.campaigns c
  WHERE c.team_lead_id = public.my_employee_id()
    AND c.organization_id = public.my_org_id()

  UNION

  SELECT tlc.campaign_id
  FROM public.team_lead_campaigns tlc
  JOIN public.campaigns c ON c.id = tlc.campaign_id
  WHERE tlc.team_lead_id = public.my_employee_id()
    AND c.organization_id = public.my_org_id();
$$;


ALTER FUNCTION "public"."my_tl_campaign_ids"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."next_invoice_number"("p_client_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql"
    AS $_$
DECLARE
  v_prefix text;
  v_next int;
BEGIN
  SELECT prefix INTO v_prefix FROM clients WHERE id = p_client_id;
  IF v_prefix IS NULL THEN
    RAISE EXCEPTION 'Client % has no prefix', p_client_id;
  END IF;
  SELECT COALESCE(MAX(
    CASE WHEN invoice_number ~ ('^' || v_prefix || '-[0-9]+$')
      THEN SUBSTRING(invoice_number FROM '[0-9]+$')::int
      ELSE 0 END
  ), 0) + 1
  INTO v_next
  FROM invoices
  WHERE client_id = p_client_id;
  RETURN v_prefix || '-' || LPAD(v_next::text, 2, '0');
END;
$_$;


ALTER FUNCTION "public"."next_invoice_number"("p_client_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pay_calc_record"("p_record_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  r        public.payroll_records;
  e        public.employees;
  c        public.pay_components;
  old_calc jsonb;
  new_calc jsonb;
BEGIN

  SELECT * INTO r FROM public.payroll_records WHERE id = p_record_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payroll record % not found.', p_record_id
      USING ERRCODE = 'P0002';
  END IF;

  IF r.status = 'PAID' THEN
    RAISE EXCEPTION
      'Cannot recalculate PAID record %. Unlock the pay period first.',
      p_record_id
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO e FROM public.employees WHERE id = r.employee_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employee % not found for payroll record %.',
      r.employee_id, p_record_id
      USING ERRCODE = 'P0002';
  END IF;

  old_calc := jsonb_build_object(
    'weekly_base',      r.weekly_base,
    'kpi_bonus',        r.kpi_bonus,
    'missed_deduction', r.missed_deduction,
    'overtime_pay',     r.overtime_pay,
    'sunday_pay',       r.sunday_pay,
    'vacation_pay',     r.vacation_pay,
    'holiday_pay',      r.holiday_pay,
    'total_pay',        r.total_pay
  );

  c := public._calc_pay_components(e, r);

  UPDATE public.payroll_records SET
    weekly_base      = c.weekly_base,
    kpi_bonus        = c.kpi_bonus,
    missed_deduction = c.missed_deduction,
    overtime_pay     = c.overtime_pay,
    sunday_pay       = c.sunday_pay,
    vacation_pay     = c.vacation_pay,
    holiday_pay      = c.holiday_pay,
    total_pay        = c.total_pay
  WHERE id = p_record_id;

  new_calc := jsonb_build_object(
    'weekly_base',      c.weekly_base,
    'kpi_bonus',        c.kpi_bonus,
    'missed_deduction', c.missed_deduction,
    'overtime_pay',     c.overtime_pay,
    'sunday_pay',       c.sunday_pay,
    'vacation_pay',     c.vacation_pay,
    'holiday_pay',      c.holiday_pay,
    'total_pay',        c.total_pay
  );

  INSERT INTO public.payroll_audit_log
    (record_id, action, before, after, actor, organization_id)
  VALUES
    (p_record_id, 'RECALC', old_calc, new_calc, auth.uid(), r.organization_id);

END;
$$;


ALTER FUNCTION "public"."pay_calc_record"("p_record_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pay_derive_week"("p_week_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_week      payroll_weeks%ROWTYPE;
  v_org_id    uuid;
  v_emp       employees%ROWTYPE;
  v_raw       jsonb;
  v_snapshot  jsonb;
  v_missed    int;
  v_overtime  int;
  v_sundays   int;
  v_holidays  int;
  v_partial   int;
  v_inserted  int := 0;
  v_skipped   int := 0;
  v_no_data   int := 0;
  v_no_shift  int := 0;
  v_mid_hire  int := 0;
BEGIN
  IF NOT is_leadership() THEN
    RAISE EXCEPTION 'pay_derive_week: requires owner or manager role'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_week FROM payroll_weeks WHERE id = p_week_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'pay_derive_week: payroll week % not found', p_week_id;
  END IF;

  SELECT pp.organization_id INTO v_org_id
  FROM payroll_periods pp WHERE pp.id = v_week.period_id;

  FOR v_emp IN
    SELECT e.*
    FROM employees e
    WHERE e.is_active       = true
      AND e.is_system_user  = false
      AND e.organization_id = v_org_id
      AND COALESCE(e.last_worked_day, '9999-12-31'::date) >= v_week.week_start
      AND COALESCE(e.hire_date,       '1900-01-01'::date) <= v_week.week_end
  LOOP
    IF EXISTS (
      SELECT 1 FROM payroll_records
      WHERE week_id = p_week_id AND employee_id = v_emp.id
    ) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    v_raw := _derive_inputs_for_employee_week(
      v_emp.id, v_week.week_start, v_week.week_end
    );

    v_missed   := COALESCE((v_raw->>'missed_days')::int,    0);
    v_overtime := COALESCE((v_raw->>'overtime_days')::int,  0);
    v_sundays  := COALESCE((v_raw->>'sundays_worked')::int, 0);
    v_holidays := COALESCE((v_raw->>'holiday_days')::int,   0);
    v_partial  := (v_raw->>'partial_week_days')::int;

    v_snapshot := jsonb_build_object(
      'status',            v_raw->>'status',
      'scheduled_days',    v_raw->'scheduled_days',
      'missed_days',       v_missed,
      'overtime_days',     v_overtime,
      'sundays_worked',    v_sundays,
      'holiday_days',      v_holidays,
      'partial_week_days', v_partial,
      'kpi_achieved',      NULL,
      'notes',             v_raw->'notes'
    );

    CASE v_raw->>'status'
      WHEN 'NO_DATA'       THEN v_no_data  := v_no_data  + 1;
      WHEN 'NO_SHIFT_TYPE' THEN v_no_shift := v_no_shift + 1;
      ELSE NULL;
    END CASE;
    IF v_raw->'notes' @> '["mid_week_hire"]'::jsonb THEN
      v_mid_hire := v_mid_hire + 1;
    END IF;

    INSERT INTO payroll_records (
      week_id, employee_id, campaign_id, organization_id,
      missed_days, overtime_days, sundays_worked, holiday_days,
      kpi_achieved, partial_week_days,
      auto_derived, status
    ) VALUES (
      p_week_id,
      v_emp.id,
      v_emp.campaign_id,
      v_org_id,
      v_missed,
      v_overtime,
      v_sundays,
      v_holidays,
      true,
      v_partial,
      v_snapshot,
      'UNPAID'
    );

    v_inserted := v_inserted + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'inserted',          v_inserted,
    'skipped_existing',  v_skipped,
    'no_data_flags',     v_no_data,
    'no_shift_type',     v_no_shift,
    'mid_week_hires',    v_mid_hire
  );
END;
$$;


ALTER FUNCTION "public"."pay_derive_week"("p_week_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pay_redrive_week"("p_week_id" "uuid", "p_confirm" boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_week         payroll_weeks%ROWTYPE;
  v_rec          payroll_records%ROWTYPE;
  v_raw          jsonb;
  v_snap         jsonb;
  v_diff_rows    jsonb[] := '{}';
  v_f_missed     int;
  v_f_overtime   int;
  v_f_sundays    int;
  v_f_holidays   int;
  v_f_partial    int;
  v_n_missed     int;
  v_n_overtime   int;
  v_n_sundays    int;
  v_n_holidays   int;
  v_n_partial    int;
  v_changes      jsonb;
  v_preserved    jsonb;
  v_updated      int := 0;
  v_skip_paid    int := 0;
  v_pres_ct      int := 0;
BEGIN
  IF NOT is_leadership() THEN
    RAISE EXCEPTION 'pay_redrive_week: requires owner or manager role'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_week FROM payroll_weeks WHERE id = p_week_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'pay_redrive_week: payroll week % not found', p_week_id;
  END IF;

  FOR v_rec IN
    SELECT * FROM payroll_records WHERE week_id = p_week_id
  LOOP
    IF v_rec.status = 'PAID' THEN
      v_skip_paid := v_skip_paid + 1;
      CONTINUE;
    END IF;

    v_raw  := _derive_inputs_for_employee_week(
                v_rec.employee_id, v_week.week_start, v_week.week_end);
    v_snap := COALESCE(v_rec.auto_derived, '{}'::jsonb);

    v_f_missed   := COALESCE((v_raw->>'missed_days')::int,    0);
    v_f_overtime := COALESCE((v_raw->>'overtime_days')::int,  0);
    v_f_sundays  := COALESCE((v_raw->>'sundays_worked')::int, 0);
    v_f_holidays := COALESCE((v_raw->>'holiday_days')::int,   0);
    v_f_partial  := (v_raw->>'partial_week_days')::int;

    v_changes   := '{}'::jsonb;
    v_preserved := '{}'::jsonb;

    IF v_rec.missed_days IS NOT DISTINCT FROM (v_snap->>'missed_days')::int THEN
      v_n_missed := v_f_missed;
      IF v_rec.missed_days IS DISTINCT FROM v_f_missed THEN
        v_changes := v_changes || jsonb_build_object('missed_days',
          jsonb_build_object('from', v_rec.missed_days, 'to', v_f_missed));
      END IF;
    ELSE
      v_n_missed  := v_rec.missed_days;
      v_preserved := v_preserved || jsonb_build_object('missed_days',
        jsonb_build_object(
          'manual',         v_rec.missed_days,
          'snapshot_was',   (v_snap->>'missed_days')::int,
          'fresh_would_be', v_f_missed));
      v_pres_ct := v_pres_ct + 1;
    END IF;

    IF v_rec.overtime_days IS NOT DISTINCT FROM (v_snap->>'overtime_days')::int THEN
      v_n_overtime := v_f_overtime;
      IF v_rec.overtime_days IS DISTINCT FROM v_f_overtime THEN
        v_changes := v_changes || jsonb_build_object('overtime_days',
          jsonb_build_object('from', v_rec.overtime_days, 'to', v_f_overtime));
      END IF;
    ELSE
      v_n_overtime := v_rec.overtime_days;
      v_preserved  := v_preserved || jsonb_build_object('overtime_days',
        jsonb_build_object(
          'manual',         v_rec.overtime_days,
          'snapshot_was',   (v_snap->>'overtime_days')::int,
          'fresh_would_be', v_f_overtime));
      v_pres_ct := v_pres_ct + 1;
    END IF;

    IF v_rec.sundays_worked IS NOT DISTINCT FROM (v_snap->>'sundays_worked')::int THEN
      v_n_sundays := v_f_sundays;
      IF v_rec.sundays_worked IS DISTINCT FROM v_f_sundays THEN
        v_changes := v_changes || jsonb_build_object('sundays_worked',
          jsonb_build_object('from', v_rec.sundays_worked, 'to', v_f_sundays));
      END IF;
    ELSE
      v_n_sundays := v_rec.sundays_worked;
      v_preserved := v_preserved || jsonb_build_object('sundays_worked',
        jsonb_build_object(
          'manual',         v_rec.sundays_worked,
          'snapshot_was',   (v_snap->>'sundays_worked')::int,
          'fresh_would_be', v_f_sundays));
      v_pres_ct := v_pres_ct + 1;
    END IF;

    IF v_rec.holiday_days IS NOT DISTINCT FROM (v_snap->>'holiday_days')::int THEN
      v_n_holidays := v_f_holidays;
      IF v_rec.holiday_days IS DISTINCT FROM v_f_holidays THEN
        v_changes := v_changes || jsonb_build_object('holiday_days',
          jsonb_build_object('from', v_rec.holiday_days, 'to', v_f_holidays));
      END IF;
    ELSE
      v_n_holidays := v_rec.holiday_days;
      v_preserved  := v_preserved || jsonb_build_object('holiday_days',
        jsonb_build_object(
          'manual',         v_rec.holiday_days,
          'snapshot_was',   (v_snap->>'holiday_days')::int,
          'fresh_would_be', v_f_holidays));
      v_pres_ct := v_pres_ct + 1;
    END IF;

    IF v_rec.partial_week_days IS NOT DISTINCT FROM (v_snap->>'partial_week_days')::int THEN
      v_n_partial := v_f_partial;
      IF v_rec.partial_week_days IS DISTINCT FROM v_f_partial THEN
        v_changes := v_changes || jsonb_build_object('partial_week_days',
          jsonb_build_object('from', v_rec.partial_week_days, 'to', v_f_partial));
      END IF;
    ELSE
      v_n_partial := v_rec.partial_week_days;
      v_preserved := v_preserved || jsonb_build_object('partial_week_days',
        jsonb_build_object(
          'manual',         v_rec.partial_week_days,
          'snapshot_was',   (v_snap->>'partial_week_days')::int,
          'fresh_would_be', v_f_partial));
      v_pres_ct := v_pres_ct + 1;
    END IF;

    v_diff_rows := array_append(v_diff_rows, jsonb_build_object(
      'employee_id',   v_rec.employee_id,
      'record_id',     v_rec.id,
      'derive_status', v_raw->>'status',
      'changes',       v_changes,
      'preserved',     v_preserved
    ));

    IF p_confirm THEN
      UPDATE payroll_records SET
        missed_days       = v_n_missed,
        overtime_days     = v_n_overtime,
        sundays_worked    = v_n_sundays,
        holiday_days      = v_n_holidays,
        partial_week_days = v_n_partial,
        auto_derived = jsonb_build_object(
          'status',            v_raw->>'status',
          'scheduled_days',    v_raw->'scheduled_days',
          'missed_days',       v_n_missed,
          'overtime_days',     v_n_overtime,
          'sundays_worked',    v_n_sundays,
          'holiday_days',      v_n_holidays,
          'partial_week_days', v_n_partial,
          'kpi_achieved',      NULL,
          'notes',             v_raw->'notes'
        )
      WHERE id = v_rec.id;
      v_updated := v_updated + 1;
    END IF;

  END LOOP;

  RETURN jsonb_build_object(
    'confirmed',           p_confirm,
    'updated',             CASE WHEN     p_confirm THEN v_updated                          ELSE 0    END,
    'would_update',        CASE WHEN NOT p_confirm THEN array_length(v_diff_rows, 1)::int  ELSE NULL END,
    'skipped_paid',        v_skip_paid,
    'preserved_overrides', v_pres_ct,
    'diff',                to_jsonb(v_diff_rows)
  );
END;
$$;


ALTER FUNCTION "public"."pay_redrive_week"("p_week_id" "uuid", "p_confirm" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pay_unlock_period"("p_period_id" "uuid", "p_reason" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_period           payroll_periods%ROWTYPE;
  v_actor            uuid := auth.uid();
  v_weeks_unlocked   int  := 0;
  v_records_unlocked int  := 0;
  v_audit_before     jsonb;
  v_audit_after      jsonb;
BEGIN
  -- Owner-only
  IF NOT is_owner() THEN
    RAISE EXCEPTION 'pay_unlock_period: requires owner role'
      USING ERRCODE = '42501';
  END IF;

  -- Reason is required
  IF p_reason IS NULL OR length(btrim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'pay_unlock_period: reason is required'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_period FROM payroll_periods WHERE id = p_period_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'pay_unlock_period: payroll period % not found', p_period_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_period.status <> 'LOCKED' THEN
    RAISE EXCEPTION
      'pay_unlock_period: period % is not LOCKED (current status: %)',
      p_period_id, v_period.status
      USING ERRCODE = '22023';
  END IF;

  v_audit_before := jsonb_build_object(
    'period_status', v_period.status,
    'locked_at',     v_period.locked_at,
    'locked_by',     v_period.locked_by
  );

  -- Records: flip PAID → UNPAID with session-var bypass
  PERFORM set_config('jpayroll.unlocking', 'true', true);

  WITH affected AS (
    UPDATE payroll_records pr
    SET status = 'UNPAID'
    FROM payroll_weeks pw
    WHERE pw.id = pr.week_id
      AND pw.period_id = p_period_id
      AND pr.status = 'PAID'
    RETURNING pr.id
  )
  SELECT count(*)::int INTO v_records_unlocked FROM affected;

  PERFORM set_config('jpayroll.unlocking', 'false', true);

  -- Weeks: flip PAID → UNPAID
  WITH affected AS (
    UPDATE payroll_weeks
    SET status            = 'UNPAID',
        status_changed_at = now(),
        status_changed_by = v_actor
    WHERE period_id = p_period_id
      AND status    = 'PAID'
    RETURNING id
  )
  SELECT count(*)::int INTO v_weeks_unlocked FROM affected;

  -- Period: flip LOCKED → OPEN, clear lock metadata
  UPDATE payroll_periods
  SET status    = 'OPEN',
      locked_at = NULL,
      locked_by = NULL
  WHERE id = p_period_id;

  v_audit_after := jsonb_build_object(
    'period_status',    'OPEN',
    'reason',           btrim(p_reason),
    'weeks_unlocked',   v_weeks_unlocked,
    'records_unlocked', v_records_unlocked
  );

  INSERT INTO payroll_audit_log (
    record_id, action, before, after, actor, organization_id
  ) VALUES (
    NULL,
    'UNLOCK_PAID',
    v_audit_before,
    v_audit_after,
    v_actor,
    v_period.organization_id
  );

  RETURN jsonb_build_object(
    'period_id',        p_period_id,
    'period_code',      v_period.period_code,
    'weeks_unlocked',   v_weeks_unlocked,
    'records_unlocked', v_records_unlocked,
    'reason',           btrim(p_reason),
    'actor',            v_actor,
    'at',               now()
  );
END;
$$;


ALTER FUNCTION "public"."pay_unlock_period"("p_period_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pay_validate_archive_all"("p_notes" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  v_run_id            uuid := gen_random_uuid();
  v_total             int  := 0;
  v_eligible          int  := 0;
  v_match             int  := 0;
  v_diverge           int  := 0;
  v_skip              int  := 0;
  v_diverge_detail    jsonb := '[]'::jsonb;
  v_match_rate        numeric(5,2);
  v_gate              boolean;

  rec                 payroll_archive%ROWTYPE;
  v_emp               employees%ROWTYPE;
  v_pr                payroll_records%ROWTYPE;
  calc                public.pay_components;
  v_diff              numeric;
BEGIN
  FOR rec IN
    SELECT * FROM public.payroll_archive ORDER BY week_start, legacy_agent_id
  LOOP
    v_total := v_total + 1;

    IF rec.employee_id IS NULL THEN
      v_skip := v_skip + 1;
      CONTINUE;
    END IF;

    SELECT * INTO v_emp FROM public.employees WHERE id = rec.employee_id LIMIT 1;
    IF NOT FOUND THEN
      v_skip := v_skip + 1;
      CONTINUE;
    END IF;

    v_eligible := v_eligible + 1;

    -- Phase 4b: engine uses monthly_base_salary, not weekly_base_salary
    v_emp.monthly_base_salary := rec.weekly_base * 4;
    -- Use archived KPI amount, not current employee setting
    v_emp.kpi_bonus_amount    := COALESCE(rec.kpi_bonus, 0);

    v_pr.include_in_payroll := rec.include_in_payroll;
    v_pr.missed_days        := rec.missed_days;
    v_pr.overtime_days      := 0;
    v_pr.sundays_worked     := rec.sundays_worked;
    v_pr.vacation_days      := rec.vacation_days;
    v_pr.holiday_days       := rec.holiday_days;
    v_pr.kpi_achieved       := rec.kpi_achieved;
    v_pr.partial_week_days  := rec.partial_week_days;
    v_pr.commission         := COALESCE(rec.commission, 0);
    -- Phase 4b removed OT from engine; roll archived overtime into extra_bonus
    v_pr.extra_bonus        := COALESCE(rec.extra_bonus, 0) + COALESCE(rec.overtime_pay, 0);

    calc := public._calc_pay_components(v_emp, v_pr);

    v_diff := abs(calc.total_pay - rec.total_pay);

    -- $1.00 tolerance: Joe rounds to whole pesos; LFT fractions produce cents
    IF v_diff <= 1.00 THEN
      v_match := v_match + 1;
    ELSE
      v_diverge := v_diverge + 1;
      v_diverge_detail := v_diverge_detail || jsonb_build_object(
        'archive_id',       rec.id,
        'period_code',      rec.period_code,
        'week_label',       rec.week_label,
        'legacy_agent_id',  rec.legacy_agent_id,
        'agent_name',       rec.agent_name,
        'joe_total',        rec.total_pay,
        'engine_total',     calc.total_pay,
        'diff',             round(v_diff, 2),
        'components', jsonb_build_object(
          'engine_weekly_base',      calc.weekly_base,
          'engine_missed_deduction', calc.missed_deduction,
          'engine_kpi_bonus',        calc.kpi_bonus,
          'engine_overtime_pay',     calc.overtime_pay,
          'engine_sunday_pay',       calc.sunday_pay,
          'engine_commission',       calc.commission
        ),
        'joe_components', jsonb_build_object(
          'joe_weekly_base',      rec.weekly_base,
          'joe_kpi_bonus',        rec.kpi_bonus,
          'joe_overtime_pay',     rec.overtime_pay,
          'joe_sunday_pay',       rec.sunday_pay,
          'joe_commission',       rec.commission
        ),
        'inputs', jsonb_build_object(
          'missed_days',              rec.missed_days,
          'sundays_worked',           rec.sundays_worked,
          'kpi_achieved',             rec.kpi_achieved,
          'extra_bonus',              rec.extra_bonus,
          'partial_week_days',        rec.partial_week_days,
          'commission',               rec.commission,
          'overtime_pay_in_extra',    rec.overtime_pay
        ),
        'rates_used', jsonb_build_object(
          'archive_weekly_base', rec.weekly_base,
          'derived_monthly',     rec.weekly_base * 4,
          'kpi_bonus_amount',    v_emp.kpi_bonus_amount
        )
      );
    END IF;

  END LOOP;

  IF v_eligible = 0 THEN
    v_match_rate := 0;
  ELSE
    v_match_rate := round((v_match::numeric / v_eligible::numeric) * 100, 2);
  END IF;

  v_gate := (v_match_rate >= 95.00);

  INSERT INTO public.payroll_validation_runs (
    id, run_at, run_by, notes,
    total_archive_rows, replay_eligible, match_count, diverge_count, skip_count,
    match_rate_pct, gate_passed, diverge_detail
  ) VALUES (
    v_run_id, now(), auth.uid(), p_notes,
    v_total, v_eligible, v_match, v_diverge, v_skip,
    v_match_rate, v_gate, v_diverge_detail
  );

  RETURN v_run_id;
END;
$_$;


ALTER FUNCTION "public"."pay_validate_archive_all"("p_notes" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."pay_validate_archive_all"("p_notes" "text") IS 'Replays _calc_pay_components() against every payroll_archive row with a matched employee. Overrides weekly_base_salary from the archive to guard against rate drift. Gate: match_rate_pct >= 95 AND diverge_count = 0. Returns the run_id.';



CREATE OR REPLACE FUNCTION "public"."payroll_audit_log_immutable"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RAISE EXCEPTION
    'payroll_audit_log is append-only: UPDATE and DELETE are not permitted'
    USING ERRCODE = '23514';
END;
$$;


ALTER FUNCTION "public"."payroll_audit_log_immutable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."payroll_records_paid_lock"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF OLD.status = 'PAID'
     AND COALESCE(current_setting('jpayroll.unlocking', true), 'false') <> 'true' THEN
    RAISE EXCEPTION
      'Cannot modify a PAID payroll record. Unlock the pay period first.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."payroll_records_paid_lock"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."payroll_records_recalc_trigger_fn"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  e        public.employees;
  c        public.pay_components;
  old_calc jsonb;
BEGIN
  -- Guard 1 (UPDATE only): skip if no input column changed
  IF TG_OP = 'UPDATE' THEN
    IF (
      OLD.include_in_payroll   IS NOT DISTINCT FROM NEW.include_in_payroll  AND
      OLD.missed_days          IS NOT DISTINCT FROM NEW.missed_days         AND
      OLD.overtime_days        IS NOT DISTINCT FROM NEW.overtime_days       AND
      OLD.sundays_worked       IS NOT DISTINCT FROM NEW.sundays_worked      AND
      OLD.vacation_days        IS NOT DISTINCT FROM NEW.vacation_days       AND
      OLD.holiday_days         IS NOT DISTINCT FROM NEW.holiday_days        AND
      OLD.kpi_achieved         IS NOT DISTINCT FROM NEW.kpi_achieved        AND
      OLD.extra_bonus          IS NOT DISTINCT FROM NEW.extra_bonus         AND
      OLD.partial_week_days    IS NOT DISTINCT FROM NEW.partial_week_days   AND
      OLD.custom_deduction     IS NOT DISTINCT FROM NEW.custom_deduction
    ) THEN
      RETURN NEW;
    END IF;

    -- Guard 2: PAID rows are immutable — silent no-op
    IF OLD.status = 'PAID' THEN
      RETURN OLD;
    END IF;
  END IF;

  -- Guard 3 (INSERT only): skip if inserted as PAID
  IF TG_OP = 'INSERT' AND NEW.status = 'PAID' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO e FROM public.employees WHERE id = NEW.employee_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employee % not found for payroll record.',
      NEW.employee_id
      USING ERRCODE = 'P0002';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    old_calc := jsonb_build_object(
      'weekly_base',      OLD.weekly_base,
      'kpi_bonus',        OLD.kpi_bonus,
      'missed_deduction', OLD.missed_deduction,
      'overtime_pay',     OLD.overtime_pay,
      'sunday_pay',       OLD.sunday_pay,
      'vacation_pay',     OLD.vacation_pay,
      'holiday_pay',      OLD.holiday_pay,
      'total_pay',        OLD.total_pay
    );
  ELSE
    old_calc := '{}'::jsonb;
  END IF;

  c := public._calc_pay_components(e, NEW);

  NEW.weekly_base      := c.weekly_base;
  NEW.kpi_bonus        := c.kpi_bonus;
  NEW.missed_deduction := c.missed_deduction;
  NEW.overtime_pay     := c.overtime_pay;
  NEW.sunday_pay       := c.sunday_pay;
  NEW.vacation_pay     := c.vacation_pay;
  NEW.holiday_pay      := c.holiday_pay;
  NEW.total_pay        := c.total_pay;

  INSERT INTO public.payroll_audit_log
    (record_id, action, before, after, actor, organization_id)
  VALUES (
    NEW.id,
    'RECALC',
    old_calc,
    jsonb_build_object(
      'weekly_base',      NEW.weekly_base,
      'kpi_bonus',        NEW.kpi_bonus,
      'missed_deduction', NEW.missed_deduction,
      'overtime_pay',     NEW.overtime_pay,
      'sunday_pay',       NEW.sunday_pay,
      'vacation_pay',     NEW.vacation_pay,
      'holiday_pay',      NEW.holiday_pay,
      'total_pay',        NEW.total_pay
    ),
    auth.uid(),
    NEW.organization_id
  );

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."payroll_records_recalc_trigger_fn"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."payroll_records_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."payroll_records_set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recruiting_set_stage_changed_at"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.stage IS DISTINCT FROM OLD.stage THEN
    NEW.stage_changed_at := now();
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."recruiting_set_stage_changed_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recruiting_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."recruiting_set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."request_holiday_off"("p_campaign_id" "uuid", "p_holiday_date" "date", "p_holiday_name" "text") RETURNS "public"."holiday_request_status"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_employee_id    uuid;
  v_headcount      int;
  v_cap            int;
  v_approved_count int;
  v_status         public.holiday_request_status;
BEGIN
  v_employee_id := public.my_employee_id();
  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'No employee record found for current user';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.holiday_requests
    WHERE employee_id = v_employee_id
      AND campaign_id = p_campaign_id
      AND holiday_date = p_holiday_date
      AND status NOT IN ('cancelled', 'denied')
  ) THEN
    RAISE EXCEPTION 'You already have an active request for this holiday';
  END IF;

  SELECT COUNT(*) INTO v_headcount
  FROM public.employees
  WHERE campaign_id = p_campaign_id AND is_active = true;

  v_cap := GREATEST(1, FLOOR(v_headcount * 0.20));

  SELECT COUNT(*) INTO v_approved_count
  FROM public.holiday_requests
  WHERE campaign_id = p_campaign_id
    AND holiday_date = p_holiday_date
    AND status = 'approved';

  v_status := CASE WHEN v_approved_count < v_cap THEN 'approved' ELSE 'pending_tl' END;

  INSERT INTO public.holiday_requests(
    employee_id, campaign_id, holiday_date, holiday_name, status
  ) VALUES (
    v_employee_id, p_campaign_id, p_holiday_date, p_holiday_name, v_status
  );

  RETURN v_status;
END;
$$;


ALTER FUNCTION "public"."request_holiday_off"("p_campaign_id" "uuid", "p_holiday_date" "date", "p_holiday_name" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vacation_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "days_requested" integer NOT NULL,
    "status" "text" DEFAULT 'pending_tl'::"text" NOT NULL,
    "notes" "text",
    "tl_reviewed_by" "uuid",
    "tl_reviewed_at" timestamp with time zone,
    "hr_reviewed_by" "uuid",
    "hr_reviewed_at" timestamp with time zone,
    "denial_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "request_type" "text" DEFAULT 'vacation'::"text" NOT NULL,
    "is_paid" boolean DEFAULT true NOT NULL,
    CONSTRAINT "vacation_only_paid_type" CHECK ((("is_paid" = false) OR ("request_type" = 'vacation'::"text"))),
    CONSTRAINT "vacation_requests_request_type_check" CHECK (("request_type" = ANY (ARRAY['vacation'::"text", 'sick'::"text", 'personal'::"text", 'other'::"text"]))),
    CONSTRAINT "vacation_requests_status_check" CHECK (("status" = ANY (ARRAY['pending_tl'::"text", 'pending_hr'::"text", 'approved'::"text", 'denied'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "vacation_valid_dates" CHECK (("end_date" >= "start_date"))
);


ALTER TABLE "public"."vacation_requests" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."request_vacation_off"("p_employee_id" "uuid", "p_campaign_id" "uuid", "p_start_date" "date", "p_end_date" "date", "p_notes" "text" DEFAULT NULL::"text") RETURNS "public"."vacation_requests"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_days        integer;
  v_balance     record;
  v_overlap     integer;
  v_result      public.vacation_requests;
BEGIN
  IF p_employee_id IS DISTINCT FROM public.my_employee_id() THEN
    RAISE EXCEPTION 'Forbidden: you may only file vacation requests for yourself'
      USING ERRCODE = '42501';
  END IF;

  IF p_end_date < p_start_date THEN
    RAISE EXCEPTION 'end_date must be >= start_date' USING ERRCODE = 'P0001';
  END IF;

  IF p_start_date < (CURRENT_DATE + INTERVAL '21 days')::date THEN
    RAISE EXCEPTION 'Vacation must be requested at least 21 days in advance' USING ERRCODE = 'P0001';
  END IF;

  v_days := (p_end_date - p_start_date + 1);

  SELECT * INTO v_balance FROM public.get_vacation_balance(p_employee_id);

  IF v_balance.available_days < v_days THEN
    RAISE EXCEPTION 'Insufficient vacation balance (% days requested, % available)',
      v_days, v_balance.available_days USING ERRCODE = 'P0001';
  END IF;

  SELECT COUNT(*) INTO v_overlap
  FROM public.vacation_requests
  WHERE employee_id = p_employee_id
    AND status NOT IN ('denied', 'cancelled')
    AND start_date <= p_end_date
    AND end_date   >= p_start_date;

  IF v_overlap > 0 THEN
    RAISE EXCEPTION 'You already have a vacation request overlapping those dates' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.vacation_requests
    (employee_id, campaign_id, start_date, end_date, days_requested, notes, status)
  VALUES
    (p_employee_id, p_campaign_id, p_start_date, p_end_date, v_days, p_notes, 'pending_tl')
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."request_vacation_off"("p_employee_id" "uuid", "p_campaign_id" "uuid", "p_start_date" "date", "p_end_date" "date", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."request_vacation_off"("p_employee_id" "uuid", "p_campaign_id" "uuid", "p_start_date" "date", "p_end_date" "date", "p_notes" "text" DEFAULT NULL::"text", "p_request_type" "text" DEFAULT 'vacation'::"text") RETURNS "public"."vacation_requests"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_days        integer;
  v_balance     record;
  v_overlap     integer;
  v_result      public.vacation_requests;
  v_is_paid     boolean;
  v_min_notice  integer;
  v_type_label  text;
BEGIN
  -- Self-service only
  IF p_employee_id IS DISTINCT FROM public.my_employee_id() THEN
    RAISE EXCEPTION 'Forbidden: you may only file time-off requests for yourself'
      USING ERRCODE = '42501';
  END IF;

  IF p_request_type NOT IN ('vacation','sick','personal','other') THEN
    RAISE EXCEPTION 'Invalid request_type: %', p_request_type USING ERRCODE = 'P0001';
  END IF;

  IF p_end_date < p_start_date THEN
    RAISE EXCEPTION 'end_date must be >= start_date' USING ERRCODE = 'P0001';
  END IF;

  -- Notice rule: Vacation 21 days (LFT), everything else 7 days
  v_min_notice := CASE WHEN p_request_type = 'vacation' THEN 21 ELSE 7 END;
  v_type_label := CASE WHEN p_request_type = 'vacation' THEN 'Vacation' ELSE initcap(p_request_type) || ' leave' END;

  IF p_start_date < (CURRENT_DATE + (v_min_notice || ' days')::interval)::date THEN
    RAISE EXCEPTION '% requires at least % days notice', v_type_label, v_min_notice
      USING ERRCODE = 'P0001';
  END IF;

  v_days := (p_end_date - p_start_date + 1);

  IF p_request_type = 'vacation' THEN
    SELECT * INTO v_balance FROM public.get_vacation_balance(p_employee_id);

    IF v_balance.years_of_service < 1 THEN
      RAISE EXCEPTION 'Paid vacation requires at least 1 year of service' USING ERRCODE = 'P0001';
    END IF;

    IF v_balance.available_days < v_days THEN
      RAISE EXCEPTION 'Insufficient vacation balance (% days requested, % available)',
        v_days, v_balance.available_days USING ERRCODE = 'P0001';
    END IF;

    v_is_paid := true;
  ELSE
    v_is_paid := false;
  END IF;

  SELECT COUNT(*) INTO v_overlap
  FROM public.vacation_requests
  WHERE employee_id = p_employee_id
    AND status NOT IN ('denied', 'cancelled')
    AND start_date <= p_end_date
    AND end_date   >= p_start_date;

  IF v_overlap > 0 THEN
    RAISE EXCEPTION 'You already have a time-off request overlapping those dates' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.vacation_requests
    (employee_id, campaign_id, start_date, end_date, days_requested, notes, status, request_type, is_paid)
  VALUES
    (p_employee_id, p_campaign_id, p_start_date, p_end_date, v_days, p_notes, 'pending_tl', p_request_type, v_is_paid)
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."request_vacation_off"("p_employee_id" "uuid", "p_campaign_id" "uuid", "p_start_date" "date", "p_end_date" "date", "p_notes" "text", "p_request_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sda_fill_defaults"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    SELECT e.organization_id INTO NEW.organization_id
    FROM public.employees e
    WHERE e.id = NEW.acknowledged_by;
  END IF;
  NEW.acknowledged_by_user_id := auth.uid();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sda_fill_defaults"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."seed_agent_reviews"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_due_offsets int[] := ARRAY[7, 14, 21, 29];
  v_week int;
BEGIN
  IF NEW.hire_date IS NULL OR NEW.campaign_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.hire_date IS NOT NULL THEN
    RETURN NEW;
  END IF;
  FOR v_week IN 1..4 LOOP
    INSERT INTO public.agent_reviews (employee_id, campaign_id, week_number, due_date)
    VALUES (NEW.id, NEW.campaign_id, v_week, NEW.hire_date + v_due_offsets[v_week])
    ON CONFLICT (employee_id, week_number) DO NOTHING;
  END LOOP;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."seed_agent_reviews"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_bulletin_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_bulletin_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_employee_organization_id"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := public.my_org_id();
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_employee_organization_id"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."set_employee_organization_id"() IS 'Fills NEW.organization_id with my_org_id() when null so RLS INSERT policy passes for client paths that omit it.';



CREATE OR REPLACE FUNCTION "public"."set_payroll_period_org"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.organization_id is null then
    new.organization_id := public.my_org_id();
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."set_payroll_period_org"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_employee_is_active"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.is_active := (NEW.employment_status = 'active');

  IF NEW.employment_status <> 'active' AND OLD.employment_status = 'active' THEN
    IF NEW.terminated_at IS NULL THEN
      NEW.terminated_at := NOW();
    END IF;
    IF NEW.terminated_by IS NULL THEN
      NEW.terminated_by := auth.uid();
    END IF;
  END IF;

  IF NEW.employment_status = 'active' AND OLD.employment_status <> 'active' THEN
    NEW.terminated_at := NULL;
    NEW.terminated_by := NULL;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_employee_is_active"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_reports_to_from_campaign"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  new_tl uuid;
BEGIN
  IF new.campaign_id IS NULL THEN
    new.reports_to := NULL;
    RETURN new;
  END IF;
  -- TL doesn't report to self
  IF EXISTS (SELECT 1 FROM campaigns WHERE id = new.campaign_id AND team_lead_id = new.id) THEN
    RETURN new;
  END IF;
  SELECT team_lead_id INTO new_tl FROM campaigns WHERE id = new.campaign_id;
  new.reports_to := new_tl;
  RETURN new;
END;
$$;


ALTER FUNCTION "public"."sync_reports_to_from_campaign"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_user_profile_role"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  if new.employee_id is not null then
    select title into new.role from public.employees where id = new.employee_id;
    if new.role is null then new.role := 'agent'; end if;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."sync_user_profile_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tg_time_clock_set_lateness"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_campaign_id   uuid;
  v_start_time    time;
  v_grace_minutes integer;
  v_threshold     timestamptz;
BEGIN
  -- 1. Find this employee's current campaign.
  SELECT e.campaign_id INTO v_campaign_id
  FROM public.employees e
  WHERE e.id = NEW.employee_id;

  IF v_campaign_id IS NULL THEN
    NEW.is_late := false;
    NEW.late_minutes := 0;
    RETURN NEW;
  END IF;

  -- 2. Look up the campaign's shift_settings (1 row per campaign today;
  --    when the schedule-override plan ships, this lookup will need to
  --    consider per-week overrides too).
  SELECT s.start_time, COALESCE(s.grace_minutes, 0)
    INTO v_start_time, v_grace_minutes
  FROM public.shift_settings s
  WHERE s.campaign_id = v_campaign_id
  LIMIT 1;

  IF v_start_time IS NULL THEN
    NEW.is_late := false;
    NEW.late_minutes := 0;
    RETURN NEW;
  END IF;

  -- 3. Combine the local-date column with shift start_time. Interpret as
  --    America/Mexico_City local time (matches the rest of the app's
  --    timezone assumptions — all agents in Guadalajara). Convert to UTC,
  --    then add the grace window.
  v_threshold :=
    ((NEW.date::timestamp + v_start_time::interval)
       AT TIME ZONE 'America/Mexico_City')
    + (v_grace_minutes || ' minutes')::interval;

  IF NEW.clock_in > v_threshold THEN
    NEW.is_late := true;
    NEW.late_minutes :=
      FLOOR(EXTRACT(EPOCH FROM (NEW.clock_in - v_threshold)) / 60)::integer;
  ELSE
    NEW.is_late := false;
    NEW.late_minutes := 0;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."tg_time_clock_set_lateness"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."tg_time_clock_set_lateness"() IS 'Sets is_late / late_minutes on time_clock rows from shift_settings. Authoritative — overwrites whatever the client passed. Closes H-3.';



CREATE OR REPLACE FUNCTION "public"."tl_employee_on_my_team"("p_employee_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.id = p_employee_id
      AND e.organization_id = public.my_org_id()
      AND e.campaign_id IN (SELECT public.my_tl_campaign_ids())
  );
$$;


ALTER FUNCTION "public"."tl_employee_on_my_team"("p_employee_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."tl_employee_on_my_team"("p_employee_id" "uuid") IS 'Returns true if the given employee belongs to a campaign the current auth user is team_lead of. SECURITY DEFINER to bypass employees RLS — the A1 hardening prevents TLs from SELECTing the base table. Used by TL-facing policies across hr_document_requests, cartas_compromiso, actas_administrativas, resignation_packets, attendance_incidents, employee_documents, and storage.';



CREATE OR REPLACE FUNCTION "public"."trg_employees_derive_pay_rates"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.monthly_base_salary IS NOT NULL AND NEW.monthly_base_salary > 0 THEN
    NEW.weekly_base_salary  := round(NEW.monthly_base_salary / 4.0,  2);
    NEW.daily_salary        := round(NEW.monthly_base_salary / 30.0, 2);
    NEW.daily_discount_rate := round(NEW.monthly_base_salary / 30.0, 2);
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trg_employees_derive_pay_rates"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_payroll_archive_readonly"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RAISE EXCEPTION 'payroll_archive is read-only. Source: Joe''s Sheets import 2026-05-19. To amend, contact admin.';
END;
$$;


ALTER FUNCTION "public"."trg_payroll_archive_readonly"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_payroll_records_recalc_fn"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_emp  employees%ROWTYPE;
  c      public.pay_components;
BEGIN
  SELECT * INTO v_emp FROM public.employees WHERE id = NEW.employee_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  c := public._calc_pay_components(v_emp, NEW);

  NEW.weekly_base      := c.weekly_base;
  NEW.kpi_bonus        := c.kpi_bonus;
  NEW.missed_deduction := c.missed_deduction;
  NEW.overtime_pay     := c.overtime_pay;
  NEW.sunday_pay       := c.sunday_pay;
  NEW.vacation_pay     := c.vacation_pay;
  NEW.holiday_pay      := c.holiday_pay;
  NEW.total_pay        := c.total_pay;

  -- Auto-set commission anomaly flag
  NEW.commission_flag := public.check_commission_flag(
    NEW.employee_id,
    COALESCE(NEW.commission, 0),
    NEW.id
  );

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trg_payroll_records_recalc_fn"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_employee_personal_info"("p_employee_uuid" "uuid", "p_work_name" "text" DEFAULT NULL::"text", "p_personal_email" "text" DEFAULT NULL::"text", "p_phone" "text" DEFAULT NULL::"text", "p_address" "text" DEFAULT NULL::"text", "p_emergency_contact" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  v_target_org uuid;
  v_target_campaign uuid;
  v_my_employee_id uuid := my_employee_id();
  v_my_org uuid := my_org_id();
  v_allowed boolean := false;
  v_email_clean text;
  v_phone_clean text;
  v_work_name_clean text;
  v_address_clean text;
  v_emergency_clean text;
begin
  select organization_id, campaign_id
    into v_target_org, v_target_campaign
  from public.employees
  where id = p_employee_uuid;

  if v_target_org is null then
    raise exception 'employee not found' using errcode = 'P0002';
  end if;

  if v_target_org <> v_my_org then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if is_leadership() then
    v_allowed := true;
  elsif v_my_employee_id is not null and v_my_employee_id = p_employee_uuid then
    v_allowed := true;
  elsif is_team_lead() and (
      v_target_campaign in (select my_tl_campaign_ids())
      or p_employee_uuid in (select my_team_member_ids())
  ) then
    v_allowed := true;
  end if;

  if not v_allowed then
    raise exception 'not authorized to update this employee' using errcode = '42501';
  end if;

  v_work_name_clean  := case when p_work_name is null then null
                             when length(trim(p_work_name)) = 0 then null
                             else trim(p_work_name) end;
  v_address_clean    := case when p_address is null then null
                             when length(trim(p_address)) = 0 then null
                             else trim(p_address) end;
  v_emergency_clean  := case when p_emergency_contact is null then null
                             when length(trim(p_emergency_contact)) = 0 then null
                             else trim(p_emergency_contact) end;

  if p_personal_email is null then
    v_email_clean := null;
  elsif length(trim(p_personal_email)) = 0 then
    v_email_clean := '';
  else
    if trim(p_personal_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
      raise exception 'invalid email format' using errcode = '22023';
    end if;
    v_email_clean := trim(p_personal_email);
  end if;

  if p_phone is null then
    v_phone_clean := null;
  elsif length(regexp_replace(p_phone, '[[:space:]-]', '', 'g')) = 0 then
    v_phone_clean := '';
  else
    v_phone_clean := regexp_replace(p_phone, '[[:space:]-]', '', 'g');
    if v_phone_clean !~ '^[0-9]{10}$' then
      raise exception 'phone must be 10 digits' using errcode = '22023';
    end if;
  end if;

  update public.employees
  set
    work_name = case
      when p_work_name is null then work_name
      when v_work_name_clean is null then null
      else v_work_name_clean
    end,
    personal_email = case
      when p_personal_email is null then personal_email
      when v_email_clean = '' then null
      else v_email_clean
    end,
    phone = case
      when p_phone is null then phone
      when v_phone_clean = '' then null
      else v_phone_clean
    end,
    address = case
      when p_address is null then address
      when v_address_clean is null then null
      else v_address_clean
    end,
    emergency_contact = case
      when p_emergency_contact is null then emergency_contact
      when v_emergency_clean is null then null
      else v_emergency_clean
    end
  where id = p_employee_uuid;
end;
$_$;


ALTER FUNCTION "public"."update_employee_personal_info"("p_employee_uuid" "uuid", "p_work_name" "text", "p_personal_email" "text", "p_phone" "text", "p_address" "text", "p_emergency_contact" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."update_employee_personal_info"("p_employee_uuid" "uuid", "p_work_name" "text", "p_personal_email" "text", "p_phone" "text", "p_address" "text", "p_emergency_contact" "text") IS 'TL/self/leadership update of 5 contact fields on employees. Whitelist enforced inside function. See SECURITY_AUDIT_2026-05-18.md.';



CREATE OR REPLACE FUNCTION "public"."update_my_goal"("p_personal_goal" "text" DEFAULT NULL::"text", "p_goal_visible_to_tl" boolean DEFAULT NULL::boolean, "p_dismiss" boolean DEFAULT false, "p_clear_goal" boolean DEFAULT false) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_emp_id uuid := public.my_employee_id();
  v_trimmed text;
BEGIN
  IF v_emp_id IS NULL THEN
    RAISE EXCEPTION 'No employee row for current auth user';
  END IF;

  -- Normalize the goal text
  v_trimmed := NULLIF(BTRIM(COALESCE(p_personal_goal, '')), '');

  UPDATE public.employees
  SET
    personal_goal = CASE
      WHEN p_clear_goal THEN NULL
      WHEN p_personal_goal IS NOT NULL THEN v_trimmed
      ELSE personal_goal
    END,
    goal_set_at = CASE
      WHEN p_clear_goal THEN NULL
      WHEN p_personal_goal IS NOT NULL AND v_trimmed IS NOT NULL THEN now()
      ELSE goal_set_at
    END,
    goal_visible_to_tl = CASE
      WHEN p_goal_visible_to_tl IS NOT NULL THEN p_goal_visible_to_tl
      ELSE goal_visible_to_tl
    END,
    goal_prompt_dismissed = CASE
      -- Setting a non-empty goal implies the prompt is handled, regardless of p_dismiss
      WHEN p_personal_goal IS NOT NULL AND v_trimmed IS NOT NULL THEN true
      WHEN p_dismiss THEN true
      ELSE goal_prompt_dismissed
    END
  WHERE id = v_emp_id;
END;
$$;


ALTER FUNCTION "public"."update_my_goal"("p_personal_goal" "text", "p_goal_visible_to_tl" boolean, "p_dismiss" boolean, "p_clear_goal" boolean) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."update_my_goal"("p_personal_goal" "text", "p_goal_visible_to_tl" boolean, "p_dismiss" boolean, "p_clear_goal" boolean) IS 'Agents can update only their own goal fields. Security definer because RLS on employees does not allow agents to UPDATE their own row.';



CREATE OR REPLACE FUNCTION "public"."weekly_invoice_preview"("p_monday" "date", "p_sunday" "date") RETURNS TABLE("client_id" "uuid", "client_prefix" "text", "client_name" "text", "employee_id" "uuid", "employee_code" "text", "employee_name" "text", "campaign_id" "uuid", "campaign_name" "text", "daily_bill_rate" numeric, "days_worked" numeric, "existing_invoice_id" "uuid", "is_flat_bill" boolean, "flat_amount" numeric)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    cl.id, cl.prefix, cl.name,
    e.id, e.employee_id, e.full_name,
    c.id, c.name, e.daily_bill_rate,
    COALESCE((
      SELECT count(DISTINCT tc.date)::numeric
      FROM time_clock tc
      WHERE tc.employee_id = e.id
        AND tc.date BETWEEN p_monday AND p_sunday
        AND tc.date >= eca.start_date
        AND tc.date <= COALESCE(eca.end_date, '9999-12-31'::date)
    ), 0),
    (SELECT i.id FROM invoices i WHERE i.client_id = cl.id AND i.week_start = p_monday AND i.week_end = p_sunday LIMIT 1),
    false,
    0::numeric
  FROM employees e
  JOIN employee_campaign_assignments eca ON eca.employee_id = e.id
  JOIN campaigns c ON c.id = eca.campaign_id
  JOIN clients cl ON cl.id = c.client_id
  WHERE e.is_system_user = false
    AND cl.is_billable = true
    AND eca.start_date <= p_sunday
    AND (eca.end_date IS NULL OR eca.end_date >= p_monday)
    AND (
      -- Active employee whose employment window overlaps the period
      (
        e.is_active = true
        AND (e.hire_date IS NULL OR e.hire_date <= p_sunday)
        AND (e.last_worked_day IS NULL OR e.last_worked_day >= p_monday)
      )
      -- OR anyone (active or departed) who actually punched in the period
      OR EXISTS (
        SELECT 1 FROM time_clock tc
        WHERE tc.employee_id = e.id
          AND tc.date BETWEEN p_monday AND p_sunday
          AND tc.date >= eca.start_date
          AND tc.date <= COALESCE(eca.end_date, '9999-12-31'::date)
      )
    )

  UNION ALL

  SELECT
    cl.id, cl.prefix, cl.name, e.id, e.employee_id, e.full_name,
    NULL::uuid, '— flat bill —',
    0::numeric, 0::numeric,
    (SELECT i.id FROM invoices i WHERE i.client_id = cl.id AND i.week_start = p_monday AND i.week_end = p_sunday LIMIT 1),
    true,
    e.flat_weekly_bill_amount
  FROM employees e
  JOIN clients cl ON cl.id = e.flat_bill_client_id
  WHERE e.is_active = true
    AND e.is_system_user = false
    AND cl.is_billable = true
    AND e.flat_weekly_bill_amount > 0
    AND (e.hire_date IS NULL OR e.hire_date <= p_sunday)
    AND (e.last_worked_day IS NULL OR e.last_worked_day >= p_monday)

  ORDER BY 3, 6;
END;
$$;


ALTER FUNCTION "public"."weekly_invoice_preview"("p_monday" "date", "p_sunday" "date") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."_legacy_time_off_requests" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "reason" "text" NOT NULL,
    "notes" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "chk_time_off_dates" CHECK (("end_date" >= "start_date")),
    CONSTRAINT "time_off_requests_reason_check" CHECK (("reason" = ANY (ARRAY['vacation'::"text", 'sick'::"text", 'personal'::"text", 'other'::"text"]))),
    CONSTRAINT "time_off_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'denied'::"text"])))
);


ALTER TABLE "public"."_legacy_time_off_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."actas_administrativas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "request_id" "uuid",
    "doc_ref" "text",
    "incident_date" "date" NOT NULL,
    "narrative" "text",
    "witnesses" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "reincidencia_prior_carta_id" "uuid",
    "trabajador_name_snapshot" "text",
    "puesto_snapshot" "text",
    "horario_snapshot" "text",
    "supervisor_name_snapshot" "text",
    "company_legal_name_snapshot" "text",
    "company_legal_address_snapshot" "text",
    "incident_date_long_snapshot" "text",
    "pdf_path" "text",
    "signed_at" timestamp with time zone,
    "signed_scan_path" "text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "actas_administrativas_check" CHECK ((("signed_at" IS NULL) = ("signed_scan_path" IS NULL)))
);


ALTER TABLE "public"."actas_administrativas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agent_coaching_notes" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "agent_id" "uuid" NOT NULL,
    "author_id" "uuid" NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "entry_type" "text" DEFAULT 'note'::"text" NOT NULL,
    "note" "text" NOT NULL,
    "visible_to_agent" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."agent_coaching_notes" OWNER TO "postgres";


COMMENT ON TABLE "public"."agent_coaching_notes" IS 'Agent Log entries — TL/HR notes and verbal warnings about an agent. Some are visible_to_agent for transparent communication; others are private HR documentation. Restored 2026-05-21 after an over-broad drop.';



CREATE TABLE IF NOT EXISTS "public"."agent_review_notifications_sent" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "review_id" "uuid" NOT NULL,
    "notification_type" "public"."review_notification_type" NOT NULL,
    "recipient_employee_id" "uuid" NOT NULL,
    "recipient_email" "text" NOT NULL,
    "send_date" "date" NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."agent_review_notifications_sent" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agent_reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "week_number" smallint NOT NULL,
    "due_date" "date" NOT NULL,
    "attendance_score" smallint,
    "kpi_score" smallint,
    "attitude_score" smallint,
    "notes" "text",
    "decision" "public"."review_decision",
    "decision_reason" "text",
    "termination_status" "public"."review_termination_status",
    "hr_decided_by" "uuid",
    "hr_decided_at" timestamp with time zone,
    "hr_decision_notes" "text",
    "extension_days" smallint,
    "reviewed_by" "uuid",
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "agent_reviews_attendance_score_check" CHECK ((("attendance_score" >= 1) AND ("attendance_score" <= 5))),
    CONSTRAINT "agent_reviews_attitude_score_check" CHECK ((("attitude_score" >= 1) AND ("attitude_score" <= 5))),
    CONSTRAINT "agent_reviews_decision_only_on_final" CHECK ((("decision" IS NULL) OR ("week_number" >= 4))),
    CONSTRAINT "agent_reviews_extension_days_check" CHECK ((("extension_days" IS NULL) OR (("extension_days" >= 1) AND ("extension_days" <= 60)))),
    CONSTRAINT "agent_reviews_kpi_score_check" CHECK ((("kpi_score" >= 1) AND ("kpi_score" <= 5))),
    CONSTRAINT "agent_reviews_week_number_check" CHECK ((("week_number" >= 1) AND ("week_number" <= 8)))
);


ALTER TABLE "public"."agent_reviews" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."app_config" (
    "key" "text" NOT NULL,
    "value" "text" NOT NULL
);


ALTER TABLE "public"."app_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."attendance_incidents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "incident_type" "text" NOT NULL,
    "notes" "text",
    "supporting_doc_path" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source" "text" DEFAULT 'manual'::"text" NOT NULL,
    CONSTRAINT "attendance_incidents_incident_type_check" CHECK (("incident_type" = ANY (ARRAY['late'::"text", 'sick'::"text", 'no_call_no_show'::"text", 'medical_leave'::"text", 'personal'::"text", 'bereavement'::"text", 'other'::"text"]))),
    CONSTRAINT "attendance_incidents_source_check" CHECK (("source" = ANY (ARRAY['manual'::"text", 'auto_detection'::"text"])))
);


ALTER TABLE "public"."attendance_incidents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bulletin_acks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "post_id" "uuid" NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "acked_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."bulletin_acks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bulletin_posts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "type" "text" DEFAULT 'announcement'::"text" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text" DEFAULT ''::"text" NOT NULL,
    "author_id" "uuid",
    "campaign_id" "uuid",
    "requires_ack" boolean DEFAULT true NOT NULL,
    "is_published" boolean DEFAULT false NOT NULL,
    "published_at" timestamp with time zone,
    "expires_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "recognized_employee_id" "uuid",
    CONSTRAINT "bulletin_posts_type_check" CHECK (("type" = ANY (ARRAY['announcement'::"text", 'questionnaire'::"text", 'recognition'::"text"])))
);


ALTER TABLE "public"."bulletin_posts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bulletin_questions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "post_id" "uuid" NOT NULL,
    "question_text" "text" NOT NULL,
    "type" "text" DEFAULT 'open_ended'::"text" NOT NULL,
    "options" "jsonb",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "bulletin_questions_type_check" CHECK (("type" = ANY (ARRAY['multiple_choice'::"text", 'open_ended'::"text"])))
);


ALTER TABLE "public"."bulletin_questions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bulletin_responses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "post_id" "uuid" NOT NULL,
    "question_id" "uuid" NOT NULL,
    "respondent_id" "uuid" NOT NULL,
    "answer_text" "text",
    "answer_option" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."bulletin_responses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaign_eod_recipients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "role_label" "text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "campaign_eod_recipients_role_label_check" CHECK (("role_label" = ANY (ARRAY['tl'::"text", 'manager'::"text", 'client'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."campaign_eod_recipients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaign_eod_tl_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "note" "text",
    "written_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."campaign_eod_tl_notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaign_kpi_config" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "field_name" "text" NOT NULL,
    "field_label" "text" NOT NULL,
    "field_type" "text" DEFAULT 'number'::"text" NOT NULL,
    "min_target" numeric(10,2),
    "display_order" integer DEFAULT 0,
    "is_active" boolean DEFAULT true,
    "dropdown_options" "text"[],
    "is_required" boolean DEFAULT false,
    "flag_threshold" numeric(10,2),
    "flag_independent" boolean DEFAULT true NOT NULL,
    CONSTRAINT "campaign_kpi_config_field_type_check" CHECK (("field_type" = ANY (ARRAY['number'::"text", 'boolean'::"text", 'text'::"text", 'dropdown'::"text"])))
);


ALTER TABLE "public"."campaign_kpi_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaigns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "team_lead_id" "uuid",
    "eod_digest_cutoff_time" time without time zone,
    "eod_digest_timezone" "text" DEFAULT 'America/Denver'::"text" NOT NULL,
    "eod_reply_to_email" "text",
    "eod_morning_bundle_time" time without time zone,
    "requires_holiday_coverage" boolean DEFAULT false NOT NULL,
    "organization_id" "uuid" DEFAULT "public"."my_org_id"() NOT NULL,
    "early_release_enabled" boolean DEFAULT false NOT NULL,
    "early_release_criteria" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "include_agents_in_eod_digest" boolean DEFAULT false NOT NULL,
    "eod_digest_enabled" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."campaigns" OWNER TO "postgres";


COMMENT ON COLUMN "public"."campaigns"."eod_reply_to_email" IS 'Reply-To address for digest emails. NULL = use sender address.';



COMMENT ON COLUMN "public"."campaigns"."early_release_enabled" IS 'Whether agents on this campaign can leave early after self-reporting they hit metrics. Manager+ only setting.';



COMMENT ON COLUMN "public"."campaigns"."early_release_criteria" IS 'Free-text description of the metric threshold an agent must hit to leave early (e.g., "10 credit pulls"). Shown to agent in clock-out dialog and stored for audit.';



COMMENT ON COLUMN "public"."campaigns"."include_agents_in_eod_digest" IS 'When true, the daily EOD digest auto-includes all active employees on this campaign (excluding is_system_user). Manual entries in campaign_eod_recipients are still sent. Default false.';



CREATE TABLE IF NOT EXISTS "public"."cartas_compromiso" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "request_id" "uuid",
    "doc_ref" "text",
    "incident_date" "date" NOT NULL,
    "narrative" "text",
    "kpi_table" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "trabajador_name_snapshot" "text",
    "puesto_snapshot" "text",
    "horario_snapshot" "text",
    "supervisor_name_snapshot" "text",
    "company_legal_name_snapshot" "text",
    "company_legal_address_snapshot" "text",
    "incident_date_long_snapshot" "text",
    "pdf_path" "text",
    "signed_at" timestamp with time zone,
    "signed_scan_path" "text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "cartas_compromiso_check" CHECK ((("signed_at" IS NULL) = ("signed_scan_path" IS NULL)))
);


ALTER TABLE "public"."cartas_compromiso" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."client_holidays" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "name" "text" NOT NULL,
    "organization_id" "uuid" DEFAULT "public"."my_org_id"() NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."client_holidays" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."client_recurring_deductions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "label_prefix" "text" NOT NULL,
    "weekly_amount" numeric NOT NULL,
    "total_amount" numeric NOT NULL,
    "prepaid_amount" numeric DEFAULT 0 NOT NULL,
    "next_counter_start" integer DEFAULT 1 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "client_recurring_deductions_total_amount_check" CHECK (("total_amount" > (0)::numeric)),
    CONSTRAINT "client_recurring_deductions_weekly_amount_check" CHECK (("weekly_amount" > (0)::numeric))
);


ALTER TABLE "public"."client_recurring_deductions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "prefix" "text" NOT NULL,
    "bill_to_name" "text",
    "bill_to_address" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "subtitle" "text",
    "organization_id" "uuid" DEFAULT "public"."my_org_id"() NOT NULL,
    "is_billable" boolean DEFAULT true NOT NULL,
    "aliases" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."clients" OWNER TO "postgres";


COMMENT ON COLUMN "public"."clients"."aliases" IS 'Alternate names used in CSV uploads (e.g. spiff tracker CLIENT column). Matched case-insensitively against client_name during spiff import.';



COMMENT ON COLUMN "public"."clients"."is_active" IS 'Soft-delete flag. false = hidden from default client list but all dependent rows (campaigns, employees, invoices) remain intact.';



CREATE TABLE IF NOT EXISTS "public"."company_holidays" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "date" "date" NOT NULL,
    "name" "text" NOT NULL,
    "is_statutory" boolean DEFAULT false NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "organization_id" "uuid" DEFAULT "public"."my_org_id"() NOT NULL,
    "requires_request" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."company_holidays" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."compliance_notifications_sent" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "notification_type" "text" NOT NULL,
    "related_document_id" "uuid",
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "compliance_notifications_sent_notification_type_check" CHECK (("notification_type" = ANY (ARRAY['rejection'::"text", 'reminder_7d'::"text", 'reminder_3d'::"text", 'reminder_1d'::"text", 'lock'::"text"])))
);


ALTER TABLE "public"."compliance_notifications_sent" OWNER TO "postgres";


COMMENT ON TABLE "public"."compliance_notifications_sent" IS 'Dedupe table for compliance email notifications. Prevents sending the same email twice.';



CREATE TABLE IF NOT EXISTS "public"."departments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "organization_id" "uuid" DEFAULT "public"."my_org_id"() NOT NULL
);


ALTER TABLE "public"."departments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."employee_campaign_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date",
    "reason" "text",
    "changed_by" "uuid",
    "organization_id" "uuid" DEFAULT "public"."my_org_id"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "employee_campaign_assignments_check" CHECK ((("end_date" IS NULL) OR ("end_date" >= "start_date")))
);


ALTER TABLE "public"."employee_campaign_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."employee_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "document_type_id" "uuid" NOT NULL,
    "file_path" "text" NOT NULL,
    "file_name" "text" NOT NULL,
    "mime_type" "text" NOT NULL,
    "file_size_bytes" bigint NOT NULL,
    "status" "text" DEFAULT 'pending_review'::"text" NOT NULL,
    "rejection_reason" "text",
    "uploaded_by" "uuid" NOT NULL,
    "uploaded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "employee_documents_check" CHECK ((("status" <> 'rejected'::"text") OR ("rejection_reason" IS NOT NULL))),
    CONSTRAINT "employee_documents_status_check" CHECK (("status" = ANY (ARRAY['pending_review'::"text", 'approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."employee_documents" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."employee_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."employee_id_seq" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."employees_client_view" WITH ("security_invoker"='off') AS
 SELECT "id",
    COALESCE(NULLIF("work_name", ''::"text"), "full_name") AS "display_name",
    "campaign_id",
    "title",
    "is_active"
   FROM "public"."employees" "e"
  WHERE (("campaign_id" IN ( SELECT "public"."my_client_campaign_ids"() AS "my_client_campaign_ids")) AND "public"."is_client"());


ALTER VIEW "public"."employees_client_view" OWNER TO "postgres";


COMMENT ON VIEW "public"."employees_client_view" IS 'Client-facing employee view. Projects display_name (work_name with full_name fallback via COALESCE), campaign_id, title, is_active. No raw full_name, no tax/pay/contact/personal fields. Scoped to campaigns belonging to the authenticated client via my_client_campaign_ids(). security_invoker=off so RLS on employees is bypassed; row-scoping is enforced in the WHERE clause.';



CREATE OR REPLACE VIEW "public"."employees_no_pay" AS
 SELECT "id",
    "employee_id",
    "full_name",
    "work_name",
    "campaign_id",
    "is_active",
    "created_at",
    "title",
    "reports_to",
    "email"
   FROM "public"."employees" "e"
  WHERE (("organization_id" = "public"."my_org_id"()) AND ("is_system_user" = false) AND ("public"."is_leadership"() OR ("public"."is_team_lead"() AND (("campaign_id" IN ( SELECT "public"."my_tl_campaign_ids"() AS "my_tl_campaign_ids")) OR ("id" = "public"."my_employee_id"()))) OR ("id" = "public"."my_employee_id"())));


ALTER VIEW "public"."employees_no_pay" OWNER TO "postgres";


COMMENT ON VIEW "public"."employees_no_pay" IS 'Employees without pay/tax columns. Row-scoped internally (security_invoker=off). Org-scoped via my_org_id(). Leadership -> all org rows, TL -> campaign team + self, Agent -> self only.';



CREATE TABLE IF NOT EXISTS "public"."employment_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "from_status" "public"."employment_status",
    "to_status" "public"."employment_status" NOT NULL,
    "reason" "text",
    "notes" "text",
    "rehire_eligible" boolean,
    "last_worked_day" "date",
    "changed_by" "uuid",
    "changed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."employment_history" OWNER TO "postgres";


COMMENT ON TABLE "public"."employment_history" IS 'Append-only audit log of employment_status transitions on the employees table.';



CREATE TABLE IF NOT EXISTS "public"."eod_digest_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "digest_date" "date" NOT NULL,
    "digest_type" "text" NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "recipient_count" integer DEFAULT 0 NOT NULL,
    "agent_submission_count" integer DEFAULT 0 NOT NULL,
    "agent_missing_count" integer DEFAULT 0 NOT NULL,
    "missing_agents" "jsonb",
    "dry_run" boolean DEFAULT true NOT NULL,
    "smtp_message_id" "text",
    "error" "text",
    CONSTRAINT "eod_digest_log_digest_type_check" CHECK (("digest_type" = ANY (ARRAY['daily'::"text", 'morning_bundle'::"text"])))
);


ALTER TABLE "public"."eod_digest_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."eod_logs" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "metrics" "jsonb" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "last_edited_at" timestamp with time zone,
    "edit_count" integer DEFAULT 0 NOT NULL,
    "released_at" timestamp with time zone,
    "submitted_by_user_id" "uuid"
);


ALTER TABLE "public"."eod_logs" OWNER TO "postgres";


COMMENT ON COLUMN "public"."eod_logs"."released_at" IS 'When this EOD was batch-released to TL/client. Null while queued (e.g., early-release agent waiting for end of day).';



COMMENT ON COLUMN "public"."eod_logs"."submitted_by_user_id" IS 'Auth user who filed this EOD. NULL = unknown / pre-2026-05-18 backfill. When != employee.user_profiles.id, it was filed on the agent''s behalf.';



CREATE TABLE IF NOT EXISTS "public"."eod_logs_audit" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "eod_log_id" "uuid",
    "employee_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "edited_by" "uuid" NOT NULL,
    "edited_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "action" "text" NOT NULL,
    "before_state" "jsonb",
    "after_state" "jsonb" NOT NULL,
    "reason" "text" NOT NULL,
    "organization_id" "uuid" DEFAULT "public"."my_org_id"() NOT NULL,
    CONSTRAINT "eod_logs_audit_action_check" CHECK (("action" = ANY (ARRAY['insert'::"text", 'update'::"text"]))),
    CONSTRAINT "eod_logs_audit_reason_check" CHECK (("length"(TRIM(BOTH FROM "reason")) >= 3))
);


ALTER TABLE "public"."eod_logs_audit" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."eod_logs_client_view" WITH ("security_invoker"='off') AS
 SELECT "id",
    "employee_id",
    "campaign_id",
    "date",
    "metrics"
   FROM "public"."eod_logs" "el"
  WHERE (("campaign_id" IN ( SELECT "public"."my_client_campaign_ids"() AS "my_client_campaign_ids")) AND "public"."is_client"());


ALTER VIEW "public"."eod_logs_client_view" OWNER TO "postgres";


COMMENT ON VIEW "public"."eod_logs_client_view" IS 'Client-facing EOD logs. Exposes productivity metrics only: id, employee_id, campaign_id, date, metrics. Hides notes, created_at, last_edited_at, edit_count per design call #3 (no audit trail exposed to clients). security_invoker=off; row-scoping via WHERE clause.';



COMMENT ON COLUMN "public"."eod_logs_client_view"."metrics" IS 'Exposed raw because the EOD form-builder is the contract — metrics keys are by construction a subset of active campaign_kpi_config.field_name for the campaign. If non-KPI keys ever start landing in this jsonb (coaching notes, internal flags, debug data), this view must be changed to whitelist keys via a campaign_kpi_config join.';



CREATE TABLE IF NOT EXISTS "public"."holiday_notification_sent" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "holiday_date" "date" NOT NULL,
    "days_before" integer NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "holiday_notification_sent_days_before_check" CHECK (("days_before" = ANY (ARRAY[14, 7])))
);


ALTER TABLE "public"."holiday_notification_sent" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."holiday_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "holiday_date" "date" NOT NULL,
    "holiday_name" "text" NOT NULL,
    "status" "public"."holiday_request_status" DEFAULT 'pending_tl'::"public"."holiday_request_status" NOT NULL,
    "requested_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone
);


ALTER TABLE "public"."holiday_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."hr_document_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "request_type" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "filed_by" "uuid" NOT NULL,
    "filed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "incident_date" "date" NOT NULL,
    "tl_narrative" "text" NOT NULL,
    "reason" "text",
    "fulfilled_carta_id" "uuid",
    "fulfilled_acta_id" "uuid",
    "canceled_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "fulfilled_renuncia_id" "uuid",
    "fulfilled_rescision_id" "uuid",
    "fulfilled_rescision_desempeno_id" "uuid",
    CONSTRAINT "hr_document_requests_at_most_one_fulfilled" CHECK ((((((
CASE
    WHEN ("fulfilled_carta_id" IS NOT NULL) THEN 1
    ELSE 0
END +
CASE
    WHEN ("fulfilled_acta_id" IS NOT NULL) THEN 1
    ELSE 0
END) +
CASE
    WHEN ("fulfilled_renuncia_id" IS NOT NULL) THEN 1
    ELSE 0
END) +
CASE
    WHEN ("fulfilled_rescision_id" IS NOT NULL) THEN 1
    ELSE 0
END) +
CASE
    WHEN ("fulfilled_rescision_desempeno_id" IS NOT NULL) THEN 1
    ELSE 0
END) <= 1)),
    CONSTRAINT "hr_document_requests_fulfilled_status_sync" CHECK (((("status" = 'pending'::"text") AND ("fulfilled_carta_id" IS NULL) AND ("fulfilled_acta_id" IS NULL) AND ("fulfilled_renuncia_id" IS NULL) AND ("fulfilled_rescision_id" IS NULL) AND ("fulfilled_rescision_desempeno_id" IS NULL)) OR (("status" = 'fulfilled'::"text") AND (("fulfilled_carta_id" IS NOT NULL) OR ("fulfilled_acta_id" IS NOT NULL) OR ("fulfilled_renuncia_id" IS NOT NULL) OR ("fulfilled_rescision_id" IS NOT NULL) OR ("fulfilled_rescision_desempeno_id" IS NOT NULL))) OR ("status" = ANY (ARRAY['in_progress'::"text", 'canceled'::"text", 'downgraded'::"text"])))),
    CONSTRAINT "hr_document_requests_request_type_check" CHECK (("request_type" = ANY (ARRAY['carta'::"text", 'acta'::"text", 'renuncia'::"text", 'rescision_prueba'::"text", 'rescision_desempeno'::"text"]))),
    CONSTRAINT "hr_document_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'in_progress'::"text", 'fulfilled'::"text", 'canceled'::"text", 'downgraded'::"text"])))
);


ALTER TABLE "public"."hr_document_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invoice_lines" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invoice_id" "uuid" NOT NULL,
    "agent_name" "text" NOT NULL,
    "days_worked" numeric(4,2) DEFAULT 0,
    "unit_price" numeric(12,2) DEFAULT 0,
    "total" numeric(12,2) DEFAULT 0,
    "spiffs" numeric(12,2) DEFAULT 0,
    "total_price" numeric(12,2) DEFAULT 0,
    "holiday_days" numeric DEFAULT 0,
    "is_flat_total" boolean DEFAULT false,
    "campaign_name" "text",
    "employee_id" "uuid"
);


ALTER TABLE "public"."invoice_lines" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invoices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "invoice_number" "text" NOT NULL,
    "week_number" integer NOT NULL,
    "week_start" "date" NOT NULL,
    "week_end" "date" NOT NULL,
    "due_date" "date" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "submitted_on" "date" DEFAULT CURRENT_DATE,
    "project_name" "text",
    "notes" "text"
);


ALTER TABLE "public"."invoices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mexican_holidays" (
    "date" "date" NOT NULL,
    "name" "text" NOT NULL,
    "name_es" "text",
    "name_en" "text",
    "type" "text",
    "pays_premium" boolean DEFAULT false NOT NULL,
    CONSTRAINT "mexican_holidays_type_check" CHECK (("type" = ANY (ARRAY['LFT_OFICIAL'::"text", 'EMPRESA'::"text", 'OPCIONAL'::"text"])))
);


ALTER TABLE "public"."mexican_holidays" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "employee_id_prefix" "text" DEFAULT 'JOI'::"text" NOT NULL,
    CONSTRAINT "organizations_employee_id_prefix_check" CHECK (("employee_id_prefix" ~ '^[A-Z0-9]{2,10}$'::"text"))
);


ALTER TABLE "public"."organizations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payroll_archive" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source" "text" DEFAULT 'JOE_SHEETS_2026_05_19'::"text" NOT NULL,
    "period_code" "text" NOT NULL,
    "week_start" "date",
    "week_end" "date",
    "legacy_agent_id" integer,
    "employee_id" "uuid",
    "rule_key" "text",
    "missed_days" integer DEFAULT 0 NOT NULL,
    "overtime_days" integer DEFAULT 0 NOT NULL,
    "sundays_worked" integer DEFAULT 0 NOT NULL,
    "vacation_days" integer DEFAULT 0 NOT NULL,
    "holiday_days" integer DEFAULT 0 NOT NULL,
    "kpi_achieved" boolean DEFAULT true NOT NULL,
    "extra_bonus" numeric(12,2) DEFAULT 0 NOT NULL,
    "partial_week_days" integer,
    "weekly_base" numeric(12,2),
    "kpi_bonus" numeric(12,2),
    "missed_deduction" numeric(12,2),
    "overtime_pay" numeric(12,2),
    "sunday_pay" numeric(12,2),
    "vacation_pay" numeric(12,2),
    "holiday_pay" numeric(12,2),
    "total_pay" numeric(12,2),
    "status" "text" DEFAULT 'PAID'::"text" NOT NULL,
    "paid_at" "date",
    "organization_id" "uuid" DEFAULT "public"."my_org_id"() NOT NULL,
    "imported_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "agent_name" "text",
    "include_in_payroll" boolean DEFAULT true NOT NULL,
    "week_label" "text",
    "week_month" "text",
    "joe_period_code" "text",
    "joe_status" "text",
    "commission" numeric(10,2),
    CONSTRAINT "payroll_archive_status_check" CHECK (("status" = 'PAID'::"text"))
);


ALTER TABLE "public"."payroll_archive" OWNER TO "postgres";


COMMENT ON TABLE "public"."payroll_archive" IS 'Read-only historical ledger. 447 rows imported from Joe''s Sheets on 2026-05-19. Covers JAN26PP1 + MARCH26PP1 + MARCH26PP2 + APRIL26PP1 + APRIL26PP2 + MAY26PP1. Source: JOE_SHEETS_2026_05_19. Do NOT modify — used as ground truth for validation engine.';



COMMENT ON COLUMN "public"."payroll_archive"."commission" IS 'TL/manager commission from Joe''s sheet. NULL = not yet backfilled. Backfill required from Joe before archive rows can pass validation.';



CREATE TABLE IF NOT EXISTS "public"."payroll_audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "record_id" "uuid",
    "action" "text" NOT NULL,
    "before" "jsonb",
    "after" "jsonb",
    "actor" "uuid",
    "at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "organization_id" "uuid" DEFAULT "public"."my_org_id"() NOT NULL,
    CONSTRAINT "payroll_audit_log_action_check" CHECK (("action" = ANY (ARRAY['CREATE'::"text", 'EDIT_INPUT'::"text", 'RECALC'::"text", 'STATUS_CHANGE'::"text", 'OVERRIDE'::"text", 'UNLOCK_PAID'::"text"])))
);


ALTER TABLE "public"."payroll_audit_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payroll_periods" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "period_code" "text" NOT NULL,
    "year" integer NOT NULL,
    "month" integer NOT NULL,
    "half" "text" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "status" "text" DEFAULT 'OPEN'::"text" NOT NULL,
    "locked_at" timestamp with time zone,
    "locked_by" "uuid",
    "organization_id" "uuid" DEFAULT "public"."my_org_id"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "period_type" "text" DEFAULT 'Q1'::"text" NOT NULL,
    CONSTRAINT "payroll_periods_half_check" CHECK (("half" = ANY (ARRAY['PP1'::"text", 'PP2'::"text"]))),
    CONSTRAINT "payroll_periods_month_check" CHECK ((("month" >= 1) AND ("month" <= 12))),
    CONSTRAINT "payroll_periods_period_type_check" CHECK (("period_type" = ANY (ARRAY['Q1'::"text", 'Q2'::"text"]))),
    CONSTRAINT "payroll_periods_status_check" CHECK (("status" = ANY (ARRAY['OPEN'::"text", 'COMPLETE'::"text", 'LOCKED'::"text"])))
);


ALTER TABLE "public"."payroll_periods" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payroll_validation_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "run_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "run_by" "uuid",
    "notes" "text",
    "total_archive_rows" integer NOT NULL,
    "replay_eligible" integer NOT NULL,
    "match_count" integer NOT NULL,
    "diverge_count" integer NOT NULL,
    "skip_count" integer NOT NULL,
    "match_rate_pct" numeric(5,2) NOT NULL,
    "gate_passed" boolean NOT NULL,
    "diverge_detail" "jsonb"
);


ALTER TABLE "public"."payroll_validation_runs" OWNER TO "postgres";


COMMENT ON TABLE "public"."payroll_validation_runs" IS 'Permanent log of every Phase 5 validation run. gate_passed = match_rate_pct >= 95.00 AND diverge_count = 0.';



CREATE TABLE IF NOT EXISTS "public"."payroll_weeks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "period_id" "uuid" NOT NULL,
    "week_number" integer NOT NULL,
    "week_start" "date" NOT NULL,
    "week_end" "date" NOT NULL,
    "status" "text" DEFAULT 'UNPAID'::"text" NOT NULL,
    "status_changed_at" timestamp with time zone,
    "status_changed_by" "uuid",
    "organization_id" "uuid" DEFAULT "public"."my_org_id"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "payroll_weeks_status_check" CHECK (("status" = ANY (ARRAY['UNPAID'::"text", 'COMPLETE'::"text", 'PAID'::"text"]))),
    CONSTRAINT "payroll_weeks_week_number_check" CHECK ((("week_number" >= 1) AND ("week_number" <= 5)))
);


ALTER TABLE "public"."payroll_weeks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."policy_acknowledgments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "policy_document_version_id" "uuid" NOT NULL,
    "acknowledged_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."policy_acknowledgments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."policy_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_global" boolean DEFAULT true NOT NULL,
    "scoped_campaign_ids" "uuid"[],
    "applicable_roles" "text"[],
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "organization_id" "uuid" DEFAULT "public"."my_org_id"() NOT NULL,
    CONSTRAINT "policy_documents_check" CHECK ((("is_global" = true) OR (("scoped_campaign_ids" IS NOT NULL) AND ("array_length"("scoped_campaign_ids", 1) > 0))))
);


ALTER TABLE "public"."policy_documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."recruiting_candidates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source" "text" DEFAULT 'form'::"text" NOT NULL,
    "full_name" "text",
    "email" "text",
    "phone" "text",
    "city" "text",
    "role_interest" "text",
    "english_level_self" "text" DEFAULT 'unknown'::"text" NOT NULL,
    "referral_source" "text",
    "applicant_notes" "text",
    "raw_email_body" "text",
    "raw_email_received_at" timestamp with time zone,
    "needs_manual_review" boolean DEFAULT false NOT NULL,
    "geo_qualified" boolean,
    "english_level_assessed" "text",
    "qualified_for_roles" "text"[] DEFAULT ARRAY[]::"text"[] NOT NULL,
    "stage" "text" DEFAULT 'new'::"text" NOT NULL,
    "stage_changed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "assigned_to" "uuid",
    "last_contacted_at" timestamp with time zone,
    "next_followup_at" timestamp with time zone,
    "final_status" "text",
    "pass_reason" "text",
    "hired_for_role" "text",
    "hired_at" timestamp with time zone,
    "curp" "text",
    "cv_url" "text",
    "presentation_url" "text",
    "recruiter_notes" "text",
    "position_fits" "text"[] DEFAULT ARRAY[]::"text"[] NOT NULL,
    CONSTRAINT "recruiting_candidates_english_level_assessed_check" CHECK ((("english_level_assessed" = ANY (ARRAY['C1'::"text", 'C2'::"text", 'below_c1'::"text"])) OR ("english_level_assessed" IS NULL))),
    CONSTRAINT "recruiting_candidates_english_level_self_check" CHECK (("english_level_self" = ANY (ARRAY['C1'::"text", 'C2'::"text", 'below_c1'::"text", 'unknown'::"text"]))),
    CONSTRAINT "recruiting_candidates_final_status_check" CHECK ((("final_status" = ANY (ARRAY['hired'::"text", 'passed'::"text", 'withdrew'::"text", 'ghosted'::"text"])) OR ("final_status" IS NULL))),
    CONSTRAINT "recruiting_candidates_role_interest_check" CHECK ((("role_interest" = ANY (ARRAY['b2b_setter'::"text", 'funding_activation'::"text", 'customer_reactivation'::"text", 'ai_automation'::"text", 'ai_operations'::"text"])) OR ("role_interest" IS NULL))),
    CONSTRAINT "recruiting_candidates_source_check" CHECK (("source" = ANY (ARRAY['form'::"text", 'referral'::"text", 'other'::"text"]))),
    CONSTRAINT "recruiting_candidates_stage_check" CHECK (("stage" = ANY (ARRAY['new'::"text", 'triaged'::"text", 'contacted'::"text", 'interview_scheduled'::"text", 'interviewed'::"text", 'warm_hold'::"text", 'reactivated'::"text", 'hired'::"text", 'passed'::"text", 'withdrew'::"text", 'ghosted'::"text"])))
);


ALTER TABLE "public"."recruiting_candidates" OWNER TO "postgres";


COMMENT ON COLUMN "public"."recruiting_candidates"."cv_url" IS 'Wufoo/Gravity Forms CV upload URL (field-id=4). PDF or DOCX.';



COMMENT ON COLUMN "public"."recruiting_candidates"."presentation_url" IS 'Wufoo/Gravity Forms intro recording URL (field-id=16). Audio (mp3/m4a/wav) or video (mov/mp4/webm).';



CREATE TABLE IF NOT EXISTS "public"."recruiting_interviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "candidate_id" "uuid" NOT NULL,
    "conducted_by" "uuid",
    "conducted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "interview_type" "text" DEFAULT 'screen'::"text" NOT NULL,
    "english_score" integer,
    "communication_score" integer,
    "coachability_score" integer,
    "overall_score" integer,
    "recommendation" "text",
    "notes" "text",
    "outcome" "text",
    "scheduled_at" timestamp with time zone,
    "event_key" "text",
    CONSTRAINT "recruiting_interviews_coachability_score_check" CHECK ((("coachability_score" >= 1) AND ("coachability_score" <= 5))),
    CONSTRAINT "recruiting_interviews_communication_score_check" CHECK ((("communication_score" >= 1) AND ("communication_score" <= 5))),
    CONSTRAINT "recruiting_interviews_english_score_check" CHECK ((("english_score" >= 1) AND ("english_score" <= 5))),
    CONSTRAINT "recruiting_interviews_interview_type_check" CHECK (("interview_type" = ANY (ARRAY['screen'::"text", 'deep_dive'::"text", 'role_fit'::"text", 'final'::"text"]))),
    CONSTRAINT "recruiting_interviews_outcome_check" CHECK ((("outcome" = ANY (ARRAY['completed'::"text", 'no_show'::"text"])) OR ("outcome" IS NULL))),
    CONSTRAINT "recruiting_interviews_overall_score_check" CHECK ((("overall_score" >= 1) AND ("overall_score" <= 5))),
    CONSTRAINT "recruiting_interviews_recommendation_check" CHECK ((("recommendation" = ANY (ARRAY['advance'::"text", 'hold'::"text", 'pass'::"text"])) OR ("recommendation" IS NULL)))
);


ALTER TABLE "public"."recruiting_interviews" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."recruiting_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "candidate_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "direction" "text" NOT NULL,
    "channel" "text" NOT NULL,
    "template_key" "text",
    "subject" "text",
    "body" "text" NOT NULL,
    "sent_by" "uuid",
    "status" "text" DEFAULT 'sent'::"text" NOT NULL,
    CONSTRAINT "recruiting_messages_channel_check" CHECK (("channel" = ANY (ARRAY['whatsapp'::"text", 'email'::"text", 'sms'::"text", 'call_log'::"text"]))),
    CONSTRAINT "recruiting_messages_direction_check" CHECK (("direction" = ANY (ARRAY['outbound'::"text", 'inbound'::"text"]))),
    CONSTRAINT "recruiting_messages_status_check" CHECK (("status" = ANY (ARRAY['sent'::"text", 'failed'::"text", 'link_generated'::"text", 'received'::"text"])))
);


ALTER TABLE "public"."recruiting_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."recruiting_positions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."recruiting_positions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."required_document_types" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."required_document_types" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rescision_desempeno_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "request_id" "uuid",
    "doc_ref" "text",
    "trabajador_name_snapshot" "text",
    "puesto_snapshot" "text",
    "horario_snapshot" "text",
    "supervisor_name_snapshot" "text",
    "company_legal_name_snapshot" "text",
    "company_legal_address_snapshot" "text",
    "incident_date_long_snapshot" "text",
    "hire_date_snapshot" "date",
    "contract_signing_date" "date",
    "termination_effective_date" "date" NOT NULL,
    "kpi_table" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "salario_diario_snapshot" numeric(12,2),
    "aguinaldo_monto" numeric(12,2),
    "vacaciones_monto" numeric(12,2),
    "prima_vacacional_monto" numeric(12,2),
    "total_monto" numeric(12,2),
    "total_en_letras" "text",
    "curp_snapshot" "text",
    "rfc_snapshot" "text",
    "narrative" "text",
    "pdf_path" "text",
    "signed_at" timestamp with time zone,
    "signed_scan_path" "text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "salarios_devengados_monto" numeric,
    CONSTRAINT "rescision_desempeno_documents_check" CHECK ((("signed_at" IS NULL) = ("signed_scan_path" IS NULL)))
);


ALTER TABLE "public"."rescision_desempeno_documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rescision_prueba_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "request_id" "uuid",
    "doc_ref" "text",
    "trabajador_name_snapshot" "text",
    "puesto_snapshot" "text",
    "horario_snapshot" "text",
    "supervisor_name_snapshot" "text",
    "company_legal_name_snapshot" "text",
    "company_legal_address_snapshot" "text",
    "incident_date_long_snapshot" "text",
    "hire_date_snapshot" "date",
    "contract_signing_date" "date",
    "termination_effective_date" "date" NOT NULL,
    "kpi_table" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "salario_diario_snapshot" numeric(12,2),
    "aguinaldo_monto" numeric(12,2),
    "vacaciones_monto" numeric(12,2),
    "prima_vacacional_monto" numeric(12,2),
    "total_monto" numeric(12,2),
    "total_en_letras" "text",
    "curp_snapshot" "text",
    "rfc_snapshot" "text",
    "narrative" "text",
    "pdf_path" "text",
    "signed_at" timestamp with time zone,
    "signed_scan_path" "text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "salarios_devengados_monto" numeric,
    CONSTRAINT "rescision_prueba_documents_check" CHECK ((("signed_at" IS NULL) = ("signed_scan_path" IS NULL)))
);


ALTER TABLE "public"."rescision_prueba_documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."resignation_packets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "request_id" "uuid",
    "doc_ref" "text",
    "trabajador_name_snapshot" "text",
    "puesto_snapshot" "text",
    "horario_snapshot" "text",
    "company_legal_name_snapshot" "text",
    "company_legal_address_snapshot" "text",
    "effective_date" "date" NOT NULL,
    "narrative" "text",
    "hire_date_snapshot" "date",
    "salario_diario_snapshot" numeric(12,2),
    "aguinaldo_monto" numeric(12,2),
    "vacaciones_monto" numeric(12,2),
    "prima_vacacional_monto" numeric(12,2),
    "total_monto" numeric(12,2),
    "total_en_letras" "text",
    "curp_snapshot" "text",
    "rfc_snapshot" "text",
    "clave_elector" "text",
    "pdf_path" "text",
    "signed_at" timestamp with time zone,
    "signed_scan_path" "text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "salarios_devengados_monto" numeric,
    CONSTRAINT "resignation_packets_check" CHECK ((("signed_at" IS NULL) = ("signed_scan_path" IS NULL)))
);


ALTER TABLE "public"."resignation_packets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sensitive_data_acknowledgments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "acknowledged_by" "uuid" NOT NULL,
    "acknowledged_by_user_id" "uuid",
    "context" "text" NOT NULL,
    "subject_employee_id" "uuid",
    "hr_document_request_id" "uuid",
    "acknowledgment_text" "text" NOT NULL,
    "acknowledged_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    CONSTRAINT "sensitive_data_acknowledgments_acknowledgment_text_check" CHECK (("length"(TRIM(BOTH FROM "acknowledgment_text")) >= 10)),
    CONSTRAINT "sensitive_data_acknowledgments_context_check" CHECK (("length"(TRIM(BOTH FROM "context")) >= 2))
);


ALTER TABLE "public"."sensitive_data_acknowledgments" OWNER TO "postgres";


COMMENT ON TABLE "public"."sensitive_data_acknowledgments" IS 'Append-only log of confidentiality acknowledgments captured before revealing sensitive personal/financial data (e.g. finiquito amounts). Evidences notice of confidentiality duty per LFPDPPP 2025 and LFT Art. 47.';



CREATE TABLE IF NOT EXISTS "public"."shift_settings" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "shift_name" "text" NOT NULL,
    "start_time" time without time zone NOT NULL,
    "end_time" time without time zone NOT NULL,
    "grace_minutes" integer DEFAULT 10,
    "days_of_week" integer[],
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "updated_by" "uuid",
    "break_grace_minutes" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."shift_settings" OWNER TO "postgres";


COMMENT ON COLUMN "public"."shift_settings"."break_grace_minutes" IS 'Minutes an employee may exceed a break cap before a late-return reason is required. 0 = any minute over.';



CREATE TABLE IF NOT EXISTS "public"."shift_settings_audit" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "shift_setting_id" "uuid",
    "campaign_id" "uuid",
    "action" "text" NOT NULL,
    "changed_by" "uuid",
    "changed_by_email" "text",
    "changes" "jsonb",
    "changed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "shift_settings_audit_action_check" CHECK (("action" = ANY (ARRAY['insert'::"text", 'update'::"text", 'delete'::"text"])))
);


ALTER TABLE "public"."shift_settings_audit" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."spiff_import_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "signature" "text" NOT NULL,
    "invoice_line_id" "uuid" NOT NULL,
    "invoice_id" "uuid" NOT NULL,
    "amount" numeric NOT NULL,
    "source" "text" DEFAULT 'sheet_import'::"text" NOT NULL,
    "raw_row" "jsonb",
    "applied_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "spiff_import_log_amount_check" CHECK (("amount" <> (0)::numeric))
);


ALTER TABLE "public"."spiff_import_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."team_lead_campaigns" (
    "team_lead_id" "uuid" NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid"
);


ALTER TABLE "public"."team_lead_campaigns" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."time_clock" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "clock_in" timestamp with time zone NOT NULL,
    "clock_out" timestamp with time zone,
    "date" "date" NOT NULL,
    "total_hours" numeric(5,2),
    "is_late" boolean DEFAULT false,
    "late_minutes" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "lunch_start" timestamp with time zone,
    "lunch_end" timestamp with time zone,
    "break1_start" timestamp with time zone,
    "break1_end" timestamp with time zone,
    "break2_start" timestamp with time zone,
    "break2_end" timestamp with time zone,
    "shift_end_expected" timestamp with time zone,
    "auto_clocked_out" boolean DEFAULT false NOT NULL,
    "eod_completed" boolean DEFAULT false NOT NULL,
    "early_release" boolean DEFAULT false NOT NULL,
    "lunch_late_reason" "text",
    "break1_late_reason" "text",
    "break2_late_reason" "text"
);


ALTER TABLE "public"."time_clock" OWNER TO "postgres";


COMMENT ON COLUMN "public"."time_clock"."lunch_start" IS 'Start of unpaid 60-min lunch break';



COMMENT ON COLUMN "public"."time_clock"."lunch_end" IS 'End of unpaid 60-min lunch break (deducted from total_hours)';



COMMENT ON COLUMN "public"."time_clock"."break1_start" IS 'Start of first paid 15-min break';



COMMENT ON COLUMN "public"."time_clock"."break1_end" IS 'End of first paid 15-min break';



COMMENT ON COLUMN "public"."time_clock"."break2_start" IS 'Start of second paid 15-min break';



COMMENT ON COLUMN "public"."time_clock"."break2_end" IS 'End of second paid 15-min break';



COMMENT ON COLUMN "public"."time_clock"."shift_end_expected" IS 'Scheduled shift end set at clock-in from shift_settings; used by auto clock-out job';



COMMENT ON COLUMN "public"."time_clock"."auto_clocked_out" IS 'True when the system auto-closed this entry at scheduled shift end';



COMMENT ON COLUMN "public"."time_clock"."eod_completed" IS 'True once the agent submitted the EOD form for this entry; required to clock out manually';



COMMENT ON COLUMN "public"."time_clock"."early_release" IS 'Agent self-reported they hit campaign metrics and left early. Payroll treats day as full scheduled hours.';



COMMENT ON COLUMN "public"."time_clock"."lunch_late_reason" IS 'Reason the employee gave for ending lunch over the 60-min cap (+ grace). Null = on time.';



COMMENT ON COLUMN "public"."time_clock"."break1_late_reason" IS 'Reason the employee gave for ending break 1 over the 15-min cap (+ grace). Null = on time.';



COMMENT ON COLUMN "public"."time_clock"."break2_late_reason" IS 'Reason the employee gave for ending break 2 over the 15-min cap (+ grace). Null = on time.';



CREATE TABLE IF NOT EXISTS "public"."time_clock_audit" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "time_clock_id" "uuid",
    "employee_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "edited_by" "uuid" NOT NULL,
    "edited_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "action" "text" NOT NULL,
    "before_state" "jsonb",
    "after_state" "jsonb" NOT NULL,
    "reason" "text" NOT NULL,
    "organization_id" "uuid" DEFAULT "public"."my_org_id"() NOT NULL,
    CONSTRAINT "time_clock_audit_action_check" CHECK (("action" = ANY (ARRAY['insert'::"text", 'update'::"text"])))
);


ALTER TABLE "public"."time_clock_audit" OWNER TO "postgres";


COMMENT ON TABLE "public"."time_clock_audit" IS 'Tracks manual edits to time_clock by HR/TL/manager. Edge function edit-time-clock writes these via service role. UI shows them as the edit history per agent.';



CREATE TABLE IF NOT EXISTS "public"."tl_nudges" (
    "employee_id" "uuid" NOT NULL,
    "date" "date" DEFAULT (("now"() AT TIME ZONE 'UTC'::"text"))::"date" NOT NULL,
    "nudged_by" "uuid" NOT NULL,
    "nudged_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."tl_nudges" OWNER TO "postgres";


COMMENT ON TABLE "public"."tl_nudges" IS 'Light audit log: which TL reached out to which agent on which day. One row per (agent, date); upsert on re-nudge. No notification side-effects — this is just the record.';



CREATE TABLE IF NOT EXISTS "public"."uptraining_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "organization_id" "uuid" DEFAULT "public"."my_org_id"() NOT NULL,
    "file_path" "text" NOT NULL,
    "original_filename" "text",
    "note" "text",
    "uploaded_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."uptraining_documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_profiles" (
    "id" "uuid" NOT NULL,
    "employee_id" "uuid",
    "role" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "client_id" "uuid",
    "organization_id" "uuid" DEFAULT "public"."my_org_id"() NOT NULL,
    CONSTRAINT "user_profiles_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text", 'team_lead'::"text", 'agent'::"text", 'employee'::"text", 'client'::"text"]))),
    CONSTRAINT "user_profiles_role_client_invariant" CHECK (((("role" = 'client'::"text") AND ("client_id" IS NOT NULL) AND ("employee_id" IS NULL)) OR (("role" <> 'client'::"text") AND ("client_id" IS NULL))))
);


ALTER TABLE "public"."user_profiles" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_latest_validation_run" AS
 SELECT "id",
    "run_at",
    "total_archive_rows",
    "replay_eligible",
    "match_count",
    "diverge_count",
    "skip_count",
    "match_rate_pct",
    "gate_passed",
    "notes"
   FROM "public"."payroll_validation_runs"
  ORDER BY "run_at" DESC
 LIMIT 1;


ALTER VIEW "public"."v_latest_validation_run" OWNER TO "postgres";


ALTER TABLE ONLY "public"."actas_administrativas"
    ADD CONSTRAINT "actas_administrativas_doc_ref_key" UNIQUE ("doc_ref");



ALTER TABLE ONLY "public"."actas_administrativas"
    ADD CONSTRAINT "actas_administrativas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_coaching_notes"
    ADD CONSTRAINT "agent_coaching_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_review_notifications_sent"
    ADD CONSTRAINT "agent_review_notifications_se_review_id_notification_type_r_key" UNIQUE ("review_id", "notification_type", "recipient_employee_id", "send_date");



ALTER TABLE ONLY "public"."agent_review_notifications_sent"
    ADD CONSTRAINT "agent_review_notifications_sent_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_reviews"
    ADD CONSTRAINT "agent_reviews_employee_id_week_number_key" UNIQUE ("employee_id", "week_number");



ALTER TABLE ONLY "public"."agent_reviews"
    ADD CONSTRAINT "agent_reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_config"
    ADD CONSTRAINT "app_config_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."attendance_incidents"
    ADD CONSTRAINT "attendance_incidents_employee_id_date_key" UNIQUE ("employee_id", "date");



ALTER TABLE ONLY "public"."attendance_incidents"
    ADD CONSTRAINT "attendance_incidents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bulletin_acks"
    ADD CONSTRAINT "bulletin_acks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bulletin_acks"
    ADD CONSTRAINT "bulletin_acks_post_id_employee_id_key" UNIQUE ("post_id", "employee_id");



ALTER TABLE ONLY "public"."bulletin_posts"
    ADD CONSTRAINT "bulletin_posts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bulletin_questions"
    ADD CONSTRAINT "bulletin_questions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bulletin_responses"
    ADD CONSTRAINT "bulletin_responses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bulletin_responses"
    ADD CONSTRAINT "bulletin_responses_question_id_respondent_id_key" UNIQUE ("question_id", "respondent_id");



ALTER TABLE ONLY "public"."campaign_eod_recipients"
    ADD CONSTRAINT "campaign_eod_recipients_campaign_id_email_key" UNIQUE ("campaign_id", "email");



ALTER TABLE ONLY "public"."campaign_eod_recipients"
    ADD CONSTRAINT "campaign_eod_recipients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaign_eod_tl_notes"
    ADD CONSTRAINT "campaign_eod_tl_notes_campaign_id_date_key" UNIQUE ("campaign_id", "date");



ALTER TABLE ONLY "public"."campaign_eod_tl_notes"
    ADD CONSTRAINT "campaign_eod_tl_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaign_kpi_config"
    ADD CONSTRAINT "campaign_kpi_config_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaigns"
    ADD CONSTRAINT "campaigns_client_id_name_key" UNIQUE ("client_id", "name");



ALTER TABLE ONLY "public"."campaigns"
    ADD CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cartas_compromiso"
    ADD CONSTRAINT "cartas_compromiso_doc_ref_key" UNIQUE ("doc_ref");



ALTER TABLE ONLY "public"."cartas_compromiso"
    ADD CONSTRAINT "cartas_compromiso_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_holidays"
    ADD CONSTRAINT "client_holidays_client_id_date_key" UNIQUE ("client_id", "date");



ALTER TABLE ONLY "public"."client_holidays"
    ADD CONSTRAINT "client_holidays_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_recurring_deductions"
    ADD CONSTRAINT "client_recurring_deductions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_prefix_key" UNIQUE ("prefix");



ALTER TABLE ONLY "public"."company_holidays"
    ADD CONSTRAINT "company_holidays_date_key" UNIQUE ("date");



ALTER TABLE ONLY "public"."company_holidays"
    ADD CONSTRAINT "company_holidays_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."compliance_notifications_sent"
    ADD CONSTRAINT "compliance_notifications_sent_employee_id_notification_type_key" UNIQUE ("employee_id", "notification_type", "related_document_id");



ALTER TABLE ONLY "public"."compliance_notifications_sent"
    ADD CONSTRAINT "compliance_notifications_sent_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."departments"
    ADD CONSTRAINT "departments_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."departments"
    ADD CONSTRAINT "departments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."employee_campaign_assignments"
    ADD CONSTRAINT "employee_campaign_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."employee_documents"
    ADD CONSTRAINT "employee_documents_employee_id_document_type_id_key" UNIQUE ("employee_id", "document_type_id");



ALTER TABLE ONLY "public"."employee_documents"
    ADD CONSTRAINT "employee_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_employee_id_key" UNIQUE ("employee_id");



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."employment_history"
    ADD CONSTRAINT "employment_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."eod_digest_log"
    ADD CONSTRAINT "eod_digest_log_campaign_id_digest_date_digest_type_key" UNIQUE ("campaign_id", "digest_date", "digest_type");



ALTER TABLE ONLY "public"."eod_digest_log"
    ADD CONSTRAINT "eod_digest_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."eod_logs_audit"
    ADD CONSTRAINT "eod_logs_audit_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."eod_logs"
    ADD CONSTRAINT "eod_logs_employee_id_date_key" UNIQUE ("employee_id", "date");



ALTER TABLE ONLY "public"."eod_logs"
    ADD CONSTRAINT "eod_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."holiday_notification_sent"
    ADD CONSTRAINT "holiday_notification_sent_campaign_id_holiday_date_days_bef_key" UNIQUE ("campaign_id", "holiday_date", "days_before");



ALTER TABLE ONLY "public"."holiday_notification_sent"
    ADD CONSTRAINT "holiday_notification_sent_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."holiday_requests"
    ADD CONSTRAINT "holiday_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hr_document_requests"
    ADD CONSTRAINT "hr_document_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoice_lines"
    ADD CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mexican_holidays"
    ADD CONSTRAINT "mexican_holidays_pkey" PRIMARY KEY ("date");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."payroll_archive"
    ADD CONSTRAINT "payroll_archive_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payroll_audit_log"
    ADD CONSTRAINT "payroll_audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payroll_periods"
    ADD CONSTRAINT "payroll_periods_period_code_key" UNIQUE ("period_code");



ALTER TABLE ONLY "public"."payroll_periods"
    ADD CONSTRAINT "payroll_periods_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payroll_records"
    ADD CONSTRAINT "payroll_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payroll_records"
    ADD CONSTRAINT "payroll_records_week_id_employee_id_key" UNIQUE ("week_id", "employee_id");



ALTER TABLE ONLY "public"."payroll_validation_runs"
    ADD CONSTRAINT "payroll_validation_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payroll_weeks"
    ADD CONSTRAINT "payroll_weeks_period_id_week_number_key" UNIQUE ("period_id", "week_number");



ALTER TABLE ONLY "public"."payroll_weeks"
    ADD CONSTRAINT "payroll_weeks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."policy_acknowledgments"
    ADD CONSTRAINT "policy_acknowledgments_employee_id_policy_document_version__key" UNIQUE ("employee_id", "policy_document_version_id");



ALTER TABLE ONLY "public"."policy_acknowledgments"
    ADD CONSTRAINT "policy_acknowledgments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."policy_document_versions"
    ADD CONSTRAINT "policy_document_versions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."policy_document_versions"
    ADD CONSTRAINT "policy_document_versions_policy_document_id_version_number_key" UNIQUE ("policy_document_id", "version_number");



ALTER TABLE ONLY "public"."policy_documents"
    ADD CONSTRAINT "policy_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recruiting_candidates"
    ADD CONSTRAINT "recruiting_candidates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recruiting_interviews"
    ADD CONSTRAINT "recruiting_interviews_event_key_unique" UNIQUE ("event_key");



ALTER TABLE ONLY "public"."recruiting_interviews"
    ADD CONSTRAINT "recruiting_interviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recruiting_messages"
    ADD CONSTRAINT "recruiting_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recruiting_positions"
    ADD CONSTRAINT "recruiting_positions_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."recruiting_positions"
    ADD CONSTRAINT "recruiting_positions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."required_document_types"
    ADD CONSTRAINT "required_document_types_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."required_document_types"
    ADD CONSTRAINT "required_document_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rescision_desempeno_documents"
    ADD CONSTRAINT "rescision_desempeno_documents_doc_ref_key" UNIQUE ("doc_ref");



ALTER TABLE ONLY "public"."rescision_desempeno_documents"
    ADD CONSTRAINT "rescision_desempeno_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rescision_prueba_documents"
    ADD CONSTRAINT "rescision_prueba_documents_doc_ref_key" UNIQUE ("doc_ref");



ALTER TABLE ONLY "public"."rescision_prueba_documents"
    ADD CONSTRAINT "rescision_prueba_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."resignation_packets"
    ADD CONSTRAINT "resignation_packets_doc_ref_key" UNIQUE ("doc_ref");



ALTER TABLE ONLY "public"."resignation_packets"
    ADD CONSTRAINT "resignation_packets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sensitive_data_acknowledgments"
    ADD CONSTRAINT "sensitive_data_acknowledgments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shift_settings_audit"
    ADD CONSTRAINT "shift_settings_audit_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shift_settings"
    ADD CONSTRAINT "shift_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."spiff_import_log"
    ADD CONSTRAINT "spiff_import_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."spiff_import_log"
    ADD CONSTRAINT "spiff_import_log_signature_key" UNIQUE ("signature");



ALTER TABLE ONLY "public"."team_lead_campaigns"
    ADD CONSTRAINT "team_lead_campaigns_pkey" PRIMARY KEY ("team_lead_id", "campaign_id");



ALTER TABLE ONLY "public"."time_clock_audit"
    ADD CONSTRAINT "time_clock_audit_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."time_clock"
    ADD CONSTRAINT "time_clock_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."_legacy_time_off_requests"
    ADD CONSTRAINT "time_off_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tl_nudges"
    ADD CONSTRAINT "tl_nudges_pkey" PRIMARY KEY ("employee_id", "date");



ALTER TABLE ONLY "public"."uptraining_documents"
    ADD CONSTRAINT "uptraining_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vacation_requests"
    ADD CONSTRAINT "vacation_requests_pkey" PRIMARY KEY ("id");



CREATE INDEX "agent_coaching_notes_agent_id_idx" ON "public"."agent_coaching_notes" USING "btree" ("agent_id");



CREATE INDEX "agent_coaching_notes_campaign_id_idx" ON "public"."agent_coaching_notes" USING "btree" ("campaign_id");



CREATE INDEX "agent_coaching_notes_created_at_idx" ON "public"."agent_coaching_notes" USING "btree" ("created_at" DESC);



CREATE INDEX "bulletin_acks_employee_idx" ON "public"."bulletin_acks" USING "btree" ("employee_id");



CREATE INDEX "bulletin_acks_post_idx" ON "public"."bulletin_acks" USING "btree" ("post_id");



CREATE INDEX "bulletin_posts_published_idx" ON "public"."bulletin_posts" USING "btree" ("is_published", "published_at" DESC);



CREATE INDEX "bulletin_questions_post_idx" ON "public"."bulletin_questions" USING "btree" ("post_id", "sort_order");



CREATE INDEX "bulletin_responses_post_idx" ON "public"."bulletin_responses" USING "btree" ("post_id");



CREATE INDEX "bulletin_responses_question_idx" ON "public"."bulletin_responses" USING "btree" ("question_id");



CREATE INDEX "bulletin_responses_respondent_idx" ON "public"."bulletin_responses" USING "btree" ("respondent_id");



CREATE INDEX "employees_recruited_from_candidate_id_idx" ON "public"."employees" USING "btree" ("recruited_from_candidate_id") WHERE ("recruited_from_candidate_id" IS NOT NULL);



CREATE INDEX "idx_actas_administrativas_employee" ON "public"."actas_administrativas" USING "btree" ("employee_id", "created_at" DESC);



CREATE INDEX "idx_actas_administrativas_reincidencia" ON "public"."actas_administrativas" USING "btree" ("reincidencia_prior_carta_id");



CREATE INDEX "idx_actas_administrativas_request" ON "public"."actas_administrativas" USING "btree" ("request_id");



CREATE INDEX "idx_agent_reviews_campaign" ON "public"."agent_reviews" USING "btree" ("campaign_id");



CREATE INDEX "idx_agent_reviews_due_pending" ON "public"."agent_reviews" USING "btree" ("due_date") WHERE ("completed_at" IS NULL);



CREATE INDEX "idx_agent_reviews_employee" ON "public"."agent_reviews" USING "btree" ("employee_id", "week_number");



CREATE INDEX "idx_attendance_incidents_employee" ON "public"."attendance_incidents" USING "btree" ("employee_id", "date" DESC);



CREATE INDEX "idx_campaign_kpi_config_campaign_id" ON "public"."campaign_kpi_config" USING "btree" ("campaign_id");



CREATE INDEX "idx_cartas_compromiso_employee" ON "public"."cartas_compromiso" USING "btree" ("employee_id", "created_at" DESC);



CREATE INDEX "idx_cartas_compromiso_request" ON "public"."cartas_compromiso" USING "btree" ("request_id");



CREATE INDEX "idx_client_holidays_client" ON "public"."client_holidays" USING "btree" ("client_id");



CREATE INDEX "idx_client_holidays_date" ON "public"."client_holidays" USING "btree" ("date");



CREATE INDEX "idx_eca_campaign" ON "public"."employee_campaign_assignments" USING "btree" ("campaign_id");



CREATE INDEX "idx_eca_dates" ON "public"."employee_campaign_assignments" USING "btree" ("start_date", "end_date");



CREATE INDEX "idx_eca_employee" ON "public"."employee_campaign_assignments" USING "btree" ("employee_id");



CREATE INDEX "idx_employees_curp_inactive" ON "public"."employees" USING "btree" ("curp") WHERE (("employment_status" <> 'active'::"public"."employment_status") AND ("curp" IS NOT NULL));



CREATE INDEX "idx_employees_is_active" ON "public"."employees" USING "btree" ("is_active");



CREATE INDEX "idx_employees_name_dob_inactive" ON "public"."employees" USING "btree" ("lower"("full_name"), "date_of_birth") WHERE ("employment_status" <> 'active'::"public"."employment_status");



CREATE INDEX "idx_employees_payroll_rate_lookup" ON "public"."employees" USING "btree" ("department_id", "shift_type", "campaign_id");



CREATE INDEX "idx_employees_reports_to" ON "public"."employees" USING "btree" ("reports_to");



CREATE INDEX "idx_employees_system_user" ON "public"."employees" USING "btree" ("is_system_user") WHERE ("is_system_user" = true);



CREATE INDEX "idx_employees_title" ON "public"."employees" USING "btree" ("title");



CREATE INDEX "idx_employment_history_employee_changed" ON "public"."employment_history" USING "btree" ("employee_id", "changed_at" DESC);



CREATE INDEX "idx_eod_digest_log_campaign_date" ON "public"."eod_digest_log" USING "btree" ("campaign_id", "digest_date" DESC);



CREATE INDEX "idx_eod_logs_audit_edited_by" ON "public"."eod_logs_audit" USING "btree" ("edited_by");



CREATE INDEX "idx_eod_logs_audit_employee_date" ON "public"."eod_logs_audit" USING "btree" ("employee_id", "date" DESC);



CREATE INDEX "idx_eod_logs_audit_org" ON "public"."eod_logs_audit" USING "btree" ("organization_id");



CREATE INDEX "idx_eod_logs_campaign_id" ON "public"."eod_logs" USING "btree" ("campaign_id");



CREATE INDEX "idx_eod_logs_date" ON "public"."eod_logs" USING "btree" ("date");



CREATE INDEX "idx_eod_logs_employee_id" ON "public"."eod_logs" USING "btree" ("employee_id");



CREATE INDEX "idx_eod_logs_queued" ON "public"."eod_logs" USING "btree" ("campaign_id", "date") WHERE ("released_at" IS NULL);



CREATE INDEX "idx_eod_recipients_campaign" ON "public"."campaign_eod_recipients" USING "btree" ("campaign_id");



CREATE INDEX "idx_eod_tl_notes_campaign_date" ON "public"."campaign_eod_tl_notes" USING "btree" ("campaign_id", "date");



CREATE INDEX "idx_hr_document_requests_employee" ON "public"."hr_document_requests" USING "btree" ("employee_id", "filed_at" DESC);



CREATE INDEX "idx_hr_document_requests_filed_by" ON "public"."hr_document_requests" USING "btree" ("filed_by");



CREATE INDEX "idx_hr_document_requests_status" ON "public"."hr_document_requests" USING "btree" ("status");



CREATE INDEX "idx_invoice_lines_invoice_id" ON "public"."invoice_lines" USING "btree" ("invoice_id");



CREATE INDEX "idx_invoices_client_id" ON "public"."invoices" USING "btree" ("client_id");



CREATE INDEX "idx_payroll_archive_employee_id" ON "public"."payroll_archive" USING "btree" ("employee_id");



CREATE INDEX "idx_payroll_archive_legacy_agent" ON "public"."payroll_archive" USING "btree" ("legacy_agent_id");



CREATE INDEX "idx_payroll_archive_org" ON "public"."payroll_archive" USING "btree" ("organization_id");



CREATE INDEX "idx_payroll_archive_period_code" ON "public"."payroll_archive" USING "btree" ("period_code");



CREATE INDEX "idx_payroll_periods_code" ON "public"."payroll_periods" USING "btree" ("period_code");



CREATE INDEX "idx_payroll_periods_org" ON "public"."payroll_periods" USING "btree" ("organization_id");



CREATE INDEX "idx_payroll_periods_status" ON "public"."payroll_periods" USING "btree" ("status");



CREATE INDEX "idx_payroll_records_campaign_id" ON "public"."payroll_records" USING "btree" ("campaign_id");



CREATE INDEX "idx_payroll_records_employee_id" ON "public"."payroll_records" USING "btree" ("employee_id");



CREATE INDEX "idx_payroll_records_org" ON "public"."payroll_records" USING "btree" ("organization_id");



CREATE INDEX "idx_payroll_records_status" ON "public"."payroll_records" USING "btree" ("status");



CREATE INDEX "idx_payroll_records_week_id" ON "public"."payroll_records" USING "btree" ("week_id");



CREATE INDEX "idx_payroll_weeks_org" ON "public"."payroll_weeks" USING "btree" ("organization_id");



CREATE INDEX "idx_payroll_weeks_period_id" ON "public"."payroll_weeks" USING "btree" ("period_id");



CREATE INDEX "idx_payroll_weeks_status" ON "public"."payroll_weeks" USING "btree" ("status");



CREATE INDEX "idx_policy_acknowledgments_employee" ON "public"."policy_acknowledgments" USING "btree" ("employee_id");



CREATE INDEX "idx_recruiting_candidates_assigned" ON "public"."recruiting_candidates" USING "btree" ("assigned_to");



CREATE UNIQUE INDEX "idx_recruiting_candidates_curp_unique" ON "public"."recruiting_candidates" USING "btree" ("curp") WHERE ("curp" IS NOT NULL);



CREATE INDEX "idx_recruiting_candidates_english_assessed" ON "public"."recruiting_candidates" USING "btree" ("english_level_assessed");



CREATE INDEX "idx_recruiting_candidates_next_followup" ON "public"."recruiting_candidates" USING "btree" ("next_followup_at") WHERE ("next_followup_at" IS NOT NULL);



CREATE INDEX "idx_recruiting_candidates_stage" ON "public"."recruiting_candidates" USING "btree" ("stage");



CREATE INDEX "idx_recruiting_interviews_candidate" ON "public"."recruiting_interviews" USING "btree" ("candidate_id", "conducted_at" DESC);



CREATE INDEX "idx_recruiting_interviews_outcome" ON "public"."recruiting_interviews" USING "btree" ("candidate_id", "outcome") WHERE ("outcome" IS NOT NULL);



CREATE INDEX "idx_recruiting_messages_candidate" ON "public"."recruiting_messages" USING "btree" ("candidate_id", "created_at" DESC);



CREATE INDEX "idx_rescision_desempeno_employee" ON "public"."rescision_desempeno_documents" USING "btree" ("employee_id", "created_at" DESC);



CREATE INDEX "idx_rescision_desempeno_request" ON "public"."rescision_desempeno_documents" USING "btree" ("request_id");



CREATE INDEX "idx_rescision_prueba_employee" ON "public"."rescision_prueba_documents" USING "btree" ("employee_id", "created_at" DESC);



CREATE INDEX "idx_rescision_prueba_request" ON "public"."rescision_prueba_documents" USING "btree" ("request_id");



CREATE INDEX "idx_resignation_packets_employee" ON "public"."resignation_packets" USING "btree" ("employee_id", "created_at" DESC);



CREATE INDEX "idx_resignation_packets_request" ON "public"."resignation_packets" USING "btree" ("request_id");



CREATE INDEX "idx_review_notifs_lookup" ON "public"."agent_review_notifications_sent" USING "btree" ("notification_type", "send_date");



CREATE INDEX "idx_review_notifs_review" ON "public"."agent_review_notifications_sent" USING "btree" ("review_id");



CREATE INDEX "idx_sda_acknowledged_by" ON "public"."sensitive_data_acknowledgments" USING "btree" ("acknowledged_by", "acknowledged_at" DESC);



CREATE INDEX "idx_sda_org" ON "public"."sensitive_data_acknowledgments" USING "btree" ("organization_id");



CREATE INDEX "idx_sda_subject" ON "public"."sensitive_data_acknowledgments" USING "btree" ("subject_employee_id", "acknowledged_at" DESC);



CREATE INDEX "idx_shift_audit_campaign" ON "public"."shift_settings_audit" USING "btree" ("campaign_id", "changed_at" DESC);



CREATE INDEX "idx_shift_audit_shift" ON "public"."shift_settings_audit" USING "btree" ("shift_setting_id", "changed_at" DESC);



CREATE INDEX "idx_shift_settings_campaign_id" ON "public"."shift_settings" USING "btree" ("campaign_id");



CREATE INDEX "idx_spiff_import_log_applied_at" ON "public"."spiff_import_log" USING "btree" ("applied_at" DESC);



CREATE INDEX "idx_spiff_import_log_invoice" ON "public"."spiff_import_log" USING "btree" ("invoice_id");



CREATE INDEX "idx_spiff_import_log_line" ON "public"."spiff_import_log" USING "btree" ("invoice_line_id");



CREATE INDEX "idx_time_clock_audit_edited_by" ON "public"."time_clock_audit" USING "btree" ("edited_by", "edited_at" DESC);



CREATE INDEX "idx_time_clock_audit_employee_date" ON "public"."time_clock_audit" USING "btree" ("employee_id", "date" DESC);



CREATE INDEX "idx_time_clock_date" ON "public"."time_clock" USING "btree" ("date");



CREATE INDEX "idx_time_clock_employee_id" ON "public"."time_clock" USING "btree" ("employee_id");



CREATE INDEX "idx_time_clock_open_past_shift" ON "public"."time_clock" USING "btree" ("shift_end_expected") WHERE ("clock_out" IS NULL);



CREATE INDEX "idx_time_off_requests_employee_id" ON "public"."_legacy_time_off_requests" USING "btree" ("employee_id");



CREATE INDEX "idx_time_off_requests_status" ON "public"."_legacy_time_off_requests" USING "btree" ("status");



CREATE INDEX "idx_user_profiles_employee_id" ON "public"."user_profiles" USING "btree" ("employee_id");



CREATE INDEX "tl_nudges_nudged_by_date_idx" ON "public"."tl_nudges" USING "btree" ("nudged_by", "date");



CREATE INDEX "tlc_campaign_id_idx" ON "public"."team_lead_campaigns" USING "btree" ("campaign_id");



CREATE INDEX "tlc_team_lead_id_idx" ON "public"."team_lead_campaigns" USING "btree" ("team_lead_id");



CREATE UNIQUE INDEX "uniq_employee_current_assignment" ON "public"."employee_campaign_assignments" USING "btree" ("employee_id") WHERE ("end_date" IS NULL);



CREATE INDEX "uptraining_documents_employee_id_idx" ON "public"."uptraining_documents" USING "btree" ("employee_id");



CREATE OR REPLACE TRIGGER "agent_coaching_notes_updated_at" BEFORE UPDATE ON "public"."agent_coaching_notes" FOR EACH ROW EXECUTE FUNCTION "public"."agent_coaching_notes_set_updated_at"();



CREATE OR REPLACE TRIGGER "bulletin_posts_updated_at" BEFORE UPDATE ON "public"."bulletin_posts" FOR EACH ROW EXECUTE FUNCTION "public"."set_bulletin_updated_at"();



CREATE OR REPLACE TRIGGER "clear_compliance_dedupe_on_grace_change_trigger" AFTER UPDATE OF "compliance_grace_until" ON "public"."employees" FOR EACH ROW WHEN (("old"."compliance_grace_until" IS DISTINCT FROM "new"."compliance_grace_until")) EXECUTE FUNCTION "public"."clear_compliance_dedupe_on_grace_change"();



CREATE OR REPLACE TRIGGER "clear_compliance_dedupe_on_rerejection_trigger" AFTER UPDATE OF "status" ON "public"."employee_documents" FOR EACH ROW WHEN ((("old"."status" = 'rejected'::"text") AND ("new"."status" IS DISTINCT FROM 'rejected'::"text"))) EXECUTE FUNCTION "public"."clear_compliance_dedupe_on_rerejection"();



CREATE OR REPLACE TRIGGER "enforce_clock_in_compliance_trigger" BEFORE INSERT ON "public"."time_clock" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_clock_in_compliance"();



CREATE OR REPLACE TRIGGER "set_departments_updated_at" BEFORE UPDATE ON "public"."departments" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_actas_administrativas_updated_at" BEFORE UPDATE ON "public"."actas_administrativas" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_agent_reviews_updated_at" BEFORE UPDATE ON "public"."agent_reviews" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_assign_employee_id" BEFORE INSERT ON "public"."employees" FOR EACH ROW EXECUTE FUNCTION "public"."assign_employee_id"();



CREATE OR REPLACE TRIGGER "trg_attendance_incidents_updated_at" BEFORE UPDATE ON "public"."attendance_incidents" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_cartas_compromiso_updated_at" BEFORE UPDATE ON "public"."cartas_compromiso" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_cascade_campaign_tl_change" AFTER UPDATE OF "team_lead_id" ON "public"."campaigns" FOR EACH ROW EXECUTE FUNCTION "public"."cascade_campaign_tl_change"();



CREATE OR REPLACE TRIGGER "trg_employee_documents_updated_at" BEFORE UPDATE ON "public"."employee_documents" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_employees_derive_pay_rates" BEFORE INSERT OR UPDATE OF "monthly_base_salary" ON "public"."employees" FOR EACH ROW EXECUTE FUNCTION "public"."trg_employees_derive_pay_rates"();



CREATE OR REPLACE TRIGGER "trg_eod_tl_notes_updated_at" BEFORE UPDATE ON "public"."campaign_eod_tl_notes" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_guard_user_profile_role" BEFORE UPDATE ON "public"."user_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."guard_user_profile_role"();



CREATE OR REPLACE TRIGGER "trg_hr_document_requests_updated_at" BEFORE UPDATE ON "public"."hr_document_requests" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_log_employment_status" AFTER INSERT OR UPDATE OF "employment_status" ON "public"."employees" FOR EACH ROW EXECUTE FUNCTION "public"."log_employment_status_change"();



CREATE OR REPLACE TRIGGER "trg_payroll_archive_readonly_delete" BEFORE DELETE ON "public"."payroll_archive" FOR EACH ROW EXECUTE FUNCTION "public"."trg_payroll_archive_readonly"();



CREATE OR REPLACE TRIGGER "trg_payroll_archive_readonly_insert" BEFORE INSERT ON "public"."payroll_archive" FOR EACH ROW EXECUTE FUNCTION "public"."trg_payroll_archive_readonly"();



CREATE OR REPLACE TRIGGER "trg_payroll_archive_readonly_update" BEFORE UPDATE ON "public"."payroll_archive" FOR EACH ROW EXECUTE FUNCTION "public"."trg_payroll_archive_readonly"();



CREATE OR REPLACE TRIGGER "trg_payroll_audit_log_immutable" BEFORE DELETE OR UPDATE ON "public"."payroll_audit_log" FOR EACH ROW EXECUTE FUNCTION "public"."payroll_audit_log_immutable"();



CREATE OR REPLACE TRIGGER "trg_payroll_records_paid_lock" BEFORE UPDATE ON "public"."payroll_records" FOR EACH ROW EXECUTE FUNCTION "public"."payroll_records_paid_lock"();



CREATE OR REPLACE TRIGGER "trg_payroll_records_recalc" BEFORE INSERT OR UPDATE ON "public"."payroll_records" FOR EACH ROW EXECUTE FUNCTION "public"."payroll_records_recalc_trigger_fn"();



CREATE OR REPLACE TRIGGER "trg_payroll_records_updated_at" BEFORE UPDATE ON "public"."payroll_records" FOR EACH ROW EXECUTE FUNCTION "public"."payroll_records_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_policy_documents_updated_at" BEFORE UPDATE ON "public"."policy_documents" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_recruiting_candidates_stage_changed_at" BEFORE UPDATE ON "public"."recruiting_candidates" FOR EACH ROW EXECUTE FUNCTION "public"."recruiting_set_stage_changed_at"();



CREATE OR REPLACE TRIGGER "trg_recruiting_candidates_updated_at" BEFORE UPDATE ON "public"."recruiting_candidates" FOR EACH ROW EXECUTE FUNCTION "public"."recruiting_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_required_document_types_updated_at" BEFORE UPDATE ON "public"."required_document_types" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_rescision_desempeno_updated_at" BEFORE UPDATE ON "public"."rescision_desempeno_documents" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_rescision_prueba_updated_at" BEFORE UPDATE ON "public"."rescision_prueba_documents" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_resignation_packets_updated_at" BEFORE UPDATE ON "public"."resignation_packets" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_sda_fill_defaults" BEFORE INSERT ON "public"."sensitive_data_acknowledgments" FOR EACH ROW EXECUTE FUNCTION "public"."sda_fill_defaults"();



CREATE OR REPLACE TRIGGER "trg_seed_agent_reviews" AFTER INSERT OR UPDATE OF "hire_date" ON "public"."employees" FOR EACH ROW EXECUTE FUNCTION "public"."seed_agent_reviews"();



CREATE OR REPLACE TRIGGER "trg_set_employee_organization_id" BEFORE INSERT ON "public"."employees" FOR EACH ROW EXECUTE FUNCTION "public"."set_employee_organization_id"();



CREATE OR REPLACE TRIGGER "trg_set_payroll_period_org" BEFORE INSERT ON "public"."payroll_periods" FOR EACH ROW EXECUTE FUNCTION "public"."set_payroll_period_org"();



CREATE OR REPLACE TRIGGER "trg_shift_settings_audit" AFTER INSERT OR DELETE OR UPDATE ON "public"."shift_settings" FOR EACH ROW EXECUTE FUNCTION "public"."log_shift_settings_change"();



CREATE OR REPLACE TRIGGER "trg_sync_employee_is_active" BEFORE INSERT OR UPDATE OF "employment_status" ON "public"."employees" FOR EACH ROW EXECUTE FUNCTION "public"."sync_employee_is_active"();



CREATE OR REPLACE TRIGGER "trg_sync_reports_to_from_campaign" BEFORE INSERT OR UPDATE OF "campaign_id" ON "public"."employees" FOR EACH ROW EXECUTE FUNCTION "public"."sync_reports_to_from_campaign"();



CREATE OR REPLACE TRIGGER "trg_sync_user_profile_role" BEFORE INSERT OR UPDATE OF "employee_id" ON "public"."user_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."sync_user_profile_role"();



CREATE OR REPLACE TRIGGER "trg_time_clock_set_lateness" BEFORE INSERT OR UPDATE OF "clock_in" ON "public"."time_clock" FOR EACH ROW EXECUTE FUNCTION "public"."tg_time_clock_set_lateness"();



ALTER TABLE ONLY "public"."actas_administrativas"
    ADD CONSTRAINT "actas_administrativas_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."employees"("id");



ALTER TABLE ONLY "public"."actas_administrativas"
    ADD CONSTRAINT "actas_administrativas_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."actas_administrativas"
    ADD CONSTRAINT "actas_administrativas_reincidencia_prior_carta_id_fkey" FOREIGN KEY ("reincidencia_prior_carta_id") REFERENCES "public"."cartas_compromiso"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."agent_coaching_notes"
    ADD CONSTRAINT "agent_coaching_notes_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_coaching_notes"
    ADD CONSTRAINT "agent_coaching_notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."employees"("id");



ALTER TABLE ONLY "public"."agent_coaching_notes"
    ADD CONSTRAINT "agent_coaching_notes_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id");



ALTER TABLE ONLY "public"."agent_review_notifications_sent"
    ADD CONSTRAINT "agent_review_notifications_sent_recipient_employee_id_fkey" FOREIGN KEY ("recipient_employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_review_notifications_sent"
    ADD CONSTRAINT "agent_review_notifications_sent_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "public"."agent_reviews"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_reviews"
    ADD CONSTRAINT "agent_reviews_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_reviews"
    ADD CONSTRAINT "agent_reviews_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_reviews"
    ADD CONSTRAINT "agent_reviews_hr_decided_by_fkey" FOREIGN KEY ("hr_decided_by") REFERENCES "public"."employees"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."agent_reviews"
    ADD CONSTRAINT "agent_reviews_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."employees"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."attendance_incidents"
    ADD CONSTRAINT "attendance_incidents_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."employees"("id");



ALTER TABLE ONLY "public"."attendance_incidents"
    ADD CONSTRAINT "attendance_incidents_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bulletin_acks"
    ADD CONSTRAINT "bulletin_acks_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bulletin_acks"
    ADD CONSTRAINT "bulletin_acks_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."bulletin_posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bulletin_posts"
    ADD CONSTRAINT "bulletin_posts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."employees"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."bulletin_posts"
    ADD CONSTRAINT "bulletin_posts_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."bulletin_posts"
    ADD CONSTRAINT "bulletin_posts_recognized_employee_id_fkey" FOREIGN KEY ("recognized_employee_id") REFERENCES "public"."employees"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."bulletin_questions"
    ADD CONSTRAINT "bulletin_questions_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."bulletin_posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bulletin_responses"
    ADD CONSTRAINT "bulletin_responses_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."bulletin_posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bulletin_responses"
    ADD CONSTRAINT "bulletin_responses_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."bulletin_questions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bulletin_responses"
    ADD CONSTRAINT "bulletin_responses_respondent_id_fkey" FOREIGN KEY ("respondent_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_eod_recipients"
    ADD CONSTRAINT "campaign_eod_recipients_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_eod_tl_notes"
    ADD CONSTRAINT "campaign_eod_tl_notes_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_eod_tl_notes"
    ADD CONSTRAINT "campaign_eod_tl_notes_written_by_fkey" FOREIGN KEY ("written_by") REFERENCES "public"."employees"("id");



ALTER TABLE ONLY "public"."campaign_kpi_config"
    ADD CONSTRAINT "campaign_kpi_config_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaigns"
    ADD CONSTRAINT "campaigns_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaigns"
    ADD CONSTRAINT "campaigns_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."campaigns"
    ADD CONSTRAINT "campaigns_team_lead_id_fkey" FOREIGN KEY ("team_lead_id") REFERENCES "public"."employees"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cartas_compromiso"
    ADD CONSTRAINT "cartas_compromiso_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."employees"("id");



ALTER TABLE ONLY "public"."cartas_compromiso"
    ADD CONSTRAINT "cartas_compromiso_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_holidays"
    ADD CONSTRAINT "client_holidays_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_holidays"
    ADD CONSTRAINT "client_holidays_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."client_recurring_deductions"
    ADD CONSTRAINT "client_recurring_deductions_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id");



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."company_holidays"
    ADD CONSTRAINT "company_holidays_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."company_holidays"
    ADD CONSTRAINT "company_holidays_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."compliance_notifications_sent"
    ADD CONSTRAINT "compliance_notifications_sent_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."compliance_notifications_sent"
    ADD CONSTRAINT "compliance_notifications_sent_related_document_id_fkey" FOREIGN KEY ("related_document_id") REFERENCES "public"."employee_documents"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."departments"
    ADD CONSTRAINT "departments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."employee_campaign_assignments"
    ADD CONSTRAINT "employee_campaign_assignments_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id");



ALTER TABLE ONLY "public"."employee_campaign_assignments"
    ADD CONSTRAINT "employee_campaign_assignments_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."employee_campaign_assignments"
    ADD CONSTRAINT "employee_campaign_assignments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employee_documents"
    ADD CONSTRAINT "employee_documents_document_type_id_fkey" FOREIGN KEY ("document_type_id") REFERENCES "public"."required_document_types"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."employee_documents"
    ADD CONSTRAINT "employee_documents_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employee_documents"
    ADD CONSTRAINT "employee_documents_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."employee_documents"
    ADD CONSTRAINT "employee_documents_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id");



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id");



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_flat_bill_client_id_fkey" FOREIGN KEY ("flat_bill_client_id") REFERENCES "public"."clients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_recruited_from_candidate_id_fkey" FOREIGN KEY ("recruited_from_candidate_id") REFERENCES "public"."recruiting_candidates"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_reports_to_fkey" FOREIGN KEY ("reports_to") REFERENCES "public"."employees"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_terminated_by_fkey" FOREIGN KEY ("terminated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."employment_history"
    ADD CONSTRAINT "employment_history_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."employment_history"
    ADD CONSTRAINT "employment_history_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."eod_digest_log"
    ADD CONSTRAINT "eod_digest_log_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."eod_logs_audit"
    ADD CONSTRAINT "eod_logs_audit_edited_by_fkey" FOREIGN KEY ("edited_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."eod_logs_audit"
    ADD CONSTRAINT "eod_logs_audit_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."eod_logs_audit"
    ADD CONSTRAINT "eod_logs_audit_eod_log_id_fkey" FOREIGN KEY ("eod_log_id") REFERENCES "public"."eod_logs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."eod_logs_audit"
    ADD CONSTRAINT "eod_logs_audit_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."eod_logs"
    ADD CONSTRAINT "eod_logs_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id");



ALTER TABLE ONLY "public"."eod_logs"
    ADD CONSTRAINT "eod_logs_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."eod_logs"
    ADD CONSTRAINT "eod_logs_submitted_by_user_id_fkey" FOREIGN KEY ("submitted_by_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."actas_administrativas"
    ADD CONSTRAINT "fk_actas_request_id" FOREIGN KEY ("request_id") REFERENCES "public"."hr_document_requests"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cartas_compromiso"
    ADD CONSTRAINT "fk_cartas_request_id" FOREIGN KEY ("request_id") REFERENCES "public"."hr_document_requests"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."holiday_notification_sent"
    ADD CONSTRAINT "holiday_notification_sent_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."holiday_requests"
    ADD CONSTRAINT "holiday_requests_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."holiday_requests"
    ADD CONSTRAINT "holiday_requests_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."holiday_requests"
    ADD CONSTRAINT "holiday_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."hr_document_requests"
    ADD CONSTRAINT "hr_document_requests_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."hr_document_requests"
    ADD CONSTRAINT "hr_document_requests_filed_by_fkey" FOREIGN KEY ("filed_by") REFERENCES "public"."employees"("id");



ALTER TABLE ONLY "public"."hr_document_requests"
    ADD CONSTRAINT "hr_document_requests_fulfilled_acta_id_fkey" FOREIGN KEY ("fulfilled_acta_id") REFERENCES "public"."actas_administrativas"("id") ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;



ALTER TABLE ONLY "public"."hr_document_requests"
    ADD CONSTRAINT "hr_document_requests_fulfilled_carta_id_fkey" FOREIGN KEY ("fulfilled_carta_id") REFERENCES "public"."cartas_compromiso"("id") ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;



ALTER TABLE ONLY "public"."hr_document_requests"
    ADD CONSTRAINT "hr_document_requests_fulfilled_renuncia_id_fkey" FOREIGN KEY ("fulfilled_renuncia_id") REFERENCES "public"."resignation_packets"("id") ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;



ALTER TABLE ONLY "public"."hr_document_requests"
    ADD CONSTRAINT "hr_document_requests_fulfilled_rescision_desempeno_id_fkey" FOREIGN KEY ("fulfilled_rescision_desempeno_id") REFERENCES "public"."rescision_desempeno_documents"("id") ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;



ALTER TABLE ONLY "public"."hr_document_requests"
    ADD CONSTRAINT "hr_document_requests_fulfilled_rescision_id_fkey" FOREIGN KEY ("fulfilled_rescision_id") REFERENCES "public"."rescision_prueba_documents"("id") ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;



ALTER TABLE ONLY "public"."invoice_lines"
    ADD CONSTRAINT "invoice_lines_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invoice_lines"
    ADD CONSTRAINT "invoice_lines_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id");



ALTER TABLE ONLY "public"."payroll_archive"
    ADD CONSTRAINT "payroll_archive_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id");



ALTER TABLE ONLY "public"."payroll_archive"
    ADD CONSTRAINT "payroll_archive_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."payroll_audit_log"
    ADD CONSTRAINT "payroll_audit_log_actor_fkey" FOREIGN KEY ("actor") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."payroll_audit_log"
    ADD CONSTRAINT "payroll_audit_log_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."payroll_periods"
    ADD CONSTRAINT "payroll_periods_locked_by_fkey" FOREIGN KEY ("locked_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."payroll_periods"
    ADD CONSTRAINT "payroll_periods_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."payroll_records"
    ADD CONSTRAINT "payroll_records_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id");



ALTER TABLE ONLY "public"."payroll_records"
    ADD CONSTRAINT "payroll_records_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id");



ALTER TABLE ONLY "public"."payroll_records"
    ADD CONSTRAINT "payroll_records_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."payroll_records"
    ADD CONSTRAINT "payroll_records_week_id_fkey" FOREIGN KEY ("week_id") REFERENCES "public"."payroll_weeks"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."payroll_validation_runs"
    ADD CONSTRAINT "payroll_validation_runs_run_by_fkey" FOREIGN KEY ("run_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."payroll_weeks"
    ADD CONSTRAINT "payroll_weeks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."payroll_weeks"
    ADD CONSTRAINT "payroll_weeks_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "public"."payroll_periods"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."payroll_weeks"
    ADD CONSTRAINT "payroll_weeks_status_changed_by_fkey" FOREIGN KEY ("status_changed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."policy_acknowledgments"
    ADD CONSTRAINT "policy_acknowledgments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."policy_acknowledgments"
    ADD CONSTRAINT "policy_acknowledgments_policy_document_version_id_fkey" FOREIGN KEY ("policy_document_version_id") REFERENCES "public"."policy_document_versions"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."policy_document_versions"
    ADD CONSTRAINT "policy_document_versions_policy_document_id_fkey" FOREIGN KEY ("policy_document_id") REFERENCES "public"."policy_documents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."policy_document_versions"
    ADD CONSTRAINT "policy_document_versions_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "public"."employees"("id");



ALTER TABLE ONLY "public"."policy_documents"
    ADD CONSTRAINT "policy_documents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."recruiting_candidates"
    ADD CONSTRAINT "recruiting_candidates_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."recruiting_interviews"
    ADD CONSTRAINT "recruiting_interviews_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "public"."recruiting_candidates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recruiting_interviews"
    ADD CONSTRAINT "recruiting_interviews_conducted_by_fkey" FOREIGN KEY ("conducted_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."recruiting_messages"
    ADD CONSTRAINT "recruiting_messages_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "public"."recruiting_candidates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recruiting_messages"
    ADD CONSTRAINT "recruiting_messages_sent_by_fkey" FOREIGN KEY ("sent_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rescision_desempeno_documents"
    ADD CONSTRAINT "rescision_desempeno_documents_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."employees"("id");



ALTER TABLE ONLY "public"."rescision_desempeno_documents"
    ADD CONSTRAINT "rescision_desempeno_documents_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rescision_desempeno_documents"
    ADD CONSTRAINT "rescision_desempeno_documents_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."hr_document_requests"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rescision_prueba_documents"
    ADD CONSTRAINT "rescision_prueba_documents_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."employees"("id");



ALTER TABLE ONLY "public"."rescision_prueba_documents"
    ADD CONSTRAINT "rescision_prueba_documents_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rescision_prueba_documents"
    ADD CONSTRAINT "rescision_prueba_documents_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."hr_document_requests"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."resignation_packets"
    ADD CONSTRAINT "resignation_packets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."employees"("id");



ALTER TABLE ONLY "public"."resignation_packets"
    ADD CONSTRAINT "resignation_packets_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."resignation_packets"
    ADD CONSTRAINT "resignation_packets_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."hr_document_requests"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sensitive_data_acknowledgments"
    ADD CONSTRAINT "sensitive_data_acknowledgments_acknowledged_by_fkey" FOREIGN KEY ("acknowledged_by") REFERENCES "public"."employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sensitive_data_acknowledgments"
    ADD CONSTRAINT "sensitive_data_acknowledgments_acknowledged_by_user_id_fkey" FOREIGN KEY ("acknowledged_by_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sensitive_data_acknowledgments"
    ADD CONSTRAINT "sensitive_data_acknowledgments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sensitive_data_acknowledgments"
    ADD CONSTRAINT "sensitive_data_acknowledgments_subject_employee_id_fkey" FOREIGN KEY ("subject_employee_id") REFERENCES "public"."employees"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."shift_settings_audit"
    ADD CONSTRAINT "shift_settings_audit_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."shift_settings_audit"
    ADD CONSTRAINT "shift_settings_audit_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."shift_settings"
    ADD CONSTRAINT "shift_settings_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."shift_settings"
    ADD CONSTRAINT "shift_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."spiff_import_log"
    ADD CONSTRAINT "spiff_import_log_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."spiff_import_log"
    ADD CONSTRAINT "spiff_import_log_invoice_line_id_fkey" FOREIGN KEY ("invoice_line_id") REFERENCES "public"."invoice_lines"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."team_lead_campaigns"
    ADD CONSTRAINT "team_lead_campaigns_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."team_lead_campaigns"
    ADD CONSTRAINT "team_lead_campaigns_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."team_lead_campaigns"
    ADD CONSTRAINT "team_lead_campaigns_team_lead_id_fkey" FOREIGN KEY ("team_lead_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."time_clock_audit"
    ADD CONSTRAINT "time_clock_audit_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id");



ALTER TABLE ONLY "public"."time_clock_audit"
    ADD CONSTRAINT "time_clock_audit_time_clock_id_fkey" FOREIGN KEY ("time_clock_id") REFERENCES "public"."time_clock"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."time_clock"
    ADD CONSTRAINT "time_clock_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."_legacy_time_off_requests"
    ADD CONSTRAINT "time_off_requests_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."_legacy_time_off_requests"
    ADD CONSTRAINT "time_off_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tl_nudges"
    ADD CONSTRAINT "tl_nudges_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tl_nudges"
    ADD CONSTRAINT "tl_nudges_nudged_by_fkey" FOREIGN KEY ("nudged_by") REFERENCES "public"."employees"("id");



ALTER TABLE ONLY "public"."uptraining_documents"
    ADD CONSTRAINT "uptraining_documents_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."uptraining_documents"
    ADD CONSTRAINT "uptraining_documents_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "public"."employees"("id");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."vacation_requests"
    ADD CONSTRAINT "vacation_requests_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id");



ALTER TABLE ONLY "public"."vacation_requests"
    ADD CONSTRAINT "vacation_requests_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vacation_requests"
    ADD CONSTRAINT "vacation_requests_hr_reviewed_by_fkey" FOREIGN KEY ("hr_reviewed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."vacation_requests"
    ADD CONSTRAINT "vacation_requests_tl_reviewed_by_fkey" FOREIGN KEY ("tl_reviewed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



CREATE POLICY "Allow read for authenticated" ON "public"."mexican_holidays" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



ALTER TABLE "public"."_legacy_time_off_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."actas_administrativas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agent_coaching_notes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agent_review_notifications_sent" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agent_reviews" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "agent_select_own_completed_reviews" ON "public"."agent_reviews" FOR SELECT TO "authenticated" USING ((("employee_id" = "public"."my_employee_id"()) AND ("completed_at" IS NOT NULL) AND (("decision" IS DISTINCT FROM 'let_go'::"public"."review_decision") OR ("termination_status" = 'confirmed'::"public"."review_termination_status"))));



CREATE POLICY "agents_insert_own_acks" ON "public"."policy_acknowledgments" FOR INSERT TO "authenticated" WITH CHECK (("employee_id" = "public"."my_employee_id"()));



CREATE POLICY "agents_insert_own_documents" ON "public"."employee_documents" FOR INSERT TO "authenticated" WITH CHECK ((("employee_id" = "public"."my_employee_id"()) AND ("status" = 'pending_review'::"text") AND ("uploaded_by" = "auth"."uid"())));



CREATE POLICY "agents_insert_own_eod_logs" ON "public"."eod_logs" FOR INSERT TO "authenticated" WITH CHECK (("employee_id" = "public"."my_employee_id"()));



CREATE POLICY "agents_insert_own_time_clock" ON "public"."time_clock" FOR INSERT TO "authenticated" WITH CHECK (("employee_id" = "public"."my_employee_id"()));



CREATE POLICY "agents_insert_own_time_off" ON "public"."_legacy_time_off_requests" FOR INSERT TO "authenticated" WITH CHECK (("employee_id" = "public"."my_employee_id"()));



CREATE POLICY "agents_select_own_acks" ON "public"."policy_acknowledgments" FOR SELECT TO "authenticated" USING (("employee_id" = "public"."my_employee_id"()));



CREATE POLICY "agents_select_own_documents" ON "public"."employee_documents" FOR SELECT TO "authenticated" USING (("employee_id" = "public"."my_employee_id"()));



CREATE POLICY "agents_select_own_employee" ON "public"."employees" FOR SELECT TO "authenticated" USING ((("organization_id" = "public"."my_org_id"()) AND ("id" = "public"."my_employee_id"())));



CREATE POLICY "agents_select_own_eod_logs" ON "public"."eod_logs" FOR SELECT TO "authenticated" USING (("employee_id" = "public"."my_employee_id"()));



CREATE POLICY "agents_select_own_incidents" ON "public"."attendance_incidents" FOR SELECT TO "authenticated" USING (("employee_id" = "public"."my_employee_id"()));



CREATE POLICY "agents_select_own_signed_actas" ON "public"."actas_administrativas" FOR SELECT TO "authenticated" USING ((("employee_id" = "public"."my_employee_id"()) AND ("signed_at" IS NOT NULL) AND ("signed_scan_path" IS NOT NULL)));



CREATE POLICY "agents_select_own_signed_cartas" ON "public"."cartas_compromiso" FOR SELECT TO "authenticated" USING ((("employee_id" = "public"."my_employee_id"()) AND ("signed_at" IS NOT NULL) AND ("signed_scan_path" IS NOT NULL)));



CREATE POLICY "agents_select_own_signed_renuncias" ON "public"."resignation_packets" FOR SELECT TO "authenticated" USING ((("employee_id" = "public"."my_employee_id"()) AND ("signed_at" IS NOT NULL) AND ("signed_scan_path" IS NOT NULL)));



CREATE POLICY "agents_select_own_signed_rescisiones" ON "public"."rescision_prueba_documents" FOR SELECT TO "authenticated" USING ((("employee_id" = "public"."my_employee_id"()) AND ("signed_at" IS NOT NULL) AND ("signed_scan_path" IS NOT NULL)));



CREATE POLICY "agents_select_own_signed_rescisiones_desempeno" ON "public"."rescision_desempeno_documents" FOR SELECT TO "authenticated" USING ((("employee_id" = "public"."my_employee_id"()) AND ("signed_at" IS NOT NULL) AND ("signed_scan_path" IS NOT NULL)));



CREATE POLICY "agents_select_own_time_clock" ON "public"."time_clock" FOR SELECT TO "authenticated" USING (("employee_id" = "public"."my_employee_id"()));



CREATE POLICY "agents_select_own_time_off" ON "public"."_legacy_time_off_requests" FOR SELECT TO "authenticated" USING (("employee_id" = "public"."my_employee_id"()));



CREATE POLICY "agents_update_own_eod_logs_before_cutoff" ON "public"."eod_logs" FOR UPDATE TO "authenticated" USING ((("employee_id" = "public"."my_employee_id"()) AND "public"."eod_before_cutoff"("campaign_id", "date"))) WITH CHECK (("employee_id" = "public"."my_employee_id"()));



CREATE POLICY "agents_update_own_time_clock" ON "public"."time_clock" FOR UPDATE TO "authenticated" USING (("employee_id" = "public"."my_employee_id"()));



CREATE POLICY "agents_update_rejected_documents" ON "public"."employee_documents" FOR UPDATE TO "authenticated" USING ((("employee_id" = "public"."my_employee_id"()) AND ("status" = 'rejected'::"text"))) WITH CHECK ((("employee_id" = "public"."my_employee_id"()) AND ("status" = 'pending_review'::"text") AND ("uploaded_by" = "auth"."uid"())));



ALTER TABLE "public"."app_config" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."attendance_incidents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "authenticated_select_campaign_kpi_config" ON "public"."campaign_kpi_config" FOR SELECT TO "authenticated" USING ((("campaign_id" IN ( SELECT "campaigns"."id"
   FROM "public"."campaigns"
  WHERE ("campaigns"."organization_id" = "public"."my_org_id"()))) AND ((NOT "public"."is_client"()) OR ("campaign_id" IN ( SELECT "public"."my_client_campaign_ids"() AS "my_client_campaign_ids")))));



CREATE POLICY "authenticated_select_campaigns" ON "public"."campaigns" FOR SELECT TO "authenticated" USING ((("organization_id" = "public"."my_org_id"()) AND ((NOT "public"."is_client"()) OR ("client_id" = "public"."my_client_id"()))));



CREATE POLICY "authenticated_select_clients" ON "public"."clients" FOR SELECT TO "authenticated" USING ((("organization_id" = "public"."my_org_id"()) AND ((NOT "public"."is_client"()) OR ("id" = "public"."my_client_id"()))));



CREATE POLICY "authenticated_select_departments" ON "public"."departments" FOR SELECT TO "authenticated" USING (("organization_id" = "public"."my_org_id"()));



CREATE POLICY "authenticated_select_policies_for_me" ON "public"."policy_documents" FOR SELECT TO "authenticated" USING ((("organization_id" = "public"."my_org_id"()) AND ("is_active" = true) AND (("is_global" = true) OR (EXISTS ( SELECT 1
   FROM "public"."employees" "e"
  WHERE (("e"."id" = "public"."my_employee_id"()) AND ("e"."campaign_id" = ANY ("policy_documents"."scoped_campaign_ids")))))) AND (("applicable_roles" IS NULL) OR (EXISTS ( SELECT 1
   FROM "public"."employees" "e"
  WHERE (("e"."id" = "public"."my_employee_id"()) AND ("e"."title" = ANY ("policy_documents"."applicable_roles"))))))));



CREATE POLICY "authenticated_select_required_document_types" ON "public"."required_document_types" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "authenticated_select_shift_settings" ON "public"."shift_settings" FOR SELECT TO "authenticated" USING (("campaign_id" IN ( SELECT "campaigns"."id"
   FROM "public"."campaigns"
  WHERE ("campaigns"."organization_id" = "public"."my_org_id"()))));



CREATE POLICY "authenticated_select_versions_hardened" ON "public"."policy_document_versions" FOR SELECT TO "authenticated" USING (("public"."is_leadership"() OR (EXISTS ( SELECT 1
   FROM ("public"."policy_documents" "pd"
     JOIN "public"."user_profiles" "up" ON (("up"."organization_id" = "pd"."organization_id")))
  WHERE (("pd"."id" = "policy_document_versions"."policy_document_id") AND ("up"."id" = "auth"."uid"()))))));



ALTER TABLE "public"."bulletin_acks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bulletin_posts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bulletin_questions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bulletin_responses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."campaign_eod_recipients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."campaign_eod_tl_notes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."campaign_kpi_config" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."campaigns" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cartas_compromiso" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."client_holidays" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "client_holidays_leadership_write" ON "public"."client_holidays" USING ("public"."is_leadership"()) WITH CHECK ("public"."is_leadership"());



CREATE POLICY "client_holidays_read" ON "public"."client_holidays" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



ALTER TABLE "public"."client_recurring_deductions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."clients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."company_holidays" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "company_holidays_leadership_write" ON "public"."company_holidays" USING ((("organization_id" = "public"."my_org_id"()) AND "public"."is_leadership"())) WITH CHECK ((("organization_id" = "public"."my_org_id"()) AND "public"."is_leadership"()));



CREATE POLICY "company_holidays_read" ON "public"."company_holidays" FOR SELECT USING ((("auth"."role"() = 'authenticated'::"text") AND ("organization_id" = "public"."my_org_id"())));



ALTER TABLE "public"."compliance_notifications_sent" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."departments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "eca_leadership_write" ON "public"."employee_campaign_assignments" USING ("public"."is_leadership"()) WITH CHECK ("public"."is_leadership"());



CREATE POLICY "eca_read" ON "public"."employee_campaign_assignments" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



ALTER TABLE "public"."employee_campaign_assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."employee_documents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."employees" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "employees can ack posts" ON "public"."bulletin_acks" FOR INSERT TO "authenticated" WITH CHECK (("employee_id" = "public"."my_employee_id"()));



CREATE POLICY "employees can read published posts" ON "public"."bulletin_posts" FOR SELECT TO "authenticated" USING ((("is_published" = true) AND (("expires_at" IS NULL) OR ("expires_at" > "now"())) AND (("campaign_id" IS NULL) OR ("campaign_id" = ( SELECT "e"."campaign_id"
   FROM "public"."employees" "e"
  WHERE (("e"."id" = "public"."my_employee_id"()) AND ("e"."is_active" = true))
 LIMIT 1)))));



CREATE POLICY "employees can read questions on published posts" ON "public"."bulletin_questions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."bulletin_posts" "bp"
  WHERE (("bp"."id" = "bulletin_questions"."post_id") AND ("bp"."is_published" = true) AND (("bp"."expires_at" IS NULL) OR ("bp"."expires_at" > "now"()))))));



CREATE POLICY "employees can submit responses" ON "public"."bulletin_responses" FOR INSERT TO "authenticated" WITH CHECK (("respondent_id" = "public"."my_employee_id"()));



CREATE POLICY "employees can view own acks" ON "public"."bulletin_acks" FOR SELECT TO "authenticated" USING (("employee_id" = "public"."my_employee_id"()));



CREATE POLICY "employees can view own responses" ON "public"."bulletin_responses" FOR SELECT TO "authenticated" USING (("respondent_id" = "public"."my_employee_id"()));



ALTER TABLE "public"."employment_history" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "employment_history_leadership_read" ON "public"."employment_history" FOR SELECT TO "authenticated" USING ("public"."is_leadership"());



ALTER TABLE "public"."eod_digest_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."eod_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."eod_logs_audit" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."holiday_notification_sent" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."holiday_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "holiday_requests_agent_cancel" ON "public"."holiday_requests" FOR UPDATE USING (("employee_id" = "public"."my_employee_id"()));



CREATE POLICY "holiday_requests_agent_insert" ON "public"."holiday_requests" FOR INSERT WITH CHECK (("employee_id" = "public"."my_employee_id"()));



CREATE POLICY "holiday_requests_agent_select" ON "public"."holiday_requests" FOR SELECT USING (("employee_id" = "public"."my_employee_id"()));



CREATE POLICY "holiday_requests_leadership_all" ON "public"."holiday_requests" TO "authenticated" USING (("public"."is_leadership"() AND ("employee_id" IN ( SELECT "employees"."id"
   FROM "public"."employees"
  WHERE ("employees"."organization_id" = "public"."my_org_id"()))))) WITH CHECK (("public"."is_leadership"() AND ("employee_id" IN ( SELECT "employees"."id"
   FROM "public"."employees"
  WHERE ("employees"."organization_id" = "public"."my_org_id"())))));



CREATE POLICY "holiday_requests_tl_select" ON "public"."holiday_requests" FOR SELECT TO "authenticated" USING (("public"."is_team_lead"() AND "public"."tl_employee_on_my_team"("employee_id") AND ("employee_id" IN ( SELECT "employees"."id"
   FROM "public"."employees"
  WHERE ("employees"."organization_id" = "public"."my_org_id"())))));



CREATE POLICY "holiday_requests_tl_update" ON "public"."holiday_requests" FOR UPDATE TO "authenticated" USING (("public"."is_team_lead"() AND "public"."tl_employee_on_my_team"("employee_id") AND ("employee_id" IN ( SELECT "employees"."id"
   FROM "public"."employees"
  WHERE ("employees"."organization_id" = "public"."my_org_id"())))));



ALTER TABLE "public"."hr_document_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."invoice_lines" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."invoices" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "leadership read spiff_import_log" ON "public"."spiff_import_log" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_profiles" "up"
  WHERE (("up"."id" = "auth"."uid"()) AND ("up"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text"]))))));



CREATE POLICY "leadership_all_actas" ON "public"."actas_administrativas" TO "authenticated" USING (("public"."is_leadership"() AND ("employee_id" IN ( SELECT "employees"."id"
   FROM "public"."employees"
  WHERE ("employees"."organization_id" = "public"."my_org_id"()))))) WITH CHECK (("public"."is_leadership"() AND ("employee_id" IN ( SELECT "employees"."id"
   FROM "public"."employees"
  WHERE ("employees"."organization_id" = "public"."my_org_id"())))));



CREATE POLICY "leadership_all_agent_coaching_notes" ON "public"."agent_coaching_notes" TO "authenticated" USING (("public"."is_leadership"() AND ("campaign_id" IN ( SELECT "campaigns"."id"
   FROM "public"."campaigns"
  WHERE ("campaigns"."organization_id" = "public"."my_org_id"()))))) WITH CHECK (("public"."is_leadership"() AND ("campaign_id" IN ( SELECT "campaigns"."id"
   FROM "public"."campaigns"
  WHERE ("campaigns"."organization_id" = "public"."my_org_id"())))));



CREATE POLICY "leadership_all_agent_reviews" ON "public"."agent_reviews" TO "authenticated" USING ("public"."is_leadership"()) WITH CHECK ("public"."is_leadership"());



CREATE POLICY "leadership_all_attendance_incidents" ON "public"."attendance_incidents" TO "authenticated" USING (("public"."is_leadership"() AND ("employee_id" IN ( SELECT "employees"."id"
   FROM "public"."employees"
  WHERE ("employees"."organization_id" = "public"."my_org_id"()))))) WITH CHECK (("public"."is_leadership"() AND ("employee_id" IN ( SELECT "employees"."id"
   FROM "public"."employees"
  WHERE ("employees"."organization_id" = "public"."my_org_id"())))));



CREATE POLICY "leadership_all_cartas" ON "public"."cartas_compromiso" TO "authenticated" USING (("public"."is_leadership"() AND ("employee_id" IN ( SELECT "employees"."id"
   FROM "public"."employees"
  WHERE ("employees"."organization_id" = "public"."my_org_id"()))))) WITH CHECK (("public"."is_leadership"() AND ("employee_id" IN ( SELECT "employees"."id"
   FROM "public"."employees"
  WHERE ("employees"."organization_id" = "public"."my_org_id"())))));



CREATE POLICY "leadership_all_departments" ON "public"."departments" TO "authenticated" USING ((("organization_id" = "public"."my_org_id"()) AND "public"."is_leadership"())) WITH CHECK ((("organization_id" = "public"."my_org_id"()) AND "public"."is_leadership"()));



CREATE POLICY "leadership_all_eod_digest_log" ON "public"."eod_digest_log" TO "authenticated" USING (("public"."is_leadership"() AND ("campaign_id" IN ( SELECT "campaigns"."id"
   FROM "public"."campaigns"
  WHERE ("campaigns"."organization_id" = "public"."my_org_id"()))))) WITH CHECK (("public"."is_leadership"() AND ("campaign_id" IN ( SELECT "campaigns"."id"
   FROM "public"."campaigns"
  WHERE ("campaigns"."organization_id" = "public"."my_org_id"())))));



CREATE POLICY "leadership_all_eod_logs" ON "public"."eod_logs" TO "authenticated" USING (("public"."is_leadership"() AND ("employee_id" IN ( SELECT "employees"."id"
   FROM "public"."employees"
  WHERE ("employees"."organization_id" = "public"."my_org_id"()))))) WITH CHECK (("public"."is_leadership"() AND ("employee_id" IN ( SELECT "employees"."id"
   FROM "public"."employees"
  WHERE ("employees"."organization_id" = "public"."my_org_id"())))));



CREATE POLICY "leadership_all_eod_recipients" ON "public"."campaign_eod_recipients" TO "authenticated" USING (("public"."is_leadership"() AND ("campaign_id" IN ( SELECT "campaigns"."id"
   FROM "public"."campaigns"
  WHERE ("campaigns"."organization_id" = "public"."my_org_id"()))))) WITH CHECK (("public"."is_leadership"() AND ("campaign_id" IN ( SELECT "campaigns"."id"
   FROM "public"."campaigns"
  WHERE ("campaigns"."organization_id" = "public"."my_org_id"())))));



CREATE POLICY "leadership_all_eod_tl_notes" ON "public"."campaign_eod_tl_notes" TO "authenticated" USING (("public"."is_leadership"() AND ("campaign_id" IN ( SELECT "campaigns"."id"
   FROM "public"."campaigns"
  WHERE ("campaigns"."organization_id" = "public"."my_org_id"()))))) WITH CHECK (("public"."is_leadership"() AND ("campaign_id" IN ( SELECT "campaigns"."id"
   FROM "public"."campaigns"
  WHERE ("campaigns"."organization_id" = "public"."my_org_id"())))));



CREATE POLICY "leadership_all_hr_document_requests" ON "public"."hr_document_requests" TO "authenticated" USING (("public"."is_leadership"() AND ("employee_id" IN ( SELECT "employees"."id"
   FROM "public"."employees"
  WHERE ("employees"."organization_id" = "public"."my_org_id"()))))) WITH CHECK (("public"."is_leadership"() AND ("employee_id" IN ( SELECT "employees"."id"
   FROM "public"."employees"
  WHERE ("employees"."organization_id" = "public"."my_org_id"())))));



CREATE POLICY "leadership_all_policies" ON "public"."policy_documents" TO "authenticated" USING ((("organization_id" = "public"."my_org_id"()) AND "public"."is_leadership"())) WITH CHECK ((("organization_id" = "public"."my_org_id"()) AND "public"."is_leadership"()));



CREATE POLICY "leadership_all_renuncias" ON "public"."resignation_packets" TO "authenticated" USING (("public"."is_leadership"() AND ("employee_id" IN ( SELECT "employees"."id"
   FROM "public"."employees"
  WHERE ("employees"."organization_id" = "public"."my_org_id"()))))) WITH CHECK (("public"."is_leadership"() AND ("employee_id" IN ( SELECT "employees"."id"
   FROM "public"."employees"
  WHERE ("employees"."organization_id" = "public"."my_org_id"())))));



CREATE POLICY "leadership_all_rescisiones" ON "public"."rescision_prueba_documents" TO "authenticated" USING (("public"."is_leadership"() AND ("employee_id" IN ( SELECT "employees"."id"
   FROM "public"."employees"
  WHERE ("employees"."organization_id" = "public"."my_org_id"()))))) WITH CHECK (("public"."is_leadership"() AND ("employee_id" IN ( SELECT "employees"."id"
   FROM "public"."employees"
  WHERE ("employees"."organization_id" = "public"."my_org_id"())))));



CREATE POLICY "leadership_all_rescisiones_desempeno" ON "public"."rescision_desempeno_documents" TO "authenticated" USING (("public"."is_leadership"() AND ("employee_id" IN ( SELECT "employees"."id"
   FROM "public"."employees"
  WHERE ("employees"."organization_id" = "public"."my_org_id"()))))) WITH CHECK (("public"."is_leadership"() AND ("employee_id" IN ( SELECT "employees"."id"
   FROM "public"."employees"
  WHERE ("employees"."organization_id" = "public"."my_org_id"())))));



CREATE POLICY "leadership_all_time_clock" ON "public"."time_clock" TO "authenticated" USING (("public"."is_leadership"() AND ("employee_id" IN ( SELECT "employees"."id"
   FROM "public"."employees"
  WHERE ("employees"."organization_id" = "public"."my_org_id"()))))) WITH CHECK (("public"."is_leadership"() AND ("employee_id" IN ( SELECT "employees"."id"
   FROM "public"."employees"
  WHERE ("employees"."organization_id" = "public"."my_org_id"())))));



CREATE POLICY "leadership_all_time_off" ON "public"."_legacy_time_off_requests" TO "authenticated" USING (("public"."is_leadership"() AND ("employee_id" IN ( SELECT "employees"."id"
   FROM "public"."employees"
  WHERE ("employees"."organization_id" = "public"."my_org_id"()))))) WITH CHECK (("public"."is_leadership"() AND ("employee_id" IN ( SELECT "employees"."id"
   FROM "public"."employees"
  WHERE ("employees"."organization_id" = "public"."my_org_id"())))));



CREATE POLICY "leadership_all_tl_nudges" ON "public"."tl_nudges" TO "authenticated" USING (("public"."is_leadership"() AND ("employee_id" IN ( SELECT "employees"."id"
   FROM "public"."employees"
  WHERE ("employees"."organization_id" = "public"."my_org_id"()))))) WITH CHECK (("public"."is_leadership"() AND ("employee_id" IN ( SELECT "employees"."id"
   FROM "public"."employees"
  WHERE ("employees"."organization_id" = "public"."my_org_id"())))));



CREATE POLICY "leadership_delete_campaign_kpi_config" ON "public"."campaign_kpi_config" FOR DELETE TO "authenticated" USING (("public"."is_leadership"() AND ("campaign_id" IN ( SELECT "campaigns"."id"
   FROM "public"."campaigns"
  WHERE ("campaigns"."organization_id" = "public"."my_org_id"())))));



CREATE POLICY "leadership_delete_campaigns" ON "public"."campaigns" FOR DELETE TO "authenticated" USING ((("organization_id" = "public"."my_org_id"()) AND "public"."is_leadership"()));



CREATE POLICY "leadership_delete_clients" ON "public"."clients" FOR DELETE TO "authenticated" USING ((("organization_id" = "public"."my_org_id"()) AND "public"."is_leadership"()));



CREATE POLICY "leadership_delete_employees" ON "public"."employees" FOR DELETE TO "authenticated" USING ((("organization_id" = "public"."my_org_id"()) AND "public"."is_leadership"()));



CREATE POLICY "leadership_delete_shift_settings" ON "public"."shift_settings" FOR DELETE TO "authenticated" USING (("public"."is_leadership"() AND ("campaign_id" IN ( SELECT "campaigns"."id"
   FROM "public"."campaigns"
  WHERE ("campaigns"."organization_id" = "public"."my_org_id"())))));



CREATE POLICY "leadership_insert_documents" ON "public"."employee_documents" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_leadership"() AND ("employee_id" IN ( SELECT "employees"."id"
   FROM "public"."employees"
  WHERE ("employees"."organization_id" = "public"."my_org_id"())))));



CREATE POLICY "leadership_insert_employees" ON "public"."employees" FOR INSERT TO "authenticated" WITH CHECK ((("organization_id" = "public"."my_org_id"()) AND "public"."is_leadership"()));



CREATE POLICY "leadership_insert_required_document_types" ON "public"."required_document_types" FOR INSERT WITH CHECK ("public"."is_leadership"());



CREATE POLICY "leadership_insert_versions" ON "public"."policy_document_versions" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_leadership"());



CREATE POLICY "leadership_read_all_profiles" ON "public"."user_profiles" FOR SELECT TO "authenticated" USING ("public"."is_leadership"());



CREATE POLICY "leadership_read_review_notifications" ON "public"."agent_review_notifications_sent" FOR SELECT TO "authenticated" USING ("public"."is_leadership"());



CREATE POLICY "leadership_select_acknowledgments" ON "public"."sensitive_data_acknowledgments" FOR SELECT TO "authenticated" USING ("public"."is_leadership"());



CREATE POLICY "leadership_select_all_acks" ON "public"."policy_acknowledgments" FOR SELECT TO "authenticated" USING (("public"."is_leadership"() AND ("employee_id" IN ( SELECT "employees"."id"
   FROM "public"."employees"
  WHERE ("employees"."organization_id" = "public"."my_org_id"())))));



CREATE POLICY "leadership_select_all_documents" ON "public"."employee_documents" FOR SELECT TO "authenticated" USING (("public"."is_leadership"() AND ("employee_id" IN ( SELECT "employees"."id"
   FROM "public"."employees"
  WHERE ("employees"."organization_id" = "public"."my_org_id"())))));



CREATE POLICY "leadership_select_compliance_notifications" ON "public"."compliance_notifications_sent" FOR SELECT TO "authenticated" USING (("public"."is_leadership"() AND ("employee_id" IN ( SELECT "employees"."id"
   FROM "public"."employees"
  WHERE ("employees"."organization_id" = "public"."my_org_id"())))));



CREATE POLICY "leadership_select_employees" ON "public"."employees" FOR SELECT TO "authenticated" USING ((("organization_id" = "public"."my_org_id"()) AND "public"."is_leadership"()));



CREATE POLICY "leadership_select_eod_logs_audit" ON "public"."eod_logs_audit" FOR SELECT TO "authenticated" USING ("public"."is_leadership"());



CREATE POLICY "leadership_update_campaign_kpi_config" ON "public"."campaign_kpi_config" FOR UPDATE TO "authenticated" USING (("public"."is_leadership"() AND ("campaign_id" IN ( SELECT "campaigns"."id"
   FROM "public"."campaigns"
  WHERE ("campaigns"."organization_id" = "public"."my_org_id"())))));



CREATE POLICY "leadership_update_campaigns" ON "public"."campaigns" FOR UPDATE TO "authenticated" USING ((("organization_id" = "public"."my_org_id"()) AND "public"."is_leadership"()));



CREATE POLICY "leadership_update_clients" ON "public"."clients" FOR UPDATE TO "authenticated" USING ((("organization_id" = "public"."my_org_id"()) AND "public"."is_leadership"()));



CREATE POLICY "leadership_update_documents" ON "public"."employee_documents" FOR UPDATE TO "authenticated" USING (("public"."is_leadership"() AND ("employee_id" IN ( SELECT "employees"."id"
   FROM "public"."employees"
  WHERE ("employees"."organization_id" = "public"."my_org_id"()))))) WITH CHECK (("public"."is_leadership"() AND ("employee_id" IN ( SELECT "employees"."id"
   FROM "public"."employees"
  WHERE ("employees"."organization_id" = "public"."my_org_id"())))));



CREATE POLICY "leadership_update_employees" ON "public"."employees" FOR UPDATE TO "authenticated" USING ((("organization_id" = "public"."my_org_id"()) AND "public"."is_leadership"()));



CREATE POLICY "leadership_update_required_document_types" ON "public"."required_document_types" FOR UPDATE USING ("public"."is_leadership"());



CREATE POLICY "leadership_update_shift_settings" ON "public"."shift_settings" FOR UPDATE TO "authenticated" USING (("public"."is_leadership"() AND ("campaign_id" IN ( SELECT "campaigns"."id"
   FROM "public"."campaigns"
  WHERE ("campaigns"."organization_id" = "public"."my_org_id"())))));



CREATE POLICY "leadership_update_versions" ON "public"."policy_document_versions" FOR UPDATE TO "authenticated" USING ("public"."is_leadership"());



CREATE POLICY "leadership_write_campaign_kpi_config" ON "public"."campaign_kpi_config" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_leadership"() AND ("campaign_id" IN ( SELECT "campaigns"."id"
   FROM "public"."campaigns"
  WHERE ("campaigns"."organization_id" = "public"."my_org_id"())))));



CREATE POLICY "leadership_write_campaigns" ON "public"."campaigns" FOR INSERT TO "authenticated" WITH CHECK ((("organization_id" = "public"."my_org_id"()) AND "public"."is_leadership"()));



CREATE POLICY "leadership_write_clients" ON "public"."clients" FOR INSERT TO "authenticated" WITH CHECK ((("organization_id" = "public"."my_org_id"()) AND "public"."is_leadership"()));



CREATE POLICY "leadership_write_shift_settings" ON "public"."shift_settings" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_leadership"() AND ("campaign_id" IN ( SELECT "campaigns"."id"
   FROM "public"."campaigns"
  WHERE ("campaigns"."organization_id" = "public"."my_org_id"())))));



CREATE POLICY "managers can manage bulletin posts" ON "public"."bulletin_posts" TO "authenticated" USING ("public"."is_leadership"()) WITH CHECK ("public"."is_leadership"());



CREATE POLICY "managers can manage questions" ON "public"."bulletin_questions" TO "authenticated" USING ("public"."is_leadership"()) WITH CHECK ("public"."is_leadership"());



CREATE POLICY "managers can view all acks" ON "public"."bulletin_acks" FOR SELECT TO "authenticated" USING ("public"."is_leadership"());



CREATE POLICY "managers can view all responses" ON "public"."bulletin_responses" FOR SELECT TO "authenticated" USING ("public"."is_leadership"());



ALTER TABLE "public"."mexican_holidays" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "mexican_holidays_write_leadership" ON "public"."mexican_holidays" USING ("public"."is_leadership"()) WITH CHECK ("public"."is_leadership"());



ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "organizations_read_own" ON "public"."organizations" FOR SELECT USING (("id" = "public"."my_org_id"()));



CREATE POLICY "owner_all_client_recurring_deductions" ON "public"."client_recurring_deductions" USING (("public"."is_owner"() AND ("organization_id" = "public"."my_org_id"())));



CREATE POLICY "owner_all_invoice_lines" ON "public"."invoice_lines" TO "authenticated" USING (("public"."is_owner"() AND ("invoice_id" IN ( SELECT "invoices"."id"
   FROM "public"."invoices"
  WHERE ("invoices"."client_id" IN ( SELECT "clients"."id"
           FROM "public"."clients"
          WHERE ("clients"."organization_id" = "public"."my_org_id"()))))))) WITH CHECK (("public"."is_owner"() AND ("invoice_id" IN ( SELECT "invoices"."id"
   FROM "public"."invoices"
  WHERE ("invoices"."client_id" IN ( SELECT "clients"."id"
           FROM "public"."clients"
          WHERE ("clients"."organization_id" = "public"."my_org_id"())))))));



CREATE POLICY "owner_all_invoices" ON "public"."invoices" TO "authenticated" USING (("public"."is_owner"() AND ("client_id" IN ( SELECT "clients"."id"
   FROM "public"."clients"
  WHERE ("clients"."organization_id" = "public"."my_org_id"()))))) WITH CHECK (("public"."is_owner"() AND ("client_id" IN ( SELECT "clients"."id"
   FROM "public"."clients"
  WHERE ("clients"."organization_id" = "public"."my_org_id"())))));



ALTER TABLE "public"."payroll_archive" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payroll_archive_select_owner" ON "public"."payroll_archive" FOR SELECT TO "authenticated" USING (("public"."is_owner"() AND ("organization_id" = "public"."my_org_id"())));



ALTER TABLE "public"."payroll_audit_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payroll_audit_log_select_owner" ON "public"."payroll_audit_log" FOR SELECT TO "authenticated" USING (("public"."is_owner"() AND ("organization_id" = "public"."my_org_id"())));



ALTER TABLE "public"."payroll_periods" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payroll_periods_admin_all" ON "public"."payroll_periods" TO "authenticated" USING (("public"."is_owner_or_admin"() AND ("organization_id" = "public"."my_org_id"()))) WITH CHECK (("public"."is_owner_or_admin"() AND ("organization_id" = "public"."my_org_id"())));



ALTER TABLE "public"."payroll_records" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payroll_records_owner_all" ON "public"."payroll_records" TO "authenticated" USING (("public"."is_owner"() AND ("organization_id" = "public"."my_org_id"()))) WITH CHECK (("public"."is_owner"() AND ("organization_id" = "public"."my_org_id"())));



ALTER TABLE "public"."payroll_validation_runs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payroll_validation_runs_select_owner" ON "public"."payroll_validation_runs" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_profiles" "up"
  WHERE (("up"."id" = "auth"."uid"()) AND ("up"."role" = 'owner'::"text")))));



ALTER TABLE "public"."payroll_weeks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payroll_weeks_owner_all" ON "public"."payroll_weeks" TO "authenticated" USING (("public"."is_owner"() AND ("organization_id" = "public"."my_org_id"()))) WITH CHECK (("public"."is_owner"() AND ("organization_id" = "public"."my_org_id"())));



ALTER TABLE "public"."policy_acknowledgments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."policy_document_versions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."policy_documents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."recruiting_candidates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "recruiting_candidates_leadership_all" ON "public"."recruiting_candidates" TO "authenticated" USING ("public"."is_leadership"()) WITH CHECK ("public"."is_leadership"());



ALTER TABLE "public"."recruiting_interviews" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "recruiting_interviews_leadership_all" ON "public"."recruiting_interviews" TO "authenticated" USING ("public"."is_leadership"()) WITH CHECK ("public"."is_leadership"());



ALTER TABLE "public"."recruiting_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "recruiting_messages_leadership_all" ON "public"."recruiting_messages" TO "authenticated" USING ("public"."is_leadership"()) WITH CHECK ("public"."is_leadership"());



ALTER TABLE "public"."recruiting_positions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "recruiting_positions_leadership_all" ON "public"."recruiting_positions" TO "authenticated" USING ("public"."is_leadership"()) WITH CHECK ("public"."is_leadership"());



ALTER TABLE "public"."required_document_types" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rescision_desempeno_documents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rescision_prueba_documents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."resignation_packets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sensitive_data_acknowledgments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "service_role_full_access" ON "public"."app_config" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."shift_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."shift_settings_audit" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."spiff_import_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ssa_select_leadership" ON "public"."shift_settings_audit" FOR SELECT TO "authenticated" USING (("public"."is_leadership"() AND (("campaign_id" IS NULL) OR (EXISTS ( SELECT 1
   FROM "public"."campaigns" "c"
  WHERE (("c"."id" = "shift_settings_audit"."campaign_id") AND ("c"."organization_id" = "public"."my_org_id"())))))));



CREATE POLICY "tca_select_leadership" ON "public"."time_clock_audit" FOR SELECT TO "authenticated" USING ((("public"."is_leadership"() AND ("organization_id" = "public"."my_org_id"())) OR ("public"."is_team_lead"() AND (EXISTS ( SELECT 1
   FROM "public"."employees" "e_target"
  WHERE (("e_target"."id" = "time_clock_audit"."employee_id") AND ("e_target"."campaign_id" IN ( SELECT "public"."my_tl_campaign_ids"() AS "my_tl_campaign_ids")) AND ("e_target"."organization_id" = "time_clock_audit"."organization_id")))))));



ALTER TABLE "public"."team_lead_campaigns" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."time_clock" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."time_clock_audit" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tl_delete_own_campaign_eod_recipients" ON "public"."campaign_eod_recipients" FOR DELETE TO "authenticated" USING (("public"."is_team_lead"() AND ("campaign_id" IN ( SELECT "public"."my_tl_campaign_ids"() AS "my_tl_campaign_ids")) AND ("campaign_id" IN ( SELECT "campaigns"."id"
   FROM "public"."campaigns"
  WHERE ("campaigns"."organization_id" = "public"."my_org_id"())))));



CREATE POLICY "tl_delete_own_campaign_shifts" ON "public"."shift_settings" FOR DELETE TO "authenticated" USING (("public"."is_team_lead"() AND ("campaign_id" IN ( SELECT "public"."my_tl_campaign_ids"() AS "my_tl_campaign_ids")) AND ("campaign_id" IN ( SELECT "campaigns"."id"
   FROM "public"."campaigns"
  WHERE ("campaigns"."organization_id" = "public"."my_org_id"())))));



CREATE POLICY "tl_insert_own_agent_coaching_notes" ON "public"."agent_coaching_notes" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_team_lead"() AND ("author_id" = "public"."my_employee_id"()) AND ("agent_id" IN ( SELECT "public"."my_team_member_ids"() AS "my_team_member_ids")) AND ("campaign_id" IN ( SELECT "campaigns"."id"
   FROM "public"."campaigns"
  WHERE ("campaigns"."organization_id" = "public"."my_org_id"())))));



CREATE POLICY "tl_insert_own_campaign_eod_recipients" ON "public"."campaign_eod_recipients" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_team_lead"() AND ("campaign_id" IN ( SELECT "public"."my_tl_campaign_ids"() AS "my_tl_campaign_ids")) AND ("campaign_id" IN ( SELECT "campaigns"."id"
   FROM "public"."campaigns"
  WHERE ("campaigns"."organization_id" = "public"."my_org_id"())))));



CREATE POLICY "tl_insert_own_campaign_eod_tl_notes" ON "public"."campaign_eod_tl_notes" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_team_lead"() AND ("campaign_id" IN ( SELECT "public"."my_tl_campaign_ids"() AS "my_tl_campaign_ids")) AND ("campaign_id" IN ( SELECT "campaigns"."id"
   FROM "public"."campaigns"
  WHERE ("campaigns"."organization_id" = "public"."my_org_id"())))));



CREATE POLICY "tl_insert_own_campaign_shifts" ON "public"."shift_settings" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_team_lead"() AND ("campaign_id" IN ( SELECT "public"."my_tl_campaign_ids"() AS "my_tl_campaign_ids")) AND ("campaign_id" IN ( SELECT "campaigns"."id"
   FROM "public"."campaigns"
  WHERE ("campaigns"."organization_id" = "public"."my_org_id"())))));



CREATE POLICY "tl_insert_own_tl_nudges" ON "public"."tl_nudges" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_team_lead"() AND ("nudged_by" = "public"."my_employee_id"()) AND ("employee_id" IN ( SELECT "public"."my_team_member_ids"() AS "my_team_member_ids")) AND ("employee_id" IN ( SELECT "employees"."id"
   FROM "public"."employees"
  WHERE ("employees"."organization_id" = "public"."my_org_id"())))));



CREATE POLICY "tl_insert_team_incidents" ON "public"."attendance_incidents" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_team_lead"() AND "public"."tl_employee_on_my_team"("employee_id") AND ("created_by" = "public"."my_employee_id"()) AND ("employee_id" IN ( SELECT "employees"."id"
   FROM "public"."employees"
  WHERE ("employees"."organization_id" = "public"."my_org_id"())))));



CREATE POLICY "tl_insert_team_requests" ON "public"."hr_document_requests" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_team_lead"() AND "public"."tl_employee_on_my_team"("employee_id") AND ("filed_by" = "public"."my_employee_id"()) AND ("status" = 'pending'::"text") AND ("fulfilled_carta_id" IS NULL) AND ("fulfilled_acta_id" IS NULL) AND ("fulfilled_renuncia_id" IS NULL) AND ("employee_id" IN ( SELECT "employees"."id"
   FROM "public"."employees"
  WHERE ("employees"."organization_id" = "public"."my_org_id"())))));



ALTER TABLE "public"."tl_nudges" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tl_select_agent_reviews" ON "public"."agent_reviews" FOR SELECT TO "authenticated" USING (("public"."is_team_lead"() AND "public"."tl_employee_on_my_team"("employee_id")));



CREATE POLICY "tl_select_own_campaign_eod_digest_log" ON "public"."eod_digest_log" FOR SELECT TO "authenticated" USING (("public"."is_team_lead"() AND ("campaign_id" IN ( SELECT "public"."my_tl_campaign_ids"() AS "my_tl_campaign_ids")) AND ("campaign_id" IN ( SELECT "campaigns"."id"
   FROM "public"."campaigns"
  WHERE ("campaigns"."organization_id" = "public"."my_org_id"())))));



CREATE POLICY "tl_select_own_campaign_eod_recipients" ON "public"."campaign_eod_recipients" FOR SELECT TO "authenticated" USING (("public"."is_team_lead"() AND ("campaign_id" IN ( SELECT "public"."my_tl_campaign_ids"() AS "my_tl_campaign_ids")) AND ("campaign_id" IN ( SELECT "campaigns"."id"
   FROM "public"."campaigns"
  WHERE ("campaigns"."organization_id" = "public"."my_org_id"())))));



CREATE POLICY "tl_select_own_campaign_eod_tl_notes" ON "public"."campaign_eod_tl_notes" FOR SELECT TO "authenticated" USING (("public"."is_team_lead"() AND ("campaign_id" IN ( SELECT "public"."my_tl_campaign_ids"() AS "my_tl_campaign_ids")) AND ("campaign_id" IN ( SELECT "campaigns"."id"
   FROM "public"."campaigns"
  WHERE ("campaigns"."organization_id" = "public"."my_org_id"())))));



CREATE POLICY "tl_select_team_actas" ON "public"."actas_administrativas" FOR SELECT TO "authenticated" USING (("public"."is_team_lead"() AND "public"."tl_employee_on_my_team"("employee_id") AND ("employee_id" IN ( SELECT "employees"."id"
   FROM "public"."employees"
  WHERE ("employees"."organization_id" = "public"."my_org_id"())))));



CREATE POLICY "tl_select_team_agent_coaching_notes" ON "public"."agent_coaching_notes" FOR SELECT TO "authenticated" USING (("public"."is_team_lead"() AND ("agent_id" IN ( SELECT "public"."my_team_member_ids"() AS "my_team_member_ids")) AND ("campaign_id" IN ( SELECT "campaigns"."id"
   FROM "public"."campaigns"
  WHERE ("campaigns"."organization_id" = "public"."my_org_id"())))));



CREATE POLICY "tl_select_team_cartas" ON "public"."cartas_compromiso" FOR SELECT TO "authenticated" USING (("public"."is_team_lead"() AND "public"."tl_employee_on_my_team"("employee_id") AND ("employee_id" IN ( SELECT "employees"."id"
   FROM "public"."employees"
  WHERE ("employees"."organization_id" = "public"."my_org_id"())))));



CREATE POLICY "tl_select_team_documents" ON "public"."employee_documents" FOR SELECT TO "authenticated" USING (("public"."is_team_lead"() AND "public"."tl_employee_on_my_team"("employee_id") AND ("employee_id" IN ( SELECT "employees"."id"
   FROM "public"."employees"
  WHERE ("employees"."organization_id" = "public"."my_org_id"())))));



CREATE POLICY "tl_select_team_employees" ON "public"."employees" FOR SELECT TO "authenticated" USING (("public"."is_team_lead"() AND (("campaign_id" IN ( SELECT "public"."my_tl_campaign_ids"() AS "my_tl_campaign_ids")) OR ("id" IN ( SELECT "public"."my_team_member_ids"() AS "my_team_member_ids")))));



CREATE POLICY "tl_select_team_eod_logs" ON "public"."eod_logs" FOR SELECT TO "authenticated" USING (("public"."is_team_lead"() AND ("employee_id" IN ( SELECT "public"."my_team_member_ids"() AS "my_team_member_ids")) AND ("employee_id" IN ( SELECT "employees"."id"
   FROM "public"."employees"
  WHERE ("employees"."organization_id" = "public"."my_org_id"())))));



CREATE POLICY "tl_select_team_eod_logs_audit" ON "public"."eod_logs_audit" FOR SELECT TO "authenticated" USING (("public"."is_team_lead"() AND ("employee_id" IN ( SELECT "public"."my_team_member_ids"() AS "my_team_member_ids"))));



CREATE POLICY "tl_select_team_incidents" ON "public"."attendance_incidents" FOR SELECT TO "authenticated" USING (("public"."is_team_lead"() AND "public"."tl_employee_on_my_team"("employee_id") AND ("employee_id" IN ( SELECT "employees"."id"
   FROM "public"."employees"
  WHERE ("employees"."organization_id" = "public"."my_org_id"())))));



CREATE POLICY "tl_select_team_renuncias" ON "public"."resignation_packets" FOR SELECT TO "authenticated" USING (("public"."is_team_lead"() AND "public"."tl_employee_on_my_team"("employee_id") AND ("employee_id" IN ( SELECT "employees"."id"
   FROM "public"."employees"
  WHERE ("employees"."organization_id" = "public"."my_org_id"())))));



CREATE POLICY "tl_select_team_requests" ON "public"."hr_document_requests" FOR SELECT TO "authenticated" USING (("public"."is_team_lead"() AND "public"."tl_employee_on_my_team"("employee_id") AND ("employee_id" IN ( SELECT "employees"."id"
   FROM "public"."employees"
  WHERE ("employees"."organization_id" = "public"."my_org_id"())))));



CREATE POLICY "tl_select_team_rescisiones" ON "public"."rescision_prueba_documents" FOR SELECT TO "authenticated" USING (("public"."is_team_lead"() AND "public"."tl_employee_on_my_team"("employee_id") AND ("employee_id" IN ( SELECT "employees"."id"
   FROM "public"."employees"
  WHERE ("employees"."organization_id" = "public"."my_org_id"())))));



CREATE POLICY "tl_select_team_rescisiones_desempeno" ON "public"."rescision_desempeno_documents" FOR SELECT TO "authenticated" USING (("public"."is_team_lead"() AND "public"."tl_employee_on_my_team"("employee_id") AND ("employee_id" IN ( SELECT "employees"."id"
   FROM "public"."employees"
  WHERE ("employees"."organization_id" = "public"."my_org_id"())))));



CREATE POLICY "tl_select_team_time_clock" ON "public"."time_clock" FOR SELECT TO "authenticated" USING (("public"."is_team_lead"() AND ("employee_id" IN ( SELECT "public"."my_team_member_ids"() AS "my_team_member_ids")) AND ("employee_id" IN ( SELECT "employees"."id"
   FROM "public"."employees"
  WHERE ("employees"."organization_id" = "public"."my_org_id"())))));



CREATE POLICY "tl_select_team_time_off" ON "public"."_legacy_time_off_requests" FOR SELECT TO "authenticated" USING (("public"."is_team_lead"() AND ("employee_id" IN ( SELECT "public"."my_team_member_ids"() AS "my_team_member_ids")) AND ("employee_id" IN ( SELECT "employees"."id"
   FROM "public"."employees"
  WHERE ("employees"."organization_id" = "public"."my_org_id"())))));



CREATE POLICY "tl_select_team_tl_nudges" ON "public"."tl_nudges" FOR SELECT TO "authenticated" USING (("public"."is_team_lead"() AND ("employee_id" IN ( SELECT "public"."my_team_member_ids"() AS "my_team_member_ids")) AND ("employee_id" IN ( SELECT "employees"."id"
   FROM "public"."employees"
  WHERE ("employees"."organization_id" = "public"."my_org_id"())))));



CREATE POLICY "tl_update_agent_reviews" ON "public"."agent_reviews" FOR UPDATE TO "authenticated" USING (("public"."is_team_lead"() AND "public"."tl_employee_on_my_team"("employee_id"))) WITH CHECK (("public"."is_team_lead"() AND "public"."tl_employee_on_my_team"("employee_id")));



CREATE POLICY "tl_update_own_agent_coaching_notes" ON "public"."agent_coaching_notes" FOR UPDATE TO "authenticated" USING (("public"."is_team_lead"() AND ("author_id" = "public"."my_employee_id"()) AND ("agent_id" IN ( SELECT "public"."my_team_member_ids"() AS "my_team_member_ids")))) WITH CHECK (("public"."is_team_lead"() AND ("author_id" = "public"."my_employee_id"()) AND ("agent_id" IN ( SELECT "public"."my_team_member_ids"() AS "my_team_member_ids"))));



CREATE POLICY "tl_update_own_campaign_eod_recipients" ON "public"."campaign_eod_recipients" FOR UPDATE TO "authenticated" USING (("public"."is_team_lead"() AND ("campaign_id" IN ( SELECT "public"."my_tl_campaign_ids"() AS "my_tl_campaign_ids")) AND ("campaign_id" IN ( SELECT "campaigns"."id"
   FROM "public"."campaigns"
  WHERE ("campaigns"."organization_id" = "public"."my_org_id"())))));



CREATE POLICY "tl_update_own_campaign_eod_tl_notes" ON "public"."campaign_eod_tl_notes" FOR UPDATE TO "authenticated" USING (("public"."is_team_lead"() AND ("campaign_id" IN ( SELECT "public"."my_tl_campaign_ids"() AS "my_tl_campaign_ids")) AND ("campaign_id" IN ( SELECT "campaigns"."id"
   FROM "public"."campaigns"
  WHERE ("campaigns"."organization_id" = "public"."my_org_id"())))));



CREATE POLICY "tl_update_own_campaign_shifts" ON "public"."shift_settings" FOR UPDATE TO "authenticated" USING (("public"."is_team_lead"() AND ("campaign_id" IN ( SELECT "public"."my_tl_campaign_ids"() AS "my_tl_campaign_ids")) AND ("campaign_id" IN ( SELECT "campaigns"."id"
   FROM "public"."campaigns"
  WHERE ("campaigns"."organization_id" = "public"."my_org_id"())))));



CREATE POLICY "tl_update_own_tl_nudges" ON "public"."tl_nudges" FOR UPDATE TO "authenticated" USING (("public"."is_team_lead"() AND ("employee_id" IN ( SELECT "public"."my_team_member_ids"() AS "my_team_member_ids")) AND ("employee_id" IN ( SELECT "employees"."id"
   FROM "public"."employees"
  WHERE ("employees"."organization_id" = "public"."my_org_id"()))))) WITH CHECK (("public"."is_team_lead"() AND ("nudged_by" = "public"."my_employee_id"()) AND ("employee_id" IN ( SELECT "public"."my_team_member_ids"() AS "my_team_member_ids"))));



CREATE POLICY "tl_update_team_eod_logs" ON "public"."eod_logs" FOR UPDATE TO "authenticated" USING (("public"."is_team_lead"() AND ("employee_id" IN ( SELECT "public"."my_team_member_ids"() AS "my_team_member_ids")) AND ("employee_id" IN ( SELECT "employees"."id"
   FROM "public"."employees"
  WHERE ("employees"."organization_id" = "public"."my_org_id"())))));



CREATE POLICY "tl_update_team_incidents" ON "public"."attendance_incidents" FOR UPDATE TO "authenticated" USING (("public"."is_team_lead"() AND "public"."tl_employee_on_my_team"("employee_id") AND ("employee_id" IN ( SELECT "employees"."id"
   FROM "public"."employees"
  WHERE ("employees"."organization_id" = "public"."my_org_id"()))))) WITH CHECK (("public"."is_team_lead"() AND "public"."tl_employee_on_my_team"("employee_id") AND ("employee_id" IN ( SELECT "employees"."id"
   FROM "public"."employees"
  WHERE ("employees"."organization_id" = "public"."my_org_id"())))));



CREATE POLICY "tl_update_team_time_clock" ON "public"."time_clock" FOR UPDATE TO "authenticated" USING (("public"."is_team_lead"() AND ("employee_id" IN ( SELECT "public"."my_team_member_ids"() AS "my_team_member_ids")) AND ("employee_id" IN ( SELECT "employees"."id"
   FROM "public"."employees"
  WHERE ("employees"."organization_id" = "public"."my_org_id"())))));



CREATE POLICY "tl_update_team_time_off" ON "public"."_legacy_time_off_requests" FOR UPDATE TO "authenticated" USING (("public"."is_team_lead"() AND ("employee_id" IN ( SELECT "public"."my_team_member_ids"() AS "my_team_member_ids")) AND ("employee_id" IN ( SELECT "employees"."id"
   FROM "public"."employees"
  WHERE ("employees"."organization_id" = "public"."my_org_id"())))));



CREATE POLICY "tlc_delete_leadership" ON "public"."team_lead_campaigns" FOR DELETE TO "authenticated" USING ("public"."is_leadership"());



CREATE POLICY "tlc_insert_leadership" ON "public"."team_lead_campaigns" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_leadership"());



CREATE POLICY "tlc_select_leadership" ON "public"."team_lead_campaigns" FOR SELECT TO "authenticated" USING ("public"."is_leadership"());



CREATE POLICY "uptraining_docs_agent_select" ON "public"."uptraining_documents" FOR SELECT USING (("employee_id" = "public"."my_employee_id"()));



CREATE POLICY "uptraining_docs_leadership_all" ON "public"."uptraining_documents" USING ("public"."is_leadership"()) WITH CHECK ("public"."is_leadership"());



CREATE POLICY "uptraining_docs_tl_insert" ON "public"."uptraining_documents" FOR INSERT WITH CHECK (("public"."is_team_lead"() AND "public"."tl_employee_on_my_team"("employee_id") AND ("uploaded_by" = "public"."my_employee_id"())));



CREATE POLICY "uptraining_docs_tl_select" ON "public"."uptraining_documents" FOR SELECT USING (("public"."is_team_lead"() AND "public"."tl_employee_on_my_team"("employee_id")));



ALTER TABLE "public"."uptraining_documents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_insert_own_acknowledgment" ON "public"."sensitive_data_acknowledgments" FOR INSERT TO "authenticated" WITH CHECK (("acknowledged_by" IN ( SELECT "up"."employee_id"
   FROM "public"."user_profiles" "up"
  WHERE ("up"."id" = "auth"."uid"()))));



ALTER TABLE "public"."user_profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_select_own_acknowledgment" ON "public"."sensitive_data_acknowledgments" FOR SELECT TO "authenticated" USING (("acknowledged_by" IN ( SELECT "up"."employee_id"
   FROM "public"."user_profiles" "up"
  WHERE ("up"."id" = "auth"."uid"()))));



CREATE POLICY "users_insert_own_profile" ON "public"."user_profiles" FOR INSERT TO "authenticated" WITH CHECK (("id" = "auth"."uid"()));



CREATE POLICY "users_read_own_profile" ON "public"."user_profiles" FOR SELECT TO "authenticated" USING (("id" = "auth"."uid"()));



ALTER TABLE "public"."vacation_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "vacation_requests_agent_insert" ON "public"."vacation_requests" FOR INSERT WITH CHECK (("employee_id" = "public"."my_employee_id"()));



CREATE POLICY "vacation_requests_agent_select" ON "public"."vacation_requests" FOR SELECT USING (("employee_id" = "public"."my_employee_id"()));



CREATE POLICY "vacation_requests_agent_update" ON "public"."vacation_requests" FOR UPDATE USING (("employee_id" = "public"."my_employee_id"()));



CREATE POLICY "vacation_requests_leadership_all" ON "public"."vacation_requests" TO "authenticated" USING (("public"."is_leadership"() AND ("employee_id" IN ( SELECT "employees"."id"
   FROM "public"."employees"
  WHERE ("employees"."organization_id" = "public"."my_org_id"()))))) WITH CHECK (("public"."is_leadership"() AND ("employee_id" IN ( SELECT "employees"."id"
   FROM "public"."employees"
  WHERE ("employees"."organization_id" = "public"."my_org_id"())))));



CREATE POLICY "vacation_requests_tl_select" ON "public"."vacation_requests" FOR SELECT TO "authenticated" USING (("public"."is_team_lead"() AND "public"."tl_employee_on_my_team"("employee_id") AND ("employee_id" IN ( SELECT "employees"."id"
   FROM "public"."employees"
  WHERE ("employees"."organization_id" = "public"."my_org_id"())))));



CREATE POLICY "vacation_requests_tl_update" ON "public"."vacation_requests" FOR UPDATE TO "authenticated" USING (("public"."is_team_lead"() AND "public"."tl_employee_on_my_team"("employee_id") AND ("employee_id" IN ( SELECT "employees"."id"
   FROM "public"."employees"
  WHERE ("employees"."organization_id" = "public"."my_org_id"())))));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";





GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";














































































































































































GRANT ALL ON FUNCTION "public"."my_org_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."my_org_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."my_org_id"() TO "service_role";



GRANT ALL ON TABLE "public"."employees" TO "anon";
GRANT ALL ON TABLE "public"."employees" TO "authenticated";
GRANT ALL ON TABLE "public"."employees" TO "service_role";



GRANT ALL ON TABLE "public"."payroll_records" TO "anon";
GRANT ALL ON TABLE "public"."payroll_records" TO "authenticated";
GRANT ALL ON TABLE "public"."payroll_records" TO "service_role";



GRANT ALL ON FUNCTION "public"."_calc_pay_components"("e" "public"."employees", "r" "public"."payroll_records") TO "anon";
GRANT ALL ON FUNCTION "public"."_calc_pay_components"("e" "public"."employees", "r" "public"."payroll_records") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_calc_pay_components"("e" "public"."employees", "r" "public"."payroll_records") TO "service_role";



REVOKE ALL ON FUNCTION "public"."_derive_inputs_for_employee_week"("p_employee_id" "uuid", "p_week_start" "date", "p_week_end" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_derive_inputs_for_employee_week"("p_employee_id" "uuid", "p_week_start" "date", "p_week_end" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."_derive_inputs_for_employee_week"("p_employee_id" "uuid", "p_week_start" "date", "p_week_end" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_derive_inputs_for_employee_week"("p_employee_id" "uuid", "p_week_start" "date", "p_week_end" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."_scheduled_days_for_shift"("p_shift_type" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_scheduled_days_for_shift"("p_shift_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."_scheduled_days_for_shift"("p_shift_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."_scheduled_days_for_shift"("p_shift_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."agent_coaching_notes_set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."agent_coaching_notes_set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."agent_coaching_notes_set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."amend_eod_log"("p_log_id" "uuid", "p_metrics" "jsonb", "p_notes" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."amend_eod_log"("p_log_id" "uuid", "p_metrics" "jsonb", "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."amend_eod_log"("p_log_id" "uuid", "p_metrics" "jsonb", "p_notes" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."app_config_value"("p_key" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."app_config_value"("p_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."app_config_value"("p_key" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."assign_employee_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."assign_employee_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."assign_employee_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."auto_clockout_overdue"() TO "service_role";



GRANT ALL ON FUNCTION "public"."campaigns_digest_fire_times"() TO "anon";
GRANT ALL ON FUNCTION "public"."campaigns_digest_fire_times"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."campaigns_digest_fire_times"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cascade_campaign_tl_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."cascade_campaign_tl_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cascade_campaign_tl_change"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."change_employee_role"("p_employee_id" "uuid", "p_new_title" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."change_employee_role"("p_employee_id" "uuid", "p_new_title" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."change_employee_role"("p_employee_id" "uuid", "p_new_title" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."change_employee_role"("p_employee_id" "uuid", "p_new_title" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_commission_flag"("p_employee_id" "uuid", "p_amount" numeric, "p_exclude_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."check_commission_flag"("p_employee_id" "uuid", "p_amount" numeric, "p_exclude_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_commission_flag"("p_employee_id" "uuid", "p_amount" numeric, "p_exclude_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."check_rehire"("p_curp" "text", "p_full_name" "text", "p_date_of_birth" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_rehire"("p_curp" "text", "p_full_name" "text", "p_date_of_birth" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_rehire"("p_curp" "text", "p_full_name" "text", "p_date_of_birth" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."clear_compliance_dedupe_on_grace_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."clear_compliance_dedupe_on_grace_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."clear_compliance_dedupe_on_grace_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."clear_compliance_dedupe_on_rerejection"() TO "anon";
GRANT ALL ON FUNCTION "public"."clear_compliance_dedupe_on_rerejection"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."clear_compliance_dedupe_on_rerejection"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."complete_agent_review"("p_review_id" "uuid", "p_attendance_score" smallint, "p_kpi_score" smallint, "p_attitude_score" smallint, "p_notes" "text", "p_decision" "public"."review_decision", "p_decision_reason" "text", "p_extension_days" smallint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."complete_agent_review"("p_review_id" "uuid", "p_attendance_score" smallint, "p_kpi_score" smallint, "p_attitude_score" smallint, "p_notes" "text", "p_decision" "public"."review_decision", "p_decision_reason" "text", "p_extension_days" smallint) TO "anon";
GRANT ALL ON FUNCTION "public"."complete_agent_review"("p_review_id" "uuid", "p_attendance_score" smallint, "p_kpi_score" smallint, "p_attitude_score" smallint, "p_notes" "text", "p_decision" "public"."review_decision", "p_decision_reason" "text", "p_extension_days" smallint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."complete_agent_review"("p_review_id" "uuid", "p_attendance_score" smallint, "p_kpi_score" smallint, "p_attitude_score" smallint, "p_notes" "text", "p_decision" "public"."review_decision", "p_decision_reason" "text", "p_extension_days" smallint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."confirm_review_termination"("p_review_id" "uuid", "p_confirm" boolean, "p_hr_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."confirm_review_termination"("p_review_id" "uuid", "p_confirm" boolean, "p_hr_notes" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."confirm_review_termination"("p_review_id" "uuid", "p_confirm" boolean, "p_hr_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."confirm_review_termination"("p_review_id" "uuid", "p_confirm" boolean, "p_hr_notes" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."detect_holiday_no_shows"("p_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."detect_holiday_no_shows"("p_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."detect_holiday_no_shows"("p_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."employees_without_login"("p_campaign_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."employees_without_login"("p_campaign_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."employees_without_login"("p_campaign_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_clock_in_compliance"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_clock_in_compliance"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_clock_in_compliance"() TO "service_role";



GRANT ALL ON FUNCTION "public"."eod_before_cutoff"("p_campaign_id" "uuid", "p_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."eod_before_cutoff"("p_campaign_id" "uuid", "p_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."eod_before_cutoff"("p_campaign_id" "uuid", "p_date" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."extend_agent_review"("p_employee_id" "uuid", "p_extra_days" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."extend_agent_review"("p_employee_id" "uuid", "p_extra_days" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."extend_agent_review"("p_employee_id" "uuid", "p_extra_days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."extend_agent_review"("p_employee_id" "uuid", "p_extra_days" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."find_pending_escalation_emails"("p_send_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."find_pending_escalation_emails"("p_send_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."find_pending_escalation_emails"("p_send_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."find_pending_escalation_emails"("p_send_date" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."find_pending_tl_review_emails"("p_send_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."find_pending_tl_review_emails"("p_send_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."find_pending_tl_review_emails"("p_send_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."find_pending_tl_review_emails"("p_send_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_weekly_invoices"("p_monday" "date", "p_sunday" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."generate_weekly_invoices"("p_monday" "date", "p_sunday" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_weekly_invoices"("p_monday" "date", "p_sunday" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_campaign_holiday_capacities"("p_campaign_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_campaign_holiday_capacities"("p_campaign_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_campaign_holiday_capacities"("p_campaign_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_client_holiday_summary"("p_campaign_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_client_holiday_summary"("p_campaign_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_client_holiday_summary"("p_campaign_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_vacation_balance"("p_employee_id" "uuid", "p_year" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_vacation_balance"("p_employee_id" "uuid", "p_year" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_vacation_balance"("p_employee_id" "uuid", "p_year" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."guard_user_profile_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."guard_user_profile_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."guard_user_profile_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_auth_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_auth_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_auth_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."hr_create_finalization_draft"("p_request_id" "uuid", "p_created_by" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."hr_create_finalization_draft"("p_request_id" "uuid", "p_created_by" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hr_create_finalization_draft"("p_request_id" "uuid", "p_created_by" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."hr_mark_finalization_signed"("p_finalization_id" "uuid", "p_type" "text", "p_signed_scan_path" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."hr_mark_finalization_signed"("p_finalization_id" "uuid", "p_type" "text", "p_signed_scan_path" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hr_mark_finalization_signed"("p_finalization_id" "uuid", "p_type" "text", "p_signed_scan_path" "text") TO "service_role";



GRANT ALL ON TABLE "public"."policy_document_versions" TO "anon";
GRANT ALL ON TABLE "public"."policy_document_versions" TO "authenticated";
GRANT ALL ON TABLE "public"."policy_document_versions" TO "service_role";



GRANT ALL ON FUNCTION "public"."insert_policy_version"("p_policy_id" "uuid", "p_file_path" "text", "p_file_name" "text", "p_mime_type" "text", "p_file_size_bytes" bigint, "p_uploaded_by" "uuid", "p_change_notes" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."insert_policy_version"("p_policy_id" "uuid", "p_file_path" "text", "p_file_name" "text", "p_mime_type" "text", "p_file_size_bytes" bigint, "p_uploaded_by" "uuid", "p_change_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."insert_policy_version"("p_policy_id" "uuid", "p_file_path" "text", "p_file_name" "text", "p_mime_type" "text", "p_file_size_bytes" bigint, "p_uploaded_by" "uuid", "p_change_notes" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_client"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_client"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_client"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_leadership"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_leadership"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_leadership"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_owner"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_owner"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_owner"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_owner"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_owner_or_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_owner_or_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_owner_or_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_team_lead"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_team_lead"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_team_lead"() TO "service_role";



GRANT ALL ON FUNCTION "public"."log_employment_status_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_employment_status_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_employment_status_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."log_shift_settings_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_shift_settings_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_shift_settings_change"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."mark_review_notification_sent"("p_review_id" "uuid", "p_notification_type" "public"."review_notification_type", "p_recipient_employee_id" "uuid", "p_recipient_email" "text", "p_send_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_review_notification_sent"("p_review_id" "uuid", "p_notification_type" "public"."review_notification_type", "p_recipient_employee_id" "uuid", "p_recipient_email" "text", "p_send_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."mark_review_notification_sent"("p_review_id" "uuid", "p_notification_type" "public"."review_notification_type", "p_recipient_employee_id" "uuid", "p_recipient_email" "text", "p_send_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_review_notification_sent"("p_review_id" "uuid", "p_notification_type" "public"."review_notification_type", "p_recipient_employee_id" "uuid", "p_recipient_email" "text", "p_send_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."my_client_campaign_ids"() TO "anon";
GRANT ALL ON FUNCTION "public"."my_client_campaign_ids"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."my_client_campaign_ids"() TO "service_role";



GRANT ALL ON FUNCTION "public"."my_client_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."my_client_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."my_client_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."my_employee_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."my_employee_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."my_employee_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."my_manager_info"() TO "anon";
GRANT ALL ON FUNCTION "public"."my_manager_info"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."my_manager_info"() TO "service_role";



GRANT ALL ON FUNCTION "public"."my_team_member_ids"() TO "anon";
GRANT ALL ON FUNCTION "public"."my_team_member_ids"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."my_team_member_ids"() TO "service_role";



GRANT ALL ON FUNCTION "public"."my_tl_campaign_ids"() TO "anon";
GRANT ALL ON FUNCTION "public"."my_tl_campaign_ids"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."my_tl_campaign_ids"() TO "service_role";



GRANT ALL ON FUNCTION "public"."next_invoice_number"("p_client_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."next_invoice_number"("p_client_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."next_invoice_number"("p_client_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."pay_calc_record"("p_record_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."pay_calc_record"("p_record_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pay_calc_record"("p_record_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pay_derive_week"("p_week_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pay_derive_week"("p_week_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."pay_derive_week"("p_week_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pay_derive_week"("p_week_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pay_redrive_week"("p_week_id" "uuid", "p_confirm" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pay_redrive_week"("p_week_id" "uuid", "p_confirm" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."pay_redrive_week"("p_week_id" "uuid", "p_confirm" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."pay_redrive_week"("p_week_id" "uuid", "p_confirm" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."pay_unlock_period"("p_period_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pay_unlock_period"("p_period_id" "uuid", "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."pay_unlock_period"("p_period_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pay_unlock_period"("p_period_id" "uuid", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."pay_validate_archive_all"("p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pay_validate_archive_all"("p_notes" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."pay_validate_archive_all"("p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pay_validate_archive_all"("p_notes" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."payroll_audit_log_immutable"() TO "anon";
GRANT ALL ON FUNCTION "public"."payroll_audit_log_immutable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."payroll_audit_log_immutable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."payroll_records_paid_lock"() TO "anon";
GRANT ALL ON FUNCTION "public"."payroll_records_paid_lock"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."payroll_records_paid_lock"() TO "service_role";



GRANT ALL ON FUNCTION "public"."payroll_records_recalc_trigger_fn"() TO "anon";
GRANT ALL ON FUNCTION "public"."payroll_records_recalc_trigger_fn"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."payroll_records_recalc_trigger_fn"() TO "service_role";



GRANT ALL ON FUNCTION "public"."payroll_records_set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."payroll_records_set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."payroll_records_set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."recruiting_set_stage_changed_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."recruiting_set_stage_changed_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."recruiting_set_stage_changed_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."recruiting_set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."recruiting_set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."recruiting_set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."request_holiday_off"("p_campaign_id" "uuid", "p_holiday_date" "date", "p_holiday_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."request_holiday_off"("p_campaign_id" "uuid", "p_holiday_date" "date", "p_holiday_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."request_holiday_off"("p_campaign_id" "uuid", "p_holiday_date" "date", "p_holiday_name" "text") TO "service_role";



GRANT ALL ON TABLE "public"."vacation_requests" TO "anon";
GRANT ALL ON TABLE "public"."vacation_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."vacation_requests" TO "service_role";



GRANT ALL ON FUNCTION "public"."request_vacation_off"("p_employee_id" "uuid", "p_campaign_id" "uuid", "p_start_date" "date", "p_end_date" "date", "p_notes" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."request_vacation_off"("p_employee_id" "uuid", "p_campaign_id" "uuid", "p_start_date" "date", "p_end_date" "date", "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."request_vacation_off"("p_employee_id" "uuid", "p_campaign_id" "uuid", "p_start_date" "date", "p_end_date" "date", "p_notes" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."request_vacation_off"("p_employee_id" "uuid", "p_campaign_id" "uuid", "p_start_date" "date", "p_end_date" "date", "p_notes" "text", "p_request_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."request_vacation_off"("p_employee_id" "uuid", "p_campaign_id" "uuid", "p_start_date" "date", "p_end_date" "date", "p_notes" "text", "p_request_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."request_vacation_off"("p_employee_id" "uuid", "p_campaign_id" "uuid", "p_start_date" "date", "p_end_date" "date", "p_notes" "text", "p_request_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."sda_fill_defaults"() TO "anon";
GRANT ALL ON FUNCTION "public"."sda_fill_defaults"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sda_fill_defaults"() TO "service_role";



GRANT ALL ON FUNCTION "public"."seed_agent_reviews"() TO "anon";
GRANT ALL ON FUNCTION "public"."seed_agent_reviews"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."seed_agent_reviews"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_bulletin_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_bulletin_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_bulletin_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_employee_organization_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_employee_organization_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_employee_organization_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_payroll_period_org"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_payroll_period_org"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_payroll_period_org"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_employee_is_active"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_employee_is_active"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_employee_is_active"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_reports_to_from_campaign"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_reports_to_from_campaign"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_reports_to_from_campaign"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_user_profile_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_user_profile_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_user_profile_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."tg_time_clock_set_lateness"() TO "anon";
GRANT ALL ON FUNCTION "public"."tg_time_clock_set_lateness"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."tg_time_clock_set_lateness"() TO "service_role";



GRANT ALL ON FUNCTION "public"."tl_employee_on_my_team"("p_employee_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."tl_employee_on_my_team"("p_employee_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."tl_employee_on_my_team"("p_employee_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_employees_derive_pay_rates"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_employees_derive_pay_rates"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_employees_derive_pay_rates"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_payroll_archive_readonly"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_payroll_archive_readonly"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_payroll_archive_readonly"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_payroll_records_recalc_fn"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_payroll_records_recalc_fn"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_payroll_records_recalc_fn"() TO "service_role";



GRANT ALL ON FUNCTION "public"."unaccent"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."unaccent"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."unaccent"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unaccent"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."unaccent"("regdictionary", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."unaccent"("regdictionary", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."unaccent"("regdictionary", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unaccent"("regdictionary", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."unaccent_init"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."unaccent_init"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."unaccent_init"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unaccent_init"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."unaccent_lexize"("internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."unaccent_lexize"("internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."unaccent_lexize"("internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unaccent_lexize"("internal", "internal", "internal", "internal") TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_employee_personal_info"("p_employee_uuid" "uuid", "p_work_name" "text", "p_personal_email" "text", "p_phone" "text", "p_address" "text", "p_emergency_contact" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_employee_personal_info"("p_employee_uuid" "uuid", "p_work_name" "text", "p_personal_email" "text", "p_phone" "text", "p_address" "text", "p_emergency_contact" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_employee_personal_info"("p_employee_uuid" "uuid", "p_work_name" "text", "p_personal_email" "text", "p_phone" "text", "p_address" "text", "p_emergency_contact" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_my_goal"("p_personal_goal" "text", "p_goal_visible_to_tl" boolean, "p_dismiss" boolean, "p_clear_goal" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_my_goal"("p_personal_goal" "text", "p_goal_visible_to_tl" boolean, "p_dismiss" boolean, "p_clear_goal" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."update_my_goal"("p_personal_goal" "text", "p_goal_visible_to_tl" boolean, "p_dismiss" boolean, "p_clear_goal" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_my_goal"("p_personal_goal" "text", "p_goal_visible_to_tl" boolean, "p_dismiss" boolean, "p_clear_goal" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."weekly_invoice_preview"("p_monday" "date", "p_sunday" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."weekly_invoice_preview"("p_monday" "date", "p_sunday" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."weekly_invoice_preview"("p_monday" "date", "p_sunday" "date") TO "service_role";
























GRANT ALL ON TABLE "public"."_legacy_time_off_requests" TO "anon";
GRANT ALL ON TABLE "public"."_legacy_time_off_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."_legacy_time_off_requests" TO "service_role";



GRANT ALL ON TABLE "public"."actas_administrativas" TO "anon";
GRANT ALL ON TABLE "public"."actas_administrativas" TO "authenticated";
GRANT ALL ON TABLE "public"."actas_administrativas" TO "service_role";



GRANT ALL ON TABLE "public"."agent_coaching_notes" TO "anon";
GRANT ALL ON TABLE "public"."agent_coaching_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_coaching_notes" TO "service_role";



GRANT ALL ON TABLE "public"."agent_review_notifications_sent" TO "anon";
GRANT ALL ON TABLE "public"."agent_review_notifications_sent" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_review_notifications_sent" TO "service_role";



GRANT ALL ON TABLE "public"."agent_reviews" TO "anon";
GRANT ALL ON TABLE "public"."agent_reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_reviews" TO "service_role";



GRANT ALL ON TABLE "public"."app_config" TO "anon";
GRANT ALL ON TABLE "public"."app_config" TO "authenticated";
GRANT ALL ON TABLE "public"."app_config" TO "service_role";



GRANT ALL ON TABLE "public"."attendance_incidents" TO "anon";
GRANT ALL ON TABLE "public"."attendance_incidents" TO "authenticated";
GRANT ALL ON TABLE "public"."attendance_incidents" TO "service_role";



GRANT ALL ON TABLE "public"."bulletin_acks" TO "anon";
GRANT ALL ON TABLE "public"."bulletin_acks" TO "authenticated";
GRANT ALL ON TABLE "public"."bulletin_acks" TO "service_role";



GRANT ALL ON TABLE "public"."bulletin_posts" TO "anon";
GRANT ALL ON TABLE "public"."bulletin_posts" TO "authenticated";
GRANT ALL ON TABLE "public"."bulletin_posts" TO "service_role";



GRANT ALL ON TABLE "public"."bulletin_questions" TO "anon";
GRANT ALL ON TABLE "public"."bulletin_questions" TO "authenticated";
GRANT ALL ON TABLE "public"."bulletin_questions" TO "service_role";



GRANT ALL ON TABLE "public"."bulletin_responses" TO "anon";
GRANT ALL ON TABLE "public"."bulletin_responses" TO "authenticated";
GRANT ALL ON TABLE "public"."bulletin_responses" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_eod_recipients" TO "anon";
GRANT ALL ON TABLE "public"."campaign_eod_recipients" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_eod_recipients" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_eod_tl_notes" TO "anon";
GRANT ALL ON TABLE "public"."campaign_eod_tl_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_eod_tl_notes" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_kpi_config" TO "anon";
GRANT ALL ON TABLE "public"."campaign_kpi_config" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_kpi_config" TO "service_role";



GRANT ALL ON TABLE "public"."campaigns" TO "anon";
GRANT ALL ON TABLE "public"."campaigns" TO "authenticated";
GRANT ALL ON TABLE "public"."campaigns" TO "service_role";



GRANT ALL ON TABLE "public"."cartas_compromiso" TO "anon";
GRANT ALL ON TABLE "public"."cartas_compromiso" TO "authenticated";
GRANT ALL ON TABLE "public"."cartas_compromiso" TO "service_role";



GRANT ALL ON TABLE "public"."client_holidays" TO "anon";
GRANT ALL ON TABLE "public"."client_holidays" TO "authenticated";
GRANT ALL ON TABLE "public"."client_holidays" TO "service_role";



GRANT ALL ON TABLE "public"."client_recurring_deductions" TO "anon";
GRANT ALL ON TABLE "public"."client_recurring_deductions" TO "authenticated";
GRANT ALL ON TABLE "public"."client_recurring_deductions" TO "service_role";



GRANT ALL ON TABLE "public"."clients" TO "anon";
GRANT ALL ON TABLE "public"."clients" TO "authenticated";
GRANT ALL ON TABLE "public"."clients" TO "service_role";



GRANT ALL ON TABLE "public"."company_holidays" TO "anon";
GRANT ALL ON TABLE "public"."company_holidays" TO "authenticated";
GRANT ALL ON TABLE "public"."company_holidays" TO "service_role";



GRANT ALL ON TABLE "public"."compliance_notifications_sent" TO "anon";
GRANT ALL ON TABLE "public"."compliance_notifications_sent" TO "authenticated";
GRANT ALL ON TABLE "public"."compliance_notifications_sent" TO "service_role";



GRANT ALL ON TABLE "public"."departments" TO "anon";
GRANT ALL ON TABLE "public"."departments" TO "authenticated";
GRANT ALL ON TABLE "public"."departments" TO "service_role";



GRANT ALL ON TABLE "public"."employee_campaign_assignments" TO "anon";
GRANT ALL ON TABLE "public"."employee_campaign_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."employee_campaign_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."employee_documents" TO "anon";
GRANT ALL ON TABLE "public"."employee_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."employee_documents" TO "service_role";



GRANT ALL ON SEQUENCE "public"."employee_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."employee_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."employee_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."employees_client_view" TO "anon";
GRANT ALL ON TABLE "public"."employees_client_view" TO "authenticated";
GRANT ALL ON TABLE "public"."employees_client_view" TO "service_role";



GRANT ALL ON TABLE "public"."employees_no_pay" TO "anon";
GRANT ALL ON TABLE "public"."employees_no_pay" TO "authenticated";
GRANT ALL ON TABLE "public"."employees_no_pay" TO "service_role";



GRANT ALL ON TABLE "public"."employment_history" TO "anon";
GRANT ALL ON TABLE "public"."employment_history" TO "authenticated";
GRANT ALL ON TABLE "public"."employment_history" TO "service_role";



GRANT ALL ON TABLE "public"."eod_digest_log" TO "anon";
GRANT ALL ON TABLE "public"."eod_digest_log" TO "authenticated";
GRANT ALL ON TABLE "public"."eod_digest_log" TO "service_role";



GRANT ALL ON TABLE "public"."eod_logs" TO "anon";
GRANT ALL ON TABLE "public"."eod_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."eod_logs" TO "service_role";



GRANT ALL ON TABLE "public"."eod_logs_audit" TO "anon";
GRANT ALL ON TABLE "public"."eod_logs_audit" TO "authenticated";
GRANT ALL ON TABLE "public"."eod_logs_audit" TO "service_role";



GRANT ALL ON TABLE "public"."eod_logs_client_view" TO "anon";
GRANT ALL ON TABLE "public"."eod_logs_client_view" TO "authenticated";
GRANT ALL ON TABLE "public"."eod_logs_client_view" TO "service_role";



GRANT ALL ON TABLE "public"."holiday_notification_sent" TO "anon";
GRANT ALL ON TABLE "public"."holiday_notification_sent" TO "authenticated";
GRANT ALL ON TABLE "public"."holiday_notification_sent" TO "service_role";



GRANT ALL ON TABLE "public"."holiday_requests" TO "anon";
GRANT ALL ON TABLE "public"."holiday_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."holiday_requests" TO "service_role";



GRANT ALL ON TABLE "public"."hr_document_requests" TO "anon";
GRANT ALL ON TABLE "public"."hr_document_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."hr_document_requests" TO "service_role";



GRANT ALL ON TABLE "public"."invoice_lines" TO "anon";
GRANT ALL ON TABLE "public"."invoice_lines" TO "authenticated";
GRANT ALL ON TABLE "public"."invoice_lines" TO "service_role";



GRANT ALL ON TABLE "public"."invoices" TO "anon";
GRANT ALL ON TABLE "public"."invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."invoices" TO "service_role";



GRANT ALL ON TABLE "public"."mexican_holidays" TO "anon";
GRANT ALL ON TABLE "public"."mexican_holidays" TO "authenticated";
GRANT ALL ON TABLE "public"."mexican_holidays" TO "service_role";



GRANT ALL ON TABLE "public"."organizations" TO "anon";
GRANT ALL ON TABLE "public"."organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."organizations" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."payroll_archive" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."payroll_archive" TO "authenticated";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."payroll_archive" TO "service_role";



GRANT ALL ON TABLE "public"."payroll_audit_log" TO "anon";
GRANT ALL ON TABLE "public"."payroll_audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."payroll_audit_log" TO "service_role";



GRANT ALL ON TABLE "public"."payroll_periods" TO "anon";
GRANT ALL ON TABLE "public"."payroll_periods" TO "authenticated";
GRANT ALL ON TABLE "public"."payroll_periods" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."payroll_validation_runs" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."payroll_validation_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."payroll_validation_runs" TO "service_role";



GRANT ALL ON TABLE "public"."payroll_weeks" TO "anon";
GRANT ALL ON TABLE "public"."payroll_weeks" TO "authenticated";
GRANT ALL ON TABLE "public"."payroll_weeks" TO "service_role";



GRANT ALL ON TABLE "public"."policy_acknowledgments" TO "anon";
GRANT ALL ON TABLE "public"."policy_acknowledgments" TO "authenticated";
GRANT ALL ON TABLE "public"."policy_acknowledgments" TO "service_role";



GRANT ALL ON TABLE "public"."policy_documents" TO "anon";
GRANT ALL ON TABLE "public"."policy_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."policy_documents" TO "service_role";



GRANT ALL ON TABLE "public"."recruiting_candidates" TO "anon";
GRANT ALL ON TABLE "public"."recruiting_candidates" TO "authenticated";
GRANT ALL ON TABLE "public"."recruiting_candidates" TO "service_role";



GRANT ALL ON TABLE "public"."recruiting_interviews" TO "anon";
GRANT ALL ON TABLE "public"."recruiting_interviews" TO "authenticated";
GRANT ALL ON TABLE "public"."recruiting_interviews" TO "service_role";



GRANT ALL ON TABLE "public"."recruiting_messages" TO "anon";
GRANT ALL ON TABLE "public"."recruiting_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."recruiting_messages" TO "service_role";



GRANT ALL ON TABLE "public"."recruiting_positions" TO "anon";
GRANT ALL ON TABLE "public"."recruiting_positions" TO "authenticated";
GRANT ALL ON TABLE "public"."recruiting_positions" TO "service_role";



GRANT ALL ON TABLE "public"."required_document_types" TO "anon";
GRANT ALL ON TABLE "public"."required_document_types" TO "authenticated";
GRANT ALL ON TABLE "public"."required_document_types" TO "service_role";



GRANT ALL ON TABLE "public"."rescision_desempeno_documents" TO "anon";
GRANT ALL ON TABLE "public"."rescision_desempeno_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."rescision_desempeno_documents" TO "service_role";



GRANT ALL ON TABLE "public"."rescision_prueba_documents" TO "anon";
GRANT ALL ON TABLE "public"."rescision_prueba_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."rescision_prueba_documents" TO "service_role";



GRANT ALL ON TABLE "public"."resignation_packets" TO "anon";
GRANT ALL ON TABLE "public"."resignation_packets" TO "authenticated";
GRANT ALL ON TABLE "public"."resignation_packets" TO "service_role";



GRANT ALL ON TABLE "public"."sensitive_data_acknowledgments" TO "anon";
GRANT ALL ON TABLE "public"."sensitive_data_acknowledgments" TO "authenticated";
GRANT ALL ON TABLE "public"."sensitive_data_acknowledgments" TO "service_role";



GRANT ALL ON TABLE "public"."shift_settings" TO "anon";
GRANT ALL ON TABLE "public"."shift_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."shift_settings" TO "service_role";



GRANT ALL ON TABLE "public"."shift_settings_audit" TO "anon";
GRANT ALL ON TABLE "public"."shift_settings_audit" TO "authenticated";
GRANT ALL ON TABLE "public"."shift_settings_audit" TO "service_role";



GRANT ALL ON TABLE "public"."spiff_import_log" TO "anon";
GRANT ALL ON TABLE "public"."spiff_import_log" TO "authenticated";
GRANT ALL ON TABLE "public"."spiff_import_log" TO "service_role";



GRANT ALL ON TABLE "public"."team_lead_campaigns" TO "anon";
GRANT ALL ON TABLE "public"."team_lead_campaigns" TO "authenticated";
GRANT ALL ON TABLE "public"."team_lead_campaigns" TO "service_role";



GRANT ALL ON TABLE "public"."time_clock" TO "anon";
GRANT ALL ON TABLE "public"."time_clock" TO "authenticated";
GRANT ALL ON TABLE "public"."time_clock" TO "service_role";



GRANT ALL ON TABLE "public"."time_clock_audit" TO "anon";
GRANT ALL ON TABLE "public"."time_clock_audit" TO "authenticated";
GRANT ALL ON TABLE "public"."time_clock_audit" TO "service_role";



GRANT ALL ON TABLE "public"."tl_nudges" TO "anon";
GRANT ALL ON TABLE "public"."tl_nudges" TO "authenticated";
GRANT ALL ON TABLE "public"."tl_nudges" TO "service_role";



GRANT ALL ON TABLE "public"."uptraining_documents" TO "anon";
GRANT ALL ON TABLE "public"."uptraining_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."uptraining_documents" TO "service_role";



GRANT ALL ON TABLE "public"."user_profiles" TO "anon";
GRANT ALL ON TABLE "public"."user_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."v_latest_validation_run" TO "anon";
GRANT ALL ON TABLE "public"."v_latest_validation_run" TO "authenticated";
GRANT ALL ON TABLE "public"."v_latest_validation_run" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
































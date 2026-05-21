-- Migration: 20260521000002_bulletin_recognition_employee.sql
-- Phase 2: Employee of the Month — add recognized_employee_id to bulletin_posts
-- Approved by D 2026-05-21.
ALTER TABLE public.bulletin_posts
  ADD COLUMN IF NOT EXISTS recognized_employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL;

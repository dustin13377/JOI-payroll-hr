CREATE TABLE IF NOT EXISTS public.spiff_import_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signature text NOT NULL UNIQUE,
  invoice_line_id uuid NOT NULL REFERENCES public.invoice_lines(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount <> 0),
  source text NOT NULL DEFAULT 'sheet_import',
  raw_row jsonb,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_spiff_import_log_line ON public.spiff_import_log (invoice_line_id);
CREATE INDEX IF NOT EXISTS idx_spiff_import_log_invoice ON public.spiff_import_log (invoice_id);
CREATE INDEX IF NOT EXISTS idx_spiff_import_log_applied_at ON public.spiff_import_log (applied_at DESC);

ALTER TABLE public.spiff_import_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leadership read spiff_import_log"
  ON public.spiff_import_log
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND up.role IN ('owner', 'admin', 'manager')
    )
  );

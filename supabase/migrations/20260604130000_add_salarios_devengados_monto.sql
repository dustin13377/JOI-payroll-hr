-- Add "Salarios Devengados de Días" (salary owed for days already worked in the
-- final period) to the finiquito calculation. Manual amount HR enters; folds
-- into the finiquito total. Applies to the three docs that carry a finiquito.

alter table public.resignation_packets
  add column if not exists salarios_devengados_monto numeric;

alter table public.rescision_prueba_documents
  add column if not exists salarios_devengados_monto numeric;

alter table public.rescision_desempeno_documents
  add column if not exists salarios_devengados_monto numeric;

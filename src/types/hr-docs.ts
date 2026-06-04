// B2/B3 domain types — cartas de compromiso + actas administrativas
// Hand-curated shapes for UI/hook use. Snake_case in DB → camelCase here.

export type HrDocumentRequestType = 'carta' | 'acta' | 'renuncia' | 'rescision_prueba' | 'rescision_desempeno';

export type HrDocumentRequestStatus =
  | 'pending'
  | 'in_progress'
  | 'fulfilled'
  | 'canceled'
  | 'downgraded';

export interface HrDocumentRequest {
  id: string;
  employeeId: string;
  requestType: HrDocumentRequestType;
  status: HrDocumentRequestStatus;
  filedBy: string;
  filedAt: string;
  incidentDate: string;
  tlNarrative: string;
  reason: string | null;
  fulfilledCartaId: string | null;
  fulfilledActaId: string | null;
  fulfilledRenunciaId: string | null;
  fulfilledRescisionId: string | null;
  fulfilledRescisionDesempenoId: string | null;
  canceledReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CartaKpiRow {
  area: string;
  indicador: string;
  meta: string;
}

export interface CartaCompromiso {
  id: string;
  employeeId: string;
  requestId: string | null;
  docRef: string | null;
  incidentDate: string;
  narrative: string | null;
  kpiTable: CartaKpiRow[];
  trabajadorNameSnapshot: string | null;
  puestoSnapshot: string | null;
  horarioSnapshot: string | null;
  supervisorNameSnapshot: string | null;
  companyLegalNameSnapshot: string | null;
  companyLegalAddressSnapshot: string | null;
  incidentDateLongSnapshot: string | null;
  pdfPath: string | null;
  signedAt: string | null;
  signedScanPath: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ActaWitness {
  name: string;
  role: string;
}

// ── Rescisión de Periodo de Prueba ──────────────────────────────────

export interface RescisionKpiRow {
  kpi: string;       // Métrica / KPI (e.g. "Llamadas diarias")
  required: string;  // Requerido (e.g. "350 llamadas")
  recorded: string;  // Registrado — what the agent actually did
  met: string;       // Cumplimiento — "Sí" / "No" / "Parcial" / blank
  daysNotMet?: string; // Días sin cumplir — shown/used only when met === "No"
}

export interface RescisionPruebaDocument {
  id: string;
  employeeId: string;
  requestId: string | null;
  docRef: string | null;
  trabajadorNameSnapshot: string | null;
  puestoSnapshot: string | null;
  horarioSnapshot: string | null;
  supervisorNameSnapshot: string | null;
  companyLegalNameSnapshot: string | null;
  companyLegalAddressSnapshot: string | null;
  incidentDateLongSnapshot: string | null;
  hireDateSnapshot: string | null;
  contractSigningDate: string | null;
  terminationEffectiveDate: string;
  kpiTable: RescisionKpiRow[];
  salarioDiarioSnapshot: number | null;
  aguinaldoMonto: number | null;
  vacacionesMonto: number | null;
  primaVacacionalMonto: number | null;
  totalMonto: number | null;
  totalEnLetras: string | null;
  curpSnapshot: string | null;
  rfcSnapshot: string | null;
  narrative: string | null;
  pdfPath: string | null;
  signedAt: string | null;
  signedScanPath: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ── Rescisión por Bajo Desempeño (Art. 47 Frac. XI) ─────────────────
// Same row shape as the probation rescisión; different legal grounds.
export type RescisionDesempenoDocument = RescisionPruebaDocument;

export interface ActaAdministrativa {
  id: string;
  employeeId: string;
  requestId: string | null;
  docRef: string | null;
  incidentDate: string;
  narrative: string | null;
  witnesses: ActaWitness[];
  reincidenciaPriorCartaId: string | null;
  trabajadorNameSnapshot: string | null;
  puestoSnapshot: string | null;
  horarioSnapshot: string | null;
  supervisorNameSnapshot: string | null;
  companyLegalNameSnapshot: string | null;
  companyLegalAddressSnapshot: string | null;
  incidentDateLongSnapshot: string | null;
  pdfPath: string | null;
  signedAt: string | null;
  signedScanPath: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

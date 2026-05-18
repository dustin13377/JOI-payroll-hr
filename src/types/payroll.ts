export type EmpTitle = 'owner' | 'admin' | 'manager' | 'team_lead' | 'agent';

export interface Employee {
  id: string;
  nombre: string;
  sueldoBase: number;
  descuentoPorDia: number;
  kpiMonto: number;
  title?: EmpTitle;        // job title / permission level (defaults to 'agent')
  reportsTo?: string | null; // employee UUID of supervisor (manager or team_lead)
  _uuid?: string; // Supabase internal UUID
}

/** Employee with metadata fields populated by mapEmployee (from DB joins) */
export interface EmployeeWithMeta extends Employee {
  _campaignId?: string;
  _campaignName?: string;
  _curp?: string | null;
  _rfc?: string | null;
  _address?: string | null;
  _phone?: string | null;
  _bankClabe?: string | null;
  _complianceGraceUntil?: string | null;
  // A1b: expanded employee record
  _workName?: string | null;
  _personalEmail?: string | null;
  _email?: string | null; // work/auth login email; nullable until invite is sent
  _hireDate?: string | null;
  _emergencyContact?: string | null;
  _bankName?: string | null;
  _dateOfBirth?: string | null;
  _maritalStatus?: string | null;
  _nss?: string | null;
  _lastWorkedDay?: string | null;
  _departmentId?: string | null;
  _departmentName?: string | null;
}

export interface PayrollConfig {
  empleadoId: string;
  diasFaltados: number;
  kpiAplicado: boolean;
  diasExtra: number;
  primaDominical: boolean;
  diaFestivo: boolean;
  bonosAdicionales: number;
}

export interface PayrollResult {
  sueldoQuincenal: number;
  sueldoDiario: number;
  descuentoFaltas: number;
  montoKpi: number;
  montoDiasExtra: number;
  montoPrimaDominical: number;
  montoDiaFestivo: number;
  bonosAdicionales: number;
  totalExtras: number;
  totalRetenciones: number;
  netoAPagar: number;
}

export interface PayrollRecord {
  id: string;
  periodo: string;
  fechaCierre: string;
  empleadoId: string;
  empleadoNombre: string;
  config: PayrollConfig;
  result: PayrollResult;
  sueldoBase: number;
}

export function calcularNomina(emp: Employee, config: PayrollConfig): PayrollResult {
  const sueldoQuincenal = emp.sueldoBase / 2;
  const sueldoDiario = emp.sueldoBase / 30;
  const descuentoFaltas = config.diasFaltados * emp.descuentoPorDia;
  const montoKpi = config.kpiAplicado ? emp.kpiMonto : 0;
  const montoDiasExtra = config.diasExtra * 1000;
  const montoPrimaDominical = config.primaDominical ? sueldoDiario * 0.25 : 0;
  const montoDiaFestivo = config.diaFestivo ? sueldoDiario * 3 : 0;
  const bonosAdicionales = config.bonosAdicionales;

  const totalExtras = montoKpi + montoDiasExtra + montoPrimaDominical + montoDiaFestivo + bonosAdicionales;
  const totalRetenciones = descuentoFaltas;
  const netoAPagar = sueldoQuincenal - totalRetenciones + totalExtras;

  return {
    sueldoQuincenal,
    sueldoDiario,
    descuentoFaltas,
    montoKpi,
    montoDiasExtra,
    montoPrimaDominical,
    montoDiaFestivo,
    bonosAdicionales,
    totalExtras,
    totalRetenciones,
    netoAPagar,
  };
}

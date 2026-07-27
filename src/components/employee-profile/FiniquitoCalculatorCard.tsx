import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calculator, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { formatMXN } from "@/lib/formatCurrency";
import { useAuth } from "@/hooks/useAuth";
import {
  SensitiveDataAckGate,
  FINIQUITO_ACK_TEXT,
} from "@/components/SensitiveDataAckGate";
import {
  calcAguinaldoProporcional,
  calcVacaciones,
  calcPrimaVacacional,
  calcFiniquitoTotal,
  numberToSpanishWords,
} from "@/lib/lftCalculations";

/**
 * Standalone finiquito (severance) calculator on the employee profile.
 *
 * Same LFT math and confidentiality gate as the "Actas y Cartas" renuncia flow
 * (HrDocumentDraft) — it reuses lftCalculations + SensitiveDataAckGate rather
 * than duplicating either. The difference is intent: this is a quick scratchpad
 * estimate for HR, NOT a stored document. Nothing here is persisted; the
 * official, signed finiquito is still generated from Actas y Cartas.
 *
 * Visibility: rendered only for owner + admin ("admin and up") by the parent.
 * Both of those roles can view salary, so there's no masking here — but admins
 * still pass through the confidentiality acknowledgment (the owner is exempt,
 * matching the Actas y Cartas rule: ackGateActive = !isOwner).
 *
 * Seeds: daily wage from monthly base ÷ 30 (MX convention) and the hire date
 * from the employee record. HR can override any field by hand.
 */

interface Props {
  employeeUuid: string; // employees.id (UUID) — subject of the confidentiality log
  employeeName: string;
  monthlyBaseSalary: number; // full monthly base (employees.monthly_base_salary)
  hireDate: string | null; // YYYY-MM-DD
}

type FormState = {
  hireDate: string;
  salarioDiario: string;
  resignationDate: string;
  aguinaldo: string;
  vacaciones: string;
  prima: string;
  salariosDevengados: string;
  total: string;
  totalEnLetras: string;
};

export function FiniquitoCalculatorCard({
  employeeUuid,
  employeeName,
  monthlyBaseSalary,
  hireDate,
}: Props) {
  const { isOwner } = useAuth();
  const [open, setOpen] = useState(false);

  // Daily wage seed = monthly base ÷ 30, rounded to 2dp — same as HrDocumentDraft.
  const seededDaily = monthlyBaseSalary
    ? String(Math.round((monthlyBaseSalary / 30) * 100) / 100)
    : "";

  const [form, setForm] = useState<FormState>({
    hireDate: hireDate ?? "",
    salarioDiario: seededDaily,
    resignationDate: "",
    aguinaldo: "",
    vacaciones: "",
    prima: "",
    salariosDevengados: "",
    total: "",
    totalEnLetras: "",
  });

  const set = (patch: Partial<FormState>) =>
    setForm((f) => ({ ...f, ...patch }));

  const round2 = (x: number) => Math.round(x * 100) / 100;

  // Settlement scenarios for an exit negotiation. A "month" = daily wage × 30,
  // so the 3-month tier equals the 90-day constitutional indemnización (LFT
  // Art. 48); 2 and 1 month are negotiated-down offers. Shown ON TOP of the
  // finiquito (aguinaldo/vacaciones/prima/devengados the employee is always
  // owed), so the combined total is the full cash-out at each tier.
  const dailyNum = parseFloat(form.salarioDiario) || 0;
  const finiquitoNum = parseFloat(form.total) || 0;
  const settlementTiers = [3, 2, 1].map((months) => {
    const settlement = round2(dailyNum * 30 * months);
    return { months, settlement, total: round2(settlement + finiquitoNum) };
  });

  function autoCalculate() {
    const sd = parseFloat(form.salarioDiario);
    const hd = form.hireDate;
    const rd = form.resignationDate;
    if (!sd || !hd || !rd) {
      toast.error("Enter hire date, daily wage, and termination date first");
      return;
    }
    const aguinaldo = calcAguinaldoProporcional({
      salarioDiario: sd,
      hireDate: hd,
      resignationDate: rd,
    });
    const vac = calcVacaciones({
      salarioDiario: sd,
      hireDate: hd,
      resignationDate: rd,
    });
    const prima = calcPrimaVacacional(vac.amount);
    const devengados = parseFloat(form.salariosDevengados) || 0;
    const total = calcFiniquitoTotal({
      aguinaldo,
      vacaciones: vac.amount,
      prima,
      salariosDevengados: devengados,
    });
    set({
      aguinaldo: String(aguinaldo),
      vacaciones: String(vac.amount),
      prima: String(prima),
      total: String(total),
      totalEnLetras: numberToSpanishWords(total),
    });
  }

  // Re-sum the total (and words) whenever a component amount is edited by hand.
  function editAmount(patch: Partial<FormState>) {
    const merged = { ...form, ...patch };
    const total = calcFiniquitoTotal({
      aguinaldo: parseFloat(merged.aguinaldo) || 0,
      vacaciones: parseFloat(merged.vacaciones) || 0,
      prima: parseFloat(merged.prima) || 0,
      salariosDevengados: parseFloat(merged.salariosDevengados) || 0,
    });
    set({
      ...patch,
      total: String(total),
      totalEnLetras: numberToSpanishWords(total),
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Calculator className="h-5 w-5" /> Finiquito Calculator
        </CardTitle>
        <Button variant="outline" size="sm" onClick={() => setOpen((o) => !o)}>
          {open ? (
            <>
              <ChevronUp className="mr-2 h-4 w-4" /> Hide
            </>
          ) : (
            <>
              <ChevronDown className="mr-2 h-4 w-4" /> Open calculator
            </>
          )}
        </Button>
      </CardHeader>

      {open && (
        <CardContent>
          <SensitiveDataAckGate
            active={!isOwner}
            context="finiquito_calculation"
            acknowledgmentText={FINIQUITO_ACK_TEXT}
            subjectEmployeeId={employeeUuid}
          >
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Quick LFT estimate for {employeeName}. This is a scratchpad — it
                isn't saved. The official signed finiquito is still generated
                from Actas y Cartas.
              </p>

              {/* Inputs */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">
                    Hire date
                  </Label>
                  <Input
                    type="date"
                    value={form.hireDate}
                    onChange={(e) => set({ hireDate: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">
                    Termination / last day
                  </Label>
                  <Input
                    type="date"
                    value={form.resignationDate}
                    onChange={(e) => set({ resignationDate: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">
                    Daily wage ($ MXN)
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.salarioDiario}
                    onChange={(e) => set({ salarioDiario: e.target.value })}
                  />
                </div>
                <div className="flex items-end">
                  <Button type="button" onClick={autoCalculate} className="w-full">
                    Auto-calculate
                  </Button>
                </div>
              </div>

              {/* Results (editable) */}
              <div className="grid grid-cols-2 gap-3 rounded-lg border p-3">
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">
                    Prorated Christmas bonus
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.aguinaldo}
                    onChange={(e) => editAmount({ aguinaldo: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">
                    Accrued vacation
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.vacaciones}
                    onChange={(e) => editAmount({ vacaciones: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">
                    Vacation premium (25%)
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.prima}
                    onChange={(e) => editAmount({ prima: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">
                    Salarios Devengados de Días
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.salariosDevengados}
                    onChange={(e) =>
                      editAmount({ salariosDevengados: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1 col-span-2">
                  <Label className="text-[10px] text-muted-foreground font-medium">
                    Total
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.total}
                    onChange={(e) => set({ total: e.target.value })}
                    className="font-semibold"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">
                  Total in words
                </Label>
                <Textarea
                  rows={2}
                  value={form.totalEnLetras}
                  onChange={(e) => set({ totalEnLetras: e.target.value })}
                />
              </div>

              {/* Settlement scenarios — 3 / 2 / 1 months of salary as the
                  separation offer, each shown on top of the finiquito. */}
              <div className="space-y-2 rounded-lg border p-3">
                <Label className="text-xs font-medium uppercase tracking-wider">
                  Settlement scenarios
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  Each tier = N months of salary (daily wage × 30 × N) plus the
                  finiquito above. Enter a daily wage — and Auto-calculate the
                  finiquito — to populate the totals.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                        <th className="py-2 pr-3 font-medium">Offer</th>
                        <th className="py-2 px-3 font-medium text-right">
                          Settlement
                        </th>
                        <th className="py-2 px-3 font-medium text-right">
                          + Finiquito
                        </th>
                        <th className="py-2 pl-3 font-medium text-right">
                          = Total payout
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {settlementTiers.map((t) => (
                        <tr key={t.months} className="border-b last:border-0">
                          <td className="py-2 pr-3 whitespace-nowrap">
                            {t.months} {t.months === 1 ? "month" : "months"}
                          </td>
                          <td className="py-2 px-3 text-right whitespace-nowrap">
                            {formatMXN(t.settlement)}
                          </td>
                          <td className="py-2 px-3 text-right whitespace-nowrap text-muted-foreground">
                            {formatMXN(finiquitoNum)}
                          </td>
                          <td className="py-2 pl-3 text-right font-semibold whitespace-nowrap">
                            {formatMXN(t.total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </SensitiveDataAckGate>
        </CardContent>
      )}
    </Card>
  );
}

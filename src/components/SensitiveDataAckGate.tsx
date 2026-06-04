import { useState, useEffect, type ReactNode } from "react";
import { ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

/**
 * Exact confidentiality wording the user agrees to before seeing finiquito
 * (severance) amounts. Stored verbatim in sensitive_data_acknowledgments —
 * legally, the wording the person consented to matters more than a boolean.
 *
 * Spanish on purpose: this is the language that holds up locally (MX). It cites
 * the two hooks that give it teeth — LFT Art. 47 (just cause for dismissal) and
 * the 2025 LFPDPPP (federal data-protection duty).
 */
export const FINIQUITO_ACK_TEXT =
  "Confirmo que la información de finiquito, salarios y datos personales a la que tengo acceso o que manejo en el ejercicio de mi función es CONFIDENCIAL. " +
  "Me comprometo a no divulgarla, comentarla ni compartirla fuera del ejercicio de mi función. " +
  "Entiendo que su divulgación indebida puede constituir causa de rescisión de la relación laboral sin responsabilidad para el patrón " +
  "(Art. 47 de la Ley Federal del Trabajo) y una violación a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares.";

/**
 * Session-scoped dedupe. Once a viewer acknowledges a given record this browser
 * session, we don't re-prompt (or re-log) — "once per session per record". A
 * page reload starts a fresh session and prompts again.
 */
const sessionAcked = new Set<string>();

/** Build the dedupe key for a given sensitive view. */
function ackKey(context: string, subjectEmployeeId?: string | null): string {
  return `${context}:${subjectEmployeeId ?? "all"}`;
}

/**
 * Has the viewer acknowledged this record this session? Lets callers (e.g. the
 * PDF generator) honor the same gate the on-screen view uses, so amounts can't
 * leak into a downloaded PDF without an acknowledgment on file.
 */
export function hasSensitiveAck(
  context: string,
  subjectEmployeeId?: string | null,
): boolean {
  return sessionAcked.has(ackKey(context, subjectEmployeeId));
}

interface Props {
  /**
   * When false, the gate is transparent and renders children directly. Pass
   * `canViewSalary` so the gate only blocks people who actually see real
   * amounts (managers already see masked asterisks — nothing to gate).
   */
  active: boolean;
  /** What kind of sensitive view, e.g. "finiquito_calculation". */
  context: string;
  /** Exact wording the user agrees to — stored verbatim as evidence. */
  acknowledgmentText: string;
  /** Whose data is being viewed (the subject employee). */
  subjectEmployeeId?: string | null;
  /** Optional link back to the HR document request. */
  hrDocumentRequestId?: string | null;
  /** Fired once the record is acknowledged (or already was this session). */
  onAcknowledged?: () => void;
  children: ReactNode;
}

export function SensitiveDataAckGate({
  active,
  context,
  acknowledgmentText,
  subjectEmployeeId,
  hrDocumentRequestId,
  onAcknowledged,
  children,
}: Props) {
  const { employeeId } = useAuth();
  const key = ackKey(context, subjectEmployeeId);
  const [acked, setAcked] = useState(() => sessionAcked.has(key));
  const [saving, setSaving] = useState(false);

  // Sync the parent when the gate opens — whether just now or already acked
  // earlier this session (e.g. after a re-render) — so PDF visibility matches.
  useEffect(() => {
    if (!active || acked) onAcknowledged?.();
  }, [active, acked, onAcknowledged]);

  if (!active || acked) return <>{children}</>;

  async function handleAck() {
    if (!employeeId) {
      toast.error("No employee profile loaded — cannot record acknowledgment.");
      return;
    }
    setSaving(true);
    // The new table isn't in the generated Supabase types yet (regen deferred),
    // so we cast the client locally rather than weaken the whole typed client.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("sensitive_data_acknowledgments")
      .insert({
        acknowledged_by: employeeId,
        context,
        subject_employee_id: subjectEmployeeId ?? null,
        hr_document_request_id: hrDocumentRequestId ?? null,
        acknowledgment_text: acknowledgmentText,
      });
    setSaving(false);

    if (error) {
      // Keep it gated on failure — an unreliable audit trail is worse than a
      // blocked view. The user can retry.
      toast.error(`Could not record acknowledgment — try again. ${error.message}`);
      return;
    }

    sessionAcked.add(key);
    setAcked(true);
  }

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-sm font-semibold text-amber-900">
            Confidencial — datos de finiquito y salario
          </p>
          <p className="text-xs leading-relaxed text-amber-800 whitespace-pre-line">
            {acknowledgmentText}
          </p>
        </div>
      </div>
      <Button
        size="sm"
        onClick={handleAck}
        disabled={saving}
        className="bg-amber-600 text-white hover:bg-amber-700"
      >
        {saving ? "Registrando…" : "Entiendo — mostrar montos"}
      </Button>
    </div>
  );
}

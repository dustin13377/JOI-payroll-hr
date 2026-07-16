import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { format } from "date-fns";
import { useCandidateAssessments, useCreateAssessment } from "@/hooks/useRecruiting";

const yn = (b: unknown) => (b ? "✓" : "✗");

function statusLabel(s: string) {
  if (s === "completed") return "Completed";
  if (s === "in_progress") return "Started";
  if (s === "expired") return "Expired";
  return "Not started";
}

function ResultsTable({ results, totalSeconds }: { results: any; totalSeconds: number | null }) {
  const t = results || {};
  const rows: [string, string, number | undefined, number | undefined][] = [
    ["1 · Find record", `search ${yn(t.find?.usedSearch)} · wrong opens ${t.find?.wrongOpens ?? 0}`, t.find?.sec, t.find?.hints],
    ["2 · Edit & save", `phone ${yn(t.edit?.phoneCorrect)} · status ${yn(t.edit?.statusCorrect)} · saved ${yn(t.edit?.savedCorrect)}`, t.edit?.sec, t.edit?.hints],
    ["3 · Windows", `answer ${yn(t.windows?.correct)} · fails ${t.windows?.wrongTries ?? 0} · switches ${t.windows?.switches ?? 0}`, t.windows?.sec, t.windows?.hints],
    ["4 · Copy / paste", `pasted ${yn(t.copypaste?.pasteUsed)} · correct ${yn(t.copypaste?.correct)}`, t.copypaste?.sec, t.copypaste?.hints],
    ["5 · Download", `got file ${yn(t.download?.downloaded)} · code ${yn(t.download?.codeCorrect)} · fails ${t.download?.wrongTries ?? 0}`, t.download?.sec, t.download?.hints],
    ["6 · Upload", `uploaded ${yn(t.upload?.uploadedAny)} · correct file ${yn(t.upload?.correctFile)}`, t.upload?.sec, t.upload?.hints],
  ];
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-muted-foreground text-left">
          <th className="py-1">Task</th><th>Detail</th><th className="text-right">Time</th><th className="text-right">Hints</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r[0]} className="border-t">
            <td className="py-1 font-medium whitespace-nowrap pr-2">{r[0]}</td>
            <td className="pr-2">{r[1]}</td>
            <td className="text-right">{r[2] ?? "–"}s</td>
            <td className="text-right">{r[3] ?? 0}</td>
          </tr>
        ))}
        <tr className="border-t">
          <td className="py-1 font-medium">Total</td><td></td>
          <td className="text-right font-medium">{totalSeconds ?? "–"}s</td><td></td>
        </tr>
      </tbody>
    </table>
  );
}

export function SkillsTestCard({ candidateId }: { candidateId: string }) {
  const { data: assessments = [] } = useCandidateAssessments(candidateId);
  const create = useCreateAssessment();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const linkFor = (token: string) => `${window.location.origin}/skills-test/${token}`;
  async function copy(token: string, id: string) {
    try {
      await navigator.clipboard.writeText(linkFor(token));
      setCopiedId(id);
      toast.success("Link copied");
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      toast.error("Couldn't copy — select the link and copy it manually");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Computer skills test</h3>
        <Button size="sm" variant="outline" disabled={create.isPending} onClick={() => create.mutate(candidateId)}>
          {create.isPending ? "Generating…" : "Generate test link"}
        </Button>
      </div>
      {assessments.length === 0 && (
        <p className="text-sm text-muted-foreground">No test sent yet. Generate a link and send it to the applicant by email or chat.</p>
      )}
      {assessments.map((a) => (
        <div key={a.id} className="rounded border p-3 text-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-medium">{statusLabel(a.status)}</span>
            <span className="text-muted-foreground text-xs">{format(new Date(a.created_at), "d MMM yyyy")}</span>
          </div>
          {a.status !== "completed" && (
            <div className="flex gap-2 items-center">
              <input readOnly className="flex-1 text-xs bg-muted rounded px-2 py-1" value={linkFor(a.token)} onFocus={(e) => e.currentTarget.select()} />
              <Button size="sm" variant="ghost" onClick={() => copy(a.token, a.id)}>{copiedId === a.id ? "Copied" : "Copy"}</Button>
            </div>
          )}
          {a.status === "completed" && a.results && <ResultsTable results={a.results} totalSeconds={a.total_seconds} />}
        </div>
      ))}
    </div>
  );
}

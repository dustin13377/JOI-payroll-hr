/**
 * /admin/payroll/holidays — Mexican Holidays View (Phase 4b)
 *
 * Read-only display of holidays seeded from LFT Article 74.
 * Year selector + type filter. Add/edit forms come in a future phase.
 */

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, ArrowLeft, CalendarDays, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useMexicanHolidays, type MexicanHoliday } from "@/hooks/usePayroll";

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function formatHolidayDate(dateStr: string): { weekday: string; date: string } {
  const [y, m, d] = dateStr.split("-");
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  return {
    weekday: date.toLocaleDateString("es-MX", { weekday: "long" }),
    date: date.toLocaleDateString("es-MX", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    }),
  };
}

function HolidayTypeBadge({ type }: { type: string }) {
  if (type === "LFT_OFICIAL") {
    return (
      <Badge className="bg-blue-100 text-blue-800 border-blue-300 hover:bg-blue-100">
        LFT Oficial
      </Badge>
    );
  }
  if (type === "EMPRESA") {
    return (
      <Badge className="bg-purple-100 text-purple-800 border-purple-300 hover:bg-purple-100">
        Empresa
      </Badge>
    );
  }
  if (type === "OPCIONAL") {
    return (
      <Badge className="bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-100">
        Opcional
      </Badge>
    );
  }
  return <Badge variant="outline">{type}</Badge>;
}

/* ------------------------------------------------------------------ */
/*  Main page                                                           */
/* ------------------------------------------------------------------ */

const TYPE_OPTIONS = ["__all__", "LFT_OFICIAL", "EMPRESA", "OPCIONAL"] as const;
type TypeFilter = (typeof TYPE_OPTIONS)[number];

export default function PayrollHolidays() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState<number>(currentYear);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("__all__");

  const { data: holidays = [], isLoading, error } = useMexicanHolidays(year);

  const filtered = useMemo(() => {
    if (typeFilter === "__all__") return holidays;
    return holidays.filter((h) => h.type === typeFilter);
  }, [holidays, typeFilter]);

  // Build year options: this year ± 2
  const yearOptions = [currentYear - 1, currentYear, currentYear + 1, currentYear + 2];

  const lftCount = holidays.filter((h) => h.type === "LFT_OFICIAL").length;

  return (
    <div className="p-6 max-w-4xl space-y-4">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <Link to="/admin/payroll" className="hover:text-foreground flex items-center gap-1">
            <ArrowLeft className="h-3 w-3" />
            Payroll
          </Link>
          <span>/</span>
          <span>Holidays</span>
        </div>
        <h1 className="text-2xl font-bold">Mexican Holidays</h1>
        <p className="text-muted-foreground text-sm">
          LFT Article 74 official holidays + company-specific days. Auto-derive uses these to detect
          holiday-day work; LFT Article 75 holiday pay (2× daily premium) fires for any row marked
          "Pays premium."
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4 flex flex-wrap gap-4 items-end">
          <div>
            <Label className="text-xs">Year</Label>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="h-9 w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Type</Label>
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as TypeFilter)}>
              <SelectTrigger className="h-9 w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All types</SelectItem>
                <SelectItem value="LFT_OFICIAL">LFT Oficial</SelectItem>
                <SelectItem value="EMPRESA">Empresa</SelectItem>
                <SelectItem value="OPCIONAL">Opcional</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="ml-auto text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{filtered.length}</span> shown
            {lftCount > 0 && (
              <>
                {" · "}
                <span className="text-blue-700">{lftCount} LFT</span>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Holiday list */}
      {isLoading ? (
        <div className="flex items-center justify-center min-h-[200px]">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 text-destructive p-4">
          <AlertCircle className="h-5 w-5" />
          <span>Failed to load: {error.message}</span>
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CalendarDays className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground text-sm">
              No holidays found for {year} matching the current filters.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-b">
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="p-3">Date</th>
                  <th className="p-3">Name (ES)</th>
                  <th className="p-3">Name (EN)</th>
                  <th className="p-3">Type</th>
                  <th className="p-3 text-center">Pays Premium</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((h: MexicanHoliday) => {
                  const { weekday, date } = formatHolidayDate(h.date);
                  return (
                    <tr key={h.date} className="border-b last:border-b-0 hover:bg-muted/20">
                      <td className="p-3">
                        <div className="font-medium">{date}</div>
                        <div className="text-xs text-muted-foreground capitalize">{weekday}</div>
                      </td>
                      <td className="p-3">{h.name_es ?? h.name ?? "—"}</td>
                      <td className="p-3 text-muted-foreground">{h.name_en ?? "—"}</td>
                      <td className="p-3">
                        <HolidayTypeBadge type={h.type} />
                      </td>
                      <td className="p-3 text-center">
                        {h.pays_premium ? (
                          <span className="text-green-700" title="Working this day = daily × 2 bonus (LFT Art. 75)">
                            ✓
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        Holidays marked "Pays Premium" trigger 2× daily-rate bonus per LFT Article 75 when an agent
        is clocked in on that date. Add/edit forms for company-specific holidays will come in a
        future phase.
      </p>
    </div>
  );
}

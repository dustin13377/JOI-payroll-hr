import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, ExternalLink } from "lucide-react";
import { formatDateMX } from "@/lib/localDate";
import { LogoLoadingIndicator } from "@/components/ui/LogoLoadingIndicator";
import {
  useMySignedHrDocuments,
  issueHrDocumentSignedUrl,
} from "@/hooks/useHrDocumentRequests";

export default function SignedHrDocumentsCard({
  employeeId,
}: {
  employeeId: string | null;
}) {
  const { data: docs = [], isLoading } = useMySignedHrDocuments(employeeId);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  async function handleView(
    finalizationId: string,
    type: "carta" | "acta" | "renuncia" | "rescision_prueba" | "rescision_desempeno",
    fileType: "pdf" | "signed_scan",
  ) {
    setLoadingId(`${finalizationId}-${fileType}`);
    try {
      const url = await issueHrDocumentSignedUrl(finalizationId, type, fileType);
      window.open(url, "_blank");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoadingId(null);
    }
  }

  if (!employeeId || (docs.length === 0 && !isLoading)) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <FileText className="h-5 w-5" />
          My Signed Documents
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && (
          <LogoLoadingIndicator size="sm" />
        )}

        {!isLoading && docs.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No signed documents.
          </p>
        )}

        {docs.map((doc) => (
          <div
            key={doc.id}
            className="border-l-2 border-muted pl-3 space-y-1"
          >
            <div className="flex items-center gap-2 flex-wrap">
              <Badge
                variant={doc.type === "acta" || doc.type === "rescision_prueba" || doc.type === "rescision_desempeno" ? "destructive" : doc.type === "renuncia" ? "secondary" : "outline"}
                className="text-xs"
              >
                {doc.type === "acta"
                  ? "Disciplinary Act"
                  : doc.type === "renuncia"
                    ? "Resignation"
                    : doc.type === "rescision_prueba"
                      ? "Probation Termination"
                      : doc.type === "rescision_desempeno"
                        ? "Performance Termination"
                        : "Commitment Letter"}
              </Badge>
              {doc.docRef && (
                <span className="text-xs font-mono text-muted-foreground">
                  {doc.docRef}
                </span>
              )}
              <span className="text-xs text-muted-foreground">
                Signed {formatDateMX(doc.signedAt)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {doc.signedScanPath && (
                <Button
                  variant="link"
                  size="sm"
                  className="h-6 px-0 text-xs"
                  disabled={loadingId === `${doc.id}-signed_scan`}
                  onClick={() => handleView(doc.id, doc.type, "signed_scan")}
                >
                  <ExternalLink className="mr-1 h-3 w-3" />
                  {loadingId === `${doc.id}-signed_scan`
                    ? "Opening..."
                    : "View Document"}
                </Button>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

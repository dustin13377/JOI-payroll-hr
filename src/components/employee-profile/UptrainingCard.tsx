import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LogoLoadingIndicator } from "@/components/ui/LogoLoadingIndicator";
import { GraduationCap, FileDown, Upload, ExternalLink } from "lucide-react";
import { formatDateMX } from "@/lib/localDate";
import { generateUptrainingPdf } from "@/lib/pdf/generateUptrainingPdf";
import {
  gatherUptrainingSeed,
  useUptrainingDocumentsForEmployee,
  useUploadUptrainingDocument,
  openUptrainingDoc,
} from "@/hooks/useUptrainingDocuments";

/**
 * Constancia de Uptraining card.
 *
 * mode="manage" (TL + HR): generate the pre-filled PDF, upload the signed scan,
 *   and view all uploaded docs.
 * mode="agent": read-only — the agent views their own signed uptraining docs.
 *   Renders nothing if there are none.
 */
export default function UptrainingCard({
  employeeId,
  authEmployeeId,
  mode = "manage",
}: {
  employeeId: string;
  authEmployeeId: string;
  mode?: "manage" | "agent";
}) {
  const canManage = mode === "manage";
  const { data: docs = [], isLoading } =
    useUptrainingDocumentsForEmployee(employeeId);
  const upload = useUploadUptrainingDocument();
  const [generating, setGenerating] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleGenerate() {
    setGenerating(true);
    try {
      const seed = await gatherUptrainingSeed(employeeId);
      const blob = generateUptrainingPdf(seed);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file) return;
    upload.mutate(
      { employeeId, uploadedBy: authEmployeeId, file },
      {
        onSuccess: () => toast.success("Documento de uptraining subido."),
        onError: (err) => toast.error((err as Error).message),
      },
    );
  }

  async function handleView(id: string, filePath: string) {
    setOpeningId(id);
    try {
      await openUptrainingDoc(filePath);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setOpeningId(null);
    }
  }

  // Agent view with nothing to show → render nothing, like Signed Documents.
  if (!canManage && docs.length === 0 && !isLoading) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <GraduationCap className="h-5 w-5" />
            {canManage ? "Uptraining" : "Mis constancias de uptraining"}
          </CardTitle>
          {canManage && (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handleGenerate}
                disabled={generating}
              >
                <FileDown className="mr-1 h-3 w-3" />
                {generating ? "Generando..." : "Generar constancia"}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                aria-label="Subir documento de uptraining firmado"
                onChange={handleFileSelect}
              />
              <Button
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={upload.isPending}
              >
                <Upload className="mr-1 h-3 w-3" />
                {upload.isPending ? "Subiendo..." : "Subir firmado"}
              </Button>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {canManage && (
          <p className="text-xs text-muted-foreground">
            Genera la constancia pre-llenada (datos del agente + KPIs de la
            campaña), imprímela, complétala y fírmala, y sube aquí el documento
            firmado. El agente podrá verlo en su perfil.
          </p>
        )}

        {isLoading && <LogoLoadingIndicator size="sm" />}

        {!isLoading && docs.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {canManage
              ? "No hay documentos de uptraining para este agente aún."
              : "No tienes constancias de uptraining."}
          </p>
        )}

        {docs.length > 0 && (
          <ul className="space-y-2">
            {docs.map((doc) => (
              <li
                key={doc.id}
                className="border-l-2 border-muted pl-3 flex items-center justify-between gap-2 flex-wrap"
              >
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <Badge variant="outline" className="text-xs">
                    Uptraining
                  </Badge>
                  <span className="text-sm truncate max-w-[16rem]">
                    {doc.originalFilename ?? "Documento"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDateMX(doc.createdAt)}
                  </span>
                </div>
                <Button
                  variant="link"
                  size="sm"
                  className="h-6 px-0 text-xs shrink-0"
                  disabled={openingId === doc.id}
                  onClick={() => handleView(doc.id, doc.filePath)}
                >
                  <ExternalLink className="mr-1 h-3 w-3" />
                  {openingId === doc.id ? "Abriendo..." : "Ver documento"}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ExternalLink, FileText, Download } from "lucide-react";

/**
 * Detect attachment type from URL. Gravity Forms URLs look like:
 *   https://justoutsource.it/index.php?gf-download=2026%2F05%2Fcv.pdf&form-id=4&...
 * The actual filename is URL-encoded inside the gf-download query param,
 * so we have to decode it before checking the extension.
 */
export function detectMediaType(
  url: string,
): "pdf" | "audio" | "video" | "doc" | "other" {
  let decoded = url;
  try {
    decoded = decodeURIComponent(url);
  } catch {
    // fall through with original
  }
  const lower = decoded.toLowerCase();
  if (/\.pdf(\b|[?&#])/.test(lower)) return "pdf";
  if (/\.(mp3|m4a|wav|ogg|aac)(\b|[?&#])/.test(lower)) return "audio";
  if (/\.(mp4|mov|webm|m4v|avi)(\b|[?&#])/.test(lower)) return "video";
  if (/\.(docx?|odt|rtf)(\b|[?&#])/.test(lower)) return "doc";
  return "other";
}

interface Props {
  label: string;
  url: string | null | undefined;
  /** Text shown for PDFs/docs. Defaults to "View" / "Download" by file type. */
  buttonLabel?: string;
  /** When true, hide the whole block (label + dash) if url is missing. */
  hideWhenEmpty?: boolean;
}

/**
 * Renders a media attachment with the right control for the file type:
 *   PDF   → "View" button (opens in new tab)
 *   Audio → inline <audio controls>
 *   Video → inline <video controls>
 *   Doc   → "Download" button (browser handles .docx etc)
 *   Other → generic "Open" button
 *
 * Shared by the candidate drawer and the employee profile so both views look
 * identical and stay in sync.
 */
export function MediaAttachment({ label, url, buttonLabel, hideWhenEmpty }: Props) {
  if (!url) {
    if (hideWhenEmpty) return null;
    return (
      <div>
        <Label className="text-sm">{label}</Label>
        <div className="text-sm text-muted-foreground mt-1">—</div>
      </div>
    );
  }

  const kind = detectMediaType(url);

  return (
    <div className="space-y-2">
      <Label className="text-sm">{label}</Label>
      {kind === "pdf" && (
        <Button asChild size="sm" variant="outline">
          <a href={url} target="_blank" rel="noopener noreferrer">
            <FileText className="mr-2 h-4 w-4" />
            {buttonLabel ?? "View"} (PDF)
            <ExternalLink className="ml-2 h-3 w-3" />
          </a>
        </Button>
      )}
      {kind === "doc" && (
        <div className="flex items-center gap-2">
          {/* Word docs can't render natively in the browser — route through
              Microsoft's Office viewer so it opens as a readable page instead
              of forcing a download. The file URL must be publicly reachable
              (Gravity Forms upload URLs are). */}
          <Button asChild size="sm" variant="outline">
            <a
              href={`https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(url)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <FileText className="mr-2 h-4 w-4" />
              {buttonLabel ?? "View"} (Word)
              <ExternalLink className="ml-2 h-3 w-3" />
            </a>
          </Button>
          <Button asChild size="sm" variant="ghost" title="Download original file">
            <a href={url} target="_blank" rel="noopener noreferrer">
              <Download className="h-4 w-4" />
            </a>
          </Button>
        </div>
      )}
      {kind === "audio" && (
        <audio controls preload="none" className="w-full">
          <source src={url} />
          Your browser does not support audio playback.{" "}
          <a href={url} target="_blank" rel="noopener noreferrer">Download</a>
        </audio>
      )}
      {kind === "video" && (
        <video controls preload="none" className="w-full rounded border max-h-64">
          <source src={url} />
          Your browser does not support video playback.{" "}
          <a href={url} target="_blank" rel="noopener noreferrer">Download</a>
        </video>
      )}
      {kind === "other" && (
        <Button asChild size="sm" variant="outline">
          <a href={url} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="mr-2 h-4 w-4" />
            {buttonLabel ?? "Open attachment"}
          </a>
        </Button>
      )}
    </div>
  );
}

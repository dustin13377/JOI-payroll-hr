import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { MediaAttachment } from "@/components/MediaAttachment";
import type { EmployeeWithMeta } from "@/types/payroll";

interface Props {
  emp: EmployeeWithMeta;
}

/**
 * Shows the CV and intro recording that were captured at hire time from the
 * recruiting flow. Hidden entirely if both fields are empty — most older
 * employees won't have these.
 */
export function RecruitingAttachmentsCard({ emp }: Props) {
  const cv = emp._cvUrl;
  const intro = emp._introRecordingUrl;
  const candidateId = emp._recruitedFromCandidateId;

  // Nothing to show? Render nothing.
  if (!cv && !intro && !candidateId) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-lg">From Application</CardTitle>
        {candidateId && (
          <Button asChild variant="ghost" size="sm">
            <Link to={`/recruiting?candidate=${candidateId}`}>
              View application
              <ArrowRight className="ml-1 h-3 w-3" />
            </Link>
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <MediaAttachment
          label="CV / Resume"
          url={cv}
          buttonLabel="View CV"
          hideWhenEmpty
        />
        <MediaAttachment label="Intro recording" url={intro} hideWhenEmpty />
      </CardContent>
    </Card>
  );
}

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ClipboardList, CheckCircle2, ChevronDown, ChevronUp, Users } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { formatDateUSShort } from "@/lib/localDate";
import {
  BulletinPost,
  BulletinQuestion,
  useQuestionsForPost,
  useMyResponsesForPost,
  useResponsesForPost,
  useSubmitResponses,
} from "@/hooks/useBulletin";

function timeAgo(iso: string | null) {
  if (!iso) return "—";
  return formatDistanceToNow(new Date(iso), { addSuffix: true });
}

// ── Manager results view ──────────────────────────────────────────────────────
function ResultsPanel({ post, questions }: { post: BulletinPost; questions: BulletinQuestion[] }) {
  const { data: responses = [] } = useResponsesForPost(post.id);

  // Count unique respondents
  const respondentIds = new Set(responses.map((r) => r.respondent_id));
  const totalRespondents = respondentIds.size;

  return (
    <div className="space-y-4 pt-2">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Users className="h-4 w-4" />
        <span>{totalRespondents} {totalRespondents === 1 ? "response" : "responses"} so far</span>
      </div>

      {questions.map((q) => {
        const qResponses = responses.filter((r) => r.question_id === q.id);

        if (q.type === "multiple_choice" && q.options) {
          // Tally votes per option
          const counts: Record<string, number> = {};
          for (const opt of q.options) counts[opt] = 0;
          for (const r of qResponses) {
            if (r.answer_option && counts[r.answer_option] !== undefined) {
              counts[r.answer_option]++;
            }
          }
          const total = qResponses.length || 1;

          return (
            <div key={q.id} className="space-y-2">
              <p className="text-sm font-medium">{q.question_text}</p>
              <div className="space-y-1.5">
                {q.options.map((opt) => {
                  const count = counts[opt] ?? 0;
                  const pct = Math.round((count / total) * 100);
                  return (
                    <div key={opt} className="space-y-0.5">
                      <div className="flex items-center justify-between text-xs">
                        <span>{opt}</span>
                        <span className="text-muted-foreground">{count} ({pct}%)</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        }

        // Open-ended
        return (
          <div key={q.id} className="space-y-2">
            <p className="text-sm font-medium">{q.question_text}</p>
            {qResponses.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No responses yet</p>
            ) : (
              <div className="space-y-1.5">
                {qResponses.map((r: any) => (
                  <div key={r.id} className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                    <p>{r.answer_text || <span className="italic text-muted-foreground">—</span>}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {r.respondent?.full_name ?? "Anonymous"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Employee response form ────────────────────────────────────────────────────
function ResponseForm({
  post,
  questions,
  employeeId,
}: {
  post: BulletinPost;
  questions: BulletinQuestion[];
  employeeId: string;
}) {
  const submitResponses = useSubmitResponses();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  const setAnswer = (questionId: string, value: string) =>
    setAnswers((a) => ({ ...a, [questionId]: value }));

  const handleSubmit = async () => {
    // Validate required
    for (const q of questions) {
      if (!answers[q.id]?.trim()) {
        toast.error("Please answer all questions before submitting");
        return;
      }
    }

    try {
      await submitResponses.mutateAsync({
        postId: post.id,
        respondentId: employeeId,
        answers: questions.map((q) => ({
          questionId: q.id,
          answerText: q.type === "open_ended" ? answers[q.id] : undefined,
          answerOption: q.type === "multiple_choice" ? answers[q.id] : undefined,
        })),
      });
      setSubmitted(true);
      toast.success("Response submitted — thanks!");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  if (submitted) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 dark:bg-green-950/30 dark:border-green-800 px-4 py-3 text-sm text-green-700 dark:text-green-400">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        Your response has been recorded. Thank you!
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {questions.map((q, i) => (
        <div key={q.id} className="space-y-2">
          <p className="text-sm font-medium">
            {i + 1}. {q.question_text}
          </p>
          {q.type === "multiple_choice" && q.options ? (
            <div className="space-y-1.5">
              {q.options.map((opt) => (
                <label
                  key={opt}
                  className="flex items-center gap-3 rounded-md border px-3 py-2.5 cursor-pointer hover:bg-muted/50 transition-colors"
                >
                  <input
                    type="radio"
                    name={q.id}
                    value={opt}
                    checked={answers[q.id] === opt}
                    onChange={() => setAnswer(q.id, opt)}
                    className="accent-primary"
                  />
                  <span className="text-sm">{opt}</span>
                </label>
              ))}
            </div>
          ) : (
            <Textarea
              value={answers[q.id] ?? ""}
              onChange={(e) => setAnswer(q.id, e.target.value)}
              placeholder="Your answer…"
              rows={3}
            />
          )}
        </div>
      ))}

      <Button
        onClick={handleSubmit}
        disabled={submitResponses.isPending}
        className="w-full gap-1.5"
      >
        <CheckCircle2 className="h-4 w-4" />
        {submitResponses.isPending ? "Submitting…" : "Submit response"}
      </Button>
    </div>
  );
}

// ── Main QuestionnaireCard ────────────────────────────────────────────────────
export function QuestionnaireCard({
  post,
  employeeId,
  isLeadership,
}: {
  post: BulletinPost;
  employeeId: string | null;
  isLeadership: boolean;
}) {
  const { data: questions = [] } = useQuestionsForPost(post.id);
  const { data: myResponses = {} } = useMyResponsesForPost(post.id);
  const [showResults, setShowResults] = useState(false);

  const hasResponded = questions.length > 0 && questions.every((q) => myResponses[q.id]);

  return (
    <Card className="border-blue-200/60 dark:border-blue-800/40">
      <CardContent className="pt-4 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <ClipboardList className="h-4 w-4 text-blue-500 shrink-0" />
              <span className="font-semibold">{post.title}</span>
              <Badge variant="secondary" className="text-xs">Survey</Badge>
              {hasResponded && (
                <span className="flex items-center gap-1 text-xs text-green-600">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Responded
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {timeAgo(post.published_at)}
              {post.author_name && <> · {post.author_name}</>}
              {post.expires_at && (
                <> · closes {formatDateUSShort(post.expires_at)}</>
              )}
            </p>
          </div>

          {/* Results toggle for managers */}
          {isLeadership && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1 text-xs shrink-0"
              onClick={() => setShowResults((v) => !v)}
            >
              <Users className="h-3.5 w-3.5" />
              Results
              {showResults ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </Button>
          )}
        </div>

        {/* Intro text */}
        {post.body && <p className="text-sm text-muted-foreground">{post.body}</p>}

        {/* Manager: results panel */}
        {isLeadership && showResults && (
          <ResultsPanel post={post} questions={questions} />
        )}

        {/* Employee: response form or already-responded state */}
        {!isLeadership && employeeId && (
          hasResponded ? (
            <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
              <CheckCircle2 className="h-4 w-4" />
              You already responded to this survey.
            </div>
          ) : (
            <ResponseForm post={post} questions={questions} employeeId={employeeId} />
          )
        )}

        {/* Leadership: still show the response form preview (their own) below results */}
        {isLeadership && !hasResponded && employeeId && (
          <details className="text-xs text-muted-foreground cursor-pointer">
            <summary>Fill out as participant</summary>
            <div className="pt-3">
              <ResponseForm post={post} questions={questions} employeeId={employeeId} />
            </div>
          </details>
        )}
      </CardContent>
    </Card>
  );
}

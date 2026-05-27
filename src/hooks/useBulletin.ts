import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserProfile } from "@/hooks/useUserProfile";

export type QuestionType = "multiple_choice" | "open_ended";

export type BulletinQuestion = {
  id: string;
  post_id: string;
  question_text: string;
  type: QuestionType;
  options: string[] | null;
  sort_order: number;
};

export type BulletinResponse = {
  id: string;
  post_id: string;
  question_id: string;
  respondent_id: string;
  answer_text: string | null;
  answer_option: string | null;
  created_at: string;
};

export type BulletinPost = {
  id: string;
  type: "announcement" | "questionnaire" | "recognition";
  title: string;
  body: string;
  author_id: string | null;
  campaign_id: string | null;
  recognized_employee_id: string | null;
  requires_ack: boolean;
  is_published: boolean;
  published_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  // joined
  author_name?: string | null;
  recognized_employee_name?: string | null;
};

export type BulletinAck = {
  id: string;
  post_id: string;
  employee_id: string;
  acked_at: string;
};

const POST_SELECT = "*, author:author_id(full_name), recognized:recognized_employee_id(full_name)";

function mapPost(p: any): BulletinPost {
  return {
    ...p,
    author_name: p.author?.full_name ?? null,
    recognized_employee_name: p.recognized?.full_name ?? null,
  };
}

// ── Fetch: published posts for the current user (employee feed) ──────────────
export function usePublishedPosts() {
  return useQuery({
    queryKey: ["bulletin_posts", "published"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bulletin_posts")
        .select(POST_SELECT)
        .eq("is_published", true)
        .order("published_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map(mapPost) as BulletinPost[];
    },
  });
}

// ── Fetch: ALL posts (drafts + published) for management view ────────────────
export function useAllPosts() {
  return useQuery({
    queryKey: ["bulletin_posts", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bulletin_posts")
        .select(POST_SELECT)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map(mapPost) as BulletinPost[];
    },
  });
}

// ── Fetch: most recent published recognition (Employee of the Month) ──────────
export function useCurrentRecognition() {
  return useQuery({
    queryKey: ["bulletin_posts", "recognition", "current"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bulletin_posts")
        .select(POST_SELECT)
        .eq("type", "recognition")
        .eq("is_published", true)
        .order("published_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ? mapPost(data) : null;
    },
  });
}

// ── Fetch: all published recognitions (history list) ─────────────────────────
export function useRecognitionHistory() {
  return useQuery({
    queryKey: ["bulletin_posts", "recognition", "history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bulletin_posts")
        .select(POST_SELECT)
        .eq("type", "recognition")
        .eq("is_published", true)
        .order("published_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map(mapPost) as BulletinPost[];
    },
  });
}

// ── Mutation: create + immediately publish an Employee of the Month post ──────
export function useCreateRecognition() {
  const qc = useQueryClient();
  const { employeeId } = useAuth();
  // organization_id is NOT NULL on bulletin_posts — see H-2.
  const { organizationId } = useUserProfile();
  return useMutation({
    mutationFn: async (payload: {
      recognizedEmployeeId: string;
      recognizedName: string;
      reason: string;
      monthLabel: string; // e.g. "May 2026"
    }) => {
      if (!organizationId) {
        throw new Error("Cannot create post: missing organization_id on your profile.");
      }
      const { data, error } = await supabase
        .from("bulletin_posts")
        .insert({
          type: "recognition",
          title: `Employee of the Month — ${payload.monthLabel}`,
          body: payload.reason,
          recognized_employee_id: payload.recognizedEmployeeId,
          author_id: employeeId ?? null,
          requires_ack: false,
          is_published: true,
          published_at: new Date().toISOString(),
          organization_id: organizationId,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bulletin_posts"] });
    },
  });
}

// ── Fetch: which posts the current employee has already acked ────────────────
export function useMyAcks() {
  return useQuery({
    queryKey: ["bulletin_acks", "mine"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bulletin_acks")
        .select("post_id");
      if (error) throw error;
      // Return a Set of post_ids for O(1) lookup
      return new Set((data ?? []).map((a: any) => a.post_id as string));
    },
  });
}

// ── Fetch: ack list for a specific post (managers — who has/hasn't read) ─────
export function usePostAcks(postId: string | null) {
  return useQuery({
    queryKey: ["bulletin_acks", "post", postId],
    enabled: !!postId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bulletin_acks")
        .select("*, employee:employee_id(full_name, employee_id)")
        .eq("post_id", postId!);
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ── Mutation: create a draft post ────────────────────────────────────────────
export function useCreatePost() {
  const qc = useQueryClient();
  const { employeeId } = useAuth();
  // organization_id is NOT NULL on bulletin_posts — see H-2.
  const { organizationId } = useUserProfile();
  return useMutation({
    mutationFn: async (payload: {
      title: string;
      body: string;
      requires_ack: boolean;
      campaign_id?: string | null;
      expires_at?: string | null;
    }) => {
      if (!organizationId) {
        throw new Error("Cannot create post: missing organization_id on your profile.");
      }
      const { data, error } = await supabase
        .from("bulletin_posts")
        .insert({
          type: "announcement",
          title: payload.title,
          body: payload.body,
          requires_ack: payload.requires_ack,
          campaign_id: payload.campaign_id ?? null,
          expires_at: payload.expires_at ?? null,
          author_id: employeeId ?? null,
          is_published: false,
          organization_id: organizationId,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bulletin_posts"] });
    },
  });
}

// ── Mutation: publish (or unpublish) a post ──────────────────────────────────
export function usePublishPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, publish }: { id: string; publish: boolean }) => {
      const { error } = await supabase
        .from("bulletin_posts")
        .update({
          is_published: publish,
          published_at: publish ? new Date().toISOString() : null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bulletin_posts"] });
    },
  });
}

// ── Mutation: delete a post ──────────────────────────────────────────────────
export function useDeletePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("bulletin_posts")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bulletin_posts"] });
    },
  });
}

// ── Mutation: acknowledge a post ─────────────────────────────────────────────
export function useAcknowledgePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      postId,
      employeeId,
    }: {
      postId: string;
      employeeId: string;
    }) => {
      const { error } = await supabase
        .from("bulletin_acks")
        .insert({ post_id: postId, employee_id: employeeId });
      if (error && !error.message.includes("duplicate")) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bulletin_acks"] });
    },
  });
}

// ────────────────────────────────────────────────────────────────────────────
// QUESTIONNAIRE HOOKS
// ────────────────────────────────────────────────────────────────────────────

// ── Fetch: questions for a post ──────────────────────────────────────────────
export function useQuestionsForPost(postId: string | null) {
  return useQuery({
    queryKey: ["bulletin_questions", postId],
    enabled: !!postId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bulletin_questions")
        .select("*")
        .eq("post_id", postId!)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as BulletinQuestion[];
    },
  });
}

// ── Fetch: all responses for a post (managers — results view) ────────────────
export function useResponsesForPost(postId: string | null) {
  return useQuery({
    queryKey: ["bulletin_responses", "post", postId],
    enabled: !!postId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bulletin_responses")
        .select("*, respondent:respondent_id(full_name)")
        .eq("post_id", postId!);
      if (error) throw error;
      return (data ?? []) as (BulletinResponse & { respondent?: { full_name: string } })[];
    },
  });
}

// ── Fetch: current employee's responses for a post ───────────────────────────
export function useMyResponsesForPost(postId: string | null) {
  return useQuery({
    queryKey: ["bulletin_responses", "mine", postId],
    enabled: !!postId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bulletin_responses")
        .select("question_id, answer_text, answer_option")
        .eq("post_id", postId!);
      if (error) throw error;
      // Keyed by question_id for O(1) lookup
      return Object.fromEntries(
        (data ?? []).map((r: any) => [r.question_id, r])
      ) as Record<string, { answer_text: string | null; answer_option: string | null }>;
    },
  });
}

// ── Mutation: create questionnaire post + questions in one shot ───────────────
export function useCreateQuestionnaire() {
  const qc = useQueryClient();
  const { employeeId } = useAuth();
  // organization_id is NOT NULL on bulletin_posts — see H-2.
  const { organizationId } = useUserProfile();
  return useMutation({
    mutationFn: async (payload: {
      title: string;
      body: string;
      campaign_id?: string | null;
      expires_at?: string | null;
      publish: boolean;
      questions: { question_text: string; type: QuestionType; options: string[] | null }[];
    }) => {
      if (!organizationId) {
        throw new Error("Cannot create questionnaire: missing organization_id on your profile.");
      }
      // 1. Create the post
      const { data: post, error: postErr } = await supabase
        .from("bulletin_posts")
        .insert({
          type: "questionnaire",
          title: payload.title,
          body: payload.body,
          author_id: employeeId ?? null,
          campaign_id: payload.campaign_id ?? null,
          expires_at: payload.expires_at ?? null,
          requires_ack: false,
          is_published: payload.publish,
          published_at: payload.publish ? new Date().toISOString() : null,
          organization_id: organizationId,
        })
        .select()
        .single();
      if (postErr) throw postErr;

      // 2. Insert all questions
      if (payload.questions.length > 0) {
        const rows = payload.questions.map((q, i) => ({
          post_id: post.id,
          question_text: q.question_text,
          type: q.type,
          options: q.type === "multiple_choice" ? q.options : null,
          sort_order: i,
        }));
        const { error: qErr } = await supabase.from("bulletin_questions").insert(rows);
        if (qErr) throw qErr;
      }

      return post;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bulletin_posts"] });
      qc.invalidateQueries({ queryKey: ["bulletin_questions"] });
    },
  });
}

// ── Mutation: submit all responses for a questionnaire at once ───────────────
export function useSubmitResponses() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      postId: string;
      respondentId: string;
      answers: { questionId: string; answerText?: string; answerOption?: string }[];
    }) => {
      const rows = payload.answers.map((a) => ({
        post_id: payload.postId,
        question_id: a.questionId,
        respondent_id: payload.respondentId,
        answer_text: a.answerText ?? null,
        answer_option: a.answerOption ?? null,
      }));
      const { error } = await supabase.from("bulletin_responses").insert(rows);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["bulletin_responses", "mine", vars.postId] });
      qc.invalidateQueries({ queryKey: ["bulletin_responses", "post", vars.postId] });
    },
  });
}

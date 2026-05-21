import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

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
  return useMutation({
    mutationFn: async (payload: {
      recognizedEmployeeId: string;
      recognizedName: string;
      reason: string;
      monthLabel: string; // e.g. "May 2026"
    }) => {
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
  return useMutation({
    mutationFn: async (payload: {
      title: string;
      body: string;
      requires_ack: boolean;
      campaign_id?: string | null;
      expires_at?: string | null;
    }) => {
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

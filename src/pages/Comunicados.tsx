import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  useAllPosts,
  usePublishedPosts,
  useMyAcks,
  usePostAcks,
  useCreatePost,
  usePublishPost,
  useDeletePost,
  useAcknowledgePost,
  BulletinPost,
} from "@/hooks/useBulletin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Megaphone,
  Plus,
  Send,
  Eye,
  EyeOff,
  Trash2,
  CheckCircle2,
  Clock,
  Users,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { formatDistanceToNow, format } from "date-fns";

// ── Helpers ──────────────────────────────────────────────────────────────────
function timeAgo(iso: string | null) {
  if (!iso) return "—";
  return formatDistanceToNow(new Date(iso), { addSuffix: true });
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return format(new Date(iso), "MMM d, yyyy");
}

// ── AckStatus — expandable list of who has/hasn't read ───────────────────────
function AckStatus({ postId, totalExpected }: { postId: string; totalExpected?: number }) {
  const [open, setOpen] = useState(false);
  const { data: acks = [] } = usePostAcks(open ? postId : null);

  return (
    <div className="text-xs text-muted-foreground">
      <button
        className="flex items-center gap-1 hover:text-foreground transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <Users className="h-3.5 w-3.5" />
        {acks.length} acknowledged
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>
      {open && acks.length > 0 && (
        <div className="mt-1.5 space-y-0.5 pl-1">
          {acks.map((a: any) => (
            <div key={a.id} className="flex items-center gap-2">
              <CheckCircle2 className="h-3 w-3 text-green-500" />
              <span>{a.employee?.full_name ?? "—"}</span>
              <span className="text-muted-foreground/60">{timeAgo(a.acked_at)}</span>
            </div>
          ))}
        </div>
      )}
      {open && acks.length === 0 && (
        <p className="mt-1 pl-1 italic">No one has acknowledged yet.</p>
      )}
    </div>
  );
}

// ── Management post card ──────────────────────────────────────────────────────
function ManagementPostCard({ post }: { post: BulletinPost }) {
  const publish = usePublishPost();
  const del = useDeletePost();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handlePublish = () => {
    publish.mutate(
      { id: post.id, publish: !post.is_published },
      {
        onSuccess: () =>
          toast.success(post.is_published ? "Post unpublished" : "Post published — staff can see it now"),
        onError: (e: any) => toast.error(e.message),
      }
    );
  };

  const handleDelete = () => {
    del.mutate(post.id, {
      onSuccess: () => toast.success("Post deleted"),
      onError: (e: any) => toast.error(e.message),
    });
    setConfirmDelete(false);
  };

  return (
    <Card>
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-0.5 flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold truncate">{post.title}</span>
              {post.is_published ? (
                <Badge variant="default" className="text-xs">Published</Badge>
              ) : (
                <Badge variant="secondary" className="text-xs">Draft</Badge>
              )}
              {post.requires_ack && (
                <Badge variant="outline" className="text-xs">Requires ack</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {post.is_published
                ? <>Published {timeAgo(post.published_at)}</>
                : <>Created {timeAgo(post.created_at)}</>}
              {post.author_name && <> · by {post.author_name}</>}
              {post.expires_at && <> · expires {fmtDate(post.expires_at)}</>}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5"
              onClick={handlePublish}
              disabled={publish.isPending}
            >
              {post.is_published ? (
                <><EyeOff className="h-3.5 w-3.5" /> Unpublish</>
              ) : (
                <><Send className="h-3.5 w-3.5" /> Publish</>
              )}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-destructive hover:text-destructive"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {post.body && (
          <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-3">
            {post.body}
          </p>
        )}

        {post.is_published && post.requires_ack && (
          <AckStatus postId={post.id} />
        )}
      </CardContent>

      {/* Delete confirmation */}
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete this post?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            "{post.title}" will be permanently removed, including all acknowledgements.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={del.isPending}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ── Employee announcement card ────────────────────────────────────────────────
function AnnouncementCard({
  post,
  acked,
  employeeId,
}: {
  post: BulletinPost;
  acked: boolean;
  employeeId: string | null;
}) {
  const acknowledge = useAcknowledgePost();

  const handleAck = () => {
    if (!employeeId) return;
    acknowledge.mutate(
      { postId: post.id, employeeId },
      {
        onSuccess: () => toast.success("Marked as read"),
        onError: (e: any) => toast.error(e.message),
      }
    );
  };

  return (
    <Card className={acked ? "opacity-70" : "border-primary/40"}>
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <Megaphone className="h-4 w-4 text-primary shrink-0" />
              <span className="font-semibold">{post.title}</span>
              {acked && (
                <span className="flex items-center gap-1 text-xs text-green-600">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Read
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {timeAgo(post.published_at)}
              {post.author_name && <> · {post.author_name}</>}
              {post.expires_at && <> · expires {fmtDate(post.expires_at)}</>}
            </p>
          </div>
        </div>

        {post.body && (
          <p className="text-sm whitespace-pre-wrap">{post.body}</p>
        )}

        {post.requires_ack && !acked && (
          <Button
            size="sm"
            className="gap-1.5"
            onClick={handleAck}
            disabled={acknowledge.isPending}
          >
            <CheckCircle2 className="h-4 w-4" />
            I've read this
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// ── Create post dialog ────────────────────────────────────────────────────────
function CreatePostDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const createPost = useCreatePost();
  const publishPost = usePublishPost();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [requiresAck, setRequiresAck] = useState(true);
  const [expiresAt, setExpiresAt] = useState("");

  const reset = () => {
    setTitle("");
    setBody("");
    setRequiresAck(true);
    setExpiresAt("");
  };

  const handleSave = async (andPublish: boolean) => {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    try {
      const post = await createPost.mutateAsync({
        title: title.trim(),
        body: body.trim(),
        requires_ack: requiresAck,
        expires_at: expiresAt || null,
      });
      if (andPublish) {
        await publishPost.mutateAsync({ id: post.id, publish: true });
        toast.success("Announcement published — staff can see it now");
      } else {
        toast.success("Saved as draft");
      }
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const busy = createPost.isPending || publishPost.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) { reset(); onOpenChange(v); } }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New Announcement</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="grid gap-2">
            <Label>Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Updated attendance policy"
              autoFocus
            />
          </div>
          <div className="grid gap-2">
            <Label>Message</Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write the announcement here…"
              rows={5}
            />
          </div>
          <div className="grid gap-2">
            <Label>Expires on <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              After this date the post disappears from the employee feed. Leave blank to keep it indefinitely.
            </p>
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Require acknowledgement</p>
              <p className="text-xs text-muted-foreground">Employees must click "I've read this" to dismiss</p>
            </div>
            <Switch checked={requiresAck} onCheckedChange={setRequiresAck} />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => handleSave(false)} disabled={busy}>
            <Clock className="h-4 w-4 mr-1.5" />
            Save as draft
          </Button>
          <Button onClick={() => handleSave(true)} disabled={busy}>
            <Send className="h-4 w-4 mr-1.5" />
            {busy ? "Publishing…" : "Publish now"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Comunicados() {
  const { isManager, isAdmin, isOwner, employeeId } = useAuth();
  const isLeadership = isManager || isAdmin || isOwner;

  const { data: allPosts = [], isLoading: loadingAll } = useAllPosts();
  const { data: publishedPosts = [], isLoading: loadingPublished } = usePublishedPosts();
  const { data: myAcks = new Set<string>() } = useMyAcks();

  const [createOpen, setCreateOpen] = useState(false);
  const [mgmtView, setMgmtView] = useState<"all" | "published" | "drafts">("all");

  const filteredMgmt = allPosts.filter((p) => {
    if (mgmtView === "published") return p.is_published;
    if (mgmtView === "drafts") return !p.is_published;
    return true;
  });

  const unreadCount = publishedPosts.filter(
    (p) => p.requires_ack && !myAcks.has(p.id)
  ).length;

  return (
    <div className="max-w-3xl mx-auto space-y-6 p-4 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Megaphone className="h-6 w-6 text-primary" />
            Announcements
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isLeadership
              ? "Manage and publish announcements to your team"
              : unreadCount > 0
              ? `${unreadCount} unread announcement${unreadCount > 1 ? "s" : ""}`
              : "You're all caught up"}
          </p>
        </div>
        {isLeadership && (
          <Button onClick={() => setCreateOpen(true)} className="gap-1.5 shrink-0">
            <Plus className="h-4 w-4" />
            New
          </Button>
        )}
      </div>

      {/* ── Leadership view ── */}
      {isLeadership && (
        <div className="space-y-4">
          {/* Filter tabs */}
          <div className="flex gap-1 bg-muted rounded-lg p-1 w-fit">
            {(["all", "published", "drafts"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setMgmtView(v)}
                className={`px-3 py-1 rounded-md text-sm font-medium capitalize transition-colors ${
                  mgmtView === v
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {v}
              </button>
            ))}
          </div>

          {loadingAll ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : filteredMgmt.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground text-sm">
                No {mgmtView === "all" ? "" : mgmtView} posts yet.{" "}
                <button className="underline" onClick={() => setCreateOpen(true)}>
                  Create one
                </button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredMgmt.map((post) => (
                <ManagementPostCard key={post.id} post={post} />
              ))}
            </div>
          )}

          <Separator />
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
            Employee view preview
          </p>
        </div>
      )}

      {/* ── Employee feed (everyone sees this) ── */}
      {loadingPublished ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : publishedPosts.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground text-sm">
            No announcements right now.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {publishedPosts.map((post) => (
            <AnnouncementCard
              key={post.id}
              post={post}
              acked={myAcks.has(post.id)}
              employeeId={employeeId}
            />
          ))}
        </div>
      )}

      <CreatePostDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

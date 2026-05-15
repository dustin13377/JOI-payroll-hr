import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { initialAuthHash } from "@/lib/initialAuthHash";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

// This page handles BOTH:
//   - Password recovery (forgot-password flow)  → URL hash has `type=recovery`
//   - First-time invite (new hire welcome)      → URL hash has `type=invite` or `type=signup`
// In both cases the user lands here with an active session (set by the magic link)
// and just needs to set a password via supabase.auth.updateUser.
type FlowType = "recovery" | "invite" | null;

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [flowType, setFlowType] = useState<FlowType>(null);
  const navigate = useNavigate();

  useEffect(() => {
    // initialAuthHash was captured at app boot (in main.tsx, before Supabase
    // could clear it). Falls back to live window.location.hash in case the
    // capture happened after Supabase consumed it for some reason.
    const hash = initialAuthHash || window.location.hash;
    if (hash.includes("type=recovery")) {
      setFlowType("recovery");
    } else if (hash.includes("type=invite") || hash.includes("type=signup")) {
      setFlowType("invite");
    }

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setFlowType((prev) => prev ?? "recovery");
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("Passwords don't match");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(
      flowType === "invite"
        ? "Welcome to JOI! Your account is ready."
        : "Password updated successfully"
    );
    navigate("/");
  };

  if (!flowType) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <p className="text-muted-foreground">This link is invalid or has expired.</p>
            <Button className="mt-4" onClick={() => navigate("/auth")}>
              Go to Sign In
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isInvite = flowType === "invite";
  const title = isInvite ? "Welcome to JOI" : "New Password";
  const description = isInvite
    ? "Set a password to finish setting up your account."
    : "Enter your new password";
  const passwordLabel = isInvite ? "Create password" : "New password";
  const buttonLabel = isInvite ? "Set Password & Continue" : "Update Password";

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">{passwordLabel}</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirm password</Label>
              <Input
                id="confirm"
                type="password"
                placeholder="••••••••"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={loading || password.length < 6 || password !== confirm}
            >
              {loading ? "Saving..." : buttonLabel}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

// Note: Self-service signup is intentionally disabled. JOI is invite-only —
// new accounts are provisioned via the create-employee edge function. The
// signUp() code path was removed 2026-05-27 to close audit finding C-1
// (defense-in-depth: even if Supabase Auth signups are accidentally re-enabled
// at the project level, the UI no longer exposes a way to use them).

// Personal email domains we soft-warn on during password reset. The reset link
// only works for the email on file in JOI (the user's work email), so sending
// to a personal address is almost always a user mistake. Added 2026-05-29
// after Osbaldo tried resetting via his gmail.
const PERSONAL_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "msn.com",
  "yahoo.com",
  "yahoo.com.mx",
  "ymail.com",
  "icloud.com",
  "me.com",
  "aol.com",
  "protonmail.com",
  "proton.me",
]);

function looksPersonal(email: string): boolean {
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  return PERSONAL_EMAIL_DOMAINS.has(email.slice(at + 1).trim().toLowerCase());
}

export default function Auth() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [showPersonalEmailWarning, setShowPersonalEmailWarning] = useState(false);

  // Actually fires the reset request. Pulled out so the AlertDialog confirm
  // can call it after the user acknowledges the warning.
  const sendReset = async () => {
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Check your email to reset your password");
      setShowReset(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (showReset) {
      // Soft-warn before sending to a personal-looking domain. User can still
      // proceed (some legacy accounts use personal addresses), but most of the
      // time this catches the wrong-email mistake.
      if (looksPersonal(email)) {
        setShowPersonalEmailWarning(true);
        return;
      }
      await sendReset();
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) toast.error("Invalid credentials");
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 rounded-xl bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-lg">JOI</span>
          </div>
          <CardTitle className="text-2xl tracking-tight">
            {showReset ? "Reset Password" : "Sign In"}
          </CardTitle>
          <CardDescription>
            {showReset
              ? "Enter your work email to receive a reset link"
              : "Payroll & HR Management System"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder={showReset ? "you@company.com" : "email@example.com"}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="username"
              />
              {showReset && (
                <p className="text-xs text-muted-foreground">
                  Use your <strong>work email</strong> — the one you sign in with.
                  Reset links can't be sent to Gmail, Hotmail, Yahoo, or other
                  personal addresses.
                </p>
              )}
            </div>
            {!showReset && (
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete="current-password"
                />
              </div>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading
                ? "Processing..."
                : showReset
                ? "Send Link"
                : "Sign In"}
            </Button>
          </form>
          <div className="mt-4 text-center text-sm space-y-2">
            {!showReset && (
              <button
                type="button"
                className="text-primary hover:underline block w-full"
                onClick={() => setShowReset(true)}
              >
                Forgot your password?
              </button>
            )}
            {showReset && (
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => setShowReset(false)}
              >
                Back to sign in
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      <AlertDialog
        open={showPersonalEmailWarning}
        onOpenChange={setShowPersonalEmailWarning}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Looks like a personal email</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{email}</strong> looks like a personal email address.
              The reset link will only work if you enter the <strong>work email</strong> you
              use to sign in to JOI (usually ending in your company's domain,
              like <code>@hfbtech.com</code>, <code>@torro.com</code>, or
              <code> @justoutsource.it</code>).
              <br />
              <br />
              If you're not sure what your work email is, ask your team lead
              or HR.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Let me change it</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                setShowPersonalEmailWarning(false);
                await sendReset();
              }}
            >
              Send it anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

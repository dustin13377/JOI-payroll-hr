import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type UserTitle = "owner" | "admin" | "manager" | "team_lead" | "agent";

interface UserProfileData {
  id: string;
  employee_id: string | null;
  client_id: string | null;
  // role mirrors employees.title (kept in sync by trigger). May still hold
  // legacy values like 'employee' until the migration runs.
  // 'client' is set directly by leadership for external client users.
  role: UserTitle | "employee" | "client" | null;
  created_at: string;
}

// Map any legacy/unknown role value to the new title enum.
// Returns null for 'client' — clients are not employees and have no title.
function normalizeTitle(role: string | null | undefined): UserTitle | null {
  if (role === "client") return null;
  if (role === "employee") return "agent";
  if (
    role === "owner" ||
    role === "admin" ||
    role === "manager" ||
    role === "team_lead" ||
    role === "agent"
  ) {
    return role;
  }
  return "agent";
}

// Display label for a title
export function titleLabel(t: UserTitle): string {
  switch (t) {
    case "owner": return "Owner";
    case "admin": return "Admin";
    case "manager": return "Manager";
    case "team_lead": return "Team Lead";
    case "agent": return "Agent";
  }
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
  title: UserTitle | null;
  role: UserTitle | null;
  employeeId: string | null;
  isOwner: boolean;
  isAdmin: boolean;
  isManager: boolean;
  isTeamLead: boolean;
  isAgent: boolean;
  isLeadership: boolean;
  /**
   * True for owner + admin (HR) only. Managers do NOT get this — they can see
   * the HR doc workflow but salary, finiquito amounts, and total-en-letras
   * render as asterisks for them.
   */
  canViewSalary: boolean;
  isEmployee: boolean;
  isClient: boolean;
  clientId: string | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfileData | null>(null);
  // Track which user ID we've loaded the profile for (null = not yet loaded)
  const [profileLoadedForId, setProfileLoadedForId] = useState<string | null>(null);

  // Fetch user profile when user changes
  useEffect(() => {
    if (!user) {
      setProfile(null);
      setProfileLoadedForId(null);
      return;
    }

    // Already loaded for this user
    if (profileLoadedForId === user.id) return;

    let cancelled = false;
    const fetchProfile = async () => {
      try {
        const { data, error } = await supabase
          .from("user_profiles")
          .select("*")
          .eq("id", user.id)
          .single();

        if (cancelled) return;

        if (error) {
          if (error.code !== "PGRST116") {
            console.error("Error fetching user profile:", error);
          }
          setProfile(null);
        } else {
          const p = data as UserProfileData;

          // H1: block inactive (terminated/resigned/on_leave) employees.
          // Clients (role='client') skip this check — they're not on the
          // employees table.
          if (p.role !== "client" && p.employee_id) {
            const { data: emp, error: empErr } = await supabase
              .from("employees")
              .select("employment_status, full_name")
              .eq("id", p.employee_id)
              .maybeSingle();
            if (!cancelled && !empErr && emp && emp.employment_status !== "active") {
              toast.error(
                `This account is ${emp.employment_status.replace("_", " ")} and can't sign in. Talk to your manager if this is wrong.`,
                { duration: 8000 }
              );
              await supabase.auth.signOut();
              setProfile(null);
              return;
            }
          }

          setProfile(p);
        }
      } catch (err) {
        if (cancelled) return;
        console.error("Error fetching user profile:", err);
        setProfile(null);
      } finally {
        if (!cancelled) setProfileLoadedForId(user.id);
      }
    };

    fetchProfile();
    return () => { cancelled = true; };
  }, [user?.id, profileLoadedForId]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const isClient = profile?.role === "client";
  const title: UserTitle | null = profile ? normalizeTitle(profile.role) : null;

  // Leadership = owner + admin + manager. They see the HR doc workflow.
  const isLeadership = title === "owner" || title === "admin" || title === "manager";
  // Salary visibility is narrower than leadership — only owner + admin (HR).
  // Managers see asterisks where amounts would appear.
  const canViewSalary = title === "owner" || title === "admin";

  const value: AuthContextValue = {
    session,
    user,
    loading: loading || (user !== null && profileLoadedForId !== user.id),
    signOut,
    // Title (single source of truth; null for client users)
    title,
    role: title, // alias for back-compat
    employeeId: profile?.employee_id ?? null,
    // Strict title checks
    isOwner: title === "owner",
    isAdmin: title === "admin",
    isManager: title === "manager",
    isTeamLead: title === "team_lead",
    isAgent: title === "agent",
    // Permission tiers (use these for gates)
    isLeadership,
    canViewSalary,
    // Back-compat alias — old code reads isEmployee to mean "regular worker"
    isEmployee: title === "agent",
    // Client portal
    isClient,
    clientId: profile?.client_id ?? null,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}

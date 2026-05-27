import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";

export interface UserProfile {
  id: string;
  employee_id: string | null;
  organization_id: string | null;
  role: "owner" | "admin" | "manager" | "team_lead" | "agent" | "employee";
  created_at: string;
}

export interface UserProfileData {
  role: "admin" | "manager" | "employee" | null;
  employeeId: string | null;
  isAdmin: boolean;
  isManager: boolean;
  isEmployee: boolean;
}

export function useUserProfile() {
  const [userId, setUserId] = useState<string | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);

  // First, get the current user session
  useEffect(() => {
    const initSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setUserId(session?.user?.id ?? null);
      setSessionLoading(false);
    };

    initSession();

    // Subscribe to auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
      setSessionLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Fetch user profile from user_profiles table
  const {
    data: profile,
    isLoading: profileLoading,
    error,
  } = useQuery({
    queryKey: ["userProfile", userId],
    enabled: !!userId && !sessionLoading,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_profiles")
        .select("*")
        .eq("id", userId!)
        .single();

      if (error) {
        // If profile doesn't exist, return null (user may not have a profile yet)
        if (error.code === "PGRST116") {
          return null;
        }
        throw error;
      }

      return data as UserProfile;
    },
  });

  const loading = sessionLoading || profileLoading;

  return {
    role: profile?.role ?? null,
    employeeId: profile?.employee_id ?? null,
    // organizationId is required on every INSERT into multi-tenant tables
    // (organization_id is declared NOT NULL on policy_documents, bulletin_posts,
    // company_holidays, employees, etc., with no default). Hooks doing INSERTs
    // should read this and pass it explicitly. See audit finding H-2.
    organizationId: profile?.organization_id ?? null,
    isAdmin: profile?.role === "admin",
    isManager: profile?.role === "manager",
    isEmployee: profile?.role === "employee",
    loading,
    error: error as Error | null,
  };
}

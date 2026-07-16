import { useEffect, useRef, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import testHtml from "./skills-test.html?raw";

type Phase = "loading" | "ready" | "done" | "already" | "error";

function Screen({ children }: { children: ReactNode }) {
  return (
    <div style={{ position: "fixed", inset: 0, display: "grid", placeItems: "center", background: "#0f1c2c", color: "#fff", fontFamily: "Manrope, system-ui, sans-serif", padding: 24, textAlign: "center" }}>
      <div style={{ maxWidth: 420, fontSize: 18, lineHeight: 1.5 }}>{children}</div>
    </div>
  );
}

export default function SkillsTest() {
  const { token } = useParams<{ token: string }>();
  const [phase, setPhase] = useState<Phase>("loading");
  const [firstName, setFirstName] = useState<string | null>(null);
  const submitted = useRef(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!token) { setPhase("error"); return; }
      const { data, error } = await supabase.functions.invoke("skills-assessment", { body: { token, action: "load" } });
      if (!active) return;
      if (error || !data) { setPhase("error"); return; }
      if (data.done) { setPhase("already"); return; }
      setFirstName(data.firstName ?? null);
      setPhase("ready");
      supabase.functions.invoke("skills-assessment", { body: { token, action: "start" } });
    })();
    return () => { active = false; };
  }, [token]);

  useEffect(() => {
    function onMsg(e: MessageEvent) {
      const d = e.data;
      if (!d || d.type !== "joi-skills-result" || submitted.current) return;
      submitted.current = true;
      supabase.functions
        .invoke("skills-assessment", { body: { token, action: "submit", results: d.results, totalSeconds: d.totalSeconds } })
        .finally(() => setPhase("done"));
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [token]);

  if (phase === "loading") return <Screen>Cargando…</Screen>;
  if (phase === "error") return <Screen>Este enlace no es válido o ya expiró. Pídele uno nuevo a tu reclutador.</Screen>;
  if (phase === "already") return <Screen>Esta prueba ya fue completada. ¡Gracias!</Screen>;
  if (phase === "done") return <Screen>¡Listo! Tus respuestas se guardaron. Gracias{firstName ? `, ${firstName}` : ""}. Ya puedes cerrar esta ventana.</Screen>;

  const html = testHtml.replace(/__FIRST_NAME__/g, firstName ?? "");
  return <iframe title="Prueba de habilidades JOI" srcDoc={html} style={{ position: "fixed", inset: 0, width: "100%", height: "100%", border: "none" }} />;
}

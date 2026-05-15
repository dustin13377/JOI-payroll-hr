// IMPORTANT: this MUST be the first import so we capture window.location.hash
// before the Supabase client's `detectSessionInUrl` clears it.
import "./lib/initialAuthHash";

import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

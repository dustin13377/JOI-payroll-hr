## graphify

This project has a graphify knowledge graph at graphify-out/.

Interactive view: open graphify-out/graph.html in a browser. To (re)build the full graph, type `/graphify .` in your AI assistant from the project root — graphify 0.9.x has no `graphify build` command. Headless equivalent: `graphify extract .` with an LLM API key set.

Rules:
- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- For cross-module "how does X relate to Y" questions, prefer `graphify query "<question>"`, `graphify path "<A>" "<B>"`, or `graphify explain "<concept>"` over grep — these traverse the graph's EXTRACTED + INFERRED edges instead of scanning files
- After modifying code files in this session, run `graphify update .` to keep the graph current (AST-only, no API cost). SQL migration files need the SQL extra once: `uv tool install "graphifyy[sql]"`, then `graphify update .`.

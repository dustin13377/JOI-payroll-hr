/**
 * One-off backlog recovery: fetch failed inbound messages from Postmark and
 * re-POST each to our inbound-application Edge Function.
 *
 * Pulls credentials from macOS Keychain (no secrets in chat / files / argv).
 * Idempotent — our function dedupes by CURP, so re-runs are safe.
 *
 * Usage:
 *   npx tsx scripts/replay-postmark-inbound.ts [fromdate]
 *
 * fromdate defaults to 2026-05-30 (start of the silence window).
 *
 * Env it expects in Keychain (account="apex"):
 *   POSTMARK_SERVER_TOKEN  — server-level API token from Postmark dashboard
 *   POSTMARK_INBOUND_SECRET — shared secret for our function's URL
 */
import { execSync } from "node:child_process";

const FUNCTION_URL_BASE =
  "https://jpaihltkrohdqkqlbqkf.supabase.co/functions/v1/inbound-application";
const POSTMARK_API = "https://api.postmarkapp.com";
const FROM_DATE = process.argv[2] || "2026-05-30";

function keychain(service: string): string {
  return execSync(
    `security find-generic-password -a apex -s ${service} -w`,
    { encoding: "utf8" }
  ).trim();
}

interface InboundMessageSummary {
  MessageID: string;
  Subject: string;
  From: string;
  Date: string;
  Status: string;
}
interface InboundListResponse {
  TotalCount: number;
  InboundMessages: InboundMessageSummary[];
}
interface InboundMessageDetails {
  MessageID: string;
  From: string;
  Subject: string;
  TextBody?: string;
  HtmlBody?: string;
  Date: string;
}

const STATUSES = ["scheduled", "failed", "blocked", "processed"];

async function fetchMessageList(token: string): Promise<InboundMessageSummary[]> {
  const seen = new Map<string, InboundMessageSummary>();
  for (const status of STATUSES) {
    let offset = 0;
    const pageSize = 500;
    let pageCount = 0;
    while (pageCount < 20) {
      const url = `${POSTMARK_API}/messages/inbound?count=${pageSize}&offset=${offset}&fromdate=${FROM_DATE}&status=${status}`;
      const res = await fetch(url, {
        headers: {
          "X-Postmark-Server-Token": token,
          Accept: "application/json",
        },
      });
      if (!res.ok) {
        console.log(`  status=${status}: skipped (${res.status})`);
        break;
      }
      const data = (await res.json()) as InboundListResponse;
      let added = 0;
      for (const m of data.InboundMessages) {
        if (!seen.has(m.MessageID)) {
          seen.set(m.MessageID, m);
          added++;
        }
      }
      console.log(`  status=${status} offset=${offset}: +${added} new (returned ${data.InboundMessages.length}, total in account: ${data.TotalCount})`);
      // Postmark may cap response size below `count`; advance by actual length.
      if (data.InboundMessages.length === 0) break;
      offset += data.InboundMessages.length;
      pageCount++;
      // If TotalCount tells us we've gotten them all, stop.
      if (offset >= data.TotalCount) break;
    }
  }
  return Array.from(seen.values()).sort((a, b) => a.Date.localeCompare(b.Date));
}

async function fetchMessageDetails(
  token: string,
  messageId: string,
): Promise<InboundMessageDetails> {
  const res = await fetch(
    `${POSTMARK_API}/messages/inbound/${messageId}/details`,
    {
      headers: {
        "X-Postmark-Server-Token": token,
        Accept: "application/json",
      },
    },
  );
  if (!res.ok) {
    throw new Error(
      `Details ${messageId} failed: ${res.status} ${await res.text()}`,
    );
  }
  return (await res.json()) as InboundMessageDetails;
}

async function replayToFunction(
  webhookUrl: string,
  payload: { From: string; Subject: string; HtmlBody?: string; TextBody?: string; Date: string },
): Promise<{ status: number; body: string }> {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.text();
  return { status: res.status, body };
}

async function main() {
  const serverToken = keychain("POSTMARK_SERVER_TOKEN");
  const webhookSecret = keychain("POSTMARK_INBOUND_SECRET");
  const webhookUrl = `${FUNCTION_URL_BASE}?secret=${webhookSecret}`;

  console.log(`Fetching inbound messages from ${FROM_DATE}…`);
  const list = await fetchMessageList(serverToken);
  console.log(`Found ${list.length} inbound messages.`);

  let inserted = 0;
  let updated = 0;
  let failed = 0;
  let other = 0;

  for (const [i, msg] of list.entries()) {
    process.stdout.write(
      `[${i + 1}/${list.length}] ${msg.Date} | ${msg.From} | ${msg.Subject.slice(0, 60)}… `,
    );
    try {
      const details = await fetchMessageDetails(serverToken, msg.MessageID);
      const result = await replayToFunction(webhookUrl, {
        From: details.From,
        Subject: details.Subject,
        HtmlBody: details.HtmlBody,
        TextBody: details.TextBody,
        Date: details.Date,
      });

      if (result.status === 200) {
        try {
          const parsed = JSON.parse(result.body);
          if (parsed.action === "inserted") {
            inserted++;
            console.log("✅ inserted");
          } else if (parsed.action === "updated_existing") {
            updated++;
            console.log(`♻️  updated (stage=${parsed.existing_stage})`);
          } else {
            other++;
            console.log(`200 ${result.body.slice(0, 60)}`);
          }
        } catch {
          other++;
          console.log(`200 (unparseable response)`);
        }
      } else {
        failed++;
        console.log(`❌ ${result.status} ${result.body.slice(0, 100)}`);
      }
    } catch (e) {
      failed++;
      console.log(`❌ ${e instanceof Error ? e.message : "unknown"}`);
    }
  }

  console.log("");
  console.log(`Done. inserted=${inserted} updated=${updated} failed=${failed} other=${other}`);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});

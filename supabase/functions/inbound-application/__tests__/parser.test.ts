import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parseApplicationEmail } from "../parser.ts";

const sample = await Deno.readTextFile(
  new URL("../__fixtures__/sample-email.txt", import.meta.url),
);

Deno.test("full_name = 'Jose Guadalupe Tejeda Palacios'", () => {
  assertEquals(
    parseApplicationEmail(sample).full_name,
    "Jose Guadalupe Tejeda Palacios",
  );
});

Deno.test("curp = 'TEPG910127HJCJLD04'", () => {
  assertEquals(parseApplicationEmail(sample).curp, "TEPG910127HJCJLD04");
});

Deno.test("phone = '+526674241679' (WhatsApp + Mexico prefix)", () => {
  assertEquals(parseApplicationEmail(sample).phone, "+526674241679");
});

Deno.test("role_interest = null when POSITION is 'Open'", () => {
  assertEquals(parseApplicationEmail(sample).role_interest, null);
});

Deno.test("english_level_self = 'C2' when ENGLISH LEVEL is 'Native'", () => {
  assertEquals(parseApplicationEmail(sample).english_level_self, "C2");
});

Deno.test(
  "applicant_notes includes extra fields (last company, commute, etc.)",
  () => {
    const notes = parseApplicationEmail(sample).applicant_notes ?? "";
    if (!notes.includes("XO LATEM")) {
      throw new Error(`notes missing last company: ${notes}`);
    }
    if (!notes.includes("45 mins")) {
      throw new Error(`notes missing commute time: ${notes}`);
    }
    if (!notes.includes("18 plus")) {
      throw new Error(`notes missing salary: ${notes}`);
    }
    if (!notes.includes("05/30/2026")) {
      throw new Error(`notes missing start date: ${notes}`);
    }
  },
);

Deno.test("cv_url and presentation_url are populated as separate fields", () => {
  const result = parseApplicationEmail(sample);
  if (!result.cv_url || !result.cv_url.includes("inbound8675775207381710501.pdf")) {
    throw new Error(`cv_url missing or wrong: ${result.cv_url}`);
  }
  if (
    !result.presentation_url ||
    !result.presentation_url.includes("inbound4890886575758467428.mp3")
  ) {
    throw new Error(
      `presentation_url missing or wrong: ${result.presentation_url}`,
    );
  }
});

Deno.test("applicant_notes does NOT contain CV/Presentation URLs", () => {
  const notes = parseApplicationEmail(sample).applicant_notes ?? "";
  if (notes.includes("CV:") || notes.includes("Presentation:")) {
    throw new Error(`notes should not include CV/Presentation lines: ${notes}`);
  }
});

Deno.test("needs_manual_review = false (full_name + phone present)", () => {
  assertEquals(parseApplicationEmail(sample).needs_manual_review, false);
});

Deno.test("parse_warnings is empty for this valid sample", () => {
  assertEquals(parseApplicationEmail(sample).parse_warnings, []);
});

// Synthetic tests for unhappy paths

Deno.test("normalizes 'B2B Appointment Setter' → 'b2b_setter'", () => {
  const html =
    `<strong>POSITION YOU ARE APPLYING FOR</strong></font></td></tr><tr><td></td><td><font>B2B Appointment Setter</font></td>`;
  assertEquals(parseApplicationEmail(html).role_interest, "b2b_setter");
});

Deno.test(
  "normalizes 'Funding Application Activation Specialist' → 'funding_activation'",
  () => {
    const html =
      `<strong>POSITION YOU ARE APPLYING FOR</strong></font></td></tr><tr><td></td><td><font>Funding Application Activation Specialist</font></td>`;
    assertEquals(
      parseApplicationEmail(html).role_interest,
      "funding_activation",
    );
  },
);

Deno.test(
  "normalizes 'Customer Reactivation Specialist' → 'customer_reactivation'",
  () => {
    const html =
      `<strong>POSITION YOU ARE APPLYING FOR</strong></font></td></tr><tr><td></td><td><font>Customer Reactivation Specialist</font></td>`;
    assertEquals(
      parseApplicationEmail(html).role_interest,
      "customer_reactivation",
    );
  },
);

Deno.test("english 'C1' → 'C1'", () => {
  const html =
    `<strong>ENGLISH LEVEL</strong></font></td></tr><tr><td></td><td><font>C1</font></td>`;
  assertEquals(parseApplicationEmail(html).english_level_self, "C1");
});

Deno.test("english 'B2' → 'below_c1'", () => {
  const html =
    `<strong>ENGLISH LEVEL</strong></font></td></tr><tr><td></td><td><font>B2</font></td>`;
  assertEquals(parseApplicationEmail(html).english_level_self, "below_c1");
});

Deno.test("needs_manual_review = true when name and phone both missing", () => {
  const result = parseApplicationEmail(
    "<html><body>random text with no fields</body></html>",
  );
  assertEquals(result.needs_manual_review, true);
  if (result.parse_warnings.length === 0) {
    throw new Error("expected warnings for unparseable email");
  }
});

Deno.test(
  "phone with country code already (+52 prefix in input) is preserved",
  () => {
    const html =
      `<strong>WHATSAPP NUMBER</strong></font></td></tr><tr><td></td><td><font>+52 33 1234 5678</font></td>`;
    assertEquals(parseApplicationEmail(html).phone, "+523312345678");
  },
);

Deno.test(
  "phone with 12 digits starting with 52 (no +) gets + prepended",
  () => {
    const html =
      `<strong>WHATSAPP NUMBER</strong></font></td></tr><tr><td></td><td><font>523312345678</font></td>`;
    assertEquals(parseApplicationEmail(html).phone, "+523312345678");
  },
);

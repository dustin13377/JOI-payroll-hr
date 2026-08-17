import { parseApplicationEmail } from "./parser.ts";
import { email } from "./fixture.mjs";

let fail = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}\n      got:  ${JSON.stringify(got)}${ok ? "" : `\n      want: ${JSON.stringify(want)}`}`);
};

// ---- Case 1: Jonathan Aguilar. Clicked a FUNDING ad, picked SEO Specialist.
const aguilarQuery =
  "?position=Funding+Application+Activation+Specialist&amp;utm_source=fb&amp;utm_medium=paid_social" +
  "&amp;utm_campaign=SAC-E+-+SubmitApplication+-+Job+Applications" +
  "&amp;utm_content=Job+Applications+-+Job+Hunting+-+English_Funding+Activations+Specialist+-+B" +
  "&amp;utm_placement=Facebook_Mobile_Reels&amp;fbclid=IwcGRvZgFleHRuA2Fl";

const aguilar = parseApplicationEmail(email([
  ["FIRST NAME", "Jonathan"],
  ["LAST NAME", "Aguilar"],
  ["Email", '<a href="mailto:j.aguilar@example.com">j.aguilar@example.com</a>'],
  ["WHATSAPP NUMBER", "33 1234 5678"],
  ["POSITION YOU ARE APPLYING FOR", "SEO Specialist"],
  ["ENGLISH LEVEL", "C1"],
  ["CURRICULUM VITAE", '<a href="https://justoutsource.it/cv/aguilar.pdf">aguilar.pdf</a>'],
  ["SALARY EXPECTATION", "25000"],
  ["First Source", "Facebook"],
  ["First Medium", "paid_social"],
  ["First Campaign", "SAC-E - SubmitApplication - Job Applications"],
  ["First Content", "Job Applications - Job Hunting - English_Funding Activations Specialist - B"],
  ["First Channel", "Paid Social"],
  ["First Placement", "Facebook_Mobile_Reels"],
  ["First Landing", "/employment-application/"],
  ["First Query", aguilarQuery],
  ["Last Campaign", "SAC-E - SubmitApplication - Job Applications"],
  ["Last Query", aguilarQuery],
  ["Pageview Count", "5"],
  ["Session Count", "3"],
  ["Touch Path", "Paid Social > Paid Social"],
  ["Time To Conversion", "3d 3h"],
]));

check("aguilar full_name", aguilar.full_name, "Jonathan Aguilar");
check("aguilar email", aguilar.email, "j.aguilar@example.com");
check("aguilar phone E.164", aguilar.phone, "+523312345678");
check("aguilar dropdown (secondary)", aguilar.applied_position, "SEO Specialist");
check("aguilar AD position (primary)", aguilar.attribution.ad_position, "Funding Application Activation Specialist");
check("aguilar ft_source", aguilar.attribution.ft_source, "Facebook");
check("aguilar ft_content", aguilar.attribution.ft_content, "Job Applications - Job Hunting - English_Funding Activations Specialist - B");
check("aguilar ft_channel", aguilar.attribution.ft_channel, "Paid Social");
check("aguilar pageview_count is number", aguilar.attribution.pageview_count, 5);
check("aguilar session_count is number", aguilar.attribution.session_count, 3);
check("aguilar ttc", aguilar.attribution.time_to_conversion, "3d 3h");
check("aguilar cv_url", aguilar.cv_url, "https://justoutsource.it/cv/aguilar.pdf");
check("aguilar mismatch warned", aguilar.parse_warnings.some(w => w.includes('Ad promised')), true);
check("aguilar FIRST NAME not treated as attribution", aguilar.attribution.extra_fields["FIRST NAME"], undefined);
check("aguilar LAST NAME not treated as attribution", aguilar.attribution.extra_fields["LAST NAME"], undefined);

// ---- Case 2: Diego Villa. Generic video ad, NO position= param at all.
const diegoQuery =
  "?utm_source=fb&amp;utm_medium=paid_social&amp;utm_campaign=SAC-E+-+SubmitApplication+-+Job+Applications" +
  "&amp;utm_content=Job+Applications+-+Job+Hunting+-+English_Video+-+We+pay+more+than+anyone+in+Mexico%2C+guaranteed";

const diego = parseApplicationEmail(email([
  ["FIRST NAME", "Diego"],
  ["LAST NAME", "Villa"],
  ["Email", '<a href="mailto:d.villa@example.com">d.villa@example.com</a>'],
  ["WHATSAPP NUMBER", "+52 55 9876 5432"],
  ["POSITION YOU ARE APPLYING FOR", "General Application"],
  ["First Source", "Fb"],
  ["First Content", "Job Applications - Job Hunting - English_Video - We pay more than anyone in Mexico, guaranteed"],
  ["First Query", diegoQuery],
  ["Pageview Count", "7"],
]));

check("diego ad_position is null (no position= in ad)", diego.attribution.ad_position, null);
check("diego dropdown", diego.applied_position, "General Application");
check("diego comma survived url-decode", diego.attribution.ft_content.endsWith("Mexico, guaranteed"), true);
check("diego no mismatch warning", diego.parse_warnings.some(w => w.includes('Ad promised')), false);

// ---- Case 3: pre-snippet email. No attribution fields at all.
const old = parseApplicationEmail(email([
  ["FIRST NAME", "Ana"],
  ["LAST NAME", "Servin"],
  ["Email", '<a href="mailto:a.servin@example.com">a.servin@example.com</a>'],
  ["WHATSAPP NUMBER", "6674241679"],
  ["POSITION YOU ARE APPLYING FOR", "Funding Application Activation Specialist"],
]));
check("legacy ad_position null", old.attribution.ad_position, null);
check("legacy ft_campaign null", old.attribution.ft_campaign, null);
check("legacy extra_fields empty", old.attribution.extra_fields, {});
check("legacy role_interest mapped", old.role_interest, "funding_activation");
check("legacy no crash on missing attribution", typeof old.attribution, "object");

// ---- Case 4: contact-form noise must still be ignorable by the caller.
const noise = parseApplicationEmail(email([["Message", "hello I have a question"]]));
check("noise has no name", noise.full_name, null);
check("noise has no cv", noise.cv_url, null);
check("noise guard would trigger", !noise.full_name && !noise.curp && !noise.phone && !noise.cv_url, true);

// ---- Case 5: unknown attribution field is captured, not dropped.
const future = parseApplicationEmail(email([
  ["FIRST NAME", "Test"],
  ["LAST NAME", "User"],
  ["WHATSAPP NUMBER", "6674241679"],
  ["First Gclid", "abc123"],
  ["First Source", "google"],
]));
check("unknown attribution field captured", future.attribution.extra_fields["FIRST GCLID"], "abc123");


// ============================================================
// Cases added after independent review
// ============================================================

// ---- Case 6: Spanish form. NOMBRE COMPLETO is the FULL name.
const es = parseApplicationEmail(email([
  ["NOMBRE COMPLETO", "Juan Pérez García"],
  ["APELLIDOS", "Pérez García"],
  ["CORREO ELECTRÓNICO", '<a href="mailto:juan.pg@example.com">juan.pg@example.com</a>'],
  ["NÚMERO WHATSAPP", "33 8765 4321"],
  ["VACANTE A LA QUE DESEA POSTULARSE", "Funding Activation,"],
  ["NIVEL DE INGLÉS", "B2"],
  ["CURP", "PEGJ900101HJCRRN09"],
  ["ÚLTIMA COMPAÑÍA PARA LA QUE TRABAJÓ", "Teleperformance"],
  ["EXPECTATIVA SALARIAL", "18000"],
]));
check("es name not duplicated", es.full_name, "Juan Pérez García");
check("es email via mailto", es.email, "juan.pg@example.com");
check("es phone E.164", es.phone, "+523387654321");
check("es role_interest via contains", es.role_interest, "funding_activation");
check("es english B2 -> below_c1", es.english_level_self, "below_c1");
check("es CURP extracted", es.curp, "PEGJ900101HJCRRN09");
check("es notes include last company", es.applicant_notes.includes("Teleperformance"), true);
check("es applicant fields NOT in extra_fields", Object.keys(es.attribution.extra_fields).length, 0);

// Spanish form where the two fields are genuinely first/last (no overlap):
const es2 = parseApplicationEmail(email([
  ["NOMBRE COMPLETO", "María"],
  ["APELLIDOS", "López"],
  ["NÚMERO WHATSAPP", "6671112233"],
]));
check("es2 non-overlapping names concatenated", es2.full_name, "María López");

// ---- Case 7: LAST COMPANY must never leak into attribution extra_fields.
const leak = parseApplicationEmail(email([
  ["FIRST NAME", "Leak"],
  ["LAST NAME", "Check"],
  ["WHATSAPP NUMBER", "6670000001"],
  ["LAST COMPANY YOU WORKED FOR", "Acme Corp SECRET EMPLOYER"],
  ["First Source", "Facebook"],
]));
check("LAST COMPANY not in extra_fields", leak.attribution.extra_fields["LAST COMPANY YOU WORKED FOR"], undefined);
check("LAST COMPANY still in notes", leak.applicant_notes.includes("Acme Corp"), true);

// ---- Case 8: queryParam must not substring-match ad_position=.
const trap = parseApplicationEmail(email([
  ["FIRST NAME", "Trap"],
  ["LAST NAME", "Test"],
  ["WHATSAPP NUMBER", "6670000002"],
  ["First Query", "?ad_position=WRONG+VALUE&amp;utm_source=fb"],
]));
check("ad_position= does not match position", trap.attribution.ad_position, null);

const trapOk = parseApplicationEmail(email([
  ["FIRST NAME", "Trap2"],
  ["LAST NAME", "Test"],
  ["WHATSAPP NUMBER", "6670000003"],
  ["First Query", "?ad_position=WRONG&amp;position=Right+Role"],
]));
check("real position= still matches after ad_position=", trapOk.attribution.ad_position, "Right Role");

// ---- Case 9: malformed percent-encoding must not throw or lose the value.
const mal = parseApplicationEmail(email([
  ["FIRST NAME", "Mal"],
  ["LAST NAME", "Formed"],
  ["WHATSAPP NUMBER", "6670000004"],
  ["First Query", "?position=Broken%2GEncoding+Role"],
]));
check("malformed % does not throw", mal.attribution.ad_position, "Broken%2GEncoding Role");

// ---- Case 10: English level edge cases from review.
const lvl = (v) => parseApplicationEmail(email([
  ["FIRST NAME", "L"], ["LAST NAME", "T"], ["WHATSAPP NUMBER", "6670000005"],
  ["ENGLISH LEVEL", v],
])).english_level_self;
check("'Advanced' is unknown, not below_c1", lvl("Advanced"), "unknown");
check("'Bilingual' is unknown, not below_c1", lvl("Bilingual"), "unknown");
check("'Avanzado' is unknown, not below_c1", lvl("Avanzado"), "unknown");
check("'Nativo' is C2", lvl("Nativo"), "C2");
check("'B2' is below_c1", lvl("B2"), "below_c1");
check("'A1' is below_c1", lvl("A1"), "below_c1");
check("'c1' lowercase is C1", lvl("c1"), "C1");

// ---- Case 11: phone edge cases.
const ph = (v) => parseApplicationEmail(email([
  ["FIRST NAME", "P"], ["LAST NAME", "T"], ["WHATSAPP NUMBER", v],
])).phone;
check("12-digit with 52 prefix", ph("52 667 424 1679"), "+526674241679");
check("garbage phone kept verbatim with warning", ph("call me maybe"), "call me maybe");

// ---- Case 12: invalid email is discarded, not stored.
const bad = parseApplicationEmail(email([
  ["FIRST NAME", "Bad"], ["LAST NAME", "Email"],
  ["WHATSAPP NUMBER", "6670000006"],
  ["Email", "not-an-email"],
]));
check("invalid email discarded", bad.email, null);
check("invalid email warned", bad.parse_warnings.some(w => w.includes("invalid email")), true);

// ---- Case 13: mismatch warning is case/whitespace-insensitive.
const ci = parseApplicationEmail(email([
  ["FIRST NAME", "Case"], ["LAST NAME", "Insensitive"],
  ["WHATSAPP NUMBER", "6670000007"],
  ["POSITION YOU ARE APPLYING FOR", "funding application activation specialist"],
  ["First Query", "?position=Funding+Application++Activation+Specialist"],
]));
check("case/space variant is NOT a mismatch", ci.parse_warnings.some(w => w.includes("Ad promised")), false);

console.log(fail === 0 ? "\nALL PASS" : `\n${fail} FAILURE(S)`);
process.exit(fail === 0 ? 0 : 1);

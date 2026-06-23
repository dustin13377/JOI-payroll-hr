# JOI Break & Lunch Schedule

> ⚠️ **SUPERSEDED (2026-06-23).** The April 2-group matrix below is historical.
> The live schedule is now a **per-employee** model from the June 17 2026 PDF
> (3 lunch groups A/B/C, staggered 15-min break waves), stored in code at
> **`src/lib/breakSchedules.ts`** and surfaced read-only on the Timeclock page
> via `src/components/ScheduleBanner.tsx`. See the "June 2026 per-employee model"
> section at the bottom of this file. The matrix below is kept only for history.

**Source:** `docs/reference/break-schedule-source.pdf` (received 2026-04-22).
**Purpose:** Authoritative break/lunch time matrix per campaign-shift variant. Consumed by Feature B2/B3 Phase 4 (carta/acta editor) for `horario_snapshot`.

Every campaign-shift splits agents into **Group A** and **Group B**, offset 15 minutes apart so coverage is maintained during breaks.

---

## Campaign-shift variants

### SLOC Weekday

| Break | Group A | Group B |
|---|---|---|
| 1st break | 8:30 AM – 8:45 AM | 8:45 AM – 9:00 AM |
| 2nd break | 10:15 AM – 10:30 AM | 10:30 AM – 10:45 AM |
| Lunch | 12:00 PM – 1:00 PM | 1:00 PM – 2:00 PM |
| 3rd break | 3:15 PM – 3:30 PM | 3:30 PM – 3:45 PM |

### MCA

| Break | Group A | Group B |
|---|---|---|
| 1st break | 9:30 AM – 9:45 AM | 9:45 AM – 10:00 AM |
| 2nd break | 11:15 AM – 11:30 AM | 11:30 AM – 11:45 AM |
| Lunch | 12:15 PM – 1:15 PM | 1:15 PM – 2:15 PM |
| 3rd break | 3:30 PM – 3:45 PM | 3:45 PM – 4:00 PM |

### Big Think Capital

| Break | Group A | Group B |
|---|---|---|
| 1st break | 8:30 AM – 8:45 AM | 8:45 AM – 9:00 AM |
| 2nd break | 10:15 AM – 10:30 AM | 10:30 AM – 10:45 AM |
| Lunch | 12:00 PM – 1:00 PM | 1:00 PM – 2:00 PM |
| 3rd break | 3:30 PM – 3:45 PM | 3:45 PM – 4:00 PM |

### HFB

| Break | Group A | Group B |
|---|---|---|
| 1st break | 9:45 AM – 10:00 AM | 10:00 AM – 10:15 AM |
| Lunch | 12:00 PM – 1:00 PM | 1:00 PM – 2:00 PM |
| 2nd break | 3:15 PM – 3:30 PM | 3:30 PM – 3:45 PM |

(Note: HFB has only 2 breaks + lunch — no 3rd break.)

### Torro UW Weekday

| Break | Group A | Group B |
|---|---|---|
| 1st break | 9:30 AM – 9:45 AM | 9:45 AM – 10:00 AM |
| 2nd break | 11:15 AM – 11:30 AM | 11:30 AM – 11:45 AM |
| Lunch | 12:15 PM – 1:15 PM | 1:15 PM – 2:15 PM |
| 3rd break | 3:15 PM – 3:30 PM | 3:30 PM – 3:45 PM |

### Torro UW Weekend

| Break | Group A | Group B |
|---|---|---|
| 1st break | 9:30 AM – 9:45 AM | 9:45 AM – 10:00 AM |
| 2nd break | 11:15 AM – 11:30 AM | 11:30 AM – 11:45 AM |
| Lunch | 12:15 PM – 1:15 PM | 1:15 PM – 2:15 PM |
| 3rd break | 3:15 PM – 3:30 PM | 3:30 PM – 3:45 PM |

### Scoop Weekday

| Break | Group A | Group B |
|---|---|---|
| 1st break | 8:30 AM – 8:45 AM | 8:45 AM – 9:00 AM |
| 2nd break | 10:15 AM – 10:30 AM | 10:30 AM – 10:45 AM |
| Lunch | 12:00 PM – 1:00 PM | 1:00 PM – 2:00 PM |
| 3rd break | — | — |

### Scoop Weekend

| Break | Group A | Group B |
|---|---|---|
| 1st break | 8:30 AM – 8:45 AM | 8:45 AM – 9:00 AM |
| 2nd break | 10:15 AM – 10:30 AM | 10:30 AM – 10:45 AM |
| Lunch | 12:00 PM – 1:00 PM | 1:00 PM – 2:00 PM |
| 3rd break | — | — |

### Scoop Sales

| Break | Group A | Group B |
|---|---|---|
| 1st break | 10:30 AM – 10:45 AM | — |
| 2nd break (staggered) | 12:30 PM – 12:45 PM | — |
| Lunch | 2:00 PM – 3:00 PM | — |

(Note: Scoop Sales appears to have a single Group A schedule in the source PDF — re-confirm with HR if Group B breakdown is needed.)

### SLOC Weekends — Friday

| Break | Group A | Group B |
|---|---|---|
| 1st break | 9:00 AM – 9:15 AM | 9:15 AM – 9:30 AM |
| 2nd break | 11:15 AM – 11:30 AM | 11:30 AM – 11:45 AM |
| Lunch | 1:30 PM – 2:30 PM | 2:30 PM – 3:30 PM |
| 3rd break | 5:15 PM – 5:30 PM | 5:30 PM – 5:45 PM |

### SLOC Weekends — Saturday

| Break | Group A | Group B |
|---|---|---|
| 1st break | 10:30 AM – 10:45 AM | 10:45 AM – 11:00 AM |
| 2nd break | 12:15 PM – 12:30 PM | 12:30 PM – 12:45 PM |
| Lunch | 2:00 PM – 3:00 PM | 3:00 PM – 4:00 PM |
| 3rd break | 5:15 PM – 5:30 PM | 5:30 PM – 5:45 PM |

### SLOC Weekends — Sunday

| Break | Group A | Group B |
|---|---|---|
| 1st break | 10:15 AM – 10:30 AM | 10:30 AM – 10:45 AM |
| 2nd break | 12:00 PM – 12:15 PM | 12:15 PM – 12:30 PM |
| Lunch | 2:00 PM – 3:00 PM | 3:00 PM – 4:00 PM |
| 3rd break | 4:30 PM – 4:45 PM | 4:45 PM – 5:00 PM |

---

## Group assignments (snapshot 2026-04-22)

### SLOC Weekday
- **Group A:** Alex Navarro, Deysi Esperanza, Sebastian Cordova, Lydia Juarez, Danny Torres
- **Group B:** Jose Ham, Alonso Landeros, Sebastian Munoz

### MCA
- **Group A:** Adrian Castillo
- **Group B:** Jorge Channon, Jorge Ibanez, Julie Nuñez

### Big Think Capital
- **Group A:** (Aldo Trujillo)
- **Group B:** Albert Vieyra, Mauricio Gomez, Ruben Curiel

### HFB
- **Group A:** Rafael Ochoa, Aldo Gonzalez
- **Group B:** Sofía Corrales

### Torro UW Weekday
- **Group A:** Jorge Sandoval, Juan Jug
- **Group B:** Mariana Perez, Armando Vazquez

### Torro UW Weekend
- **Group A:** Irving Fuentes, Juan Jug
- **Group B:** Luis Martinez, Armando Vazquez

### Scoop Weekday
- **Group A:** Charlie Farfan
- **Group B:** (none listed)

### Scoop Weekend
- **Group A:** Gustavo Medina
- **Group B:** (none listed)

### Scoop Sales
- **Group A:** Crystal Smith
- **Group B:** (none listed)

### SLOC Weekend — Friday
- **Group A:** Angie Perez, Carlos Pedro, Jose Alvarez
- **Group B:** Jorge Delgado, Jesse Vazquez, Andrew

### SLOC Weekend — Saturday
- **Group A:** Angie Perez, Carlos Pedro, Jose Alvarez
- **Group B:** Jorge Delgado, Jesse Vazquez, Andrew

### SLOC Weekend — Sunday
- **Group A:** Angie Perez, Carlos Pedro, Jose Alvarez
- **Group B:** Jorge Delgado, Jesse Vazquez, Andrew

---

## Data model implication for Phase 4

The editor needs to pull a `horario` text string per agent. That requires two pieces of state that aren't yet modeled:

1. **Break group (A or B) per employee.** Currently no such column. Add `employees.break_group text CHECK (break_group IN ('A','B'))` (nullable at first, backfill from this doc) — or denormalize onto `shift_settings`. Per-employee is more flexible since group assignment is a TL-level call.
2. **Campaign-shift variant → break schedule.** Either a seed table keyed by `(campaign_id, shift_variant, break_group)` returning the break list, OR just keep the schedule as a JSON constant in the code and let the editor look it up by campaign name + group. Static data rarely changes — a code constant + admin override UI may be simpler than a full table.

Phase 4 builder decides; logging both options here so there's no re-discovery.

---

## Gaps to resolve with HR before Phase 4

- **Scoop Sales / Scoop Weekday / Scoop Weekend:** source PDF shows Group A only — confirm whether Group B exists or these campaigns run single-group.
- **Scoop Weekday / Scoop Weekend:** no 3rd break in the matrix — confirm this is intentional (shorter shift?) vs. missing from source.
- **HFB:** only 2 breaks + lunch (no 2nd break slot between first and lunch, no 3rd break) — confirm pattern.

---

## June 2026 per-employee model (current)

**Source:** `JOI_Employee_Break_Schedules.pdf`, issued 2026-06-17 (one page per employee, 47 employees).
**What changed vs. April:** moved from a 2-group (A/B) campaign-shift matrix to a
**per-employee** schedule. Lunch now rotates across **three groups (A/B/C)** and the
first/second breaks roll in staggered 15-minute waves (max 3 people off the floor at once).

### Where the data lives
- **`src/lib/breakSchedules.ts`** — typed lookup `BREAK_SCHEDULES` keyed by `employees.employee_id`,
  plus `getBreakSchedule(employeeId)`. Each record: `campaign, unit, days, clockIn, clockOut,
  break1, lunch, lunchGroup, break2`, with an optional `altShift` for employees who run a
  different weekend shift (currently only **EMP-024**, Torro Underwriting Weekend).
- **`src/components/ScheduleBanner.tsx`** — read-only banner rendered at the top of the
  Timeclock page (`src/pages/Timeclock.tsx`). Looks up the signed-in agent's `employee_id`
  and shows their clock-in/out, breaks, and lunch group.

### Scope / limitations (intentional for v1)
- **Display-only.** The banner does not change clock-in or break enforcement (the 60-min lunch
  cap and 15-min break caps still come from generic logic + `shift_settings`). It only tells the
  agent *when* they're scheduled.
- **Not day-aware.** For dual-shift employees (EMP-024) the banner shows *both* shift rows rather
  than auto-selecting today's. Per-day selection is a future enhancement.
- **EMP-119** has no department/shift assigned, so no schedule is on file — the banner shows a
  soft "check with HR" empty state.

### Dynamic lunch balancing — "freeze current, balance new hires"
Current agents keep their printed lunch. Only **new hires** get auto-assigned, each dropped into
the emptiest lunch window for their team so the team evens out as it grows. No existing agent's
lunch ever moves.

- **Current vs new:** a schedule entry with a real `lunch` string is a current agent (frozen). A
  new hire is added to `breakSchedules.ts` with their clock-in/breaks and **`lunch: null`** — that
  null is the signal to auto-balance their lunch.
- **Grouping:** by `campaign_id`. In this DB the campaign *is* the team (`SLOC Weekday`, `MCA`,
  `Underwriting`, …) and everyone in a campaign shares days/hours, so it's the right lunch pool.
  `shift_type`/`department` are inconsistent across the roster and would fragment teams, so they
  are deliberately not used.
- **Assignment:** seed each window's count from teammates with a fixed lunch, then place the
  `lunch: null` teammates one by one (stable `(created_at, id)` hire order) into the currently
  emptiest window; ties go to the earlier window.
- **Code:** `src/lib/lunchBalancer.ts` (windows + helpers) and `src/hooks/useLunchSlot.ts` (roster
  query + placement). The banner shows the computed window for a new hire and the static `lunch`
  for everyone else.
- **Scope:** only lunch balances. First/second breaks (waves of 3) and clock-in/out stay static.
- **Known nuance:** balancing is per-team, so the noon window can still run heavier client-wide
  (single-person desks default to noon). Offset each campaign's starting window if client-wide
  leveling is ever needed.

### How to change the static parts (breaks, clock-in/out)
Edit `src/lib/breakSchedules.ts` and redeploy. When TLs need to edit these without a deploy, lift
the shape into an `employee_break_schedules` table and swap the banner's import for a query — field
names are already aligned.

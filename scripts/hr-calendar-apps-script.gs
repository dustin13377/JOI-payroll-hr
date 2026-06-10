/**
 * HR Calendar feed for the JOI app — Google Apps Script web app.
 *
 * Why this exists: the Workspace admin settings hide the calendar's
 * "secret iCal address", so the app can't read the HR calendar directly.
 * This script runs AS the humanresources@ account and serves that
 * account's own calendar as JSON. No admin rights needed.
 *
 * SETUP (do this logged in as humanresources@justoutsource.it):
 * 1. Go to script.google.com → New project. Name it "JOI HR Calendar feed".
 * 2. Replace the default code with this file's contents.
 * 3. Change TOKEN below to your own long random string.
 * 4. In the left sidebar click "Services" (+) → find "Google Calendar API"
 *    → Add. (Leave the identifier as "Calendar".)
 * 5. Deploy → New deployment → gear icon → Web app.
 *      - Execute as: Me
 *      - Who has access: Anyone
 *    Click Deploy, authorize when prompted, copy the Web app URL.
 * 6. In Supabase → Edge Functions → Secrets, set HR_CALENDAR_ICS_URL to:
 *      <web app URL>?token=<your TOKEN>
 *
 * NOTE: if you later edit this script, you must Deploy → Manage deployments
 * → edit → new version for changes to go live.
 */

// Replace with your own random string (e.g. mash the keyboard, 30+ chars).
const TOKEN = "CHANGE-ME-to-a-long-random-string";

// Read the HR calendar explicitly (NOT "primary") so this works even if the
// script was deployed from a different account that has access to it.
const CALENDAR_ID = "humanresources@justoutsource.it";

function doGet(e) {
  if (!e || !e.parameter || e.parameter.token !== TOKEN) {
    return ContentService.createTextOutput("unauthorized");
  }

  const now = new Date();
  const timeMin = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000); // yesterday
  const timeMax = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000); // +60 days

  const resp = Calendar.Events.list(CALENDAR_ID, {
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: true, // expands recurring events into instances
    orderBy: "startTime",
    maxResults: 100,
  });

  const events = (resp.items || [])
    .filter(function (ev) {
      return ev.status !== "cancelled";
    })
    .map(function (ev) {
      let meetUrl = ev.hangoutLink || null;
      if (!meetUrl && ev.conferenceData && ev.conferenceData.entryPoints) {
        const video = ev.conferenceData.entryPoints.filter(function (p) {
          return p.entryPointType === "video";
        })[0];
        if (video) meetUrl = video.uri;
      }
      return {
        summary: ev.summary || "(no title)",
        location: ev.location || null,
        meetUrl: meetUrl,
        start: ev.start.dateTime || ev.start.date,
        end: (ev.end && (ev.end.dateTime || ev.end.date)) || null,
        allDay: !ev.start.dateTime,
      };
    });

  return ContentService.createTextOutput(
    JSON.stringify({ events: events }),
  ).setMimeType(ContentService.MimeType.JSON);
}

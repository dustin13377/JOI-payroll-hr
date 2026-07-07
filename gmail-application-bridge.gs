/**
 * JOI Recruitment — Gmail → Tool bridge
 * -------------------------------------
 * Replaces Postmark. Runs on a timer inside your own Google account, reads new
 * application emails from this mailbox (humanresources@justoutsource.it), and
 * hands each one to the recruitment tool exactly the way Postmark used to.
 *
 * No changes to the tool itself are needed — this just delivers the email to
 * the endpoint the tool already listens on.
 *
 * REQUIRED Script Properties (Project Settings → Script Properties):
 *   ENDPOINT_URL   = https://jpaihltkrohdqkqlbqkf.supabase.co/functions/v1/inbound-application
 *   INBOUND_SECRET = <the same secret set in Supabase as POSTMARK_INBOUND_SECRET>
 *
 * OPTIONAL Script Property:
 *   CUTOFF_ISO     = 2026-07-06T22:55:04Z
 *     Applications at/before this time are already in the tool (they came in via
 *     Postmark). The script quietly marks them as done WITHOUT re-sending them,
 *     so nothing gets duplicated. Anything newer gets delivered. Once the backlog
 *     is adopted you can leave this as-is; it does no harm.
 *
 * After setup, add a time-driven trigger on pollApplications (every 5 minutes).
 */

// Only Form 7's live application notifications, delivered from the site mailer.
var SEARCH_QUERY = 'from:mail@justoutsource.it subject:"New Application - Employment Application" -label:JOI-Ingested';
var SUBJECT_GUARD = /New Application - Employment Application/i;
var LABEL_NAME = 'JOI-Ingested';
var MAX_THREADS_PER_RUN = 50; // newest first; backlog clears over a few runs

function pollApplications() {
  var props = PropertiesService.getScriptProperties();
  var endpoint = props.getProperty('ENDPOINT_URL');
  var secret = props.getProperty('INBOUND_SECRET');
  var cutoffIso = props.getProperty('CUTOFF_ISO'); // may be null
  if (!endpoint || !secret) {
    throw new Error('Missing ENDPOINT_URL or INBOUND_SECRET script property. Add them under Project Settings → Script Properties.');
  }
  var cutoff = cutoffIso ? new Date(cutoffIso) : null;
  var label = getOrCreateLabel(LABEL_NAME);

  var threads = GmailApp.search(SEARCH_QUERY, 0, MAX_THREADS_PER_RUN);
  var posted = 0, adopted = 0, failed = 0;

  for (var t = 0; t < threads.length; t++) {
    var thread = threads[t];
    var messages = thread.getMessages();
    var allHandled = true;

    for (var m = 0; m < messages.length; m++) {
      var msg = messages[m];
      if (!SUBJECT_GUARD.test(msg.getSubject())) continue; // ignore stray replies

      // Already in the tool (pre-cutoff): mark done, do NOT resend.
      if (cutoff && msg.getDate().getTime() <= cutoff.getTime()) {
        adopted++;
        continue;
      }

      var url = endpoint + (endpoint.indexOf('?') === -1 ? '?' : '&')
              + 'secret=' + encodeURIComponent(secret);
      var payload = {
        From: msg.getFrom(),
        Subject: msg.getSubject(),
        Date: msg.getDate().toISOString(),
        HtmlBody: msg.getBody(),      // HTML — what the tool's parser expects
        TextBody: msg.getPlainBody()
      };

      var resp = UrlFetchApp.fetch(url, {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      });

      var code = resp.getResponseCode();
      if (code === 200) {
        posted++;
      } else {
        failed++;
        allHandled = false; // leave unlabeled so it retries on the next run
        console.error('Post failed (' + code + ') for "' + msg.getSubject() + '": '
          + resp.getContentText().slice(0, 300));
      }
    }

    if (allHandled) thread.addLabel(label);
  }

  console.log('Applications — delivered: ' + posted
    + ', backlog adopted: ' + adopted
    + ', failed (will retry): ' + failed);
}

function getOrCreateLabel(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}

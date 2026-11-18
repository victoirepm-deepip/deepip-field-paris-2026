/* Paris 2026 — assertions over the real config.js, model.js and ui.js.
 *
 *   node test/run.js
 *
 * No dependencies, no DOM, no network: the three files are evaluated in a vm
 * and their exports called directly. Every person in here is invented. Real
 * guest data never enters this repo, and never needs to: what is under test is
 * the code's behaviour, not the file's contents.
 *
 * Written 18 Nov, after the capture form was reordered and the Met field
 * removed. The earlier suite for this event lived outside the repo and was
 * lost to a temp-directory cleanup, which is why this one is committed.
 *
 * A gotcha worth keeping: `const Model = (() => {...})()` does not attach to a
 * vm context, so the exports come back through vm.runInContext by name. */

const fs = require("fs"), vm = require("vm"), path = require("path");
const root = path.join(__dirname, "..");

// The three files are browser code. Only the handful of globals they touch
// while rendering are stubbed; anything else missing should fail loudly.
const ctx = vm.createContext({
  console,
  crypto: { randomUUID: () => "x" },
  document: { getElementById: () => null },
  history: { length: 2 },
  location: { hash: "#/" }
});
for (const f of ["config.js", "model.js", "ui.js"])
  vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), ctx, { filename: f });
vm.runInContext("var Sync = { state: { frozen: false, pending: 0, authState: 'ok' } };", ctx);
const M = vm.runInContext("Model", ctx);
const UI = vm.runInContext("UI", ctx);
const OPTS = vm.runInContext("CAPTURE_OPTIONS", ctx);

let pass = 0, fail = 0;
const ok = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  FAIL " + name + "\n       got  " + a + "\n       want " + b); }
};
const head = t => console.log("\n" + t);

/* ---- invented people -------------------------------------------------- */

const OWNER = "Testperson";
const me = { name: "Tester", fullName: "Test Testperson", ownerNames: ["testperson"], hasList: true };

const alice = { firstName: "Alice", lastName: "Nobody", firm: "Testcorp",
                ownership: OWNER, priority: "A", population: "DeepIP guest" };
// Long name and long firm on purpose: this is the row that squeezes.
const bart  = { firstName: "Bartholomew", lastName: "Fitzwilliam-Harrington",
                firm: "International Testing Partners LLP",
                ownership: OWNER, priority: "C", population: "Plasseraud guest" };
const carl  = { firstName: "Carl", lastName: "Nemo", firm: "Testcorp",
                ownership: OWNER, priority: "Host", population: "Plasseraud host" };
const people = [alice, bart, carl];

const capture = (c, extra) => Object.assign({
  entryType: "Capture", metBy: me.name, firstName: c.firstName, lastName: c.lastName,
  firm: c.firm, capturedAt: "2026-11-19T19:30:00.000Z", date: "2026-11-19",
  contactRef: M.contactRef(c), hook: "said something"
}, extra || {});

const checkIn = c => ({ entryType: "Check-in", metBy: me.name, firstName: c.firstName,
  lastName: c.lastName, firm: c.firm, capturedAt: "2026-11-19T17:00:00.000Z",
  date: "2026-11-19", contactRef: M.contactRef(c) });

const idx = (encounters, contacts) => M.indexEncounters(encounters, contacts || people);

/* ---- Met left the form on 18 Nov -------------------------------------- */

head("The form no longer offers Met");
ok("CAPTURE_OPTIONS has no met key", Object.keys(OPTS).indexOf("met") === -1, true);
ok("the three that remain", Object.keys(OPTS), ["temperature", "toolToday", "nextStep"]);

head("Logging a conversation IS meeting the person");
ok("blank met            -> met", M.isMet(alice, idx([capture(alice, { met: "" })])), true);
ok("met key absent       -> met", M.isMet(alice, idx([capture(alice)])), true);
ok("no capture at all    -> not met", M.isMet(bart, idx([capture(alice)])), false);

head("A row typed into the Sheet by hand can still opt out");
ok('met "No"             -> not met', M.isMet(alice, idx([capture(alice, { met: "No" })])), false);
ok('met "Not seen"       -> not met', M.isMet(alice, idx([capture(alice, { met: "Not seen" })])), false);

head("A check-in still cannot make anyone look met");
ok("checked in, not logged -> not met", M.isMet(bart, idx([checkIn(bart)])), false);
ok("checked in             -> here",    M.hasArrived(bart, idx([checkIn(bart)])), true);

head("The evening recap counts the blank ones and honours the No");
{
  const rows = [capture(alice, { met: "" }), capture(bart, { met: "No" })];
  const r = M.eveningRecap({ contacts: people, encounters: rows, index: idx(rows) },
                           me, new Date("2026-11-19T20:00:00+01:00"));
  ok("Alice counted, Bartholomew not", r.met.map(x => x.name || x.lastName), ["Alice Nobody"]);
}

/* ---- the list row grew a second target on 18 Nov ---------------------- */

head("The list, rendered by the real ui.js");
const app = {
  ctx: { contacts: people, encounters: [capture(alice)], index: idx([capture(alice)]),
         directory: [], firms: M.buildFirms(people) },
  filters: [], me, draft: {}, arrivedCount: () => 0,
  now: () => new Date("2026-11-19T19:45:00+01:00")
};
const html = UI.list(app);

// An <a> inside an <a> is the one thing the browser would quietly take apart,
// so the Log button is a sibling of the row. Walk the anchors and prove it.
let depth = 0, maxDepth = 0;
for (const m of html.matchAll(/<a\b|<\/a>/g)) {
  if (m[0] === "</a>") depth--; else { depth++; maxDepth = Math.max(maxDepth, depth); }
}
ok("anchors balance", depth, 0);
ok("no anchor nested inside another", maxDepth, 1);
ok("one wrapper per person", (html.match(/class="row-wrap"/g) || []).length, people.length);
ok("one Log button per person", (html.match(/class="row-log"/g) || []).length, people.length);
ok("the name opens the card", (html.match(/href="#\/person\//g) || []).length, people.length);
ok("the button opens the note", (html.match(/class="row-log" href="#\/capture\//g) || []).length, people.length);
ok("the button names the person for a screen reader",
   /aria-label="Log a meeting with Alice Nobody"/.test(html), true);
ok("someone already met is still dimmed", /class="row row-seen/.test(html), true);
ok("a long firm keeps its own cell",
   /<span class="row-firm">International Testing Partners LLP<\/span>/.test(html), true);

/* ---- the capture form, after the 18 Nov reorder ------------------------ */

head("The capture form");
const form = UI.capture(app, M.contactKey(alice));
const order = [...form.matchAll(/<legend>([^<]+)<\/legend>|<label class="cap-note">(Notes)/g)]
  .map(m => m[1] || m[2]);
ok("the note first, then the next step, then the rest", order,
   ["Notes", "Next step", "Temperature", "Tool today",
    "Where are they with AI?", "Their role in a decision", "Send them the replay?",
    "Technical field (if not in the list)"]);
ok("no Met group anywhere", /<legend>Met<\/legend>/.test(form), false);
ok("the note is tall", /id="cap-hook" rows="7"/.test(form), true);
ok("and focused, for someone we already know", /id="cap-hook" rows="7" autofocus/.test(form), true);
ok("the draft survives a repaint", /\${esc\(draft\.hook/.test(fs.readFileSync(path.join(root, "ui.js"), "utf8")), true);

head("The new-person form is not the same screen");
const formNew = UI.capture(app, null);
ok("the note is not focused there", /autofocus/.test(formNew), false);
ok("it asks for a last name", /id="cap-last"/.test(formNew), true);
ok("and a firm", /id="cap-firm"/.test(formNew), true);

/* ---- what the follow-up must never carry ------------------------------ */

head("Nothing internal leaks into a rendered card");
{
  const sensitive = Object.assign({}, alice, {
    watchOuts: "COMPETITOR-NAME-SENTINEL", lifecycle: "Opportunity",
    deal: "DEAL-SENTINEL", dealStage: "Verbal Agreement"
  });
  const only = [sensitive];
  const card = UI.person({ ...app, ctx: { ...app.ctx, contacts: only, firms: M.buildFirms(only) } },
                         M.contactKey(sensitive));
  // Watch-outs ARE meant to be on the card — for the seller's eyes. The rule
  // they must never cross is the follow-up, which is generated elsewhere; this
  // assertion pins the card's behaviour so a change there is deliberate.
  ok("watch-outs render on the card, by design",
     card.indexOf("COMPETITOR-NAME-SENTINEL") > -1, true);
}

console.log("\n" + pass + " passed, " + fail + " failed\n");
process.exit(fail ? 1 : 0);

/* DeepIP Event App Kit, configuration for "Beyond the pilot", Paris, 19 Nov 2026.
   Generated in phase A (13 Nov 2026). Build brief: Notion, "Sales app build brief,
   Paris 19 Nov". No contact data in this file: the Sheet is loaded at runtime. */

/* ---- Backend ---------------------------------------------------------- */

// Filled in phase B, after Deploy > New deployment > Web app (Execute as Me,
// Anyone). Every Code.gs edit needs Manage deployments > pencil > New version.
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzUKJSlC4rOOWti94Ka2N55bPI3_YMa_YBEAnD6vj-Ywlb7De-kn6sw-kLkd1jvyPfs/exec";

// Reused client (authorised for the victoirepm-deepip GitHub Pages origin).
// Byte-identical to CLIENT_ID in Code.gs. Phase B confirms the origin of the new
// repo is covered before the first sign-in test.
const GOOGLE_CLIENT_ID = "810262336028-7a92202r99cp09pv0s8gf5g5idsrer3u.apps.googleusercontent.com";

/* ---- The event -------------------------------------------------------- */

const EVENT = {
  name: "Beyond the pilot, Paris",
  slug: "paris-plasseraud-2026",
  shellVersion: 4,
  // Must equal timeZone in appsscript.json and the Sheet's File > Settings > Time zone.
  timezone: "Europe/Paris",

  // No second list: the Field_Guide is the full guest list (owned event).
  directoryLabel: "",
  engagementTrack: "",

  // List on top in every phase: everyone in the room is in the file, apart from
  // the odd plus-one. One evening phase only, so the follow-up has a single
  // opening line; it runs past midnight because dinner captures get logged late.
  phases: [
    { id: "evening", label: "Tonight",   from: "2026-11-19T15:30", to: "2026-11-20T03:00", home: "list", tonight: false },
    { id: "prep",    label: "Prep",      from: "2026-11-13T00:00", to: "2026-11-19T15:30", home: "list", tonight: false },
    { id: "after",   label: "Follow-up", from: "2026-11-20T03:00", to: "2026-11-23T00:00", home: "list", tonight: false }
  ],

  // Last day + 4 (kit default).
  freezeWritesFrom: "2026-11-23T00:00"
};

/* ---- Who is who ------------------------------------------------------- */
/*
  `name` is what lands in "Met by". `ownerNames` are matched as substrings of the
  "Ownership" column (OWNER_KEYS), accents stripped. They must be DISTINCTIVE:
  two Edouards and two Thomases are in the data, so first names alone would
  assign one person's list to the other. Surnames only.

  Romy runs the check-in at the welcome desk, signed in with Victoire's account
  on her own phone (decided 13 Nov). Check-in rows therefore carry Met by =
  Victoire: always tell them apart by Entry type, never by Met by.
*/
const USERS = {
  "edouard.derville@deepip.ai":         { name: "Edouard D", fullName: "Edouard Derville",         role: "Sales",     hasList: true,  ownerNames: ["derville"] },
  "andreas.andersson@deepip.ai":        { name: "Andreas",   fullName: "Andreas Andersson",        role: "Sales",     hasList: true,  ownerNames: ["andersson"] },
  "bertrand.julia@deepip.ai":           { name: "Bertrand",  fullName: "Bertrand Julia",           role: "Sales",     hasList: true,  ownerNames: ["julia"] },
  "thomas.kefalas@deepip.ai":           { name: "Thomas K",  fullName: "Thomas Kefalas",           role: "Success",   hasList: true,  ownerNames: ["kefalas"] },
  "dominic.chapman@deepip.ai":          { name: "Dominic",   fullName: "Dominic Chapman",          role: "BDR",       hasList: true,  ownerNames: ["chapman"] },
  "fx@deepip.ai":                       { name: "FX",        fullName: "François Xavier Leduc",    role: "CEO",       hasList: true,  ownerNames: ["leduc"] },
  "edouard.darchimbaud@deepip.ai":      { name: "Edouard A", fullName: "Edouard d'Archimbaud",     role: "CTO",       hasList: false, ownerNames: ["archimbaud"] },
  "quentin.jorget@deepip.ai":           { name: "Quentin",   fullName: "Quentin Jorget",           role: "Expert",    hasList: false, ownerNames: ["jorget"] },
  "victoire.perinet-marquet@deepip.ai": { name: "Victoire",  fullName: "Victoire Perinet-Marquet", role: "Marketing", hasList: true,  ownerNames: ["perinet"] }
};

// "Assigned to me" = the Ownership column. Renamed from "Covered by" on 16 Nov;
// the old header is kept as an alias in Code.gs. Backup was deleted that day.
const OWNER_KEYS = ["ownership"];

/* ---- Capture form ----------------------------------------------------- */

const CAPTURE_OPTIONS = {
  met:         ["Yes", "No", "Not seen"],
  temperature: ["Hot", "Warm", "Cold", "Not a fit"],
  toolToday:   ["Nothing", "Built in-house", "General-purpose LLM", "Other", "Unknown"], // + COMPETITORS
  nextStep:    ["Demo", "Intro", "Send content", "Meeting", "Nothing"]
};

/* Extra fields. All optional, one tap each. Headers are frozen and mapped in
   ENCOUNTER_COLUMNS. AI stage turns the title of the evening into a
   qualification field. Technical field and Email matter only for someone who is
   not in the file: the follow-up has neither for them otherwise. */
const CAPTURE_EXTRA = [
  { key: "aiStage",        label: "Where are they with AI?", header: "AI stage",         type: "choice", options: ["No AI yet", "Exploring", "Piloting", "Rolled out"] },
  { key: "decisionRole",   label: "Their role in a decision", header: "Decision role",   type: "choice", options: ["Decision-maker", "Influencer", "User"] },
  { key: "wantsReplay",    label: "Send them the replay?",    header: "Wants the replay", type: "choice", options: ["Yes", "No"] },
  { key: "technicalField", label: "Technical field (if not in the list)", header: "Technical field", type: "choice", options: ["Life sciences", "Chemistry", "Electrical / software", "Mechanical", "Mixed / unknown"] },
  { key: "email",          label: "Email (if not in the list)", header: "Email",         type: "text" }
];

// Names only, never next to an account.
const COMPETITORS = ["Ankar", "Solve", "Patlytics", "Questel", "Tradespace"];

/* ---- Event-specific entry types (new in this build, see brief) ---------- */
/* Every row on the Encounter tab carries an `Entry type`. Only "Capture" rows
   count as met, feed the recap and feed the follow-up. The others are signals. */
const ENTRY_TYPES = {
  capture:  "Capture",       // the normal encounter
  checkin:  "Check-in",      // Romy at the door: the person has arrived
  hook:     "Panel hook",    // Victoire during the panels: Last name = speaker, Hook = the line
  intro:    "Intro request"  // a seller asks Bertrand for a Plasseraud introduction
};

/* ---- Follow-up -------------------------------------------------------- */
/* Generated Fri 20 Nov, 10:00, locally, never committed. Sender = the
   Follow-up owner column (decided in the brief, replaces the technical-field
   rule for this event: senior audience, relationship-led). Plasseraud guests get
   their own drafting logic, with the Plasseraud partner visible. Every draft is
   reviewed by hand. */
const FOLLOW_UP = {
  sender: "followUpOwner",
  fallbackSender: "metBy",
  cc: "crmOwner",
  sendWithinHours: 24,
  signers: {},
  moments: {
    "evening": "Thank you for joining us on Thursday at the Morning Concorde for \"Beyond the pilot\"."
  }
};

/* ---- Contact card ----------------------------------------------------- */

const CARD_FIELDS = [
  { key: "onStage",       label: "On stage" },
  { key: "population",    label: "Guest of" },
  // Named as the Sheet names it, so the column an AE just filled in and the line
  // they read on the card are obviously the same thing.
  { key: "ownership",     label: "Ownership", empty: "Not claimed yet" },
  { key: "whyThem",       label: "Why them" },
  { key: "opener",        label: "Opener" },
  { key: "watchOuts",     label: "Watch-outs" },
  { key: "accountStatus", label: "Lifecycle stage" },
  { key: "deal",          label: "Deal" },
  { key: "dealStage",     label: "Deal stage" },
  { key: "dealNextStep",  label: "Next step" },
  { key: "crmOwner",      label: "HubSpot owner" },
  { key: "lastCrm",       label: "Last contacted" },
  { key: "language",      label: "Language" },
  { key: "sameFirmCount", label: "From the same organization" }
];

const LIST_FIELDS = [
  { key: "priority" },
  { key: "onStage" },
  { key: "population", flag: "Plasseraud guest", match: "Plasseraud guest" },
  { key: "accountStatus" }
];

const LIST_FILTERS = [
  "mine",
  "notmet",
  { id: "prio-1",     label: "Priority 1",       key: "priority",   match: "1" },
  { id: "plasseraud", label: "Plasseraud guests", key: "population", match: "Plasseraud guest" },
  { id: "hosts",      label: "Hosts",            key: "population", match: "Plasseraud host" },
  { id: "speakers",   label: "On stage",         key: "onStage",    match: "Panel" },
  "customers",
  "multifirm"
];

/* ---- Sync and freshness ----------------------------------------------- */
/* 30 s instead of 60 s: arrivals from the door must reach the right seller
   within the break (17:45 to 18:10). About 10 users over 7 hours stays well
   inside Apps Script quotas. */
const SYNC = {
  autoIntervalMs: 30000,
  requestTimeoutMs: 20000,
  snapshotStaleAfterMs: 15 * 60000,
  promptRefreshAfterMs: 30 * 60000
};

/* ---- Modules ---------------------------------------------------------- */
/* Dinner off: standing dinner, no table plan. RSVP off: done by the request-a-seat
   page. Follow-up on. */
const MODULES = {
  dinner: false,
  rsvp: false,
  followUp: true
};

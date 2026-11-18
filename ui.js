/* Screens and routing. Hash router, string templates, one delegated click handler.
 * No framework and no build step — the whole app has to be debuggable from a phone
 * on a bad connection in a corridor.
 */

const UI = (() => {

  /* ---- helpers --------------------------------------------------------- */

  const esc = s => String(s === null || s === undefined ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  const c = Model.clean;

  /** Renders a label/value pair only when there is a value. Empty stays empty. */
  const field = (label, value) => c(value)
    ? `<div class="field"><span class="field-l">${esc(label)}</span><span class="field-v">${esc(c(value))}</span></div>`
    : "";

  const chip = (text, kind = "") => `<span class="chip ${kind}">${esc(text)}</span>`;

  /**
   * The photo from the Sheet's Photo URL column, filled there by a formula from
   * the Photos tab. Always an external URL — no image of an attendee is ever
   * committed to this repo (CLAUDE.md section 2), and the app only ever reads.
   *
   * https only, so a broken or http link renders nothing rather than a mixed
   * content warning; no referrer, because the Drive and Webflow URLs should not
   * carry the app's address; and a load failure removes the element, so a
   * deleted Drive file degrades to the same layout with no photo in it.
   */
  function photo(p, cls) {
    const src = c(p && p.photo);
    if (!/^https:\/\//i.test(src)) return "";
    return `<img class="${cls}" src="${esc(src)}" alt="" loading="lazy" decoding="async"
      referrerpolicy="no-referrer" onerror="this.remove()" />`;
  }

  /** "18:04", event-local, for an arrival or a hook. */
  const atTime = e => Model.whenOf(e.capturedAt || e.date).slice(11);

  const screen = (title, body, opts = {}) => `
    <header class="bar">
      ${opts.back === false ? `<span class="bar-sp"></span>` : `<a class="bar-back" href="${esc(opts.back || "#/")}" aria-label="Back">‹</a>`}
      <h1>${esc(title)}</h1>
      <a class="bar-set" href="#/settings" aria-label="Settings">⚙</a>
    </header>
    <main>${body}</main>`;

  /* ---- status area ------------------------------------------------------
     On screen at all times. Two questions, answered separately, in words:

       outbound  are MY captures saved and gone up?
       inbound   is the list I am READING up to date?

     Two builds showed a single "Synced 4 min ago" line. People read it as "my
     captures are safe" and never realised the list in front of them was stale.
     Past SYNC.snapshotStaleAfterMs the inbound line says the list is old; past
     SYNC.promptRefreshAfterMs it becomes a banner. Refresh is one tap away, and
     pulling down does the same (app.js). */

  function outboundText(s) {
    if (!s.pending) return "All your captures are up.";
    const n = `${s.pending} capture${s.pending === 1 ? "" : "s"} waiting to go up.`;
    return s.status === "syncing" ? `${n} Sending…` : n;
  }

  function listTime(ts) {
    const d = new Date(ts);
    const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    return d.toDateString() === new Date().toDateString()
      ? time
      : `${d.toLocaleDateString(undefined, { day: "numeric", month: "short" })}, ${time}`;
  }

  /** { text, level: fresh | stale | prompt } for what the user is reading. */
  function inbound(s, now = Date.now()) {
    if (!s.snapshotAt) return { text: "No list on this phone yet. Tap Refresh.", level: "prompt" };
    const age = now - s.snapshotAt;
    const t = listTime(s.snapshotAt);
    if (age > SYNC.promptRefreshAfterMs) {
      return { text: `The list on this phone is from ${t}. Tap Refresh to get the latest.`, level: "prompt" };
    }
    if (Sync.isStale(now)) return { text: `You are seeing the list as of ${t}. That is old: pull down or tap Refresh.`, level: "stale" };
    return { text: `You are seeing the list as of ${t}. Pull down to refresh.`, level: "fresh" };
  }

  /** Shown by App.updateReconnect only while the Google sign-in has expired. */
  const reconnectBar = () => `
    <div id="reconnect-bar" class="reconnect-bar" hidden>
      <p>Your Google sign-in has expired, so Refresh cannot reach the Sheet. Tap below to reconnect. Nothing on this phone is lost.</p>
      <div id="reconnect-btn"></div>
    </div>`;

  function renderStatus() {
    const s = Sync.state;
    const bad = s.status === "offline" || s.status === "idle";
    const inb = inbound(s);
    const stale = inb.level !== "fresh" ? " stale" : "";
    return `
      <div class="status ${bad ? "status-off" : "status-on"}${stale}">
        <span class="dot"></span>
        <span class="status-lines">
          <span class="status-out${s.pending ? " status-out-waiting" : ""}">${esc(outboundText(s))}</span>
          ${inb.level === "prompt" ? "" : `<span class="status-in">${esc(inb.text)}</span>`}
        </span>
        <button class="resync" data-act="resync" ${s.status === "syncing" ? "disabled" : ""}>${s.status === "syncing" ? "…" : "Refresh"}</button>
      </div>
      ${inb.level === "prompt" ? `<div class="banner-refresh">${esc(inb.text)} <button class="banner-link" data-act="resync">Refresh now</button></div>` : ""}
      ${s.authState === "stale" && bad ? `<div class="banner-offline">Working offline — nothing is lost, everything you log is saved on this phone. ${s.pending ? `<a class="banner-link" href="#/settings">${s.pending} waiting: tap to reconnect</a>` : `<a class="banner-link" href="#/settings">Still offline? Tap to reconnect</a>`}</div>` : ""}
      ${s.frozen ? `<div class="banner-frozen">Writes are closed for this event. The app is read-only.</div>` : ""}`;
  }

  /* ---- home -------------------------------------------------------------
     Four entries, full width. The order follows the current phase: in a
     "capture" phase "Log a meeting" moves to the top and the list drops to
     second, because by then almost nobody you meet is in the file. Not a
     setting: EVENT.phases in config.js. */

  function home(app) {
    const now = app.now();
    const me = app.me;
    const listLabel = me.hasList ? "My list" : "Everyone";
    const mine = app.myListCount();
    const listSub = me.hasList
      // Nought is a sentence, not a number: it means "claim your guests", and
      // saying "0 assigned to you" leaves people tapping to find out why.
      ? (mine ? `${mine} assigned to you` : "No guests claimed yet — tap to see everyone")
      : `${app.ctx.contacts.length} people, not-yet-met first`;

    const entries = {
      list:    { href: "#/list",    title: listLabel,      sub: listSub,                                  glyph: "≡" },
      search:  { href: "#/search",  title: "Who is this?", sub: app.ctx.directory.length ? `Search the room and the ${Model.directoryLabel()}` : "Search the room", glyph: "?" },
      capture: { href: "#/capture", title: "Log a meeting", sub: "Works for someone who exists nowhere",   glyph: "+" },
      tonight: { href: "#/tonight", title: "Tonight",      sub: `${app.dinnerCount()} at the dinner`,      glyph: "◆" }
    };

    const order = Model.homeFlipped(now)
      ? ["capture", "list", "search"]
      : ["list", "search", "capture"];
    if (Model.showTonight(now)) order.push("tonight");

    const cards = order.map(k => {
      const e = entries[k];
      return `<a class="home-card home-${k}" href="${e.href}">
        <span class="home-glyph">${e.glyph}</span>
        <span class="home-body"><strong>${esc(e.title)}</strong><small>${esc(e.sub)}</small></span>
      </a>`;
    }).join("");

    return `
      <header class="bar bar-home">
        <h1>${esc(EVENT.name)}</h1>
        <a class="bar-set" href="#/settings" aria-label="Settings">⚙</a>
      </header>
      <main>
        <p class="home-hello">${esc(me.name || me.email)} · ${esc(Model.phaseLabel(now))}</p>
        ${arrivals(app)}
        ${hooksStrip(app)}
        ${cards}
        <a class="home-secondary" href="#/checkin">Welcome desk — check someone in (${app.arrivedCount()} of ${app.ctx.contacts.length} here)</a>
        ${app.introCount() ? `<a class="home-secondary" href="#/intros">Introductions asked for — ${app.introCount()}</a>` : ""}
        <a class="home-secondary" href="#/recap">Your recap — who you met, who you missed</a>
        ${app.unmatchedCount() ? `<a class="home-secondary" href="#/onsite">Logged on site — ${app.unmatchedCount()} not in the file</a>` : ""}
        <a class="home-secondary" href="#/summary">Day summary — copy for Slack</a>
      </main>`;
  }

  /* ---- arrivals -----------------------------------------------------------
     The one thing the welcome desk is for. Someone you are responsible for has
     walked in and nobody has talked to them yet. It follows Ownership alone
     since the Backup column was deleted on 16 Nov, so a guest nobody has
     claimed raises no banner: the "Here, not met yet" chip is the net that
     catches those, because it does not care who owns anyone.

     It is a list of people, not a count, because a count makes you open a screen
     and a name makes you walk across the room. */

  function arrivals(app) {
    const list = Model.arrivalsForMe(app.ctx, app.me);
    if (!list.length) return "";
    const show = list.slice(0, 4);
    return `<div class="arrivals">
      <p class="arrivals-h">${list.length === 1 ? "Your guest has arrived" : `${list.length} of your guests are here, not met yet`}</p>
      ${show.map(x => `<a class="arrival" href="#/person/${encodeURIComponent(Model.contactKey(x.contact))}">
        ${photo(x.contact, "arrival-photo")}
        <span class="arrival-body">
          <strong>${esc(Model.fullName(x.contact))}</strong>
          <small>${esc([c(x.contact.firm), Model.priorityShort(x.contact) && "Priority " + Model.priorityShort(x.contact)].filter(Boolean).join(" · "))}</small>
        </span>
        <span class="arrival-at">${esc(atTime(x.at))}</span>
      </a>`).join("")}
      ${list.length > show.length ? `<button class="banner-link" data-act="herefilter">See all ${list.length}</button>` : ""}
    </div>`;
  }

  /* ---- panel hooks --------------------------------------------------------
     Lines from the stage, posted during the panels and read during the break
     and the dinner — the point being that someone who was at the back of the
     room, or at the welcome desk, can still open on what was just said.

     Today's only: before the panels the strip does not exist, and it does not
     come back on Friday morning. */

  function hooksStrip(app) {
    const hooks = Model.panelHooksToday(app.ctx, app.now());
    if (!hooks.length) return "";
    return `<div class="hooks">
      <p class="hooks-h">From the stage</p>
      ${hooks.slice(0, 3).map(x => `<blockquote class="hook">
        <p>${esc(c(x.encounter.hook))}</p>
        <cite>${esc(Model.fullName(x.encounter) || "—")}${c(x.encounter.firm) ? ` · ${esc(c(x.encounter.firm))}` : ""} · ${esc(atTime(x.encounter))}</cite>
      </blockquote>`).join("")}
      <a class="banner-link" href="#/hooks">${hooks.length > 3 ? `All ${hooks.length} lines` : "Post a line"}</a>
    </div>`;
  }

  /* ---- list -------------------------------------------------------------
     One list, one set of filters, same for everyone. Active filters are chips
     with a cross. The default filter is a real, removable chip — never an
     implicit condition. Tap the cross and you see all 100. */

  function list(app) {
    const all = Model.availableFilters(app.ctx);
    const active = app.filters;
    // While the room is filling up, the list reorders itself: people who are
    // here and have not been met rise to the top, whatever their grade, and the
    // ones already met drop to the bottom. Outside that phase the prepared
    // order stands, because a list that reshuffles while you are learning faces
    // on the Tuesday is just confusing.
    const live = Model.arrivalOrderActive(app.ctx, app.now());
    const rows = Model.sortContacts(
      Model.applyFilters(app.ctx.contacts, active, app.ctx),
      app.ctx,
      {
        arrivalsFirst: live,
        notMetFirst: !app.me.hasList || active.indexOf("mine") === -1
      }
    );

    const activeChips = active.map(id => {
      const f = all.find(x => x.id === id);
      return f ? `<button class="chip chip-active" data-act="unfilter" data-id="${esc(id)}">${esc(f.label)} <span class="x">×</span></button>` : "";
    }).join("");

    const available = all.filter(f => active.indexOf(f.id) === -1)
      .map(f => `<button class="chip chip-add" data-act="filter" data-id="${esc(f.id)}">${esc(f.label)}</button>`).join("");

    return screen(app.me.hasList ? "My list" : "Everyone", `
      <div class="filters">
        <div class="filters-active">
          ${activeChips || `<span class="filters-none">No filter — all ${app.ctx.contacts.length} people</span>`}
          ${active.length ? `<button class="chip chip-clear" data-act="clearfilters">Clear all</button>` : ""}
        </div>
        <details class="filters-more">
          <summary>Add a filter</summary>
          <div class="filters-avail">${available}</div>
        </details>
      </div>
      <p class="count">${rows.length} shown${live ? ` · <span class="count-live">here and not met first</span>` : ""}</p>
      ${rows.length ? rows.map(p => personRow(p, app)).join("") : emptyList(app, active)}
    `);
  }

  /** Level 1. One line, one line only: name, firm, priority chip, one flag icon.

      Two targets per row, asked for by sales on 18 Nov: the row opens the card
      to read, the Log button goes straight to the note. A conversation that has
      just ended is worth more than the card, and the card is where the time went.

      The button is a SIBLING of the row, not a child: the row is an <a>, and an
      <a> inside an <a> is invalid and comes apart in the browser. It is laid
      over the right edge instead, so the five-column grid is untouched and only
      the row's right padding changes. */
  function personRow(p, app) {
    const flag = Model.topFlag(p);
    const prio = Model.priority(p).value;
    const met = Model.isMet(p, app.ctx.index);
    // The first line is one line and stays one line: five fixed grid cells, no
    // wrapping. An event can add a second line of tags (LIST_FIELDS in config.js);
    // with none configured, or none filled for this person, the row is one line.
    const tags = listTags(p, app);
    const key = encodeURIComponent(Model.contactKey(p));
    return `<div class="row-wrap">
      <a class="row ${met ? "row-seen" : ""}${tags ? " row-2l" : ""}" href="#/person/${key}">
      <span class="row-flag ${flag ? "flag-" + flag.key : ""}" title="${flag ? esc(flag.label) : ""}">${flag ? flag.icon : ""}</span>
      <span class="row-name">${photo(p, "row-photo")}<span class="row-nametext">${esc(Model.fullName(p))}</span></span>
      <span class="row-firm">${esc(c(p.firm))}</span>
      <span class="row-prio ${prio ? "p" + prio : ""}">${esc(Model.priorityShort(p))}</span>
      <span class="row-check" title="${met ? "Met" : "Not yet met"}">${met ? "✓" : ""}</span>
      ${tags}
      </a>
      <a class="row-log" href="#/capture/${key}" aria-label="Log a meeting with ${esc(Model.fullName(p))}">Log</a>
    </div>`;
  }

  /**
   * The second line of a list row, from LIST_FIELDS. A field with `flag` is a
   * yes/no column: it shows its short label when the cell says yes, and nothing
   * otherwise. Any other field shows its value. Empty stays empty.
   */
  const YES = /^(yes|y|true|1|x|oui)$/i;
  const NO = /^(no|n|false|0|non)$/i;
  function listTags(p, app) {
    const fields = typeof LIST_FIELDS !== "undefined" ? LIST_FIELDS : [];
    const bits = fields.map(f => {
      // A ranked grade already has the fixed cell on the first line; only the
      // unranked labels (Vendor, Host) need a tag, so nothing is said twice.
      if (f.key === "priority" && Model.priority(p).value !== null) return "";
      const v = c(p[f.key]);
      if (!v || NO.test(v)) return "";
      // `flag` with a `match` is a label for one value of a column that holds
      // several: show the short label when it matches and nothing when it does
      // not. Without it this printed "Plasseraud guest: Plasseraud guest".
      if (f.flag && f.match) {
        return Model.norm(v).indexOf(Model.norm(f.match)) > -1
          ? `<span class="tag tag-flag">${esc(f.flag)}</span>` : "";
      }
      if (f.flag) return YES.test(v) ? `<span class="tag tag-flag">${esc(f.flag)}</span>` : `<span class="tag">${esc(f.flag)}: ${esc(v)}</span>`;
      return `<span class="tag">${esc(v)}</span>`;
    }).filter(Boolean);
    // Arrived at the welcome desk and nobody has logged a conversation yet.
    // First tag, because during the evening it is the one that decides where
    // the next ten minutes go.
    if (app && Model.hasArrived(p, app.ctx.index) && !Model.isMet(p, app.ctx.index)) {
      bits.unshift(`<span class="tag tag-here">Here</span>`);
    }
    return bits.length ? `<span class="row-tags">${bits.join("")}</span>` : "";
  }

  function emptyList(app, active) {
    // Expected all this week, not a fault: the AEs claim their own guests in
    // the Sheet, so Ownership is empty until they do. An empty screen with no
    // explanation is read as a broken app and gets reported as one, so this
    // says what is happening, who fixes it, and offers the way through.
    if (active.indexOf("mine") > -1) {
      return `<div class="empty">
        <p>No guests assigned to you yet.</p>
        <p class="muted">You claim your own guests in the Sheet: put your name in the
        <strong>Ownership</strong> column, from the dropdown. Whatever you claim shows up here
        at the next refresh.</p>
        <button class="btn btn-ghost" data-act="clearfilters">Show everyone instead</button>
      </div>`;
    }
    return `<div class="empty"><p>No one matches these filters.</p></div>`;
  }

  /* ---- person card ------------------------------------------------------
     Five blocks, no more. The test for every field: does it help decide whether
     to approach, and with what opening line? If not, it drops a level.
     Deliberately absent: CSM sentiment, HubSpot id, LinkedIn, country. */

  function person(app, key) {
    const p = app.ctx.contacts.find(x => Model.contactKey(x) === key);
    if (!p) return screen("Not found", `<div class="empty"><p>That person is not in the local copy.</p></div>`);

    const f = Model.flags(p);
    const mates = Model.firmMates(p, app.ctx.firms);
    // The thread is the CAPTURES. A check-in is an arrival, not a conversation,
    // and it has its own line at the top of the card.
    const thread = Model.capturesFor(p, app.ctx.index);
    const arrival = Model.arrivalFor(p, app.ctx.index);
    const eng = Model.engagement(p);
    const prio = Model.priorityLabel(p);

    /* 1 — the banner. Full width, customers only. A chip is not enough for a
       screen read while walking. Some customer accounts are not happy ones, so
       the wording must not imply a happy customer. Names a role, not a person:
       the banner outlives whoever holds the account today. */
    const banner = f.customer
      ? `<div class="banner-customer">CUSTOMER — do not pitch. Talk to the CSM first.</div>`
      : (f.doNotPitch ? `<div class="banner-nopitch">Do not pitch. Relationship, not pipeline.</div>` : "");

    /* 1b — arrived. The welcome desk writes a Check-in row; everyone's app says
       so within one sync. Worded as a fact with a time, not as a status chip:
       "Here since 17:12" is what makes someone walk back out onto the floor. */
    const here = arrival
      ? `<div class="banner-here ${Model.isMet(p, app.ctx.index) ? "banner-here-met" : ""}">
           Here since ${esc(atTime(arrival))}${Model.isMet(p, app.ctx.index) ? " · already met" : " · not met yet"}
         </div>`
      : "";

    /* 2 — who they are */
    const who = `
      <section class="block block-who">
        ${photo(p, "card-photo")}
        <h2 class="name">${esc(Model.fullName(p))}</h2>
        <p class="sub">${[c(p.role), c(p.firm)].filter(Boolean).map(esc).join(" · ")}</p>
        ${mates.length ? `<p class="firmcount"><a href="#/firm/${encodeURIComponent(Model.norm(p.firm))}">${mates.length + 1} people from this firm are here</a></p>` : ""}
        ${f.dinner ? `<p class="dinner-line">At the dinner${Model.inviterOf(p) ? ` — guest of ${esc(Model.inviterOf(p))}` : ""}</p>` : ""}
      </section>`;

    /* 3 — why they matter. One line. */
    const cardFields = typeof CARD_FIELDS !== "undefined" ? CARD_FIELDS : [];
    const onCard = new Set(cardFields.map(f => f.key));
    const why = [prio, onCard.has("accountStatus") ? "" : c(p.accountStatus),
                 onCard.has("tiering") ? "" : c(p.tiering)].filter(Boolean);
    const matter = why.length
      ? `<section class="block block-why"><p>${why.map(esc).join(" · ")}</p></section>` : "";

    /* 3b — event-specific columns (CARD_FIELDS in config.js). Label: value,
       only the ones with a value. */
    // `empty` is the text shown for a blank cell when blank means something
    // (a blank owner is "No owner"); without it a blank field is not shown.
    const glanceRows = cardFields.map(f => field(f.label, c(p[f.key]) || f.empty || "")).join("");
    const glance = glanceRows ? `<section class="block block-glance">${glanceRows}</section>` : "";

    /* 4 — what to say. The main block; it gets the room.
       Precedence lives in Model.whatToSay so it can be tested: the prepared
       field note ("Context I have / Notes") first, the rep's own objective
       ("My objective") second, a written opening only when both are empty. */
    const say = Model.whatToSay(p);
    const whatToSay = `
      <section class="block block-say">
        <h3>${esc(say.label)}</h3>
        <p class="say${say.prepared ? "" : " say-empty"}">${esc(say.text)}</p>
      </section>`;

    /* 5 — one button, and on a Plasseraud guest a second one.
       An introduction is a different act from a capture: the seller is not
       logging what happened, they are asking the host to walk them over. It
       writes an Intro request row on the same tab and shows up in one list. */
    // Plasseraud's own people and their guests. The suggested-partner column was
    // dropped on 16 Nov, so the request now simply says who wants the
    // introduction and why, and the hosts work out between them who makes it.
    const wantsIntroPath = /plasseraud/i.test(c(p.population));
    const asked = Model.threadFor(p, app.ctx.index).filter(e => Model.isEntry(e, "intro"));
    const action = `<a class="btn btn-primary" href="#/capture/${encodeURIComponent(key)}">Log a meeting</a>`
      + (wantsIntroPath
          ? `<a class="btn btn-ghost" href="#/intro/${encodeURIComponent(key)}">Ask for an introduction</a>`
          : "");

    const introBlock = asked.length ? `
      <section class="block block-intro">
        <h3>Introduction asked for</h3>
        ${asked.map(e => `<div class="enc">
          <div class="enc-head"><strong>${esc(c(e.metBy) || "—")}</strong><span>${esc(Model.whenOf(e.capturedAt || e.date))}</span></div>
          ${c(e.hook) ? `<p class="enc-hook">${esc(c(e.hook))}</p>` : ""}
        </div>`).join("")}
      </section>` : "";

    /* Level 3 — collapsed */
    const account = `
      <details class="lvl3"><summary>Account</summary>
        ${field("Owner", p.crmOwner)}
        ${field("ARR", p.arr)}
        ${field("Client reference", p.clientRef)}
        ${c(p.crmRecord) ? `<div class="field"><span class="field-l">CRM</span><a class="field-v link" href="${esc(c(p.crmRecord))}" target="_blank" rel="noopener">Open record</a></div>` : ""}
        ${field("Seniority", p.seniority)}
        ${field("Technical field", p.technicalField)}
      </details>`;

    const engagementBlock = eng ? `
      <details class="lvl3"><summary>Engagement on DeepIP</summary>
        ${eng.noAccount
          ? `<p class="noaccount">No product account</p>`
          : `${field("Projects created", eng.projects)}
             ${field("Conversations", eng.conversations)}
             ${field("Last CRM contact", eng.lastCrm)}
             ${field("Level", eng.level)}
             ${eng.signal ? `<p class="signal">${esc(eng.signal)}</p>` : ""}`}
        <p class="internal">Internal signal — do not mention in conversation.</p>
      </details>` : "";

    const firmBlock = mates.length ? `
      <details class="lvl3"><summary>Firm — ${esc(c(p.firm))}</summary>
        ${mates.map(m => `<a class="mate" href="#/person/${encodeURIComponent(Model.contactKey(m))}">
            <span>${esc(Model.fullName(m))}</span>
            <small>${Model.isMet(m, app.ctx.index) ? "met" : "not met"}</small>
          </a>`).join("")}
      </details>` : "";

    /* The thread. A person can legitimately be met several times by several
       people. Every capture is a new row; nothing is ever overwritten. */
    const threadBlock = thread.length ? `
      <section class="block block-thread">
        <h3>Met ${thread.length} time${thread.length === 1 ? "" : "s"}</h3>
        ${thread.map(encounterLine).join("")}
      </section>` : "";

    return screen("", banner + here + who + matter + glance + whatToSay + action +
                      threadBlock + introBlock +
                      account + engagementBlock + firmBlock,
                  { back: history.length > 1 ? "#/list" : "#/" });
  }

  function encounterLine(e) {
    // Event-local time: capturedAt is UTC, and showing it raw puts a Toronto
    // capture four hours in the future.
    const when = Model.whenOf(e.capturedAt || e.date);
    const bits = [c(e.temperature), c(e.toolToday), c(e.nextStep)].filter(Boolean);
    return `<div class="enc">
      <div class="enc-head"><strong>${esc(c(e.metBy) || "—")}</strong><span>${esc(when)}${c(e.session) ? " · " + esc(Model.sessionDisplay(e.session)) : ""}</span></div>
      ${c(e.hook) ? `<p class="enc-hook">${esc(c(e.hook))}</p>` : ""}
      ${bits.length ? `<p class="enc-bits">${bits.map(b => chip(b)).join("")}</p>` : ""}
    </div>`;
  }

  /* ---- firm ------------------------------------------------------------- */

  function firm(app, key) {
    const g = app.ctx.firms.get(key);
    if (!g) return screen("Firm", `<div class="empty"><p>Unknown firm.</p></div>`);
    const met = g.members.filter(m => Model.isMet(m, app.ctx.index)).length;
    return screen(g.name, `
      <p class="count">${g.members.length} here, ${met} met</p>
      ${Model.sortContacts(g.members, app.ctx, { notMetFirst: true }).map(p => personRow(p, app)).join("")}
    `, { back: "#/list" });
  }

  /* ---- search ----------------------------------------------------------- */

  function searchScreen(app) {
    return screen("Who is this?", `
      <input class="search" id="q" type="search" inputmode="search" autocomplete="off"
             placeholder="Name or firm" value="${esc(app.query)}" />
      <div id="results">${searchResults(app)}</div>
      <a class="btn btn-ghost" href="#/capture">Not here — log them as a new person</a>
    `);
  }

  function searchResults(app) {
    if (Model.norm(app.query).length < 2) {
      return `<p class="muted pad">Type two letters. The room first${app.ctx.directory.length ? `, then the ${esc(Model.directoryLabel())}` : ""}.</p>`;
    }
    const r = Model.search(app.query, app.ctx);
    if (!r.contacts.length && !r.directory.length) {
      return `<div class="empty"><p>No match.</p><p class="muted">That is normal — most people you meet on site are on no list. Log them as a new person.</p></div>`;
    }
    return `
      ${r.contacts.length ? `<h3 class="sec">In the room (${r.contacts.length})</h3>${r.contacts.map(p => personRow(p, app)).join("")}` : ""}
      ${r.directory.length ? `<h3 class="sec">${esc(Model.directoryLabel().replace(/^./, ch => ch.toUpperCase()))} (${r.directory.length})</h3>
        ${r.directory.map(d => `<button class="row row-dir" data-act="dir" data-name="${esc(d.fullName)}" data-firm="${esc(d.firm)}" data-country="${esc(d.country)}">
            <span class="row-name">${esc(d.fullName)}</span>
            <span class="row-firm">${esc([c(d.firm), c(d.city)].filter(Boolean).join(" · "))}</span>
            <span class="row-prio">${c(d.targetAccount) ? "target" : ""}</span>
          </button>`).join("")}` : ""}`;
  }

  /* ---- capture ----------------------------------------------------------
     The note comes FIRST and large (sales sync, 18 Nov). It is the only field
     here that cannot be reconstructed afterwards, and it is what Friday's
     follow-up is drafted from; the button groups under it are a convenience.
     No dictation API: the phone keyboard already has a mic, and the hint under
     the field points at it.

     Next step follows it, because those two are what Friday's draft is built
     from. Temperature and Tool today sit under them: useful to have, but they
     are read afterwards, by us, not by the person writing at 19:40.

     The Sheet column behind the note is still "Hook" and the element is still
     cap-hook. ENCOUNTER_COLUMNS is frozen; only the label and the order moved.

     The unknown-person path is the top of this screen, not a dead end reached
     after a failed search: it is the most-used path across the three days. */

  function capture(app, key) {
    const p = key ? app.ctx.contacts.find(x => Model.contactKey(x) === key) : null;
    const draft = app.draft;

    const header = p
      ? `<div class="cap-who">
           <strong>${esc(Model.fullName(p))}</strong>
           <small>${esc([c(p.role), c(p.firm)].filter(Boolean).join(" · "))}</small>
         </div>`
      : `<div class="cap-new">
           <label>First name<input id="cap-first" type="text" autocomplete="off" value="${esc(draft.firstName || "")}" placeholder="First name" /></label>
           <label>Last name<input id="cap-last" type="text" autocomplete="off" value="${esc(draft.lastName || "")}" placeholder="Last name" /></label>
           <label>Firm<input id="cap-firm" type="text" autocomplete="off" value="${esc(draft.firm || "")}" placeholder="Their firm" /></label>
           <p class="muted small">Last name and firm are all that is required. A card read in a noisy room sometimes gives only a surname: that is enough. A directory search is a convenience, never a gate.</p>
           <details class="cap-find"><summary>Look them up (optional)</summary>
             <input class="search" id="capq" type="search" placeholder="Search the room or the directory" autocomplete="off" />
             <div id="capresults"></div>
           </details>
         </div>`;

    const group = (name, options, value, label) => `
      <fieldset class="grp" data-group="${name}">
        <legend>${esc(label || groupLabel(name))}</legend>
        <div class="grp-opts">
          ${options.map(o => `<button type="button" class="opt ${value === o ? "opt-on" : ""}" data-act="opt" data-group="${name}" data-value="${esc(o)}">${esc(o)}</button>`).join("")}
        </div>
      </fieldset>`;

    return screen(p ? "Log a meeting" : "Log someone new", `
      ${header}
      <label class="cap-note">Notes
        <textarea id="cap-hook" rows="7" ${p ? "autofocus" : ""} placeholder="Everything worth remembering, in any order.">${esc(draft.hook || "")}</textarea>
        <small>Hold the mic on your keyboard and talk. Another conversation from now, this is gone.</small>
      </label>
      ${group("nextStep", CAPTURE_OPTIONS.nextStep, draft.nextStep)}
      ${group("temperature", CAPTURE_OPTIONS.temperature, draft.temperature)}
      ${group("toolToday", CAPTURE_OPTIONS.toolToday, draft.toolToday)}
      ${(typeof CAPTURE_EXTRA !== "undefined" ? CAPTURE_EXTRA : []).map(x => extraField(x, draft)).join("")}
      <button class="btn btn-primary" data-act="save" ${Sync.state.frozen ? "disabled" : ""}>Save</button>
      <p class="muted small pad">Saved on this phone first. It reaches the Sheet on its own, even if you are offline now.</p>
    `, { back: p ? `#/person/${encodeURIComponent(key)}` : "#/" });
  }

  /* Extra fields, per event, from CAPTURE_EXTRA in config.js. Rendered after the
     core fields, in declaration order. Each one is optional: a capture is never
     blocked on an extra. */
  function extraField(x, draft) {
    const v = draft[x.key] === undefined || draft[x.key] === null ? "" : draft[x.key];
    if (x.type === "choice") {
      return `
      <fieldset class="grp" data-group="${esc(x.key)}">
        <legend>${esc(x.label)}</legend>
        <div class="grp-opts">
          ${(x.options || []).map(o => `<button type="button" class="opt ${v === o ? "opt-on" : ""}" data-act="opt" data-group="${esc(x.key)}" data-value="${esc(o)}">${esc(o)}</button>`).join("")}
        </div>
      </fieldset>`;
    }
    const type = x.type === "number" ? `type="number" inputmode="numeric" min="0"` : `type="text"`;
    return `<label class="extra">${esc(x.label)}
        <input id="cap-x-${esc(x.key)}" ${type} autocomplete="off" value="${esc(v)}" />
      </label>`;
  }

  const groupLabel = n => ({
    temperature: "Temperature", toolToday: "Tool today", nextStep: "Next step"
  })[n] || n;

  /* ---- tonight ----------------------------------------------------------
     Only during a phase flagged `tonight`. Guests are often invited by people
     who are not on site and hosted by people who are, so the inviter has to be
     on every card: the evening's captures go back to each inviter in a named
     export. */

  function tonight(app) {
    const guests = Model.dinnerGuests(app.ctx);
    if (!guests.length) {
      return screen("Tonight", `<div class="empty">
        <p>No one is flagged for the dinner yet.</p>
        <p class="muted">The dinner column in the Sheet feeds this.</p></div>`);
    }
    const byInviter = new Map();
    guests.forEach(g => {
      const k = Model.inviterOf(g) || "No inviter recorded";
      if (!byInviter.has(k)) byInviter.set(k, []);
      byInviter.get(k).push(g);
    });

    return screen("Tonight", `
      <p class="count">${guests.length} at the dinner</p>
      ${[...byInviter.entries()].map(([inviter, list]) => `
        <h3 class="sec">Guest${list.length === 1 ? "" : "s"} of ${esc(inviter)}</h3>
        ${list.map(g => `
          <div class="guest">
            <a class="guest-main" href="#/person/${encodeURIComponent(Model.contactKey(g))}">
              <strong>${esc(Model.fullName(g))}</strong>
              <small>${esc(c(g.firm))}</small>
              <small class="guest-inviter">Invited by ${esc(inviter)}</small>
              ${ownerLine(g, app)}
            </a>
            <a class="btn btn-small" href="#/capture/${encodeURIComponent(Model.contactKey(g))}">Log</a>
          </div>`).join("")}
      `).join("")}
    `);
  }

  /**
   * Who is taking this guest tonight, read from the Sheet's own Ownership column.
   * The split gets decided out loud ten minutes before dinner; what matters is
   * that it then sits next to the person on everyone's phone, not in a thread
   * someone has to scroll back through at nine o'clock.
   */
  function ownerLine(g, app) {
    // Read from the ownership column. (The previous build also looked for a
    // "Dinner owner" field, which Code.gs never returns.)
    const owner = c(g.ownership);
    if (!owner) return `<small class="guest-free">No owner</small>`;
    return Model.isMine({ ownership: owner, removed: "" }, app.me)
      ? `<small class="guest-mine">Yours tonight</small>`
      : `<small class="guest-owner">${esc(owner)}</small>`;
  }

  /* ---- day summary ------------------------------------------------------
     Not an in-app screen with notifications — a shareable recap, copyable in two
     gestures, posted manually to Slack each evening. */

  function summary(app) {
    const day = app.summaryDay || Model.localDay(app.now());
    const s = Model.daySummary(day, app.ctx);
    const text = Model.summaryToText(s);
    const days = Model.eventDays();
    return screen("Day summary", `
      <div class="daypick">
        ${days.map(d => `<button class="chip ${d === day ? "chip-active" : "chip-add"}" data-act="day" data-day="${d}">${esc(Model.formatDay(d).replace(/,.*$/, ""))}</button>`).join("")}
      </div>
      <pre class="recap">${esc(text)}</pre>
      <button class="btn btn-primary" data-act="copy">Copy for Slack</button>
      <p class="muted small pad">Paste it in the team channel. The debrief is a team object, not a personal one.</p>
    `);
  }

  /* ---- logged on site -----------------------------------------------------
     Everyone captured who matches nobody in the prepared file. On a walk-up day
     that is most of it, and in the first build it was write-only: saved to the
     Sheet and then invisible, so a rep could not check what they had written. */

  function onsite(app) {
    const people = Model.unmatchedPeople(app.ctx.encounters, app.ctx.contacts);
    if (!people.length) {
      return screen("Logged on site", `<div class="empty">
        <p>Nothing yet.</p>
        <p class="muted">People you log who are not in the prepared file show up here.</p></div>`);
    }
    return screen("Logged on site", `
      <p class="count">${people.length} ${people.length === 1 ? "person" : "people"} not in the file</p>
      ${people.map(p => `
        <div class="block block-thread">
          <h3 class="onsite-name">${esc(p.fullName)}${c(p.firm) ? ` · <span class="onsite-firm">${esc(c(p.firm))}</span>` : ""}</h3>
          ${p.encounters.map(encounterLine).join("")}
        </div>`).join("")}
      <p class="muted small pad">All of these are already in the Sheet. They appear here rather than on a
      card because no prepared row matches the name and firm that were typed.</p>
    `);
  }

  /* ---- the welcome desk ---------------------------------------------------
     Downstairs, before the lifts, run by our own team on one phone. One tap per
     guest, no form, no confirmation: at 16:05 people arrive in clumps and
     anything slower than a tap gets skipped.

     Nothing here is undoable, because the write tab is append only — so the row
     shows the time it was tapped and the account it was tapped on, and a
     mis-tap is something a human can see and correct in the Sheet afterwards
     rather than something the app pretends to erase. */

  function checkin(app) {
    return screen("Welcome desk", `
      <p class="count">${app.arrivedCount()} of ${app.ctx.contacts.length} checked in</p>
      <input class="search" id="checkinq" type="search" inputmode="search" autocomplete="off"
             placeholder="Last name" value="${esc(app.query)}" />
      <div id="checkin-results">${checkinResults(app)}</div>
      <p class="muted small pad">One tap marks a guest as here. Everyone's app shows it at the
      next sync, and the person who covers them gets it on their home screen. It cannot be
      taken back from here: the Sheet only ever gains rows.</p>
    `);
  }

  function checkinResults(app) {
    const q = Model.norm(app.query);
    const all = app.ctx.contacts.slice().sort((a, b) =>
      c(a.lastName).localeCompare(c(b.lastName)) || c(a.firstName).localeCompare(c(b.firstName)));
    const rows = q.length >= 2
      ? all.filter(p => Model.norm([Model.fullName(p), c(p.firm)].join(" ")).indexOf(q) > -1)
      : all;
    if (!rows.length) {
      return `<div class="empty"><p>No match.</p>
        <p class="muted">A guest who is not in the list still gets a badge — log them from
        “Log a meeting” later, not from here.</p></div>`;
    }
    return rows.map(p => {
      const at = Model.arrivalFor(p, app.ctx.index);
      return `<div class="ci-row${at ? " ci-done" : ""}">
        ${photo(p, "row-photo")}
        <a class="ci-who" href="#/person/${encodeURIComponent(Model.contactKey(p))}">
          <strong>${esc(Model.fullName(p))}</strong>
          <small>${esc([c(p.firm), c(p.population)].filter(Boolean).join(" · "))}</small>
        </a>
        ${at
          ? `<span class="ci-at">Here ${esc(atTime(at))}</span>`
          : `<button class="btn btn-small" data-act="arrive" data-key="${esc(Model.contactKey(p))}" ${Sync.state.frozen ? "disabled" : ""}>Arrived</button>`}
      </div>`;
    }).join("");
  }

  /* ---- from the stage -----------------------------------------------------
     A line from a panel, posted once, read by everyone on their home screen.
     The speaker is picked from the people flagged On stage, so the row joins
     back to a real card; a free-text last name covers a moderator or a question
     from the floor who is not in the file. */

  function hooks(app) {
    const all = Model.panelHooks(app.ctx);
    const speakers = app.ctx.contacts
      .filter(p => Model.has(p.onStage))
      .sort((a, b) => c(a.lastName).localeCompare(c(b.lastName)));

    return screen("From the stage", `
      ${speakers.length ? `<fieldset class="grp" data-group="hookSpeaker">
        <legend>Who said it</legend>
        <div class="grp-opts">
          ${speakers.map(p => `<button type="button" class="opt ${app.draft.hookSpeaker === Model.contactKey(p) ? "opt-on" : ""}"
             data-act="opt" data-group="hookSpeaker" data-value="${esc(Model.contactKey(p))}">${esc(Model.fullName(p))}</button>`).join("")}
        </div>
      </fieldset>` : ""}
      <label class="extra">Someone else — last name
        <input id="hook-who" type="text" autocomplete="off" placeholder="Only if they are not above" />
      </label>
      <label class="hook">The line
        <textarea id="hook-line" rows="3" placeholder="What was said, in their words"></textarea>
      </label>
      <button class="btn btn-primary" data-act="savehook" ${Sync.state.frozen ? "disabled" : ""}>Post it</button>
      <p class="muted small pad">It lands on everyone's home screen at the next sync, for the rest
      of the evening. It is not a capture: nobody is marked as met by it.</p>
      ${all.length ? `<h3 class="sec">Posted</h3>${all.map(x => `
        <blockquote class="hook hook-listed">
          <p>${esc(c(x.encounter.hook))}</p>
          <cite>${esc(Model.fullName(x.encounter) || "—")} · ${esc(Model.whenOf(x.encounter.capturedAt || x.encounter.date))} · posted by ${esc(c(x.encounter.metBy) || "—")}</cite>
        </blockquote>`).join("")}` : ""}
    `);
  }

  /* ---- ask for an introduction --------------------------------------------
     A seller cannot introduce themselves to a Plasseraud guest without the
     partner who knows them. One line is enough: the host needs to know what the
     conversation is for, not a briefing. */

  function introForm(app, key) {
    const p = app.ctx.contacts.find(x => Model.contactKey(x) === key);
    if (!p) return screen("Not found", `<div class="empty"><p>That person is not in the local copy.</p></div>`);
    return screen("Ask for an introduction", `
      <div class="cap-who">
        <strong>${esc(Model.fullName(p))}</strong>
        <small>${esc([c(p.role), c(p.firm)].filter(Boolean).join(" · "))}</small>
      </div>
      <p class="muted small">The list says who asked and what for. Which Plasseraud partner makes
      the introduction is theirs to work out — the file no longer suggests one.</p>
      <label class="hook">What you want from it
        <textarea id="intro-note" rows="3" placeholder="One line: what you would talk about"></textarea>
      </label>
      <button class="btn btn-primary" data-act="saveintro" data-key="${esc(key)}" ${Sync.state.frozen ? "disabled" : ""}>Ask</button>
      <p class="muted small pad">This writes a row like any other and shows up in “Introductions
      asked for”. It does not mark anyone as met.</p>
    `, { back: `#/person/${encodeURIComponent(key)}` });
  }

  /* ---- introductions asked for --------------------------------------------
     One list, so the hosts can work through it between conversations instead of
     reconstructing a thread at nine o'clock. */

  function intros(app) {
    const list = Model.introRequests(app.ctx);
    if (!list.length) {
      return screen("Introductions", `<div class="empty">
        <p>Nothing asked for yet.</p>
        <p class="muted">Sellers ask from a guest's card. The suggested host comes from the
        “Intro by (Plasseraud)” column.</p></div>`);
    }
    return screen("Introductions", `
      <p class="count">${list.length} asked for</p>
      ${list.map(x => {
        const name = x.contact ? Model.fullName(x.contact) : Model.fullName(x.encounter);
        const firm = c(x.contact ? x.contact.firm : x.encounter.firm);
        const population = c(x.contact ? x.contact.population : "");
        return `<div class="block block-thread">
          <h3 class="onsite-name">${esc(name)}${firm ? ` · <span class="onsite-firm">${esc(firm)}</span>` : ""}</h3>
          <div class="enc">
            <div class="enc-head"><strong>${esc(c(x.encounter.metBy) || "—")} asked</strong><span>${esc(Model.whenOf(x.encounter.capturedAt || x.encounter.date))}</span></div>
            ${c(x.encounter.hook) ? `<p class="enc-hook">${esc(c(x.encounter.hook))}</p>` : ""}
            <p class="enc-bits">${population ? chip(population) : ""}${x.contact && Model.hasArrived(x.contact, app.ctx.index) ? chip("Here", "chip-here") : ""}</p>
          </div>
          ${x.contact ? `<a class="banner-link" href="#/person/${encodeURIComponent(Model.contactKey(x.contact))}">Open the card</a>` : ""}
        </div>`;
      }).join("")}
    `);
  }

  /* ---- end-of-evening recap -----------------------------------------------
     Personal, and deliberately not congratulatory. Three answers: who you met,
     which of your priority 1 guests walked in and you never got to, and what you
     promised. The middle one is the only one that can still be fixed before
     people leave, so it is not buried. */

  function recap(app) {
    const r = Model.eveningRecap(app.ctx, app.me, app.now());
    const text = Model.recapToText(r, app.me);
    const line = (p, extra) => `<div class="recap-row"><span>${esc([p.name, p.firm].filter(Boolean).join(" — "))}</span>${extra || ""}</div>`;

    return screen("Your recap", `
      <p class="count">${esc(Model.formatDay(r.day))}${r.listSize ? ` · your list: ${r.listMet}/${r.listSize} met` : ""}</p>

      <section class="block">
        <h3>Who you met — ${r.met.length}</h3>
        ${r.met.length
          ? r.met.map(p => line(p)).join("")
          : `<p class="muted small">Nothing logged on this phone yet today.</p>`}
      </section>

      <section class="block ${r.missed.length ? "block-warn" : ""}">
        <h3>Here, and you missed them — ${r.missed.length}</h3>
        ${r.missed.length
          ? r.missed.map(m => `<a class="recap-row recap-link" href="#/person/${encodeURIComponent(Model.contactKey(m.contact))}">
              <span>${esc([Model.fullName(m.contact), c(m.contact.firm)].filter(Boolean).join(" — "))}</span>
              <small>here since ${esc(atTime(m.at))}</small>
            </a>`).join("")
          : `<p class="muted small">None of your priority 1 guests is still waiting.</p>`}
        ${r.missed.length ? `<p class="muted small">Checked in at the door, no capture against them. There is still time.</p>` : ""}
      </section>

      <section class="block">
        <h3>What you promised — ${r.nextSteps.length}</h3>
        ${r.nextSteps.length
          ? r.nextSteps.map(n => `<div class="recap-row"><span>${esc([n.who, n.firm].filter(Boolean).join(" — "))}</span><small>${esc(n.step)}</small></div>`).join("")
          : `<p class="muted small">No next step logged yet.</p>`}
      </section>

      <details class="lvl3"><summary>Copy it</summary>
        <pre class="recap">${esc(text)}</pre>
        <button class="btn" data-act="copy">Copy</button>
      </details>
      <p class="muted small pad">Only captures count here. Arrivals logged at the welcome desk are
      never in this list, whoever's account the desk is signed in on.</p>
    `);
  }

  /* ---- settings ---------------------------------------------------------- */

  function settings(app) {
    const s = Sync.state;
    const warnings = (app.snapshot && app.snapshot.sheetHealth && app.snapshot.sheetHealth.warnings) || [];
    const moments = Model.previewMoments();
    return screen("Settings", `
      <section class="block">
        <h3>You</h3>
        ${field("Signed in as", app.me.email)}
        ${field("Name", app.me.fullName || app.me.name)}
        ${field("Logged as", app.me.name)}
        ${field("Role", app.me.role)}
        <label class="toggle"><input type="checkbox" data-act="toggle-list" ${app.me.hasList ? "checked" : ""}/> I have an assigned list</label>
        <label class="setting">Name in the Sheet's ownership column
          <input type="text" data-act="ownername" value="${esc((app.me.ownerNames || []).join(", "))}" placeholder="e.g. Anna" />
        </label>
      </section>

      <section class="block">
        <h3>Sync</h3>
        ${field("Status", Sync.statusText())}
        ${field("Captures waiting", String(s.pending))}
        ${field("People in the local copy", String(app.ctx.contacts.length))}
        ${field("Directory entries", String((app.snapshot && app.snapshot.directory || []).length))}
        ${field("Encounters logged", String(app.ctx.encounters.length))}
        ${tabsUsed(app)}
        ${s.lastError ? field("Last problem", s.lastError) : ""}
        <button class="btn" data-act="resync">Resync now</button>
      </section>

      <section class="block ${s.authState === "stale" ? "block-warn" : ""}">
        <h3>Reconnect</h3>
        <p class="muted small">Your Google sign-in lasts about an hour. When it runs out the app keeps
        working and keeps saving, but it cannot reach the Sheet until you sign in again.
        ${s.pending ? `<strong>You have ${s.pending} capture${s.pending === 1 ? "" : "s"} waiting.</strong> They will go up on their own the moment this works — nothing needs re-typing.` : ""}</p>
        <div id="reauth"></div>
        <p class="muted small">This never deletes anything on this phone.</p>
      </section>

      <section class="block">
        <h3>Preview a phase</h3>
        <p class="muted small">The home screen reorders itself from one phase of the event to the next, and “Tonight” only exists during the dinner. Use this at onboarding so nobody reads it as a bug.</p>
        <div class="daypick">
          <button class="chip ${!app.dateOverride ? "chip-active" : "chip-add"}" data-act="preview" data-day="">Real date</button>
          ${moments.map(m => `<button class="chip ${app.dateOverride === m.at ? "chip-active" : "chip-add"}" data-act="preview" data-day="${esc(m.at)}">${esc(m.label)}</button>`).join("")}
        </div>
      </section>

      ${warnings.length ? `<section class="block block-warn">
        <h3>Sheet health</h3>
        <p class="muted small">Columns the app looked for and did not find. Each one renders blank rather than breaking anything — but the ones the capture form writes to are worth adding.</p>
        <ul>${warnings.map(w => `<li>${esc(w)}</li>`).join("")}</ul>
      </section>` : ""}

      <section class="block">
        <h3>About</h3>
        <p class="muted small">The Google Sheet is the database. Contact rows are never modified — every capture appends a new row to ${app.snapshot && app.snapshot.sheetHealth && app.snapshot.sheetHealth.tabs ? `<em>${esc(app.snapshot.sheetHealth.tabs.encounters)}</em>` : "the write tab"}. Nothing is written to HubSpot, ever.</p>
      </section>
    `);
  }

  /** Which tabs the backend actually read. Tab names change; this is how a wrong
   *  resolution becomes something a user can see and report, instead of silence. */
  function tabsUsed(app) {
    const tabs = app.snapshot && app.snapshot.sheetHealth && app.snapshot.sheetHealth.tabs;
    if (!tabs) return "";
    return field("Reading", [tabs.contacts, tabs.directory].filter(Boolean).join(" · ")) +
           field("Writing to", tabs.encounters);
  }

  /* ---- first run --------------------------------------------------------
     The ONLY screen that can block the app, and only before anyone has ever
     signed in on this device. That happens at the onboarding session before
     departure, where a network round-trip is acceptable. Once an identity is
     cached, this screen is unreachable — a dead token means offline, not login. */

  function signIn() {
    return `<main class="firstrun">
      <h1>${esc(EVENT.name)}</h1>
      <p>Sales field app. Sign in once with your <strong>@deepip.ai</strong> account — after that it works offline.</p>
      <div id="gbtn"></div>
      <p class="muted small">Do this before you fly.</p>
    </main>`;
  }

  return { esc, screen, renderStatus, reconnectBar, home, list, person, firm, searchScreen, searchResults,
           capture, tonight, summary, settings, signIn, personRow, onsite,
           checkin, checkinResults, hooks, introForm, intros, recap };
})();

// End-to-end test against the real Supabase project, driving headless Chrome through a
// local build. It creates a temporary account with made-up decisions, and always removes
// that account and its history afterward.
//
//   npm run build && npm run e2e -- <folder for screenshots>
//
// Serve the build first with the test account allowed:
//   ALLOWED_EMAILS=dew2-e2e@example.com npx next start --port 3400
//
// Set E2E_OWNER_EMAIL to your real account, which the suite checks is left untouched.

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const outDir = process.argv[2] ?? "/tmp/dew2-e2e";
mkdirSync(outDir, { recursive: true });
const BASE = "http://localhost:3400";
const EMAIL = "dew2-e2e@example.com";
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(URL_, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const projectRef = new URL(URL_).hostname.split(".")[0];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0, passes = 0;
const check = (label, ok, extra = "") => { if (ok) passes++; else failures++; console.log(`${ok ? "PASS" : "FAIL"} ${label} ${ok ? "" : extra}`); };
const must = ({ data, error }) => { if (error) throw new Error(error.message); return data; };

// ---------- the temporary account ----------
// Temporary catalog rows. None of them can reach a real account: the events are either
// inactive or in past weeks, and a week only shows up in Past Weeks with choices in it.
const REMOVED = "e2e-removed", HIDDEN = "e2e-hidden";
const PAST = [
  { start: "2026-10-05", id: "e2e-past-decided", name: "E2E Past Decided" },
  { start: "2026-09-28", id: "e2e-past-skipped", name: "E2E Past Skipped" },
  { start: "2026-09-21", id: "e2e-past-partial", name: "E2E Past Partial" },
  { start: "2026-09-14", id: "e2e-past-untouched", name: "E2E Past Untouched" },
];
const plusDays = (iso, n) => new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);

async function removeTestAccount() {
  const { data } = await admin.auth.admin.listUsers();
  const user = data?.users.find((u) => u.email === EMAIL);
  if (user) {
    await admin.auth.admin.deleteUser(user.id);
    await admin.from("response_log").delete().eq("user_id", user.id);
  }
  await admin.from("events").delete().in("id", [REMOVED, HIDDEN, ...PAST.map((p) => p.id)]);
  await admin.from("weeks").delete().in("start_date", PAST.map((p) => p.start));
}

async function addPastWeeks(userId) {
  must(await admin.from("weeks").insert(PAST.map((p) => ({ start_date: p.start, days: [1, 2, 3].map((n) => plusDays(p.start, n)), is_ready: true }))));
  must(await admin.from("events").insert(PAST.map((p) => ({ id: p.id, name: p.name, event_date: plusDays(p.start, 1), start_time: "19:00", price: 10 }))));
  must(await admin.from("responses").insert([
    { user_id: userId, event_id: PAST[0].id, answer: "yes", shortlist_rank: 1 },
    { user_id: userId, event_id: PAST[1].id, answer: "maybe", shortlist_rank: null },
    { user_id: userId, event_id: PAST[2].id, answer: "maybe", shortlist_rank: null },
  ]));
  must(await admin.from("plan_entries").insert({ user_id: userId, event_id: PAST[0].id, booking: "booked" }));
  must(await admin.from("week_states").insert([
    { user_id: userId, week_start: PAST[0].start, is_saved: true, is_skipped: false },
    { user_id: userId, week_start: PAST[1].start, is_saved: false, is_skipped: true },
  ]));
}

// Made-up decisions for the three weeks before the one under review: one commitment that
// isn't booked (on a sold-out event if there is one), one of each status, and one booked.
async function buildFixture(userId) {
  const responses = [], plan = [], states = [];
  const decide = async (monday, start, end, pick) => {
    const events = must(await admin.from("events").select("id, name, availability").eq("is_active", true).gte("event_date", start).lte("event_date", end).order("event_date").order("start_time"));
    const { yes, committed } = pick(events);
    const maybe = events.find((e) => !yes.includes(e));
    events.forEach((e) => {
      const rank = yes.indexOf(e);
      responses.push({ user_id: userId, event_id: e.id, answer: rank >= 0 ? "yes" : e === maybe ? "maybe" : "no", shortlist_rank: rank >= 0 ? rank + 1 : null });
    });
    committed.forEach(([e, booking]) => plan.push({ user_id: userId, event_id: e.id, booking }));
    states.push({ user_id: userId, week_start: monday, is_saved: true });
    return { committed, noCount: events.length - yes.length - 1 };
  };
  const notBooked = await decide("2026-11-02", "2026-11-03", "2026-11-05", (events) => {
    const first = events.find((e) => e.availability === "Sold Out") ?? events[0];
    return { yes: [first, ...events.filter((e) => e !== first).slice(0, 2)], committed: [[first, null]] };
  });
  const both = await decide("2026-11-09", "2026-11-10", "2026-11-12", (events) => ({ yes: events.slice(0, 4), committed: [[events[0], "waitlist"], [events[1], "booked"]] }));
  const booked = await decide("2026-11-16", "2026-11-17", "2026-11-19", (events) => ({ yes: events.slice(0, 4), committed: [[events[0], "booked"]] }));
  must(await admin.from("responses").insert(responses));
  must(await admin.from("plan_entries").insert(plan));
  must(await admin.from("week_states").insert(states));
  return { notBooked, both, booked };
}

async function createTestAccount() {
  await removeTestAccount();
  const owner = process.env.E2E_OWNER_EMAIL;
  const users = must(await admin.auth.admin.listUsers()).users;
  const source = users.find((u) => u.email === owner);
  if (!source) throw new Error("Set E2E_OWNER_EMAIL to the real account, which the suite checks is left untouched");
  const user = must(await admin.auth.admin.createUser({ email: EMAIL, email_confirm: true })).user;
  const fixture = await buildFixture(user.id);
  const link = must(await admin.auth.admin.generateLink({ type: "magiclink", email: EMAIL }));
  const anon = createClient(URL_, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const { session } = must(await anon.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" }));
  return { user, session, source, fixture };
}

// ---------- the browser ----------
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", "--disable-gpu", "--no-first-run", "--remote-debugging-port=9340", `--user-data-dir=${outDir}/profile`, "--window-size=1280,1250", "about:blank"], { stdio: "ignore" });
let id = 0, ws; const pending = new Map(), pageErrors = [];
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (x) => { const r = await send("Runtime.evaluate", { expression: x, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400)); return r.result.value; };
const go = async (path) => { await send("Page.navigate", { url: BASE + path }); await sleep(1500); };
const shot = async (name) => { const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true }); writeFileSync(`${outDir}/${name}.png`, Buffer.from(r.data, "base64")); };
const text = () => ev(`document.body.innerText`);
const has = async (t) => (await text()).includes(t);
const click = async (label, within) => {
  const ok = await ev(`(()=>{const root=${within ? `[...document.querySelectorAll('article')].find(a=>a.querySelector('h3')?.textContent.startsWith(${JSON.stringify(within)}))` : "document"};if(!root)return false;const b=[...root.querySelectorAll('button,a')].find(x=>x.textContent.trim()===${JSON.stringify(label)}||x.getAttribute('aria-label')===${JSON.stringify(label)});if(!b||b.disabled)return false;b.click();return true})()`);
  if (!ok) throw new Error(`could not click ${label}${within ? ` in ${within}` : ""}`);
  await sleep(350);
};
const menu = async (label) => { await click("More options"); await click(label); };
const viewport = (width, height, mobile = false) => send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
const noSideways = () => ev(`document.documentElement.scrollWidth<=window.innerWidth`);

let account;
const db = {
  responses: async () => must(await admin.from("responses").select("event_id, answer, shortlist_rank").eq("user_id", account.user.id)),
  plan: async () => must(await admin.from("plan_entries").select("event_id, booking").eq("user_id", account.user.id)),
  log: async () => must(await admin.from("response_log").select("kind, value").eq("user_id", account.user.id)),
  week: async (start) => must(await admin.from("week_states").select("is_saved, is_skipped").eq("user_id", account.user.id).eq("week_start", start).maybeSingle()),
};
const eventId = async (name, date) => must(await admin.from("events").select("id").ilike("name", `${name}%`).eq("event_date", date).single()).id;

async function setSession(session) {
  const value = `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;
  const name = `sb-${projectRef}-auth-token`;
  const size = 3180;
  const chunks = value.length <= size ? [[name, value]] : Array.from({ length: Math.ceil(value.length / size) }, (_, i) => [`${name}.${i}`, value.slice(i * size, (i + 1) * size)]);
  for (const [n, v] of chunks) await send("Network.setCookie", { name: n, value: v, domain: "localhost", path: "/" });
}

async function main() {
  account = await createTestAccount();
  const { notBooked, both, booked } = account.fixture;
  const notBookedEvent = notBooked.committed[0][0];
  const bothFirst = both.committed[0][0];
  const ownerBefore = must(await admin.from("responses").select("event_id, answer, shortlist_rank").eq("user_id", account.source.id));

  let t0; for (let i = 0; i < 40 && !t0; i++) { await sleep(500); try { t0 = (await (await fetch("http://localhost:9340/json")).json()).find((t) => t.type === "page"); } catch {} }
  ws = new WebSocket(t0.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.method === "Runtime.exceptionThrown") pageErrors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text); if (d.id && pending.has(d.id)) { pending.get(d.id)(d.result || d); pending.delete(d.id); } };
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await viewport(1280, 1250);
  await setSession(account.session);

  // ---------- home ----------
  await go("/"); let t = await text();
  check("home lists 7 weeks", ["Nov 2", "Nov 9", "Nov 16", "Nov 23", "Nov 30", "Dec 7", "Dec 14"].every((w) => t.includes(`Week of ${w}`)), t);
  const weekRows = must(await admin.from("weeks").select("start_date, is_ready").order("start_date"));
  const notReady = weekRows.filter((w) => !w.is_ready);
  check("home statuses", (t.match(/Decided/g) || []).length === 3 && (t.match(/To review/g) || []).length === weekRows.length - notReady.length - 3 && (t.match(/Not ready/g) || []).length === notReady.length, t);
  check("date ranges", ["Mon Nov 2 - Sun Nov 8", "Mon Nov 30 - Sun Dec 6"].every((r) => t.includes(r)));
  const row = (start) => ev(`document.getElementById('week-${start}').innerText`);
  check("past weeks aren't listed", !t.includes("Past\n"));
  const n9 = await row("2026-11-09");
  check("nov 9 row", n9.includes(bothFirst.name) && n9.includes("(+1 other)") && n9.includes("1 booked, 1 on waitlist"), n9);
  check("nov 2 row says Not booked", (await row("2026-11-02")).includes("Not booked"));
  check("nov 16 row says Booked", (await row("2026-11-16")).includes("Booked"));
  check("nov 23 row counts options", (await row("2026-11-23")).includes("5 options to go through"));
  check("home images load", await ev(`[...document.images].every(i=>i.complete&&i.naturalWidth>0)`));
  check("cream background", await ev(`getComputedStyle(document.body).backgroundColor==='rgb(248, 242, 230)'`));
  check("display font loaded", await ev(`getComputedStyle(document.querySelector('.heading')).fontFamily.toLowerCase().includes('baloo')`));
  await shot("home");

  // ---------- decided weeks ----------
  for (const [start, want] of [["2026-11-02", [notBookedEvent.name, "Not booked", "Booked?", `${notBooked.noCount} you said no to`]], ["2026-11-09", [bothFirst.name, "Waitlist", "Booked", `${both.noCount} you said no to`]], ["2026-11-16", [booked.committed[0][0].name, "Booked", `${booked.noCount} you said no to`]]]) {
    await go("/"); await ev(`document.getElementById('week-${start}').click()`); await sleep(1500); t = await text();
    check(`${start} opens decided`, want.every((x) => t.includes(x)) && t.includes("Your plan") && t.includes("All Options") && !t.includes("Prices and availability as of"), t.slice(0, 400));
    check(`${start} plan tagged in All Options`, await ev(`[...document.querySelectorAll('.plan-card')].length>0&&[...document.querySelectorAll('.plan-card')].every(c=>document.getElementById(c.id.replace('plan-','item-'))?.querySelector('.tag.booked,.tag.waitlist,.tag.notbooked'))`));
    await ev(`window.scrollTo(0,99999)`); await sleep(600);
    check(`${start} images load`, await ev(`[...document.images].every(i=>i.complete&&i.naturalWidth>0)`), await ev(`[...document.images].filter(i=>!i.naturalWidth).map(i=>i.src).join()`));
    await shot(start);
  }
  await go("/weeks/2026-11-09"); check("a booking status replaces the availability tag", await ev(`[...document.querySelectorAll('.plan-card')].every(c=>c.querySelectorAll('.tags .tag').length===1)`));
  if (notBookedEvent.availability === "Sold Out") { await go("/weeks/2026-11-02"); check("a not booked plan still shows Sold out", await ev(`document.querySelector('.plan-card').innerText.includes('Sold out')`)); }

  // ---------- new events in open and locked weeks ----------
  // An unanswered event is what a newly added one looks like to the app.
  const extraNo = must(await admin.from("responses").select("event_id").eq("user_id", account.user.id).eq("answer", "no").in("event_id", must(await admin.from("events").select("id").gte("event_date", "2026-11-03").lte("event_date", "2026-11-05").eq("is_active", true)).map((e) => e.id)).limit(2)).map((r) => r.event_id);
  must(await admin.from("responses").delete().eq("user_id", account.user.id).in("event_id", extraNo));
  await go("/");
  let nov2 = await row("2026-11-02");
  check("home shows options to review", nov2.includes("Not booked") && nov2.includes("2 options to review"), nov2);
  await shot("home-to-review");
  await go("/weeks/2026-11-02");
  check("decided page shows the banner", (await ev(`document.getElementById('review-banner')?.innerText`) ?? "").includes("2 options to review"));
  check("All Options lists them with a tag", (await ev(`[...document.querySelectorAll('#your-week .tag')].filter(t=>t.textContent==='To review').length`)) === 2);
  await shot("decided-to-review");
  const noteTag = (id) => ev(`document.getElementById('item-${id}')?.innerText`);
  await click(`Booked: ${notBookedEvent.name}`);
  check("booking locks the week: no banner", !(await ev(`!!document.getElementById('review-banner')`)));
  check("booking locks the week: no tags", (await ev(`[...document.querySelectorAll('#your-week .tag')].filter(t=>t.textContent==='To review').length`)) === 0);
  check("a locked week hides unanswered events", !(await noteTag(extraNo[0])));
  await go("/"); check("locked week has no prompt on home", !(await row("2026-11-02")).includes("to review"));
  await go("/weeks/2026-11-02"); await click(`Booked: ${notBookedEvent.name}`);
  check("removing the booking brings the banner back", await ev(`!!document.getElementById('review-banner')`));
  await viewport(1280, 500);
  await click("Review options"); await sleep(400);
  check("review opens at the first unanswered event", await ev(`(()=>{const c=document.getElementById('event-${extraNo[0]}');if(!c)return false;const r=c.getBoundingClientRect();return r.top>=document.getElementById('save-bar').getBoundingClientRect().bottom&&r.top<innerHeight})()`));
  await viewport(1280, 1250);
  await ev(`document.querySelector('#event-${extraNo[0]} .answers button').click()`); await sleep(350);
  await ev(`document.querySelector('#event-${extraNo[1]} .answers button').click()`); await sleep(350);
  await click("Save your plan");
  check("answering them clears the banner", !(await ev(`!!document.getElementById('review-banner')`)));
  await go("/"); check("and clears the home prompt", !(await row("2026-11-02")).includes("to review"));
  await go("/weeks/2026-11-02"); check("plan cards show the checked date", /Checked \w+ \d+/.test(await ev(`document.querySelector('.plan-card').innerText`)));
  check("every plan card links to Google Calendar", await ev(`[...document.querySelectorAll('.plan-card')].every(c=>{const a=c.querySelector('a.calendar-link');return a&&a.target==='_blank'&&a.textContent==='Add to Google Calendar'&&a.href.startsWith('https://calendar.google.com/calendar/render?action=TEMPLATE')})`));
  check("All Options has no calendar link", !(await ev(`!!document.querySelector('#your-week .calendar-link')`)));

  // ---------- events removed from Notion ----------
  must(await admin.from("events").insert([
    { id: REMOVED, name: "E2E Removed Event", event_date: "2026-11-18", start_time: "19:00", is_active: false },
    { id: HIDDEN, name: "E2E Hidden Event", event_date: "2026-11-18", start_time: "20:00", is_active: false },
  ]));
  must(await admin.from("responses").insert([
    { user_id: account.user.id, event_id: REMOVED, answer: "yes", shortlist_rank: 9 },
    { user_id: account.user.id, event_id: HIDDEN, answer: "maybe", shortlist_rank: null },
  ]));
  must(await admin.from("plan_entries").insert({ user_id: account.user.id, event_id: REMOVED, booking: null }));
  await go("/weeks/2026-11-16"); t = await text();
  check("a removed committed event stays on the plan", t.includes("E2E Removed Event") && t.includes("No longer listed"));
  check("its booking buttons still work", await ev(`!!document.querySelector('#plan-${REMOVED} .booked-btns button')`));
  check("it can still be added to Google Calendar", await ev(`!!document.querySelector('#plan-${REMOVED} .calendar-link')`));
  check("a removed uncommitted event is hidden", !t.includes("E2E Hidden Event"));
  check("a removed event isn't up for review", !(await ev(`!!document.getElementById('review-banner')`)));
  check("a missing poster doesn't break the page", await ev(`!!document.querySelector('#plan-${REMOVED} .no-poster')`));
  await shot("removed-event");
  await click("Change my answers"); check("the review also marks it", (await ev(`document.getElementById('pick-${REMOVED}').innerText`)).includes("No longer listed"));
  await go("/weeks/2026-11-16");
  must(await admin.from("responses").delete().eq("user_id", account.user.id).in("event_id", [REMOVED, HIDDEN]));

  // ---------- past weeks ----------
  await go("/past-weeks"); check("past weeks starts empty", await has("No past weeks yet."));
  await addPastWeeks(account.user.id);
  await go("/past-weeks"); t = await text();
  const pastOrder = await ev(`[...document.querySelectorAll('#past-weeks .row')].map(r=>r.id).join()`);
  check("past weeks are most recent first, without untouched ones", pastOrder === "week-2026-10-05,week-2026-09-28,week-2026-09-21", pastOrder);
  check("past rows show their state", t.includes("E2E Past Decided") && t.includes("Booked") && t.includes("Skipped") && t.includes("No plan") && t.includes("1 of 1 answered"), t);
  await shot("past-weeks");
  await go("/"); check("home leaves past weeks out", !(await has("Week of Oct 5")));
  await click("Account"); check("menu order", (await ev(`[...document.querySelectorAll('#account-menu a,#account-menu button')].map(x=>x.textContent.trim()).join()`)) === "Settings,Past Weeks,Log out");
  await click("Past Weeks"); await sleep(1000); check("menu opens past weeks", (await ev(`location.pathname`)) === "/past-weeks");
  await ev(`document.getElementById('week-2026-10-05').click()`); await sleep(1200); t = await text();
  check("a past week is read-only", t.includes("E2E Past Decided") && !t.includes("Change my answers") && !t.includes("Booked?") && !t.includes("Checked") && t.includes("← Past weeks"), t.slice(0, 200));
  check("a past week has no calendar link", !t.includes("Add to Google Calendar"));
  await click("← Past weeks"); await sleep(1000); check("back goes to past weeks", (await ev(`location.pathname`)) === "/past-weeks");
  await go("/weeks/2026-09-28"); t = await text(); check("a skipped past week can't be unskipped", t.includes("You skipped this week") && !t.includes("Review this week"));
  await go("/weeks/2026-09-21"); t = await text(); check("a past week without a plan says so", t.includes("You didn't save a plan") && t.includes("E2E Past Partial") && !t.includes("Are you interested?"), t.slice(0, 200));

  // ---------- booking saves ----------
  const alone = notBookedEvent.name;
  const aloneId = notBookedEvent.id;
  const planTag = () => ev(`document.querySelector('.plan-card .tag').textContent`);
  await go("/weeks/2026-11-02"); check("starts not booked", (await planTag()) === "Not booked");
  await click(`Booked: ${alone}`); check("Yes sets Booked", (await planTag()) === "Booked");
  check("booking is in the database", (await db.plan()).find((p) => p.event_id === aloneId)?.booking === "booked");
  await go("/weeks/2026-11-02"); check("booking survives reload", (await planTag()) === "Booked");
  await click(`Waitlist: ${alone}`); check("Waitlist replaces it", (await planTag()) === "Waitlist");
  await click("← All weeks"); await sleep(1200); check("home line follows", (await row("2026-11-02")).includes("Waitlist"));
  await go("/weeks/2026-11-02"); await click(`Waitlist: ${alone}`); check("tap again clears it", (await planTag()) === "Not booked");
  check("clearing is in the database", (await db.plan()).find((p) => p.event_id === aloneId)?.booking === null);
  await click(`Booked: ${alone}`);
  await click("Change my answers"); await click("Save your plan"); check("booking survives changing answers", (await planTag()) === "Booked");
  await click("Change my answers"); await click(`Commit: ${alone}`); await click(`Commit: ${alone}`); await click("Save your plan");
  check("uncommitting clears the booking", (await planTag()) === "Not booked");
  await click("Change my answers"); await click(`Commit: ${alone}`);
  await click("All weeks"); await sleep(1200);
  check("no commitments left reads as To review", (await row("2026-11-02")).includes("To review"));
  await go("/weeks/2026-11-02"); check("and opens the review", await has("Are you interested?"));

  // ---------- review ----------
  const W = "/weeks/2026-11-23";
  await go(W); t = await text();
  check("review opens", t.includes("Are you interested?") && t.includes("Thanksgiving. Nothing is listed") && t.includes("Mon Nov 23 - Sun Nov 29"));
  check("question in every card above the answers", await ev(`[...document.querySelectorAll('.card')].length===5&&[...document.querySelectorAll('.card')].every(c=>{const q=c.querySelector('.ask'),a=c.querySelector('.answers');const qr=q.getBoundingClientRect(),ar=a.getBoundingClientRect();return q.nextElementSibling===a&&qr.bottom<=ar.top&&ar.top-qr.bottom<12&&Math.abs((qr.left+qr.right)/2-(ar.left+ar.right)/2)<1})`));
  check("save starts disabled", await ev(`document.getElementById('save-plan').disabled`));
  await viewport(1280, 500); await sleep(300);
  const stuck = (i) => ev(`Math.abs(document.querySelectorAll('.day-head')[${i}].getBoundingClientRect().top-document.getElementById('save-bar').getBoundingClientRect().bottom)<1`);
  const y1 = await ev(`document.querySelectorAll('.section')[1].getBoundingClientRect().top+scrollY`);
  await ev(`window.scrollTo(0,${y1 - 300})`); await sleep(150); check("day header sticks under the bar", await stuck(0));
  await ev(`window.scrollTo(0,${y1 + 120})`); await sleep(150); check("next day takes over", await stuck(1));
  await ev(`window.scrollTo(0,0)`); await viewport(1280, 1250); await sleep(200);

  await click("Yes", "When Art"); await click("Yes", "Ink"); await click("Maybe", "Zoe"); await click("No", "The Evolutionary");
  t = await text();
  check("summary counts", t.includes("4 of 5 answered") && t.includes("2 on your shortlist"), t.slice(0, 200));
  check("No collapses to a row", t.includes("No: The Evolutionary Psychology of Infidelity"));
  check("maybe listed", /Your maybes\s+Zoe Bayani/.test(t));
  const ink = await eventId("Ink & Drink", "2026-11-24"), art = await eventId("When Art", "2026-11-25"), evo = await eventId("The Evolutionary", "2026-11-24");
  let rs = await db.responses();
  check("answers are in the database", rs.find((r) => r.event_id === art)?.shortlist_rank === 1 && rs.find((r) => r.event_id === ink)?.shortlist_rank === 2 && rs.find((r) => r.event_id === evo)?.answer === "no");
  await click("Restore The Evolutionary Psychology of Infidelity");
  check("Restore brings the card back and clears the answer", (await ev(`[...document.querySelectorAll('article h3')].some(h=>h.textContent.startsWith('The Evolutionary'))`)) && !(await db.responses()).some((r) => r.event_id === evo));
  await click("No", "The Evolutionary");
  const order = () => ev(`[...document.querySelectorAll('#shortlist b')].map(b=>b.textContent)`);
  const a = await order(); await click("Move When Art Was Dangerous: Surrealism During World War II down"); const b = await order();
  check("re-rank", a[0] === b[1] && a[1] === b[0]);
  rs = await db.responses(); check("rank is in the database", rs.find((r) => r.event_id === ink)?.shortlist_rank === 1 && rs.find((r) => r.event_id === art)?.shortlist_rank === 2);
  await go(W); check("answers survive reload", (await order())[0] === "Ink & Drink" && (await has("4 of 5 answered")));

  check("shortlist rows show the checked date", /Checked \w+ \d+/.test(await ev(`document.querySelector('.pick').innerText`)));
  check("commit button label", (await ev(`[...document.querySelectorAll('#shortlist .pick-actions .btn')].map(b=>b.textContent).join()`)) === "Commit,Commit");
  check("warning shows before commit", await has("Commit to at least one to save your plan."));
  await click("Commit: When Art Was Dangerous: Surrealism During World War II");
  check("committed label and save enabled", (await has("Committed")) && !(await ev(`document.getElementById('save-plan').disabled`)));
  await shot("review");
  await click("Save your plan"); t = await text();
  check("save shows decided", t.includes("Your plan") && t.includes("Not booked") && t.includes("Booked?") && t.includes("1 you said no to"));
  check("saved in the database", (await db.week("2026-11-23"))?.is_saved === true);
  await go(W); check("plan survives reload", await has("Your plan"));
  await click("All weeks").catch(() => click("← All weeks")); await sleep(1200);
  check("home shows it decided", (await row("2026-11-23")).includes("Decided"));

  // Leaving straight after a change still saves it.
  await go(W); await click("Change my answers"); await ev(`[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')==='Commit: Ink & Drink').click();[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')==='All weeks').click()`); await sleep(2000);
  check("leaving right after a change keeps it", (await row("2026-11-23")).includes("(+1 other)"), await row("2026-11-23"));

  // The back button must not show stale choices.
  await ev(`document.getElementById('week-2026-11-23').click()`); await sleep(1500);
  await click(`Booked: Ink & Drink`); await click("← All weeks"); await sleep(1200);
  await send("Page.navigate", { url: `${BASE}/` }); await sleep(800);
  await ev(`history.back()`); await sleep(1800);
  check("back button shows current choices", await ev(`[...document.querySelectorAll('.plan-card')].find(c=>c.innerText.includes('Ink & Drink'))?.querySelector('.tag').textContent==='Booked'`));

  // A change from another device shows up on returning to the page.
  const inkPlan = { booking: "waitlist" };
  must(await admin.from("plan_entries").update(inkPlan).eq("user_id", account.user.id).eq("event_id", ink));
  await ev(`document.dispatchEvent(new Event('visibilitychange'))`); await sleep(1200);
  check("another device's change appears", await ev(`[...document.querySelectorAll('.plan-card')].find(c=>c.innerText.includes('Ink & Drink'))?.querySelector('.tag').textContent==='Waitlist'`));

  // ---------- reset ----------
  await click("Change my answers"); await menu("Reset Choices");
  const dialogOpen = () => ev(`document.getElementById('confirm-reset').open`);
  check("reset asks first", (await dialogOpen()) && (await has("Your answers and plan will be cleared.")));
  await click("Cancel"); check("cancel keeps the week", !(await dialogOpen()) && (await has("2 on your shortlist")));
  const logBefore = (await db.log()).length;
  await menu("Reset Choices"); await click("Reset"); await sleep(500);
  t = await text(); check("reset clears the page", t.includes("0 of 5 answered") && !t.includes("Your plan"), t.slice(0, 300));
  const inWeek = (await db.responses()).filter((r) => [ink, art, evo].includes(r.event_id));
  check("reset clears the database", inWeek.length === 0 && (await db.week("2026-11-23")).is_saved === false);
  check("history survives a reset", (await db.log()).length > logBefore);
  await go(W); check("reset survives reload", await has("0 of 5 answered"));
  await menu("Reset Choices"); check("blank week skips the confirmation", !(await dialogOpen()));

  // ---------- skip ----------
  await click("Yes", "Ink"); await menu("Skip this week"); t = await text();
  check("skip shows the skipped page", t.includes("You're skipping this week") && !t.includes("Are you interested?"));
  await click("← All weeks"); await sleep(1200); check("home shows Skipped", (await row("2026-11-23")).includes("Skipped")); await shot("home-skipped");
  await go(W); check("skip survives reload", await has("You're skipping this week"));
  await click("Review this week"); t = await text(); check("undo skip keeps answers", t.includes("1 on your shortlist") && t.includes("Are you interested?"));
  await menu("Reset Choices"); await click("Reset");
  await go("/weeks/2026-11-09"); await click("Change my answers"); await menu("Skip this week"); await click("Review this week");
  check("unskip returns a decided week to its plan", await has("Your plan"));

  // ---------- menus ----------
  await go(W); const menuOpen = () => ev(`!!document.getElementById('more-menu')`);
  check("menu starts closed", !(await menuOpen())); await click("More options"); check("menu opens", await menuOpen());
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }); await sleep(100);
  check("escape closes the menu", !(await menuOpen()));
  await click("More options"); await ev(`document.querySelector('.main').click()`); await sleep(100); check("clicking elsewhere closes the menu", !(await menuOpen()));

  // ---------- shortlist scrolls on its own ----------
  await viewport(1280, 500); await go(W);
  for (const n of ["When Art", "Ink", "Zoe", "The Slim"]) await click("Yes", n);
  const sl = `document.getElementById('shortlist')`;
  check("shortlist overflows and the rail fits", await ev(`${sl}.scrollHeight>${sl}.clientHeight&&document.querySelector('.rail').getBoundingClientRect().bottom<=innerHeight`));
  const m = JSON.parse(await ev(`(()=>{const r=${sl}.getBoundingClientRect();return JSON.stringify({x:r.left+r.width/2,y:r.top+r.height/2})})()`));
  const wheel = async (d) => { await send("Input.dispatchMouseEvent", { type: "mouseWheel", x: m.x, y: m.y, deltaX: 0, deltaY: d }); await sleep(500); };
  await wheel(150); check("scroll over the shortlist moves the list", await ev(`${sl}.scrollTop>0&&scrollY===0`));
  const kept = await ev(`${sl}.scrollTop`); await click("Commit: Ink & Drink"); check("list scroll survives a click", (await ev(`${sl}.scrollTop`)) === kept);
  await wheel(5000); await wheel(300); await wheel(300); check("page scrolls once the list ends", await ev(`${sl}.scrollTop+${sl}.clientHeight>=${sl}.scrollHeight-1&&scrollY>0`));
  await ev(`window.scrollTo(0,0)`); await menu("Reset Choices"); await click("Reset");

  // ---------- settings ----------
  await viewport(1280, 1250); await go("/");
  const acct = () => ev(`!!document.getElementById('account-menu')`);
  check("account menu starts closed", !(await acct())); await click("Account"); t = await text(); check("account menu items", t.includes("Settings") && t.includes("Log out")); await shot("home-account-menu");
  await click("Settings"); await sleep(1000); t = await text();
  check("locked message on top", t.trim().startsWith("Settings are locked for v1."), t.slice(0, 100));
  check("days", (await ev(`[...document.querySelectorAll('#settings-days li.on')].map(l=>l.textContent).join()`)) === "T,W,Th" && (await ev(`document.querySelectorAll('#settings-days li').length`)) === 7);
  check("sources", (await ev(`[...document.querySelectorAll('#settings-sources li.on')].map(l=>l.textContent).join()`)) === "Baby's All Right,Lectures on Tap,Recess Grove,The Moth");
  await shot("settings");
  if (notReady.length) { await go(`/weeks/${notReady[0].start_date}`); check("a week that isn't ready goes home", (await ev(`location.pathname`)) === "/"); }
  await go("/weeks/not-a-date"); check("a bad address shows not found", await has("doesn't exist"));

  // ---------- phone ----------
  for (const [w, h] of [[390, 844], [320, 568]]) {
    await viewport(w, h, true);
    for (const path of ["/", W, "/weeks/2026-11-09", "/settings"]) { await go(path); check(`no sideways scroll ${w} ${path}`, await noSideways()); await shot(`phone-${w}${path.replaceAll("/", "-")}`); }
  }
  await viewport(390, 844, true); await go(W);
  const rail = `document.getElementById('rail')`, vis = `getComputedStyle(${rail}).visibility==='visible'`;
  check("bar is one row", await ev(`document.getElementById('save-bar').offsetHeight<=64`), await ev(`document.getElementById('save-bar').offsetHeight`));
  check("bar holds week, shortlist, save", await ev(`(()=>{const t=document.getElementById('save-bar').innerText;return t.includes('Nov 23')&&t.includes('Shortlist (0)')&&t.includes('Save')&&!!document.getElementById('more')})()`));
  check("dates and progress on the page", await ev(`document.querySelector('.phone-sum').innerText.includes('Mon Nov 23 - Sun Nov 29')&&document.querySelector('.phone-sum').innerText.includes('0 of 5 answered')`));
  check("answers run full width", await ev(`Math.abs(document.querySelector('.answers').getBoundingClientRect().width-(document.querySelector('.card').getBoundingClientRect().width-24))<1`));
  check("buttons are tall enough", await ev(`[...document.querySelectorAll('.answers .btn,#save-bar .btn,#save-bar .save,#save-bar .more')].every(b=>b.offsetHeight>=44)`));
  check("sheet starts closed", !(await ev(vis)));
  await click("Yes", "Ink"); await click("Yes", "When Art");
  check("count updates, sheet stays closed", (await ev(`document.getElementById('open-sheet').textContent==='Shortlist (2)'`)) && !(await ev(vis)));
  await click("No", "The Evolutionary"); await click("No", "Zoe");
  const noRows = `[...document.querySelectorAll('.said-no')]`;
  const noRowChecks = (width) => ev(`${noRows}.length===2&&${noRows}.every(r=>{const b=r.querySelector('.link').getBoundingClientRect(),c=r.getBoundingClientRect(),i=r.querySelector('span').getBoundingClientRect(),tm=r.querySelector('.said-no-time').getClientRects();return tm.length===1&&i.right<=b.left&&Math.abs(c.right-b.right)<=14&&Math.abs((b.top+b.bottom)/2-(c.top+c.bottom)/2)<2})&&document.documentElement.scrollWidth<=${width}`);
  check("No rows keep Restore in its own column", await noRowChecks(390));
  check("a long No row wraps its title", await ev(`${noRows}[0].querySelector('span').getClientRects()[0].height>30`));
  await shot("phone-no-rows");
  await viewport(320, 568, true); await sleep(200); check("No rows hold up at 320", await noRowChecks(320));
  await viewport(390, 844, true); await sleep(200);
  await click("Restore The Evolutionary Psychology of Infidelity"); await click("Restore Zoe Bayani");
  await click("Shortlist (2)"); await sleep(350);
  check("sheet opens below the bar", (await ev(vis)) && (await ev(`Math.round(${rail}.getBoundingClientRect().bottom)<=innerHeight&&${rail}.getBoundingClientRect().top>=document.getElementById('save-bar').getBoundingClientRect().bottom`)));
  check("focus moves to Done", await ev(`document.activeElement.id==='close-sheet'`)); await shot("phone-sheet");
  await click("Move When Art Was Dangerous: Surrealism During World War II up"); check("sheet stays open while ranking", await ev(`${rail}.classList.contains('open')`));
  await click("Done"); await sleep(350); check("Done closes", !(await ev(vis)));
  await click("Shortlist (2)"); await sleep(100); await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }); await sleep(350); check("escape closes the sheet", !(await ev(vis)));
  await click("Shortlist (2)"); await sleep(350); await ev(`document.getElementById('scrim').click()`); await sleep(350); check("tapping outside closes the sheet", !(await ev(vis)));
  await click("Shortlist (2)"); await click("Commit: Ink & Drink"); await click("Save your plan"); await sleep(400);
  t = await text(); check("save from the bar shows the plan", t.includes("Your plan") && t.includes("Booked?"));
  await click("Change my answers"); check("sheet closed after reopening", !(await ev(`${rail}.classList.contains('open')`)));
  await menu("Reset Choices"); await click("Reset"); await sleep(300);
  await viewport(820, 1100); await go(W); check("tablet uses the sheet too", await ev(`getComputedStyle(document.getElementById('open-sheet')).display!=='none'&&!(${vis})`));
  await viewport(1280, 1250); await go(W); check("desktop hides the sheet button", await ev(`getComputedStyle(document.getElementById('open-sheet')).display==='none'&&${vis}`));

  // ---------- security and the real data ----------
  const ownerAfter = must(await admin.from("responses").select("event_id, answer, shortlist_rank").eq("user_id", account.source.id));
  const key = (rows) => JSON.stringify(rows.map((r) => [r.event_id, r.answer, r.shortlist_rank]).sort());
  check("the owner's data is untouched", key(ownerBefore) === key(ownerAfter));
  check("no page errors", pageErrors.length === 0, [...new Set(pageErrors)].join(" | ").slice(0, 500));

  // ---------- log out, last because it ends the session ----------
  await go("/"); await click("Account"); await click("Log out"); await sleep(1200);
  check("log out goes to login", (await ev(`location.pathname`)) === "/login" && (await has("Continue with Google")));
  await go("/"); check("signed out stays out", (await ev(`location.pathname`)) === "/login");
}

try {
  await main();
} catch (error) {
  failures++;
  console.error("ERROR", error.message);
  if (ws) await shot("error").catch(() => {});
} finally {
  await removeTestAccount();
  console.log(`test account removed. ${passes} passed, ${failures} failed.`);
  ws?.close(); chrome.kill(); process.exit(failures ? 1 : 0);
}

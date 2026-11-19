import { fetchIncidents, ack } from './api.js';

const REFRESH_MS = 2000; // R4

const loader = document.querySelector('[data-testid="loader"]');
const empty = document.querySelector('[data-testid="empty"]');
const list = document.querySelector('[data-testid="incident-list"]');
const errorBox = document.querySelector('.error');

// R6: the footer shows the same build as <meta name="build">.
const build = document.querySelector('meta[name="build"]')?.content || 'dev';
document.querySelector('[data-testid="build-sha"]').textContent = build;

// R5: viewer's own zone and locale order (en-GB/de-DE → dd/mm, en-US → mm/dd).
const fmt = new Intl.DateTimeFormat(undefined, {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

const rows = new Map(); // incident id -> <li>; rows are kept, never rebuilt, so ack state survives refresh
const acked = new Map(); // incident id -> ack reply

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function markAcked(li, reply) {
  li.querySelector('[data-testid="ack"]')?.remove();
  if (li.querySelector('[data-testid="acked"]')) return;
  const mark = el('span', 'acked', 'acked');
  mark.dataset.testid = 'acked';
  if (reply?.ackedAt) mark.title = `acked ${fmt.format(new Date(reply.ackedAt))}`;
  li.querySelector('.act').append(mark);
  li.classList.add('is-acked');
}

function makeRow(i) {
  const li = el('li', `row ${i.severity}`);
  li.dataset.testid = 'incident-row';
  li.dataset.id = i.id;
  li.append(el('span', 'id', i.id), el('span', 'sev', i.severity), el('span', 'what', `${i.service} · ${i.region} · ${i.summary}`));
  const t = el('time', null, fmt.format(new Date(i.openedAt)));
  t.dateTime = i.openedAt; // full UTC value stays in the attribute
  li.append(t);
  const act = el('span', 'act');
  const btn = el('button', 'ack', 'Ack');
  btn.type = 'button';
  btn.dataset.testid = 'ack';
  btn.addEventListener('click', () => onAck(i.id, li, btn));
  act.append(btn);
  li.append(act);
  if (acked.has(i.id)) markAcked(li, acked.get(i.id));
  return li;
}

async function onAck(id, li, btn) {
  btn.disabled = true;
  btn.textContent = 'Acking…';
  try {
    const reply = await ack(id); // R2: the row's own id
    acked.set(id, reply);
    markAcked(li, reply);
  } catch (e) {
    btn.disabled = false;
    btn.textContent = 'Ack';
    showError(`Ack failed for ${id}: ${e.message}`);
  }
}

function showError(msg) {
  errorBox.textContent = msg;
  errorBox.hidden = false;
}

function render(incidents) {
  // R1: newest first. Add new rows, update moved ones, keep existing nodes (and their ack state).
  const ids = new Set(incidents.map((i) => i.id));
  for (const [id, li] of rows) if (!ids.has(id)) { li.remove(); rows.delete(id); }
  let prev = null;
  for (const i of incidents) {
    let li = rows.get(i.id);
    if (!li) { li = makeRow(i); rows.set(i.id, li); }
    const want = prev ? prev.nextSibling : list.firstChild;
    if (want !== li) list.insertBefore(li, want);
    prev = li;
  }
  list.hidden = incidents.length === 0;
  empty.hidden = incidents.length !== 0;
}

async function tick() {
  try {
    const page = await fetchIncidents();
    render(page.incidents);
    errorBox.hidden = true;
  } catch (e) {
    showError(`Could not load incidents: ${e.message}`);
  } finally {
    loader.hidden = true; // R3: gone once the first answer is in
    loader.remove();
    setTimeout(tick, REFRESH_MS); // R4: every 2 s, never two requests at once
  }
}

tick();

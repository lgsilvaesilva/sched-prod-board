import { fetchIncidents, ack } from './api.js';

const REFRESH_MS = 2000; // R4

const loader = document.querySelector('[data-testid="loader"]');
const empty = document.querySelector('[data-testid="empty"]');
const list = document.querySelector('[data-testid="incident-list"]');
const errorBox = document.querySelector('.error');
const panel = document.querySelector('[data-testid="incident-panel"]');
const panelAck = document.querySelector('[data-testid="panel-ack"]');

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

const incidents = new Map(); // id -> incident as first seen
const rows = new Map(); // id -> <li>; rows are kept, never rebuilt or removed, so nothing moves out from under a reader
const acked = new Map(); // id -> ack reply
let openId = null; // incident shown in the panel

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function markAcked(li, reply) {
  if (li.querySelector('[data-testid="acked"]')) return;
  const mark = el('span', 'acked', 'acked');
  mark.dataset.testid = 'acked';
  if (reply?.ackedAt) mark.title = `acked ${fmt.format(new Date(reply.ackedAt))}`;
  li.querySelector('.act').append(mark);
  li.classList.add('is-acked');
}

// R2 (changed by product after step 1): the row has no Ack. Picking a row opens its incident panel; Ack lives there.
function makeRow(i) {
  const li = el('li', `row ${i.severity}`);
  li.dataset.testid = 'incident-row';
  li.dataset.id = i.id;
  li.tabIndex = 0;
  li.setAttribute('role', 'button');
  li.setAttribute('aria-label', `Open ${i.id}`);
  li.append(el('span', 'id', i.id), el('span', 'sev', i.severity), el('span', 'what', `${i.service} · ${i.region} · ${i.summary}`));
  const t = el('time', null, fmt.format(new Date(i.openedAt)));
  t.dateTime = i.openedAt; // full UTC value stays in the attribute
  li.append(t, el('span', 'act'));
  li.addEventListener('click', () => openPanel(i.id));
  li.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPanel(i.id); }
  });
  if (acked.has(i.id)) markAcked(li, acked.get(i.id));
  return li;
}

function openPanel(id) {
  openId = id;
  const i = incidents.get(id);
  for (const [rid, li] of rows) li.classList.toggle('is-open', rid === id);
  panel.querySelector('.p-id').textContent = i.id;
  panel.querySelector('.p-sev').textContent = i.severity;
  panel.querySelector('.p-sev').className = `p-sev ${i.severity}`;
  panel.querySelector('.p-what').textContent = `${i.service} · ${i.region} · ${i.summary}`;
  const t = panel.querySelector('.p-time');
  t.dateTime = i.openedAt;
  t.textContent = fmt.format(new Date(i.openedAt));
  renderPanelState();
  panel.hidden = false;
}

function renderPanelState() {
  const done = acked.get(openId);
  panelAck.hidden = !!done;
  panelAck.disabled = false;
  panelAck.textContent = `Ack ${openId}`;
  const state = panel.querySelector('.p-state');
  state.textContent = done ? `Acked ${fmt.format(new Date(done.ackedAt))}` : '';
  state.hidden = !done;
}

panelAck.addEventListener('click', async () => {
  const id = openId; // the incident the panel names, whatever the list does meanwhile
  panelAck.disabled = true;
  panelAck.textContent = `Acking ${id}…`;
  try {
    const reply = await ack(id);
    acked.set(id, reply);
    markAcked(rows.get(id), reply);
  } catch (e) {
    showError(`Ack failed for ${id}: ${e.message}`);
  }
  if (openId === id) renderPanelState();
});

panel.querySelector('.p-close').addEventListener('click', closePanel);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) closePanel(); });
function closePanel() {
  panel.hidden = true;
  rows.get(openId)?.classList.remove('is-open');
  openId = null;
}

function showError(msg) {
  errorBox.textContent = msg;
  errorBox.hidden = false;
}

function render(page) {
  // R1: newest first, live. New incidents go on top; rows already on the board stay (an answer that no longer
  // lists one does not take it away while someone may be reading it).
  const fresh = [];
  for (const i of page) if (!rows.has(i.id)) fresh.push(i);
  for (const i of fresh.reverse()) {
    incidents.set(i.id, i);
    const li = makeRow(i);
    rows.set(i.id, li);
    list.prepend(li);
  }
  list.hidden = rows.size === 0;
  empty.hidden = rows.size !== 0;
}

async function tick() {
  try {
    const page = await fetchIncidents();
    render(page.incidents);
    errorBox.hidden = true;
  } catch (e) {
    showError(`Could not load incidents: ${e.message}`);
  } finally {
    loader.remove(); // R3: gone once the first answer is in
    setTimeout(tick, REFRESH_MS); // R4: every 2 s, never two requests at once
  }
}

tick();

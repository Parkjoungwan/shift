// Admin console. The page itself is public; every API call needs the admin token.

const $ = (id) => document.getElementById(id);
const INK = ["#222222", "#d03a3a", "#2a6fb8", "#2e9a4a"];
const NAMES = { key: "출입 카드", tall: "보행 보조 장치", light: "조명", echo: "잔상 기록기" };
let token = "";
try { token = sessionStorage.getItem("shift.admin") ?? ""; } catch { /* ignore */ }
let timer = null;

async function api(path, body) {
  const res = await fetch("/admin/api" + path, {
    method: body ? "POST" : "GET",
    headers: { Authorization: "Bearer " + token, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) { stop("토큰이 맞지 않습니다"); throw new Error("unauthorized"); }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? res.statusText);
  return data;
}

async function act(path, body, confirmText) {
  if (confirmText && !confirm(confirmText)) return;
  try { await api(path, body ?? {}); } catch (e) { alert(e.message); }
  refresh();
}

function stop(message) {
  clearInterval(timer); timer = null;
  $("app").hidden = true; $("login").hidden = false; $("msg").textContent = message ?? "";
}

function time(ms) { return ms ? new Date(ms).toLocaleString("ko-KR", { hour12: false }) : ""; }
function cell(content, cls) {
  const td = document.createElement("td");
  if (cls) td.className = cls;
  if (content instanceof Node) td.append(content); else td.textContent = content ?? "";
  return td;
}
function button(label, onclick, bad) {
  const b = document.createElement("button");
  b.textContent = label; b.onclick = onclick; if (bad) b.className = "bad";
  return b;
}
function group(...nodes) { const s = document.createElement("span"); s.className = "bar"; s.append(...nodes); return s; }
function table(id, head, rows) {
  const tr = document.createElement("tr");
  tr.append(...head.map((h) => { const th = document.createElement("th"); th.textContent = h; return th; }));
  $(id).replaceChildren(tr, ...rows.map((cells) => { const r = document.createElement("tr"); r.append(...cells); return r; }));
}
function thumb(strokes) {
  const c = document.createElement("canvas");
  c.width = 144; c.height = 96;
  const g = c.getContext("2d");
  g.lineCap = g.lineJoin = "round"; g.lineWidth = 1.5;
  for (const s of strokes) {
    g.strokeStyle = INK[s.c]; g.beginPath(); g.moveTo(s.p[0] * 1.5, s.p[1] * 1.5);
    for (let i = 2; i < s.p.length; i += 2) g.lineTo(s.p[i] * 1.5, s.p[i + 1] * 1.5);
    if (s.p.length === 2) g.lineTo(s.p[0] * 1.5 + 0.01, s.p[1] * 1.5);
    g.stroke();
  }
  return c;
}
function tag(text) { const s = document.createElement("span"); s.className = "tag " + text; s.textContent = text; return s; }

async function refresh() {
  let d;
  try { d = await api("/state"); } catch { return; }
  $("login").hidden = true; $("app").hidden = false;
  const banned = new Set(d.bans.map((b) => b.cid));
  const banButton = (cid) => banned.has(cid)
    ? button("차단 해제", () => act("/unban", { cid }))
    : button("차단", () => act("/ban", { cid }, "이 브라우저의 출근과 쪽지 작성을 막을까요?"), true);

  $("summary").textContent = `${d.day}일차 · 실험실 ${d.labId} · 접속 ${d.connections.length}명 · 대기 ${d.queue.length}명 · ` +
    (d.shift ? `근무 중: ${d.shift.nick} (${NAMES[d.shift.character]}, ${time(d.shift.startedAt)}부터)` : "근무자 없음");
  $("kick").disabled = !d.shift;
  if (document.activeElement !== $("shiftSec")) $("shiftSec").value = d.shiftMs / 1000;

  table("conns", ["닉네임", "상태", "ID", ""], d.connections.map((c) => [
    cell(c.nick || "(인사 전)"),
    cell(d.shift?.cid === c.cid ? "근무 중" : d.offer?.cid === c.cid ? "캐릭터 선택 중" : d.queue.includes(c.cid) ? "대기" : "관전"),
    cell(c.cid, "cid"),
    cell(c.cid ? banButton(c.cid) : ""),
  ]));

  table("notes", ["#", "그림", "작성자", "상태", "신고", "반응", "작성", ""], d.notes.map((n) => [
    cell(n.id), cell(thumb(n.data)), cell(`${n.nick} (${NAMES[n.character] ?? n.character})`),
    cell(tag(n.status)), cell(n.reports + (n.reviewed ? " · 검토됨" : "")), cell(`도움 ${n.help} · 웃김 ${n.funny}`),
    cell(`${n.day}일차 ${time(n.created_at)}`),
    cell(group(
      button("숨김", () => act("/note", { id: n.id, action: "hide" })),
      button("복구", () => act("/note", { id: n.id, action: "restore" })),
      button("삭제", () => act("/note", { id: n.id, action: "delete" }, "이 쪽지를 삭제할까요?"), true),
      banButton(n.cid),
    )),
  ]));

  table("log", ["#", "일차", "닉네임", "캐릭터", "시작", "종료", "사유", "진행", "신고", ""], d.log.map((e) => [
    cell(e.id), cell(e.day), cell(e.nick + (e.masked ? " (가림)" : "")), cell(NAMES[e.character] ?? e.character),
    cell(time(e.started_at)), cell(time(e.ended_at)), cell((e.reason ?? "근무 중") + (e.rejected ? " · 인수 거부됨" : "")),
    cell(e.progress), cell(e.reports),
    cell(group(
      e.masked
        ? button("닉네임 복구", () => act("/nick", { logId: e.id, action: "restore" }))
        : button("닉네임 가리기", () => act("/nick", { logId: e.id, action: "mask" })),
      banButton(e.cid),
    )),
  ]));

  table("bans", ["ID", "차단 시각", ""], d.bans.map((b) => [
    cell(b.cid, "cid"), cell(time(b.at)), cell(button("차단 해제", () => act("/unban", { cid: b.cid }))),
  ]));
  table("actions", ["시각", "조치", "내용"], d.actions.map((a) => [cell(time(a.at)), cell(a.action), cell(a.detail, "cid")]));
}

function start() {
  $("msg").textContent = "";
  refresh();
  clearInterval(timer);
  timer = setInterval(refresh, 3000);
}

$("loginForm").onsubmit = (e) => {
  e.preventDefault();
  token = $("token").value.trim();
  $("token").value = "";
  try { sessionStorage.setItem("shift.admin", token); } catch { /* ignore */ }
  start();
};
$("logout").onclick = () => { token = ""; try { sessionStorage.removeItem("shift.admin"); } catch { /* ignore */ } stop(); };
$("setShift").onclick = () => act("/config", { shiftSeconds: Number($("shiftSec").value) });
$("setLab").onclick = () => act("/config", { lab: Number($("labSel").value) }, "현장을 이 실험실의 처음 상태로 바꿀까요? 현재 근무자는 퇴근 처리됩니다.");
$("kick").onclick = () => act("/kick", {}, "현재 근무자를 강제 퇴근시킬까요?");
$("rollback").onclick = () => act("/rollback", {}, "현장을 이전 근무 시작 시점으로 되돌릴까요? 현재 근무자는 퇴근 처리됩니다.");

if (token) start();

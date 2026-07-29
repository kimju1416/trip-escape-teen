const { chromium } = require("C:/Users/USER/Downloads/프로젝트/naverestate-mcp/node_modules/playwright");
const OUT = __dirname;
const URL = "file:///C:/Users/USER/Downloads/%ED%94%84%EB%A1%9C%EC%A0%9D%ED%8A%B8/trip-escape-teen/index.html";

const log = [];
const errors = [];

// 모달은 지연 후 뜨는 경우가 있어(최대 1.1초), 먼저 등장을 기다린 뒤 닫는다
async function closeModal(p, waitMs = 0) {
  if (waitMs) {
    for (let t = 0; t < waitMs; t += 150) {
      if (await p.evaluate(() => document.getElementById("veil").classList.contains("on"))) break;
      await p.waitForTimeout(150);
    }
  }
  for (let i = 0; i < 12; i++) {
    const open = await p.evaluate(() => document.getElementById("veil").classList.contains("on"));
    if (!open) return;
    await p.evaluate(() => document.getElementById("m-ok").click());
    await p.waitForTimeout(450);
  }
}
async function answerEvent(p) {
  // 딜레마 카드가 떠 있으면 정답(ok) 선택지를 누른다
  const on = await p.evaluate(() => document.getElementById("eventcard").classList.contains("on"));
  if (!on) return false;
  const story = await p.evaluate(() => document.getElementById("ev-story").textContent);
  await p.evaluate(() => {
    const btns = [...document.querySelectorAll("#ev-choices .evbtn")];
    // ok 여부는 DOM에 없으므로, 라벨로 정답을 고른다
    const good = btns.find(b => /확인한다|벗어난다|각도를 잡는다|알린다|지우게 한다|맞다|아니다/.test(b.textContent));
    (good || btns[0]).click();
  });
  log.push("딜레마: " + story.slice(0, 30) + "…");
  await p.waitForTimeout(500);
  await closeModal(p);
  return true;
}
async function clearFindStage(p, sceneSel, keys) {
  for (const k of keys) {
    await p.evaluate(({ sceneSel, k }) => {
      const el = document.querySelector(`${sceneSel} .hot[data-k="${k}"]`);
      const r = el.getBoundingClientRect();
      el.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }));
    }, { sceneSel, k });
    await p.waitForTimeout(400);
    await closeModal(p);
  }
}
async function solveOrder(p, gridSel) {
  const n = await p.evaluate(g => document.querySelectorAll(g + " .ordercard").length, gridSel);
  log.push(`순서퍼즐 ${gridSel}: 카드 ${n}장`);
  if (!n) { log.push(`  → 카드가 없다 (박스 미표시)`); return; }
  for (let i = 0; i < 6; i++) {
    const st = await p.evaluate(g => {
      const cards = [...document.querySelectorAll(g + " .ordercard")];
      const doneCount = cards.filter(c => c.classList.contains("done")).length;
      if (doneCount === cards.length) return { doneCount, finished: true };
      const target = cards.find(c => Number(c.dataset.i) === doneCount);
      if (target) target.click();
      return { doneCount, clicked: !!target };
    }, gridSel);
    if (st.finished) break;
    await p.waitForTimeout(400);
  }
  await p.waitForTimeout(400);
  await closeModal(p, 2000);
}
async function answerOX(p, oSel, xSel, rounds) {
  for (let i = 0; i < rounds; i++) {
    const done = await p.evaluate(() => document.querySelector(".screen.on").id);
    if (!/s4|final/.test(done)) break;
    const clicked = await p.evaluate(({ oSel, xSel }) => {
      const st = document.querySelector(".screen.on").id === "scr-s4" ? S4 : FINAL;
      const q = st.qs[st.idx];
      if (!q) return false;
      document.querySelector(q.a ? oSel : xSel).click();
      return true;
    }, { oSel, xSel });
    if (!clicked) break;
    await p.waitForTimeout(500);
    await closeModal(p);
    await answerEvent(p);
  }
}

/* 주행 중 영상 스테이지 — 재생하면서 판정 시각에 맞춰 탭한다.
   헤드리스 크로미움은 H.264 디코더가 없으므로 반드시 channel:"chrome"으로 실행할 것. */
async function clearVideoStage(p) {
  for (let i = 0; i < 25; i++) {
    if (await p.evaluate(() => document.querySelector(".screen.on").id === "scr-sv")) break;
    await p.waitForTimeout(200);
  }
  const res = await p.evaluate(plan => new Promise(resolve => {
    const wrap = document.getElementById("sv-wrap"), vid = document.getElementById("sv-video");
    document.getElementById("sv-start").click();
    let pi = 0; const taps = [];
    const iv = setInterval(() => {
      while (pi < plan.length && vid.currentTime >= plan[pi].t) {
        const q = plan[pi++]; const r = wrap.getBoundingClientRect();
        wrap.dispatchEvent(new MouseEvent("click", { bubbles: true,
          clientX: r.left + q.x / 100 * r.width, clientY: r.top + q.y / 100 * r.height }));
        taps.push(q.k + "@" + vid.currentTime.toFixed(2));
      }
    }, 50);
    const fin = timeout => { clearInterval(iv);
      setTimeout(() => resolve({ taps, timeout, found: document.querySelectorAll("#sv-chips i.on").length }), 300); };
    vid.addEventListener("ended", () => fin(false));
    setTimeout(() => fin(true), 12000);
  }), [
    { t: 0.4, x: 15, y: 88, k: "ext" },
    { t: 1.0, x: 44, y: 22, k: "nobelt" },
    { t: 2.4, x: 66, y: 50, k: "luggage" }
  ]);
  log.push("영상 스테이지: " + JSON.stringify(res));
  if (res.timeout || res.found < 3) errors.push("영상 스테이지 실패: " + JSON.stringify(res));
  await closeModal(p, 2000);   // 규칙 카드 3장
  await closeModal(p, 2000);   // 700ms 뒤에 뜨는 통과 모달
}

(async () => {
  const b = await chromium.launch({ channel: "chrome" });
  const p = await b.newPage({ viewport: { width: 430, height: 900 } });
  p.on("pageerror", e => errors.push("pageerror: " + String(e)));
  p.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });

  await p.goto(URL);
  await p.waitForTimeout(1200);

  await p.click("#start-btn");
  await p.waitForTimeout(2500);
  log.push("화면: " + await p.evaluate(() => document.querySelector(".screen.on").id));

  // S1 버스
  await clearFindStage(p, "#s1-scene", ["nobelt", "luggage", "hammer", "ext"]);
  await p.evaluate(() => document.getElementById("s1-go").click());
  await closeModal(p, 2000);
  await p.waitForTimeout(2200);
  log.push("화면: " + await p.evaluate(() => document.querySelector(".screen.on").id));

  // 주행 중 영상 (S1 → S2 사이 보너스 구간)
  await clearVideoStage(p);
  await p.waitForTimeout(2300);
  log.push("화면: " + await p.evaluate(() => document.querySelector(".screen.on").id));

  // S2 휴게소
  await clearFindStage(p, "#s2-scene", ["busfront", "slip", "hotfood", "late"]);
  await closeModal(p, 2000);
  await answerEvent(p); await answerEvent(p);
  await p.waitForTimeout(2200);
  log.push("화면: " + await p.evaluate(() => document.querySelector(".screen.on").id));

  // S3 경복궁
  await clearFindStage(p, "#s3-scene", ["climb", "fence", "heat", "phone"]);
  await closeModal(p, 2000);
  await answerEvent(p);
  await p.waitForTimeout(2200);
  log.push("화면: " + await p.evaluate(() => document.querySelector(".screen.on").id));

  // S4 아쿠아리움 O/X
  await answerOX(p, "#s4-o", "#s4-x", 8);
  await p.waitForTimeout(2200);
  log.push("화면: " + await p.evaluate(() => document.querySelector(".screen.on").id));

  // S5 숙소
  await clearFindStage(p, "#s5-scene", ["photo", "iron", "strip", "door", "ledge"]);
  await closeModal(p, 2000);
  await answerEvent(p);
  await p.waitForTimeout(2500);
  log.push("화면: " + await p.evaluate(() => document.querySelector(".screen.on").id));

  // S6 대피
  await clearFindStage(p, "#s6-scene", ["alarm", "descend", "exit"]);
  await p.waitForTimeout(900);
  await solveOrder(p, "#ordergrid");
  await p.waitForTimeout(900);
  await solveOrder(p, "#grid119");
  await p.waitForTimeout(2500);
  log.push("화면: " + await p.evaluate(() => document.querySelector(".screen.on").id));

  // FINAL
  await answerOX(p, "#f-o", "#f-x", 12);
  await p.waitForTimeout(2500);
  log.push("화면: " + await p.evaluate(() => document.querySelector(".screen.on").id));

  // 엔딩 — 다짐 3개 + 인증서
  await p.waitForTimeout(3000);
  const pre = await p.evaluate(() => ({
    screen: document.querySelector(".screen.on").id,
    rules: S.rules.length,
    namerow: getComputedStyle(document.getElementById("namerow")).display
  }));
  log.push("엔딩 진입 상태: " + JSON.stringify(pre));

  await p.evaluate(() => { document.getElementById("name-input").value = "김하늘"; });
  await p.evaluate(() => document.getElementById("btn-cert").click());
  await p.waitForTimeout(900);

  const result = await p.evaluate(() => ({
    screen: document.querySelector(".screen.on").id,
    score: document.getElementById("r-score").textContent,
    grade: document.getElementById("r-grade").textContent,
    badges: document.getElementById("r-badges").textContent,
    certName: document.getElementById("cert-name").textContent,
    certGrade: document.getElementById("cert-grade").textContent,
    rulesCount: S.rules.length
  }));

  await p.evaluate(() => document.getElementById("cert").scrollIntoView({ block: "center" }));
  await p.waitForTimeout(500);
  await p.screenshot({ path: OUT + "/teen_cert.png" });

  await b.close();
  console.log(JSON.stringify({ log, result, errors }, null, 2));
})();

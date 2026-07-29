const { chromium } = require("C:/Users/USER/Downloads/프로젝트/naverestate-mcp/node_modules/playwright");
const URL = "file:///C:/Users/USER/Downloads/%ED%94%84%EB%A1%9C%EC%A0%9D%ED%8A%B8/trip-escape-teen/index.html";
const errs = [], log = [];

async function closeModal(p, wait = 1500) {
  for (let t = 0; t < wait; t += 150) {
    if (await p.evaluate(() => document.getElementById("veil").classList.contains("on"))) break;
    await p.waitForTimeout(150);
  }
  for (let i = 0; i < 10; i++) {
    if (!await p.evaluate(() => document.getElementById("veil").classList.contains("on"))) return;
    await p.evaluate(() => document.getElementById("m-ok").click());
    await p.waitForTimeout(350);
  }
}

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  p.on("pageerror", e => errs.push("pageerror: " + String(e)));
  p.on("console", m => { if (m.type() === "error") errs.push("console: " + m.text()); });
  await p.goto(URL); await p.waitForTimeout(1200);

  // ── 1) 모든 스테이지의 data-k가 targets에 실제로 존재하는지 (힌트가 참조하는 키) ──
  const keyCheck = await p.evaluate(() => {
    const map = { "#s2-scene": ST2, "#s3-scene": ST3, "#s5-scene": ST5, "#s6-scene": ST6 };
    const bad = [];
    for (const [sel, stage] of Object.entries(map)) {
      const t = stage.__targets;
      document.querySelectorAll(sel + " .hot").forEach(h => {
        if (!t || !t[h.dataset.k]) bad.push(sel + " " + h.dataset.k);
      });
    }
    // S1은 별도 구조
    document.querySelectorAll("#s1-scene .hot").forEach(h => {
      if (!S1.info[h.dataset.k]) bad.push("#s1-scene " + h.dataset.k);
    });
    return bad;
  }).catch(e => "targets 비공개: " + e.message);
  log.push("키 정합성(직접): " + JSON.stringify(keyCheck));

  await p.click("#start-btn"); await p.waitForTimeout(2600);

  // ── 2) 모든 찾기 스테이지에서 힌트 버튼 실제 클릭 ──
  for (const [screen, hintBtn, name] of [
    ["#scr-s1", "#s1-hint", "S1"], ["#scr-s2", "#s2-hint", "S2"],
    ["#scr-s3", "#s3-hint", "S3"], ["#scr-s5", "#s5-hint", "S5"], ["#scr-s6", "#s6-hint", "S6"]]) {
    await p.evaluate(({ screen }) => {
      document.querySelectorAll(".screen").forEach(s => s.classList.remove("on"));
      document.querySelector(screen).classList.add("on");
    }, { screen });
    await p.waitForTimeout(250);
    const before = errs.length;
    await p.evaluate(sel => document.querySelector(sel).click(), hintBtn);
    await p.waitForTimeout(500);
    const toast = await p.evaluate(() => document.getElementById("toast").textContent);
    log.push(`${name} 힌트: ${errs.length === before ? "OK" : "에러발생"} — "${toast.slice(0, 40)}"`);
  }

  // ── 3) 오탭(빈 곳 클릭) 페널티 ──
  await p.evaluate(() => {
    document.querySelectorAll(".screen").forEach(s => s.classList.remove("on"));
    document.getElementById("scr-s2").classList.add("on");
  });
  await p.evaluate(() => { S.score = 1000; S.missCount = 0; });
  const scoreBefore = await p.evaluate(() => S.score);
  await p.evaluate(() => {
    const sc = document.getElementById("s2-scene");
    const r = sc.getBoundingClientRect();
    sc.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: r.x + 5, clientY: r.y + r.height - 5 }));
  });
  await p.waitForTimeout(400);
  log.push(`오탭 페널티: 점수 ${scoreBefore} → ${await p.evaluate(() => S.score)}, missCount ${await p.evaluate(() => S.missCount)}, 토스트 "${(await p.evaluate(() => document.getElementById("toast").textContent)).slice(0,30)}"`);

  // ── 4) 이스터에그 탭 ──
  const eggBefore = await p.evaluate(() => S.eggsRun.size);
  await p.evaluate(() => {
    const e = document.querySelector("#s2-scene .egg");
    const r = e.getBoundingClientRect();
    e.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }));
  });
  await p.waitForTimeout(500);
  log.push(`이스터에그: ${eggBefore} → ${await p.evaluate(() => S.eggsRun.size)}`);

  // ── 5) O/X 오답 → 하트 감소 ──
  await p.evaluate(() => { go("#scr-s4", 3); S4.start(); });
  await p.waitForTimeout(600);
  const livesBefore = await p.evaluate(() => S.lives);
  await p.evaluate(() => {
    const q = S4.qs[S4.idx];
    document.querySelector(q.a ? "#s4-x" : "#s4-o").click();  // 일부러 틀린 답
  });
  await p.waitForTimeout(700);
  const livesAfter = await p.evaluate(() => S.lives);
  log.push(`O/X 오답: 하트 ${livesBefore} → ${livesAfter}`);
  await closeModal(p);

  // ── 6) 하트 소진 → GAME OVER 화면 ──
  await p.evaluate(() => { S.lives = 1; renderLives(); });
  await p.evaluate(() => {
    const q = S4.qs[S4.idx];
    document.querySelector(q.a ? "#s4-x" : "#s4-o").click();
  });
  await p.waitForTimeout(1200);
  await closeModal(p);
  await p.waitForTimeout(1500);
  const goShown = await p.evaluate(() => document.getElementById("gameover").classList.contains("on"));
  log.push(`하트 소진 → GAME OVER 표시: ${goShown}`);
  if (goShown) {
    await p.evaluate(() => document.getElementById("go-retry").click());
    await p.waitForTimeout(1800);
    log.push(`재도전 후 화면: ${await p.evaluate(() => document.querySelector(".screen.on").id)}, 하트 ${await p.evaluate(() => S.lives)}`);
  }

  // ── 7) 순서 퍼즐 오답 ──
  await p.evaluate(() => {
    document.querySelectorAll(".screen").forEach(s => s.classList.remove("on"));
    document.getElementById("scr-s6").classList.add("on");
    document.getElementById("s6-order").style.display = "block"; S6ORDER.build();
  });
  await p.waitForTimeout(400);
  const beforeWrong = errs.length;
  await p.evaluate(() => {
    const cards = [...document.querySelectorAll("#ordergrid .ordercard")];
    const wrong = cards.find(c => Number(c.dataset.i) !== 0);
    if (wrong) wrong.click();
  });
  await p.waitForTimeout(500);
  log.push(`순서 퍼즐 오답: ${errs.length === beforeWrong ? "OK" : "에러발생"} — "${(await p.evaluate(() => document.getElementById("toast").textContent)).slice(0, 40)}"`);

  await b.close();
  console.log(JSON.stringify({ log, errs }, null, 2));
})();

const { chromium } = require("C:/Users/USER/Downloads/프로젝트/naverestate-mcp/node_modules/playwright");
const URL = "file:///C:/Users/USER/Downloads/%ED%94%84%EB%A1%9C%EC%A0%9D%ED%8A%B8/trip-escape-teen/index.html";
(async () => {
  const b = await chromium.launch();
  const out = {};
  for (const w of [360, 375, 390]) {
    const p = await b.newPage({ viewport: { width: w, height: 800 } });
    const errs = [];
    p.on("pageerror", e => errs.push(String(e)));
    await p.goto(URL); await p.waitForTimeout(1200);
    await p.click("#start-btn"); await p.waitForTimeout(2600);

    const r = await p.evaluate(() => {
      const res = { overflow: document.body.scrollWidth > window.innerWidth, small: [] };
      // 모든 스테이지 핫스팟의 실제 탭 크기(px) 측정
      document.querySelectorAll(".screen").forEach(s => s.classList.add("on"));
      document.querySelectorAll(".hot").forEach(h => {
        const b = h.getBoundingClientRect();
        const stage = h.closest(".screen").id;
        const cs = getComputedStyle(h, "::after");
        // inset:-Npx 만큼 실제 탭 영역이 커진다
        const grow = cs.content && cs.content !== "none" ? Math.abs(parseFloat(cs.top) || 0) * 2 : 0;
        const w = b.width + grow, ht = b.height + grow;
        if (w < 44 || ht < 44) {
          res.small.push(`${stage}/${h.dataset.k} ${Math.round(w)}x${Math.round(ht)}`);
        }
      });
      // 순서 카드 높이
      document.getElementById("s6-order").style.display = "block"; S6ORDER.build();
      const c = document.querySelector("#ordergrid .ordercard");
      res.orderCard = c ? Math.round(c.getBoundingClientRect().width) + "x" + Math.round(c.getBoundingClientRect().height) : null;
      return res;
    });
    out[w] = { ...r, errs };
    await p.close();
  }
  await b.close();
  console.log(JSON.stringify(out, null, 2));
})();

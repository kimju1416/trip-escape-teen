const { chromium } = require("C:/Users/USER/Downloads/프로젝트/naverestate-mcp/node_modules/playwright");
const OUT = "C:/Users/USER/AppData/Local/Temp/claude/C--Users-USER-Downloads/8e792f1b-0781-45db-a1f3-058f0613ed85/scratchpad";
const URL = "file:///C:/Users/USER/Downloads/%ED%94%84%EB%A1%9C%EC%A0%9D%ED%8A%B8/trip-escape-teen/index.html?debug=1";

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 430, height: 900 } });
  const errors = [];
  p.on("pageerror", e => errors.push("pageerror: " + String(e)));
  p.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });

  await p.goto(URL);
  await p.waitForTimeout(1200);

  // 모든 스테이지 화면을 강제로 켜서 핫스팟 오버레이를 캡처
  const scenes = [
    ["#scr-s1", "#s1-scene", "s1_bus"],
    ["#scr-s2", "#s2-scene", "s2_rest"],
    ["#scr-s3", "#s3-scene", "s3_palace"],
    ["#scr-s5", "#s5-scene", "s5_room"],
    ["#scr-s6", "#s6-scene", "s6_corridor"],
  ];
  for (const [screen, scene, tag] of scenes) {
    await p.evaluate(({ screen, scene }) => {
      document.querySelectorAll(".screen").forEach(s => s.classList.remove("on"));
      document.querySelector(screen).classList.add("on");
      const d = document.getElementById("s6-dark");
      if (d) d.style.display = "none";           // 손전등 마스크는 확인용으로 끔
      document.querySelector(scene).scrollIntoView({ block: "center" });
    }, { screen, scene });
    await p.waitForTimeout(500);
    const box = await p.evaluate(sel => {
      const r = document.querySelector(sel).getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    }, scene);
    await p.screenshot({ path: `${OUT}/hs_${tag}.png`, clip: { x: box.x, y: Math.max(0, box.y), width: box.w, height: Math.min(box.h, 900 - Math.max(0, box.y)) } });
  }

  await b.close();
  console.log(JSON.stringify({ errors }, null, 2));
})();

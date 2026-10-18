// Captures de contrôle. Usage : node scripts/shots.mjs <baseUrl> <outDir> [paths...]
import { chromium } from "@playwright/test";
const [base, out, ...paths] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM });
for (const [name, vp, mobile] of [["m", { width: 390, height: 844 }, true], ["d", { width: 1440, height: 900 }, false]]) {
  const ctx = await browser.newContext({ viewport: vp, isMobile: mobile, hasTouch: mobile });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 160)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 160)));
  for (const p of paths) {
    await page.goto(base + p, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${out}/${name}${p.replace(/[/?=&]/g, "_") || "_home"}.png`, fullPage: p !== "/" });
  }
  if (errors.length) console.log("ERRORS", name, [...new Set(errors)].join("\n"));
  await ctx.close();
}
await browser.close();

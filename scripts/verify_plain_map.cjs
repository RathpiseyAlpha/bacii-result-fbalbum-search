const { chromium } = require('playwright');
const path = require('path');

const ARTIFACTS_DIR = "C:\\Users\\RathpiseyAlpha\\.gemini\\antigravity-ide\\brain\\03dbef23-942c-401d-81dc-3d30f48bdaeb";

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();

  console.log("Navigating to http://localhost:5173/#insights/overview...");
  await page.goto("http://localhost:5173/#insights/overview", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  // 1. Screenshot Overview tab showing Grade A banner and Overall BacII Grade Distribution
  const gradeCard = page.locator(".grade-mix-card");
  if (await gradeCard.count() > 0) {
    await gradeCard.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    const overviewImgPath = path.join(ARTIFACTS_DIR, "plain_overview_grade_a_track.png");
    await gradeCard.screenshot({ path: overviewImgPath, animations: "disabled" });
    console.log("Captured Overview Grade A Banner screenshot:", overviewImgPath);
  }

  // 2. Navigate to High Schools tab
  console.log("Navigating to http://localhost:5173/#insights/schools...");
  await page.goto("http://localhost:5173/#insights/schools", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  const heatmapContainer = page.locator(".capital-heatmap-container");
  if (await heatmapContainer.count() > 0) {
    await heatmapContainer.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);

    const box = await heatmapContainer.boundingBox();
    if (box) {
      const phnomPenhMapImgPath = path.join(ARTIFACTS_DIR, "plain_phnom_penh_svg_map.png");
      await page.screenshot({ path: phnomPenhMapImgPath, clip: box });
      console.log("Captured Phnom Penh Plain SVG Map screenshot:", phnomPenhMapImgPath);
    }

    // Switch to Nationwide Provinces view
    const provBtn = page.locator("button:has-text('Nationwide')").first();
    if (await provBtn.count() > 0) {
      await provBtn.click({ force: true });
      await page.waitForTimeout(1000);
      const box2 = await heatmapContainer.boundingBox();
      if (box2) {
        const cambodiaMapImgPath = path.join(ARTIFACTS_DIR, "plain_cambodia_svg_map.png");
        await page.screenshot({ path: cambodiaMapImgPath, clip: box2 });
        console.log("Captured Cambodia Plain SVG Map screenshot:", cambodiaMapImgPath);
      }
    }
  }

  await browser.close();
  console.log("Verification screenshots captured successfully!");
})();

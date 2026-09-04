const { chromium } = require('playwright');
const path = require('path');

const ARTIFACTS_DIR = "C:\\Users\\RathpiseyAlpha\\.gemini\\antigravity-ide\\brain\\03dbef23-942c-401d-81dc-3d30f48bdaeb";

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();

  console.log("Navigating to http://localhost:5173/#insights/schools...");
  await page.goto("http://localhost:5173/#insights/schools", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  // 1. Verify Khan sidebar top schools render with cropped image
  const khanContainer = page.locator(".capital-heatmap-container");
  if (await khanContainer.count() > 0) {
    const khanImgPath = path.join(ARTIFACTS_DIR, "branch_khan_sidebar_crops.png");
    const box = await khanContainer.boundingBox();
    if (box) {
      await page.screenshot({ path: khanImgPath, clip: box });
      console.log("Captured Khan sidebar with cropped school images:", khanImgPath);
    }
  }

  // 2. Capture Table View with consolidated school entity and expand pill button
  const tableWrap = page.locator(".compact-table-wrap");
  if (await tableWrap.count() > 0) {
    await tableWrap.scrollIntoViewIfNeeded();
    await page.waitForTimeout(800);

    const tableBeforeExpandPath = path.join(ARTIFACTS_DIR, "branch_table_grouped_collapsed.png");
    const boxTable = await tableWrap.boundingBox();
    if (boxTable) {
      await page.screenshot({ path: tableBeforeExpandPath, clip: { ...boxTable, height: Math.min(boxTable.height, 650) } });
      console.log("Captured Table View collapsed:", tableBeforeExpandPath);
    }

    // 3. Click the first branch expand button (e.g. Beltei 25 branches)
    const expandBtn = page.locator(".branch-expand-pill-btn").first();
    if (await expandBtn.count() > 0) {
      await expandBtn.click({ force: true });
      await page.waitForTimeout(1500);

      const tableExpandedPath = path.join(ARTIFACTS_DIR, "branch_table_grouped_expanded.png");
      const boxTableExp = await tableWrap.boundingBox();
      if (boxTableExp) {
        await page.screenshot({ path: tableExpandedPath, clip: { ...boxTableExp, height: Math.min(boxTableExp.height, 750) } });
        console.log("Captured Table View with expanded branch drawer:", tableExpandedPath);
      }
    }
  }

  // 4. Switch to Cards View
  const cardsBtn = page.locator("button:has-text('Card view'), button:has-text('ទម្រង់កាត')").first();
  if (await cardsBtn.count() > 0) {
    await cardsBtn.click({ force: true });
    await page.waitForTimeout(1200);

    const cardExpandBtn = page.locator(".card-branch-toggle-btn").first();
    if (await cardExpandBtn.count() > 0) {
      await cardExpandBtn.click({ force: true });
      await page.waitForTimeout(1500);
    }

    const cardList = page.locator(".school-list-grid");
    if (await cardList.count() > 0) {
      const boxCard = await cardList.boundingBox();
      if (boxCard) {
        const cardImgPath = path.join(ARTIFACTS_DIR, "branch_card_view_expanded.png");
        await page.screenshot({ path: cardImgPath, clip: { ...boxCard, height: Math.min(boxCard.height, 750) } });
        console.log("Captured Card View with expanded branches:", cardImgPath);
      }
    }
  }

  await browser.close();
  console.log("Verification finished successfully!");
})();

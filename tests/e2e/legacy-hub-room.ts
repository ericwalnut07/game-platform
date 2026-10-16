import type { Page } from "@playwright/test";
/** Set up saved-rule compatibility through the existing API, not a public picker. */
export async function legacyHubRoom(page: Page, rulesVariant: "V05" | "NEXT") {
  await page.route("**/api/rooms", async route => {
    if (route.request().method() !== "POST") return route.continue();
    const body = route.request().postDataJSON();
    if (body.gameId !== "commercial-hub") return route.continue();
    body.gameConfig = rulesVariant === "V05" ? { rulesVariant, trickRule: body.gameConfig.trickRule, auditor: body.gameConfig.auditor } : { ...body.gameConfig, rulesVariant };
    await route.continue({ postData: JSON.stringify(body) });
  });
}

import { expect, test, type Page } from "@playwright/test";
import type { PonInaiMatchPlayerView } from "../../src/games/pon-inai/module";

async function playRounds(pages: Page[], gameIndex: number) {
  await Promise.all(pages.map(async (page) => {
    await expect(page.getByRole("heading", { name: "あなたの情報" })).toBeVisible();
    await expect(page.getByText(`GAME ${gameIndex} / 2`, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "確認した", exact: true }).click();
  }));
  for (let round = 1; round <= 4; round++) {
    await Promise.all(pages.map(async (page) => {
      await expect(page.getByText(`ROUND ${round} / 4`, { exact: true })).toBeVisible();
      await page.locator(".game-card").first().click();
      await page.locator(".confidence-row button").nth(1).click();
      await page.getByRole("button", { name: "この内容で決定", exact: true }).click();
    }));
    await Promise.all(pages.map(async (page) => {
      await expect(page.getByRole("heading", { name: "短い議論" })).toBeVisible();
      await page.getByRole("button", { name: "次へ進む準備OK", exact: true }).click();
    }));
  }
  await Promise.all(pages.map(async (page) => {
    await expect(page.getByRole("heading", { name: "ポン裁判", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "投票へ進む", exact: true }).click();
  }));
}

test("four players review compact results and a separate ending across two games", async ({ page: host, browser }, testInfo) => {
  test.setTimeout(150_000);
  let latest: PonInaiMatchPlayerView | undefined;
  host.on("websocket", (socket) => socket.on("framereceived", ({ payload }) => {
    const message = JSON.parse(String(payload));
    if (message.type === "GAME_VIEW") latest = message.gameView;
  }));
  const names = ["QA A", "QA B", "QA C", "QA長い名前のプレイヤーD"];
  const guests = await Promise.all(names.slice(1).map(() => browser.newContext()));
  try {
    await host.goto("/#/create");
    await host.getByLabel("あなたの名前").fill(names[0]!);
    await host.getByLabel("部屋名").fill("QA compact results");
    await host.locator(".stepper button").first().click();
    await host.getByRole("button", { name: "部屋を作る", exact: true }).click();
    await expect(host).toHaveURL(/#\/room\/[A-Z0-9]+/);
    const code = host.url().match(/#\/room\/([A-Z0-9]+)/)![1]!;
    const pages = [host];
    for (let index = 0; index < guests.length; index++) {
      const page = await guests[index]!.newPage();
      await page.goto("/#/join");
      await page.getByLabel("部屋コード").fill(code);
      await page.getByLabel("あなたの名前").fill(names[index + 1]!);
      await page.getByRole("button", { name: "入室", exact: true }).click();
      pages.push(page);
    }
    await Promise.all(pages.slice(1).map(async (page) => {
      await page.getByRole("button", { name: "準備OK", exact: true }).click();
      await expect(page.getByRole("button", { name: "準備を解除", exact: true })).toBeVisible();
    }));
    await expect(host.getByRole("button", { name: "ゲーム開始" })).toBeEnabled();
    await host.getByRole("button", { name: "ゲーム開始" }).click();
    const expectedTotals = new Map<string, number>();

    for (let gameIndex = 1; gameIndex <= 2; gameIndex++) {
      await playRounds(pages, gameIndex);
      await Promise.all(pages.map(async (page, index) => {
        await expect(page.getByRole("heading", { name: "同時投票" })).toBeVisible();
        await page.getByLabel("最もスパダリだった人").selectOption({ label: names[(index + 1) % 4]! });
        await page.getByLabel("ポンだと思うのは？").selectOption({ label: gameIndex === 1 ? names[index < 2 ? 0 : 1]! : "ポンはいない" });
        await page.getByRole("button", { name: "投票を確定", exact: true }).click();
      }));
      if (gameIndex === 1) {
        await Promise.all(pages.map(async (page) => {
          await expect(page.getByRole("heading", { name: "票が割れました" })).toBeVisible();
          await page.getByRole("button", { name: "決選投票へ進む準備OK", exact: true }).click();
        }));
        await Promise.all(pages.map(async (page, index) => {
          await expect(page.getByRole("heading", { name: "決選投票", exact: true })).toBeVisible();
          await page.getByRole("button", { name: names[index < 2 ? 0 : 1]!, exact: true }).click();
          await page.getByRole("button", { name: "決選票を確定", exact: true }).click();
        }));
      }

      await expect(host.getByRole("heading", { name: "ゲーム結果", exact: true })).toBeVisible();
      await expect(host.locator(".result-vote")).toHaveCount(4);
      await expect(host.locator(".result-player")).toHaveCount(4);
      await expect(host.getByText("真ミッション", { exact: true })).toBeVisible();
      await expect(host.getByText("今回のポン", { exact: true })).toBeVisible();
      await expect(host.locator(".result-ending-screen")).toHaveCount(0);
      await expect(host.getByRole("button", { name: "次へ", exact: true })).toHaveCount(0);
      if (gameIndex === 1) {
        await expect(host.getByText("判決不能", { exact: true })).toBeVisible();
        await expect(host.locator(".result-vote").first()).toContainText("決選：QA A");
      }
      for (const score of latest!.currentGame!.revealData!.scoring!.players) expectedTotals.set(score.playerId, (expectedTotals.get(score.playerId) ?? 0) + score.total);
      expect(latest!.resultStats!.map((stat) => stat.totalScore)).toEqual([...expectedTotals.values()]);
      await host.screenshot({ path: testInfo.outputPath(`game-${gameIndex}-results.png`), fullPage: true });

      // All previous single-screen details remain available without advancing.
      for (const player of await host.locator(".result-player").all()) {
        await player.locator("summary").click();
        await expect(player).toContainText("スパダリ投票");
        await expect(player).toContainText("秘密の性格");
        await player.locator("summary").click();
      }
      await host.getByText("各自が見ていたミッション", { exact: true }).click();
      await expect(host.locator(".result-details[open] p")).toHaveCount(4);
      await host.getByText("各自が見ていたミッション", { exact: true }).click();
      const width = await host.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: window.innerWidth }));
      expect(width.content).toBeLessThanOrEqual(width.viewport);

      if (gameIndex === 1) {
        await host.reload();
        await expect(host.getByRole("heading", { name: "ゲーム結果", exact: true })).toBeVisible();
        await host.context().setOffline(true);
        await expect(host.getByRole("heading", { name: "ネットワークがオフラインです" })).toBeVisible();
        await host.context().setOffline(false);
        await expect(host.locator(".reconnect-overlay")).toHaveCount(0);
        await expect(host.locator(".result-vote")).toHaveCount(4);
      }

      // Exactly two forward clicks per player: summary -> ending -> next game/match.
      await Promise.all(pages.map(async (page) => {
        await page.getByRole("button", { name: "エンディングへ", exact: true }).click();
        await expect(page.getByRole("heading", { name: "エンディング", exact: true })).toBeVisible();
        await expect(page.locator(".ending-title")).not.toBeEmpty();
        await expect(page.locator(".result-summary")).toHaveCount(0);
      }));
      await host.screenshot({ path: testInfo.outputPath(`game-${gameIndex}-ending.png`), fullPage: true });
      await host.getByRole("button", { name: "結果を見直す", exact: true }).click();
      await expect(host.getByRole("heading", { name: "全員の得点" })).toBeVisible();
      await host.getByRole("button", { name: "エンディングへ", exact: true }).click();
      await Promise.all(pages.map((page) => page.getByRole("button", { name: gameIndex < 2 ? "次のゲームへ" : "マッチ結果へ", exact: true }).click()));
    }
    await expect(host.getByRole("heading", { name: "マッチ終了", exact: true })).toBeVisible();
    await expect(host.locator(".result-player")).toHaveCount(4);
    expect(latest!.resultStats!.map((stat) => stat.totalScore)).toEqual([...expectedTotals.values()]);
    await host.reload();
    await expect(host.getByRole("heading", { name: "マッチ終了", exact: true })).toBeVisible();
    await expect(host.getByText("真ミッション", { exact: true })).toBeVisible();
  } finally {
    await Promise.all(guests.map((context) => context.close()));
  }
});

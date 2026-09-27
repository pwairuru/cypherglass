import { expect, test, type Page } from "@playwright/test";
import { genKey, signEvent } from "./nostr-sign";
import { promoteAdmin } from "./global-setup";

const API = `http://localhost:${process.env.E2E_API_PORT ?? 8100}`;

let n = 0;
const uname = (p: string): string =>
  `${p}_${Date.now().toString(36)}_${n++}`;

async function register(
  page: Page,
  username: string,
  password: string,
  email?: string,
): Promise<void> {
  await page.goto("/register");
  await page.getByLabel("Username").fill(username);
  if (email !== undefined) await page.getByLabel("Email (optional)").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL("/");
}

async function login(page: Page, username: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL("/");
}

async function tokenOf(page: Page): Promise<string> {
  const tok = await page.evaluate(() => localStorage.getItem("cypherglass_token"));
  expect(tok).toBeTruthy();
  return tok as string;
}

test("register, profile update persists, password change, relogin", async ({
  page,
}) => {
  const u = uname("e2e_full");
  await register(page, u, "s3cretpass", `${u}@example.io`);
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  await page.goto("/profile");
  await expect(page.getByText(`Username: ${u}`)).toBeVisible();
  await page.getByLabel("Display name (max 64)").fill("E2E User");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Profile updated")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Display name: E2E User")).toBeVisible();

  await page.getByLabel("Old password").fill("s3cretpass");
  await page.getByLabel("New password").fill("n3wsecretpass");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText("Password changed")).toBeVisible();

  await page.goto("/");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/login");
  await login(page, u, "n3wsecretpass");
});

test("duplicate registration and bad login show errors", async ({ page }) => {
  const u = uname("e2e_dup");
  await register(page, u, "s3cretpass");

  await page.goto("/register");
  await page.getByLabel("Username").fill(u);
  await page.getByLabel("Password", { exact: true }).fill("otherpass1");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator("p.error")).toContainText("409");

  await page.goto("/login");
  await page.getByLabel("Username").fill(u);
  await page.getByLabel("Password").fill("wrongpass1");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("p.error")).toBeVisible();
  await expect(page).toHaveURL("/login");
});

test("nostr QR/manual login end-to-end with real signatures", async ({
  page,
  request,
}) => {
  const { pubHex, skHex } = genKey();
  await page.goto("/login");
  await page.getByRole("button", { name: "Continue with Nostr" }).click();
  await page.getByRole("button", { name: "QR / mobile" }).click();
  await page.getByPlaceholder("64 hex chars").fill(pubHex);
  await page.getByRole("button", { name: "Get login challenge" }).click();
  const challenge = (await page.locator("p code").first().innerText()).trim();
  expect(challenge.length).toBeGreaterThan(16);
  await expect(page.locator("code", { hasText: "nostrconnect://" })).toBeVisible();
  await expect(
    page.getByRole("img", { name: /nostrconnect login qr code/i }),
  ).toBeVisible();

  const event = signEvent(skHex, {
    pubkey: pubHex,
    created_at: Math.floor(Date.now() / 1000),
    kind: 27235,
    tags: [],
    content: challenge,
  });
  await page
    .getByPlaceholder('{"id":...,"pubkey":...,"sig":...}')
    .fill(JSON.stringify(event));
  await page.getByRole("button", { name: "Verify and sign in" }).click();
  await expect(page).toHaveURL("/");

  const tok = await tokenOf(page);
  const me = await request.get(`${API}/api/v1/auth/me`, {
    headers: { Authorization: `Bearer ${tok}` },
  });
  expect(me.ok()).toBeTruthy();
  const body = await me.json();
  expect(body.npub).toBe(pubHex);
  expect(body.providers).toContain("nostr");
});

test("register page offers social signup, nostr creates account", async ({
  page,
  request,
}) => {
  await page.goto("/register");
  const card = page.locator(".login-page .card");
  await expect(
    card.getByRole("button", { name: /continue with google/i }),
  ).toBeVisible();
  await expect(
    card.getByRole("button", { name: /continue with github/i }),
  ).toBeVisible();

  const { pubHex, skHex } = genKey();
  await card.getByRole("button", { name: "Continue with Nostr" }).click();
  await card.getByRole("button", { name: "QR / mobile" }).click();
  await card.getByPlaceholder("64 hex chars").fill(pubHex);
  await card.getByRole("button", { name: "Get login challenge" }).click();
  const challenge = (await card.locator("p code").first().innerText()).trim();
  expect(challenge.length).toBeGreaterThan(16);
  await expect(
    card.getByRole("img", { name: /nostrconnect login qr code/i }),
  ).toBeVisible();

  const event = signEvent(skHex, {
    pubkey: pubHex,
    created_at: Math.floor(Date.now() / 1000),
    kind: 27235,
    tags: [],
    content: challenge,
  });
  await card
    .getByPlaceholder('{"id":...,"pubkey":...,"sig":...}')
    .fill(JSON.stringify(event));
  await card.getByRole("button", { name: "Verify and sign in" }).click();
  await expect(page).toHaveURL("/");

  const tok = await tokenOf(page);
  const me = await request.get(`${API}/api/v1/auth/me`, {
    headers: { Authorization: `Bearer ${tok}` },
  });
  expect(me.ok()).toBeTruthy();
  expect((await me.json()).npub).toBe(pubHex);
});

test("tampered nostr event is rejected", async ({ page }) => {
  const { pubHex, skHex } = genKey();
  await page.goto("/login");
  await page.getByRole("button", { name: "Continue with Nostr" }).click();
  await page.getByRole("button", { name: "QR / mobile" }).click();
  await page.getByPlaceholder("64 hex chars").fill(pubHex);
  await page.getByRole("button", { name: "Get login challenge" }).click();
  await expect(page.locator("p code").first()).not.toBeEmpty();

  const event = signEvent(skHex, {
    pubkey: pubHex,
    created_at: Math.floor(Date.now() / 1000),
    kind: 27235,
    tags: [],
    content: "tampered-not-the-challenge",
  });
  await page
    .getByPlaceholder('{"id":...,"pubkey":...,"sig":...}')
    .fill(JSON.stringify(event));
  await page.getByRole("button", { name: "Verify and sign in" }).click();
  await expect(page.locator("p.error")).toBeVisible();
  await expect(page).toHaveURL("/login");
});

test("admin users table, deactivate blocks login, non-admin bounced", async ({
  browser,
}) => {
  const boss = uname("e2e_boss");
  const victim = uname("e2e_victim");

  const adminCtx = await browser.newContext();
  const adminPage = await adminCtx.newPage();
  await register(adminPage, boss, "s3cretpass");
  await promoteAdmin(boss);
  await adminPage.reload();
  await adminPage.goto("/admin/users");
  await expect(adminPage.getByRole("heading", { name: "Users" })).toBeVisible();
  await expect(adminPage.getByRole("cell", { name: boss })).toBeVisible();

  const victimCtx = await browser.newContext();
  const victimPage = await victimCtx.newPage();
  await register(victimPage, victim, "s3cretpass");
  await victimPage.goto("/admin/users");
  await expect(victimPage).toHaveURL("/");
  await adminPage.goto("/admin/users");

  const row = adminPage.locator("tr", { hasText: victim });
  await row.getByRole("button", { name: "Deactivate" }).click();
  await expect(row.getByRole("button", { name: "Activate" })).toBeVisible();

  const retryCtx = await browser.newContext();
  const retryPage = await retryCtx.newPage();
  await retryPage.goto("/login");
  await retryPage.getByLabel("Username").fill(victim);
  await retryPage.getByLabel("Password").fill("s3cretpass");
  await retryPage.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(retryPage.locator("p.error")).toBeVisible();

  await adminCtx.close();
  await victimCtx.close();
  await retryCtx.close();
});

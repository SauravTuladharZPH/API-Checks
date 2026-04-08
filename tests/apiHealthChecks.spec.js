import { test } from "@playwright/test";
import fs from "fs";
import path from "path";
import { request as pwRequest } from "@playwright/test";
import dotenv from "dotenv";

// -------- Load .env --------
dotenv.config();

// -------- Config --------
const dataDir = path.resolve("./Data");
const resultDir = path.resolve("./test-results");
const errorFilePath = path.resolve("./Data/errorMessages.txt");
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

if (!SLACK_WEBHOOK_URL) {
  throw new Error("SLACK_WEBHOOK_URL is not set in environment variables!");
}

// Ensure result folder exists
if (!fs.existsSync(resultDir)) {
  fs.mkdirSync(resultDir, { recursive: true });
}

// -------- Load Error Messages (TXT) --------
const knownErrors = fs
  .readFileSync(errorFilePath, "utf-8")
  .split("\n")
  .map((line) => line.trim().toLowerCase())
  .filter(Boolean);

// -------- Helper Function --------
function isKnownError(message) {
  if (!message) return false;
  const msg = message.toLowerCase();
  return knownErrors.some((err) => msg.includes(err));
}

// -------- Load all client JSON files --------
const clientFiles = fs
  .readdirSync(dataDir)
  .filter((file) => file.endsWith(".json"));

// -------- Slack notifier --------
async function sendSlackNotification(message, clientName) {
  const requestContext = await pwRequest.newContext();
  try {
    await requestContext.post(SLACK_WEBHOOK_URL, {
      headers: { "Content-Type": "application/json" },
      data: { text: message },
    });
    console.log(`✅ Slack notification sent for: ${clientName}`);
  } catch (err) {
    console.error(
      `❌ Slack notification failed for: ${clientName}: `,
      err.message
    );
  } finally {
    await requestContext.dispose();
  }
}

// -------- API Runner --------
async function runClientAPICheck(clientData, clientName, requestContext) {
  const apiResults = [];
  let hasFailure = false;
  let authToken = "";

  const username = process.env[`${clientName.toUpperCase()}_USERNAME`];
  const password = process.env[`${clientName.toUpperCase()}_PASSWORD`];
  const clientId = process.env[`${clientName.toUpperCase()}_CLIENTID`];

  if (!username || !password) {
    throw new Error(`Credentials missing for client: ${clientName}`);
  }

  // -------- Login --------
  try {
    const formData = new URLSearchParams();
    formData.append("grant_type", "password");
    formData.append("username", username);
    formData.append("password", password);
    formData.append("client_id", clientId);

    const loginResponse = await requestContext.post(clientData.login.url, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      data: formData.toString(),
    });

    if (loginResponse.status() !== 200) {
      const text = await loginResponse.text();
      throw new Error(`Login failed: ${loginResponse.status()} | ${text}`);
    }

    const loginBody = await loginResponse.json();
    authToken = loginBody.access_token;

    console.log(`[${clientName}] ✅ Login successful`);
    apiResults.push({
      url: clientData.login.url,
      status: 200,
      message: "Login Success",
      requestId: "N/A",
    });
  } catch (error) {
    console.error(`[${clientName}] ❌ Login failed`, error.message);
    apiResults.push({
      url: clientData.login.url,
      status: "ERROR",
      message: error.message,
      requestId: "N/A",
    });
    hasFailure = true;
  }

  // -------- API Calls --------
  for (const api of clientData.apis) {
    const { method = "POST", url, payload } = api;

    try {
      let response;

      if (method.toUpperCase() === "GET") {
        const finalUrl = payload
          ? `${url}?${new URLSearchParams(payload).toString()}`
          : url;

        response = await requestContext.get(finalUrl, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
      } else if (method.toUpperCase() === "POST") {
        response = await requestContext.post(url, {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
          },
          data: payload,
        });
      } else {
        throw new Error(`Unsupported method: ${method}`);
      }

      let responseBody = {};
      try {
        responseBody = await response.json();
      } catch {}

      const message = responseBody.message || "N/A";
      const requestId = responseBody.requestId || "N/A";

      console.log(
        `[${clientName}] ${method} ${url} -> ${response.status()} | ${message}`
      );

      apiResults.push({ url, status: response.status(), message, requestId });

      // ✅ Updated condition using TXT file
      if (response.status() !== 200 || isKnownError(message)) {
        hasFailure = true;
      }
    } catch (error) {
      console.error(`[${clientName}] ❌ ${url} failed`, error.message);
      apiResults.push({
        url,
        status: "ERROR",
        message: error.message,
        requestId: "N/A",
      });
      hasFailure = true;
    }
  }

  // -------- Save Results --------
  const lines = apiResults.map(
    (r) => `URL       : ${r.url}
Status    : ${r.status}
Message   : ${r.message}
RequestId : ${r.requestId}
-----------------------------`
  );

  const clientFilePath = path.join(resultDir, `${clientName}_api_results.txt`);
  fs.writeFileSync(clientFilePath, lines.join("\n"));
  console.log(`📁 Saved results: ${clientFilePath}`);

  // -------- Slack Notification --------
  if (hasFailure) {
    const failedApis = apiResults.filter(
      (r) => r.status !== 200 || isKnownError(r.message)
    );

    const details = failedApis
      .map(
        (r) => `URL       : ${r.url}
Status    : ${r.status}
Message   : ${r.message}
RequestId : ${r.requestId}
-----------------------------`
      )
      .join("\n");

    const slackMessage = `:warning: API Health Check Failed for ${clientName}\n${details}`;
    await sendSlackNotification(slackMessage, clientName);
  } else {
    console.log(`✅ All APIs passed for ${clientName}`);
  }
}

// -------- Dynamic Test Creation --------
for (const clientFile of clientFiles) {
  const clientName = path.basename(clientFile, ".json");
  const clientData = JSON.parse(
    fs.readFileSync(path.join(dataDir, clientFile))
  );

  test(`API Health Check - ${clientName}`, async ({ request }) => {
    await runClientAPICheck(clientData, clientName, request);
  });
}

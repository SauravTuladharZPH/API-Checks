# Provider Portal API Health Check Automation

## 1. Overview

The **API Health Check Automation** framework is a **Playwright-based** test suite designed to:

* Dynamically verify the health of client-specific APIs.
* Capture per-client API responses.
* Save results to the `test-results/` folder.
* Alert failures via Slack notifications.

---

## 2. Architecture & Design

### 2.1 Project Structure

```
project-root/
├── Data/                  # JSON files containing client API configurations
│   ├── client1.json
│   ├── client2.json
├── test-results/          # Stores per-client API results
├── apiHealthCheck.spec.js # Main Playwright test file
├── package.json
├── .env                   # Environment variables for credentials and Slack webhook
└── README.md
```

## 3. Client JSON Configuration

Each client has a `.json` file:

```json
{
  "login": {
    "url": "https://example.com/api/login"
  },
  "apis": [
    {
      "url": "https://example.com/api/eligibility/v2/check",
      "payload": { "memberId": "12345" }
    },
    {
      "url": "https://example.com/api/profile/v1/get",
      "payload": {}
    }
  ]
}
```

* `login.url` – Authentication endpoint.
* `apis` – Array of API calls with `url` and `payload`.
* HTTP `method` defaults to `POST` if not specified.

---

## 4. Environment Variables

Create a `.env` file in the project root:

```env
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/XXX/YYY/ZZZ

CLIENT1_USERNAME=client1_user
CLIENT1_PASSWORD=client1_pass
CLIENT1_CLIENTID=client1_id

CLIENT2_USERNAME=client2_user
CLIENT2_PASSWORD=client2_pass
CLIENT2_CLIENTID=client2_id
```

* Credentials are picked per client dynamically from environment variables.
* `SLACK_WEBHOOK_URL` is required for failure notifications.

---

## 5. Technical Details

* **Node.js:** v18+
* **Playwright:** v1.44+
* **Dependencies:** `@playwright/test`, `dotenv`, `fs`, `path`

---

## 8. Execution

```bash
# Install dependencies
npm install

# Run Playwright tests
npx playwright test apiHealthCheck.spec.js

# Test results saved in test-results/
# Slack notifications sent for any failures
```
# X12S private Google Sheets sync — setup and safety

## Status

This pull request adds a Vercel server-side endpoint `/api/dashboard` and a read-only refresh in the React dashboard.
**It is NOT live until the Google Cloud workload identity federation, service-account impersonation, and deployment access protection are verified.**
The endpoint is **disabled by default** (`X12S_LIVE_SYNC_ENABLED` absent or not `true` returns HTTP 503).
When the API is unavailable, the existing dashboard works in local preview / import mode.

**Never commit a Google service-account JSON key, a spreadsheet export, or a real business-data file to this PUBLIC repository.**

## Existing sources — verified

- Master spreadsheet ID: `1fxBdPYfD0GAlEFnyaI371TKpZO-JV44ogx1WG6WznOU`
- Agency spreadsheet ID: `1Yj0b_Pl1vd_iooDIrXfH8GXxwBWm3cS_tCVo1uEQsoQ`
- Service account: `x12s-dashboard-reader@israel-x12s-dashboard.iam.gserviceaccount.com`
- Google Cloud project ID: `israel-x12s-dashboard`

The service account must have **Viewer** permission on both individual Sheets, not Editor and not a project-wide data-reader role. Both Sheets must remain **Restricted**.

### Data contract

- October X12S SO: MH 32, ALM 17, KSP 1, Other Offline 28, Online 27, total 105.
- November HQ SO: blank / not reported; blanks stay `null`, never 0.
- The 700-unit target belongs to the launch period, NOT November alone.
- Agency `02 Spend Claims` rows become `actualSpend` only if Model is X12S, currency USD, MKT Review Status is `Approved`, and `MKT Approved Actual` is numeric.
- Retail activity is marked `Verified / Completed` only with MKT verification AND evidence URL.
- The main master has not yet been populated with validated **USD X12S Q4 budget** in a stable integration tab; therefore the endpoint leaves `budgets.months` empty instead of accidentally reading unrelated ALL-model / ILS budgets.
- Agency and global/shared activity contributions are not automatically assigned to MH, ALM or KSP.

## Required security before enabling

1. Verify Vercel **Project → Settings → Deployment Protection → Require Log In → All Deployments** using a fresh incognito browser, not just your existing signed-in session. Do not give an external agency team membership merely to view the dashboard.
2. Enable **Google Sheets API** AND **IAM Service Account Credentials API** for project `israel-x12s-dashboard`.
3. Configure **Vercel OIDC** and Google **Workload Identity Federation** for this Vercel project. Scope the trust condition to the exact Vercel project/team and relevant environment, not any token from an arbitrary Vercel project. Verify the issuer, allowed audience, claims and provider URI in the current Vercel / Google Cloud documentation; do not guess provider values.
4. Grant the restricted workload-identity principal permission to impersonate ONLY the `x12s-dashboard-reader` service account (typically Workload Identity User; confirm the required IAM policy for service-account token generation). Do not grant Project Editor, Owner or blanket permissions.
5. Configure the following variables in **Vercel → Project → Settings → Environment Variables**, accessible only to server functions. Do NOT use any `VITE_*` variable for credentials:
   - `GOOGLE_WIF_AUDIENCE`: actual Google workload identity provider resource name
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL`: above service account address
   - `X12S_MASTER_SHEET_ID`: above master ID
   - `X12S_AGENCY_SHEET_ID`: above agency ID
   - `X12S_LIVE_SYNC_ENABLED`: leave unset/false until all tests pass
   - `VERCEL_OIDC_TOKEN`: issued by Vercel's native OIDC integration at runtime (do not paste an id token or store a static token yourself)
6. Redeploy the branch and test that `/api/dashboard` returns 503 before enablement and that an anonymous incognito request is blocked by deployment protection.
7. Only after IAM claims are verified and internal Vercel authentication is tested, set `X12S_LIVE_SYNC_ENABLED=true`, redeploy and verify private read. On success the frontend refreshes every 5 minutes.

**Caution:** Vercel Authentication is a deployment gate, not full application-level RBAC. This first version is for authorized Vercel team members. Do not onboard Sales/MKT/Agency external users or permit production use until explicit per-user access control and server-side authorization is designed and verified.

## UI behavior

- `Protected Sheets sync · refresh every 5 min` only appears after successful authenticated API response.
- All missing/failed responses stay in local preview mode; there is no artificial zero or false "live" status.
- Editing locally is *not* collaborative and will be overwritten when live refresh becomes enabled. Teams should edit their own Google Sheets.

## Go-live checklist

- [ ] Main and Agency Sheets Restricted; service account Viewer only
- [ ] Service account has no JSON private keys
- [ ] All Deployments protected, anonymous browser denied
- [ ] IAM Credentials API enabled
- [ ] WIF trusted issuer/audience/attribute conditions verified; minimal service account impersonation
- [ ] API tested disabled: 503; unauthenticated: denied
- [ ] API tested enabled: correct October 105; November null; budget null when unverified
- [ ] Company-approved budget tab, model scope, USD currency and approval controls finalized
- [ ] Operational identity and access roles approved before external sharing

This PR does not change any Google Sheets, cloud IAM policies, credentials, access rights or Vercel deployment configuration.

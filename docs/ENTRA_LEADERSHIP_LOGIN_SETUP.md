# X12S Microsoft 365 / Entra ID viewer access — staging checklist

## Purpose and current safety state

This is a **draft only** until the ECOVACS Microsoft Entra application is registered and tested.
Current Production remains behind **Vercel Authentication — All Deployments**. Do not disable it or merge this PR prematurely.

The browser login screen is *not* an access-control boundary. The server checks the signed HttpOnly session and exact allowlist **before** Google Sheets data retrieval. Unauthenticated users receive HTTP 401. No agency or Sheets editing permissions are granted.

## 1. IT / Entra admin: register the company application

Microsoft Entra admin center → Identity → Applications → App registrations → New registration:

- Name: `Israel X12S Leadership Viewer`
- Supported account types: **Accounts in this organizational directory only (single tenant)**.
- Platform: **Web**
- Redirect URI (exact): `https://il-x12-s-dashboard.vercel.app/api/auth/callback`
- No extra Graph permissions are necessary for the basic `openid profile email` sign-in.
- Record **Directory (tenant) ID** and **Application (client) ID**.
- Create a client secret appropriate to your IT policy (or adopt certificate auth later).
- Prefer assignment required / restrict app access to the intended corporate users in Enterprise Applications; require MFA / Conditional Access as your IT policy requires.
- IT must confirm that the `preferred_username` claim is the expected email for each viewer.

**Never send the client secret or session signing secret in chat, in screenshots or to GitHub.**

## 2. Owner: add Vercel Production-only variables

Vercel project → Settings → Environment Variables:

- `MS_ENTRA_TENANT_ID`: Directory (tenant) ID from IT.
- `MS_ENTRA_CLIENT_ID`: Application (client) ID.
- `MS_ENTRA_CLIENT_SECRET`: Client secret (set as a sensitive secret; keep server-side).
- `X12S_SESSION_SECRET`: Strong **random secret, at least 32 characters** (generate locally with a secure secret manager or cryptographic random generator).
- `X12S_ALLOWED_EMAILS`: comma-separated list of *exact* Microsoft identity email claims, initially:
  `rachel.zheng@ecovacs.com,della.ren@ecovacs.com,cynthia.cheng@ecovacs.com`
  **Include the owner's own Microsoft 365 account email too before cutover**, otherwise the owner will lose access to the new dashboard.
- `X12S_AUTH_BASE_URL`: `https://il-x12-s-dashboard.vercel.app` (optional; code defaults to this).

Only add to **Production**. Never prefix secrets with `VITE_`: Vite would expose them in the browser bundle.

Existing Google WIF variables remain unchanged; do **not** create static `VERCEL_OIDC_TOKEN`.

## 3. Safe deployment / cutover sequence

1. Obtain Microsoft tenant/client IDs and secret from IT; verify email claim values.
2. Before merging, review this PR, the backend token/session validation, and green CI.
3. Merge **only after** IT configuration is available. Vercel Authentication remains ON.
4. Deploy to Production and, while signed into Vercel, test `/api/auth/login` → Microsoft consent/login → `/api/auth/callback` → authenticated `/api/auth/me`. Authenticated owner should see `{"authenticated":true,"role":"viewer"}`. **Never expose tokens or secrets.**
5. While signed into Vercel, test `/api/dashboard` returns X12S data, and confirm the tabs MH/ALM/KSP work and editing is absent. Check October 105 vs November Pending.
6. Security test: without any Entra cookie, `/api/dashboard` should be 401 *once Vercel platform protection is no longer masking it*. A Microsoft account outside the allowlist must not obtain a session.
7. **Only after IT's authorization, end-to-end tests and a rollback plan**, consider disabling Vercel's platform-wide authentication to allow invited corporate viewers to pass through to Microsoft. This will make the public HTML/JS shell visible (the live sales and budgets remain API-protected). If *zero* public app shell exposure is required, implement a full edge middleware or alternative authenticated hosting before lifting Vercel Authentication. Never treat a login UI alone as security.
8. Test all three users from private browser sessions; confirm only emails on the allowlist can retrieve protected data; monitor Logs and revoke any improperly configured access immediately.
9. If anything is wrong, re-enable **Vercel Authentication → All Deployments** and rotate compromised secrets as needed.

## Auth design

- Microsoft OAuth2/OIDC authorization-code flow with PKCE S256, state and nonce.
- Single-tenant, validated issuer, audience, nonce, and Microsoft JWKS signature.
- `preferred_username` (or `email`) checked against an **exact server-side allowlist** before session issuance.
- Short-lived, signed, Secure, HttpOnly, SameSite=Lax session cookie (8 hours), no localStorage token.
- API authorization re-checks allowlist for *every* request; no front-end authorization trust.
- HTTP GET `/api/auth/me`, GET `/api/auth/login`, GET `/api/auth/callback`, POST `/api/auth/logout`.
- Microsoft app credentials and Google WIF token exchange always remain server-side.
- Current repo is public; private data must never be committed or baked into the client bundle.

## Open product decisions

- Confirm company IT security review, user lifecycle (who adds/removes emails), MFA/Conditional Access, and desired app-shell privacy.
- If budget data is introduced, ensure approved-only spend and no accidental broad Graph scopes.

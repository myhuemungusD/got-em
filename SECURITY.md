# Security Policy

## Supported versions

Only the latest `main` branch is supported. There are no long-lived release
branches; fixes land on `main`.

## Reporting a vulnerability

Please report security issues **privately**. Do not open a public issue for a
vulnerability.

- Preferred: open a [GitHub private security advisory](https://github.com/myhuemungusD/got-em/security/advisories/new).
- Or email: **jayham710@gmail.com**

We aim to acknowledge reports promptly and will keep you updated on a fix.

## What is (and isn't) a secret

The **Firebase web API key** shipped in the client is **public and expected** —
it is not a secret. It identifies the Firebase project to Google's APIs and is
safe to expose in client-side code. Reports that simply point out the API key is
visible in the bundle are not vulnerabilities.

Actual data security is enforced server-side by Firestore Security Rules in
[`firestore.rules`](./firestore.rules). The interesting attack surface is there.

## In scope — please report

- **Firestore rule bypasses** — reading or writing data a player shouldn't be
  able to access or modify.
- **Turn-order cheats** — acting out of turn or forcing another player's move.
- **Wager/scoring cheats** — manipulating bets, balances, or game results outside
  the intended transaction flow.
- Any way to corrupt or hijack another player's game session.

Include reproduction steps and the affected game mode where possible.

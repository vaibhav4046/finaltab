# FINALTab authentication email

`access.html` is the branded, provider-neutral HTML source for Supabase **Confirm sign up** and **Magic link** emails. It uses only current Supabase Go-template variables:

- `{{ .ConfirmationURL }}` preserves the configured PKCE redirect.
- `{{ .Token }}` supplies the project-configured numeric fallback; FINALTab's account UI accepts 6–8 digits.
- `{{ .Email }}` identifies the requested account without adding user-controlled HTML.

Suggested subject: `Your secure FINALTab access`.

Production activation remains fail-closed until a verified-domain custom SMTP provider or Send Email Hook is connected. After that external gate, copy this exact template into both hosted Auth templates, disable provider link tracking, set the production Site URL to `https://finaltab.vercel.app`, and allow only the exact `/auth/callback` return URL. Do not replace the confirmation URL with a client-composed token link.

# RapidAPI release package

Status: local HTTP adapter tested; RapidAPI account access verified. No public API backend or paid listing has been deployed. The Apify batch Actor remains separate and unchanged.

The import file is `openapi.json`. It deliberately contains no fabricated public server URL. Configure a real HTTPS deployment in RapidAPI Studio before publishing. API consumer authentication is configured by RapidAPI; the backend additionally verifies its gateway secret.

## Run

Use Node 22 or 24. Set `RAPIDAPI_PROXY_SECRET` from a secret manager to the API-specific gateway value (at least 32 characters); never put it in source, docs or an end-user request. Run `npm run serve`. Default bind is loopback port 8080. A deployment can set HOST and PORT; place behind HTTPS ingress with request rate/concurrency limits and a spending cap.

GET /health returns a minimal health result. POST /v1/check accepts the same input as the CLI and returns the full report. PASS and FAIL are both HTTP 200; invalid contracts are 422. Invalid JSON/UTF-8 is 400, missing/wrong gateway secret 401, oversized request 413, unsupported media or compression 415. Request bodies are capped while streaming, not only by Content-Length. No request content or credentials are logged by this adapter. Configure infrastructure logs and retention separately.

## Container deployment

From the repository root, build with `docker build -f rapidapi/Dockerfile -t delivery-check-api .`. This image starts the HTTP service, not the Apify Actor. It copies only the two required application modules and dependency manifests, runs as a non-root user and includes a health check. Inject `RAPIDAPI_PROXY_SECRET` at runtime using the hosting provider's secret settings. Do not pass a secret as a build argument or commit one in a deployment manifest.

Expose port 8080 behind managed HTTPS. Enforce an ingress body limit of 6 MiB, bounded concurrency and a hosting budget. Configure RapidAPI's Base URL only after checking HTTPS, gateway authentication, valid/invalid requests and actual quota enforcement through RapidAPI. The image has not been built in the current workspace because Docker is unavailable; local HTTP tests do not establish a live deployment.

Local HTTP tests cover gateway refusal, PASS/FAIL, invalid data/media, declared and chunked body limits. Public TLS, RapidAPI forwarding, consumer quota enforcement, load and payout are not yet verified. Do not advertise production availability until those checks pass.

Suggested trial offer, not published: 25 calls/month free with hard quota; $5/month for 500 checks, overages disabled. Unit economics remain unverified until hosting cost is known. RapidAPI marketplace fee is 25%, plus applicable payout charges. No new hosting spend or plan purchase is authorized by this package.

Source: https://docs.rapidapi.com/docs/hub-listing-gateway-tab and https://docs.rapidapi.com/docs/payouts-and-finance .

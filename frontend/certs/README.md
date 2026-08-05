# TLS certificate

nginx expects `fullchain.pem` and `privkey.pem` at `/etc/nginx/certs/` inside
the frontend container. They are **not** committed to this repo and **not**
baked into the Docker image — they're provisioned directly onto the
`frontend_certs` Docker volume on the deployment host, outside of Git.

Why: this is a self-signed certificate (there's no public CA option for an
internal IP address like `172.25.47.101`), and a private key — even for a
low-stakes self-signed cert — shouldn't sit in a public GitHub repo where
secret scanners (rightly) flag it. It also sidesteps this deployment's
network, which blocks both `apk add openssl` and GitHub/Docker Hub's auth
service at build time, so generating it inside the Docker build wasn't an
option either.

## Generating a cert

```bash
openssl req -x509 -newkey rsa:2048 -sha256 -days 3650 -nodes \
  -subj "/CN=<ip-or-host>" \
  -addext "subjectAltName=IP:<ip-or-host>" \
  -keyout privkey.pem \
  -out fullchain.pem
```

(On Git Bash for Windows, prefix with `MSYS_NO_PATHCONV=1` — otherwise MSYS
mangles the leading `/` in `-subj` into a Windows path.)

## Deploying it onto the volume

Copy `fullchain.pem` and `privkey.pem` onto the `frontend_certs` volume on
the Docker host (e.g. via a throwaway container that mounts the volume and
writes the files, or `docker cp` into a running frontend container then
restart it). The frontend container will pick them up on next start —
nginx reads them at `/etc/nginx/certs/`.

Regenerate and redeploy the same way if the deployment IP ever changes.

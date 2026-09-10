# TLS certificate

Same pattern as `frontend/certs/` (see that README for the full rationale):
a self-signed cert, provisioned directly onto the `certs` Docker volume on
the deployment host, never committed to this public repo and never baked
into the image.

## Generating

```bash
openssl req -x509 -newkey rsa:2048 -sha256 -days 3650 -nodes \
  -subj "/CN=prism.comviva.com" \
  -addext "subjectAltName=DNS:prism.comviva.com" \
  -keyout privkey.pem \
  -out fullchain.pem
```

(On Git Bash for Windows, prefix with `MSYS_NO_PATHCONV=1` — otherwise MSYS
mangles the leading `/` in `-subj` into a Windows path.)

## Deploying it

Write `fullchain.pem`/`privkey.pem` onto this stack's `certs` volume (e.g.
via a throwaway container that mounts the volume and writes the files).
Regenerate and redeploy the same way if the hostname ever changes, or when
adding more `server_name`s that need their own cert/SAN.

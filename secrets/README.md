# secrets/

Local-only folder for credentials and keys (SMTP/Graph mail credentials,
API tokens, private keys, etc.). Everything here except this README and
`.gitignore` is ignored by Git and excluded from Docker build contexts.

- Never commit real values. Document required keys in `backend/.env.example`.
- Share secrets with teammates out-of-band (password manager / vault), not via Git.

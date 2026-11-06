-- Extra CA certificate(s), PEM, trusted for the SMTP connection in addition
-- to Node's built-in public roots. For mail servers that use an internal CA
-- or don't send their intermediate certificate.
ALTER TABLE email_settings ADD COLUMN IF NOT EXISTS tls_ca_pem text;

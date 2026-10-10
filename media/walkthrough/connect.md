# Add a connection

Open the **sqldoro** view in the activity bar and select **Add Connection**, or **Import from URL** to
start from a `mysql://`, `postgres://` or `postgresql://` URL.

The form opens in an editor tab: choose MySQL or PostgreSQL, then fill in the connection, one field
per row: the name, the environment and the **Read-only** switch, the host and port, the user and the
password, and the database (the refresh button beside it lists those of the server). **Test**, then
**Save connection**. Problems show under each field as you type. **Import connection string**, at the
top of the form, fills the fields from a URL.

- **SSL/TLS**, under **Advanced settings**: `require` encrypts and checks the certificate;
  `verify-full` also checks that it names the host. Certificates are checked against the database
  host even through an SSH tunnel.
- **Tunnel**: SSH with a password or with a private key. The first time sqldoro meets an SSH server
  it shows its host key fingerprint: compare it with the one your administrator gives you before
  trusting it.
- **Environment**: tag production connections `prod`; sqldoro then asks you to type the connection
  name before anything writes there.
- **Writes**: new connections are **read-only**. Allow writes only where you mean to change data.

Passwords and passphrases live only in the VS Code secret storage, never in settings or logs.

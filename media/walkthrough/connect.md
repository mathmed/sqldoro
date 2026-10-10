# Add a connection

Open the **sqldoro** view in the activity bar and select **Add Connection**, or **Import from URL** to
start from a `mysql://`, `postgres://` or `postgresql://` URL.

The form is a list of fields: select one to change it, then **Test Connection** and **Save**.

- **SSL**: `require` encrypts and checks the certificate; `verify-full` also checks that it names the
  host. Certificates are checked against the database host even through an SSH tunnel.
- **SSH tunnel**: a password or a private key. The first time sqldoro meets an SSH server it shows
  its host key fingerprint: compare it with the one your administrator gives you before trusting it.
- **Environment**: tag production connections `prod`; sqldoro then asks you to type the connection
  name before anything writes there.
- **Writes**: new connections are **read-only**. Allow writes only where you mean to change data.

Passwords and passphrases live only in the VS Code secret storage, never in settings or logs.

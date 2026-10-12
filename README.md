# Atlantic Express Admin Panel

Static admin dashboard for managing Atlantic Express products, admins, orders, and transaction visibility.

The provider portal shares this repository but has a separate login and can
deploy independently using `Dockerfile.provider`. See [provider PWA setup](PROVIDER_PWA_SETUP.md).

## Coolify

- Repository: `https://github.com/3my1234/across-admin-panel`
- Build pack: Static
- Base directory: `/`
- Publish directory: `/`
- Domain: `https://admin.atlxpres.com`

The dashboard talks to the backend API URL entered on the login screen. Use:

```text
https://api.atlxpres.com
```

## First Admin

Create the first admin through the backend API using `X-Admin-Token` with the backend `ADMIN_BOOTSTRAP_TOKEN`.

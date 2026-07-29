# Backend

Node.js / TypeScript microservices, shared packages, and SQL migrations.

```
backend/
  packages/     @ngois/* shared libraries
  services/     Deployable HTTP services
  db/           Schema migrations
```

From the repo root:

```powershell
npm run build -w @ngois/errors -w @ngois/logging -w @ngois/config -w @ngois/db -w @ngois/tenant-context -w @ngois/service-kit
npm run dev:gateway   # :3000
npm run dev:auth      # :3001
npm run dev:grant     # :3002
npm run dev:tenant    # :3014
npm run db:migrate
npm run db:seed
```

Design authority: [`docs/sdd/`](../docs/sdd/README.md).

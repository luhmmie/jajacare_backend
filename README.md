
---

## Notes & design decisions

1. **Auth flow** — access token (15 min) + refresh token (7 day). Login returns both. Store `refreshToken` in `localStorage`, use `/auth/refresh` when access expires.
2. **Patient ID generation** — sequential per year, race-condition-safe enough for a demo (add a compound unique index or counter collection if you ever hit real concurrency).
3. **Appointment uniqueness** — enforced via partial unique index `{doctorId, date, timeSlot}` when status ≠ `cancelled`. Also checked in code for a friendly error.
4. **Consultation lock** — `PATCH` returns `409 CONFLICT` once `status !== 'draft'`.
5. **Prescription allergy check** — substring match against `patient.allergies`; returns `{ error, warning }` with the `warning` field your frontend expects.
6. **Pharmacy dispense** — decrements matching `Stock` by 1 (unit = one item of the prescription); marks the consultation `dispensed` when all prescriptions are handled.
7. **Role-scoped dashboard** — each role returns a different shape, as specified. Your `Dashboard` component should already handle the extra fields gracefully.
8. **Audit log** — every mutating controller calls `logAudit`; it's fire-and-forget to avoid breaking real requests.
9. **Error envelope** — every thrown `AppError` maps to `{ error: { code, message } }` automatically.
10. **CORS** — allows your Vite dev server.
11. **`_id` → `id`** — every model's `toJSON` normalises this so frontend code that uses `patient.id` keeps working.

## Frontend switchover

1. Add `VITE_API_URL=http://localhost:5000/api` and `VITE_MOCK=false` to your frontend `.env`.
2. Restart Vite.
3. Your `apiClient.js` should automatically route to the real backend — no page/component changes needed.

That's a complete, runnable implementation of the spec. Every P0–P4 endpoint is wired up, seeded, and error-handled in the required envelope.
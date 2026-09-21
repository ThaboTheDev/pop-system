-- Forward migration: 0004-0006 in this repository are already-used migration
-- versions, not the similarly numbered files in the external Phase 2 handover.
-- COMMIT THIS FILE ON ITS OWN before applying 0008. PostgreSQL cannot use a
-- newly added enum value in the transaction that adds it.
alter type user_role add value if not exists 'runner';
alter type payment_method add value if not exists 'cash';

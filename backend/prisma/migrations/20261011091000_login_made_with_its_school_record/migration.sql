-- A new person's login is made inside the school that adds them.
--
-- A school sees a login only when it holds a record for it (the account_wall
-- policy), so the school record has to exist before the login can be written
-- and read back. The record in turn points at the login. Checking that link at
-- the end of the transaction, rather than at each statement, lets the two be
-- written in that order: the record, then its login, then the commit. A school
-- never needs the platform pass to add somebody new.
ALTER TABLE "users" ALTER CONSTRAINT "users_account_id_fkey"
    DEFERRABLE INITIALLY DEFERRED;

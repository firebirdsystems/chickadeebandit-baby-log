-- Temperatures and medicines, as two more entry types: 'temperature' and
-- 'medicine'. They belong on the timeline beside feeds and naps because the
-- question they answer is a caregiver's handoff one — "did the nanny already
-- give her Tylenol, and when can she have more?" — and the child is a Baby
-- Log row, not a household member Medication Tracker could keep doses for.
-- A prescribed course still belongs in Medication Tracker; this is what was
-- given. Vaccines are not here: the log expires after two years.
--
--   temp_c100        the reading in hundredths of a degree Celsius. Hundredths,
--                    not tenths, so 101.2 °F typed comes back as 101.2 °F.
--                    Declared plaintext (manifest) as well as a number: Siri
--                    binds it as text ("3844"), and an undeclared column would
--                    encrypt that; the column's INTEGER affinity stores it as a
--                    number either way. The reports print it in °C and °F and
--                    mark a fever in SQL.
--   temp_method      rectal | armpit | ear | forehead | mouth. A reading means
--                    little without it. Plaintext (manifest), shown in reports.
--   med_name         what was given ("Infant Tylenol"). Free text, encrypted.
--   med_dose         how much ("2.5 ml", "80 mg"): units vary, so free text,
--                    encrypted.
--   repeat_after_min how long before the next dose of the same medicine, in
--                    whole minutes, as the label or the doctor said. NULL = not
--                    said. The page shows "not again before" from it; nothing
--                    is sent — a push saying a dose is possible reads as a
--                    prompt to give one.
--
-- Every column is empty or NULL on the other entry types, and on every entry
-- from before this migration.
ALTER TABLE app_baby_log__entries ADD COLUMN temp_c100 INTEGER;
ALTER TABLE app_baby_log__entries ADD COLUMN temp_method TEXT NOT NULL DEFAULT '';
ALTER TABLE app_baby_log__entries ADD COLUMN med_name TEXT NOT NULL DEFAULT '';
ALTER TABLE app_baby_log__entries ADD COLUMN med_dose TEXT NOT NULL DEFAULT '';
ALTER TABLE app_baby_log__entries ADD COLUMN repeat_after_min INTEGER;

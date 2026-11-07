ALTER TABLE public.restaurant_settings
  ADD COLUMN IF NOT EXISTS opening_hours jsonb;

UPDATE public.restaurant_settings
SET opening_hours = '{
  "monday": {"isOpen": true, "allDay": true, "opensAt": "00:00", "closesAt": "00:00"},
  "tuesday": {"isOpen": true, "allDay": true, "opensAt": "00:00", "closesAt": "00:00"},
  "wednesday": {"isOpen": true, "allDay": true, "opensAt": "00:00", "closesAt": "00:00"},
  "thursday": {"isOpen": true, "allDay": true, "opensAt": "00:00", "closesAt": "00:00"},
  "friday": {"isOpen": true, "allDay": true, "opensAt": "00:00", "closesAt": "00:00"},
  "saturday": {"isOpen": true, "allDay": true, "opensAt": "00:00", "closesAt": "00:00"},
  "sunday": {"isOpen": true, "allDay": true, "opensAt": "00:00", "closesAt": "00:00"}
}'::jsonb
WHERE opening_hours IS NULL;

ALTER TABLE public.restaurant_settings
  ALTER COLUMN opening_hours SET DEFAULT '{
    "monday": {"isOpen": true, "allDay": true, "opensAt": "00:00", "closesAt": "00:00"},
    "tuesday": {"isOpen": true, "allDay": true, "opensAt": "00:00", "closesAt": "00:00"},
    "wednesday": {"isOpen": true, "allDay": true, "opensAt": "00:00", "closesAt": "00:00"},
    "thursday": {"isOpen": true, "allDay": true, "opensAt": "00:00", "closesAt": "00:00"},
    "friday": {"isOpen": true, "allDay": true, "opensAt": "00:00", "closesAt": "00:00"},
    "saturday": {"isOpen": true, "allDay": true, "opensAt": "00:00", "closesAt": "00:00"},
    "sunday": {"isOpen": true, "allDay": true, "opensAt": "00:00", "closesAt": "00:00"}
  }'::jsonb;

ALTER TABLE public.restaurant_settings
  ALTER COLUMN opening_hours SET NOT NULL;

COMMENT ON COLUMN public.restaurant_settings.opening_hours IS
  'Weekly restaurant schedule keyed by lowercase weekday; times use Asia/Kolkata. isOpen=false closes a day, allDay=true means open the full local day, and opensAt later than closesAt denotes an overnight interval.';

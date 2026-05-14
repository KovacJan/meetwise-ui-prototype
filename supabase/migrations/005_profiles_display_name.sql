-- Add display_name to profiles so users can have a human-readable name
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS display_name TEXT;

-- Update the auto-create-profile trigger to also capture the full_name
-- that we pass via user_metadata when the user signs up.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name'
  )
  ON CONFLICT (id) DO UPDATE
    SET display_name = COALESCE(
      EXCLUDED.display_name,
      profiles.display_name
    );
  RETURN NEW;
END;
$$;

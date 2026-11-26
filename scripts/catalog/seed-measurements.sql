-- Optional examples for a local development database. Bounds are micrometres.
INSERT INTO measurement_definitions
  (key, name, description, instructions, unit, precision, min, max)
VALUES
  ('bust-circumference', 'Circumferința bustului', '', 'Măsoară în jurul bustului, în punctul cel mai plin.', 'cm', 1, 450000, 2000000),
  ('waist-circumference', 'Circumferința taliei', '', 'Măsoară în jurul taliei naturale.', 'cm', 1, 350000, 2200000),
  ('hip-circumference', 'Circumferința șoldurilor', '', 'Măsoară în jurul șoldurilor, la lățimea maximă.', 'cm', 1, 450000, 2400000),
  ('shoulder-width', 'Lățimea umerilor', '', 'Măsoară distanța dintre extremitățile umerilor.', 'cm', 1, 150000, 900000),
  ('sleeve-length', 'Lungimea mânecii', '', 'Măsoară de la umăr până la încheietură.', 'cm', 1, 100000, 1200000),
  ('garment-length', 'Lungimea articolului', '', 'Măsoară de la punctul de reper indicat până la tiv.', 'cm', 1, 50000, 2500000),
  ('neck-circumference', 'Circumferința gâtului', '', 'Măsoară în jurul bazei gâtului.', 'cm', 1, 150000, 1000000)
ON CONFLICT (key) DO NOTHING;

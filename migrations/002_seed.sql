-- Placeholder seed content for local dev; the test suite seeds its own rows
-- (see server/tests/setup.js) so this file is not used by tests.
INSERT INTO colors (slug, name, hex, tagline, story, price_cents, stock, image_key, sort_order, active)
VALUES
  (
    'sunlit-amber',
    'Sunlit Amber',
    '#E0A030',
    'Warmth you can carry',
    'Late-afternoon light and quiet courage — Sunlit Amber holds the glow of a sky just before dusk, a small reminder to carry your own warmth with you.',
    4800,
    20,
    'colors/amber.png',
    1,
    1
  ),
  (
    'forest-emerald',
    'Forest Emerald',
    '#1E7A4C',
    'Growth, quietly',
    'Renewal and patience, one bead at a time — Forest Emerald is for the slow, steady kind of growth that happens when no one is watching.',
    4800,
    20,
    'colors/emerald.png',
    2,
    1
  ),
  (
    'ocean-topaz',
    'Ocean Topaz',
    '#1F7A9C',
    'Calm in every wave',
    'Clarity and calm from the deep sea — Ocean Topaz carries the steadiness of the tide, even when the surface feels unsettled.',
    4800,
    20,
    'colors/ocean.png',
    3,
    1
  );

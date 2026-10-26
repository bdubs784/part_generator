-- The open 688 is 8 x 16 x 4. The 5 mm width in 0002 is the shielded 688ZZ.
-- Checked against NSK's 688A and 688AZZ1 pages; 0002 has already run in
-- production, so the fix is its own migration.
UPDATE catalog_bearings
SET width_mm = 4, notes = 'thin section (shielded 688ZZ is 5 wide)'
WHERE designation = '688';

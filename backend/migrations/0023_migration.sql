-- Fix users whose primaryMembership was incorrectly set to an add-on type.
-- "Storage - Large Shelf" is an add-on; move it out of primaryMembership and into addOns.
UPDATE "User"
SET
  "primaryMembership" = NULL,
  "addOns" = '["Storage - Large Shelf"]'
WHERE "primaryMembership" = 'Storage - Large Shelf';

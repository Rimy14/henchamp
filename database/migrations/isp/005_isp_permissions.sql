-- =====================================================
-- ISP Module — 005: RBAC permissions
--
-- Follows the existing 2-segment `resource:action` convention. The wildcard
-- match in server/middleware/rbac.middleware.js means `isp:*` grants every
-- permission below.
--
-- Permission scheme:
--   isp:read        view subscribers, vouchers, sessions, usage
--   isp:packages    create / edit tariff packages
--   isp:subscribers create / edit subscriber accounts
--   isp:suspend     suspend, restore, disconnect  (destructive — cuts service)
--   isp:vouchers    generate, revoke, reset device binding
--   isp:nas         manage routers (holds router admin credentials)
--
-- Idempotent: safe to re-run.
-- =====================================================

-- Admin: full ISP access via wildcard
INSERT INTO `role_permissions` (`role_id`, `permission`)
SELECT r.id, 'isp:*'
FROM `roles` r
WHERE r.name = 'Admin'
  AND NOT EXISTS (
      SELECT 1 FROM `role_permissions` rp
      WHERE rp.role_id = r.id AND rp.permission = 'isp:*'
  );

-- Coordinator: day-to-day operations. Can run the ISP desk — sell and manage
-- vouchers, onboard subscribers — but cannot cut off a paying customer or
-- touch router credentials. Those stay with Admin.
INSERT INTO `role_permissions` (`role_id`, `permission`)
SELECT r.id, p.permission
FROM `roles` r
CROSS JOIN (
    SELECT 'isp:read'        AS permission
    UNION ALL SELECT 'isp:subscribers'
    UNION ALL SELECT 'isp:vouchers'
) p
WHERE r.name = 'Coordinator'
  AND NOT EXISTS (
      SELECT 1 FROM `role_permissions` rp
      WHERE rp.role_id = r.id AND rp.permission = p.permission
  );

-- Cashier: sells vouchers at the counter, so needs to read and generate them,
-- but nothing else.
INSERT INTO `role_permissions` (`role_id`, `permission`)
SELECT r.id, p.permission
FROM `roles` r
CROSS JOIN (
    SELECT 'isp:read'    AS permission
    UNION ALL SELECT 'isp:vouchers'
) p
WHERE r.name = 'Cashier'
  AND NOT EXISTS (
      SELECT 1 FROM `role_permissions` rp
      WHERE rp.role_id = r.id AND rp.permission = p.permission
  );

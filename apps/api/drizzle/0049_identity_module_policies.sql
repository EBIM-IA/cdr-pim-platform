-- Independent application menu policies do not edit or replace identity-provider roles.
CREATE TABLE identity_module_policies (
  role text NOT NULL CHECK(role IN ('ADMINISTRADOR','COMPRAS','VENTAS')),
  capability text NOT NULL CHECK(capability LIKE 'menu:%:view'),
  visible boolean NOT NULL,
  actor_id text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(role,capability),
  CHECK(role <> 'ADMINISTRADOR' OR capability <> 'menu:administration:view' OR visible)
);

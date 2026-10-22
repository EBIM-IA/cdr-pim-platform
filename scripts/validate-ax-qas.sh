#!/usr/bin/env bash

set -euo pipefail

BASE_URL="${AX_QAS_BASE_URL:-https://pim-qas.casadelruliman.com}"
API_URL="${BASE_URL%/}/api/v1"

if [[ "$BASE_URL" != https://* ]]; then
  echo "ERROR: AX_QAS_BASE_URL debe usar HTTPS." >&2
  exit 2
fi

for command in curl jq; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "ERROR: falta el comando requerido: $command" >&2
    exit 2
  fi
done

if [[ ! -r /dev/tty ]]; then
  echo "ERROR: se requiere una terminal para leer el token sin mostrarlo." >&2
  exit 2
fi

printf 'Token AX de QAS (no se mostrará ni guardará): ' >/dev/tty
IFS= read -r -s AX_QAS_TOKEN </dev/tty
printf '\n' >/dev/tty

if [[ ! "$AX_QAS_TOKEN" =~ ^[0-9a-f]{64}$ ]]; then
  AX_QAS_TOKEN=''
  echo "ERROR: el token debe contener exactamente 64 caracteres hexadecimales en minúscula." >&2
  exit 2
fi

TEST_DIR="$(mktemp -d "${TMPDIR:-/tmp}/cdr-ax-qas.XXXXXX")"

cleanup() {
  AX_QAS_TOKEN=''
  find "$TEST_DIR" -type f -delete 2>/dev/null || true
  rmdir "$TEST_DIR" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

PASSED=0

assert_status() {
  local name="$1"
  local expected="$2"
  local actual="$3"

  if [[ "$actual" != "$expected" ]]; then
    echo "FALLO $name: HTTP $actual, esperado $expected" >&2
    jq -c 'if has("error") then .error else . end' "$TEST_DIR/$name.body" 2>/dev/null || true
    exit 1
  fi

  PASSED=$((PASSED + 1))
  printf 'OK  %-22s HTTP %s\n' "$name" "$actual"
}

request() {
  local name="$1"
  local method="$2"
  local url="$3"
  local authentication="$4"
  local payload="${5:-}"
  local args=(
    --silent
    --show-error
    --max-time 30
    --request "$method"
    --dump-header "$TEST_DIR/$name.headers"
    --output "$TEST_DIR/$name.body"
    --write-out '%{http_code}'
    --header 'Accept: application/json'
  )

  if [[ "$authentication" == 'yes' ]]; then
    args+=(--header "Authorization: Bearer $AX_QAS_TOKEN")
  fi
  if [[ -n "$payload" ]]; then
    args+=(--header 'Content-Type: application/json' --data-binary "$payload")
  fi

  curl "${args[@]}" "$url"
}

echo "Validando receptor AX en $BASE_URL"
echo "La prueba creará un lote identificable en el buzón QAS; no modifica el catálogo maestro."

HEALTH_CODE="$(request health GET "$API_URL/health/ready" no)"
assert_status health 200 "$HEALTH_CODE"
jq -e '.status == "up" and any(.checks[]; .name == "database" and .status == "up")' \
  "$TEST_DIR/health.body" >/dev/null

AUTH_CHECK_ID="AX-AUTH-CHECK-$(date -u +%Y%m%d%H%M%S)-$$"
AUTH_CODE="$(request auth_check GET "$API_URL/productos/sincronizaciones/$AUTH_CHECK_ID" yes)"
assert_status auth_check 404 "$AUTH_CODE"
jq -e '.error.code == "NOT_FOUND" and .error.message == "AX inbound batch not found"' \
  "$TEST_DIR/auth_check.body" >/dev/null
grep -qi '^x-cdr-ax-inbound: true' "$TEST_DIR/auth_check.headers"

BATCH_ID="AX-QAS-SMOKE-$(date -u +%Y%m%d%H%M%S)-$$"
SENT_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
VALID_PAYLOAD="$(jq -cn \
  --arg idLote "$BATCH_ID" \
  --arg fechaEnvio "$SENT_AT" \
  '{
    idLote: $idLote,
    fechaEnvio: $fechaEnvio,
    sistemaOrigen: "SISMETIC_AX",
    productos: [{
      codigoArticulo: "000123",
      codigoProveedor: "PRV-001",
      codigoUnificador: "UNI-6205",
      codigoLinea: "RODAMIENTOS",
      tipoAplicacion: "AUTOMOTRIZ",
      marca: "SKF",
      fechaModificacion: $fechaEnvio
    }]
  }')"

VALID_CODE="$(request valid POST "$API_URL/productos/sincronizar" yes "$VALID_PAYLOAD")"
assert_status valid 202 "$VALID_CODE"
jq -e --arg id "$BATCH_ID" \
  '.idLote == $id and .estado == "RECIBIDO" and .registrosRecibidos == 1' \
  "$TEST_DIR/valid.body" >/dev/null
FIRST_RECEIVED_AT="$(jq -r '.fechaRecepcion' "$TEST_DIR/valid.body")"

STATUS_CODE="$(request status GET "$API_URL/productos/sincronizaciones/$BATCH_ID" yes)"
assert_status status 200 "$STATUS_CODE"
jq -e --arg id "$BATCH_ID" \
  '.idLote == $id and .estado == "RECIBIDO" and .registrosRecibidos == 1 and (.requestHash | test("^sha256:[0-9a-f]{64}$"))' \
  "$TEST_DIR/status.body" >/dev/null

RETRY_CODE="$(request retry POST "$API_URL/productos/sincronizar" yes "$VALID_PAYLOAD")"
assert_status retry 202 "$RETRY_CODE"
RETRY_RECEIVED_AT="$(jq -r '.fechaRecepcion' "$TEST_DIR/retry.body")"
if [[ "$RETRY_RECEIVED_AT" != "$FIRST_RECEIVED_AT" ]]; then
  echo "FALLO retry: el recibo cambió; el reenvío pudo duplicarse." >&2
  exit 1
fi

CONFLICT_PAYLOAD="$(jq -c '.productos[0].marca = "NTN"' <<<"$VALID_PAYLOAD")"
CONFLICT_CODE="$(request conflict POST "$API_URL/productos/sincronizar" yes "$CONFLICT_PAYLOAD")"
assert_status conflict 409 "$CONFLICT_CODE"
jq -e '.error.code == "CONFLICT"' "$TEST_DIR/conflict.body" >/dev/null

NO_TOKEN_CODE="$(request no_token POST "$API_URL/productos/sincronizar" no "$VALID_PAYLOAD")"
assert_status no_token 401 "$NO_TOKEN_CODE"
jq -e '.error.code == "UNAUTHORIZED"' "$TEST_DIR/no_token.body" >/dev/null

INVALID_PAYLOAD="$(jq -cn \
  --arg idLote "$BATCH_ID-INVALID" \
  --arg fechaEnvio "$SENT_AT" \
  '{
    idLote: $idLote,
    fechaEnvio: $fechaEnvio,
    productos: [{
      codigoArticulo: 123,
      codigoProveedor: "PRV-001",
      codigoLinea: "RODAMIENTOS"
    }]
  }')"
INVALID_CODE="$(request invalid_schema POST "$API_URL/productos/sincronizar" yes "$INVALID_PAYLOAD")"
assert_status invalid_schema 400 "$INVALID_CODE"
jq -e '.error.code == "VALIDATION_FAILED"' "$TEST_DIR/invalid_schema.body" >/dev/null

echo
echo "Resultado: $PASSED comprobaciones HTTP superadas."
echo "Lote QAS: $BATCH_ID"
echo "Estado: RECIBIDO; consulta, idempotencia, conflicto y seguridad validados."
echo "No se probó 429 automáticamente para no afectar a otros usuarios de QAS."

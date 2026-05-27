#!/usr/bin/env bash
# =============================================================================
# subir_frontend.sh — Build del frontend y sync a S3 + invalidación CloudFront
#
# USO:
#   export VITE_API_URL=http://TU-ALB.us-east-1.elb.amazonaws.com
#   export S3_BUCKET=mypredicts-frontend
#   export CF_DISTRIBUTION_ID=EXXXXXXXXXXXX
#   bash scripts/subir_frontend.sh
# =============================================================================
set -euo pipefail

VITE_API_URL="${VITE_API_URL:?Falta VITE_API_URL — ej: http://TU-ALB.us-east-1.elb.amazonaws.com}"
S3_BUCKET="${S3_BUCKET:?Falta S3_BUCKET — nombre del bucket S3}"
CF_DISTRIBUTION_ID="${CF_DISTRIBUTION_ID:?Falta CF_DISTRIBUTION_ID — ID de la distribución CloudFront}"
AWS_REGION="${AWS_REGION:-us-east-1}"

echo ">>> API URL:  ${VITE_API_URL}"
echo ">>> S3:       s3://${S3_BUCKET}"
echo ">>> CF:       ${CF_DISTRIBUTION_ID}"

# 1. Instalar dependencias
echo ">>> npm ci..."
(cd frontend && npm ci)

# 2. Build con la URL del backend inyectada
echo ">>> npm run build..."
(cd frontend && VITE_API_URL="${VITE_API_URL}" npm run build)

# 3. Subir a S3
#    - assets con hash → cache 1 año
#    - index.html y otros html → sin cache
echo ">>> Sincronizando a S3..."
aws s3 sync frontend/dist/ "s3://${S3_BUCKET}/" \
  --region "${AWS_REGION}" \
  --delete \
  --cache-control "public,max-age=31536000,immutable" \
  --exclude "*.html"

aws s3 sync frontend/dist/ "s3://${S3_BUCKET}/" \
  --region "${AWS_REGION}" \
  --cache-control "no-cache,no-store,must-revalidate" \
  --include "*.html"

# 4. Invalidar CloudFront para que sirva la nueva versión
echo ">>> Invalidando CloudFront..."
aws cloudfront create-invalidation \
  --distribution-id "${CF_DISTRIBUTION_ID}" \
  --paths "/*"

echo ""
echo "✅ Frontend desplegado correctamente."
echo "   La URL de CloudFront tardará ~2 minutos en propagarse."

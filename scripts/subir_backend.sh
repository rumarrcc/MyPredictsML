#!/usr/bin/env bash
# =============================================================================
# subir_backend.sh — Construye la imagen Docker y la sube a ECR (us-east-1)
#
# USO:
#   export AWS_ACCOUNT_ID=123456789012
#   export AWS_REGION=us-east-1          # (ya es el default)
#   export ECR_REPO=mypredicts-api       # (ya es el default)
#   bash scripts/subir_backend.sh
# =============================================================================
set -euo pipefail

AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:?Falta AWS_ACCOUNT_ID — ejecuta: export AWS_ACCOUNT_ID=TU_ID}"
AWS_REGION="${AWS_REGION:-us-east-1}"
ECR_REPO="${ECR_REPO:-mypredicts-api}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
ECR_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO}"

echo ">>> Repositorio ECR: ${ECR_URI}:${IMAGE_TAG}"

# 1. Autenticarse en ECR
echo ">>> Autenticando en ECR..."
aws ecr get-login-password --region "${AWS_REGION}" \
  | docker login --username AWS --password-stdin \
    "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

# 2. Crear el repositorio si no existe
aws ecr describe-repositories --repository-names "${ECR_REPO}" \
    --region "${AWS_REGION}" > /dev/null 2>&1 || \
  aws ecr create-repository --repository-name "${ECR_REPO}" \
    --region "${AWS_REGION}" --image-scanning-configuration scanOnPush=true

# 3. Build para linux/amd64 (requerido por Fargate)
echo ">>> Construyendo imagen (linux/amd64)..."
docker build --platform linux/amd64 \
  -t "${ECR_REPO}:${IMAGE_TAG}" \
  -f backend/Dockerfile \
  backend/

# 4. Tag y push
docker tag "${ECR_REPO}:${IMAGE_TAG}" "${ECR_URI}:${IMAGE_TAG}"
echo ">>> Subiendo imagen..."
docker push "${ECR_URI}:${IMAGE_TAG}"

echo ""
echo "✅ Imagen subida: ${ECR_URI}:${IMAGE_TAG}"
echo "   Usa esta URI en tu Task Definition de ECS."

#!/bin/bash
# Build the ZeroHour FastAPI backend image and deploy to Cloud Run.
# Run AFTER gcp-setup.sh and after you have a Postgres + Redis connection string.

set -e

PROJECT_ID=$(gcloud config get-value project)
REGION="us-central1"
REPO="zerohour"
SERVICE="zerohour-backend"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/backend:latest"

# ---------- required env vars ----------
# Export these before running:
#   export DB_URL="postgresql+asyncpg://user:pass@host:5432/zerohour"
#   export REDIS_URL="redis://host:6379"
#   export GEMINI_API_KEY="your-api-key-from-aistudio.google.com"

if [[ -z "$DB_URL" || -z "$REDIS_URL" || -z "$GEMINI_API_KEY" ]]; then
    echo "ERROR: Set these env vars before running:"
    echo "  export DB_URL='postgresql+asyncpg://...'"
    echo "  export REDIS_URL='redis://...'"
    echo "  export GEMINI_API_KEY='your-api-key'"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> Building backend image..."
docker build \
  -t "$IMAGE" \
  "$SCRIPT_DIR/../backend"

echo "==> Pushing to Artifact Registry..."
docker push "$IMAGE"

echo "==> Deploying backend to Cloud Run..."
gcloud run deploy "$SERVICE" \
  --image="$IMAGE" \
  --region="$REGION" \
  --platform=managed \
  --allow-unauthenticated \
  --memory=1Gi \
  --cpu=1 \
  --concurrency=80 \
  --min-instances=0 \
  --max-instances=3 \
  --timeout=60 \
  --port=8000 \
  --set-env-vars="DATABASE_URL=${DB_URL},REDIS_URL=${REDIS_URL},GEMINI_API_KEY=${GEMINI_API_KEY},GEMINI_MODEL=gemma-4-27b-it" \
  --project="$PROJECT_ID"

URL=$(gcloud run services describe "$SERVICE" \
  --region="$REGION" \
  --project="$PROJECT_ID" \
  --format="value(status.url)")

echo ""
echo "==> Backend deployed: $URL"
echo ""
echo "    Use this URL as BACKEND_URL when running deploy-frontend-gcp.sh:"
echo "    export BACKEND_URL=${URL}"
echo ""
echo "    Test it:"
echo "    curl ${URL}/health"

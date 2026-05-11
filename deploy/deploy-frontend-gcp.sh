#!/bin/bash
# Build the ZeroHour React frontend and deploy to Cloud Run (nginx).
# Run AFTER deploy-backend-gcp.sh so you have the backend URL.

set -e

PROJECT_ID=$(gcloud config get-value project)
REGION="us-central1"
REPO="zerohour"
SERVICE="zerohour-frontend"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/frontend:latest"

# BACKEND_URL must be set to the Cloud Run backend URL
if [[ -z "$BACKEND_URL" ]]; then
    echo "ERROR: Set BACKEND_URL before running:"
    echo "  export BACKEND_URL='https://zerohour-backend-xxxx-uc.a.run.app'"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> Building frontend image (VITE_API_URL=${BACKEND_URL})..."
docker build \
  -t "$IMAGE" \
  --build-arg VITE_API_URL="$BACKEND_URL" \
  "$SCRIPT_DIR/../frontend"

echo "==> Pushing to Artifact Registry..."
docker push "$IMAGE"

echo "==> Deploying frontend to Cloud Run..."
gcloud run deploy "$SERVICE" \
  --image="$IMAGE" \
  --region="$REGION" \
  --platform=managed \
  --allow-unauthenticated \
  --memory=256Mi \
  --cpu=1 \
  --concurrency=1000 \
  --min-instances=0 \
  --max-instances=3 \
  --timeout=30 \
  --port=8080 \
  --project="$PROJECT_ID"

URL=$(gcloud run services describe "$SERVICE" \
  --region="$REGION" \
  --project="$PROJECT_ID" \
  --format="value(status.url)")

echo ""
echo "==> Frontend deployed: $URL"
echo ""
echo "    Open in browser: $URL"

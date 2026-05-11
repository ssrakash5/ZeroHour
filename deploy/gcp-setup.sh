#!/bin/bash
# One-time GCP project setup for ZeroHour.
# Run this ONCE before deploying anything.
#
# Prerequisites:
#   - gcloud CLI installed  (https://cloud.google.com/sdk/docs/install)
#   - Logged in:  gcloud auth login
#   - Project set: gcloud config set project YOUR_PROJECT_ID

set -e

PROJECT_ID=$(gcloud config get-value project)
REGION="us-central1"
REPO="zerohour"

echo "==> Project:  $PROJECT_ID"
echo "==> Region:   $REGION"
echo ""

# Enable required APIs
echo "==> Enabling APIs..."
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  --project="$PROJECT_ID"

# Create Artifact Registry repository
echo "==> Creating Artifact Registry repo: $REPO..."
gcloud artifacts repositories create "$REPO" \
  --repository-format=docker \
  --location="$REGION" \
  --description="ZeroHour container images" \
  --project="$PROJECT_ID" 2>/dev/null || echo "  (already exists)"

# Auth Docker to push to Artifact Registry
echo "==> Configuring Docker auth..."
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet

echo ""
echo "==> Setup complete."
echo "    Registry: ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}"
echo ""
echo "Next steps:"
echo ""
echo "  1. Get a Gemini API key: https://aistudio.google.com/apikey"
echo "     export GEMINI_API_KEY='your-key'"
echo ""
echo "  2. Set up databases (free options):"
echo "     Neon (Postgres): https://neon.tech  → copy connection string"
echo "     Upstash (Redis):  https://upstash.com → copy Redis URL"
echo "     export DB_URL='postgresql+asyncpg://...@neon.tech/zerohour'"
echo "     export REDIS_URL='redis://...@upstash.com:...'"
echo ""
echo "  3. Deploy:"
echo "     bash deploy-backend-gcp.sh"
echo "     bash deploy-frontend-gcp.sh"

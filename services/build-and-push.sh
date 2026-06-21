#!/bin/bash

# ==============================================================================
# Script: build-and-push.sh
# Description: Builds and pushes Docker images of all microservices to Docker Hub
# Docker Hub Account: vignesh8386
# ==============================================================================

# Exit immediately if a command exits with a non-zero status
set -e

# Setup colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0;37m' # No Color
BOLD='\033[1m'

# Configuration
DOCKER_REGISTRY=${DOCKER_REGISTRY:-"clahan.azurecr.io"} # Set to empty string for Docker Hub
DOCKER_USER=${DOCKER_USER:-"vignesh8386"}               # Only used if DOCKER_REGISTRY is empty
TAG=${1:-latest}
SERVICES=(
  "auth-service"
  "admin-service"
  "student-service"
  "exam-service"
  "proctoring-service"
  "notification-service"
  "ai-service"
  "frontend-service"
)

# Statistics
SUCCESS_COUNT=0
FAILED_SERVICES=()

echo -e "${BLUE}${BOLD}======================================================================${NC}"
echo -e "${BLUE}${BOLD}               Clahan Academy - Docker Build & Push                   ${NC}"
echo -e "${BLUE}${BOLD}======================================================================${NC}"
if [ -n "$DOCKER_REGISTRY" ]; then
  echo -e "${BLUE}Docker Registry    :${NC} ${YELLOW}${DOCKER_REGISTRY}${NC}"
else
  echo -e "${BLUE}Docker Hub Account :${NC} ${YELLOW}${DOCKER_USER}${NC}"
fi
echo -e "${BLUE}Target Image Tag   :${NC} ${YELLOW}${TAG}${NC}"
echo -e "${BLUE}${BOLD}======================================================================${NC}"
echo ""

# 1. Validation Checks
echo -e "${YELLOW}Checking prerequisites...${NC}"

# Check if docker command exists
if ! command -v docker &> /dev/null; then
  echo -e "${RED}Error: 'docker' command is not installed or not in PATH.${NC}"
  exit 1
fi

# Check if docker daemon is running
if ! docker info &> /dev/null; then
  echo -e "${RED}Error: Docker daemon is not running. Please start Docker Desktop or the docker service.${NC}"
  exit 1
fi

echo -e "${GREEN}Prerequisites met. Docker daemon is running.${NC}"
echo ""
if [ -n "$DOCKER_REGISTRY" ]; then
  echo -e "${YELLOW}Please ensure you are logged into your registry (${DOCKER_REGISTRY}).${NC}"
  echo -e "${YELLOW}If not logged in, run: docker login ${DOCKER_REGISTRY}${NC}"
else
  echo -e "${YELLOW}Please ensure you are logged into Docker Hub (${DOCKER_USER}).${NC}"
  echo -e "${YELLOW}If not logged in, run: docker login${NC}"
fi
echo -e "Press Ctrl+C to abort, or waiting 3 seconds to continue..."
sleep 3
echo ""

# 2. Build and Push Loop
for service in "${SERVICES[@]}"; do
  echo -e "${BLUE}${BOLD}----------------------------------------------------------------------${NC}"
  echo -e "${BLUE}${BOLD} Processing Service: ${service}${NC}"
  echo -e "${BLUE}${BOLD}----------------------------------------------------------------------${NC}"

  # Set paths
  SERVICE_DIR="./${service}"
  DOCKERFILE="${SERVICE_DIR}/Dockerfile"
  if [ -n "$DOCKER_REGISTRY" ]; then
    IMAGE_NAME="${DOCKER_REGISTRY}/clahan-${service}:${TAG}"
  else
    IMAGE_NAME="${DOCKER_USER}/clahan-${service}:${TAG}"
  fi

  # Verification
  if [ ! -d "${SERVICE_DIR}" ]; then
    echo -e "${RED}Error: Directory ${SERVICE_DIR} does not exist. Skipping.${NC}"
    FAILED_SERVICES+=("${service} (Missing Directory)")
    continue
  fi

  if [ ! -f "${DOCKERFILE}" ]; then
    echo -e "${RED}Error: Dockerfile not found at ${DOCKERFILE}. Skipping.${NC}"
    FAILED_SERVICES+=("${service} (Missing Dockerfile)")
    continue
  fi

  # Build Image
  echo -e "${YELLOW}Building image ${IMAGE_NAME}...${NC}"
  if docker build -t "${IMAGE_NAME}" "${SERVICE_DIR}"; then
    echo -e "${GREEN}Successfully built image: ${IMAGE_NAME}${NC}"
  else
    echo -e "${RED}Failed to build image: ${IMAGE_NAME}${NC}"
    FAILED_SERVICES+=("${service} (Build Failed)")
    continue
  fi

  # Push Image
  if [ -n "$DOCKER_REGISTRY" ]; then
    echo -e "${YELLOW}Pushing image ${IMAGE_NAME} to registry ${DOCKER_REGISTRY}...${NC}"
  else
    echo -e "${YELLOW}Pushing image ${IMAGE_NAME} to Docker Hub...${NC}"
  fi
  if docker push "${IMAGE_NAME}"; then
    echo -e "${GREEN}Successfully pushed image: ${IMAGE_NAME}${NC}"
    SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
  else
    echo -e "${RED}Failed to push image: ${IMAGE_NAME}${NC}"
    FAILED_SERVICES+=("${service} (Push Failed)")
  fi

  echo ""
done

# 3. Final Summary Report
echo -e "${BLUE}${BOLD}======================================================================${NC}"
echo -e "${BLUE}${BOLD}                           Summary Report                             ${NC}"
echo -e "${BLUE}${BOLD}======================================================================${NC}"
echo -e "${GREEN}Total successfully pushed: ${SUCCESS_COUNT} / ${#SERVICES[@]}${NC}"

if [ ${#FAILED_SERVICES[@]} -ne 0 ]; then
  echo -e "${RED}Failed services:${NC}"
  for failed in "${FAILED_SERVICES[@]}"; do
    echo -e "  - ${RED}${failed}${NC}"
  done
  exit 1
else
  echo -e "${GREEN}${BOLD}All microservices built and pushed successfully!${NC}"
fi
echo -e "${BLUE}${BOLD}======================================================================${NC}"

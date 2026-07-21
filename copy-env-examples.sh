#!/bin/bash

# Array of microservices
services=(
  "auth-service"
  "admin-service"
  "student-service"
  "exam-service"
  "proctoring-service"
  "notification-service"
  "ai-service"
  "frontend-service"
)

echo "Initializing environment files from examples..."

# Loop and copy env files if they do not exist
for service in "${services[@]}"; do
  if [ -f "services/$service/.env.example" ]; then
    if [ ! -f "services/$service/.env" ]; then
      echo "Copying services/$service/.env.example to services/$service/.env"
      cp "services/$service/.env.example" "services/$service/.env"
    else
      echo "services/$service/.env already exists. Skipping."
    fi
  else
    echo "Warning: services/$service/.env.example not found."
  fi
done

echo "Environment files initialization complete."

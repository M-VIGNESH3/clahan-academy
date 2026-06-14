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
  if [ -f "$service/.env.example" ]; then
    if [ ! -f "$service/.env" ]; then
      echo "Copying $service/.env.example to $service/.env"
      cp "$service/.env.example" "$service/.env"
    else
      echo "$service/.env already exists. Skipping."
    fi
  else
    echo "Warning: $service/.env.example not found."
  fi
done

echo "Environment files initialization complete."

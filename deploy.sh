#!/bin/bash
echo "=== CLAHAN ACADEMY DEPLOYMENT ==="
echo "Timestamp: $(date)"

echo ""
echo "=== Pulling latest code ==="
git pull origin main

echo ""
echo "=== Stopping old containers ==="
docker-compose down

echo ""
echo "=== Removing old images to force rebuild ==="
docker-compose rm -f
docker image prune -f

echo ""
echo "=== Building and starting all services ==="
docker-compose up -d --build

echo ""
echo "=== Waiting for services to start ==="
sleep 10

echo ""
echo "=== Container Status ==="
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

echo ""
echo "=== Exam Service Logs (last 20 lines) ==="
docker logs clahan-exam-service --tail 20

echo ""
echo "=== Database Check ==="
docker exec -it clahan-postgres psql -U postgres -d clahan \
  -c "SELECT name, navigation_mode, submission_mode, enable_face_detection FROM exams LIMIT 3;"

echo ""
echo "=== Deployment Complete ==="

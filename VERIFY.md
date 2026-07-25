# Post-Deployment Verification

## Run these commands after deploying:

### 1. Check all containers running
docker ps

### 2. Verify database has correct columns
docker exec clahan-postgres psql -U postgres -d clahan \
  -c "\d exams" | grep -E "navigation|submission|face"

### 3. Verify exam service has new code
docker logs clahan-exam-service --tail 5

### 4. Test navigation save
# Admin: Edit exam, set Navigation=Sequential, Save
# Then run:
docker exec clahan-postgres psql -U postgres -d clahan \
  -c "SELECT name, navigation_mode, submission_mode FROM exams LIMIT 3;"
# Should show: sequential | auto (not free | manual)

### 5. Verify frontend rebuilt
docker logs clahan-frontend-service --tail 10

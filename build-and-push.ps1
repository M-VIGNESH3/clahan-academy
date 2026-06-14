# ==============================================================================
# Script: build-and-push.ps1
# Description: Builds and pushes Docker images of all microservices to Docker Hub
# Docker Hub Account: vignesh8386
# ==============================================================================

$ErrorActionPreference = "Stop"

# Configuration
$DockerRegistry = if ($env:DOCKER_REGISTRY -ne $null) { $env:DOCKER_REGISTRY } else { "clahan.azurecr.io" }
$DockerUser = if ($env:DOCKER_USER -ne $null) { $env:DOCKER_USER } else { "vignesh8386" }
$Tag = if ($args[0]) { $args[0] } else { "latest" }
$Services = @(
  "auth-service",
  "admin-service",
  "student-service",
  "exam-service",
  "proctoring-service",
  "notification-service",
  "ai-service",
  "frontend-service"
)

$SuccessCount = 0
$FailedServices = @()

Write-Host "======================================================================" -ForegroundColor Blue
Write-Host "               Clahan Academy - Docker Build & Push                   " -ForegroundColor Blue
Write-Host "======================================================================" -ForegroundColor Blue
if ($DockerRegistry) {
    Write-Host "Docker Registry    : $DockerRegistry" -ForegroundColor Yellow
} else {
    Write-Host "Docker Hub Account : $DockerUser" -ForegroundColor Yellow
}
Write-Host "Target Image Tag   : $Tag" -ForegroundColor Yellow
Write-Host "======================================================================" -ForegroundColor Blue
Write-Host ""

# 1. Validation Checks
Write-Host "Checking prerequisites..." -ForegroundColor Yellow

# Check if docker is installed
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Error "Error: 'docker' command is not installed or not in PATH."
    exit 1
}

# Check if docker daemon is running
try {
    docker info > $null 2>&1
} catch {
    Write-Error "Error: Docker daemon is not running. Please start Docker Desktop or the docker service."
    exit 1
}

if ($LASTEXITCODE -ne 0) {
    Write-Error "Error: Docker daemon is not running. Please start Docker Desktop or the docker service."
    exit 1
}

Write-Host "Prerequisites met. Docker daemon is running.`n" -ForegroundColor Green
if ($DockerRegistry) {
    Write-Host "Please ensure you are logged into your registry ($DockerRegistry)." -ForegroundColor Yellow
    Write-Host "If not logged in, run: docker login $DockerRegistry" -ForegroundColor Yellow
} else {
    Write-Host "Please ensure you are logged into Docker Hub ($DockerUser)." -ForegroundColor Yellow
    Write-Host "If not logged in, run: docker login" -ForegroundColor Yellow
}
Write-Host "Press Ctrl+C to abort, or waiting 3 seconds to continue..."
Start-Sleep -Seconds 3
Write-Host ""

# 2. Build and Push Loop
foreach ($service in $Services) {
    Write-Host "----------------------------------------------------------------------" -ForegroundColor Blue
    Write-Host " Processing Service: $service" -ForegroundColor Blue
    Write-Host "----------------------------------------------------------------------" -ForegroundColor Blue

    $serviceDir = "./$service"
    $dockerfile = "$serviceDir/Dockerfile"
    $imageName = if ($DockerRegistry) { "${DockerRegistry}/clahan-${service}:${Tag}" } else { "${DockerUser}/clahan-${service}:${Tag}" }

    if (-not (Test-Path -Path $serviceDir -PathType Container)) {
        Write-Host "Error: Directory $serviceDir does not exist. Skipping." -ForegroundColor Red
        $FailedServices += "$service (Missing Directory)"
        continue
    }

    if (-not (Test-Path -Path $dockerfile -PathType Leaf)) {
        Write-Host "Error: Dockerfile not found at $dockerfile. Skipping." -ForegroundColor Red
        $FailedServices += "$service (Missing Dockerfile)"
        continue
    }

    # Build Image
    Write-Host "Building image $imageName..." -ForegroundColor Yellow
    docker build -t $imageName $serviceDir
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Successfully built image: $imageName" -ForegroundColor Green
    } else {
        Write-Host "Failed to build image: $imageName" -ForegroundColor Red
        $FailedServices += "$service (Build Failed)"
        continue
    }

    # Push Image
    if ($DockerRegistry) {
        Write-Host "Pushing image $imageName to registry $DockerRegistry..." -ForegroundColor Yellow
    } else {
        Write-Host "Pushing image $imageName to Docker Hub..." -ForegroundColor Yellow
    }
    docker push $imageName
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Successfully pushed image: $imageName" -ForegroundColor Green
        $SuccessCount++
    } else {
        Write-Host "Failed to push image: $imageName" -ForegroundColor Red
        $FailedServices += "$service (Push Failed)"
    }
    Write-Host ""
}

# 3. Final Summary Report
Write-Host "======================================================================" -ForegroundColor Blue
Write-Host "                           Summary Report                             " -ForegroundColor Blue
Write-Host "======================================================================" -ForegroundColor Blue
Write-Host "Total successfully pushed: $SuccessCount / $($Services.Count)" -ForegroundColor Green

if ($FailedServices.Count -gt 0) {
    Write-Host "Failed services:" -ForegroundColor Red
    foreach ($failed in $FailedServices) {
        Write-Host "  - $failed" -ForegroundColor Red
    }
    exit 1
} else {
    Write-Host "All microservices built and pushed successfully!" -ForegroundColor Green
}
Write-Host "======================================================================" -ForegroundColor Blue

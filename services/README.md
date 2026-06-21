# 🎓 Clahan Academy V2

[![CI/CD Build & Push](https://github.com/M-VIGNESH3/clahan-academy/actions/workflows/build.yml/badge.svg)](https://github.com/M-VIGNESH3/clahan-academy/actions)
[![Infrastructure as Code](https://img.shields.io/badge/Terraform-1.5.0+-7B42BC?logo=terraform&logoColor=white)](https://www.terraform.io/)
[![Orchestration](https://img.shields.io/badge/Kubernetes-AKS-326CE5?logo=kubernetes&logoColor=white)](https://azure.microsoft.com/en-us/products/kubernetes-service)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## 📝 Overview
**Clahan Academy V2** is a state-of-the-art, cloud-native online exam platform designed to facilitate secure, scalable, and automated examinations. Integrating advanced AI proctoring services (using YOLO & InsightFace), a secure multi-language coding compilation sandbox, and automated LLM-based grading models, Clahan Academy V2 provides a seamless examination pipeline from student enrollment to final transcript generation.

* **Smart AI Proctoring**: Face verification, multiple faces detection, book/phone detection, tab-switching limits, and fullscreen exit violations tracking.
* **Isolated Coding Sandbox**: Code execution inside secure, resource-constrained container environments using Judge0.
* **Automated Grading Engine**: Integrates local Large Language Models (LLMs) to grade descriptive answers automatically.

---

## 🏗️ Architecture

```
                                    +-----------------------+
                                    |   Application Gateway  |
                                    |         (AGIC)        |
                                    +-----------+-----------+
                                                |
                                                | (HTTPS Paths)
                                                v
      +-----------------------------------------+-----------------------------------------+
      |        |        |               |               |                 |               |
      v        v        v               v               v                 v               v
  +------+  +----+  +-------+       +------+        +-------+       +------------+  +------------+
  | Front|  |Auth|  | Admin |       |Student|        | Exam  |       | Proctoring |  |Notification|
  | -end |  |-svc|  | -svc  |       | -svc  |        | -svc  |       |    -svc    |  |    -svc    |
  +------+  +----+  +-------+       +------+        +-------+       +------------+  +------------+
                        |               |               |                 |               |
                        v               v               v                 v               v
                +-----------------------------------------------------------------+
                |                       Azure Virtual Network                     |
                |   +-------------------+  +------------------+  +-------------+  |
                |   | PostgreSQL Flex   |  | Cache for Redis  |  | Blob Storage|  |
                |   +-------------------+  +------------------+  +-------------+  |
                +-----------------------------------------------------------------+
                                                                |
                                                                v
                                                       +-----------------+
                                                       |   AI-service    |
                                                       |  (Dedicated)    |
                                                       +--------+--------+
                                                                |
                                                      +---------+---------+
                                                      v                   v
                                                 +---------+         +---------+
                                                 | Ollama  |         | Judge0  |
                                                 | (phi3)  |         | Sandbox |
                                                 +---------+         +---------+
```

### Microservices Catalog
| Service | Port | Description |
| :--- | :--- | :--- |
| **frontend-service** | `5173` | React/Vite Single Page Application representing the exam portal dashboard. |
| **auth-service** | `4001` | Express service handling authentication, OTP validation, rate-limiting, and JWT generation. |
| **admin-service** | `4002` | Management service for institutions, departments, trainers, batches, and student registers. |
| **student-service** | `4003` | Profiles, history trackers, and enrollment workflows for individual students. |
| **exam-service** | `4004` | Orchestrates exam authoring, question banks, timings, and automatic grade submission. |
| **proctoring-service** | `4005` | WebSocket-enabled service processing continuous video feeds and browser navigation telemetry. |
| **notification-service** | `4006` | Worker processing BullMQ tasks to dispatch transactional emails (OTP, registration, welcome). |
| **ai-service** | `8000` | Python/FastAPI service hosting computer vision models (YOLO, InsightFace) on GPU-enabled nodes. |
| **ollama** | `11434` | Local LLM host runner serving `phi3` models for descriptive scoring validation. |
| **judge0-api** | `2358` | Sandbox code execution engine receiving compiler jobs and tracking responses. |
| **judge0-redis** | `6379` | Dedicated Redis caching and queue instance for compiler job processing. |

---

## 🛠️ Tech Stack
| Category | Technology |
| :--- | :--- |
| **Infrastructure** | Terraform, Azure Provider, Azure CLI |
| **Container & Registry** | Docker, Azure Container Registry (ACR) |
| **Orchestration** | Azure Kubernetes Service (AKS), kubectl |
| **CI/CD** | GitHub Actions, Self-hosted Runners |
| **GitOps** | ArgoCD |
| **Security** | Azure Key Vault, Secret Store CSI Driver, Azure Workload Identity, TLS, AGIC WAF |
| **AI/ML** | YOLO v8, InsightFace, Ollama (phi3) |
| **Database** | Azure Database for PostgreSQL Flexible Server |
| **Cache & Queue** | Azure Cache for Redis, BullMQ |
| **Storage** | Azure Blob Storage |
| **Monitoring** | Log Analytics Workspace, Azure Monitor, Application Insights, Azure Functions Alerting |

---

## 📂 Repository Structure
```
├── .github/workflows/          # CI/CD pipeline definition files
│   ├── build.yml               # Builds and pushes Docker images to ACR
│   ├── deploy.yml              # Triggers Helm linting & notifies GitOps/ArgoCD
│   └── terraform-apply.yml     # Automated infrastructure deployments
├── argocd/dev/                 # GitOps Declarative AppProject and Application
├── docs/                       # Architecture diagrams and API reference guides
├── functions/                  # Azure Functions serverless health check timers
├── helm/clahan-academy/        # Production-grade Helm chart with Workload Identity
├── kubernetes/                 # Standalone YAML manifests for quick local deployment
├── services/                   # Application microservices codebase
│   ├── admin-service/          # Admin panel APIs (Node.js/Express)
│   ├── ai-service/             # Proctoring computer vision services (Python/FastAPI)
│   ├── auth-service/           # User authentication and JWT helper (Node.js/Express)
│   ├── exam-service/           # Exam logic, question database engine (Node.js/Express)
│   ├── frontend-service/       # Single Page Application (React/Vite)
│   ├── notification-service/   # BullMQ transactional email processor (Node.js)
│   ├── proctoring-service/     # Websockets for real-time validation (Node.js/Express)
│   └── student-service/        # Student statistics and profile tracker (Node.js/Express)
└── terraform/                  # Terraform modules and environment configurations
```

---

## 🚀 Quick Start

### Prerequisites
* Azure Subscription & Tenant ID
* Terraform CLI (v1.5.0+)
* Azure CLI (`az login` configured)
* GitHub Repository configured with Azure Federated Secrets

### Step-by-Step Setup
1. **Clone the Repository**
   ```bash
   git clone https://github.com/M-VIGNESH3/clahan-academy.git
   cd clahan-academy
   ```

2. **Initialize Credentials & Bootstrap Workspace** (One-time setup)
   ```bash
   bash scripts/bootstrap.sh
   ```

3. **Configure Environment Variables**
   ```bash
   cp terraform/environments/dev/terraform.tfvars.example terraform/environments/dev/terraform.tfvars
   # Open terraform.tfvars and customize subscription IDs, regions, and resources.
   ```

4. **Deploy Infrastructure**
   ```bash
   git add .
   git commit -m "feat: configure terraform variables"
   git push origin main
   # Push automatically starts the terraform-apply.yml pipeline.
   ```

5. **Approve Infrastructure Execution**
   * Navigate to GitHub Repository -> **Actions** -> **IaC Pipeline**.
   * Review plan output and click **Approve** to run Terraform Apply.

6. **Application Deployment**
   * Once Terraform finishes, ArgoCD automatically reads `argocd/dev/application.yaml` and starts deploying the Helm chart into AKS.

---

## 🔄 CI/CD Pipelines
| Pipeline | Trigger | Stages |
| :--- | :--- | :--- |
| **terraform-apply.yml** | Push on `terraform/**` or manual run | Terraform Validate -> Terraform Plan -> Manual Approval -> Terraform Apply |
| **build.yml** | Push on `services/**` | Code Linting -> SonarCloud Quality Gate -> Docker Build -> Push to ACR |
| **deploy.yml** | Successful image pushes | Helm Chart Validation -> ArgoCD Sync Trigger -> Notification dispatch |

---

## ☸️ Kubernetes Deployment

### Approach 1: Standalone Manifests (Quick Demo)
To deploy the entire stack immediately without Helm, Key Vault CSI, or ingress controllers:
```bash
kubectl apply -f kubernetes/ --recursive
kubectl get pods -n production
```

### Approach 2: GitOps/ArgoCD (Production)
Managed automatically by ArgoCD. To verify deployments manually:
```bash
helm list -n clahan-academy
kubectl get applications -n argocd
```

---

## 🔐 Cloud Integration (Workload Identity)
Clahan Academy V2 uses **Azure Workload Identity** to securely grant pod-level permissions. Pods authenticate with Azure resources without persistent connection secrets or password strings.

```
+------------------+       1. Inject OIDC Token       +----------------------+
|  AKS Service     |--------------------------------->|  Azure Active        |
|  Account (SA)    |                                  |  Directory (AAD)     |
+------------------+                                  +-----------+----------+
         ^                                                        |
         | 2. Exchange Token                                      | 3. Issue Access Token
         v                                                        v
+------------------+                                  +----------------------+
| Application Pod  |<---------------------------------|  Target Resource     |
|                  |                                  |  (e.g., Key Vault)   |
+------------------+                                  +----------------------+
```

Federated credential parameters associate Kubernetes Service Accounts with Azure Active Directory Managed Identities. Check configuration:
```bash
kubectl describe sa auth-sa -n clahan-academy
```

---

## 🛡️ Security Practices
* **Zero Hardcoded Secrets**: Secret data is dynamically retrieved from Azure Key Vault via CSI Drivers.
* **Workload Identity**: Services access Azure services using passwordless federated client tokens.
* **Strict Network Isolation**: PostgreSQL database, Redis caches, and Storage are inside private subnets accessible only via Private Endpoints.
* **Container Hardening**: Deployments specify `runAsNonRoot: true`, drop Linux capabilities, and disable privilege escalation.
* **Network Policies**: Deny-all-by-default egress and ingress policies isolate microservices.
* **Ingress Firewall Protection**: Application Gateway WAF enabled protects all HTTP routes.

---

## 🎁 Bonus Features
| Feature | Implementation | Status |
| :--- | :--- | :--- |
| **Event-Driven Workflows** | BullMQ background queuing for notifications and grading | Production-Ready |
| **AI Proctoring & Grading** | Computer Vision microservice + local Ollama container | Active |
| **GitOps Engine** | Declared via ArgoCD Application and Project specs | Configured |
| **Serverless Proactive Alerts** | Azure Functions Timer checks service status and alerts via SMTP | Configured |
| **Isolated Sandbox Engine** | Dedicated Judge0 Docker security context with cgroup limits | Configured |
| **Horizontal Scaling** | HPAs auto-scale frontend and exam engines based on CPU load | Configured |
| **Disaster Recovery Plan** | Structured multi-region active-passive replica schemas | Active |

---

## 💾 Disaster Recovery
| Resource | Backup Method | RTO | RPO |
| :--- | :--- | :--- | :--- |
| **PostgreSQL Database** | Azure Backup (automated geo-redundant storage recovery) | < 30 mins | < 5 mins |
| **Redis Cache** | Failover configured with multiple replicas | < 1 min | Near 0 |
| **AKS Cluster** | Helm-based ArgoCD manifest store for instant recovery | < 10 mins | 0 (GitOps) |
| **Key Vault Secrets** | Soft delete & Purge protection enabled | < 5 mins | 0 |

---

## 💵 Cost Estimation
| Component | Tier/Size | Monthly Cost (Est.) |
| :--- | :--- | :--- |
| **PostgreSQL Flexible** | GP_Standard_D2ds_v5 (Ha disabled) | ~$115 |
| **Azure Cache for Redis** | Standard C1 | ~$38 |
| **AKS Cluster** | System (D2s_v5) + User AI Node (Standard_NC6s_v3) | ~$520 |
| **Application Gateway** | Standard_v2 WAF enabled | ~$95 |
| **Azure Storage & Misc** | Blob LRS | ~$17 |
| **Total Estimations** | | **~$785/month** |

> [!TIP]
> **Cost Optimization**: Scale down or stop the AI node (`Standard_NC6s_v3`) when exams are not actively scheduled to save up to 60% of AKS compute costs.

---

## 🔍 Evaluator Verification Commands
Run these commands to inspect and verify the deployment status:
```bash
# Check all pods running in the production namespace
kubectl get pods -n production

# Check internal services
kubectl get svc -n production

# Check application ingress routes
kubectl get ingress -n clahan-academy

# Verify workload identity is assigned on ServiceAccount
kubectl describe sa auth-sa -n clahan-academy

# Check ArgoCD application synchronization state
kubectl get application -n argocd

# View infrastructure connection parameters
cd terraform/environments/dev
terraform output
```

---

## 📞 Contact
* **GitHub**: [@M-VIGNESH3](https://github.com/M-VIGNESH3)
* **Email**: vigneshmtinku@gmail.com

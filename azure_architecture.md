# Production-Grade Azure Architecture: Clahan Academy

This document outlines a secure, scalable, reliable, and cost-effective deployment architecture on Microsoft Azure for the Clahan Academy assessment platform. 

---

## 1. High-Level Architecture Diagram

The diagram below illustrates the end-to-end architecture, isolating sensitive data stores inside a private Virtual Network (VNet) while exposing endpoints securely via a Web Application Firewall (WAF) and Azure Front Door.

```mermaid
graph TD
    User[Users_and_Admins] -->|HTTPS| AFD[Azure_Front_Door_and_WAF]
    User -->|StaticAssets| SWA[Azure_Static_Web_Apps]
    
    AFD -->|SecureIngress| ACA_Env[Azure_Container_Apps_Environment]
    
    subgraph snet_app_env_prod_10_0_2_0_23
        ACA_Auth[auth-service]
        ACA_Admin[admin-service]
        ACA_Student[student-service]
        ACA_Exam[exam-service]
        ACA_Proc[proctoring-service]
        ACA_Notif[notification-service]
        
        ACA_AI[ai-service]
        ACA_YOLO[yolo-service]
        ACA_Face[face-service]
        ACA_OCR[ocr-service]
        
        ACA_Judge0[judge0-service]
    end
    
    subgraph snet_database_prod_10_0_4_0_24
        PG[Azure_Database_for_PostgreSQL]
        Redis[Azure_Cache_for_Redis]
    end

    ACA_Auth -->|Query| PG
    ACA_Auth -->|CacheAndSession| Redis
    
    ACA_Admin -->|Query| PG
    ACA_Admin -->|CacheAndSession| Redis
    
    ACA_Student -->|Query| PG
    
    ACA_Exam -->|Query| PG
    ACA_Exam -->|HTTP| ACA_AI
    ACA_Exam -->|HTTP| ACA_Judge0
    
    ACA_Proc -->|Query| PG
    ACA_Proc -->|CacheAndSession| Redis
    ACA_Proc -->|HTTP| ACA_AI
    
    ACA_Notif -->|Subscribe| Redis
    
    ACA_AI -->|HTTP| ACA_YOLO
    ACA_AI -->|HTTP| ACA_Face
    ACA_AI -->|HTTP| ACA_OCR
    
    ACA_Notif -->|SMTP| SendGrid[SendGrid_Mail_Delivery]
    
    AKV[Azure_Key_Vault] -->|SecretInjection| ACA_Env
    
    Azure_AI[Azure_AI_Studio_or_OpenAI] -->|LLM| ACA_AI
    GPU_VM[Azure_GPU_VM_NC_Series] -->|Ollama| ACA_AI
    
    ACA_Env -->|MetricsAndLogs| AppIns[Azure_Monitor_and_Application_Insights]
    PG -->|Diagnostics| AppIns
    Redis -->|Diagnostics| AppIns
```

---

## 2. Core Architectural Pillars

### 🔒 Security & Compliance
* **Zero Trust Network Isolation**: All backend microservices, PostgreSQL databases, and Redis instances are deployed inside a private **Azure Virtual Network (VNet)**. They cannot be accessed directly from the public internet.
* **Edge Protection (WAF)**: **Azure Front Door** with integrated **Web Application Firewall (WAF)** protects the endpoints against OWASP Top 10 vulnerabilities, DDoS attacks, and rate limits API requests.
* **Identity & Access Management (IAM)**: Use **Azure Active Directory (Microsoft Entra ID)** and **Managed Identities** for Azure resources. This eliminates the need to hardcode database credentials or secrets in application configurations.
* **Secret Management**: All application secrets (JWT keys, SendGrid API keys, database connection strings) are stored in **Azure Key Vault (AKV)** and resolved at container startup using system-assigned Managed Identities.

### 📈 Scalability
* **Serverless Container Scaling**: Microservices are hosted on **Azure Container Apps (ACA)**. Powered by KEDA (Kubernetes Event-driven Autoscaling), services auto-scale from `0` to `N` replicas based on HTTP request concurrency or CPU/memory load.
* **Global Static Distribution**: The React frontend is deployed to **Azure Static Web Apps (SWA)**, which automatically distributes static files globally via Azure's CDN edge locations, reducing load times.
* **Elastic Data Tier**: **Azure Database for PostgreSQL (Flexible Server)** supports vertical scaling of compute (vCores) and storage IOPS to handle heavy exam traffic dynamically.

### ⚙️ Reliability & High Availability
* **Zone Redundancy**: Deploy ACA and PostgreSQL in multi-zone configurations. If one Azure data center zone suffers an outage, traffic is automatically routed to the surviving zones.
* **Self-Healing Containers**: Liveness and readiness health probes check container health. Bad containers are automatically terminated and replaced.
* **Managed Backups**: PostgreSQL Flexible Server takes automated, zone-redundant snapshots daily with point-in-time recovery (PITR) up to 35 days.

### 💰 Cost Effectiveness
* **Autoscale to Zero**: Azure Container Apps environment is configured to scale down to 0 instances during idle hours (e.g., late nights/weekends) for services like `admin-service`, `student-service`, and `proctoring-service`, reducing compute costs to zero.
* **Serverless Frontends**: Azure Static Web Apps has an extremely generous free tier and low-cost production pricing.
* **Azure Database for PostgreSQL Burstable Tier**: Ideal for development or low-load production, allowing compute to burst when needed without paying for high-performance virtual cores continuously.

---

## 3. Azure Services Mapping & Selection

| Application Component | Docker Service | Proposed Azure Service | Tier Recommendation (Prod / Dev) | Rationale |
| :--- | :--- | :--- | :--- | :--- |
| **Frontend** | `frontend-service` | **Azure Static Web Apps (SWA)** | **Standard** (Prod) / **Free** (Dev) | Serverless, globally distributed CDN hosting with built-in SSL and custom domain routing. |
| **Microservices** | `auth-service`, `admin-service`, `student-service`, `exam-service`, `proctoring-service`, `notification-service` | **Azure Container Apps (ACA)** | **Consumption Plan** | Serverless containers, handles Kubernetes overhead automatically, autoscales to 0, very cheap for low traffic. |
| **Database** | `postgres` | **Azure Database for PostgreSQL** | **General Purpose** (Prod) / **Burstable** (Dev) | Managed database, automatic patching, high availability, point-in-time backups. |
| **Caching / PubSub** | `redis` | **Azure Cache for Redis** | **Standard** (Prod - HA replication) / **Basic** (Dev) | Highly secure, private endpoint integration, handles pub/sub routing for notification queues. |
| **Code Execution** | `judge0-service` | **Azure Container Apps** | **Consumption Plan** | Runs student code submissions in a safe, isolated Docker sandbox. Autoscales down to 0 when no exams are active to minimize compute spend. |
| **AI Gateway** | `ai-service` | **Azure Container Apps** | **Consumption Plan** | Lightweight Python API forwarding requests to specialist microservices. |
| **Vision Services** | `yolo-service`, `face-service`, `ocr-service` | **Azure Container Apps** | **Consumption Plan** (high-CPU/Memory) | Isolated hosting of Python/FastAPI endpoints with local OpenCV/Tesseract processing. |
| **LLM Inference** | `ollama-service` | **Azure AI Studio (Phi-3 / GPT-4o)** OR **Azure GPU VM (NC-series)** | **Serverless Pay-As-You-Go** (Azure OpenAI) | **Option A (Highly Recommended)**: Use Azure OpenAI serverless model API (Phi-3/GPT) to pay only per token, eliminating GPU VM costs. <br/><br/>**Option B**: Deploy Ollama on a GPU VM (NC-series) if hosting custom open-source model weights. |
| **Secrets Management** | — | **Azure Key Vault (AKV)** | **Standard** | Centralized audit logs, keys, and credentials management. |
| **Ingress & Security** | — | **Azure Front Door + WAF** | **Premium** (Prod) / **Classic** (Dev) | Global routing, SSL offloading, DDOS protection, and WAF rules. |
| **Monitoring** | `prometheus`, `grafana` | **Azure Monitor (Application Insights)** | **Pay-As-You-Go** (Log Analytics) | Native Azure APM, distributed tracing, live telemetry, and alerting out of the box. |

---

## 4. Security & Compliance Deep Dive

### 1. Networking Strategy
To block public access to backend resources:
* Deploy a single VNet with two main subnets:
  * **Subnet-A (Container Apps)**: Deploys the ACA environment with a configuration specifying `internal` ingress. Microservices can call each other via internal URLs (e.g. `http://exam-service.internal`).
  * **Subnet-B (Private Link)**: Houses PostgreSQL and Redis. Accessible only from Subnet-A via **Azure Private Link** (Private Endpoints).
* Public traffic enters **only** via Azure Front Door, which forwards requests to the API gateway Container App (`auth-service` / `admin-service` / etc.) using secure origin rules (validating that the header contains the Front Door's unique ID).

### 2. IAM & Identity (Passwordless Setup)
Instead of putting credentials in code:
```env
# Don't use this in production:
DATABASE_URL=postgres://postgres:postgres@postgres:5432/clahan

# Recommended Production Configuration:
DATABASE_URL=Server=tcp:clahan-db.postgres.database.azure.com;Database=clahan;Port=5432;Authentication=ActiveDirectory;
```
Configure Azure PostgreSQL to accept connection tokens generated via the microservice container's **System-Assigned Managed Identity**. Azure handles rotation of these identities automatically.

---

## 5. Cost-Effective Deployment Plan (Pricing Optimization)

To prevent budget bloat, use this configuration roadmap:

1. **Static Web Apps (Frontend)**: Free tier covers SSL, hosting, and up to 100 GB bandwith/month.
2. **Container Apps Idle Scaling**:
   ```yaml
   # Scale-down definition in Terraform/Bicep
   scale:
     minReplicas: 0  # ACA scales down to 0 if no requests are received for 10 minutes
     maxReplicas: 10
   ```
3. **LLM Execution Optimization**: Self-hosting a GPU VM on Azure costs upwards of `$150-$500/month` running 24/7. 
   * **Dev/Test**: Configure `ai-service` to use its **built-in rule-based fallback** or run Ollama locally.
   * **Prod**: Hook `ai-service` into **Azure AI Studio** hosting serverless **Phi-3-mini** or **GPT-4o-mini** models. These are charged on a pay-per-token basis (approximately `$0.15` per million tokens), costing pennies per day for standard usage volumes.

---

## 6. Continuous Deployment (CI/CD) Workflow

To automate deployment safely:

```mermaid
sequenceDiagram
    Developer->>GitHub: Git Push to main branch
    GitHub->>GitHub Actions: Trigger Build Workflow
    GitHub Actions->>Azure Container Registry (ACR): Build & Push Docker Image
    GitHub Actions->>Azure: Deploy ARM Template / Bicep Infrastructure
    GitHub Actions->>Azure Container Apps: Update Revision (Rolling Update)
    Azure Container Apps->>Azure Container Apps: Run Health Probe & Swap Traffic
```

* **Infrastructure as Code (IaC)**: Deploy and manage all resources using **Azure Bicep** or **Terraform**. This prevents "configuration drift" and allows recreation of environments in minutes.
* **Blue-Green Deployments**: Azure Container Apps natively supports traffic splitting. Deploy new service revisions at `0%` traffic, run smoke tests, and then split traffic (`10% -> 50% -> 100%`) to guarantee zero-downtime deployments.

---

## 7. Alternative: Azure Kubernetes Service (AKS)

While Azure Container Apps (ACA) is recommended for its simplicity and scale-to-zero cost efficiency, **Azure Kubernetes Service (AKS)** is a viable alternative if the platform grows or requires custom cloud-agnostic orchestrations.

### Pros (Advantages of AKS)
* **Customizability & Ecosystem Control**: Full access to the Kubernetes control plane, allowing custom CRDs, service meshes (e.g., Istio, Linkerd), and custom ingress controllers (e.g., Nginx).
* **Familiarity**: Zero cloud vendor lock-in. The same Helm charts or manifests can run on AWS (EKS) or Google Cloud (GKE).
* **Optimized GPU Node Pools**: Dynamic provisioning of GPU nodes using AKS node pools, enabling native scheduling of deep-learning models (YOLO, face recognition, Ollama) directly on GPU instances only when workloads demand it.
* **Granular Network Control**: Use of Cilium or Azure CNI for advanced network policies and fine-grained network routing.

### Cons (Disadvantages of AKS)
* **High Operational Overhead**: Requires managing nodes, networking plugins, certificates, ingress controller configurations, and regular Kubernetes API version updates.
* **No Scale-to-Zero for Control Plane**: Unlike ACA, the cluster's System Node Pool must run continuously (at least 1-2 system nodes), costing money even if the application is completely idle.
* **Complexity of Configuration**: Deploying autoscaling (KEDA/HPA), secret injection (Secret Store CSI Driver), and log aggregation requires installing and maintaining additional open-source operators.

### Key Considerations for AKS Deployment
* **System vs. User Node Pools**: Use a small, cheap node pool (`DS2_v2` instances) for system pods (CoreDNS, Metrics Server) and auto-scaling GPU/CPU node pools for the application microservices.
* **Ingress and TLS**: Deploy `ingress-nginx` with `cert-manager` for automated Let's Encrypt certificates, or hook it to an Azure Application Gateway (using AGIC - App Gateway Ingress Controller) for enterprise-grade WAF.
* **Secret Injection**: Use the **Azure Key Vault Provider for Secrets Store CSI Driver** to mount secrets as volumes into pod containers instead of storing them in Kubernetes Secret resources.
* **Autoscaling**: Install **KEDA** (Kubernetes Event-driven Autoscaling) manually to mimic ACA's scale-to-zero capabilities for microservices, scaling pods based on HTTP traffic or Redis queue sizes.

---

## 8. Network and Subnet Topology Design

To ensure isolation and enterprise-grade security, the network architecture is structured around a single Virtual Network (VNet) divided into distinct subnets based on role, traffic classification, and security delegation.

### VNet IP Address Scheme and Subnet Allocation
* **VNet Address Space**: `10.0.0.0/16` (65,536 available IP addresses)

| Subnet Name | CIDR Range | Delegated To / Dedicated Service | Resources Placed | Network Security Group (NSG) Policy |
| :--- | :--- | :--- | :--- | :--- |
| **snet-ingress** | `10.0.1.0/24` (256 IPs) | None (Standard Subnet) | Regional Azure Application Gateway (WAF v2) | **Inbound**: Allow HTTPS (443) from Azure Front Door edge servers (using Service Tags). <br>**Outbound**: Allow traffic to `snet-app-env` on microservice ports. |
| **snet-app-env** | `10.0.2.0/23` (512 IPs) | `Microsoft.App/environments` | Azure Container Apps Environment (all microservices, Judge0 execution sandbox, AI API, and vision tools) | **Inbound**: Allow HTTP/HTTPS traffic from `snet-ingress` only. <br>**Outbound**: Allow outbound to `snet-database` on database ports, and HTTPS (443) to external APIs (Azure AI, Key Vault). |
| **snet-database** | `10.0.4.0/24` (256 IPs) | None (Standard Subnet) | PostgreSQL Private Endpoint (`10.0.4.10`), Redis Private Endpoint (`10.0.4.20`) | **Inbound**: Allow TCP `5432` (PostgreSQL) and TCP `6379` (Redis) only from `snet-app-env` and `snet-bastion`. <br>**Outbound**: Block all internet egress (fully private/isolated). |
| **snet-bastion** | `10.0.5.0/24` (256 IPs) | `Microsoft.Network/bastionHosts` | Azure Bastion service instances | **Inbound**: Allow HTTPS (443) from target administrator public IPs. <br>**Outbound**: Allow SSH/RDP to private VM subnets. |
| **snet-management** | `10.0.6.0/24` (256 IPs) | None (Standard Subnet) | Linux Jumpbox VM (used for running Flyway/Prisma DB migrations securely) | **Inbound**: Allow SSH (22) from `snet-bastion`. <br>**Outbound**: Allow access to PostgreSQL Private Endpoint on port 5432. |

### Network Topology Diagram

This diagram displays the VNet subnet boundaries, security barriers (NSGs), and how traffic flows from the public edge to the private database tier.

```mermaid
graph TD
    Internet[Public_Internet_Users] -->|HTTPS| AFD[Azure_Front_Door_and_WAF]
    
    subgraph snet_ingress_prod_10_0_1_0_24
        AGW[Application_Gateway_WAF_v2]
    end
    
    subgraph snet_app_env_prod_10_0_2_0_23
        ACA_Env_Host[ACA_Environment_Container_Host]
        ACA_Services_List[Microservices_auth_admin_student_exam_proctoring_notification_AI_judge0]
    end
    
    subgraph snet_database_prod_10_0_4_0_24
        PG_PE[PostgreSQL_Private_Endpoint_10_0_4_10]
        Redis_PE[Redis_Private_Endpoint_10_0_4_20]
    end

    subgraph snet_bastion_prod_10_0_5_0_24
        Bastion[Azure_Bastion_Host]
    end

    subgraph snet_management_prod_10_0_6_0_24
        VM[Management_Jumpbox_VM]
    end

    SWA[Azure_Static_Web_Apps_React_Frontend]
    SendGrid[SendGrid_SMTP_Service]
    AKV[Azure_Key_Vault_Private_Link]
    
    AFD -->|SecureRoute| AGW
    AGW -->|InternalRouting| ACA_Env_Host
    
    ACA_Services_List -->|Port5432| PG_PE
    ACA_Services_List -->|Port6379| Redis_PE
    
    ACA_Services_List -->|Port443| AKV
    
    Bastion -->|AdminAccess| VM
    VM -->|RunMigrations| PG_PE
```

---

## 9. AKS Alternative Network and Subnet Topology Design

If deploying on Azure Kubernetes Service (AKS) instead of Azure Container Apps (ACA), the network architecture shifts to support node pools, pod networking, and Kubernetes ingress controllers.

### AKS VNet IP Address Scheme and Subnet Allocation
* **VNet Address Space**: `10.240.0.0/16` (65,536 available IP addresses)

| Subnet Name | CIDR Range | Delegated To / Dedicated Service | Resources Placed | Network Security Group (NSG) Policy |
| :--- | :--- | :--- | :--- | :--- |
| **snet-ingress-prod** | `10.240.1.0/24` (256 IPs) | None (Standard Subnet) | Azure Application Gateway (AGIC v2) or Ingress Controllers | **Inbound**: Allow HTTPS (443) from Azure Front Door. <br>**Outbound**: Allow traffic to `snet-aks-prod` node ports. |
| **snet-aks-prod** | `10.240.2.0/22` (1024 IPs) | None (AKS Node Subnet) | AKS System Node Pool, User Node Pools (CPU/GPU), and Pods (including Judge0 execution pods) (Azure CNI) | **Inbound**: Allow traffic from `snet-ingress-prod`. Allow SSH/management from `snet-bastion-prod`. <br>**Outbound**: Allow traffic to `snet-database-prod` on DB/Redis ports, and internet egress for container registries. |
| **snet-database-prod** | `10.240.6.0/24` (256 IPs) | None (Standard Subnet) | PostgreSQL Private Endpoint (`10.240.6.10`), Redis Private Endpoint (`10.240.6.20`) | **Inbound**: Allow TCP `5432` and TCP `6379` only from `snet-aks-prod` and `snet-management-prod`. <br>**Outbound**: Block all internet egress. |
| **snet-bastion-prod** | `10.240.7.0/24` (256 IPs) | `Microsoft.Network/bastionHosts` | Azure Bastion service instances | **Inbound**: Allow HTTPS (443) from administrator IPs. <br>**Outbound**: Allow SSH/RDP to nodes and VM subnets. |
| **snet-management-prod** | `10.240.8.0/24` (256 IPs) | None (Standard Subnet) | Linux Jumpbox VM (used for running DB migrations and running `kubectl` securely) | **Inbound**: Allow SSH (22) from `snet-bastion-prod`. <br>**Outbound**: Allow access to PostgreSQL Private Endpoint and AKS cluster API. |

### AKS Network Topology Diagram

This diagram displays the AKS-specific VNet subnet layout and flow boundaries, using a quote-free structure to ensure error-free rendering.

```mermaid
graph TD
    Internet[Public_Internet_Users] -->|HTTPS| AFD[Azure_Front_Door_and_WAF]
    
    subgraph snet_ingress_prod_10_240_1_0_24
        AGIC[Application_Gateway_Ingress_Controller_WAF]
    end
    
    subgraph snet_aks_prod_10_240_2_0_22
        AKS_Cluster[AKS_Cluster_Control_Plane]
        AKS_System_Nodes[System_Node_Pool_DS2_v2]
        AKS_User_Nodes[User_Node_Pool_CPU_GPU]
        AKS_Pods[Microservices_Pods_auth_admin_student_exam_proctoring_notification_AI_judge0]
    end
    
    subgraph snet_database_prod_10_240_6_0_24
        PG_PE[PostgreSQL_Private_Endpoint_10_240_6_10]
        Redis_PE[Redis_Private_Endpoint_10_240_6_20]
    end

    subgraph snet_bastion_prod_10_240_7_0_24
        Bastion[Azure_Bastion_Host]
    end

    subgraph snet_management_prod_10_240_8_0_24
        VM[Management_Jumpbox_VM]
    end

    SWA[Azure_Static_Web_Apps_React_Frontend]
    SendGrid[SendGrid_SMTP_Service]
    AKV[Azure_Key_Vault_Private_Link]
    
    AFD -->|SecureRoute| AGIC
    AGIC -->|InternalRouting| AKS_Cluster
    
    AKS_Pods -->|Port5432| PG_PE
    AKS_Pods -->|Port6379| Redis_PE
    
    AKS_Pods -->|Port443| AKV
    
    Bastion -->|AdminAccess| VM
    VM -->|RunMigrations| PG_PE
```

---

## 10. Disaster Recovery (DR) & Business Continuity Plan

To ensure Clahan Academy remains operational during regional Azure outages, the infrastructure implements an **Active-Passive Multi-Region Disaster Recovery** strategy. 

* **Primary Region**: East US (All active user traffic).
* **Secondary Region**: West US (Paired hot-standby replica).

### Disaster Recovery Objectives
* **Recovery Time Objective (RTO)**: $< 15$ minutes (time to detect outage and fail over compute/traffic).
* **Recovery Point Objective (RPO)**: $< 5$ seconds (maximum potential loss of active exam submissions).

### Component Failover Strategy

| Infrastructure Component | DR Mechanism | Failover Process |
| :--- | :--- | :--- |
| **Global Routing** | **Azure Front Door** | Front Door continuously monitors both regions using HTTP health probes. If probes to the Primary region fail 3 times consecutively, it automatically reroutes 100% of public traffic to the Secondary region. |
| **Compute (ACA / AKS)** | **Multi-Region Revision Deployments** | CI/CD pipelines (GitHub Actions) deploy code revisions to both the Primary and Secondary ACA/AKS clusters. The Secondary region runs with minimal container replicas to save costs, automatically scaling up when failed over. |
| **Database (PostgreSQL)** | **Cross-Region Read Replica** | A cross-region read replica is continuously synchronized in the Secondary region. In the event of a primary region database failure, the replica is promoted to primary write database. |
| **Session Cache (Redis)** | **Standby Instance** | A separate Redis instance is deployed in the standby region. If failover occurs, the cache is rebuilt dynamically; active exam candidates are prompted to log back in (using JWT tokens), with their progress recovered from the PostgreSQL database. |
| **Secrets (Key Vault)** | **Azure Geo-Replication** | Azure Key Vault natively replicates keys and secrets to the paired secondary region. If the primary region goes offline, the secondary Key Vault becomes active. |

### Disaster Recovery Routing Flow

The diagram below illustrates the automatic traffic failover from East US to West US if a regional outage occurs:

```mermaid
graph TD
    User[Users_and_Admins] -->|Request| AFD[Azure_Front_Door_and_WAF]
    
    subgraph East_US_Primary_Active
        ACA_Primary[ACA_Environment_East_US]
        PG_Primary[PostgreSQL_Primary_Write]
    end
    
    subgraph West_US_Secondary_Standby
        ACA_Standby[ACA_Environment_West_US]
        PG_Replica[PostgreSQL_Read_Replica]
    end
    
    AFD -.->|ProbeFailed| ACA_Primary
    AFD ===>|ActiveTraffic_Rerouted| ACA_Standby
    
    PG_Primary -->|GeoReplication_RPO_5s| PG_Replica
    ACA_Standby -->|ReadWrite_Promoted| PG_Replica
```


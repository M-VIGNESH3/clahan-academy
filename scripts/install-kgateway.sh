#!/bin/bash
# Install kGateway on AKS cluster
# Run after: az aks get-credentials --resource-group rg-clahan-academy --name aks-clahan-academy

set -e

echo "Installing Gateway API CRDs..."
kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.2.0/standard-install.yaml

echo "Installing kGateway..."
helm upgrade --install kgateway \
  oci://cr.kgateway.dev/kgateway-helm/kgateway \
  --namespace kgateway-system \
  --create-namespace \
  --version 1.0.3 \
  --wait

echo "Installing kGateway CRDs..."
helm upgrade --install kgateway-crds \
  oci://cr.kgateway.dev/kgateway-helm/kgateway-crds \
  --namespace kgateway-system \
  --create-namespace \
  --version 1.0.3

echo "Waiting for kGateway to be ready..."
kubectl wait --namespace kgateway-system \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/name=kgateway \
  --timeout=120s

echo "Verifying GatewayClass..."
kubectl get gatewayclass

echo "kGateway installed successfully!"
echo "Apply your Gateway and HTTPRoute:"
echo "  kubectl apply -f kubernetes/gateway.yaml"
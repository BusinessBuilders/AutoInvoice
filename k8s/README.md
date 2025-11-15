# Kubernetes Deployment Guide

Production-ready Kubernetes deployment for AutoInvoice.

## Prerequisites

- Kubernetes cluster (1.24+)
- kubectl configured
- Helm (optional, for cert-manager)
- Docker registry access (GitHub Container Registry)

## Quick Deploy

```bash
# Create namespace
kubectl apply -f namespace.yml

# Create secrets (IMPORTANT: Update with real values first!)
kubectl apply -f secrets.yml

# Create config
kubectl apply -f configmap.yml

# Deploy infrastructure
kubectl apply -f postgres.yml
kubectl apply -f redis.yml

# Wait for infrastructure
kubectl wait --for=condition=ready pod -l app=postgres -n autoinvoice --timeout=300s
kubectl wait --for=condition=ready pod -l app=redis -n autoinvoice --timeout=300s

# Deploy backend
kubectl apply -f backend.yml

# Deploy ingress
kubectl apply -f ingress.yml
```

## Components

### Infrastructure
- **PostgreSQL** - Main database with pgvector
- **Redis** - Queue and cache
- **PersistentVolumes** - Data persistence

### Application
- **Backend API** - Node.js + tRPC
- **Horizontal Pod Autoscaler** - Auto-scaling (2-10 pods)
- **Ingress** - External access with TLS

## Secrets Management

### Option 1: kubectl create secret
```bash
kubectl create secret generic autoinvoice-secrets \
  --from-literal=DATABASE_URL='postgresql://...' \
  --from-literal=JWT_SECRET='your-secret' \
  --from-literal=OPENAI_API_KEY='sk-...' \
  -n autoinvoice
```

### Option 2: Sealed Secrets (Recommended)
```bash
# Install sealed-secrets controller
helm install sealed-secrets sealed-secrets/sealed-secrets -n kube-system

# Create sealed secret
kubectl create secret generic autoinvoice-secrets \
  --from-literal=DATABASE_URL='postgresql://...' \
  --dry-run=client -o yaml | \
  kubeseal -o yaml > sealed-secrets.yml

kubectl apply -f sealed-secrets.yml
```

## Database Migrations

```bash
# Run migrations
kubectl exec -it deployment/autoinvoice-backend -n autoinvoice -- \
  npm run migrate:deploy

# Seed database
kubectl exec -it deployment/autoinvoice-backend -n autoinvoice -- \
  npm run seed
```

## Monitoring

```bash
# View logs
kubectl logs -f deployment/autoinvoice-backend -n autoinvoice

# Check pod status
kubectl get pods -n autoinvoice

# Check HPA status
kubectl get hpa -n autoinvoice

# View metrics
kubectl top pods -n autoinvoice
```

## Scaling

### Manual Scaling
```bash
kubectl scale deployment autoinvoice-backend --replicas=5 -n autoinvoice
```

### Auto-scaling (already configured)
- Min: 2 pods
- Max: 10 pods
- Triggers: CPU > 70%, Memory > 80%

## Backup & Restore

### Database Backup
```bash
# Create backup
kubectl exec -it deployment/postgres -n autoinvoice -- \
  pg_dump -U postgres invoice_platform > backup.sql

# Restore backup
kubectl exec -i deployment/postgres -n autoinvoice -- \
  psql -U postgres invoice_platform < backup.sql
```

### Persistent Volume Backup
```bash
# Backup PVCs using Velero
velero backup create autoinvoice-backup \
  --include-namespaces autoinvoice \
  --include-resources pvc,pv
```

## SSL/TLS Setup

### Using cert-manager
```bash
# Install cert-manager
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.yaml

# Create ClusterIssuer
kubectl apply -f - <<EOF
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: admin@autoinvoice.app
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
    - http01:
        ingress:
          class: nginx
EOF
```

## Troubleshooting

### Pod not starting
```bash
# Check pod events
kubectl describe pod <pod-name> -n autoinvoice

# Check logs
kubectl logs <pod-name> -n autoinvoice

# Check resource usage
kubectl top pod <pod-name> -n autoinvoice
```

### Database connection issues
```bash
# Test database connection
kubectl exec -it deployment/autoinvoice-backend -n autoinvoice -- \
  node -e "require('./src/utils/db').prisma.\$connect().then(() => console.log('Connected!'))"

# Check postgres service
kubectl get svc postgres -n autoinvoice
```

### High memory usage
```bash
# Check memory limits
kubectl describe pod <pod-name> -n autoinvoice

# Update resource limits in backend.yml
```

## Production Checklist

- [ ] Secrets are properly sealed/encrypted
- [ ] Resource limits are set appropriately
- [ ] Monitoring is configured (Prometheus/Grafana)
- [ ] Backups are automated
- [ ] SSL certificates are valid
- [ ] Ingress is configured with rate limiting
- [ ] HPA is tested and working
- [ ] Database migrations are up to date
- [ ] Health checks are passing
- [ ] Logs are being collected (ELK/Loki)

## Advanced Configuration

### Multi-Region Deployment
```bash
# Deploy to multiple regions
kubectl apply -f backend.yml --context=us-east
kubectl apply -f backend.yml --context=eu-west
```

### Blue-Green Deployment
```bash
# Deploy new version (green)
kubectl apply -f backend-green.yml

# Test green deployment
curl https://green.autoinvoice.app/health

# Switch traffic to green
kubectl patch svc autoinvoice-backend -p '{"spec":{"selector":{"version":"green"}}}'

# Remove blue deployment
kubectl delete deployment autoinvoice-backend-blue
```

## Cost Optimization

1. **Right-size pods**: Monitor and adjust resource requests
2. **Use spot instances**: For non-critical workloads
3. **Enable cluster autoscaler**: Scale nodes based on demand
4. **Use PV snapshots**: Instead of keeping old PVs

## Security

- [ ] Network policies configured
- [ ] Pod security policies enabled
- [ ] RBAC properly configured
- [ ] Secrets encrypted at rest
- [ ] Container images scanned
- [ ] Ingress has WAF rules

## Support

For issues, see the main [README.md](../README.md) or open an issue on GitHub.

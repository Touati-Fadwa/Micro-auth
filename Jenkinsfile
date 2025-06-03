pipeline {
  agent any

  environment {
    IMAGE_NAME = "touatifadwa/bibliotheque-microauth"
    IMAGE_TAG = "latest"
    REGISTRY = "docker.io"
    KUBE_NAMESPACE = "bibliotheque"
    HELM_RELEASE_NAME = "monitoring-stack"
    GMAIL_USER = credentials('gmail-user')
    GMAIL_APP_PASSWORD = credentials('gmail-app-password')
    ADMIN_EMAIL = credentials('admin-email')
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    stage('Install') {
      steps {
        dir('microservice-auth') {
          sh 'npm ci'
        }
      }
    }

    stage('Build') {
      steps {
        dir('microservice-auth') {
          sh 'npm run build'
        }
      }
    }

    stage('Test') {
      steps {
        dir('microservice-auth') {
          sh 'npm test -- --coverage'
        }
      }
    }

    stage('Docker Build') {
      steps {
        script {
          sh "docker build -t ${IMAGE_NAME}:${IMAGE_TAG} -f ./Dockerfile ."
        }
      }
    }

    stage('Docker Login & Push') {
      steps {
        withCredentials([usernamePassword(
          credentialsId: 'docker-hub-credentials',
          usernameVariable: 'DOCKER_USER',
          passwordVariable: 'DOCKER_PASS'
        )]) {
          sh '''
            echo "$DOCKER_PASS" | docker login -u "$DOCKER_USER" --password-stdin $REGISTRY
            docker push ${IMAGE_NAME}:${IMAGE_TAG}
          '''
        }
      }
    }

    stage('Configure K3s Access') {
      steps {
        script {
          withCredentials([file(credentialsId: 'K3S_CONFIG', variable: 'KUBECONFIG_FILE')]) {
            sh '''
              mkdir -p ~/.kube
              cp "$KUBECONFIG_FILE" ~/.kube/config
              chmod 600 ~/.kube/config
              kubectl get nodes
              kubectl cluster-info
              kubectl create namespace $KUBE_NAMESPACE --dry-run=client -o yaml | kubectl apply -f -
            '''
          }
        }
      }
    }

    stage('Deploy to K3s') {
      steps {
        script {
          withCredentials([file(credentialsId: 'K3S_CONFIG', variable: 'KUBECONFIG_FILE')]) {
            sh '''
              kubectl apply -f k8s/bibliotheque-auth-deployment.yaml -n bibliotheque
            '''
          }
        }
      }
    }

    stage('Setup Complete Monitoring Stack') {
      steps {
        script {
          withCredentials([
            file(credentialsId: 'K3S_CONFIG', variable: 'KUBECONFIG_FILE'),
            string(credentialsId: 'gmail-user', variable: 'GMAIL_USER'),
            string(credentialsId: 'gmail-app-password', variable: 'GMAIL_APP_PASSWORD'),
            string(credentialsId: 'admin-email', variable: 'ADMIN_EMAIL')
          ]) {
            try {
              sh '''
                # Création du namespace monitoring
                kubectl create namespace monitoring --dry-run=client -o yaml | kubectl apply -f -
               
                echo "Installation de la stack Prometheus + Grafana..."
                helm upgrade --install $HELM_RELEASE_NAME prometheus-community/kube-prometheus-stack \
                    --namespace monitoring \
                    --version 55.7.1 \
                    --set kubeEtcd.enabled=false \
                    --set prometheus.prometheusSpec.serviceMonitorSelectorNilUsesHelmValues=false \
                    --set prometheus.prometheusSpec.podMonitorSelectorNilUsesHelmValues=false \
                    --set prometheus.service.type=NodePort \
                    --set prometheus.service.nodePort=30900 \
                    --set grafana.service.type=NodePort \
                    --set grafana.service.nodePort=30300 \
                    --set alertmanager.enabled=false \
                    --wait --timeout 5m
              '''
             
              // Configuration d'AlertManager avec Gmail
              def alertmanagerConfig = """
apiVersion: v1
kind: ConfigMap
metadata:
  name: alertmanager-config
  namespace: monitoring
data:
  alertmanager.yml: |
    global:
      smtp_smarthost: 'smtp.gmail.com:587'
      smtp_from: '${GMAIL_USER}'
      smtp_auth_username: '${GMAIL_USER}'
      smtp_auth_password: '${GMAIL_APP_PASSWORD}'
      smtp_require_tls: true

    route:
      group_by: ['alertname']
      group_wait: 10s
      group_interval: 10s
      repeat_interval: 1h
      receiver: 'gmail-notifications'

    receivers:
    - name: 'gmail-notifications'
      email_configs:
      - to: '${ADMIN_EMAIL}'
        subject: '🚨 ALERTE SYSTÈME - {{ .GroupLabels.alertname }}'
        body: |
          Alerte détectée sur le cluster Kubernetes:
         
          Nom de l'alerte: {{ .GroupLabels.alertname }}
          Statut: {{ .Status }}
         
          Détails:
          {{ range .Alerts }}
          - Instance: {{ .Labels.instance }}
          - Description: {{ .Annotations.description }}
          - Valeur: {{ .Annotations.value }}
          {{ end }}
         
          Timestamp: {{ .CommonAnnotations.timestamp }}
"""

              // Configuration Prometheus pour scraper l'API Gateway (CONSERVÉE)
              def prometheusConfig = """
apiVersion: v1
kind: ConfigMap
metadata:
  name: prometheus-authentification-config
  namespace: monitoring
data:
  prometheus-authentification.yml: |
    - job_name: 'authentification'
      scrape_interval: 15s
      static_configs:
        - targets: ['bibliotheque-authentification-service.bibliotheque.svc.cluster.local:3003']
      metrics_path: /metrics
"""
             
              // Dashboard Grafana pour l'API Gateway (CONSERVÉ ET AMÉLIORÉ)
              def grafanaDashboard = """
apiVersion: v1
kind: ConfigMap
metadata:
  name: grafana-authentification-dashboard
  namespace: monitoring
  labels:
    grafana_dashboard: "1"
data:
  api-gateway-dashboard.json: |
    {
      "dashboard": {
        "id": null,
        "title": "Tableau de bord API Gateway & Système",
        "tags": ["kubernetes", "api-gateway", "monitoring"],
        "timezone": "browser",
        "panels": [
          {
            "id": 1,
            "title": "Utilisation CPU",
            "type": "stat",
            "targets": [
              {
                "expr": "100 - (avg by (instance) (irate(node_cpu_seconds_total{mode=\\"idle\\"}[5m])) * 100)",
                "legendFormat": "CPU Usage %"
              }
            ],
            "gridPos": {"h": 8, "w": 12, "x": 0, "y": 0}
          },
          {
            "id": 2,
            "title": "Utilisation Mémoire",
            "type": "stat",
            "targets": [
              {
                "expr": "(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100",
                "legendFormat": "Memory Usage %"
              }
            ],
            "gridPos": {"h": 8, "w": 12, "x": 12, "y": 0}
          },
          {
            "id": 3,
            "title": "Utilisation Disque (%)",
            "type": "gauge",
            "targets": [
              {
                "expr": "100 - (100 * node_filesystem_avail_bytes / node_filesystem_size_bytes)",
                "legendFormat": "{{ .Labels.mountpoint }}"
              }
            ],
            "fieldConfig": {
              "defaults": {
                "thresholds": {
                  "steps": [
                    {"color": "green", "value": 0},
                    {"color": "yellow", "value": 80},
                    {"color": "red", "value": 90}
                  ]
                }
              }
            },
            "gridPos": {"h": 8, "w": 24, "x": 0, "y": 8}
          },
          {
            "id": 4,
            "title": "Requêtes API Gateway",
            "type": "graph",
            "targets": [
              {
                "expr": "rate(http_requests_total[5m])",
                "legendFormat": "Requêtes/sec"
              }
            ],
            "gridPos": {"h": 8, "w": 24, "x": 0, "y": 16}
          }
        ],
        "time": {"from": "now-1h", "to": "now"},
        "refresh": "30s"
      }
    }
"""

              // Règles d'alerte pour l'espace disque
              def diskAlertRules = """
apiVersion: v1
kind: ConfigMap
metadata:
  name: prometheus-disk-rules
  namespace: monitoring
data:
  disk-rules.yml: |
    groups:
    - name: disk-usage-alerts
      rules:
      - alert: DiskSpaceHigh
        expr: 100 - (100 * node_filesystem_avail_bytes / node_filesystem_size_bytes) > 90
        for: 2m
        labels:
          severity: critical
          service: filesystem
        annotations:
          summary: "Espace disque critique sur {{ \$labels.instance }}"
          description: "L'espace disque utilisé est de {{ \$value }}% sur le point de montage {{ \$labels.mountpoint }} de l'instance {{ \$labels.instance }}"
          value: "{{ \$value }}%"
     
      - alert: DiskSpaceWarning
        expr: 100 - (100 * node_filesystem_avail_bytes / node_filesystem_size_bytes) > 80
        for: 5m
        labels:
          severity: warning
          service: filesystem
        annotations:
          summary: "Avertissement espace disque sur {{ \$labels.instance }}"
          description: "L'espace disque utilisé est de {{ \$value }}% sur le point de montage {{ \$labels.mountpoint }} de l'instance {{ \$labels.instance }}"
          value: "{{ \$value }}%"
"""
             
              writeFile file: 'alertmanager-config.yaml', text: alertmanagerConfig
              writeFile file: 'prometheus-config.yaml', text: prometheusConfig
              writeFile file: 'grafana-dashboard.yaml', text: grafanaDashboard
              writeFile file: 'disk-alert-rules.yaml', text: diskAlertRules
             
              sh '''
                # Application de toutes les configurations
                kubectl apply -f alertmanager-config.yaml
                kubectl apply -f prometheus-config.yaml
                kubectl apply -f grafana-dashboard.yaml
                kubectl apply -f disk-alert-rules.yaml
               
                # Déploiement d'AlertManager
                kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: alertmanager
  namespace: monitoring
spec:
  replicas: 1
  selector:
    matchLabels:
      app: alertmanager
  template:
    metadata:
      labels:
        app: alertmanager
    spec:
      containers:
      - name: alertmanager
        image: prom/alertmanager:v0.26.0
        ports:
        - containerPort: 9093
        volumeMounts:
        - name: config-volume
          mountPath: /etc/alertmanager
        args:
        - '--config.file=/etc/alertmanager/alertmanager.yml'
        - '--storage.path=/alertmanager'
        - '--web.external-url=http://localhost:9093'
      volumes:
      - name: config-volume
        configMap:
          name: alertmanager-config
---
apiVersion: v1
kind: Service
metadata:
  name: alertmanager-service
  namespace: monitoring
spec:
  selector:
    app: alertmanager
  ports:
  - port: 9093
    targetPort: 9093
    nodePort: 30093
  type: NodePort
EOF
               
                # Attendre que AlertManager soit prêt
                kubectl wait --for=condition=available --timeout=300s deployment/alertmanager -n monitoring
               
                echo "🔍 LIENS MONITORING COMPLETS :"
                NODE_IP=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}')
                echo "Prometheus:   http://$NODE_IP:30900"
                echo "Grafana:      http://$NODE_IP:30300 (admin/prom-operator)"
                echo "AlertManager: http://$NODE_IP:30093"
               
                echo "✅ Configuration complète :"
                echo "  - Prometheus : Collecte des métriques"
                echo "  - Grafana : Dashboards visuels"
                echo "  - AlertManager : Alertes Gmail à ${ADMIN_EMAIL}"
                echo "  - Surveillance disque : Alerte à 90%"
              '''
            } catch (Exception e) {
              echo "Échec de la configuration du monitoring: ${e.getMessage()}"
              currentBuild.result = 'UNSTABLE'
            }
          }
        }
      }
    }

    stage('Verify Deployment') {
      steps {
        script {
          withCredentials([file(credentialsId: 'K3S_CONFIG', variable: 'KUBECONFIG_FILE')]) {
            sh '''
              echo "=== Deployment Status ==="
              kubectl get deploy -n $KUBE_NAMESPACE
             
              echo "=== Service Details ==="
              kubectl get svc -n $KUBE_NAMESPACE
             
              echo "=== Pods Status ==="
              kubectl get pods -n $KUBE_NAMESPACE
             
              echo "=== Monitoring Stack Status ==="
              kubectl get pods -n monitoring
              kubectl get svc -n monitoring
             
              NODE_IP=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}')
              NODE_PORT=$(kubectl get svc bibliotheque-auth-service -n $KUBE_NAMESPACE -o jsonpath='{.spec.ports[0].nodePort}')
              echo "Application accessible via: http://$NODE_IP:$NODE_PORT"
            '''
          }
        }
      }
    }
  }

  post {
    failure {
      script {
        echo "Pipeline failed! Attempting rollback..."
        withCredentials([file(credentialsId: 'K3S_CONFIG', variable: 'KUBECONFIG_FILE')]) {
          sh '''
            echo "!!! Deployment failed - Initiating rollback !!!"
            kubectl rollout undo deployment/bibliotheque-auth -n $KUBE_NAMESPACE || true
            kubectl rollout status deployment/bibliotheque-auth -n $KUBE_NAMESPACE --timeout=120s || true
            echo "Rollback to previous version completed"
           
            echo "Nettoyage du monitoring..."
            kubectl delete deployment alertmanager -n monitoring || true
            kubectl delete service alertmanager-service -n monitoring || true
            kubectl delete configmap alertmanager-config -n monitoring || true
            kubectl delete configmap prometheus-disk-rules -n monitoring || true
            kubectl delete configmap prometheus-authentification-config -n monitoring || true
            kubectl delete configmap grafana-authentification-dashboard -n monitoring || true
            helm uninstall $HELM_RELEASE_NAME -n monitoring || true
            kubectl delete namespace monitoring --ignore-not-found=true || true
          '''
        }
      }
    }
    always {
      sh 'docker logout $REGISTRY || true'
      echo "Pipeline execution completed"
    }
  }
}


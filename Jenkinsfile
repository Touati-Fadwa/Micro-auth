pipeline {
  agent any

  environment {
    IMAGE_NAME = "touatifadwa/bibliotheque-microauth"
    IMAGE_TAG = "latest"
    REGISTRY = "docker.io"
    KUBE_NAMESPACE = "bibliotheque"
    HELM_RELEASE_NAME = "monitoring-stack"
    ALERT_EMAIL = "fadwatouati58@gmail.com"  // À remplacer par votre email
    SMTP_HOST = "smtp.gmail.com"           // À configurer selon votre fournisseur SMTP
    SMTP_PORT = "587"                      // Port SMTP
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
              # Configure kubectl access
              mkdir -p ~/.kube
              cp "$KUBECONFIG_FILE" ~/.kube/config
              chmod 600 ~/.kube/config

              # Test connection
              kubectl get nodes
              kubectl cluster-info
              
              # Create namespace if not exists
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
              
              NODE_IP=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}')
              NODE_PORT=$(kubectl get svc bibliotheque-auth-service -n $KUBE_NAMESPACE -o jsonpath='{.spec.ports[0].nodePort}')
              echo "Application accessible via: http://$NODE_IP:$NODE_PORT"
            '''
          }
        }
      }
    }

    stage('Setup Monitoring Stack') {
      steps {
        script {
          withCredentials([
            file(credentialsId: 'K3S_CONFIG', variable: 'KUBECONFIG_FILE'),
            usernamePassword(
              credentialsId: 'SMTP_CREDENTIALS',
              usernameVariable: 'SMTP_USER',
              passwordVariable: 'SMTP_PASSWORD'
            )
          ]) {
            try {
              sh '''
                # Create monitoring namespace
                kubectl create namespace monitoring --dry-run=client -o yaml | kubectl apply -f -

                # Install Prometheus Stack with AlertManager
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
                  --set alertmanager.service.type=NodePort \
                  --set alertmanager.service.nodePort=30903 \
                  --set alertmanager.config.global.smtp_smarthost="$SMTP_HOST:$SMTP_PORT" \
                  --set alertmanager.config.global.smtp_from="$ALERT_EMAIL" \
                  --set alertmanager.config.global.smtp_auth_username="$SMTP_USER" \
                  --set alertmanager.config.global.smtp_auth_password="$SMTP_PASSWORD" \
                  --set alertmanager.config.global.smtp_require_tls=true \
                  --set alertmanager.config.receivers[0].name="default-receiver" \
                  --set alertmanager.config.receivers[0].email_configs[0].to="$ALERT_EMAIL" \
                  --set alertmanager.config.route.receiver="default-receiver" \
                  --set alertmanager.config.route.group_wait="30s" \
                  --set alertmanager.config.route.group_interval="5m" \
                  --set alertmanager.config.route.repeat_interval="3h" \
                  --wait --timeout 5m

                echo "Monitoring stack installed successfully!"
              '''

              // Default alert rules
              def alertRules = """
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: default-alerts
  namespace: monitoring
  labels:
    prometheus: kube-prometheus-stack-prometheus
    role: alert-rules
spec:
  groups:
  - name: general.rules
    rules:
    - alert: HighPodRestart
      expr: rate(kube_pod_container_status_restarts_total[5m]) > 0
      for: 10m
      labels:
        severity: warning
      annotations:
        summary: "High Pod Restart Rate (instance {{ \$labels.instance }})"
        description: "Pod {{ \$labels.pod }} in {{ \$labels.namespace }} has restarted {{ \$value }} times in the last 5 minutes"
        
    - alert: ServiceDown
      expr: up == 0
      for: 5m
      labels:
        severity: critical
      annotations:
        summary: "Service down (instance {{ \$labels.instance }})"
        description: "{{ \$labels.job }} on {{ \$labels.instance }} has been down for more than 5 minutes"
        
    - alert: HighCPUUsage
      expr: 100 - (avg by(instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100) > 80
      for: 10m
      labels:
        severity: warning
      annotations:
        summary: "High CPU usage (instance {{ \$labels.instance }})"
        description: "CPU usage is {{ \$value }}% for more than 10 minutes"
        
    - alert: HighMemoryUsage
      expr: (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes) * 100 < 20
      for: 10m
      labels:
        severity: warning
      annotations:
        summary: "High Memory usage (instance {{ \$labels.instance }})"
        description: "Memory available is only {{ \$value }}% for more than 10 minutes"
        
    - alert: HighDiskUsage
      expr: 100 - (node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"} * 100) > 85
      for: 15m
      labels:
        severity: warning
      annotations:
        summary: "High Disk usage (instance {{ \$labels.instance }})"
        description: "Disk usage is {{ \$value }}% for more than 15 minutes"
        
  - name: application.rules
    rules:
    - alert: AuthServiceHighLatency
      expr: histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{job="authentification"}[5m])) by (le)) > 1
      for: 5m
      labels:
        severity: warning
      annotations:
        summary: "High latency in authentication service"
        description: "95th percentile latency is {{ \$value }} seconds"
        
    - alert: AuthServiceHighErrorRate
      expr: rate(http_requests_total{job="authentification", status=~"5.."}[5m]) / rate(http_requests_total{job="authentification"}[5m]) > 0.05
      for: 5m
      labels:
        severity: critical
      annotations:
        summary: "High error rate in authentication service"
        description: "Error rate is {{ \$value }}% for more than 5 minutes"
"""

              // Prometheus config for scraping
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
        - targets: ['bibliotheque-auth-service.bibliotheque.svc.cluster.local:3003']
      metrics_path: /metrics
"""

              // Grafana dashboard
              def grafanaDashboard = """
apiVersion: v1
kind: ConfigMap
metadata:
  name: grafana-auth-dashboard
  namespace: monitoring
  labels:
    grafana_dashboard: "1"
data:
  auth-dashboard.json: |
    {
      "title": "Authentication Service Dashboard",
      "panels": [
        {
          "title": "HTTP Requests",
          "type": "graph",
          "targets": [
            {
              "expr": "rate(http_requests_total{job=\"authentification\"}[5m])",
              "legendFormat": "{{method}} {{status}}"
            }
          ]
        }
      ]
    }
"""

              writeFile file: 'alert-rules.yaml', text: alertRules
              writeFile file: 'prometheus-config.yaml', text: prometheusConfig
              writeFile file: 'grafana-dashboard.yaml', text: grafanaDashboard

              sh '''
                # Apply configurations
                kubectl apply -f alert-rules.yaml
                kubectl apply -f prometheus-config.yaml
                kubectl apply -f grafana-dashboard.yaml

                # Display monitoring URLs
                NODE_IP=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}')
                echo "=== Monitoring URLs ==="
                echo "Prometheus:    http://$NODE_IP:30900"
                echo "Grafana:       http://$NODE_IP:30300 (admin/prom-operator)"
                echo "AlertManager:  http://$NODE_IP:30903"
              '''
            } catch (Exception e) {
              echo "Monitoring setup failed: ${e.getMessage()}"
              currentBuild.result = 'UNSTABLE'
            }
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
            
            echo "Cleaning up monitoring..."
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
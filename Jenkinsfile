pipeline {
  agent any

  environment {
    IMAGE_NAME = "touatifadwa/bibliotheque-microauth"
    IMAGE_TAG = "latest"
    REGISTRY = "docker.io"
    KUBE_NAMESPACE = "bibliotheque"
    HELM_RELEASE_NAME = "monitoring-stack"
    ALERT_EMAIL = "fadwatouati58@gmail.com"
    SMTP_HOST = "smtp.gmail.com"
    SMTP_PORT = "587"
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
              kubectl apply -f k8s/bibliotheque-auth-deployment.yaml -n $KUBE_NAMESPACE
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
              echo "=== Pods Status ==="
              kubectl get pods -n $KUBE_NAMESPACE
              
              NODE_IP=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}')
              NODE_PORT=$(kubectl get svc bibliotheque-auth-service -n $KUBE_NAMESPACE -o jsonpath='{.spec.ports[0].nodePort}')
              echo "Application URL: http://$NODE_IP:$NODE_PORT"
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
              // Cleanup existing installation
              sh '''
                helm uninstall $HELM_RELEASE_NAME -n monitoring 2>/dev/null || true
                kubectl delete namespace monitoring --ignore-not-found=true
                sleep 10
              '''
              
              // Create monitoring namespace
              sh '''
                kubectl create namespace monitoring
              '''

              // Install Prometheus Stack
              sh """
                helm install $HELM_RELEASE_NAME prometheus-community/kube-prometheus-stack \
                  --namespace monitoring \
                  --version 55.7.1 \
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
                  --wait --timeout 5m
              """

              // Configure custom alerts
              def alertRules = """
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: auth-service-alerts
  namespace: monitoring
  labels:
    prometheus: kube-prometheus-stack-prometheus
    role: alert-rules
spec:
  groups:
  - name: auth-service-availability
    rules:
    - alert: AuthServiceDown
      expr: up{job=~"bibliotheque-auth.*"} == 0
      for: 1m
      labels:
        severity: critical
        domain: auth
      annotations:
        summary: "Service d'authentification indisponible"
        description: "Le service d'authentification est down sur {{ \$labels.pod }}"
        
    - alert: AuthHighErrorRate
      expr: sum(rate(http_requests_total{job=~"bibliotheque-auth.*", status=~"5.."}[1m])) by (pod) / sum(rate(http_requests_total{job=~"bibliotheque-auth.*"}[1m])) by (pod) > 0.05
      for: 2m
      labels:
        severity: warning
        domain: auth
      annotations:
        summary: "Taux d'erreur élevé ({{ \$value }}%)"
        description: "Taux d'erreur > 5% sur le pod {{ \$labels.pod }}"
        
  - name: auth-service-performance
    rules:
    - alert: AuthHighLatency
      expr: histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{job=~"bibliotheque-auth.*"}[1m])) by (le, pod)) > 1
      for: 3m
      labels:
        severity: warning
        domain: auth
      annotations:
        summary: "Latence élevée ({{ \$value }}s)"
        description: "95p des requêtes > 1s sur {{ \$labels.pod }}"
        
    - alert: AuthHighCPU
      expr: process_cpu_seconds_total{job=~"bibliotheque-auth.*"} > 0.9
      for: 5m
      labels:
        severity: warning
        domain: auth
      annotations:
        summary: "Utilisation CPU élevée"
        description: "CPU > 90% sur {{ \$labels.pod }}"
        
  - name: auth-service-business
    rules:
    - alert: AuthFailedLoginsSpike
      expr: rate(auth_failed_logins_total{job=~"bibliotheque-auth.*"}[5m]) > 10
      for: 2m
      labels:
        severity: warning
        domain: auth
      annotations:
        summary: "Pic de connexions échouées"
        description: "Plus de 10 échecs/min sur {{ \$labels.pod }}"
"""

              // ServiceMonitor for auth service
              def serviceMonitor = """
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: bibliotheque-auth-monitor
  namespace: monitoring
spec:
  selector:
    matchLabels:
      app: bibliotheque-auth
  endpoints:
  - port: http
    interval: 15s
    path: /metrics
"""

              writeFile file: 'alert-rules.yaml', text: alertRules
              writeFile file: 'service-monitor.yaml', text: serviceMonitor

              sh '''
                # Apply monitoring configuration
                kubectl apply -f alert-rules.yaml
                kubectl apply -f service-monitor.yaml

                # Display access information
                NODE_IP=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}')
                echo "=== Monitoring URLs ==="
                echo "Prometheus: http://$NODE_IP:30900"
                echo "Grafana: http://$NODE_IP:30300 (admin/prom-operator)"
                echo "AlertManager: http://$NODE_IP:30903"
                
                # Create temporary port-forward
                kubectl port-forward -n monitoring svc/alertmanager-operated 9093:9093 &
                echo "For immediate access, use port-forward: http://localhost:9093"
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
        withCredentials([file(credentialsId: 'K3S_CONFIG', variable: 'KUBECONFIG_FILE')]) {
          sh '''
            echo "Performing rollback..."
            kubectl rollout undo deployment/bibliotheque-auth -n $KUBE_NAMESPACE || true
            helm uninstall $HELM_RELEASE_NAME -n monitoring || true
          '''
        }
      }
    }
    always {
      sh 'docker logout $REGISTRY || true'
      echo "Pipeline completed"
    }
  }
}
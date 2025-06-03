pipeline {
  agent any

  environment {
    // Configuration Docker
    IMAGE_NAME = "touatifadwa/bibliotheque-microauth"
    IMAGE_TAG = "latest"
    REGISTRY = "docker.io"
    
    // Configuration Kubernetes
    KUBE_NAMESPACE = "bibliotheque"
    HELM_RELEASE_NAME = "monitoring-stack"
    
    // Versions des composants
    ALERTMANAGER_VERSION = "v0.26.0"
    PROMETHEUS_STACK_VERSION = "55.7.1"
    
    // Credentials (stockés dans Jenkins)
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

    stage('Install Dependencies') {
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

    stage('Deploy Application') {
      steps {
        script {
          withCredentials([file(credentialsId: 'K3S_CONFIG', variable: 'KUBECONFIG_FILE')]) {
            sh '''
              kubectl apply -f k8s/bibliotheque-auth-deployment.yaml -n $KUBE_NAMESPACE
              kubectl rollout status deployment/bibliotheque-auth -n $KUBE_NAMESPACE --timeout=120s
            '''
          }
        }
      }
    }

    stage('Deploy Monitoring Stack') {
      steps {
        script {
          withCredentials([
            file(credentialsId: 'K3S_CONFIG', variable: 'KUBECONFIG_FILE'),
            string(credentialsId: 'gmail-user', variable: 'GMAIL_USER'),
            string(credentialsId: 'gmail-app-password', variable: 'GMAIL_APP_PASSWORD'),
            string(credentialsId: 'admin-email', variable: 'ADMIN_EMAIL')
          ]) {
            try {
              // Création du namespace monitoring
              sh '''
                kubectl create namespace monitoring --dry-run=client -o yaml | kubectl apply -f -
              '''
              
              // Installation de la stack Prometheus avec AlertManager activé
              sh """
                helm upgrade --install $HELM_RELEASE_NAME prometheus-community/kube-prometheus-stack \\
                    --namespace monitoring \\
                    --version $PROMETHEUS_STACK_VERSION \\
                    --set kubeEtcd.enabled=false \\
                    --set prometheus.prometheusSpec.serviceMonitorSelectorNilUsesHelmValues=false \\
                    --set prometheus.prometheusSpec.podMonitorSelectorNilUsesHelmValues=false \\
                    --set prometheus.service.type=NodePort \\
                    --set prometheus.service.nodePort=30900 \\
                    --set grafana.service.type=NodePort \\
                    --set grafana.service.nodePort=30300 \\
                    --set grafana.adminPassword=prom-operator \\
                    --set alertmanager.enabled=true \\
                    --set alertmanager.config.global.smtp_smarthost='smtp.gmail.com:587' \\
                    --set alertmanager.config.global.smtp_from='${GMAIL_USER}' \\
                    --set alertmanager.config.global.smtp_auth_username='${GMAIL_USER}' \\
                    --set alertmanager.config.global.smtp_auth_password='${GMAIL_APP_PASSWORD}' \\
                    --set alertmanager.config.global.smtp_require_tls=true \\
                    --set alertmanager.config.receivers[0].name='gmail-notifications' \\
                    --set alertmanager.config.receivers[0].email_configs[0].to='${ADMIN_EMAIL}' \\
                    --set alertmanager.config.receivers[0].email_configs[0].headers.subject='🚨 Alerte Kubernetes: {{ .CommonLabels.alertname }}' \\
                    --set alertmanager.config.route.receiver='gmail-notifications' \\
                    --wait --timeout 5m
              """

              // Configuration Prometheus pour scraper l'application
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
        - targets: ['bibliotheque-authentification-service.${KUBE_NAMESPACE}.svc.cluster.local:3003']
      metrics_path: /metrics
"""

              // Dashboard Grafana
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
      "title": "Microservice Auth Dashboard",
      "panels": [
        {
          "title": "Requêtes HTTP",
          "type": "graph",
          "targets": [{
            "expr": "rate(http_requests_total[5m])",
            "legendFormat": "{{handler}}"
          }]
        }
      ]
    }
"""

              // Règles d'alerte
              def alertRules = """
apiVersion: v1
kind: ConfigMap
metadata:
  name: prometheus-custom-rules
  namespace: monitoring
data:
  custom-rules.yml: |
    groups:
    - name: application-alerts
      rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m]) > 0.1
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High error rate on {{ $labels.instance }}"
          description: "Error rate is {{ $value }}"
"""

              writeFile file: 'prometheus-config.yaml', text: prometheusConfig
              writeFile file: 'grafana-dashboard.yaml', text: grafanaDashboard
              writeFile file: 'alert-rules.yaml', text: alertRules
             
              sh '''
                # Application des configurations
                kubectl apply -f prometheus-config.yaml
                kubectl apply -f grafana-dashboard.yaml
                kubectl apply -f alert-rules.yaml
                
                # Attente que tous les composants soient prêts
                kubectl wait --for=condition=available --timeout=300s deployment/$HELM_RELEASE_NAME-grafana -n monitoring
                kubectl wait --for=condition=available --timeout=300s deployment/$HELM_RELEASE_NAME-kube-prometheus-operator -n monitoring
                kubectl wait --for=condition=available --timeout=300s deployment/$HELM_RELEASE_NAME-alertmanager -n monitoring
                
                # Affichage des URLs d'accès
                echo "🔍 Monitoring URLs:"
                NODE_IP=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}')
                echo "Prometheus:   http://$NODE_IP:30900"
                echo "Grafana:      http://$NODE_IP:30300 (admin/prom-operator)"
                echo "AlertManager: http://$NODE_IP:30903"
              '''
            } catch (Exception e) {
              echo "Erreur lors du déploiement du monitoring: ${e.getMessage()}"
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
              echo "=== Application Status ==="
              kubectl get deploy,svc,pods -n $KUBE_NAMESPACE
              
              echo "=== Monitoring Status ==="
              kubectl get deploy,svc,pods -n monitoring
              
              echo "=== Test Alert ==="
              kubectl create configmap test-alert -n monitoring --from-literal=test=test --dry-run=client -o yaml | kubectl apply -f -
              kubectl delete configmap test-alert -n monitoring
              
              NODE_IP=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}')
              echo "Application URL: http://$NODE_IP:$(kubectl get svc bibliotheque-auth-service -n $KUBE_NAMESPACE -o jsonpath='{.spec.ports[0].nodePort}')"
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
            echo "!!! Rollback Application !!!"
            kubectl rollout undo deployment/bibliotheque-auth -n $KUBE_NAMESPACE || true
            kubectl rollout status deployment/bibliotheque-auth -n $KUBE_NAMESPACE --timeout=120s || true
            
            echo "!!! Cleanup Monitoring !!!"
            helm uninstall $HELM_RELEASE_NAME -n monitoring || true
            kubectl delete configmap prometheus-authentification-config -n monitoring || true
            kubectl delete configmap grafana-authentification-dashboard -n monitoring || true
            kubectl delete configmap prometheus-custom-rules -n monitoring || true
          '''
        }
      }
    }
    always {
      sh 'docker logout $REGISTRY || true'
      echo "Pipeline execution completed with status: ${currentBuild.result}"
      slackSend(color: currentBuild.result == 'SUCCESS' ? 'good' : 'danger',
                message: "Build ${currentBuild.result}: ${env.JOB_NAME} #${env.BUILD_NUMBER}")
    }
  }
}
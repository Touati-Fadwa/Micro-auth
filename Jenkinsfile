pipeline {
  agent any

  environment {
    IMAGE_NAME = "touatifadwa/bibliotheque-microauth"
    IMAGE_TAG = "latest"
    REGISTRY = "docker.io"
    KUBE_NAMESPACE = "bibliotheque"
    HELM_RELEASE_NAME = "monitoring-stack"
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
              # Commande simplifiée avec le namespace directement spécifié
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
              # Display deployment information
              echo "=== Deployment Status ==="
              kubectl get deploy -n $KUBE_NAMESPACE
              
              echo "=== Service Details ==="
              kubectl get svc -n $KUBE_NAMESPACE
              
              echo "=== Pods Status ==="
              kubectl get pods -n $KUBE_NAMESPACE
              
              # Generate access URL
              echo "Application accessible via:"
              NODE_IP=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}')
              NODE_PORT=$(kubectl get svc bibliotheque-auth-service -n $KUBE_NAMESPACE -o jsonpath='{.spec.ports[0].nodePort}')
              echo "http://$NODE_IP:$NODE_PORT"
            '''
          }
        }
      }
    }

    stage('Setup Monitoring') {
      steps {
        script {
          withCredentials([file(credentialsId: 'K3S_CONFIG', variable: 'KUBECONFIG_FILE')]) {
            try {
              sh '''
                  # Création du namespace monitoring
                  kubectl create namespace monitoring --dry-run=client -o yaml | kubectl apply -f -
                  
                  echo "Installation de la stack Prometheus..."
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
                      --wait --timeout 5m

                  echo "🔍 LIENS MONITORING :"
                  NODE_IP=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}')
                  echo "Prometheus: http://$NODE_IP:30900"
                  echo "Grafana:    http://$NODE_IP:30300"
              '''
              
              // Configuration de Prometheus pour scraper l'API Gateway
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
              
              // Configuration du dashboard Grafana
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
      "title": "Tableau de bord API Gateway"
    }
"""
              
              writeFile file: 'prometheus-config.yaml', text: prometheusConfig
              writeFile file: 'grafana-dashboard.yaml', text: grafanaDashboard
              
              sh '''
                  # Application de la configuration
                  kubectl apply -f prometheus-config.yaml
                  kubectl apply -f grafana-dashboard.yaml
              '''
            } catch (Exception e) {
              echo "Échec de la configuration du monitoring: ${e.getMessage()}"
              currentBuild.result = 'UNSTABLE'
            }
          }
        }
      }
    }

    stage('Setup Alert Manager') {
      steps {
        script {
          withCredentials([
            file(credentialsId: 'K3S_CONFIG', variable: 'KUBECONFIG_FILE'),
            usernamePassword(
              credentialsId: 'gmail-credentials',
              usernameVariable: 'GMAIL_USER',
              passwordVariable: 'GMAIL_APP_PASSWORD' // Utilisation d'un mot de passe d'application
            )
          ]) {
            // Configuration Alertmanager avec gestion d'erreur
            try {
              def alertManagerConfig = """
apiVersion: v1
kind: ConfigMap
metadata:
  name: alertmanager-config
  namespace: monitoring
data:
  config.yml: |
    global:
      smtp_smarthost: 'smtp.gmail.com:587'
      smtp_from: '${env.GMAIL_USER}'
      smtp_auth_username: '${env.GMAIL_USER}'
      smtp_auth_password: '${env.GMAIL_APP_PASSWORD}'
      smtp_require_tls: true
    
    route:
      receiver: 'email-notifications'
      group_wait: 10s
      group_interval: 5m
      repeat_interval: 3h
    
    receivers:
    - name: 'email-notifications'
      email_configs:
      - to: '${env.GMAIL_USER}'
        send_resolved: true
        headers:
          Subject: '[Alert] {{ .CommonAnnotations.summary }}'

---
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
        image: prom/alertmanager:v0.25.0
        args:
          - '--config.file=/etc/alertmanager/config.yml'
          - '--storage.path=/alertmanager'
        ports:
        - containerPort: 9093
        volumeMounts:
        - name: config-volume
          mountPath: /etc/alertmanager
      volumes:
      - name: config-volume
        configMap:
          name: alertmanager-config

---
apiVersion: v1
kind: Service
metadata:
  name: alertmanager
  namespace: monitoring
spec:
  type: NodePort
  ports:
  - port: 9093
    targetPort: 9093
    nodePort: 30903
  selector:
    app: alertmanager

---
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: disk-usage-alert
  namespace: monitoring
spec:
  groups:
  - name: disk-usage
    rules:
    - alert: HighDiskUsage
      expr: 100 - (100 * node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"}) > 90
      for: 5m
      labels:
        severity: critical
      annotations:
        summary: "High disk usage on {{ $labels.instance }}"
        description: "Disk usage is {{ $value }}% on {{ $labels.instance }} (mountpoint {{ $labels.mountpoint }})"
"""

              writeFile file: 'alertmanager-config.yaml', text: alertManagerConfig
              
              sh '''
                # Appliquer la configuration Alertmanager
                kubectl apply -f alertmanager-config.yaml
                
                # Vérifier que la config est correcte
                kubectl -n monitoring get configmap alertmanager-config -o yaml
                
                # Configurer Prometheus pour utiliser Alertmanager
                kubectl -n monitoring patch prometheus kube-prometheus-stack-prometheus --type merge \
                  --patch '{"spec":{"alerting":{"alertmanagers":[{"name":"alertmanager","namespace":"monitoring","port":9093}]}}}'
                
                # Vérifier que la règle d'alerte est bien créée
                kubectl -n monitoring get prometheusrules disk-usage-alert -o yaml
                
                echo "Alertmanager accessible via:"
                NODE_IP=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}')
                echo "http://$NODE_IP:30903"
              '''
            } catch (Exception e) {
              echo "Erreur lors de la configuration de l'AlertManager: ${e.getMessage()}"
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
          try {
            sh '''
              # Rollback du déploiement
              kubectl -n $KUBE_NAMESPACE rollout undo deployment/bibliotheque-auth
              kubectl -n $KUBE_NAMESPACE rollout status deployment/bibliotheque-auth --timeout=300s
              
              # Nettoyage plus robuste du monitoring
              helm -n monitoring uninstall $HELM_RELEASE_NAME || true
              kubectl delete -n monitoring prometheusrules disk-usage-alert || true
              kubectl delete -n monitoring configmap alertmanager-config || true
              kubectl delete -n monitoring deployment alertmanager || true
              kubectl delete -n monitoring service alertmanager || true
              kubectl delete namespace monitoring --ignore-not-found=true
            '''
          } catch (Exception e) {
            echo "Échec partiel du rollback: ${e.getMessage()}"
          }
        }
      }
    }
    always {
      sh 'docker logout $REGISTRY || true'
      echo "Pipeline execution completed"
    }
  }
}
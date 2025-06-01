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
                  
                  # Installation de Helm si absent
                  if ! command -v helm &> /dev/null; then
                      echo "Installation de Helm..."
                      curl -fsSL -o get_helm.sh https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3
                      chmod 700 get_helm.sh
                      ./get_helm.sh
                  fi
                  
                  # Ajout du dépôt Helm Prometheus
                  helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
                  helm repo update
                  
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
                  
                  # Attente que les composants soient prêts
                  kubectl wait --for=condition=available deployment/$HELM_RELEASE_NAME-grafana -n monitoring --timeout=300s
                  kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=prometheus -n monitoring --timeout=300s
              '''
              
              // Configuration de Prometheus pour scraper l'API Gateway
              def prometheusConfig = """
apiVersion: v1
kind: ConfigMap
metadata:
  name: prometheus-api-gateway-config
  namespace: monitoring
data:
  prometheus-api-gateway.yml: |
    - job_name: 'api-gateway'
      scrape_interval: 15s
      static_configs:
        - targets: ['bibliotheque-api-gateway-service.bibliotheque.svc.cluster.local:3001']
      metrics_path: /metrics
"""
              
              // Configuration du dashboard Grafana
              def grafanaDashboard = """
apiVersion: v1
kind: ConfigMap
metadata:
  name: grafana-api-gateway-dashboard
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
                  
                  # Affichage des informations d'accès
                  echo "\n=== Accès au monitoring ==="
                  echo "URL Grafana: http://$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}'):30300"
                  echo "URL Prometheus: http://$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}'):30900"
                  
              '''
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
            
            echo "Nettoyage du monitoring..."
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
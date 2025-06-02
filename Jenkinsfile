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
      // Envoi d'un email d'alerte en cas d'échec
      mail to: 'ton.email@exemple.com',
           subject: "ALERTE: Échec du pipeline Jenkins - ${env.JOB_NAME} #${env.BUILD_NUMBER}",
           body: """\
Bonjour,

Le pipeline Jenkins '${env.JOB_NAME}' build #${env.BUILD_NUMBER} a échoué.

Merci de vérifier le job et corriger les erreurs.

Lien du job: ${env.BUILD_URL}

Cordialement,
Jenkins.
"""
    }
    always {
      sh 'docker logout $REGISTRY || true'
      echo "Pipeline execution completed"
    }
  }
}

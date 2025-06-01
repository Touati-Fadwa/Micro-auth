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
        sh "docker build -t ${IMAGE_NAME}:${IMAGE_TAG} -f ./Dockerfile ."
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
        withCredentials([file(credentialsId: 'K3S_CONFIG', variable: 'KUBECONFIG_FILE')]) {
          sh '''
            mkdir -p ~/.kube
            cp "$KUBECONFIG_FILE" ~/.kube/config
            chmod 600 ~/.kube/config
            kubectl create namespace $KUBE_NAMESPACE --dry-run=client -o yaml | kubectl apply -f -
          '''
        }
      }
    }

    stage('Deploy to K3s') {
      steps {
        withCredentials([file(credentialsId: 'K3S_CONFIG', variable: 'KUBECONFIG_FILE')]) {
          sh '''
            kubectl apply -f k8s/bibliotheque-auth-deployment.yaml -n bibliotheque
          '''
        }
      }
    }

    stage('Verify Deployment') {
      steps {
        withCredentials([file(credentialsId: 'K3S_CONFIG', variable: 'KUBECONFIG_FILE')]) {
          sh '''
            kubectl get deploy -n $KUBE_NAMESPACE
            kubectl get svc -n $KUBE_NAMESPACE
            kubectl get pods -n $KUBE_NAMESPACE

            NODE_IP=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}')
            NODE_PORT=$(kubectl get svc bibliotheque-auth-service -n $KUBE_NAMESPACE -o jsonpath='{.spec.ports[0].nodePort}')
            echo "Application accessible via: http://$NODE_IP:$NODE_PORT"
          '''
        }
      }
    }

    stage('Setup Monitoring') {
      steps {
        withCredentials([
          file(credentialsId: 'K3S_CONFIG', variable: 'KUBECONFIG_FILE'),
          string(credentialsId: 'alertmanager-smtp-pass', variable: 'SMTP_PASS')
        ]) {
          script {
            try {
              // Crée un Secret Kubernetes avec le mot de passe SMTP
              sh '''
                kubectl create namespace monitoring --dry-run=client -o yaml | kubectl apply -f -
                kubectl delete secret alertmanager-gmail-secret -n monitoring --ignore-not-found
                kubectl create secret generic alertmanager-gmail-secret \
                  --from-literal=smtp_auth_password="$SMTP_PASS" \
                  -n monitoring
              '''

              // Fichier de configuration Alertmanager avec variable d’environnement
              def alertmanagerConfig = '''
apiVersion: v1
kind: ConfigMap
metadata:
  name: alertmanager-config
  namespace: monitoring
  labels:
    alertmanager: "monitoring-stack-alertmanager"
data:
  alertmanager.yml: |
    global:
      smtp_smarthost: 'smtp.gmail.com:587'
      smtp_from: 'fadwatouati58@gmail.com'
      smtp_auth_username: 'fadwatouati58@gmail.com'
      smtp_auth_password: '${SMTP_PASS}'
      smtp_require_tls: true

    route:
      group_by: ['alertname']
      receiver: 'email-alert'

    receivers:
      - name: 'email-alert'
        email_configs:
          - to: 'fadwatouati58@gmail.com'
            send_resolved: true
              '''

              def prometheusConfig = '''
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
              '''

              def grafanaDashboard = '''
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
              '''

              writeFile file: 'alertmanager-config.yaml', text: alertmanagerConfig
              writeFile file: 'prometheus-config.yaml', text: prometheusConfig
              writeFile file: 'grafana-dashboard.yaml', text: grafanaDashboard

              sh '''
                helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
                helm repo update

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
                  --set alertmanager.service.nodePort=30400 \
                  --set alertmanager.alertmanagerSpec.env[0].name=SMTP_PASS \
                  --set alertmanager.alertmanagerSpec.env[0].valueFrom.secretKeyRef.name=alertmanager-gmail-secret \
                  --set alertmanager.alertmanagerSpec.env[0].valueFrom.secretKeyRef.key=smtp_auth_password \
                  --wait --timeout 5m

                kubectl apply -f alertmanager-config.yaml
                kubectl apply -f prometheus-config.yaml
                kubectl apply -f grafana-dashboard.yaml

                NODE_IP=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}')
                echo "🔍 Interfaces disponibles :"
                echo "Prometheus:    http://$NODE_IP:30900"
                echo "Grafana:       http://$NODE_IP:30300"
                echo "Alertmanager:  http://$NODE_IP:30400"
              '''
            } catch (Exception e) {
              echo "Erreur monitoring: ${e.getMessage()}"
              currentBuild.result = 'UNSTABLE'
            }
          }
        }
      }
    }
  }

  post {
    failure {
      withCredentials([file(credentialsId: 'K3S_CONFIG', variable: 'KUBECONFIG_FILE')]) {
        sh '''
          echo "!!! ECHEC: rollback du déploiement !!!"
          kubectl rollout undo deployment/bibliotheque-auth -n $KUBE_NAMESPACE || true
          kubectl rollout status deployment/bibliotheque-auth -n $KUBE_NAMESPACE || true
          helm uninstall $HELM_RELEASE_NAME -n monitoring || true
        '''
      }
    }
    always {
      sh 'docker logout $REGISTRY || true'
    }
  }
}

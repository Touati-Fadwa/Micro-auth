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
              // 📩 Configuration SMTP pour Alertmanager
              def alertmanagerConfig = """
alertmanager:
  config:
    global:
      smtp_smarthost: 'smtp.gmail.com:587'
      smtp_from: 'fadwatouati58@gmail.com'
      smtp_auth_username: 'fadwatouati58@gmail.com'
      smtp_auth_password: 'lkzz ztmf jooy npdf'  # 🔒 à sécuriser
      smtp_require_tls: true
    route:
      receiver: 'mail-alert'
      group_wait: 10s
      group_interval: 30s
      repeat_interval: 1h
    receivers:
      - name: 'mail-alert'
        email_configs:
          - to: 'tonemail@example.com'
            send_resolved: true
              """

              writeFile file: 'alertmanager-config.yaml', text: alertmanagerConfig

              sh '''
                kubectl create namespace monitoring --dry-run=client -o yaml | kubectl apply -f -
                echo "Installation de la stack Prometheus avec configuration Alertmanager..."
                helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
                helm repo update
                helm upgrade --install $HELM_RELEASE_NAME prometheus-community/kube-prometheus-stack \
                  --namespace monitoring \
                  --version 55.7.1 \
                  --values alertmanager-config.yaml \
                  --set kubeEtcd.enabled=false \
                  --set prometheus.service.type=NodePort \
                  --set prometheus.service.nodePort=30900 \
                  --set grafana.service.type=NodePort \
                  --set grafana.service.nodePort=30300 \
                  --wait --timeout 5m

                echo "🔍 LIENS MONITORING :"
                NODE_IP=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}')
                echo "Prometheus:     http://$NODE_IP:30900"
                echo "Grafana:        http://$NODE_IP:30300"
                echo "Alertmanager:   http://$NODE_IP:9093"
              '''

              // 🔔 Ajouter règle d’alerte
              def alertRules = """
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: pod-alerts
  namespace: monitoring
spec:
  groups:
    - name: pod-alerts
      rules:
        - alert: PodCrashLooping
          expr: rate(kube_pod_container_status_restarts_total[1m]) > 0.2
          for: 2m
          labels:
            severity: critical
          annotations:
            summary: "Pod en boucle de redémarrage"
            description: "Le pod {{ \$labels.pod }} dans le namespace {{ \$labels.namespace }} redémarre trop souvent."
              """
              writeFile file: 'alert-rules.yaml', text: alertRules
              sh 'kubectl apply -f alert-rules.yaml'

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
    }
    always {
      sh 'docker logout $REGISTRY || true'
      echo "Pipeline execution completed"
    }
  }
}

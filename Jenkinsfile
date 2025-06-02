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
                 
                  echo "Installation de la stack Prometheus avec AlertManager..."
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
                      --set alertmanager.enabled=true \
                      --set alertmanager.service.type=NodePort \
                      --set alertmanager.service.nodePort=30903 \
                      --wait --timeout 5m

                  echo "🔍 LIENS MONITORING :"
                  NODE_IP=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}')
                  echo "Prometheus:   http://$NODE_IP:30900"
                  echo "Grafana:      http://$NODE_IP:30300"
                  echo "AlertManager: http://$NODE_IP:30903"
              '''
             
              // Configuration AlertManager simple pour infrastructure cluster
              def alertmanagerConfig = """
apiVersion: v1
kind: Secret
metadata:
  name: alertmanager-config
  namespace: monitoring
type: Opaque
stringData:
  alertmanager.yml: |
    global:
      smtp_smarthost: 'smtp.gmail.com:587'
      smtp_from: 'fadwatouati58@gmail.com'
      smtp_auth_username: 'fadwatouati58@gmail.com'
      smtp_auth_password: 'lkzz ztmf jooy npdf'
      smtp_require_tls: true

    route:
      group_by: ['alertname']
      group_wait: 10s
      group_interval: 10s
      repeat_interval: 30m
      receiver: 'cluster-alerts'

    receivers:
    - name: 'cluster-alerts'
      email_configs:
      - to: 'fadwatouati58@gmail.com'
        subject: '🚨 [CLUSTER] BiblioTech Infrastructure Alert: {{ .GroupLabels.alertname }}'
        body: |
          �️ ALERTE INFRASTRUCTURE CLUSTER BIBLIOTECH
         
          {{ range .Alerts }}
          🔴 Alert: {{ .Annotations.summary }}
          📝 Description: {{ .Annotations.description }}
          ⚠️ Severity: {{ .Labels.severity }}
          🖥️ Instance: {{ .Labels.instance }}
          📅 Début: {{ .StartsAt }}
          {{ if .EndsAt }}✅ Fin: {{ .EndsAt }}{{ end }}
          {{ end }}
         
          🔗 Liens de monitoring:
          - Grafana: http://NODE_IP:30300
          - Prometheus: http://NODE_IP:30900
          - AlertManager: http://NODE_IP:30903
"""

              // Règles d'alertes simplifiées pour infrastructure cluster
              def alertRules = """
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: cluster-infrastructure-alerts
  namespace: monitoring
  labels:
    app: prometheus
    release: $HELM_RELEASE_NAME
spec:
  groups:
  - name: cluster-infrastructure
    rules:
    # Nœud cluster down
    - alert: ClusterNodeDown
      expr: up{job="node-exporter"} == 0
      for: 1m
      labels:
        severity: critical
      annotations:
        summary: "Nœud cluster indisponible"
        description: "Le nœud {{ \$labels.instance }} est down depuis plus d'1 minute"

    # CPU élevé
    - alert: HighCPUUsage
      expr: 100 - (avg by(instance) (irate(node_cpu_seconds_total{mode="idle"}[5m])) * 100) > 85
      for: 5m
      labels:
        severity: warning
      annotations:
        summary: "Utilisation CPU élevée"
        description: "CPU du nœud {{ \$labels.instance }} à {{ \$value }}%"

    # Mémoire élevée
    - alert: HighMemoryUsage
      expr: (1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100 > 90
      for: 5m
      labels:
        severity: warning
      annotations:
        summary: "Utilisation mémoire élevée"
        description: "Mémoire du nœud {{ \$labels.instance }} à {{ \$value }}%"

    # Espace disque faible
    - alert: LowDiskSpace
      expr: (1 - (node_filesystem_avail_bytes{fstype!="tmpfs"} / node_filesystem_size_bytes{fstype!="tmpfs"})) * 100 > 90
      for: 5m
      labels:
        severity: critical
      annotations:
        summary: "Espace disque critique"
        description: "Disque {{ \$labels.mountpoint }} sur {{ \$labels.instance }} à {{ \$value }}%"

    # Pod en crash loop
    - alert: PodCrashLooping
      expr: rate(kube_pod_container_status_restarts_total[15m]) > 0
      for: 5m
      labels:
        severity: warning
      annotations:
        summary: "Pod en crash loop"
        description: "Pod {{ \$labels.pod }} dans {{ \$labels.namespace }} redémarre fréquemment"

    # Service BiblioTech down
    - alert: BiblioTechServiceDown
      expr: up{job=~"bibliotheque.*"} == 0
      for: 2m
      labels:
        severity: critical
      annotations:
        summary: "Service BiblioTech indisponible"
        description: "Le service {{ \$labels.job }} est down depuis plus de 2 minutes"
"""

              writeFile file: 'alertmanager-config.yaml', text: alertmanagerConfig
              writeFile file: 'alert-rules.yaml', text: alertRules
             
              sh '''
                  # Application de la configuration AlertManager
                  kubectl apply -f alertmanager-config.yaml
                  kubectl apply -f alert-rules.yaml
                 
                  # Redémarrage d'AlertManager pour prendre en compte la config
                  kubectl rollout restart statefulset/alertmanager-monitoring-stack-kube-prom-alertmanager -n monitoring
                 
                  # Attendre que AlertManager soit prêt
                  kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=alertmanager -n monitoring --timeout=120s
                 
                  echo "✅ AlertManager configuré avec notifications email simples"
                  echo "📧 Email configuré: fadwatouati58@gmail.com"
                  echo "🔔 Règles d'alertes infrastructure appliquées"
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
    }
    always {
      sh 'docker logout $REGISTRY || true'
      echo "Pipeline execution completed"
    }
  }
}
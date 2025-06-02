pipeline {
  agent {
    kubernetes {
      yamlFile 'pod.yaml'
    }
  }
 
  parameters {
    string(name: 'IMAGE_TAG', defaultValue: 'latest', description: 'Tag de l\'image Docker')
    string(name: 'NODE_PORT', defaultValue: '30001', description: 'NodePort pour accéder au service')
    string(name: 'BRANCH_NAME', defaultValue: 'main', description: 'Nom de la branche Git')
  }
 
  environment {
    REGISTRY = 'bibliotheque.azurecr.io'
    IMAGE_NAME = 'bibliotheque-auth'
    KUBE_NAMESPACE = 'bibliotheque'
    HELM_RELEASE_NAME = 'monitoring-stack'
  }
 
  stages {
    stage('Checkout Code') {
      steps {
        git branch: "${BRANCH_NAME}", credentialsId: 'GITHUB_CREDENTIALS', url: 'https://github.com/WildCodeSchool/bibliotheque-auth.git'
      }
    }
   
    stage('Build and Push Docker Image') {
      steps {
        sh 'echo "$DOCKER_CONFIG"'
        withCredentials([usernamePassword(credentialsId: 'AZURE_REGISTRY_CREDENTIALS', passwordVariable: 'REGISTRY_PASSWORD', usernameVariable: 'REGISTRY_USERNAME')]) {
          sh '''
            docker login $REGISTRY -u $REGISTRY_USERNAME -p $REGISTRY_PASSWORD
            docker build -t $REGISTRY/$IMAGE_NAME:$IMAGE_TAG .
            docker push $REGISTRY/$IMAGE_NAME:$IMAGE_TAG
          '''
        }
      }
    }
   
    stage('Deploy to Kubernetes') {
      steps {
        script {
          withCredentials([file(credentialsId: 'K3S_CONFIG', variable: 'KUBECONFIG_FILE')]) {
            try {
              sh '''
                echo "Mise à jour du déploiement Kubernetes..."
               
                # Mise à jour de l'image dans le déploiement
                kubectl set image deployment/bibliotheque-auth bibliotheque-auth=$REGISTRY/$IMAGE_NAME:$IMAGE_TAG -n $KUBE_NAMESPACE
               
                # Redémarrage du déploiement pour appliquer les changements
                kubectl rollout restart deployment/bibliotheque-auth -n $KUBE_NAMESPACE
               
                # Vérification du statut du déploiement
                kubectl rollout status deployment/bibliotheque-auth -n $KUBE_NAMESPACE --timeout=120s
               
                echo "✅ Déploiement mis à jour avec succès"
               
                NODE_IP=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}')
                echo "Application disponible sur: http://$NODE_IP:$NODE_PORT"
              '''
            } catch (Exception e) {
              echo "Échec du déploiement: ${e.getMessage()}"
              currentBuild.result = 'UNSTABLE'
            }
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
             
              // Configuration AlertManager étendue pour tout le cluster
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
      smtp_auth_password: 'lkzz ztmf jooy npdf '
      smtp_require_tls: true

    route:
      group_by: ['alertname', 'cluster', 'component']
      group_wait: 10s
      group_interval: 10s
      repeat_interval: 1h
      receiver: 'default-alerts'
      routes:
      - match:
          severity: critical
        receiver: 'critical-alerts'
      - match:
          component: cluster
        receiver: 'infrastructure-alerts'
      - match:
          component: microservice
        receiver: 'application-alerts'
      - match:
          component: database
        receiver: 'database-alerts'
      - match:
          component: security
        receiver: 'security-alerts'

    receivers:
    - name: 'default-alerts'
      email_configs:
      - to: 'admin@bibliotheque.tn'
        subject: '[BiblioTech] Alert: {{ .GroupLabels.alertname }}'
        body: |
          {{ range .Alerts }}
          Alert: {{ .Annotations.summary }}
          Description: {{ .Annotations.description }}
          Severity: {{ .Labels.severity }}
          Component: {{ .Labels.component }}
          Instance: {{ .Labels.instance }}
          Time: {{ .StartsAt }}
          {{ end }}

    - name: 'critical-alerts'
      email_configs:
      - to: 'admin@bibliotheque.tn, devops@bibliotheque.tn, sre@bibliotheque.tn'
        subject: '🚨 [CRITICAL] BiblioTech Cluster Alert: {{ .GroupLabels.alertname }}'
        body: |
          🚨 ALERTE CRITIQUE CLUSTER BIBLIOTECH 🚨
         
          {{ range .Alerts }}
          Component: {{ .Labels.component }}
          Service: {{ .Labels.job }}
          Alert: {{ .Annotations.summary }}
          Description: {{ .Annotations.description }}
          Severity: {{ .Labels.severity }}
          Instance: {{ .Labels.instance }}
          Namespace: {{ .Labels.namespace }}
          Début: {{ .StartsAt }}
          {{ if .EndsAt }}Fin: {{ .EndsAt }}{{ end }}
         
          🔗 Liens utiles:
          - Grafana: http://NODE_IP:30300
          - Prometheus: http://NODE_IP:30900
          - AlertManager: http://NODE_IP:30903
          {{ end }}

    - name: 'infrastructure-alerts'
      email_configs:
      - to: 'infrastructure@bibliotheque.tn, admin@bibliotheque.tn'
        subject: '🏗️ [INFRA] BiblioTech Infrastructure Alert: {{ .GroupLabels.alertname }}'
        body: |
          🏗️ Alerte Infrastructure Cluster
         
          {{ range .Alerts }}
          Type: {{ .Labels.component }}
          Alert: {{ .Annotations.summary }}
          Description: {{ .Annotations.description }}
          Node: {{ .Labels.instance }}
          Début: {{ .StartsAt }}
          {{ end }}

    - name: 'application-alerts'
      email_configs:
      - to: 'dev@bibliotheque.tn, admin@bibliotheque.tn'
        subject: '📱 [APP] BiblioTech Application Alert: {{ .GroupLabels.alertname }}'
        body: |
          📱 Alerte Application BiblioTech
         
          {{ range .Alerts }}
          Service: {{ .Labels.job }}
          Alert: {{ .Annotations.summary }}
          Description: {{ .Annotations.description }}
          Namespace: {{ .Labels.namespace }}
          Pod: {{ .Labels.pod }}
          Début: {{ .StartsAt }}
          {{ end }}

    - name: 'database-alerts'
      email_configs:
      - to: 'dba@bibliotheque.tn, admin@bibliotheque.tn'
        subject: '🗄️ [DATABASE] BiblioTech Database Alert: {{ .GroupLabels.alertname }}'
        body: |
          🗄️ Alerte Base de Données
         
          {{ range .Alerts }}
          Database: {{ .Labels.job }}
          Alert: {{ .Annotations.summary }}
          Description: {{ .Annotations.description }}
          Instance: {{ .Labels.instance }}
          Début: {{ .StartsAt }}
          {{ end }}

    - name: 'security-alerts'
      email_configs:
      - to: 'security@bibliotheque.tn, admin@bibliotheque.tn'
        subject: '🔒 [SECURITY] BiblioTech Security Alert: {{ .GroupLabels.alertname }}'
        body: |
          🔒 ALERTE SÉCURITÉ DÉTECTÉE
         
          {{ range .Alerts }}
          Type: {{ .Labels.component }}
          Alert: {{ .Annotations.summary }}
          Description: {{ .Annotations.description }}
          Source: {{ .Labels.instance }}
          Début: {{ .StartsAt }}
         
          ⚠️ Action immédiate requise
          {{ end }}

    inhibit_rules:
    - source_match:
        severity: 'critical'
      target_match:
        severity: 'warning'
      equal: ['alertname', 'cluster', 'component']
"""

              // Règles d'alertes pour tout le cluster BiblioTech
              def alertRules = """
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: bibliotheque-cluster-alerts
  namespace: monitoring
  labels:
    app: prometheus
    release: $HELM_RELEASE_NAME
spec:
  groups:
  # ===== ALERTES CLUSTER GÉNÉRAL =====
  - name: cluster.rules
    rules:
    - alert: ClusterNodeDown
      expr: up{job="node-exporter"} == 0
      for: 1m
      labels:
        severity: critical
        component: cluster
      annotations:
        summary: "Nœud cluster indisponible"
        description: "Le nœud {{ \$labels.instance }} est down depuis plus d'1 minute"

    - alert: ClusterHighCPUUsage
      expr: 100 - (avg by(instance) (irate(node_cpu_seconds_total{mode="idle"}[5m])) * 100) > 80
      for: 5m
      labels:
        severity: warning
        component: cluster
      annotations:
        summary: "Utilisation CPU cluster élevée"
        description: "CPU du nœud {{ \$labels.instance }} à {{ \$value }}%"

    - alert: ClusterHighMemoryUsage
      expr: (1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100 > 85
      for: 5m
      labels:
        severity: warning
        component: cluster
      annotations:
        summary: "Utilisation mémoire cluster élevée"
        description: "Mémoire du nœud {{ \$labels.instance }} à {{ \$value }}%"

    - alert: ClusterDiskSpaceLow
      expr: (1 - (node_filesystem_avail_bytes{fstype!="tmpfs"} / node_filesystem_size_bytes{fstype!="tmpfs"})) * 100 > 85
      for: 5m
      labels:
        severity: warning
        component: cluster
      annotations:
        summary: "Espace disque faible"
        description: "Disque {{ \$labels.mountpoint }} sur {{ \$labels.instance }} à {{ \$value }}%"

  # ===== ALERTES PODS ET DEPLOYMENTS =====
  - name: pods.rules
    rules:
    - alert: PodCrashLooping
      expr: rate(kube_pod_container_status_restarts_total[15m]) > 0
      for: 5m
      labels:
        severity: warning
        component: pods
      annotations:
        summary: "Pod en crash loop"
        description: "Pod {{ \$labels.pod }} dans {{ \$labels.namespace }} redémarre fréquemment"

    - alert: PodNotReady
      expr: kube_pod_status_ready{condition="false"} == 1
      for: 10m
      labels:
        severity: warning
        component: pods
      annotations:
        summary: "Pod non prêt"
        description: "Pod {{ \$labels.pod }} dans {{ \$labels.namespace }} n'est pas prêt depuis 10min"

    - alert: DeploymentReplicasMismatch
      expr: kube_deployment_spec_replicas != kube_deployment_status_available_replicas
      for: 5m
      labels:
        severity: warning
        component: deployments
      annotations:
        summary: "Réplicas deployment non conformes"
        description: "Deployment {{ \$labels.deployment }} dans {{ \$labels.namespace }} : {{ \$value }} réplicas manquantes"

  # ===== ALERTES MICROSERVICES BIBLIOTECH =====
  - name: bibliotheque-services.rules
    rules:
    - alert: BiblioTechServiceDown
      expr: up{job=~"auth|books|borrowings|api-gateway"} == 0
      for: 1m
      labels:
        severity: critical
        component: microservice
      annotations:
        summary: "Service BiblioTech indisponible"
        description: "Le service {{ \$labels.job }} est down depuis plus d'1 minute"

    - alert: BiblioTechHighErrorRate
      expr: rate(http_requests_total{job=~"auth|books|borrowings|api-gateway",status=~"5.."}[5m]) > 0.1
      for: 2m
      labels:
        severity: warning
        component: microservice
      annotations:
        summary: "Taux d'erreur élevé - {{ \$labels.job }}"
        description: "Service {{ \$labels.job }} : {{ \$value }} erreurs/sec"

    - alert: BiblioTechHighLatency
      expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket{job=~"auth|books|borrowings|api-gateway"}[5m])) > 2
      for: 5m
      labels:
        severity: warning
        component: microservice
      annotations:
        summary: "Latence élevée - {{ \$labels.job }}"
        description: "Service {{ \$labels.job }} : 95% des requêtes > 2s"

    - alert: BiblioTechDatabaseConnectionFailed
      expr: up{job=~"postgres|mysql"} == 0
      for: 1m
      labels:
        severity: critical
        component: database
      annotations:
        summary: "Base de données indisponible"
        description: "Connexion à la base {{ \$labels.job }} échouée"

  # ===== ALERTES RÉSEAU =====
  - name: network.rules
    rules:
    - alert: HighNetworkTraffic
      expr: rate(node_network_receive_bytes_total[5m]) > 100000000
      for: 5m
      labels:
        severity: warning
        component: network
      annotations:
        summary: "Trafic réseau élevé"
        description: "Interface {{ \$labels.device }} sur {{ \$labels.instance }} : {{ \$value }} bytes/sec"

    - alert: ServiceEndpointDown
      expr: up{job="kubernetes-service-endpoints"} == 0
      for: 2m
      labels:
        severity: warning
        component: network
      annotations:
        summary: "Endpoint de service indisponible"
        description: "Endpoint {{ \$labels.instance }} du service {{ \$labels.kubernetes_name }} est down"

  # ===== ALERTES STOCKAGE =====
  - name: storage.rules
    rules:
    - alert: PersistentVolumeClaimPending
      expr: kube_persistentvolumeclaim_status_phase{phase="Pending"} == 1
      for: 5m
      labels:
        severity: warning
        component: storage
      annotations:
        summary: "PVC en attente"
        description: "PVC {{ \$labels.persistentvolumeclaim }} dans {{ \$labels.namespace }} en attente depuis 5min"

    - alert: PersistentVolumeFull
      expr: (kubelet_volume_stats_used_bytes / kubelet_volume_stats_capacity_bytes) * 100 > 90
      for: 5m
      labels:
        severity: critical
        component: storage
      annotations:
        summary: "Volume persistant plein"
        description: "Volume {{ \$labels.persistentvolumeclaim }} à {{ \$value }}% de capacité"

  # ===== ALERTES SÉCURITÉ =====
  - name: security.rules
    rules:
    - alert: UnauthorizedAPIAccess
      expr: rate(apiserver_audit_total{verb!~"get|list|watch"}[5m]) > 10
      for: 2m
      labels:
        severity: warning
        component: security
      annotations:
        summary: "Accès API non autorisé détecté"
        description: "Tentatives d'accès API suspectes : {{ \$value }} req/sec"

    - alert: PodSecurityPolicyViolation
      expr: increase(pod_security_policy_violations_total[5m]) > 0
      for: 1m
      labels:
        severity: warning
        component: security
      annotations:
        summary: "Violation de politique de sécurité"
        description: "{{ \$value }} violations de sécurité détectées"
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
                 
                  echo "✅ AlertManager configuré avec notifications email"
                  echo "📧 Emails configurés pour: admin@bibliotheque.tn, devops@bibliotheque.tn"
                  echo "🔔 Règles d'alertes appliquées pour le service auth"
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
           
            echo "Nettoyage du monitoring et AlertManager..."
            kubectl delete secret alertmanager-config -n monitoring --ignore-not-found=true || true
            kubectl delete prometheusrule bibliotheque-auth-alerts -n monitoring --ignore-not-found=true || true
            helm uninstall $HELM_RELEASE_NAME -n monitoring || true
            kubectl delete namespace monitoring --ignore-not-found=true || true
          '''
        }
       
        // Envoi d'email de notification d'échec
        emailext (
          subject: "🚨 [ÉCHEC] Déploiement BiblioTech Auth - Build #${env.BUILD_NUMBER}",
          body: """
          Le déploiement du microservice d'authentification a échoué.
         
          Détails:
          - Projet: ${env.JOB_NAME}
          - Build: #${env.BUILD_NUMBER}
          - Branche: ${env.BRANCH_NAME}
          - Commit: ${env.GIT_COMMIT}
         
          Logs: ${env.BUILD_URL}console
         
          Un rollback automatique a été effectué.
          """,
          to: "admin@bibliotheque.tn, devops@bibliotheque.tn"
        )
      }
    }
    success {
      // Envoi d'email de notification de succès
      emailext (
        subject: "✅ [SUCCÈS] Déploiement BiblioTech Auth - Build #${env.BUILD_NUMBER}",
        body: """
        Le déploiement du microservice d'authentification s'est terminé avec succès.
       
        Détails:
        - Projet: ${env.JOB_NAME}
        - Build: #${env.BUILD_NUMBER}
        - Branche: ${env.BRANCH_NAME}
        - Image: ${env.IMAGE_NAME}:${env.IMAGE_TAG}
       
        Services disponibles:
        - Application: http://NODE_IP:NODE_PORT
        - Prometheus: http://NODE_IP:30900
        - Grafana: http://NODE_IP:30300
        - AlertManager: http://NODE_IP:30903
       
        Monitoring et alertes email configurés.
        """,
        to: "admin@bibliotheque.tn"
      )
    }
    always {
      sh 'docker logout $REGISTRY || true'
      echo "Pipeline execution completed"
    }
  }
}

pipeline {
    agent any
    environment {
        IMAGE_NAME = "touatifadwa/bibliotheque-microauth"
        IMAGE_TAG = "latest"
        REGISTRY = "docker.io"
        KUBE_NAMESPACE = "bibliotheque"
        HELM_RELEASE_NAME = "monitoring-stack"
        ALERTMANAGER_PORT = "30903"
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

        stage('Setup Monitoring Stack') {
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
                            echo "Grafana: http://$NODE_IP:30300"
                            '''
                        } catch (Exception e) {
                            echo "Échec de la configuration du monitoring: ${e.getMessage()}"
                            currentBuild.result = 'UNSTABLE'
                        }
                    }
                }
            }
        }

        stage('Deploy AlertManager') {
            steps {
                script {
                    withCredentials([
                        file(credentialsId: 'K3S_CONFIG', variable: 'KUBECONFIG_FILE'),
                        usernamePassword(
                            credentialsId: 'smtp-credentials',
                            usernameVariable: 'SMTP_USER',
                            passwordVariable: 'SMTP_PASSWORD'
                        )
                    ]) {
                        try {
                            sh '''
                            # Créer la configuration AlertManager
                            cat <<EOF > alertmanager-config.yml
                            global:
                              smtp_from: '$SMTP_USER'
                              smtp_smarthost: 'smtp.gmail.com:587'
                              smtp_auth_username: '$SMTP_USER'
                              smtp_auth_password: '$SMTP_PASSWORD'
                              smtp_require_tls: true
                            
                            route:
                              group_by: ['alertname']
                              group_wait: 30s
                              group_interval: 5m
                              repeat_interval: 3h
                              receiver: 'email-notifications'
                            
                            receivers:
                            - name: 'email-notifications'
                              email_configs:
                              - to: '$SMTP_USER'
                                send_resolved: true
                            EOF

                            # Créer le secret de configuration
                            kubectl -n monitoring create secret generic alertmanager-config \
                                --from-file=alertmanager.yml=alertmanager-config.yml \
                                --dry-run=client -o yaml | kubectl apply -f -

                            # Déployer AlertManager
                            kubectl apply -n monitoring -f - <<EOF
                            apiVersion: apps/v1
                            kind: Deployment
                            metadata:
                              name: alertmanager
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
                                  securityContext:
                                    runAsUser: 1000
                                    runAsGroup: 1000
                                    fsGroup: 2000
                                  containers:
                                  - name: alertmanager
                                    image: quay.io/prometheus/alertmanager:v0.27.0
                                    args:
                                    - '--config.file=/etc/alertmanager/alertmanager.yml'
                                    - '--storage.path=/alertmanager'
                                    ports:
                                    - containerPort: 9093
                                      name: http
                                    volumeMounts:
                                    - name: config
                                      mountPath: /etc/alertmanager
                                    - name: storage
                                      mountPath: /alertmanager
                                    resources:
                                      requests:
                                        cpu: "100m"
                                        memory: "256Mi"
                                      limits:
                                        cpu: "500m"
                                        memory: "512Mi"
                                    livenessProbe:
                                      httpGet:
                                        path: /-/healthy
                                        port: http
                                      initialDelaySeconds: 10
                                      periodSeconds: 10
                                    readinessProbe:
                                      httpGet:
                                        path: /-/ready
                                        port: http
                                      initialDelaySeconds: 10
                                      periodSeconds: 5
                                  volumes:
                                  - name: config
                                    secret:
                                      secretName: alertmanager-config
                                  - name: storage
                                    emptyDir: {}
                            EOF

                            # Créer le Service
                            kubectl apply -n monitoring -f - <<EOF
                            apiVersion: v1
                            kind: Service
                            metadata:
                              name: alertmanager
                            spec:
                              type: NodePort
                              ports:
                              - port: 9093
                                targetPort: http
                                nodePort: $ALERTMANAGER_PORT
                              selector:
                                app: alertmanager
                            EOF

                            # Configurer Prometheus pour utiliser AlertManager
                            kubectl apply -n monitoring -f - <<EOF
                            apiVersion: v1
                            kind: ConfigMap
                            metadata:
                              name: prometheus-alertmanager-config
                            data:
                              prometheus.yml: |
                                global:
                                  scrape_interval: 15s
                                  evaluation_interval: 15s
                                
                                alerting:
                                  alertmanagers:
                                  - static_configs:
                                    - targets:
                                      - alertmanager.monitoring.svc.cluster.local:9093
                                
                                rule_files:
                                  - /etc/prometheus/rules/*.rules
                                
                                scrape_configs:
                                  - job_name: 'prometheus'
                                    static_configs:
                                    - targets: ['localhost:9090']
                            EOF

                            # Redémarrer Prometheus pour appliquer les changements
                            kubectl rollout restart statefulset prometheus-$HELM_RELEASE_NAME -n monitoring

                            echo "🔔 ALERTMANAGER ACCESS:"
                            NODE_IP=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}')
                            echo "AlertManager UI: http://$NODE_IP:$ALERTMANAGER_PORT"
                            '''
                        } catch (Exception e) {
                            echo "Échec du déploiement d'AlertManager: ${e.getMessage()}"
                            currentBuild.result = 'UNSTABLE'
                        }
                    }
                }
            }
        }

        stage('Configure Alerts') {
            steps {
                script {
                    withCredentials([file(credentialsId: 'K3S_CONFIG', variable: 'KUBECONFIG_FILE')]) {
                        try {
                            sh '''
                            # Créer des règles d'alerte de base
                            kubectl apply -n monitoring -f - <<EOF
                            apiVersion: monitoring.coreos.com/v1
                            kind: PrometheusRule
                            metadata:
                              name: basic-alerts
                              labels:
                                prometheus: $HELM_RELEASE_NAME
                                role: alert-rules
                            spec:
                              groups:
                              - name: general.rules
                                rules:
                                - alert: HighPodMemoryUsage
                                  expr: sum(container_memory_working_set_bytes{namespace!="",container!=""}) by (namespace,pod,container) / sum(container_spec_memory_limit_bytes{namespace!="",container!=""}) by (namespace,pod,container) > 0.8
                                  for: 5m
                                  labels:
                                    severity: warning
                                  annotations:
                                    summary: "High memory usage on pod {{ $labels.pod }}"
                                    description: "Pod {{ $labels.pod }} in namespace {{ $labels.namespace }} is using {{ printf \"%.2f\" $value }}% of its memory limit."
                                
                                - alert: HighCPUUsage
                                  expr: sum(rate(container_cpu_usage_seconds_total{namespace!="",container!=""}[5m])) by (namespace,pod,container) / sum(container_spec_cpu_quota{namespace!="",container!=""}/container_spec_cpu_period{namespace!="",container!=""}) by (namespace,pod,container) > 0.8
                                  for: 5m
                                  labels:
                                    severity: warning
                                  annotations:
                                    summary: "High CPU usage on pod {{ $labels.pod }}"
                                    description: "Pod {{ $labels.pod }} in namespace {{ $labels.namespace }} is using {{ printf \"%.2f\" $value }}% of its CPU limit."
                            EOF
                            '''
                        } catch (Exception e) {
                            echo "Échec de la configuration des alertes: ${e.getMessage()}"
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
                    kubectl delete deployment alertmanager -n monitoring --ignore-not-found=true || true
                    kubectl delete service alertmanager -n monitoring --ignore-not-found=true || true
                    kubectl delete secret alertmanager-config -n monitoring --ignore-not-found=true || true
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
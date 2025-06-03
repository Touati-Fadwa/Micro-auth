pipeline {
    agent any
    environment {
        IMAGE_NAME = "touatifadwa/bibliotheque-microauth"
        IMAGE_TAG = "latest"
        REGISTRY = "docker.io"
        KUBE_NAMESPACE = "bibliotheque"
        HELM_RELEASE_NAME = "monitoring-stack"
        ALERTMANAGER_PORT = "30903"
        PROMETHEUS_PORT = "30900"
        GRAFANA_PORT = "30300"
        DOCKER_CREDENTIALS_ID = "docker-hub-credentials"
        K3S_CONFIG_ID = "K3S_CONFIG"
        SMTP_CREDENTIALS_ID = "smtp-credentials"
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
                    credentialsId: env.DOCKER_CREDENTIALS_ID,
                    usernameVariable: 'DOCKER_USER',
                    passwordVariable: 'DOCKER_PASS'
                )]) {
                    sh """
                    echo "\$DOCKER_PASS" | docker login -u "\$DOCKER_USER" --password-stdin ${REGISTRY}
                    docker push ${IMAGE_NAME}:${IMAGE_TAG}
                    """
                }
            }
        }

        stage('Configure K3s Access') {
            steps {
                script {
                    withCredentials([file(credentialsId: env.K3S_CONFIG_ID, variable: 'KUBECONFIG_FILE')]) {
                        sh """
                        mkdir -p ~/.kube
                        cp "\$KUBECONFIG_FILE" ~/.kube/config
                        chmod 600 ~/.kube/config

                        kubectl get nodes
                        kubectl cluster-info

                        kubectl create namespace ${KUBE_NAMESPACE} --dry-run=client -o yaml | kubectl apply -f -
                        """
                    }
                }
            }
        }

        stage('Deploy to K3s') {
            steps {
                script {
                    withCredentials([file(credentialsId: env.K3S_CONFIG_ID, variable: 'KUBECONFIG_FILE')]) {
                        sh """
                        kubectl apply -f k8s/bibliotheque-auth-deployment.yaml -n ${KUBE_NAMESPACE}
                        """
                    }
                }
            }
        }

        stage('Verify Deployment') {
            steps {
                script {
                    withCredentials([file(credentialsId: env.K3S_CONFIG_ID, variable: 'KUBECONFIG_FILE')]) {
                        sh """
                        echo "=== Deployment Status ==="
                        kubectl get deploy -n ${KUBE_NAMESPACE}

                        echo "=== Service Details ==="
                        kubectl get svc -n ${KUBE_NAMESPACE}

                        echo "=== Pods Status ==="
                        kubectl get pods -n ${KUBE_NAMESPACE}

                        echo "Application accessible via:"
                        NODE_IP=\$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}')
                        NODE_PORT=\$(kubectl get svc bibliotheque-auth-service -n ${KUBE_NAMESPACE} -o jsonpath='{.spec.ports[0].nodePort}')
                        echo "http://\${NODE_IP}:\${NODE_PORT}"
                        """
                    }
                }
            }
        }

        stage('Clean Existing Monitoring') {
            steps {
                script {
                    withCredentials([file(credentialsId: env.K3S_CONFIG_ID, variable: 'KUBECONFIG_FILE')]) {
                        sh """
                        echo "Cleaning existing monitoring resources..."
                        helm uninstall ${HELM_RELEASE_NAME} -n monitoring --ignore-not-found || true
                        kubectl delete svc monitoring-stack-kube-prom-alertmanager -n monitoring --ignore-not-found || true
                        kubectl delete svc alertmanager -n monitoring --ignore-not-found || true
                        kubectl delete ns monitoring --ignore-not-found || true
                        """
                    }
                }
            }
        }

        stage('Setup Monitoring Stack') {
            steps {
                script {
                    withCredentials([file(credentialsId: env.K3S_CONFIG_ID, variable: 'KUBECONFIG_FILE')]) {
                        try {
                            sh """
                            kubectl create namespace monitoring --dry-run=client -o yaml | kubectl apply -f -

                            # Installation avec configuration intégrée
                            helm upgrade --install ${HELM_RELEASE_NAME} prometheus-community/kube-prometheus-stack \
                            --namespace monitoring \
                            --version 55.7.1 \
                            --set kubeEtcd.enabled=false \
                            --set alertmanager.enabled=true \
                            --set alertmanager.service.type=NodePort \
                            --set alertmanager.service.nodePort=${ALERTMANAGER_PORT} \
                            --set prometheus.prometheusSpec.serviceMonitorSelectorNilUsesHelmValues=false \
                            --set prometheus.service.type=NodePort \
                            --set prometheus.service.nodePort=${PROMETHEUS_PORT} \
                            --set grafana.service.type=NodePort \
                            --set grafana.service.nodePort=${GRAFANA_PORT} \
                            --wait --timeout 5m

                            echo "🔍 Monitoring Links:"
                            NODE_IP=\$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}')
                            echo "Prometheus: http://\${NODE_IP}:${PROMETHEUS_PORT}"
                            echo "AlertManager: http://\${NODE_IP}:${ALERTMANAGER_PORT}"
                            echo "Grafana: http://\${NODE_IP}:${GRAFANA_PORT}"
                            """
                        } catch (Exception e) {
                            echo "Monitoring setup failed: ${e.getMessage()}"
                            currentBuild.result = 'UNSTABLE'
                        }
                    }
                }
            }
        }

        stage('Configure AlertManager') {
            steps {
                script {
                    withCredentials([
                        file(credentialsId: env.K3S_CONFIG_ID, variable: 'KUBECONFIG_FILE'),
                        usernamePassword(
                            credentialsId: env.SMTP_CREDENTIALS_ID,
                            usernameVariable: 'SMTP_USER',
                            passwordVariable: 'SMTP_PASSWORD'
                        )
                    ]) {
                        try {
                            sh '''
                            cat > alertmanager-config.yml <<'EOF'
global:
  smtp_from: '${SMTP_USER}'
  smtp_smarthost: 'smtp.gmail.com:587'
  smtp_auth_username: '${SMTP_USER}'
  smtp_auth_password: '${SMTP_PASSWORD}'
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
  - to: '${SMTP_USER}'
    send_resolved: true
EOF
                            '''
                            
                            sh """
                            # Correction du nom du StatefulSet
                            kubectl create secret generic alertmanager-${HELM_RELEASE_NAME}-alertmanager \
                                --from-file=alertmanager.yaml=alertmanager-config.yml \
                                --dry-run=client -o yaml | kubectl apply -n monitoring -f -
                            
                            # Correction du nom du StatefulSet
                            kubectl rollout restart statefulset/${HELM_RELEASE_NAME}-alertmanager -n monitoring
                            """
                        } catch (Exception e) {
                            echo "AlertManager configuration failed: ${e.getMessage()}"
                            currentBuild.result = 'UNSTABLE'
                        }
                    }
                }
            }
        }

        stage('Configure Alerts') {
            steps {
                script {
                    withCredentials([file(credentialsId: env.K3S_CONFIG_ID, variable: 'KUBECONFIG_FILE')]) {
                        try {
                            sh '''
                            cat > prometheus-rules.yaml <<'EOF'
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: basic-alerts
  namespace: monitoring
  labels:
    release: monitoring-stack  # Correction: valeur fixe au lieu de la variable
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
        summary: High memory usage on pod {{ $labels.pod }}
        description: Pod {{ $labels.pod }} in namespace {{ $labels.namespace }} is using {{ printf "%.2f" $value }}% of its memory limit.
    
    - alert: HighCPUUsage
      expr: sum(rate(container_cpu_usage_seconds_total{namespace!="",container!=""}[5m])) by (namespace,pod,container) / sum(container_spec_cpu_quota{namespace!="",container!=""}/container_spec_cpu_period{namespace!="",container!=""}) by (namespace,pod,container) > 0.8
      for: 5m
      labels:
        severity: warning
      annotations:
        summary: High CPU usage on pod {{ $labels.pod }}
        description: Pod {{ $labels.pod }} in namespace {{ $labels.namespace }} is using {{ printf "%.2f" $value }}% of its CPU limit.
EOF
                            '''
                            
                            sh """
                            kubectl apply -n monitoring -f prometheus-rules.yaml
                            rm -f prometheus-rules.yaml
                            echo "✅ Alert rules configured successfully"
                            """
                        } catch (Exception e) {
                            echo "⚠️ Alert configuration failed: ${e.getMessage()}"
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
                withCredentials([file(credentialsId: env.K3S_CONFIG_ID, variable: 'KUBECONFIG_FILE')]) {
                    sh """
                    echo "!!! Deployment failed - Initiating rollback !!!"
                    kubectl rollout undo deployment/bibliotheque-auth -n ${KUBE_NAMESPACE} || true
                    kubectl rollout status deployment/bibliotheque-auth -n ${KUBE_NAMESPACE} --timeout=120s || true
                    echo "Rollback to previous version completed"

                    echo "Cleaning up monitoring..."
                    helm uninstall ${HELM_RELEASE_NAME} -n monitoring || true
                    kubectl delete namespace monitoring --ignore-not-found=true || true
                    """
                }
            }
        }
        always {
            sh "docker logout ${REGISTRY} || true"
            echo "Pipeline execution completed"
            cleanWs()
        }
    }
}
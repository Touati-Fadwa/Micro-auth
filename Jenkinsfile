pipeline {
    agent any
    environment {
        IMAGE_NAME = "touatifadwa/bibliotheque-microauth"
        IMAGE_TAG = "latest"
        REGISTRY = "docker.io"
        KUBE_NAMESPACE = "bibliotheque"
        HELM_RELEASE_NAME = "monitoring-stack"
        ALERTMANAGER_PORT = "30903"
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
                    sh 'npm ci --ignore-scripts'
                    sh 'npm outdated || true'
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

        stage('Check Cluster Health') {
            steps {
                script {
                    withCredentials([file(credentialsId: env.K3S_CONFIG_ID, variable: 'KUBECONFIG_FILE')]) {
                        sh """
                        echo "=== Node Status ==="
                        kubectl get nodes
                        kubectl describe node k3s-worker-01 || true
                        """
                    }
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

        stage('Debug Pods') {
            steps {
                script {
                    withCredentials([file(credentialsId: env.K3S_CONFIG_ID, variable: 'KUBECONFIG_FILE')]) {
                        sh """
                        echo "=== Checking pod logs ==="
                        kubectl get pods -n ${KUBE_NAMESPACE} | grep bibliotheque-auth | awk '{print \$1}' | xargs -I {} kubectl logs {} -n ${KUBE_NAMESPACE} --previous || true
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

        stage('Setup Monitoring Stack') {
            steps {
                script {
                    withCredentials([file(credentialsId: env.K3S_CONFIG_ID, variable: 'KUBECONFIG_FILE')]) {
                        try {
                            sh """
                            kubectl create namespace monitoring --dry-run=client -o yaml | kubectl apply -f -

                            helm upgrade --install ${HELM_RELEASE_NAME} prometheus-community/kube-prometheus-stack \
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

                            echo "🔍 Monitoring Links:"
                            NODE_IP=\$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}')
                            echo "Prometheus: http://\${NODE_IP}:30900"
                            echo "Grafana: http://\${NODE_IP}:30300"
                            """
                        } catch (Exception e) {
                            echo "Monitoring setup failed: ${e.getMessage()}"
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
                        file(credentialsId: env.K3S_CONFIG_ID, variable: 'KUBECONFIG_FILE'),
                        usernamePassword(
                            credentialsId: env.SMTP_CREDENTIALS_ID,
                            usernameVariable: 'SMTP_USER',
                            passwordVariable: 'SMTP_PASSWORD'
                        )
                    ]) {
                        try {
                            sh '''
                            cat > alertmanager-config.yml <<EOF
global:
  smtp_from: '${SMTP_USER}'
  smtp_smarthost: 'smtp.gmail.com:587'
  smtp_auth_username: '${SMTP_USER}'
  smtp_auth_password: '${SMTP_PASSWORD}'
  smtp_require_tls: true

route:
  receiver: 'email-notifications'
  group_wait: 30s
  group_interval: 5m

receivers:
- name: 'email-notifications'
  email_configs:
  - to: '${SMTP_USER}'
    send_resolved: true
EOF
                            '''
                            
                            sh """
                            kubectl -n monitoring create secret generic alertmanager-config \
                                --from-file=alertmanager.yml=alertmanager-config.yml \
                                --dry-run=client -o yaml | kubectl apply -f -
                            
                            kubectl apply -n monitoring -f - <<EOF
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
        image: quay.io/prometheus/alertmanager:v0.27.0
        args:
        - '--config.file=/etc/alertmanager/alertmanager.yml'
        ports:
        - containerPort: 9093
        volumeMounts:
        - name: config
          mountPath: /etc/alertmanager
      volumes:
      - name: config
        secret:
          secretName: alertmanager-config
EOF

                            kubectl apply -n monitoring -f - <<EOF
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
    nodePort: ${ALERTMANAGER_PORT}
  selector:
    app: alertmanager
EOF

                            echo "🔔 AlertManager Access:"
                            NODE_IP=\$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}')
                            echo "AlertManager UI: http://\${NODE_IP}:${ALERTMANAGER_PORT}"
                            """
                        } catch (Exception e) {
                            echo "AlertManager deployment failed: ${e.getMessage()}"
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
  name: disk-usage-alert
  namespace: monitoring
spec:
  groups:
  - name: disk.rules
    rules:
  - alert: LowDiskSpace
    expr: 100 - (100 * node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"}) > 90
    for: 10m
    labels:
      severity: critical
    annotations:
      summary: "Disk space critically low (instance: {{ \$labels.instance }})"
      description: "Disk usage on {{ \$labels.instance }} is at {{ \$value }}%"
EOF
                            '''
                            
                            sh """
                            kubectl apply -n monitoring -f prometheus-rules.yaml
                            echo "✅ Disk usage alert configured successfully"
                            """
                        } catch (Exception e) {
                            echo "⚠️ Alert configuration failed: ${e.getMessage()}"
                            currentBuild.result = 'UNSTABLE'
                        } finally {
                            sh "rm -f prometheus-rules.yaml || true"
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
                    kubectl delete deployment alertmanager -n monitoring --ignore-not-found=true || true
                    kubectl delete service alertmanager -n monitoring --ignore-not-found=true || true
                    kubectl delete secret alertmanager-config -n monitoring --ignore-not-found=true || true
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
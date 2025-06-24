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
                    sh 'npm test'
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